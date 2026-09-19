-- FINVORA Production MySQL / MariaDB Schema
CREATE DATABASE IF NOT EXISTS finvora CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE finvora;

CREATE TABLE IF NOT EXISTS users (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_code VARCHAR(32) UNIQUE NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    mobile VARCHAR(30) NULL,
    password_hash VARCHAR(255) NOT NULL,
    sponsor_id BIGINT UNSIGNED NULL,
    user_type ENUM('WORKING', 'INVESTOR') DEFAULT 'WORKING',
    role ENUM('USER', 'ADMIN') DEFAULT 'USER',
    status ENUM('ACTIVE', 'SUSPENDED', 'PENDING') DEFAULT 'ACTIVE',
    country VARCHAR(80) DEFAULT 'United States',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (sponsor_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_sponsor (sponsor_id),
    INDEX idx_username (username),
    INDEX idx_email (email),
    INDEX idx_status (status)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS user_profiles (
    user_id BIGINT UNSIGNED PRIMARY KEY,
    wallet_address VARCHAR(255) NULL,
    bank_details TEXT NULL,
    avatar VARCHAR(255) NULL,
    bio TEXT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS user_security (
    user_id BIGINT UNSIGNED PRIMARY KEY,
    two_factor_enabled TINYINT(1) DEFAULT 0,
    failed_login_attempts INT DEFAULT 0,
    lockout_until TIMESTAMP NULL,
    last_login_at TIMESTAMP NULL,
    last_login_ip VARCHAR(45) NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS packages (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    code VARCHAR(50) NOT NULL,
    price DECIMAL(14,2) NOT NULL,
    daily_roi_pct DECIMAL(5,2) DEFAULT 2.00,
    max_multiplier DECIMAL(5,2) DEFAULT 3.00,
    status ENUM('ACTIVE', 'INACTIVE') DEFAULT 'ACTIVE',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS investments (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    package_id BIGINT UNSIGNED NOT NULL,
    package_name VARCHAR(100) NOT NULL,
    package_code VARCHAR(50) NOT NULL,
    amount DECIMAL(14,2) NOT NULL,
    daily_roi_pct DECIMAL(5,2) DEFAULT 2.00,
    multiplier DECIMAL(5,2) NOT NULL,
    max_income_cap DECIMAL(14,2) NOT NULL,
    total_roi_earned DECIMAL(14,2) DEFAULT 0.00,
    total_income_earned DECIMAL(14,2) DEFAULT 0.00,
    status ENUM('ACTIVE', 'CAPPED', 'EXPIRED') DEFAULT 'ACTIVE',
    activated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    capped_at TIMESTAMP NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (package_id) REFERENCES packages(id),
    INDEX idx_inv_user (user_id),
    INDEX idx_inv_status (status)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS wallets (
    user_id BIGINT UNSIGNED PRIMARY KEY,
    main_balance DECIMAL(16,4) DEFAULT 0.0000,
    roi_balance DECIMAL(16,4) DEFAULT 0.0000,
    referral_balance DECIMAL(16,4) DEFAULT 0.0000,
    level_balance DECIMAL(16,4) DEFAULT 0.0000,
    salary_balance DECIMAL(16,4) DEFAULT 0.0000,
    total_withdrawn DECIMAL(16,4) DEFAULT 0.0000,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS wallet_transactions (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    transaction_code VARCHAR(64) UNIQUE NOT NULL,
    user_id BIGINT UNSIGNED NOT NULL,
    wallet_type VARCHAR(32) NOT NULL,
    transaction_type VARCHAR(50) NOT NULL,
    action ENUM('CREDIT', 'DEBIT') NOT NULL,
    amount DECIMAL(16,4) NOT NULL,
    balance_before DECIMAL(16,4) NOT NULL,
    balance_after DECIMAL(16,4) NOT NULL,
    reference_id VARCHAR(100) NULL,
    description TEXT NOT NULL,
    status VARCHAR(30) DEFAULT 'COMPLETED',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_tx_user (user_id),
    INDEX idx_tx_type (transaction_type),
    INDEX idx_tx_created (created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS daily_roi_ledger (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    investment_id BIGINT UNSIGNED NOT NULL,
    user_id BIGINT UNSIGNED NOT NULL,
    roi_date DATE NOT NULL,
    base_amount DECIMAL(14,2) NOT NULL,
    roi_pct DECIMAL(5,2) NOT NULL,
    gross_amount DECIMAL(14,4) NOT NULL,
    net_amount DECIMAL(14,4) NOT NULL,
    capped_amount DECIMAL(14,4) DEFAULT 0.0000,
    status VARCHAR(30) DEFAULT 'PROCESSED',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_inv_date (investment_id, roi_date),
    FOREIGN KEY (investment_id) REFERENCES investments(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_roi_user (user_id),
    INDEX idx_roi_date (roi_date)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS referral_commissions (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    investment_id BIGINT UNSIGNED NOT NULL,
    buyer_user_id BIGINT UNSIGNED NOT NULL,
    upline_user_id BIGINT UNSIGNED NOT NULL,
    level INT NOT NULL DEFAULT 1,
    commission_pct DECIMAL(5,2) NOT NULL DEFAULT 10.00,
    package_amount DECIMAL(14,2) NOT NULL,
    gross_amount DECIMAL(14,4) NOT NULL,
    net_amount DECIMAL(14,4) NOT NULL,
    capped_amount DECIMAL(14,4) DEFAULT 0.0000,
    status VARCHAR(30) DEFAULT 'PROCESSED',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_ref_inv_upline (investment_id, upline_user_id),
    FOREIGN KEY (investment_id) REFERENCES investments(id) ON DELETE CASCADE,
    FOREIGN KEY (buyer_user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (upline_user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_ref_upline (upline_user_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS level_commissions (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    roi_ledger_id BIGINT UNSIGNED NOT NULL,
    downline_user_id BIGINT UNSIGNED NOT NULL,
    upline_user_id BIGINT UNSIGNED NOT NULL,
    level INT NOT NULL,
    commission_pct DECIMAL(5,2) NOT NULL,
    downline_roi_amount DECIMAL(14,4) NOT NULL,
    gross_amount DECIMAL(14,4) NOT NULL,
    net_amount DECIMAL(14,4) NOT NULL,
    capped_amount DECIMAL(14,4) DEFAULT 0.0000,
    status VARCHAR(30) DEFAULT 'PROCESSED',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_level_roi_upline (roi_ledger_id, upline_user_id, level),
    FOREIGN KEY (roi_ledger_id) REFERENCES daily_roi_ledger(id) ON DELETE CASCADE,
    FOREIGN KEY (downline_user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (upline_user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_lvl_upline (upline_user_id),
    INDEX idx_lvl_downline (downline_user_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS level_unlocks (
    user_id BIGINT UNSIGNED PRIMARY KEY,
    direct_count INT DEFAULT 0,
    unlocked_levels INT DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS salary_targets (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    target_name VARCHAR(100) NOT NULL,
    required_direct_business DECIMAL(14,2) NOT NULL,
    weekly_amount DECIMAL(14,2) NOT NULL,
    duration_weeks INT NOT NULL DEFAULT 25,
    status ENUM('ACTIVE', 'INACTIVE') DEFAULT 'ACTIVE'
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS user_salary_levels (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    target_id BIGINT UNSIGNED NOT NULL,
    target_name VARCHAR(100) NOT NULL,
    weekly_amount DECIMAL(14,2) NOT NULL,
    duration_weeks INT NOT NULL DEFAULT 25,
    paid_weeks INT DEFAULT 0,
    start_date DATE NOT NULL,
    last_payout_date DATE NULL,
    status ENUM('ACTIVE', 'STOPPED', 'COMPLETED') DEFAULT 'ACTIVE',
    stopped_reason VARCHAR(255) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (target_id) REFERENCES salary_targets(id),
    INDEX idx_sal_user_status (user_id, status)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS salary_business_ledger (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    investment_id BIGINT UNSIGNED NULL,
    from_user_id BIGINT UNSIGNED NOT NULL,
    amount DECIMAL(14,2) NOT NULL,
    allocated_to_target_id BIGINT UNSIGNED NULL,
    status VARCHAR(30) DEFAULT 'QUALIFIED',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (from_user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_sal_biz_user (user_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS salary_payouts (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_salary_id BIGINT UNSIGNED NOT NULL,
    user_id BIGINT UNSIGNED NOT NULL,
    week_number INT NOT NULL,
    amount DECIMAL(14,2) NOT NULL,
    payout_date DATE NOT NULL,
    status VARCHAR(30) DEFAULT 'PAID',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_sal_week (user_salary_id, week_number),
    FOREIGN KEY (user_salary_id) REFERENCES user_salary_levels(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS deposits (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    deposit_code VARCHAR(64) UNIQUE NOT NULL,
    user_id BIGINT UNSIGNED NOT NULL,
    amount DECIMAL(14,2) NOT NULL,
    payment_method VARCHAR(50) NOT NULL,
    transaction_reference VARCHAR(255) NULL,
    proof_image VARCHAR(255) NULL,
    status ENUM('PENDING', 'APPROVED', 'REJECTED') DEFAULT 'PENDING',
    admin_note TEXT NULL,
    processed_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_dep_user (user_id),
    INDEX idx_dep_status (status)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS withdrawals (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    withdrawal_code VARCHAR(64) UNIQUE NOT NULL,
    user_id BIGINT UNSIGNED NOT NULL,
    requested_amount DECIMAL(14,2) NOT NULL,
    fee_pct DECIMAL(5,2) DEFAULT 10.00,
    fee_amount DECIMAL(14,2) NOT NULL,
    net_amount DECIMAL(14,2) NOT NULL,
    wallet_type VARCHAR(32) DEFAULT 'MAIN',
    payout_method VARCHAR(50) NOT NULL,
    account_details TEXT NOT NULL,
    status ENUM('PENDING', 'APPROVED', 'REJECTED') DEFAULT 'PENDING',
    admin_note TEXT NULL,
    processed_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_wd_user (user_id),
    INDEX idx_wd_status (status)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS mlm_settings (
    `key` VARCHAR(64) PRIMARY KEY,
    `value` TEXT NOT NULL,
    `description` VARCHAR(255) NULL,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS audit_logs (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    actor_id BIGINT UNSIGNED NULL,
    actor_name VARCHAR(100) NULL,
    actor_role VARCHAR(50) NULL,
    action VARCHAR(100) NOT NULL,
    target_type VARCHAR(50) NULL,
    target_id VARCHAR(50) NULL,
    details TEXT NULL,
    ip_address VARCHAR(45) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_audit_action (action),
    INDEX idx_audit_created (created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS cron_execution_logs (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    cron_name VARCHAR(100) NOT NULL,
    execution_date VARCHAR(30) NOT NULL,
    processed_count INT DEFAULT 0,
    total_payout DECIMAL(14,2) DEFAULT 0.00,
    status VARCHAR(30) NOT NULL,
    details TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_cron_log (cron_name, execution_date)
) ENGINE=InnoDB;
