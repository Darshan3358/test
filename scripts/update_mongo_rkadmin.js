const { connectMongo } = require('../src/database/mongo');
const bcrypt = require('bcryptjs');
require('dotenv').config();

async function updateMongoRkadmin() {
  console.log('[MongoDB Update] Connecting to MongoDB Atlas...');
  try {
    const db = await connectMongo();
    const usersCol = db.collection('users');
    const rkHash = bcrypt.hashSync('Rkadmin123', 10);

    const result = await usersCol.updateOne(
      { username: 'Rkadmin' },
      {
        $set: {
          user_code: 'RKADMIN',
          full_name: 'FINVORA Master Admin (RK)',
          username: 'Rkadmin',
          email: 'rkadmin@finvora.com',
          mobile: '+18005550199',
          password_hash: rkHash,
          role: 'ADMIN',
          user_type: 'WORKING',
          status: 'ACTIVE',
          country: 'United States',
          updated_at: new Date()
        },
        $setOnInsert: {
          created_at: new Date()
        }
      },
      { upsert: true }
    );

    console.log('[MongoDB Update] Upsert result for Rkadmin:', result);

    // Also update wallet for Rkadmin
    const walletsCol = db.collection('wallets');
    await walletsCol.updateOne(
      { user_code: 'RKADMIN' },
      {
        $set: {
          main_balance: 50000.0,
          user_code: 'RKADMIN',
          updated_at: new Date()
        }
      },
      { upsert: true }
    );

    console.log('[MongoDB Update] ✓ Successfully updated Rkadmin credentials and wallet in MongoDB Atlas.');
  } catch (error) {
    console.warn('[MongoDB Update] Notice during direct MongoDB update:', error.message);
  }
}

if (require.main === module) {
  updateMongoRkadmin().then(() => process.exit(0)).catch(() => process.exit(0));
}

module.exports = { updateMongoRkadmin };
