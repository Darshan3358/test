const { query } = require('../src/database/db');
const { connectMongo, closeMongo, getDb } = require('../src/database/mongo');

async function migrateSqliteToMongo() {
  console.log('================================================================================');
  console.log('           FINVORA — SQLITE TO MONGODB ATLAS DATA MIGRATION                    ');
  console.log('================================================================================\n');

  console.log('▶ [1/3] Connecting to MongoDB Atlas...');
  const mongoDb = await connectMongo();
  console.log('✓ Connected to MongoDB Atlas cluster.\n');

  console.log('▶ [2/3] Extracting SQLite Tables and Inserting into MongoDB Collections...\n');

  // Discover all SQLite tables
  const tables = query("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
  const tableNames = tables.map(t => t.name);

  console.log(`Found ${tableNames.length} tables in SQLite: [${tableNames.join(', ')}]\n`);

  let totalRecords = 0;

  for (const tableName of tableNames) {
    const rows = query(`SELECT * FROM ${tableName}`);
    const col = mongoDb.collection(tableName);

    // Drop previous test data in collection if any
    await col.deleteMany({});

    if (rows.length > 0) {
      // Clean up row objects
      const docs = rows.map(r => {
        const doc = { ...r };
        // Map SQLite id to sqlite_id for cross-referencing integrity
        doc.sqlite_id = r.id;
        return doc;
      });

      const res = await col.insertMany(docs);
      console.log(`  ✓ Collection '${tableName.padEnd(24)}' : ${res.insertedCount.toString().padStart(4)} documents migrated`);
      totalRecords += res.insertedCount;
    } else {
      console.log(`  - Collection '${tableName.padEnd(24)}' :    0 documents (empty table)`);
    }
  }

  console.log(`\n▶ [3/3] Creating Recommended Indexes in MongoDB Collections...\n`);

  try {
    // Indexes on users
    await mongoDb.collection('users').createIndex({ email: 1 }, { unique: true, sparse: true });
    await mongoDb.collection('users').createIndex({ user_code: 1 }, { unique: true, sparse: true });
    await mongoDb.collection('users').createIndex({ sponsor_id: 1 });
    console.log("  ✓ Created indexes on 'users' collection (email, user_code, sponsor_id)");

    // Indexes on wallets
    await mongoDb.collection('wallets').createIndex({ user_id: 1 }, { unique: true, sparse: true });
    console.log("  ✓ Created index on 'wallets' collection (user_id)");

    // Indexes on wallet_transactions
    await mongoDb.collection('wallet_transactions').createIndex({ user_id: 1 });
    await mongoDb.collection('wallet_transactions').createIndex({ transaction_code: 1 }, { unique: true, sparse: true });
    await mongoDb.collection('wallet_transactions').createIndex({ transaction_type: 1 });
    console.log("  ✓ Created indexes on 'wallet_transactions' collection (user_id, transaction_code, transaction_type)");

    // Indexes on investments
    await mongoDb.collection('investments').createIndex({ user_id: 1 });
    await mongoDb.collection('investments').createIndex({ status: 1 });
    console.log("  ✓ Created indexes on 'investments' collection (user_id, status)");

    // Indexes on deposits & withdrawals
    await mongoDb.collection('deposits').createIndex({ user_id: 1 });
    await mongoDb.collection('deposits').createIndex({ status: 1 });
    await mongoDb.collection('withdrawals').createIndex({ user_id: 1 });
    await mongoDb.collection('withdrawals').createIndex({ status: 1 });
    console.log("  ✓ Created indexes on 'deposits' and 'withdrawals' collections");
  } catch (idxErr) {
    console.warn('  ! Index creation notice:', idxErr.message);
  }

  console.log('\n================================================================================');
  console.log(`  MIGRATION COMPLETE! Total ${totalRecords} records successfully stored in MongoDB Atlas`);
  console.log('================================================================================\n');

  await closeMongo();
}

migrateSqliteToMongo().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
