const crypto = require('crypto');
const { get, run } = require('../database/db');

// In-memory token store or HMAC-signed tokens
const SECRET = process.env.SESSION_SECRET || 'finvora_session_secret_key_2026';

function signToken(payload) {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', SECRET).update(data).digest('base64url');
  return `${data}.${signature}`;
}

function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [data, signature] = parts;
  const expectedSignature = crypto.createHmac('sha256', SECRET).update(data).digest('base64url');
  if (crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
    try {
      const payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
      if (payload.exp && Date.now() > payload.exp) return null;
      return payload;
    } catch {
      return null;
    }
  }
  return null;
}

// Global context middleware
async function sessionContext(req, res, next) {
  const token = req.cookies?.finvora_token;
  res.locals.user = null;
  res.locals.appName = process.env.APP_NAME || 'FINVORA';
  res.locals.currentPath = req.path;

  if (token) {
    const payload = verifyToken(token);
    if (payload && payload.userId) {
      try {
        const { getDb } = require('../database/mongo');
        const db = getDb();
        const user = await db.collection('users').findOne({
          $or: [{ id: payload.userId }, { sqlite_id: payload.userId }]
        });
        if (user && user.status === 'ACTIVE') {
          user.id = user.id !== undefined ? user.id : user.sqlite_id;
          req.user = user;
          res.locals.user = user;
        }
      } catch (_) {}
    }
  }

  // Security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');

  next();
}

// User authentication required
function requireAuth(req, res, next) {
  if (!req.user) {
    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    return res.redirect(`/login?redirect=${encodeURIComponent(req.originalUrl)}`);
  }
  next();
}

// Admin authentication required
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'ADMIN') {
    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.status(403).json({ success: false, message: 'Administrator access required' });
    }
    return res.redirect('/SLXadmin/login');
  }
  next();
}

// Simple CSRF generator & validator
function csrfProtection(req, res, next) {
  let csrfToken = req.cookies?.finvora_csrf;
  if (!csrfToken) {
    csrfToken = crypto.randomBytes(24).toString('hex');
    res.cookie('finvora_csrf', csrfToken, { httpOnly: false, sameSite: 'lax' });
  }
  res.locals.csrfToken = csrfToken;

  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
    const submittedToken = req.body?._csrf || req.headers['x-csrf-token'];
    // For API requests with Authorization header or form submissions, validate token
    if (submittedToken && submittedToken !== csrfToken) {
      return res.status(403).send('CSRF validation failed');
    }
  }
  next();
}

module.exports = {
  signToken,
  verifyToken,
  sessionContext,
  requireAuth,
  requireAdmin,
  csrfProtection
};
