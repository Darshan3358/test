const { getDb } = require('../database/mongo');
const WalletService = require('../services/WalletService');
const InvestmentService = require('../services/InvestmentService');
const GenealogyService = require('../services/GenealogyService');
const LevelUnlockService = require('../services/LevelUnlockService');
const SalaryService = require('../services/SalaryService');
const RoiService = require('../services/RoiService');

class ApiController {
  static async getProfile(req, res) {
    try {
      const user = req.user;
      const wallet = await WalletService.getWallet(user.id);
      const invSummary = await InvestmentService.getInvestmentSummary(user.id);

      res.json({
        success: true,
        message: 'Profile retrieved',
        data: {
          user,
          wallet,
          investments: invSummary
        }
      });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  static async getWalletData(req, res) {
    try {
      const wallet = await WalletService.getWallet(req.user.id);
      res.json({
        success: true,
        data: wallet
      });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  static async getTree(req, res) {
    try {
      const userId = parseInt(req.query.userId || req.user.id, 10);
      const tree = await GenealogyService.getVisualTree(userId, 3);
      res.json({
        success: true,
        data: tree
      });
    } catch (err) {
      console.error('[ApiController.getTree Error]:', err);
      res.status(500).json({
        success: false,
        message: err.message
      });
    }
  }

  static async getChartData(req, res) {
    try {
      const userId = Number(req.user.id);
      const db = getDb();

      // Last 7 days ROI from daily_roi_ledger
      let roiHistory = { dates: [], amounts: [] };
      if (db) {
        const roiRows = await db.collection('daily_roi_ledger')
          .find({ user_id: userId })
          .sort({ roi_date: -1 })
          .limit(7)
          .toArray();

        roiRows.reverse();
        roiHistory = {
          dates: roiRows.map(r => r.roi_date),
          amounts: roiRows.map(r => Number(Number(r.net_amount || 0).toFixed(2)))
        };
      }

      // Income breakdown: ROI, Referral, Level, Salary
      const wallet = await WalletService.getWallet(userId);
      const incomeBreakdown = {
        labels: ['Daily ROI', 'Direct Referral', 'Level Income', 'Salary Income'],
        values: [
          Number((wallet.roi_balance || 0).toFixed(2)),
          Number((wallet.referral_balance || 0).toFixed(2)),
          Number((wallet.level_balance || 0).toFixed(2)),
          Number((wallet.salary_balance || 0).toFixed(2))
        ]
      };

      res.json({
        success: true,
        data: {
          roiHistory,
          incomeBreakdown
        }
      });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  /**
   * Universal Endpoint for Daily ROI Cron (Supports Vercel Cron GET, Webhook POST, Bearer header, or URL key)
   */
  static async runDailyRoi(req, res) {
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
      const result = await RoiService.processDailyRoi(targetDate);
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
  static async runWeeklySalary(req, res) {
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
      const result = await SalaryService.processWeeklySalary();
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
  static async getCronStatus(req, res) {
    try {
      const db = getDb();
      let logs = [];
      if (db) {
        logs = await db.collection('cron_execution_logs').find().sort({ id: -1, _id: -1 }).limit(15).toArray();
      }
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
  static async syncWalletAddress(req, res) {
    const userId = Number(req.user.id);
    const { walletAddress } = req.body;

    if (!walletAddress || typeof walletAddress !== 'string' || !/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
      return res.status(400).json({ success: false, message: 'Invalid BEP-20 / EVM wallet address format.' });
    }

    try {
      const db = getDb();
      if (db) {
        await db.collection('user_profiles').updateOne(
          { user_id: userId },
          {
            $set: {
              user_id: userId,
              wallet_address: walletAddress,
              updated_at: new Date()
            }
          },
          { upsert: true }
        );
      }

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
      const mongoDb = await connectMongo();
      result.mongoConnected = true;

      for (const table of ['users', 'wallets', 'deposits', 'withdrawals', 'investments', 'admin_wallets']) {
        try {
          const mCount = await mongoDb.collection(table).countDocuments();
          result.collections[table] = {
            mongoCount: mCount,
            sqliteCount: 0,
            inSync: true
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
      return res.status(200).json({ success: false, data: result });
    }
  }

  /**
   * Sync all SQLite tables to MongoDB Atlas
   */
  static async syncAllToMongo(req, res) {
    return res.json({ success: true, message: 'SQLite has been removed. Running on 100% pure MongoDB Atlas.' });
  }
}

module.exports = ApiController;
