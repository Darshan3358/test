const express = require('express');
const router = express.Router();
const ApiController = require('../controllers/ApiController');
const BlockchainApiController = require('../controllers/BlockchainApiController');
const { requireAuth, requireAdmin } = require('../middleware/auth');

// Existing User Endpoints
router.get('/profile', requireAuth, ApiController.getProfile);
router.get('/wallet', requireAuth, ApiController.getWalletData);
router.get('/genealogy/tree', requireAuth, ApiController.getTree);
router.get('/charts', requireAuth, ApiController.getChartData);
router.post('/wallet/sync-address', requireAuth, ApiController.syncWalletAddress);

// Universal Cron Endpoints (Supports Vercel Cron GET, Webhook POST, Bearer header, URL query key)
router.all('/cron/roi', ApiController.runDailyRoi);
router.all('/cron/salary', ApiController.runWeeklySalary);
router.get('/cron/status', ApiController.getCronStatus);

// MongoDB Atlas Health & Synchronization Diagnostics
router.get('/system/mongo-status', ApiController.getMongoStatus);
router.all('/system/mongo-sync-all', ApiController.syncAllToMongo);

// ==================================================
// USER WEB3 WALLET ENDPOINTS
// ==================================================
router.get('/wallet/nonce', requireAuth, BlockchainApiController.getUserNonce);
router.post('/wallet/verify-connect', requireAuth, BlockchainApiController.verifyAndConnectUserWallet);
router.post('/wallet/disconnect', requireAuth, BlockchainApiController.disconnectUserWallet);
router.get('/wallet/status', requireAuth, BlockchainApiController.getUserWalletStatus);

// ==================================================
// USER BLOCKCHAIN DEPOSITS (USDT BEP-20)
// ==================================================
router.post('/deposit/submit', requireAuth, BlockchainApiController.submitDeposit);
router.post('/deposit/verify', requireAuth, BlockchainApiController.verifyDepositTx);
router.get('/deposit/status/:id', requireAuth, BlockchainApiController.getDepositStatus);

// ==================================================
// USER & ADMIN WITHDRAWALS (USDT BEP-20)
// ==================================================
router.post('/withdraw/create', requireAuth, BlockchainApiController.createWithdrawal);
router.get('/withdraw/status/:id', requireAuth, BlockchainApiController.getWithdrawalStatus);

// Admin Approval & Payout Endpoints
router.post('/admin/withdrawals/:id/approve-send', requireAdmin, BlockchainApiController.approveAndSendWithdrawal);
router.post('/admin/withdrawals/:id/reject', requireAdmin, BlockchainApiController.rejectWithdrawal);
// Backward compatibility routes
router.post('/withdraw/:id/approve', requireAdmin, BlockchainApiController.approveAndSendWithdrawal);
router.post('/withdraw/:id/reject', requireAdmin, BlockchainApiController.rejectWithdrawal);

// ==================================================
// ADMIN BLOCKCHAIN & WALLET MANAGEMENT
// ==================================================
router.get('/admin/wallet/nonce', requireAdmin, BlockchainApiController.getAdminNonce);
router.post('/admin/wallet/verify-connect', requireAdmin, BlockchainApiController.verifyAndConnectAdminWallet);
router.post('/admin/wallet/disconnect', requireAdmin, BlockchainApiController.disconnectAdminWallet);
router.get('/admin/wallet/status', requireAdmin, BlockchainApiController.getAdminWalletStatus);

router.get('/admin/blockchain/deposits', requireAdmin, BlockchainApiController.getAdminDeposits);
router.get('/admin/blockchain/withdrawals', requireAdmin, BlockchainApiController.getAdminWithdrawals);

module.exports = router;
