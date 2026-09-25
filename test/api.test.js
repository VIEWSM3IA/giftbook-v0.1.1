const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { randomUUID, randomBytes } = require('node:crypto');
const { Pool } = require('pg');
const { migrate } = require('../server/db');
const { createApi } = require('../server/app');
const domain = require('../miniprogram/utils/domain');

test('PostgreSQL API: CRUD, ownership, concurrent idempotency, privacy and account lifecycle', async (t) => {
  const connectionString = process.env.DATABASE_URL || 'postgresql://giftbook@127.0.0.1:55437/giftbook';
  const admin = new Pool({ connectionString });
  const schema = `test_${randomBytes(8).toString('hex')}`;
  await admin.query(`CREATE SCHEMA ${schema}`);
  const pool = new Pool({ connectionString, options: `-c search_path=${schema}` });
  const logs = [];
  const env = { NODE_ENV: 'development', ALLOW_LOCAL_LOGIN: 'true' };
  let wxResult = {
    openid: 'test-only-openid',
    session_key: 'NEVER_EXPOSE_SESSION_KEY',
    unionid: 'test-only-unionid'
  };
  const handler = createApi({
    pool,
    env,
    log: (entry) => logs.push(entry),
    fetch: async (url) => {
      assert.equal(url.origin, 'https://api.weixin.qq.com');
      assert.equal(url.pathname, '/sns/jscode2session');
      assert.equal(url.searchParams.get('grant_type'), 'authorization_code');
      assert.equal(url.searchParams.get('js_code'), 'test-code');
      return { ok: true, json: async () => wxResult };
    }
  });
  const server = http.createServer(async (req, res) => {
    if (!(await handler(req, res))) {
      res.statusCode = 404;
      res.end();
    }
  });
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await pool.end();
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  });
  await migrate(pool);
  await migrate(pool);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  async function request(method, path, input, token, status = 200) {
    const response = await fetch(base + path, {
      method,
      headers: {
        ...(input ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: input ? JSON.stringify(input) : undefined
    });
    const result = await response.json();
    assert.equal(response.status, status, JSON.stringify(result));
    assert.match(result.request_id, /^[a-f0-9-]{36}$/);
    return result.data ?? result;
  }
  const malformed = await new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: '127.0.0.1', port: server.address().port, path: '//[', method: 'GET' },
      (response) => {
        let raw = '';
        response.on('data', (chunk) => (raw += chunk));
        response.on('end', () => resolve({ status: response.statusCode, body: JSON.parse(raw) }));
      }
    );
    req.on('error', reject);
    req.end();
  });
  assert.equal(malformed.status, 400);
  assert.equal(malformed.body.error.code, 'INVALID_URL');
  assert.match(malformed.body.request_id, /^[a-f0-9-]{36}$/);
  const key = randomBytes(32).toString('hex');
  assert.deepEqual(await request('GET', '/v1/config'), { local_login: true });
  await request('POST', '/v1/auth/local/login', { device_key: 'guessable' }, null, 400);
  const [a, a2] = await Promise.all([
    request('POST', '/v1/auth/local/login', { device_key: key }),
    request('POST', '/v1/auth/local/login', { device_key: key })
  ]);
  assert.equal(a.user.id, a2.user.id);
  const b = await request('POST', '/v1/auth/local/login', { device_key: randomBytes(32).toString('hex') });
  assert.notEqual(a.user.id, b.user.id);
  await request('GET', '/v1/home', null, null, 401);
  await request('POST', '/v1/auth/wechat/login', { code: 'test' }, null, 503);
  assert.equal((await request('GET', '/v1/tags', null, a.token)).length, domain.TAGS.length);
  let home = await request('GET', '/v1/home', null, a.token);
  assert.equal(home.stats.recipients, 0);
  assert.deepEqual(home.recent_gifts, []);
  await request('POST', '/v1/recipients', { display_name: '虚构' }, a.token, 400);
  let r = await request(
    'POST',
    '/v1/recipients',
    { display_name: '虚构甲', relation_type: '朋友', tags: [domain.TAGS[0]], user_id: b.user.id },
    a.token
  );
  assert.deepEqual(r.tags, [domain.TAGS[0]]);
  assert.equal(r.user_id, undefined);
  for (const method of ['GET', 'PATCH', 'DELETE'])
    await request(
      method,
      `/v1/recipients/${r.id}`,
      method === 'PATCH' ? { display_name: '攻击' } : null,
      b.token,
      404
    );
  r = await request(
    'PATCH',
    `/v1/recipients/${r.id}`,
    { display_name: '虚构乙', tags: [domain.TAGS[1]] },
    a.token
  );
  assert.equal(r.display_name, '虚构乙');
  assert.deepEqual(r.tags, [domain.TAGS[1]]);
  const payload = {
    recipient_id: r.id,
    gift_name: '虚构礼物',
    reaction_level: 4,
    gifted_at: '2020-01-01',
    price_fen: 12345,
    request_id: randomUUID(),
    note: '不可进入日志的备注'
  };
  for (const fields of [
    { reaction_level: 0 },
    { price_fen: -1 },
    { gifted_at: '2099-01-01' },
    { gift_name: '字'.repeat(61) },
    { gifted_at: '2024-02-30' },
    { reaction_level: '4' }
  ])
    await request('POST', '/v1/gifts', { ...payload, ...fields }, a.token, 400);
  await request('POST', '/v1/gifts', payload, b.token, 404);
  const repeats = await Promise.all(
    Array.from({ length: 8 }, () => request('POST', '/v1/gifts', payload, a.token))
  );
  assert.equal(logs.filter((entry) => entry.event === 'gift_created').length, 1);
  const g = repeats[0];
  assert.ok(repeats.every((row) => row.id === g.id));
  assert.equal(g.price_fen, 12345);
  assert.equal(g.request_hash, undefined);
  assert.equal((await request('GET', '/v1/me', null, a.token)).stats.gifts, 1);
  await request('POST', '/v1/gifts', { ...payload, gift_name: '不同内容' }, a.token, 409);
  for (const method of ['GET', 'PATCH', 'DELETE'])
    await request(
      method,
      `/v1/gifts/${g.id}`,
      method === 'PATCH' ? { gift_name: '攻击' } : null,
      b.token,
      404
    );
  assert.equal(
    (await request('PATCH', `/v1/gifts/${g.id}`, { reaction_level: 5 }, a.token)).reaction_level,
    5
  );
  for (let i = 0; i < 6; i++)
    await request(
      'POST',
      '/v1/gifts',
      { ...payload, gift_name: `虚构礼物${i}`, request_id: randomUUID() },
      a.token
    );
  home = await request('GET', '/v1/home', null, a.token);
  assert.equal(home.recent_gifts.length, 5);
  assert.equal(home.stats.gifts, 7);
  await request('GET', `/v1/recipients/${r.id}`, null, a.token);
  assert.deepEqual(logs.at(-1), { event: 'recipient_viewed', properties: { gift_count_bucket: '6-20' } });
  const olderRecipient = await request(
    'POST',
    '/v1/recipients',
    { display_name: '虚构旧记录', relation_type: '朋友' },
    a.token
  );
  assert.deepEqual((await request('GET', '/v1/recipients', null, a.token)).map((person) => person.id), [r.id, olderRecipient.id]);
  await request('PATCH', '/v1/recipients/order', { recipient_ids: [olderRecipient.id, r.id] }, a.token);
  assert.deepEqual((await request('GET', '/v1/recipients', null, a.token)).map((person) => person.id), [olderRecipient.id, r.id]);
  await request('PATCH', '/v1/recipients/order', { recipient_ids: [r.id, r.id] }, a.token, 400);
  await request('PATCH', '/v1/recipients/order', { recipient_ids: [r.id] }, a.token, 400);
  await request('PATCH', '/v1/recipients/order', { recipient_ids: [olderRecipient.id, r.id] }, b.token, 400);
  await request('PATCH', '/v1/me/active-recipient', { recipient_id: olderRecipient.id }, b.token, 404);
  await request('PATCH', '/v1/me/active-recipient', { recipient_id: olderRecipient.id }, a.token);
  assert.equal((await request('GET', '/v1/me', null, a.token)).user.last_active_recipient_id, olderRecipient.id);
  await request('GET', `/v1/recipients/${olderRecipient.id}`, null, a.token);
  assert.deepEqual(logs.at(-1), { event: 'recipient_viewed', properties: { gift_count_bucket: '0' } });
  const olderGift = await request(
    'POST',
    '/v1/gifts',
    { ...payload, recipient_id: olderRecipient.id, gifted_at: '2010-01-01', request_id: randomUUID() },
    a.token
  );
  const oldestGift = await request(
    'POST',
    '/v1/gifts',
    { ...payload, recipient_id: olderRecipient.id, gifted_at: '2009-01-01', request_id: randomUUID() },
    a.token
  );
  const expandedHome = await request('GET', '/v1/home', null, a.token);
  assert.equal(expandedHome.recent_gifts.length, 5);
  assert.ok(expandedHome.recent_gifts.every((item) => item.recipient_id === r.id));
  const latest = expandedHome.recipients.find((item) => item.id === olderRecipient.id).latest_gift;
  assert.equal(latest.id, olderGift.id);
  assert.equal(latest.user_id, undefined);
  assert.equal(latest.request_hash, undefined);
  assert.equal(latest.request_id, undefined);
  assert.equal(
    (await request('GET', '/v1/recipients', null, a.token)).find((item) => item.id === olderRecipient.id)
      .latest_gift.id,
    olderGift.id
  );
  await request('DELETE', `/v1/gifts/${olderGift.id}`, null, a.token);
  assert.equal(
    (await request('GET', '/v1/home', null, a.token)).recipients.find((item) => item.id === olderRecipient.id)
      .latest_gift.id,
    oldestGift.id
  );
  await request('DELETE', `/v1/recipients/${olderRecipient.id}`, null, a.token);
  assert.equal((await request('GET', '/v1/me', null, a.token)).user.last_active_recipient_id, null);
  const ids = [];
  let cursor = null;
  do {
    const page = await request(
      'GET',
      `/v1/recipients/${r.id}/gifts?limit=2${cursor ? '&cursor=' + encodeURIComponent(cursor) : ''}`,
      null,
      a.token
    );
    ids.push(...page.items.map((item) => item.id));
    cursor = page.next_cursor;
  } while (cursor);
  assert.equal(ids.length, 7);
  assert.equal(new Set(ids).size, 7);
  await request('GET', `/v1/recipients/${r.id}/gifts?cursor=invalid`, null, a.token, 400);
  await request('GET', `/v1/recipients/${r.id}/gifts?limit=0`, null, a.token, 400);
  const caseInput = {
    source_gift_id: g.id, relation_type: '朋友', age_range: '26–30', occasion: '生日',
    price_range: '100–299', wanted_level: '没提过', reaction_level: 5,
    gift_name: '公开相机', behavior_evidence: ['used_immediately'], experience: '先问清使用习惯'
  };
  await request('POST', '/v1/cases', caseInput, b.token, 404);
  await request('POST', '/v1/cases', { ...caseInput, gift_name: '微信号 abc123' }, a.token, 400);
  for (const unsafeName of ['微 信：abc123', '微​信 abcd1234', 'QQ：123456789', '138-0012-3456', '@zhangsan', 'a@example.com', 'https://example.com', '北京市朝阳区某路1号', '上海市静安区南京西路100弄2栋301室', '虚构乙'])
    await request('POST', '/v1/cases', { ...caseInput, gift_name: unsafeName }, a.token, 400);
  for (const evidence of [[], ['legacy_observed'], ['used_immediately', 'used_immediately'], ['unknown']])
    await request('POST', '/v1/cases', { ...caseInput, behavior_evidence: evidence }, a.token, 400);
  await request('POST', '/v1/cases', { ...caseInput, experience: '虚构乙很开心' }, a.token, 400);
  const shared = await request('POST', '/v1/cases', caseInput, a.token);
  assert.equal(shared.status, 'published');
  await request('POST', '/v1/cases', caseInput, a.token, 409);
  const publicCase = await request('GET', `/v1/cases/${shared.id}`, null, b.token);
  assert.equal(publicCase.gift_name, '公开相机');
  assert.deepEqual(publicCase.behavior_evidence, ['used_immediately']);
  assert.equal(publicCase.behavior_legacy, undefined);
  assert.equal((await request('GET', `/v1/gifts/${g.id}`, null, a.token)).share_state, 'published');
  assert.equal(publicCase.source_gift_id, undefined);
  assert.equal(publicCase.owner_id, undefined);
  for (const privateField of ['recipient_id', 'display_name', 'recipient_note', 'gift_note', 'price_fen', 'tags', 'gender', 'behavior_legacy'])
    assert.equal(publicCase[privateField], undefined);
  assert.equal(publicCase.is_mine, false);
  assert.equal((await request('GET', `/v1/cases/${shared.id}`, null, a.token)).is_mine, true);
  assert.ok(!JSON.stringify(publicCase).includes('不可进入日志的备注'));
  assert.equal((await request('GET', '/v1/cases?relation_type=朋友&price_range=100%E2%80%93299', null, b.token)).items.length, 1);
  assert.equal((await request('GET', '/v1/cases?relation_type=家人', null, b.token)).items.length, 0);
  await request('GET', '/v1/cases?relation_type=无效', null, b.token, 400);
  await request('POST', `/v1/cases/${shared.id}/helpful`, {}, a.token, 400);
  assert.equal((await request('POST', `/v1/cases/${shared.id}/helpful`, {}, b.token)).helpful_count, 1);
  assert.equal((await request('POST', `/v1/cases/${shared.id}/helpful`, {}, b.token)).helpful_count, 1);
  const voter = await request('POST', '/v1/auth/local/login', { device_key: randomBytes(32).toString('hex') });
  assert.equal((await request('POST', `/v1/cases/${shared.id}/helpful`, {}, voter.token)).helpful_count, 2);
  await request('DELETE', '/v1/me', null, voter.token);
  assert.equal((await request('GET', `/v1/cases/${shared.id}`, null, b.token)).helpful_count, 1);
  assert.equal((await request('GET', `/v1/cases/${shared.id}`, null, b.token)).helped, true);
  await request('PATCH', `/v1/cases/${shared.id}`, { ...caseInput, experience: '攻击' }, b.token, 404);
  await request('DELETE', `/v1/cases/${shared.id}`, null, b.token, 404);
  await request('PATCH', `/v1/recipients/${r.id}`, { display_name: '改名', relation_type: '家人' }, a.token);
  assert.equal((await request('GET', `/v1/cases/${shared.id}`, null, b.token)).relation_type, '朋友');
  assert.equal((await request('GET', `/v1/cases/${shared.id}`, null, b.token)).gift_name, '公开相机');
  await request('PATCH', `/v1/cases/${shared.id}`, { ...caseInput, experience: '新的经验' }, a.token);
  assert.equal((await request('GET', `/v1/cases/${shared.id}`, null, b.token)).experience, '新的经验');
  await request('DELETE', `/v1/cases/${shared.id}`, null, a.token);
  assert.equal((await request('GET', `/v1/gifts/${g.id}`, null, a.token)).share_state, 'none');
  await request('GET', `/v1/cases/${shared.id}`, null, b.token, 404);
  assert.equal((await request('GET', `/v1/gifts/${g.id}`, null, a.token)).id, g.id);
  const reshared = await request('POST', '/v1/cases', caseInput, a.token);
  assert.notEqual(reshared.id, shared.id);
  await request(
    'POST',
    '/v1/events',
    {
      event: 'gift_created',
      properties: {
        reaction_level: 5,
        has_note: true,
        note: 'SECRET_TEXT',
        display_name: 'SECRET_NAME',
        constructor: 'SECRET_PROTOTYPE'
      }
    },
    a.token
  );
  await request('POST', '/v1/events', { event: 'constructor', properties: {} }, a.token, 400);
  await request('POST', '/v1/events', { event: 'case_filter_changed', properties: { field: 'relation_type', active: true, value: '朋友', gift_name: 'SECRET_GIFT' } }, a.token);
  assert.deepEqual(logs.at(-1), { event: 'case_filter_changed', properties: { field: 'relation_type', active: true, value: '朋友' } });
  await request('POST', '/v1/events', { event: 'case_filter_changed', properties: { field: 'relation_type', active: true, value: '26–30' } }, a.token);
  assert.deepEqual(logs.at(-1), { event: 'case_filter_changed', properties: { field: 'relation_type', active: true } });
  assert.ok(!JSON.stringify(logs).includes('不可进入日志'));
  assert.ok(!JSON.stringify(logs).includes('SECRET_'));
  assert.ok(!JSON.stringify(logs).includes(a.token));
  await request('DELETE', `/v1/gifts/${g.id}`, null, a.token);
  await request('GET', `/v1/cases/${reshared.id}`, null, b.token, 404);
  await request('GET', `/v1/gifts/${g.id}`, null, a.token, 404);
  await request('POST', '/v1/gifts', payload, a.token, 404);
  assert.equal(
    (await pool.query('SELECT deleted_at FROM gift_records WHERE id=$1', [g.id])).rows[0]
      .deleted_at instanceof Date,
    true
  );
  await request('DELETE', `/v1/recipients/${r.id}`, null, a.token);
  assert.equal((await request('GET', '/v1/me', null, a.token)).stats.gifts, 0);
  assert.equal(
    (
      await pool.query('SELECT count(*) FROM recipient_tags WHERE recipient_id=$1 AND deleted_at IS NULL', [
        r.id
      ])
    ).rows[0].count,
    0
  );
  for (const id of ids) await request('GET', `/v1/gifts/${id}`, null, a.token, 404);
  assert.equal(
    (await request('PATCH', '/v1/me', { display_name: '虚构昵称' }, a.token)).display_name,
    '虚构昵称'
  );
  await request('POST', '/v1/auth/logout', null, a.token);
  await request('GET', '/v1/me', null, a.token, 401);
  assert.equal((await request('GET', '/v1/me', null, a2.token)).user.display_name, '虚构昵称');
  await pool.query("UPDATE sessions SET expires_at=now()-interval '1 minute' WHERE user_id=$1", [b.user.id]);
  await request('GET', '/v1/me', null, b.token, 401);
  await request('DELETE', '/v1/me', null, a2.token);
  await request('GET', '/v1/me', null, a2.token, 401);
  for (const table of ['users', 'local_accounts', 'sessions', 'recipients', 'gift_records']) {
    const result = await pool.query(
      `SELECT count(*) FROM ${table} WHERE ${table === 'users' ? 'id' : 'user_id'}=$1`,
      [a.user.id]
    );
    assert.equal(result.rows[0].count, 0);
  }
  const anew = await request('POST', '/v1/auth/local/login', { device_key: key });
  assert.notEqual(anew.user.id, a.user.id);
  env.NODE_ENV = 'production';
  await request('POST', '/v1/auth/local/login', { device_key: key }, null, 404);
  assert.deepEqual(await request('GET', '/v1/config'), { local_login: false });
  env.WECHAT_APP_ID = 'test-appid';
  env.WECHAT_APP_SECRET = 'test-secret';
  const [wx1, wx2] = await Promise.all([
    request('POST', '/v1/auth/wechat/login', { code: 'test-code' }),
    request('POST', '/v1/auth/wechat/login', { code: 'test-code' })
  ]);
  assert.equal(wx1.user.id, wx2.user.id);
  assert.ok(!JSON.stringify(wx1).includes('SESSION_KEY'));
  assert.equal(
    (await pool.query('SELECT count(*) FROM wechat_accounts WHERE user_id=$1', [wx1.user.id])).rows[0].count,
    1
  );
  wxResult = { errcode: 40029, errmsg: 'invalid code' };
  await request('POST', '/v1/auth/wechat/login', { code: 'test-code' }, null, 401);
  await request('DELETE', '/v1/me', null, wx1.token);
  assert.equal(
    (await pool.query('SELECT count(*) FROM wechat_accounts WHERE user_id=$1', [wx1.user.id])).rows[0].count,
    0
  );
  assert.ok(!JSON.stringify(logs).includes('test-secret'));
  assert.ok(!JSON.stringify(logs).includes('SESSION_KEY'));
  const raceRecipient = await request(
    'POST',
    '/v1/recipients',
    { display_name: '虚构并发', relation_type: '朋友' },
    anew.token
  );
  await Promise.all([
    fetch(base + '/v1/gifts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${anew.token}` },
      body: JSON.stringify({ ...payload, recipient_id: raceRecipient.id, request_id: randomUUID() })
    }).then(async (response) => {
      assert.ok([200, 404].includes(response.status), await response.text());
    }),
    request('DELETE', `/v1/recipients/${raceRecipient.id}`, null, anew.token)
  ]);
  assert.equal(
    (
      await pool.query('SELECT count(*) FROM gift_records WHERE recipient_id=$1 AND deleted_at IS NULL', [
        raceRecipient.id
      ])
    ).rows[0].count,
    0
  );
  // The database independently enforces cross-owner and numeric invariants.
  const ar = await request(
    'POST',
    '/v1/recipients',
    { display_name: '虚构丙', relation_type: '朋友' },
    anew.token
  );
  await assert.rejects(
    pool.query(
      'INSERT INTO gift_records(id,user_id,recipient_id,request_id,request_hash,gift_name,reaction_level,gifted_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
      [randomUUID(), b.user.id, ar.id, randomUUID(), 'hash', '虚构', 3, '2020-01-01']
    ),
    { code: '23503' }
  );
  await assert.rejects(
    pool.query(
      'INSERT INTO gift_records(id,user_id,recipient_id,request_id,request_hash,gift_name,reaction_level,gifted_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
      [randomUUID(), anew.user.id, ar.id, randomUUID(), 'hash', '虚构', 6, '2020-01-01']
    ),
    { code: '23514' }
  );
});
