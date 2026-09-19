/**
 * FINVORA — Blockchain API Controller
 * 
 * Provides authenticated RESTful JSON endpoints for:
 * - User Web3 wallet nonce, cryptographic verification & connection
 * - Live BSC USDT deposit submission & verification
 * - User withdrawal requests (strictly locked to verified wallet)
 * - Admin single active wallet management with signature verification
 * - Admin withdrawal approval, server-signed disbursement & rejection
 */

const UserWalletService = require('../services/UserWalletService');
const AdminWalletService = require('../services/AdminWalletService');
const DepositService = require('../services/DepositService');
const WithdrawalService = require('../services/WithdrawalService');
const BlockchainService = require('../services/BlockchainService');
const BLOCKCHAIN_CONFIG = require('../config/blockchain');
const { get } = require('../database/db');

class BlockchainApiController {
  // ==================================================
  // USER WALLET ENDPOINTS
  // ==================================================

  /**
   * GET /api/v1/wallet/nonce
   * Generate cryptographic verification nonce for authenticated user
   */
  static async getUserNonce(req, res) {
    try {
      const nonceData = UserWalletService.generateNonce(req.user.id);
      return res.json({ success: true, data: nonceData });
    } catch (err) {
      console.error('[BlockchainApiController] getUserNonce error:', err.message);
      return res.status(400).json({ success: false, error: err.message });
    }
  }

  /**
   * POST /api/v1/wallet/verify-connect
   * Verify personal_sign signature and activate user's verified wallet
   */
  static async verifyAndConnectUserWallet(req, res) {
    try {
      const { walletAddress, signature, chainId } = req.body;

      if (!walletAddress || !signature) {
        return res.status(400).json({
          success: false,
          error: 'walletAddress and signature are required.'
        });
      }

      const result = UserWalletService.verifyAndConnectWallet({
        userId: req.user.id,
        walletAddress,
        signature,
        chainId: chainId || 56
      });

      return res.json({ success: true, data: result });
    } catch (err) {
      console.error('[BlockchainApiController] verifyAndConnectUserWallet error:', err.message);
      return res.status(400).json({ success: false, error: err.message });
    }
  }

