-- FINVORA MLM Database Schema
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_code TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    mobile TEXT,
    password_hash TEXT NOT NULL,
    sponsor_id INTEGER NULL,
    user_type TEXT NOT NULL DEFAULT 'ACTIVE', -- 'ACTIVE', 'INVESTOR', 'WORKING', 'SUSPENDED'
    role TEXT NOT NULL DEFAULT 'USER',         -- 'USER', 'ADMIN'
    status TEXT NOT NULL DEFAULT 'ACTIVE',     -- 'ACTIVE', 'SUSPENDED', 'PENDING'
    country TEXT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sponsor_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_users_sponsor ON users(sponsor_id);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);

CREATE TABLE IF NOT EXISTS user_profiles (
    user_id INTEGER PRIMARY KEY,
    wallet_address TEXT,
    bank_details TEXT,
    avatar TEXT,
    bio TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_security (
    user_id INTEGER PRIMARY KEY,
    two_factor_enabled INTEGER DEFAULT 0,
    failed_login_attempts INTEGER DEFAULT 0,
    lockout_until DATETIME NULL,
    last_login_at DATETIME NULL,
    last_login_ip TEXT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS packages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    code TEXT NOT NULL,
    price REAL NOT NULL,
    daily_roi_pct REAL NOT NULL DEFAULT 2.0,
    max_multiplier REAL NOT NULL DEFAULT 3.0,
    status TEXT NOT NULL DEFAULT 'ACTIVE', -- 'ACTIVE', 'INACTIVE'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS investments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    package_id INTEGER NOT NULL,
    package_name TEXT NOT NULL,
    package_code TEXT NOT NULL,
    amount REAL NOT NULL,
    daily_roi_pct REAL NOT NULL DEFAULT 2.0,
    multiplier REAL NOT NULL,
    max_income_cap REAL NOT NULL,
    total_roi_earned REAL DEFAULT 0.0,
    total_income_earned REAL DEFAULT 0.0,
    status TEXT DEFAULT 'ACTIVE', -- 'ACTIVE', 'CAPPED', 'EXPIRED'
    activated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    capped_at DATETIME NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (package_id) REFERENCES packages(id)
);

CREATE INDEX IF NOT EXISTS idx_investments_user ON investments(user_id);
CREATE INDEX IF NOT EXISTS idx_investments_status ON investments(status);

CREATE TABLE IF NOT EXISTS wallets (
    user_id INTEGER PRIMARY KEY,
    main_balance REAL DEFAULT 0.0,
    roi_balance REAL DEFAULT 0.0,
    referral_balance REAL DEFAULT 0.0,
    level_balance REAL DEFAULT 0.0,
    salary_balance REAL DEFAULT 0.0,
    total_withdrawn REAL DEFAULT 0.0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS wallet_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    transaction_code TEXT UNIQUE NOT NULL,
    user_id INTEGER NOT NULL,
    wallet_type TEXT NOT NULL, -- 'MAIN', 'ROI', 'REFERRAL', 'LEVEL', 'SALARY'
    transaction_type TEXT NOT NULL, -- 'DEPOSIT', 'PACKAGE_PURCHASE', 'ROI', 'REFERRAL_COMMISSION', 'LEVEL_COMMISSION', 'SALARY', 'WITHDRAWAL', 'WITHDRAWAL_FEE', 'TRANSFER', 'CAP_ADJUSTMENT'
    action TEXT NOT NULL, -- 'CREDIT', 'DEBIT'
    amount REAL NOT NULL,
    balance_before REAL NOT NULL,
    balance_after REAL NOT NULL,
    reference_id TEXT NULL,
    description TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'COMPLETED',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_wallet_tx_user ON wallet_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_tx_type ON wallet_transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_wallet_tx_date ON wallet_transactions(created_at);

CREATE TABLE IF NOT EXISTS daily_roi_ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    investment_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    roi_date TEXT NOT NULL, -- 'YYYY-MM-DD'
    base_amount REAL NOT NULL,
    roi_pct REAL NOT NULL,
    gross_amount REAL NOT NULL,
    net_amount REAL NOT NULL,
    capped_amount REAL DEFAULT 0.0,
    status TEXT DEFAULT 'PROCESSED',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(investment_id, roi_date),
    FOREIGN KEY (investment_id) REFERENCES investments(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_daily_roi_user ON daily_roi_ledger(user_id);
CREATE INDEX IF NOT EXISTS idx_daily_roi_date ON daily_roi_ledger(roi_date);

CREATE TABLE IF NOT EXISTS referral_commissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    investment_id INTEGER NOT NULL,
    buyer_user_id INTEGER NOT NULL,
    upline_user_id INTEGER NOT NULL,
    level INTEGER NOT NULL DEFAULT 1,
    commission_pct REAL NOT NULL DEFAULT 10.0,
    package_amount REAL NOT NULL,
    gross_amount REAL NOT NULL,
    net_amount REAL NOT NULL,
    capped_amount REAL DEFAULT 0.0,
    status TEXT DEFAULT 'PROCESSED',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(investment_id, upline_user_id),
    FOREIGN KEY (investment_id) REFERENCES investments(id) ON DELETE CASCADE,
    FOREIGN KEY (buyer_user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (upline_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ref_comm_upline ON referral_commissions(upline_user_id);

CREATE TABLE IF NOT EXISTS level_commissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    roi_ledger_id INTEGER NOT NULL,
    downline_user_id INTEGER NOT NULL,
    upline_user_id INTEGER NOT NULL,
    level INTEGER NOT NULL,
    commission_pct REAL NOT NULL,
    downline_roi_amount REAL NOT NULL,
    gross_amount REAL NOT NULL,
    net_amount REAL NOT NULL,
    capped_amount REAL DEFAULT 0.0,
    status TEXT DEFAULT 'PROCESSED',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(roi_ledger_id, upline_user_id, level),
    FOREIGN KEY (roi_ledger_id) REFERENCES daily_roi_ledger(id) ON DELETE CASCADE,
    FOREIGN KEY (downline_user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (upline_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_level_comm_upline ON level_commissions(upline_user_id);
CREATE INDEX IF NOT EXISTS idx_level_comm_downline ON level_commissions(downline_user_id);

CREATE TABLE IF NOT EXISTS level_unlocks (
    user_id INTEGER PRIMARY KEY,
    direct_count INTEGER DEFAULT 0,
    unlocked_levels INTEGER DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS salary_targets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    target_name TEXT NOT NULL,
    required_direct_business REAL NOT NULL,
    weekly_amount REAL NOT NULL,
    duration_weeks INTEGER NOT NULL DEFAULT 25,
    status TEXT NOT NULL DEFAULT 'ACTIVE'
);

CREATE TABLE IF NOT EXISTS user_salary_levels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    target_id INTEGER NOT NULL,
    target_name TEXT NOT NULL,
    weekly_amount REAL NOT NULL,
    duration_weeks INTEGER NOT NULL DEFAULT 25,
    paid_weeks INTEGER DEFAULT 0,
    start_date DATE NOT NULL,
    last_payout_date DATE NULL,
    status TEXT NOT NULL DEFAULT 'ACTIVE', -- 'ACTIVE', 'STOPPED', 'COMPLETED'
    stopped_reason TEXT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (target_id) REFERENCES salary_targets(id)
);

CREATE INDEX IF NOT EXISTS idx_salary_user_status ON user_salary_levels(user_id, status);

CREATE TABLE IF NOT EXISTS salary_business_ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    investment_id INTEGER NULL,
    from_user_id INTEGER NOT NULL,
    amount REAL NOT NULL,
    allocated_to_target_id INTEGER NULL,
    status TEXT DEFAULT 'QUALIFIED',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (from_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_salary_business_user ON salary_business_ledger(user_id);

CREATE TABLE IF NOT EXISTS salary_payouts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_salary_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    week_number INTEGER NOT NULL,
    amount REAL NOT NULL,
    payout_date DATE NOT NULL,
    status TEXT DEFAULT 'PAID',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_salary_id, week_number),
    FOREIGN KEY (user_salary_id) REFERENCES user_salary_levels(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS deposits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    deposit_code TEXT UNIQUE NOT NULL,
    user_id INTEGER NOT NULL,
    amount REAL NOT NULL,
    payment_method TEXT NOT NULL, -- 'USDT_TRC20', 'BITCOIN', 'BANK_TRANSFER', 'MANUAL'
    transaction_reference TEXT,
    proof_image TEXT,
    status TEXT NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'APPROVED', 'REJECTED'
    admin_note TEXT,
    processed_at DATETIME NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_deposits_user ON deposits(user_id);
CREATE INDEX IF NOT EXISTS idx_deposits_status ON deposits(status);

CREATE TABLE IF NOT EXISTS withdrawals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    withdrawal_code TEXT UNIQUE NOT NULL,
    user_id INTEGER NOT NULL,
    requested_amount REAL NOT NULL,
    fee_pct REAL NOT NULL DEFAULT 10.0,
    fee_amount REAL NOT NULL,
    net_amount REAL NOT NULL,
    wallet_type TEXT NOT NULL DEFAULT 'MAIN',
    payout_method TEXT NOT NULL,
    account_details TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'APPROVED', 'REJECTED'
    admin_note TEXT,
    processed_at DATETIME NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_withdrawals_user ON withdrawals(user_id);
CREATE INDEX IF NOT EXISTS idx_withdrawals_status ON withdrawals(status);

CREATE TABLE IF NOT EXISTS mlm_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    description TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_id INTEGER NULL,
    actor_name TEXT,
    actor_role TEXT,
    action TEXT NOT NULL,
    target_type TEXT,
    target_id TEXT,
    details TEXT,
    ip_address TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at);

CREATE TABLE IF NOT EXISTS cron_execution_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cron_name TEXT NOT NULL,
    execution_date TEXT NOT NULL,
    processed_count INTEGER DEFAULT 0,
    total_payout REAL DEFAULT 0.0,
    status TEXT NOT NULL,
    details TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_cron_logs_name_date ON cron_execution_logs(cron_name, execution_date);

-- ==================================================
-- FINVORA AUTOMATED BLOCKCHAIN PAYMENT SYSTEM (USDT BEP-20)
-- ==================================================

CREATE TABLE IF NOT EXISTS admin_wallets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wallet_type TEXT NOT NULL DEFAULT 'COMMON', -- 'COMMON' (Both Deposits & Withdrawals)
    wallet_address TEXT NOT NULL,
    normalized_wallet_address TEXT NULL,
    network TEXT NOT NULL DEFAULT 'BSC',
    token TEXT NOT NULL DEFAULT 'USDT',
    chain_id INTEGER NOT NULL DEFAULT 56,
    is_active INTEGER NOT NULL DEFAULT 1,
    nonce TEXT NULL,
    nonce_expires_at DATETIME NULL,
    created_by INTEGER NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_verified_at DATETIME NULL,
    deactivated_at DATETIME NULL,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_admin_wallets_active ON admin_wallets(is_active);

-- User Connected Blockchain Wallets (Cryptographically Verified via Nonce & personal_sign)
CREATE TABLE IF NOT EXISTS user_wallets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    wallet_address TEXT NOT NULL,
    normalized_wallet_address TEXT NOT NULL,
    network TEXT NOT NULL DEFAULT 'BSC',
    chain_id INTEGER NOT NULL DEFAULT 56,
    is_verified INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    nonce TEXT NULL,
    nonce_expires_at DATETIME NULL,
    connected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_verified_at DATETIME NULL,
    disconnected_at DATETIME NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_user_wallets_user_active ON user_wallets(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_user_wallets_normalized ON user_wallets(normalized_wallet_address);

CREATE TABLE IF NOT EXISTS admin_wallet_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wallet_type TEXT NOT NULL DEFAULT 'COMMON',
    wallet_address TEXT NOT NULL,
    normalized_wallet_address TEXT NULL,
    network TEXT NOT NULL DEFAULT 'BSC',
    token TEXT NOT NULL DEFAULT 'USDT',
    status TEXT NOT NULL DEFAULT 'HISTORICAL',
    created_by INTEGER NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    deactivated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_admin_wallet_hist_type ON admin_wallet_history(wallet_type);

CREATE TABLE IF NOT EXISTS deposit_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    deposit_code TEXT UNIQUE NOT NULL,
    user_id INTEGER NOT NULL,
    expected_amount REAL NOT NULL,
    active_deposit_wallet TEXT NOT NULL,
    network TEXT NOT NULL DEFAULT 'BSC',
    token TEXT NOT NULL DEFAULT 'USDT',
    status TEXT NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'CONFIRMED', 'EXPIRED', 'CANCELLED'
    tx_hash TEXT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    confirmed_at DATETIME NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_deposit_req_user ON deposit_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_deposit_req_status ON deposit_requests(status);
CREATE INDEX IF NOT EXISTS idx_deposit_req_tx_hash ON deposit_requests(tx_hash);

CREATE TABLE IF NOT EXISTS blockchain_deposits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    deposit_request_id INTEGER NULL,
    user_id INTEGER NULL,
    tx_hash TEXT UNIQUE NOT NULL,
    from_address TEXT NOT NULL,
    to_address TEXT NOT NULL,
    token_contract TEXT NOT NULL,
    amount REAL NOT NULL,
    block_number INTEGER NOT NULL,
    confirmation_count INTEGER DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'VERIFIED', -- 'VERIFIED', 'UNMATCHED', 'UNSUPPORTED_ASSET', 'DUPLICATE'
    verification_timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (deposit_request_id) REFERENCES deposit_requests(id) ON DELETE SET NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_bc_deposits_user ON blockchain_deposits(user_id);
CREATE INDEX IF NOT EXISTS idx_bc_deposits_status ON blockchain_deposits(status);
CREATE INDEX IF NOT EXISTS idx_bc_deposits_tx ON blockchain_deposits(tx_hash);

CREATE TABLE IF NOT EXISTS blockchain_deposit_transfers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tx_hash TEXT NOT NULL,
    log_index INTEGER NOT NULL,
    from_address TEXT NOT NULL,
    to_address TEXT NOT NULL,
    token_contract TEXT NOT NULL,
    amount REAL NOT NULL,
    block_number INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'PROCESSED',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tx_hash, log_index)
);
CREATE INDEX IF NOT EXISTS idx_bc_transfers_tx_log ON blockchain_deposit_transfers(tx_hash, log_index);

CREATE TABLE IF NOT EXISTS blockchain_withdrawals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    withdrawal_id INTEGER NOT NULL,
    tx_hash TEXT UNIQUE NOT NULL,
    from_address TEXT NOT NULL,
    to_address TEXT NOT NULL,
    token_contract TEXT NOT NULL,
    gross_amount REAL NOT NULL,
    fee_amount REAL NOT NULL,
    net_amount REAL NOT NULL,
    block_number INTEGER NULL,
    status TEXT NOT NULL DEFAULT 'BROADCASTED', -- 'BROADCASTED', 'CONFIRMING', 'COMPLETED', 'FAILED'
    error_reason TEXT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME NULL,
    FOREIGN KEY (withdrawal_id) REFERENCES withdrawals(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_bc_withdrawals_tx ON blockchain_withdrawals(tx_hash);
CREATE INDEX IF NOT EXISTS idx_bc_withdrawals_wd ON blockchain_withdrawals(withdrawal_id);

CREATE TABLE IF NOT EXISTS blockchain_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tx_hash TEXT UNIQUE NOT NULL,
    chain_id INTEGER NOT NULL DEFAULT 56,
    block_number INTEGER NULL,
    from_address TEXT NULL,
    to_address TEXT NULL,
    status TEXT NULL,
    raw_data TEXT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_bc_txs_hash ON blockchain_transactions(tx_hash);

CREATE TABLE IF NOT EXISTS blockchain_blocks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chain_id INTEGER UNIQUE NOT NULL,
    last_processed_block INTEGER NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS transaction_processing_locks (
    lock_key TEXT PRIMARY KEY,
    locked_by TEXT,
    acquired_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

