const { MongoClient } = require('mongodb');
require('dotenv').config();

const uri = process.env.MONGODB_URI || 'mongodb+srv://kingstoreprivatelimited_db_user:ySGQwnz6iWPaSIwk@finvora.wmuyvsb.mongodb.net/finvora?retryWrites=true&w=majority&appName=finvora';
const dbName = process.env.MONGODB_DB_NAME || 'finvora';

let client = null;
let db = null;

/**
 * Connect to MongoDB Atlas
 */
async function connectMongo() {
  if (db && client) {
    return db;
  }

  try {
    client = new MongoClient(uri, {
      tls: true,
      maxPoolSize: 20,
      minPoolSize: 1,
      connectTimeoutMS: 5000,
      serverSelectionTimeoutMS: 5000,
    });

    await client.connect();
    db = client.db(dbName);

    // Quick ping verification
    await db.command({ ping: 1 });
    console.log(`[MongoDB] Connected successfully to MongoDB Atlas database: '${dbName}'`);
    return db;
  } catch (error) {
    console.error('[MongoDB] Connection error:', error.message);
    throw error;
  }
}

/**
 * Get active database instance
 */
function getDb() {
  if (!db) {
    throw new Error('[MongoDB] Database not connected. Call connectMongo() first.');
  }
  return db;
}

/**
 * Get specific collection
 */
function getCollection(name) {
  return getDb().collection(name);
}

/**
 * Get auto-increment sequence number for integer IDs
 */
async function getNextSequence(name, startFrom = 1) {
  const database = await connectMongo();
  const counterCol = database.collection('_counters');

  const existing = await counterCol.findOne({ _id: name });
  if (!existing) {
    let maxId = startFrom - 1;
    try {
      const maxDoc = await database.collection(name).find({}).sort({ id: -1, sqlite_id: -1 }).limit(1).toArray();
      if (maxDoc.length > 0) {
        maxId = Math.max(Number(maxDoc[0].id) || 0, Number(maxDoc[0].sqlite_id) || 0, maxId);
      }
    } catch (_) {}
    await counterCol.updateOne(
      { _id: name },
      { $setOnInsert: { seq: maxId } },
      { upsert: true }
    );
  }

  const res = await counterCol.findOneAndUpdate(
    { _id: name },
    { $inc: { seq: 1 } },
    { returnDocument: 'after', upsert: true }
  );

  return res.seq || res.value?.seq || (existing ? existing.seq + 1 : startFrom);
}

/**
 * High-level collection helpers
 */
async function find(collectionName, filter = {}, options = {}) {
  const col = (await connectMongo()).collection(collectionName);
  let cursor = col.find(filter);
  if (options.sort) cursor = cursor.sort(options.sort);
  if (options.skip) cursor = cursor.skip(options.skip);
  if (options.limit) cursor = cursor.limit(options.limit);
  if (options.projection) cursor = cursor.project(options.projection);
  return await cursor.toArray();
}

async function findOne(collectionName, filter = {}, options = {}) {
  const col = (await connectMongo()).collection(collectionName);
  let cursor = col.find(filter);
  if (options.sort) cursor = cursor.sort(options.sort);
  if (options.projection) cursor = cursor.project(options.projection);
  const docs = await cursor.limit(1).toArray();
  return docs[0] || null;
}

async function insertOne(collectionName, doc) {
  const col = (await connectMongo()).collection(collectionName);
  const toInsert = { ...doc };
  if (toInsert.id === undefined) {
    toInsert.id = await getNextSequence(collectionName);
  }
  if (!toInsert.created_at) toInsert.created_at = new Date();
  if (!toInsert.updated_at) toInsert.updated_at = new Date();
  const res = await col.insertOne(toInsert);
  return { ...toInsert, _id: res.insertedId, lastInsertRowid: toInsert.id };
}

