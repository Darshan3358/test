const bcrypt = require('bcryptjs');
const { db, query, get, run, transaction, initSchema } = require('./db');
const AccountTypeService = require('../services/AccountTypeService');

async function seed() {
  console.log('--- Initializing FINVORA Database & Seed Data ---');
  initSchema();

  // Seed MLM Settings
  const settings = [
    { key: 'working_multiplier', value: '3', description: 'Maximum income multiplier for Working IDs (e.g. 3X)' },
    { key: 'investor_multiplier', value: '2', description: 'Maximum income multiplier for Investor IDs (e.g. 2X)' },
    { key: 'daily_roi_pct', value: '2.0', description: 'Daily ROI percentage (2% standard)' },
    { key: 'withdrawal_fee_pct', value: '10.0', description: 'Withdrawal processing fee in percentage (10% default)' },
    { key: 'referral_level_1_pct', value: '5.0', description: 'One-time Level 1 Referral Commission percentage (5%)' },
    { key: 'referral_level_2_pct', value: '2.0', description: 'One-time Level 2 Referral Commission percentage (2%)' },
    { key: 'referral_level_3_pct', value: '1.0', description: 'One-time Level 3 Referral Commission percentage (1%)' },
    { key: 'referral_level_4_pct', value: '1.0', description: 'One-time Level 4 Referral Commission percentage (1%)' },
    { key: 'referral_level_5_pct', value: '1.0', description: 'One-time Level 5 Referral Commission percentage (1%)' },
    { key: 'min_withdrawal', value: '10.0', description: 'Minimum allowed withdrawal amount in USD' },
    { key: 'max_withdrawal', value: '50000.0', description: 'Maximum allowed withdrawal amount per request in USD' },
    { key: 'maintenance_mode', value: '0', description: 'Platform maintenance mode (1 = active, 0 = normal)' },
    { key: 'income_cap_scope', value: 'ALL', description: 'Scope of 2X/3X cap: ALL (ROI + Comms) or ROI_ONLY' }
  ];

  const stmtSetting = db.prepare(`
    INSERT INTO mlm_settings (key, value, description)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, description = excluded.description
  `);

  for (const s of settings) {
    stmtSetting.run(s.key, s.value, s.description);
  }
  console.log('✓ MLM Settings seeded successfully.');

  // Seed Packages
  const packages = [
    { name: 'TH/S1', code: 'TH_S1_100', price: 100.0, daily_roi_pct: 2.0, max_multiplier: 3.0 },
    { name: 'TH/S2', code: 'TH_S2_250', price: 250.0, daily_roi_pct: 2.0, max_multiplier: 3.0 },
    { name: 'TH/S4', code: 'TH_S4_500', price: 500.0, daily_roi_pct: 2.0, max_multiplier: 3.0 },
    { name: 'TH/S4', code: 'TH_S4_1000', price: 1000.0, daily_roi_pct: 2.0, max_multiplier: 3.0 }
  ];

  const existingPackages = query('SELECT COUNT(*) as count FROM packages')[0];
  if (existingPackages.count === 0) {
    const pkgStmt = db.prepare(`
      INSERT INTO packages (name, code, price, daily_roi_pct, max_multiplier, status)
      VALUES (?, ?, ?, ?, ?, 'ACTIVE')
    `);
    for (const p of packages) {
      pkgStmt.run(p.name, p.code, p.price, p.daily_roi_pct, p.max_multiplier);
    }
    console.log('✓ Packages seeded successfully.');
  }

  // Seed Salary Targets
  const salaryTargets = [
    { target_name: 'Tier 1 - Silver Leader', required_direct_business: 1000.0, weekly_amount: 20.0, duration_weeks: 25 },
    { target_name: 'Tier 2 - Gold Executive', required_direct_business: 3000.0, weekly_amount: 50.0, duration_weeks: 25 },
    { target_name: 'Tier 3 - Ruby Director', required_direct_business: 5000.0, weekly_amount: 100.0, duration_weeks: 25 },
    { target_name: 'Tier 4 - Emerald Director', required_direct_business: 7500.0, weekly_amount: 150.0, duration_weeks: 25 },
    { target_name: 'Tier 5 - Diamond Ambassador', required_direct_business: 10000.0, weekly_amount: 200.0, duration_weeks: 25 },
    { target_name: 'Tier 6 - Blue Diamond', required_direct_business: 15000.0, weekly_amount: 300.0, duration_weeks: 25 },
    { target_name: 'Tier 7 - Black Diamond', required_direct_business: 20000.0, weekly_amount: 400.0, duration_weeks: 25 },
    { target_name: 'Tier 8 - Royal Ambassador', required_direct_business: 30000.0, weekly_amount: 600.0, duration_weeks: 25 },
    { target_name: 'Tier 9 - Crown Vice President', required_direct_business: 50000.0, weekly_amount: 1000.0, duration_weeks: 25 },
    { target_name: 'Tier 10 - FINVORA President', required_direct_business: 100000.0, weekly_amount: 2000.0, duration_weeks: 25 }
  ];

  const existingSalary = query('SELECT COUNT(*) as count FROM salary_targets')[0];
  if (existingSalary.count === 0) {
    const salStmt = db.prepare(`
      INSERT INTO salary_targets (target_name, required_direct_business, weekly_amount, duration_weeks, status)
      VALUES (?, ?, ?, ?, 'ACTIVE')
    `);
    for (const st of salaryTargets) {
      salStmt.run(st.target_name, st.required_direct_business, st.weekly_amount, st.duration_weeks);
    }
    console.log('✓ Salary targets seeded successfully.');
  }

  // Seed Users
  const rkAdminHash = bcrypt.hashSync('Rkadmin123', 10);
  const adminHash = bcrypt.hashSync('admin123', 10);
  const userHash = bcrypt.hashSync('password123', 10);

  const existingUsers = query('SELECT COUNT(*) as count FROM users')[0];
  if (process.argv.includes('--fresh') || existingUsers.count === 0) {
    console.log('Seeding demo users and referral chain...');
    run('DELETE FROM users');
    run('DELETE FROM wallets');
    run('DELETE FROM user_profiles');
    run('DELETE FROM level_unlocks');
    run('DELETE FROM investments');
    run('DELETE FROM salary_business_ledger');
    run('DELETE FROM user_salary_levels');
    run('DELETE FROM salary_payouts');
    run('DELETE FROM daily_roi_ledger');
    run('DELETE FROM referral_commissions');
    run('DELETE FROM level_commissions');
    run('DELETE FROM deposits');
    run('DELETE FROM withdrawals');
    run('DELETE FROM audit_logs');
    run('DELETE FROM cron_execution_logs');
    run('DELETE FROM wallet_transactions');

    // 1. Master Admin (Rkadmin)
    const rRkAdmin = run(`
      INSERT INTO users (user_code, full_name, username, email, mobile, password_hash, sponsor_id, user_type, role, status, country)
      VALUES (?, ?, ?, ?, ?, ?, NULL, 'WORKING', 'ADMIN', 'ACTIVE', 'United States')
    `, ['RKADMIN', 'FINVORA Master Admin (RK)', 'Rkadmin', 'rkadmin@finvora.com', '+18005550199', rkAdminHash]);
    const rkAdminId = rRkAdmin.lastInsertRowid;

    run('INSERT INTO wallets (user_id, main_balance) VALUES (?, 50000.0)', [rkAdminId]);
    run('INSERT INTO user_profiles (user_id, bio) VALUES (?, ?)', [rkAdminId, 'FINVORA Master Executive Administrator']);
    run('INSERT INTO level_unlocks (user_id, direct_count, unlocked_levels) VALUES (?, 0, 20)', [rkAdminId]);

    // 2. Secondary Admin
    const rAdmin = run(`
      INSERT INTO users (user_code, full_name, username, email, mobile, password_hash, sponsor_id, user_type, role, status, country)
      VALUES (?, ?, ?, ?, ?, ?, NULL, 'WORKING', 'ADMIN', 'ACTIVE', 'United States')
    `, ['FINADMIN', 'FINVORA System Admin', 'admin', 'admin@finvora.com', '+18005550100', adminHash]);
    const adminId = rAdmin.lastInsertRowid;

    run('INSERT INTO wallets (user_id, main_balance) VALUES (?, 10000.0)', [adminId]);
    run('INSERT INTO user_profiles (user_id, bio) VALUES (?, ?)', [adminId, 'FINVORA Global Master Admin']);
    run('INSERT INTO level_unlocks (user_id, direct_count, unlocked_levels) VALUES (?, 0, 20)', [adminId]);

    // 2. User A (Sponsor: Admin)
    const rA = run(`
      INSERT INTO users (user_code, full_name, username, email, mobile, password_hash, sponsor_id, user_type, role, status, country)
      VALUES ('FIN10001', 'Alexander Vance', 'usera', 'usera@finvora.com', '+15551001001', ?, ?, 'WORKING', 'USER', 'ACTIVE', 'United Kingdom')
    `, [userHash, adminId]);
    const userAId = rA.lastInsertRowid;
    run('INSERT INTO wallets (user_id, main_balance) VALUES (?, 1500.0)', [userAId]);
    run('INSERT INTO user_profiles (user_id, bio) VALUES (?, ?)', [userAId, 'Top Leader & Working ID']);
    run('INSERT INTO level_unlocks (user_id, direct_count, unlocked_levels) VALUES (?, 1, 1)', [userAId]);

    // 3. User B (Sponsor: User A)
    const rB = run(`
      INSERT INTO users (user_code, full_name, username, email, mobile, password_hash, sponsor_id, user_type, role, status, country)
      VALUES ('FIN10002', 'Beatrice Sterling', 'userb', 'userb@finvora.com', '+15551001002', ?, ?, 'WORKING', 'USER', 'ACTIVE', 'Germany')
    `, [userHash, userAId]);
    const userBId = rB.lastInsertRowid;
    run('INSERT INTO wallets (user_id, main_balance) VALUES (?, 800.0)', [userBId]);
    run('INSERT INTO user_profiles (user_id, bio) VALUES (?, ?)', [userBId, 'Working Partner']);
    run('INSERT INTO level_unlocks (user_id, direct_count, unlocked_levels) VALUES (?, 1, 1)', [userBId]);

    // 4. User C (Sponsor: User B)
    const rC = run(`
      INSERT INTO users (user_code, full_name, username, email, mobile, password_hash, sponsor_id, user_type, role, status, country)
      VALUES ('FIN10003', 'Christopher Nolan', 'userc', 'userc@finvora.com', '+15551001003', ?, ?, 'INVESTOR', 'USER', 'ACTIVE', 'Canada')
    `, [userHash, userBId]);
    const userCId = rC.lastInsertRowid;
    run('INSERT INTO wallets (user_id, main_balance) VALUES (?, 500.0)', [userCId]);
    run('INSERT INTO user_profiles (user_id, bio) VALUES (?, ?)', [userCId, 'Pure Investor ID']);
    run('INSERT INTO level_unlocks (user_id, direct_count, unlocked_levels) VALUES (?, 1, 1)', [userCId]);

    // 5. User D (Sponsor: User C)
    const rD = run(`
      INSERT INTO users (user_code, full_name, username, email, mobile, password_hash, sponsor_id, user_type, role, status, country)
      VALUES ('FIN10004', 'Daphne Blake', 'userd', 'userd@finvora.com', '+15551001004', ?, ?, 'WORKING', 'USER', 'ACTIVE', 'Australia')
    `, [userHash, userCId]);
    const userDId = rD.lastInsertRowid;
    run('INSERT INTO wallets (user_id, main_balance) VALUES (?, 300.0)', [userDId]);
    run('INSERT INTO user_profiles (user_id, bio) VALUES (?, ?)', [userDId, 'Crypto Enthusiast']);
    run('INSERT INTO level_unlocks (user_id, direct_count, unlocked_levels) VALUES (?, 1, 1)', [userDId]);

    // 6. User E (Sponsor: User D)
    const rE = run(`
      INSERT INTO users (user_code, full_name, username, email, mobile, password_hash, sponsor_id, user_type, role, status, country)
      VALUES ('FIN10005', 'Edward Norton', 'usere', 'usere@finvora.com', '+15551001005', ?, ?, 'INVESTOR', 'USER', 'ACTIVE', 'Singapore')
    `, [userHash, userDId]);
    const userEId = rE.lastInsertRowid;
    run('INSERT INTO wallets (user_id, main_balance) VALUES (?, 100.0)', [userEId]);
    run('INSERT INTO user_profiles (user_id, bio) VALUES (?, ?)', [userEId, 'Investor ID']);
    run('INSERT INTO level_unlocks (user_id, direct_count, unlocked_levels) VALUES (?, 0, 0)', [userEId]);

    console.log('✓ Users A, B, C, D, E and Admin created successfully.');

    // Seed Sample Investments for User A, User B, User C
    // User A purchases TH/S4 ($1,000)
    run(`
      INSERT INTO investments (user_id, package_id, package_name, package_code, amount, daily_roi_pct, multiplier, max_income_cap, total_roi_earned, total_income_earned, status)
      VALUES (?, 4, 'TH/S4', 'TH_S4_1000', 1000.0, 2.0, 3.0, 3000.0, 0.0, 0.0, 'ACTIVE')
    `, [userAId]);

    // User B purchases TH/S4 ($500)
    run(`
      INSERT INTO investments (user_id, package_id, package_name, package_code, amount, daily_roi_pct, multiplier, max_income_cap, total_roi_earned, total_income_earned, status)
      VALUES (?, 3, 'TH/S4', 'TH_S4_500', 500.0, 2.0, 3.0, 1500.0, 0.0, 0.0, 'ACTIVE')
    `, [userBId]);

    // User C purchases TH/S2 ($250) (Investor ID -> 2X cap = $500)
    run(`
      INSERT INTO investments (user_id, package_id, package_name, package_code, amount, daily_roi_pct, multiplier, max_income_cap, total_roi_earned, total_income_earned, status)
      VALUES (?, 2, 'TH/S2', 'TH_S2_250', 250.0, 2.0, 2.0, 500.0, 0.0, 0.0, 'ACTIVE')
    `, [userCId]);

    // Track direct business for User A ($500 from B), User B ($250 from C)
    run(`
      INSERT INTO salary_business_ledger (user_id, from_user_id, amount, status)
      VALUES (?, ?, 500.0, 'QUALIFIED')
    `, [userAId, userBId]);

    run(`
      INSERT INTO salary_business_ledger (user_id, from_user_id, amount, status)
      VALUES (?, ?, 250.0, 'QUALIFIED')
    `, [userBId, userCId]);

    // Record sample wallet transactions for ledger
    run(`
      INSERT INTO wallet_transactions (transaction_code, user_id, wallet_type, transaction_type, action, amount, balance_before, balance_after, description)
      VALUES ('TXN-SEED-001', ?, 'MAIN', 'DEPOSIT', 'CREDIT', 1500.0, 0.0, 1500.0, 'Initial seed deposit')
    `, [userAId]);

    console.log('✓ Seed investments, business ledger, and transactions recorded.');
  }

  // Synchronize all dynamic account classifications based on real network & investment state
  AccountTypeService.syncAllUserTypes();
  console.log('✓ Dynamic user classifications synchronized (ACTIVE, INVESTOR, WORKING, SUSPENDED).');

  console.log('--- Seeding completed successfully! ---');
}

if (require.main === module) {
  seed().catch(err => {
    console.error('Seed failed:', err);
    process.exit(1);
  });
}

module.exports = { seed };
