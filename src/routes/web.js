const express = require('express');
const router = express.Router();

const AuthController = require('../controllers/AuthController');
const PublicController = require('../controllers/PublicController');
const UserDashboardController = require('../controllers/UserDashboardController');
const AdminController = require('../controllers/AdminController');
const { requireAuth, requireAdmin } = require('../middleware/auth');

// --- Public Routes ---
router.get('/', PublicController.home);
router.get('/about', PublicController.about);
router.get('/packages-info', PublicController.packages);
router.get('/how-it-works', PublicController.howItWorks);
router.get('/income-plan', PublicController.incomePlan);
router.get('/salary-plan', PublicController.salaryPlan);
router.get('/faq', PublicController.faq);
router.get('/contact', PublicController.contact);
router.get('/terms', PublicController.terms);
router.get('/privacy', PublicController.privacy);
router.get('/risk-disclosure', PublicController.riskDisclosure);

// Auth Routes
router.get('/login', AuthController.showLogin);
router.post('/login', AuthController.login);
router.get('/register', AuthController.showRegister);
router.post('/register', AuthController.register);
router.get('/logout', AuthController.logout);

// --- User Dashboard Routes (requireAuth) ---
router.get('/dashboard', requireAuth, UserDashboardController.showDashboard);
router.get('/packages', requireAuth, UserDashboardController.showPackages);
router.get('/dashboard/packages', requireAuth, (req, res) => res.redirect('/packages'));
router.post('/packages/purchase', requireAuth, UserDashboardController.purchasePackage);
router.get('/my-investments', requireAuth, UserDashboardController.showInvestments);
router.get('/my-referrals', requireAuth, UserDashboardController.showReferrals);
router.get('/genealogy', requireAuth, UserDashboardController.showGenealogy);
router.get('/level-income', requireAuth, UserDashboardController.showLevelIncome);
router.get('/referral-income', requireAuth, UserDashboardController.showReferralIncome);
router.get('/salary', requireAuth, UserDashboardController.showSalary);
router.get('/wallet', requireAuth, UserDashboardController.showWallet);
router.post('/wallet/transfer', requireAuth, UserDashboardController.transferToMain);
router.get('/deposit', requireAuth, UserDashboardController.showDeposit);
router.post('/deposit', requireAuth, UserDashboardController.submitDeposit);
router.post('/deposit/verify', requireAuth, UserDashboardController.verifyDepositTx);
router.get('/withdraw', requireAuth, UserDashboardController.showWithdraw);
router.post('/withdraw', requireAuth, UserDashboardController.submitWithdraw);
router.get('/withdrawal-history', requireAuth, UserDashboardController.showWithdraw);
router.get('/transactions', requireAuth, UserDashboardController.showTransactions);
router.get('/income-history', requireAuth, UserDashboardController.showTransactions);
router.get('/profile', requireAuth, UserDashboardController.showProfile);
router.post('/profile', requireAuth, UserDashboardController.updateProfile);
router.get('/security', requireAuth, UserDashboardController.showProfile);
router.get('/login-activity', requireAuth, UserDashboardController.showProfile);
router.get('/support', requireAuth, (req, res) => res.render('dashboard/support', { title: 'Support & Help Desk — FINVORA', user: req.user }));

// --- Admin Panel Routes (Secure Path: /SLXadmin) ---
router.get('/SLXadmin', (req, res) => res.redirect('/SLXadmin/login'));
router.get('/SLXadmin/login', AuthController.showAdminLogin);
router.post('/SLXadmin/login', AuthController.login);

// Protected Admin Routes (requireAdmin)
router.get('/SLXadmin/dashboard', requireAdmin, AdminController.showDashboard);
router.get('/SLXadmin/blockchain-monitor', requireAdmin, AdminController.showBlockchainMonitor);
router.post('/SLXadmin/wallet/update', requireAdmin, AdminController.updateAdminWallet);
router.get('/SLXadmin/users', requireAdmin, AdminController.showUsers);
router.get('/SLXadmin/users/:id', requireAdmin, AdminController.showUserDetails);
router.post('/SLXadmin/users/:id', requireAdmin, AdminController.updateUser);
router.get('/SLXadmin/packages', requireAdmin, AdminController.showPackages);
router.post('/SLXadmin/packages', requireAdmin, AdminController.savePackage);
router.get('/SLXadmin/deposits', requireAdmin, AdminController.showDeposits);
router.post('/SLXadmin/deposits/:id/approve', requireAdmin, AdminController.approveDeposit);
router.post('/SLXadmin/deposits/:id/reject', requireAdmin, AdminController.rejectDeposit);
router.get('/SLXadmin/withdrawals', requireAdmin, AdminController.showWithdrawals);
router.post('/SLXadmin/withdrawals/:id/approve', requireAdmin, AdminController.approveWithdrawal);
router.post('/SLXadmin/withdrawals/:id/reject', requireAdmin, AdminController.rejectWithdrawal);
router.get('/SLXadmin/settings', requireAdmin, AdminController.showSettings);
router.post('/SLXadmin/settings', requireAdmin, AdminController.updateSettings);
router.post('/SLXadmin/cron/roi', requireAdmin, AdminController.triggerRoiCron);
router.post('/SLXadmin/cron/salary', requireAdmin, AdminController.triggerSalaryCron);
router.post('/SLXadmin/run-roi', requireAdmin, AdminController.triggerRoiCron);
router.post('/SLXadmin/run-salary', requireAdmin, AdminController.triggerSalaryCron);
router.get('/SLXadmin/audit-logs', requireAdmin, AdminController.showAuditLogs);

// Disable old /admin routes completely - returns 404 for any /admin path
router.use('/admin', (req, res) => {
  res.status(404).render('public/404', { title: 'Page Not Found — FINVORA' });
});

module.exports = router;
