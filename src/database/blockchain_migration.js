require('dotenv').config();

function runBlockchainMigration(customDb = null, customRun = null, customGet = null) {
  const dbHelper = require('./db');
  const db = customDb || dbHelper.db;
  const run = customRun || dbHelper.run;
  const get = customGet || dbHelper.get;

  console.log('[Migration] Starting blockchain schema migration...');

  // 1. Create admin_wallets table
  db.exec(`
    CREATE TABLE IF NOT EXISTS admin_wallets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        wallet_type TEXT NOT NULL DEFAULT 'COMMON', -- 'COMMON', 'DEPOSIT', 'WITHDRAWAL'
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
  `);

  // 1b. Create user_wallets table (Cryptographically verified user primary wallet)
  db.exec(`
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
  `);

  // 2. Create admin_wallet_history table
  db.exec(`
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
  `);

  // 3. Create deposit_requests table
  db.exec(`
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
  `);

  // 4. Create blockchain_deposits table
  db.exec(`
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
  `);

  // 5. Create blockchain_deposit_transfers table (Duplicate Protection via tx_hash + log_index)
  db.exec(`
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
  `);

  // 6. Create blockchain_withdrawals table
  db.exec(`
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
  `);

  // 7. Create blockchain_transactions table
  db.exec(`
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
  `);

  // 8. Create blockchain_blocks checkpoint table
  db.exec(`
    CREATE TABLE IF NOT EXISTS blockchain_blocks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chain_id INTEGER UNIQUE NOT NULL,
        last_processed_block INTEGER NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 9. Create transaction_processing_locks table
  db.exec(`
    CREATE TABLE IF NOT EXISTS transaction_processing_locks (
        lock_key TEXT PRIMARY KEY,
        locked_by TEXT,
        acquired_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 10. Check columns on withdrawals table and add if missing
  try {
    const tableInfo = db.prepare("PRAGMA table_info('withdrawals')").all();
    const colNames = tableInfo.map(c => c.name);

    if (!colNames.includes('idempotency_key')) {
      db.exec("ALTER TABLE withdrawals ADD COLUMN idempotency_key TEXT;");
      console.log('[Migration] Added idempotency_key column to withdrawals');
    }
    if (!colNames.includes('tx_hash')) {
      db.exec("ALTER TABLE withdrawals ADD COLUMN tx_hash TEXT;");
      console.log('[Migration] Added tx_hash column to withdrawals');
    }
    if (!colNames.includes('block_number')) {
      db.exec("ALTER TABLE withdrawals ADD COLUMN block_number INTEGER;");
      console.log('[Migration] Added block_number column to withdrawals');
    }
  } catch (err) {
    console.error('[Migration] Error checking withdrawals columns:', err.message);
  }

  // 10b. Check columns on admin_wallets table and add if missing
  try {
    const awTableInfo = db.prepare("PRAGMA table_info('admin_wallets')").all();
    const awColNames = awTableInfo.map(c => c.name);

    if (!awColNames.includes('normalized_wallet_address')) {
      db.exec("ALTER TABLE admin_wallets ADD COLUMN normalized_wallet_address TEXT;");
    }
    if (!awColNames.includes('nonce')) {
      db.exec("ALTER TABLE admin_wallets ADD COLUMN nonce TEXT;");
    }
    if (!awColNames.includes('nonce_expires_at')) {
      db.exec("ALTER TABLE admin_wallets ADD COLUMN nonce_expires_at DATETIME;");
    }
    if (!awColNames.includes('last_verified_at')) {
      db.exec("ALTER TABLE admin_wallets ADD COLUMN last_verified_at DATETIME;");
    }
    if (!awColNames.includes('chain_id')) {
      db.exec("ALTER TABLE admin_wallets ADD COLUMN chain_id INTEGER NOT NULL DEFAULT 56;");
    }

    // Check admin_wallet_history columns
    const awhTableInfo = db.prepare("PRAGMA table_info('admin_wallet_history')").all();
    const awhColNames = awhTableInfo.map(c => c.name);
    if (!awhColNames.includes('normalized_wallet_address')) {
      db.exec("ALTER TABLE admin_wallet_history ADD COLUMN normalized_wallet_address TEXT;");
    }
  } catch (err) {
    console.error('[Migration] Error checking admin_wallets columns:', err.message);
  }

  // 11. Enforce ONE single active admin wallet for BOTH deposits and withdrawals
  const initialAdminWallet = (process.env.ACTIVE_ADMIN_WALLET || process.env.ACTIVE_DEPOSIT_WALLET || process.env.ACTIVE_WITHDRAWAL_WALLET || '').trim();

  if (initialAdminWallet) {
    const existingActive = get("SELECT * FROM admin_wallets WHERE is_active = 1 ORDER BY id DESC LIMIT 1");
    if (!existingActive) {
      run(`
        INSERT INTO admin_wallets (wallet_type, wallet_address, normalized_wallet_address, network, token, chain_id, is_active)
        VALUES ('COMMON', ?, ?, 'BSC', 'USDT', 56, 1)
      `, [initialAdminWallet, initialAdminWallet]);
      console.log(`[Migration] Seeded single active admin wallet: ${initialAdminWallet}`);
    } else {
      // Ensure only 1 active admin wallet is enabled
      run("UPDATE admin_wallets SET is_active = 0 WHERE id != ?", [existingActive.id]);
    }
  }

  // Seed default block checkpoint if not exists
  const chainId = parseInt(process.env.BSC_CHAIN_ID || '56', 10);
  const existingBlock = get("SELECT * FROM blockchain_blocks WHERE chain_id = ?", [chainId]);
  if (!existingBlock) {
    run(`
      INSERT INTO blockchain_blocks (chain_id, last_processed_block)
      VALUES (?, 0)
    `, [chainId]);
    console.log(`[Migration] Seeded blockchain_blocks checkpoint for chain ${chainId}`);
  }

  console.log('[Migration] Blockchain schema migration completed successfully.');
}

if (require.main === module) {
  runBlockchainMigration();
}

module.exports = { runBlockchainMigration };
