const { query, get, run } = require('../database/db');
const WalletService = require('../services/WalletService');
const InvestmentService = require('../services/InvestmentService');
const GenealogyService = require('../services/GenealogyService');
const LevelUnlockService = require('../services/LevelUnlockService');
const SalaryService = require('../services/SalaryService');
const RoiService = require('../services/RoiService');

class ApiController {
  static getProfile(req, res) {
    const user = req.user;
    const wallet = WalletService.getWallet(user.id);
    const invSummary = InvestmentService.getInvestmentSummary(user.id);

    res.json({
      success: true,
      message: 'Profile retrieved',
      data: {
        user,
        wallet,
        investments: invSummary
      }
    });
  }

  static getWalletData(req, res) {
    const wallet = WalletService.getWallet(req.user.id);
    res.json({
      success: true,
      data: wallet
    });
  }

  static getTree(req, res) {
    const userId = parseInt(req.query.userId || req.user.id, 10);
    const tree = GenealogyService.getVisualTree(userId, 3);
    res.json({
      success: true,
      data: tree
    });
  }

  static getChartData(req, res) {
    const userId = req.user.id;

    // Last 7 days ROI
    const roiRows = query(`
      SELECT roi_date, SUM(net_amount) as total_roi
      FROM daily_roi_ledger
      WHERE user_id = ?
      GROUP BY roi_date
      ORDER BY roi_date DESC
      LIMIT 7
    `, [userId]).reverse();

    // Income breakdown: ROI, Referral, Level, Salary
    const wallet = WalletService.getWallet(userId);
    const incomeBreakdown = {
      labels: ['Daily ROI', 'Direct Referral', 'Level Income', 'Salary Income'],
      values: [
        Number(wallet.roi_balance.toFixed(2)),
        Number(wallet.referral_balance.toFixed(2)),
        Number(wallet.level_balance.toFixed(2)),
        Number(wallet.salary_balance.toFixed(2))
      ]
    };

    res.json({
      success: true,
      data: {
        roiHistory: {
          dates: roiRows.map(r => r.roi_date),
          amounts: roiRows.map(r => Number(r.total_roi.toFixed(2)))
        },
        incomeBreakdown
      }
    });
  }