  /**
   * POST /api/v1/wallet/disconnect
   * Disconnect user's active wallet
   */
  static async disconnectUserWallet(req, res) {
    try {
      const result = UserWalletService.disconnectWallet(req.user.id);
      return res.json(result);
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  /**
   * GET /api/v1/wallet/status
   * Get user wallet status, on-chain balances, internal balances & active admin deposit address
   */
  static async getUserWalletStatus(req, res) {
    try {
      const status = await UserWalletService.getUserWalletStatus(req.user.id);
      const activeAdminWallet = AdminWalletService.getActiveAdminWallet();

      return res.json({
        success: true,
        data: {
          ...status,
          activeAdminWallet
        }
      });
    } catch (err) {
      console.error('[BlockchainApiController] getUserWalletStatus error:', err.message);
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  // ==================================================
  // USER DEPOSIT ENDPOINTS
  // ==================================================

  /**
   * POST /api/v1/deposit/submit
   * User submits transaction hash immediately upon wallet confirmation
   */
  static async submitDeposit(req, res) {
    try {
      const { txHash, amount } = req.body;

      if (!txHash) {
        return res.status(400).json({
          success: false,
          error: 'Please provide the transaction hash (txHash).'
        });
      }

      const result = DepositService.submitDeposit({
        userId: req.user.id,
        txHash,
        amount: parseFloat(amount) || 0
      });

      return res.json({ success: true, data: result });
    } catch (err) {
      console.error('[BlockchainApiController] submitDeposit error:', err.message);
      return res.status(400).json({ success: false, error: err.message });
    }
  }

  /**
   * POST /api/v1/deposit/verify
   * Backend verifies BSC transaction on-chain and credits user ledger atomically
   */
  static async verifyDepositTx(req, res) {
    try {
      const { txHash, depositId } = req.body;

      if (!txHash) {
        return res.status(400).json({
          success: false,
          error: 'Please provide the transaction hash (txHash).'
        });
      }

      const result = await DepositService.verifyAndCreditDeposit({
        depositId: depositId ? parseInt(depositId, 10) : null,
        txHash,
        userId: req.user.id
      });

      return res.json({ success: true, data: result });
    } catch (err) {
      console.error('[BlockchainApiController] verifyDepositTx error:', err.message);
      return res.status(400).json({ success: false, error: err.message });
    }
  }

  /**
   * GET /api/v1/deposit/status/:id
   * Fetch deposit status
   */
  static async getDepositStatus(req, res) {
    try {
      const id = parseInt(req.params.id, 10);
      const dep = get('SELECT * FROM deposits WHERE id = ?', [id]);

      if (!dep) {
        return res.status(404).json({ success: false, error: 'Deposit not found' });
      }

      if (req.user.role !== 'ADMIN' && dep.user_id !== req.user.id) {
        return res.status(403).json({ success: false, error: 'Access denied' });
      }

      return res.json({
        success: true,
        data: {
          ...dep,
          explorerUrl: dep.transaction_reference ? BLOCKCHAIN_CONFIG.getTxExplorerUrl(dep.transaction_reference) : null
        }
      });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  // ==================================================
  // USER & ADMIN WITHDRAWAL ENDPOINTS
  // ==================================================

  /**
   * POST /api/v1/withdraw/create
   * User requests withdrawal (destination strictly locked to verified connected wallet)
   */
  static async createWithdrawal(req, res) {
    try {
      const { amount, profitSource } = req.body;
      const parsedAmount = parseFloat(amount);

      if (!parsedAmount || isNaN(parsedAmount) || parsedAmount <= 0) {
        return res.status(400).json({
          success: false,
          error: 'Please specify a valid positive withdrawal amount in USDT.'
        });
      }

      const selectedWallet = profitSource && ['ROI', 'REFERRAL', 'LEVEL', 'SALARY', 'PROFIT'].includes(profitSource.toUpperCase())
        ? profitSource.toUpperCase()
        : 'PROFIT';

      const result = WithdrawalService.requestWithdrawal({
        userId: req.user.id,
        amount: parsedAmount,
        walletType: selectedWallet
      });

      return res.json({ success: true, data: result });
    } catch (err) {
      console.error('[BlockchainApiController] createWithdrawal error:', err.message);
      return res.status(400).json({ success: false, error: err.message });
    }
  }

  /**
   * GET /api/v1/withdraw/status/:id
   * Get withdrawal status
   */
  static async getWithdrawalStatus(req, res) {
    try {
      const id = parseInt(req.params.id, 10);
      const wd = get(`
        SELECT w.*, bw.status as blockchain_status, bw.tx_hash as bc_tx_hash, bw.block_number
        FROM withdrawals w
        LEFT JOIN blockchain_withdrawals bw ON bw.withdrawal_id = w.id
        WHERE w.id = ?
      `, [id]);

      if (!wd) {
        return res.status(404).json({ success: false, error: 'Withdrawal not found' });
      }

      if (req.user.role !== 'ADMIN' && wd.user_id !== req.user.id) {
        return res.status(403).json({ success: false, error: 'Access denied' });
      }

      return res.json({
        success: true,
        data: {
          ...wd,
          explorerUrl: wd.tx_hash ? BLOCKCHAIN_CONFIG.getTxExplorerUrl(wd.tx_hash) : null
        }
      });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  // ==================================================
  // ADMIN WALLET & WITHDRAWAL MANAGEMENT ENDPOINTS
  // ==================================================

  /**
   * GET /api/v1/admin/wallet/nonce
   * Generate admin verification nonce
   */
  static async getAdminNonce(req, res) {
    try {
      const nonceData = AdminWalletService.generateAdminNonce(req.user.id);
      return res.json({ success: true, data: nonceData });
    } catch (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
  }

  /**
   * POST /api/v1/admin/wallet/verify-connect
   * Admin verifies signature and sets single active admin wallet
   */
  static async verifyAndConnectAdminWallet(req, res) {
    try {
      const { walletAddress, signature } = req.body;
      const result = AdminWalletService.verifyAndSetActiveWallet({
        adminId: req.user.id,
        adminName: req.user.username,
        walletAddress,
        signature,
        ipAddress: req.ip
      });
      return res.json({ success: true, data: result });
    } catch (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
  }

  /**
   * POST /api/v1/admin/wallet/disconnect
   * Admin disconnects active wallet
   */
  static async disconnectAdminWallet(req, res) {
    try {
      const result = AdminWalletService.disconnectActiveWallet({
        adminId: req.user.id,
        adminName: req.user.username,
        ipAddress: req.ip
      });
      return res.json(result);
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  /**
   * GET /api/v1/admin/wallet/status
   * Get single active admin wallet details and live on-chain balances
   */
  static async getAdminWalletStatus(req, res) {
    try {
      const status = await AdminWalletService.getAdminWalletStatus();
      return res.json({ success: true, data: status });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  /**
   * POST /api/v1/admin/withdrawals/:id/approve-send
   * Admin approves withdrawal and executes server-signed BEP-20 transfer
   */
  static async approveAndSendWithdrawal(req, res) {
    try {
      const withdrawalId = parseInt(req.params.id, 10);
      const result = await WithdrawalService.approveAndSendWithdrawal({
        withdrawalId,
        adminId: req.user.id,
        adminName: req.user.username,
        ipAddress: req.ip
      });
      return res.json({ success: true, data: result });
    } catch (err) {
      console.error('[BlockchainApiController] approveAndSendWithdrawal error:', err.message);
      return res.status(400).json({ success: false, error: err.message });
    }
  }

  /**
   * POST /api/v1/admin/withdrawals/:id/reject
   * Admin rejects withdrawal and refunds user's reserved balance
   */
  static async rejectWithdrawal(req, res) {
    try {
      const withdrawalId = parseInt(req.params.id, 10);
      const { note } = req.body;
      const result = WithdrawalService.rejectWithdrawal(
        withdrawalId,
        note || 'Rejected by Administrator',
        req.user.id,
        req.user.username
      );
      return res.json({ success: true, data: result });
    } catch (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
  }

  /**
   * GET /api/v1/admin/blockchain/deposits
   */
  static async getAdminDeposits(req, res) {
    try {
      const status = req.query.status || null;
      const limit = parseInt(req.query.limit || '50', 10);
      const offset = parseInt(req.query.offset || '0', 10);
      const deposits = DepositService.getAllDeposits({ status, limit, offset });
      return res.json({ success: true, data: deposits });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  /**
   * GET /api/v1/admin/blockchain/withdrawals
   */
  static async getAdminWithdrawals(req, res) {
    try {
      const limit = parseInt(req.query.limit || '50', 10);
      const offset = parseInt(req.query.offset || '0', 10);
      const withdrawals = WithdrawalService.getAdminBlockchainWithdrawals({ limit, offset });
      return res.json({ success: true, data: withdrawals });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  /**
   * Backward compatibility alias
   */
  static async verifyDeposit(req, res) {
    return BlockchainApiController.verifyDepositTx(req, res);
  }

  /**
   * Backward compatibility alias
   */
  static async approveWithdrawal(req, res) {
    return BlockchainApiController.approveAndSendWithdrawal(req, res);
  }
}

module.exports = BlockchainApiController;
