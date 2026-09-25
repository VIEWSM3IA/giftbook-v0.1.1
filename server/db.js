const { Pool, types } = require('pg');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
types.setTypeParser(1082, (value) => value);
types.setTypeParser(20, (value) => Number(value));
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://giftbook@127.0.0.1:55437/giftbook',
  max: 10
});
async function migrate(db = pool) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(719034821)');
    await client.query(await fs.readFile(path.join(__dirname, '../migrations/001_v01.sql'), 'utf8'));
    await client.query(await fs.readFile(path.join(__dirname, '../migrations/002_v011.sql'), 'utf8'));
    await client.query(await fs.readFile(path.join(__dirname, '../migrations/003_v02.sql'), 'utf8'));
    await client.query(await fs.readFile(path.join(__dirname, '../migrations/004_v02_frozen.sql'), 'utf8'));
    for (const [index, name] of require('../miniprogram/utils/domain').TAGS.entries()) {
      await client.query(
        'INSERT INTO tags(id,code,name,sort_order) VALUES($1,$2,$3,$4) ON CONFLICT(name) DO NOTHING',
        [randomUUID(), `tag_${index}`, name, index]
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
module.exports = { pool, migrate };
if (require.main === module)
  migrate()
    .then(() => pool.end())
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
      pool.end();
    });