  /**
   * Universal Endpoint for Daily ROI Cron (Supports Vercel Cron GET, Webhook POST, Bearer header, or URL key)
   */
  static runDailyRoi(req, res) {
    const authHeader = req.headers['authorization'] || '';
    const secretHeader = req.headers['x-cron-secret'] || '';
    const querySecret = req.query?.secret || req.query?.key || '';
    const expectedSecret = process.env.CRON_SECRET || 'finvora_cron_secret_key_2026';

    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (token !== expectedSecret && secretHeader !== expectedSecret && querySecret !== expectedSecret) {
      return res.status(401).json({ 
        success: false, 
        message: 'Unauthorized: Invalid cron secret. Provide Bearer token, x-cron-secret header, or ?key= query parameter.' 
      });
    }

    try {
      const targetDate = req.query?.targetDate || req.body?.targetDate || null;
      const result = RoiService.processDailyRoi(targetDate);
      return res.json({
        success: true,
        message: 'Daily ROI processed successfully',
        platform: process.env.VERCEL ? 'vercel-serverless' : 'node-persistent',
        data: result
      });
    } catch (err) {
      console.error('[API Cron ROI Error]', err);
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  /**
   * Universal Endpoint for Weekly Salary Cron (Supports Vercel Cron GET, Webhook POST, Bearer header, or URL key)
   */
  static runWeeklySalary(req, res) {
    const authHeader = req.headers['authorization'] || '';
    const secretHeader = req.headers['x-cron-secret'] || '';
    const querySecret = req.query?.secret || req.query?.key || '';
    const expectedSecret = process.env.CRON_SECRET || 'finvora_cron_secret_key_2026';

    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (token !== expectedSecret && secretHeader !== expectedSecret && querySecret !== expectedSecret) {
      return res.status(401).json({ 
        success: false, 
        message: 'Unauthorized: Invalid cron secret. Provide Bearer token, x-cron-secret header, or ?key= query parameter.' 
      });
    }

    try {
      const result = SalaryService.processWeeklySalary();
      return res.json({
        success: true,
        message: 'Weekly salary processed successfully',
        platform: process.env.VERCEL ? 'vercel-serverless' : 'node-persistent',
        data: result
      });
    } catch (err) {
      console.error('[API Cron Salary Error]', err);
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  /**
   * View Cron status, recent execution history, and scheduling mode
   */
  static getCronStatus(req, res) {
    try {
      const logs = query('SELECT * FROM cron_execution_logs ORDER BY id DESC LIMIT 15');
      return res.json({
        success: true,
        platform: process.env.VERCEL ? 'vercel-serverless' : 'node-persistent',
        scheduler: process.env.VERCEL ? 'vercel-cron (vercel.json)' : 'internal-self-scheduler',
        serverTimeUtc: new Date().toISOString(),
        recentExecutions: logs
      });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  /**
   * Sync connected Web3 wallet address with user profile
   */
  static syncWalletAddress(req, res) {
    const userId = req.user.id;
    const { walletAddress } = req.body;

    if (!walletAddress || typeof walletAddress !== 'string' || !/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
      return res.status(400).json({ success: false, message: 'Invalid BEP-20 / EVM wallet address format.' });
    }

    try {
      run(`
        INSERT INTO user_profiles (user_id, wallet_address)
        VALUES (?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
          wallet_address = excluded.wallet_address,
          updated_at = CURRENT_TIMESTAMP
      `, [userId, walletAddress]);

      return res.json({
        success: true,
        message: 'Web3 Wallet linked to account successfully.',
        walletAddress
      });
    } catch (err) {
      console.error('[API Sync Wallet Error]', err);
      return res.status(500).json({ success: false, message: 'Failed to sync wallet address.' });
    }
  }

  /**
   * Get MongoDB connection health, document counts, and comparison with SQLite
   */
  static async getMongoStatus(req, res) {
    const { connectMongo } = require('../database/mongo');
    const { get, query } = require('../database/db');

    const result = {
      timestamp: new Date().toISOString(),
      platform: process.env.VERCEL ? 'vercel-serverless' : 'node-persistent',
      mongoConfigured: Boolean(process.env.MONGODB_URI),
      mongoConnected: false,
      error: null,
      collections: {},
      latestUsersSqlite: [],
      latestUsersMongo: []
    };

    try {
      const sqliteCount = get("SELECT COUNT(*) as count FROM users")?.count || 0;
      result.sqliteUsersTotal = sqliteCount;
      result.latestUsersSqlite = query("SELECT id, user_code, full_name, username, email, created_at FROM users ORDER BY id DESC LIMIT 5");

      const mongoDb = await connectMongo();
      result.mongoConnected = true;

      for (const table of ['users', 'wallets', 'deposits', 'withdrawals', 'investments', 'admin_wallets']) {
        try {
          const mCount = await mongoDb.collection(table).countDocuments();
          const sCount = get(`SELECT COUNT(*) as count FROM "${table}"`)?.count || 0;
          result.collections[table] = {
            mongoCount: mCount,
            sqliteCount: sCount,
            inSync: mCount === sCount
          };
        } catch (colErr) {
          result.collections[table] = { error: colErr.message };
        }
      }

      result.latestUsersMongo = await mongoDb.collection('users')
        .find({})
        .sort({ _id: -1 })
        .limit(5)
        .project({ user_code: 1, full_name: 1, username: 1, email: 1, created_at: 1 })
        .toArray();

      return res.json({ success: true, data: result });
    } catch (err) {
      result.error = err.message;
      result.errorCode = err.code || null;
      if (err.message && (err.message.includes('SSL alert number 80') || err.message.includes('tlsv1 alert internal error'))) {
        result.diagnosis = 'MongoDB Atlas IP Whitelist restriction: Incoming connection IP is not allowed in Atlas Network Access. Add 0.0.0.0/0 in MongoDB Atlas Security -> Network Access.';
      }
      return res.status(200).json({ success: false, data: result });
    }
  }

  /**
   * Sync all SQLite tables to MongoDB Atlas
   */
  static async syncAllToMongo(req, res) {
    try {
      const { syncAllTablesToMongo } = require('../database/mongo_sync');
      const syncResult = await syncAllTablesToMongo();
      return res.json({ success: true, data: syncResult });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }
}

module.exports = ApiController;
