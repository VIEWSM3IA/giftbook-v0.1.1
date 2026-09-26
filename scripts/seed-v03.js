const { randomUUID } = require('node:crypto');
const { pool, migrate } = require('../server/db');
const cases = require('../data/seed_cases_v03.json');

async function importSeed(db = pool, env = process.env) {
  if (env.NODE_ENV === 'production' && env.ALLOW_INTERNAL_MOCK_IMPORT !== 'true')
    throw new Error('Production internal_mock import requires ALLOW_INTERNAL_MOCK_IMPORT=true');
  if (cases.length !== 120 || cases.some((item) => item.source_type !== 'internal_mock') ||
      new Set(cases.map((item) => item.seed_key)).size !== cases.length)
    throw new Error('V0.3 seed batch is incomplete or invalid');
  await migrate(db);
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    for (const item of cases) {
      await client.query(
        `INSERT INTO public_cases(id,seed_key,source_type,gift_name,relation_type,age_range,occasion,price_range,wanted_level,reaction_level,behavior_evidence,experience,status)
         VALUES($1,$2,'internal_mock',$3,$4,$5,$6,$7,$8,$9,$10,$11,'published')
         ON CONFLICT(seed_key) WHERE seed_key IS NOT NULL DO UPDATE SET
           gift_name=EXCLUDED.gift_name,relation_type=EXCLUDED.relation_type,age_range=EXCLUDED.age_range,
           occasion=EXCLUDED.occasion,price_range=EXCLUDED.price_range,wanted_level=EXCLUDED.wanted_level,
           reaction_level=EXCLUDED.reaction_level,behavior_evidence=EXCLUDED.behavior_evidence,
           experience=EXCLUDED.experience`,
        [randomUUID(), item.seed_key, item.gift_name, item.relation_type, item.age_range, item.occasion,
          item.price_range, item.wanted_level, item.reaction_level, item.behavior_evidence, item.experience]
      );
    }
    const count = Number((await client.query("SELECT count(*) AS count FROM public_cases WHERE seed_key LIKE 'v03_mock_%'")).rows[0].count);
    await client.query('COMMIT');
    return count;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}
if (require.main === module)
  importSeed().then((count) => console.log(`V0.3 internal_mock cases: ${count}`))
    .catch((error) => { console.error(error.message); process.exitCode = 1; })
    .finally(() => pool.end());
module.exports = { importSeed };
