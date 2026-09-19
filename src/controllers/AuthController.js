const bcrypt = require('bcryptjs');
const { getDb, getNextSequence } = require('../database/mongo');
const { signToken } = require('../middleware/auth');
const WalletService = require('../services/WalletService');
const LevelUnlockService = require('../services/LevelUnlockService');
const AuditService = require('../services/AuditService');

class AuthController {
  /**
   * Render User Login Page
   */
  static showLogin(req, res) {
    const redirect = req.query.redirect || '';
    if (req.user) {
      if (redirect && redirect.startsWith('/')) {
        return res.redirect(redirect);
      }
      return res.redirect(req.user.role === 'ADMIN' ? '/SLXadmin/dashboard' : '/dashboard');
    }
    res.render('login', {
      title: 'Sign In — FINVORA',
      error: req.query.error,
      success: req.query.success,
      redirect: redirect
    });
  }

  /**
   * Process Login (Pure MongoDB Atlas)
   */
  static async login(req, res) {
    const { login, password, redirect } = req.body;

    if (!login || !password) {
      return res.render('login', {
        title: 'Sign In — FINVORA',
        error: 'Please enter your username/email and password.',
        redirect
      });
    }

    const cleanLogin = login.trim();
    const db = getDb();
    
    // Find user by username, email, or user_code in MongoDB Atlas
    const user = await db.collection('users').findOne({
      $or: [
        { username: new RegExp(`^${cleanLogin}$`, 'i') },
        { email: new RegExp(`^${cleanLogin}$`, 'i') },
        { user_code: new RegExp(`^${cleanLogin}$`, 'i') }
      ],
      status: { $ne: 'DELETED' }
    });

    const isAdminRoute = Boolean(req.originalUrl?.includes('SLXadmin') || req.path?.includes('SLXadmin'));

    if (!user) {
      if (isAdminRoute) {
        return res.render('admin/login', {
          title: 'Admin Access — FINVORA',
          error: 'Invalid username or password.'
        });
      }
      return res.render('login', {
        title: 'Sign In — FINVORA',
        error: 'Invalid username or password.',
        redirect
      });
    }

    const userId = user.id !== undefined ? user.id : user.sqlite_id;

    if (user.status === 'SUSPENDED') {
      const errMsg = 'Your account has been suspended. Please contact support.';
      if (isAdminRoute) {
        return res.render('admin/login', { title: 'Admin Access — FINVORA', error: errMsg });
      }
      return res.render('login', {
        title: 'Sign In — FINVORA',
        error: errMsg,
        redirect
      });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      AuditService.log({
        actorId: userId,
        actorName: user.username,
        actorRole: user.role,
        action: 'FAILED_LOGIN_ATTEMPT',
        ipAddress: req.ip
      });
      if (isAdminRoute) {
        return res.render('admin/login', {
          title: 'Admin Access — FINVORA',
          error: 'Invalid username or password.'
        });
      }
      return res.render('login', {
        title: 'Sign In — FINVORA',
        error: 'Invalid username or password.',
        redirect
      });
    }

    // Set secure cookie
    const token = signToken({
      userId: userId,
      role: user.role,
      exp: Date.now() + (7 * 24 * 60 * 60 * 1000) // 7 days
    });

    res.cookie('finvora_token', token, {
      httpOnly: true,
      secure: Boolean(req.secure || req.headers['x-forwarded-proto'] === 'https'),
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    // Update last login in user_security
    try {
      await db.collection('user_security').updateOne(
        { user_id: userId },
        {
          $set: {
            user_id: userId,
            last_login_at: new Date(),
            last_login_ip: req.ip,
            updated_at: new Date()
          }
        },
        { upsert: true }
      );
    } catch (_) {}

    AuditService.log({
      actorId: userId,
      actorName: user.username,
      actorRole: user.role,
      action: 'USER_LOGIN',
      ipAddress: req.ip
    });

    if (redirect && redirect.startsWith('/')) {
      return res.redirect(redirect);
    }
    return res.redirect(user.role === 'ADMIN' ? '/SLXadmin/dashboard' : '/dashboard');
  }

  /**
   * Render Register Page (supports ?ref=USERNAME)
   */
  static async showRegister(req, res) {
    if (req.user) {
      return res.redirect('/dashboard');
    }

    const sponsorRef = req.query.ref ? req.query.ref.trim() : '';
    let sponsorName = '';

    if (sponsorRef) {
      try {
        const db = getDb();
        let sp = null;
        if (sponsorRef.startsWith('0x')) {
          const prof = await db.collection('user_profiles').findOne({
            wallet_address: new RegExp(`^${sponsorRef}$`, 'i')
          });
          if (prof) {
            sp = await db.collection('users').findOne({
              $or: [{ id: prof.user_id }, { sqlite_id: prof.user_id }]
            });
            if (sp) sp.wallet_address = prof.wallet_address;
          }
        }
        if (!sp) {
          sp = await db.collection('users').findOne({
            $or: [
              { user_code: new RegExp(`^${sponsorRef}$`, 'i') },
              { username: new RegExp(`^${sponsorRef}$`, 'i') }
            ]
          });
        }
        if (sp) {
          const shortAddr = sp.wallet_address ? `${sp.wallet_address.slice(0, 6)}...${sp.wallet_address.slice(-4)}` : sp.user_code;
          sponsorName = `${sp.full_name} (${shortAddr})`;
        }
      } catch (_) {}
    }

    res.render('register', {
      title: 'Create Account — FINVORA',
      sponsorRef,
      sponsorName,
      error: req.query.error
    });
  }

  /**
   * Process Registration (Pure MongoDB Atlas)
   */
  static async register(req, res) {
    const {
      fullName,
      email,
      mobile,
      password,
      confirmPassword,
      sponsor,
      terms
    } = req.body;

    const sponsorRef = sponsor ? sponsor.trim() : '';

    if (!terms) {
      return res.render('register', {
        title: 'Create Account — FINVORA',
        error: 'You must agree to the Terms of Service and Privacy Policy.',
        sponsorRef
      });
    }

    if (!fullName || !email || !password) {
      return res.render('register', {
        title: 'Create Account — FINVORA',
        error: 'Please fill in all required fields (Full Name, Email, Password).',
        sponsorRef
      });
    }

    if (!sponsorRef) {
      return res.render('register', {
        title: 'Create Account — FINVORA',
        error: 'Sponsor / Referral ID is required to register.',
        sponsorRef
      });
    }

    if (password !== confirmPassword) {
      return res.render('register', {
        title: 'Create Account — FINVORA',
        error: 'Passwords do not match.',
        sponsorRef
      });
    }

    if (password.length < 6) {
      return res.render('register', {
        title: 'Create Account — FINVORA',
        error: 'Password must be at least 6 characters.',
        sponsorRef
      });
    }

    const cleanEmail = email ? email.trim().toLowerCase() : '';
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!cleanEmail || !emailRegex.test(cleanEmail)) {
      return res.render('register', {
        title: 'Create Account — FINVORA',
        error: 'Please enter a valid email address.',
        sponsorRef
      });
    }

    const db = getDb();

    // Check unique email in MongoDB Atlas
    const existing = await db.collection('users').findOne({ email: cleanEmail });
    if (existing) {
      return res.render('register', {
        title: 'Create Account — FINVORA',
        error: 'This email address is already registered.',
        sponsorRef
      });
    }

    // Validate sponsor
    let sponsorId = null;
    let sp = null;
    if (sponsorRef.startsWith('0x')) {
      const prof = await db.collection('user_profiles').findOne({
        wallet_address: new RegExp(`^${sponsorRef}$`, 'i')
      });
      if (prof) {
        sp = await db.collection('users').findOne({
          $or: [{ id: prof.user_id }, { sqlite_id: prof.user_id }]
        });
      }
    }
    if (!sp) {
      sp = await db.collection('users').findOne({
        $or: [
          { user_code: new RegExp(`^${sponsorRef}$`, 'i') },
          { username: new RegExp(`^${sponsorRef}$`, 'i') }
        ]
      });
    }

    if (!sp) {
      return res.render('register', {
        title: 'Create Account — FINVORA',
        error: `Sponsor '${sponsorRef}' not found. Please verify your referral link.`,
        sponsorRef
      });
    }
    if (sp.status !== 'ACTIVE') {
      return res.render('register', {
        title: 'Create Account — FINVORA',
        error: 'Specified sponsor account is inactive.',
        sponsorRef
      });
    }
    sponsorId = sp.id !== undefined ? sp.id : sp.sqlite_id;

    // Generate sequential user code matching FIN10001, etc.
    const lastUsers = await db.collection('users').find({ user_code: /^FIN\d+$/ }).sort({ id: -1, sqlite_id: -1 }).limit(1).toArray();
    let nextNum = 10001;
    if (lastUsers.length > 0 && lastUsers[0].user_code) {
      const match = lastUsers[0].user_code.match(/^FIN(\d+)$/);
      if (match) {
        nextNum = parseInt(match[1], 10) + 1;
      }
    }
    let userCode = `FIN${nextNum}`;
    while (await db.collection('users').findOne({ user_code: userCode })) {
      nextNum++;
      userCode = `FIN${nextNum}`;
    }

    const cleanUsername = userCode.toLowerCase();
    const passwordHash = await bcrypt.hash(password, 10);
    const type = 'ACTIVE';

    try {
      const newId = await getNextSequence('users');
      const newUserDoc = {
        id: newId,
        sqlite_id: newId,
        user_code: userCode,
        full_name: fullName.trim(),
        username: cleanUsername,
        email: cleanEmail,
        mobile: mobile ? mobile.trim() : null,
        password_hash: passwordHash,
        sponsor_id: sponsorId,
        user_type: type,
        role: 'USER',
        status: 'ACTIVE',
        country: null,
        created_at: new Date(),
        updated_at: new Date()
      };

      await db.collection('users').insertOne(newUserDoc);

      // Initialize wallet
      await WalletService.ensureWallet(newId);

      // Initialize profile & security
      await db.collection('user_profiles').insertOne({
        user_id: newId,
        wallet_address: null,
        created_at: new Date(),
        updated_at: new Date()
      });

      await db.collection('user_security').insertOne({
        user_id: newId,
        two_factor_enabled: 0,
        failed_login_attempts: 0,
        created_at: new Date(),
        updated_at: new Date()
      });

      // Recalculate level unlocks
      try {
        await LevelUnlockService.recalculate(newId);
        if (sponsorId) {
          await LevelUnlockService.recalculate(sponsorId);
        }
      } catch (_) {}

      AuditService.log({
        actorId: newId,
        actorName: cleanUsername,
        actorRole: 'USER',
        action: 'USER_REGISTERED',
        details: { sponsorId, userType: type },
        ipAddress: req.ip
      });

      // Automatically log in
      const token = signToken({
        userId: newId,
        role: 'USER',
        exp: Date.now() + (7 * 24 * 60 * 60 * 1000)
      });

      res.cookie('finvora_token', token, {
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000
      });

      return res.redirect('/dashboard');
    } catch (err) {
      console.error('[Registration Error]', err);
      return res.render('register', {
        title: 'Create Account — FINVORA',
        error: 'Registration failed due to a system error. Please try again.',
        sponsorRef
      });
    }
  }

  /**
   * Process Logout
   */
  static logout(req, res) {
    if (req.user) {
      AuditService.log({
        actorId: req.user.id,
        actorName: req.user.username,
        actorRole: req.user.role,
        action: 'USER_LOGOUT',
        ipAddress: req.ip
      });
    }
    res.clearCookie('finvora_token');
    res.redirect('/login');
  }

  /**
   * Render Admin Login Page
   */
  static showAdminLogin(req, res) {
    if (req.user && req.user.role === 'ADMIN') {
      return res.redirect('/SLXadmin/dashboard');
    }
    res.render('admin/login', {
      title: 'Admin Command Access — FINVORA',
      error: req.query.error
    });
  }
}

module.exports = AuthController;
