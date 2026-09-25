const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID, randomBytes } = require('node:crypto');
const { Pool } = require('pg');
const { migrate } = require('../server/db');

test('V0.1 records survive V0.1.1 migration with stable recipient order', async (t) => {
  const connectionString = process.env.DATABASE_URL || 'postgresql://giftbook@127.0.0.1:55437/giftbook';
  const admin = new Pool({ connectionString });
  const schema = 'test_migration_' + randomBytes(8).toString('hex');
  await admin.query('CREATE SCHEMA ' + schema);
  const pool = new Pool({ connectionString, options: '-c search_path=' + schema });
  t.after(async () => {
    await pool.end();
    await admin.query('DROP SCHEMA ' + schema + ' CASCADE');
    await admin.end();
  });
  await pool.query(await fs.readFile(path.join(__dirname, '../migrations/001_v01.sql'), 'utf8'));
  const userId = randomUUID(), olderId = randomUUID(), newerId = randomUUID(), giftId = randomUUID();
  await pool.query('INSERT INTO users(id) VALUES($1)', [userId]);
  await pool.query("INSERT INTO recipients(id,user_id,display_name,relation_type,created_at) VALUES($1,$3,'Rose','恋人','2025-01-01'),($2,$3,'妈妈','家人','2026-01-01')", [olderId, newerId, userId]);
  await pool.query("INSERT INTO gift_records(id,user_id,recipient_id,request_id,request_hash,gift_name,reaction_level,gifted_at) VALUES($1,$2,$3,$4,'test','拍立得',4,'2025-09-12')", [giftId, userId, olderId, randomUUID()]);
  await migrate(pool);
  assert.deepEqual((await pool.query('SELECT id FROM recipients WHERE user_id=$1 ORDER BY sort_order', [userId])).rows.map((row) => row.id), [newerId, olderId]);
  assert.equal((await pool.query('SELECT gift_name FROM gift_records WHERE id=$1', [giftId])).rows[0].gift_name, '拍立得');
  await pool.query('UPDATE recipients SET sort_order=0 WHERE id=$1', [olderId]);
  await migrate(pool);
  assert.equal((await pool.query('SELECT sort_order FROM recipients WHERE id=$1', [olderId])).rows[0].sort_order, 0);
});
