/**
 * FINVORA — Pure MongoDB Atlas Database Layer
 * 100% SQLite-Free. Backed exclusively by MongoDB Atlas cluster.
 */

const mongo = require('./mongo');

const {
  connectMongo,
  getDb,
  getCollection,
  col,
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
  ping,
  initMongo
} = mongo;

/**
 * Initialize database schema & indexes
 */
async function initSchema() {
  await initMongo();
}

/**
 * Parses SQL conditions like "user_id = ? AND status = ?" with params into MongoDB filter object
 */
function parseWhereClause(whereStr, params, paramIndexRef) {
  if (!whereStr || !whereStr.trim()) return {};
  const filter = {};
  const orConditions = [];

  // Check for login pattern: (LOWER(username) = LOWER(?) OR LOWER(email) = LOWER(?) OR UPPER(user_code) = UPPER(?))
  if (whereStr.includes('LOWER(username)') && whereStr.includes('LOWER(email)')) {
    const p1 = params[paramIndexRef.idx++];
    const p2 = params[paramIndexRef.idx++];
    const p3 = whereStr.includes('user_code') ? params[paramIndexRef.idx++] : p1;
    return {
      $and: [
        {
          $or: [
            { username: new RegExp(`^${p1}$`, 'i') },
            { email: new RegExp(`^${p2}$`, 'i') },
            { user_code: new RegExp(`^${p3}$`, 'i') }
          ]
        },
        { status: { $ne: 'DELETED' } }
      ]
    };
  }

  // Split by AND
  const parts = whereStr.split(/\s+AND\s+/i);
  for (const part of parts) {
    const p = part.trim();
    if (!p) continue;

    // e.g. "status != 'DELETED'"
    const notEqLiteral = p.match(/^([a-zA-Z0-9_]+)\s*!=\s*['"]([^'"]+)['"]$/i);
    if (notEqLiteral) {
      filter[notEqLiteral[1]] = { $ne: notEqLiteral[2] };
      continue;
    }

    // e.g. "status = 'ACTIVE'"
    const eqLiteral = p.match(/^([a-zA-Z0-9_]+)\s*=\s*['"]([^'"]+)['"]$/i);
    if (eqLiteral) {
      filter[eqLiteral[1]] = eqLiteral[2];
      continue;
    }

    // e.g. "key IN ('min_withdrawal', 'max_withdrawal')"
    const inLiteral = p.match(/^([a-zA-Z0-9_]+)\s+IN\s*\(([^)]+)\)$/i);
    if (inLiteral) {
      const items = inLiteral[2].split(',').map(s => s.trim().replace(/^['"]|['"]$/g, ''));
      filter[inLiteral[1]] = { $in: items };
      continue;
    }

    // e.g. "field = ?"
    const eqParam = p.match(/^([a-zA-Z0-9_.]+)\s*=\s*\?$/i);
    if (eqParam) {
      let colName = eqParam[1].replace(/^[a-zA-Z0-9_]+\./, ''); // remove alias like u.id -> id
      const val = params[paramIndexRef.idx++];
      if (colName === 'id' || colName === 'user_id' || colName === 'sponsor_id') {
        const numVal = Number(val);
        if (!isNaN(numVal)) {
          if (colName === 'id') {
            filter.$or = [{ id: numVal }, { sqlite_id: numVal }];
          } else {
            filter[colName] = numVal;
          }
        } else {
          filter[colName] = val;
        }
      } else {
        filter[colName] = val;
      }
      continue;
    }

    // e.g. "LOWER(field) = LOWER(?)"
    const lowerParam = p.match(/^LOWER\(([a-zA-Z0-9_]+)\)\s*=\s*(?:LOWER\(\?\)|LOWER\((.*?)\)|\?)$/i);
    if (lowerParam) {
      const colName = lowerParam[1];
      const val = params[paramIndexRef.idx++];
      filter[colName] = new RegExp(`^${val}$`, 'i');
      continue;
    }

    // e.g. "UPPER(field) = UPPER(?)"
    const upperParam = p.match(/^UPPER\(([a-zA-Z0-9_]+)\)\s*=\s*(?:UPPER\(\?\)|UPPER\((.*?)\)|\?)$/i);
    if (upperParam) {
      const colName = upperParam[1];
      const val = params[paramIndexRef.idx++];
      filter[colName] = new RegExp(`^${val}$`, 'i');
      continue;
    }

    // e.g. "field != ?"
    const notEqParam = p.match(/^([a-zA-Z0-9_]+)\s*!=\s*\?$/i);
    if (notEqParam) {
      const val = params[paramIndexRef.idx++];
      filter[notEqParam[1]] = { $ne: val };
      continue;
    }

    // e.g. "field > ?"
    const gtParam = p.match(/^([a-zA-Z0-9_]+)\s*>\s*\?$/i);
    if (gtParam) {
      const val = Number(params[paramIndexRef.idx++]);
      filter[gtParam[1]] = { $gt: val };
      continue;
    }

    // e.g. "field <= ?"
    const lteParam = p.match(/^([a-zA-Z0-9_]+)\s*<=\s*\?$/i);
    if (lteParam) {
      const val = Number(params[paramIndexRef.idx++]);
      filter[lteParam[1]] = { $lte: val };
      continue;
    }
  }

  return filter;
}

/**
 * Execute a SQL query directly on MongoDB Atlas
 */
async function query(sql, params = []) {
  const database = await connectMongo();
  const trimmed = sql.trim().replace(/\s+/g, ' ');

  // 1. SELECT COUNT(*) as count FROM <table> [WHERE ...]
  const countMatch = trimmed.match(/^SELECT\s+COUNT\([^)]*\)\s+(?:as\s+count\s+)?FROM\s+([a-zA-Z0-9_]+)(?:\s+WHERE\s+(.*?))?$/i);
  if (countMatch) {
    const table = countMatch[1];
    const whereClause = countMatch[2];
    const filter = whereClause ? parseWhereClause(whereClause, params, { idx: 0 }) : {};
    const c = await database.collection(table).countDocuments(filter);
    return [{ count: c }];
  }

  // 2. SELECT COALESCE(SUM(field), 0) as alias FROM <table> [WHERE ...]
  const sumMatch = trimmed.match(/^SELECT\s+COALESCE\(SUM\(([a-zA-Z0-9_]+)\),\s*0\)\s+(?:as\s+([a-zA-Z0-9_]+)\s+)?FROM\s+([a-zA-Z0-9_]+)(?:\s+WHERE\s+(.*?))?$/i);
  if (sumMatch) {
    const field = sumMatch[1];
    const alias = sumMatch[2] || 'total';
    const table = sumMatch[3];
    const whereClause = sumMatch[4];
    const filter = whereClause ? parseWhereClause(whereClause, params, { idx: 0 }) : {};
    const total = await sum(table, filter, field);
    return [{ [alias]: total }];
  }

  // 3. SELECT ... FROM <table> [WHERE ...] [ORDER BY ...] [LIMIT ...] [OFFSET ...]
  const selectMatch = trimmed.match(/^SELECT\s+(.*?)\s+FROM\s+([a-zA-Z0-9_]+)(?:\s+([a-zA-Z0-9_]+))?(?:\s+(?:JOIN|LEFT JOIN|INNER JOIN)\s+([a-zA-Z0-9_]+)\s+.*?)?(?:\s+WHERE\s+(.*?))?(?:\s+ORDER\s+BY\s+(.*?))?(?:\s+LIMIT\s+(\?|[0-9]+))?(?:\s+OFFSET\s+(\?|[0-9]+))?$/i);
  if (selectMatch) {
    const fieldsStr = selectMatch[1];
    const table = selectMatch[2];
    const joinTable = selectMatch[4];
    const whereClause = selectMatch[5];
    const orderBy = selectMatch[6];
    const limitRaw = selectMatch[7];
    const offsetRaw = selectMatch[8];

    const paramIndexRef = { idx: 0 };
    const filter = whereClause ? parseWhereClause(whereClause, params, paramIndexRef) : {};

    let limit = null;
    if (limitRaw) {
      limit = limitRaw === '?' ? Number(params[paramIndexRef.idx++]) : parseInt(limitRaw, 10);
    }
    let offset = 0;
    if (offsetRaw) {
      offset = offsetRaw === '?' ? Number(params[paramIndexRef.idx++]) : parseInt(offsetRaw, 10);
    }

    let sort = null;
    if (orderBy) {
      sort = {};
      const orderParts = orderBy.split(',');
      for (const op of orderParts) {
        const [field, dir] = op.trim().split(/\s+/);
        const cleanField = field.replace(/^[a-zA-Z0-9_]+\./, '');
        sort[cleanField] = dir && dir.toUpperCase() === 'ASC' ? 1 : -1;
      }
    }

    // Check if JOIN is needed
    if (joinTable) {
      const pipeline = [{ $match: filter }];
      if (table === 'investments' && joinTable === 'users') {
        pipeline.push(
          { $lookup: { from: 'users', localField: 'user_id', foreignField: 'id', as: 'user' } },
          { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
          {
            $addFields: {
              username: '$user.username',
              user_code: '$user.user_code',
              user_status: '$user.status',
              user_type: '$user.user_type'
            }
          }
        );
      } else if (table === 'user_salary_levels' && joinTable === 'salary_targets') {
        pipeline.push(
          { $lookup: { from: 'salary_targets', localField: 'target_id', foreignField: 'id', as: 'st' } },
          { $unwind: { path: '$st', preserveNullAndEmptyArrays: true } },
          { $addFields: { required_direct_business: '$st.required_direct_business' } }
        );
      } else if (table === 'deposits' && joinTable === 'users') {
        pipeline.push(
          { $lookup: { from: 'users', localField: 'user_id', foreignField: 'id', as: 'user' } },
          { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
          { $addFields: { username: '$user.username', email: '$user.email', user_code: '$user.user_code' } }
        );
      } else if (table === 'withdrawals' && joinTable === 'users') {
        pipeline.push(
          { $lookup: { from: 'users', localField: 'user_id', foreignField: 'id', as: 'user' } },
          { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
          { $addFields: { username: '$user.username', email: '$user.email', user_code: '$user.user_code' } }
        );
      }

      if (sort) pipeline.push({ $sort: sort });
      if (offset > 0) pipeline.push({ $skip: offset });
      if (limit) pipeline.push({ $limit: limit });

      const docs = await database.collection(table).aggregate(pipeline).toArray();
      return docs.map(d => {
        d.id = d.id !== undefined ? d.id : d.sqlite_id;
        return d;
      });
    }

    let cursor = database.collection(table).find(filter);
    if (sort) cursor = cursor.sort(sort);
    if (offset > 0) cursor = cursor.skip(offset);
    if (limit) cursor = cursor.limit(limit);

    const docs = await cursor.toArray();
    return docs.map(d => {
      d.id = d.id !== undefined ? d.id : d.sqlite_id;
      return d;
    });
  }

  // Fallback: try querying directly if simple table query
  try {
    const words = trimmed.split(' ');
    const fromIdx = words.findIndex(w => w.toUpperCase() === 'FROM');
    if (fromIdx !== -1 && words[fromIdx + 1]) {
      const table = words[fromIdx + 1].replace(/[^a-zA-Z0-9_]/g, '');
      const docs = await database.collection(table).find({}).toArray();
      return docs.map(d => {
        d.id = d.id !== undefined ? d.id : d.sqlite_id;
        return d;
      });
    }
  } catch (_) {}

  return [];
}

/**
 * Execute query and return single row
 */
async function get(sql, params = []) {
  const results = await query(sql, params);
  return results && results.length > 0 ? results[0] : null;
}

/**
 * Execute INSERT, UPDATE, DELETE directly on MongoDB Atlas
 */
async function run(sql, params = []) {
  const database = await connectMongo();
  const trimmed = sql.trim().replace(/\s+/g, ' ');

  // 1. INSERT INTO <table> (<cols>) VALUES (<placeholders>)
  const insertMatch = trimmed.match(/^INSERT\s+(?:OR\s+IGNORE\s+)?INTO\s+([a-zA-Z0-9_]+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)(?:\s+ON\s+CONFLICT.*)?$/i);
  if (insertMatch) {
    const table = insertMatch[1];
    const cols = insertMatch[2].split(',').map(c => c.trim().replace(/['"`]/g, ''));
    const doc = {};
    let paramIdx = 0;

    for (let i = 0; i < cols.length; i++) {
      const colName = cols[i];
      if (paramIdx < params.length) {
        doc[colName] = params[paramIdx++];
      }
    }

    if (doc.id === undefined) {
      doc.id = await getNextSequence(table);
      doc.sqlite_id = doc.id;
    }
    if (!doc.created_at) doc.created_at = new Date();
    if (!doc.updated_at) doc.updated_at = new Date();

    // Handle ON CONFLICT for level_unlocks or user_profiles
    if (trimmed.includes('ON CONFLICT')) {
      const uniqueKey = table === 'level_unlocks' || table === 'wallets' || table === 'user_profiles' || table === 'user_security' ? 'user_id' : 'id';
      const filter = { [uniqueKey]: doc[uniqueKey] };
      const res = await database.collection(table).updateOne(filter, { $set: doc }, { upsert: true });
      return { lastInsertRowid: doc.id, changes: res.modifiedCount || res.upsertedCount ? 1 : 0 };
    }

    const res = await database.collection(table).insertOne(doc);
    return { lastInsertRowid: doc.id, changes: 1, insertedId: res.insertedId };
  }

  // 2. UPDATE <table> SET <assignments> WHERE <condition>
  const updateMatch = trimmed.match(/^UPDATE\s+([a-zA-Z0-9_]+)\s+SET\s+(.*?)\s+WHERE\s+(.*?)$/i);
  if (updateMatch) {
    const table = updateMatch[1];
    const setStr = updateMatch[2];
    const whereStr = updateMatch[3];

    const paramIndexRef = { idx: 0 };
    const setParts = setStr.split(',');
    const updateDoc = {};

    for (const sp of setParts) {
      const assign = sp.trim().match(/^([a-zA-Z0-9_]+)\s*=\s*(.*?)$/);
      if (assign) {
        const colName = assign[1];
        const valExpr = assign[2];
        if (valExpr === '?') {
          updateDoc[colName] = params[paramIndexRef.idx++];
        } else if (valExpr.toUpperCase() === 'CURRENT_TIMESTAMP' || valExpr.toUpperCase() === "DATETIME('NOW')") {
          updateDoc[colName] = new Date();
        } else if (valExpr.includes('+')) {
          // e.g. total_withdrawn = total_withdrawn + ?
          const incVal = Number(params[paramIndexRef.idx++]);
          updateDoc[colName] = { $inc: incVal };
        } else {
          // literal string or number
          updateDoc[colName] = valExpr.replace(/^['"]|['"]$/g, '');
        }
      }
    }

    const filter = parseWhereClause(whereStr, params, paramIndexRef);

    const normalSets = {};
    const incs = {};
    for (const [k, v] of Object.entries(updateDoc)) {
      if (v && typeof v === 'object' && v.$inc !== undefined) {
        incs[k] = v.$inc;
      } else {
        normalSets[k] = v;
      }
    }

    normalSets.updated_at = new Date();
    const finalUpdate = { $set: normalSets };
    if (Object.keys(incs).length > 0) {
      finalUpdate.$inc = incs;
    }

    const res = await database.collection(table).updateMany(filter, finalUpdate);
    return { changes: res.modifiedCount };
  }

  // 3. DELETE FROM <table> WHERE <condition>
  const deleteMatch = trimmed.match(/^DELETE\s+FROM\s+([a-zA-Z0-9_]+)(?:\s+WHERE\s+(.*?))?$/i);
  if (deleteMatch) {
    const table = deleteMatch[1];
    const whereStr = deleteMatch[2];
    const filter = whereStr ? parseWhereClause(whereStr, params, { idx: 0 }) : {};
    const res = await database.collection(table).deleteMany(filter);
    return { changes: res.deletedCount };
  }

  return { changes: 0 };
}

/**
 * Transaction wrapper (direct execution on MongoDB)
 */
async function transaction(callback) {
  return await callback(getDb());
}

module.exports = {
  ...mongo,
  initSchema,
  query,
  get,
  run,
  transaction,
  db: {
    prepare: (sql) => ({
      get: (...args) => get(sql, args),
      all: (...args) => query(sql, args),
      run: (...args) => run(sql, args)
    })
  }
};