async function updateOne(collectionName, filter, updateDoc, options = {}) {
  const col = (await connectMongo()).collection(collectionName);
  const update = updateDoc.$set || updateDoc.$inc ? updateDoc : { $set: { ...updateDoc, updated_at: new Date() } };
  return await col.updateOne(filter, update, options);
}

async function updateMany(collectionName, filter, updateDoc, options = {}) {
  const col = (await connectMongo()).collection(collectionName);
  const update = updateDoc.$set || updateDoc.$inc ? updateDoc : { $set: { ...updateDoc, updated_at: new Date() } };
  return await col.updateMany(filter, update, options);
}

async function deleteOne(collectionName, filter) {
  const col = (await connectMongo()).collection(collectionName);
  return await col.deleteOne(filter);
}

async function deleteMany(collectionName, filter) {
  const col = (await connectMongo()).collection(collectionName);
  return await col.deleteMany(filter);
}

async function count(collectionName, filter = {}) {
  const col = (await connectMongo()).collection(collectionName);
  return await col.countDocuments(filter);
}

async function sum(collectionName, filter = {}, field = 'amount') {
  const col = (await connectMongo()).collection(collectionName);
  const pipeline = [
    { $match: filter },
    { $group: { _id: null, total: { $sum: `$${field}` } } }
  ];
  const res = await col.aggregate(pipeline).toArray();
  return res.length > 0 ? Number(res[0].total) || 0 : 0;
}

/**
 * Close MongoDB connection
 */
async function closeMongo() {
  if (client) {
    await client.close();
    client = null;
    db = null;
    console.log('[MongoDB] Connection closed.');
  }
}

/**
 * Ping MongoDB cluster to check health
 */
async function ping() {
  try {
    const database = await connectMongo();
    await database.command({ ping: 1 });
    return { status: 'healthy', database: dbName };
  } catch (err) {
    return { status: 'unhealthy', error: err.message };
  }
}

/**
 * Initialize indexes and ensure baseline data in MongoDB Atlas
 */
async function initMongo() {
  const database = await connectMongo();

  // Create indexes
  try {
    await database.collection('users').createIndex({ email: 1 }, { unique: true, sparse: true });
    await database.collection('users').createIndex({ username: 1 }, { unique: true, sparse: true });
    await database.collection('users').createIndex({ user_code: 1 }, { unique: true, sparse: true });
    await database.collection('users').createIndex({ id: 1 }, { unique: true, sparse: true });
    await database.collection('users').createIndex({ sponsor_id: 1 });

    await database.collection('wallets').createIndex({ user_id: 1 }, { unique: true });
    await database.collection('wallet_transactions').createIndex({ user_id: 1 });
    await database.collection('wallet_transactions').createIndex({ transaction_code: 1 }, { unique: true, sparse: true });
    await database.collection('investments').createIndex({ user_id: 1 });
    await database.collection('investments').createIndex({ status: 1 });
    await database.collection('deposits').createIndex({ user_id: 1 });
    await database.collection('withdrawals').createIndex({ user_id: 1 });
    await database.collection('mlm_settings').createIndex({ key: 1 }, { unique: true });
    await database.collection('packages').createIndex({ code: 1 }, { unique: true });
  } catch (idxErr) {
    console.warn('[MongoDB] Index initialization notice:', idxErr.message);
  }

  // Ensure Rkadmin exists in MongoDB
  try {
    const bcrypt = require('bcryptjs');
    const rkHash = bcrypt.hashSync('Rkadmin123', 10);
    await database.collection('users').updateOne(
      { username: 'Rkadmin' },
      {
        $set: {
          id: 93,
          sqlite_id: 93,
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
  } catch (_) {}
}

module.exports = {
  connectMongo,
  getDb,
  getCollection,
  col: getCollection,
  getNextSequence,
  find,
  findOne,
  insertOne,
  updateOne,
  updateMany,
  deleteOne,
  deleteMany,
  count,
  sum,
  closeMongo,
  ping,
  initMongo,
  client: () => client
};
