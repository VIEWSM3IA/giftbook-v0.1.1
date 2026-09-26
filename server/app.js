const { randomUUID, randomBytes, createHash } = require('node:crypto');
const domain = require('../miniprogram/utils/domain');
const { matchCase, sortMatches } = require('./matching');
const { pool: defaultPool } = require('./db');
const hash = (value) => createHash('sha256').update(value).digest('hex');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
const fail = (status, code, message) => {
  throw new ApiError(status, code, message);
};
const missing = () => fail(404, 'NOT_FOUND', '内容不存在或已删除');
function validate(fn, input) {
  try {
    return fn(input);
  } catch (error) {
    fail(400, 'VALIDATION_ERROR', error.message);
  }
}
function uuid(value) {
  if (typeof value !== 'string' || !UUID.test(value)) fail(400, 'VALIDATION_ERROR', '无效的记录标识');
  return value;
}
function publicRow(row) {
  if (!row) return null;
  const { user_id, deleted_at, request_id, request_hash, cursor_created_at, ...result } = row;
  return result;
}
async function body(req) {
  if (!(req.headers['content-type'] || '').startsWith('application/json'))
    fail(415, 'CONTENT_TYPE', '请使用 JSON 请求');
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 16384) fail(413, 'BODY_TOO_LARGE', '提交内容过长');
    chunks.push(chunk);
  }
  try {
    const data = JSON.parse(Buffer.concat(chunks).toString());
    if (!data || Array.isArray(data) || typeof data !== 'object') throw new Error();
    return data;
  } catch {
    fail(400, 'INVALID_JSON', '提交内容格式有误');
  }
}
async function transaction(pool, fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const value = await fn(client);
    await client.query('COMMIT');
    return value;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
const recipientSelect = `SELECT r.*, COALESCE((SELECT json_agg(t.name ORDER BY t.sort_order) FROM recipient_tags rt JOIN tags t ON t.id=rt.tag_id WHERE rt.recipient_id=r.id AND rt.deleted_at IS NULL),'[]'::json) AS tags, (SELECT to_jsonb(g)-ARRAY['user_id','deleted_at','request_id','request_hash'] FROM gift_records g WHERE g.recipient_id=r.id AND g.user_id=r.user_id AND g.deleted_at IS NULL ORDER BY g.gifted_at DESC,g.created_at DESC,g.id DESC LIMIT 1) AS latest_gift FROM recipients r`;
async function recipient(db, userId, id, lock = false) {
  const row = (
    await db.query(
      `${recipientSelect} WHERE r.id=$1 AND r.user_id=$2 AND r.deleted_at IS NULL${lock ? ' FOR UPDATE OF r' : ''}`,
      [uuid(id), userId]
    )
  ).rows[0];
  if (!row) missing();
  return publicRow(row);
}
async function gift(db, userId, id) {
  const row = (
    await db.query("SELECT g.*,c.id AS published_case_id,CASE WHEN c.id IS NULL THEN 'none' ELSE 'published' END AS share_state FROM gift_records g LEFT JOIN public_cases c ON c.source_gift_id=g.id AND c.status='published' WHERE g.id=$1 AND g.user_id=$2 AND g.deleted_at IS NULL", [
      uuid(id),
      userId
    ])
  ).rows[0];
  if (!row) missing();
  return row;
}
const caseFields = 'id,gift_name,relation_type,age_range,occasion,price_range,wanted_level,reaction_level,behavior_evidence,experience,helpful_count,source_type,created_at,updated_at';
const visibleCaseSources = (env) => env.NODE_ENV === 'production' ? ['user_generated', 'verified_seed'] : ['user_generated', 'verified_seed', 'internal_mock'];
function reviewCase(value, recipientName) {
  const publicText = [value.gift_name, value.experience].join(' ').normalize('NFKC');
  const compact = publicText.replace(/[\s\p{P}\p{S}\p{Cf}]/gu, '').toLowerCase();
  const privateName = (recipientName || '').normalize('NFKC').replace(/[\s\p{P}\p{S}\p{Cf}]/gu, '').toLowerCase();
  if (/[\w.+-]+@[\w.-]+\.[a-z]{2,}|@\w{2,}|https?:\/\/|www\./i.test(publicText) ||
      /1[3-9]\d{9}|\d{17}[\dx]|微信|wechat|vx|v信|wx|qq|扣扣|电话|手机|联系方式|加我|私信|https|www/i.test(compact) ||
      /(?:省|市|区|县|路|街|巷|弄).{0,20}\d{1,4}(?:号|弄|栋|室)/.test(compact) ||
      (privateName && compact.includes(privateName)))
    fail(400, 'REVIEW_REJECTED', '公开内容可能包含联系方式、地址或 TA 的私人称呼，请修改后再分享');
}
function caseFilters(search) {
  const fields = ['relation_type', 'age_range', 'occasion', 'price_range', 'wanted_level'];
  const values = [];
  const clauses = fields.filter((field) => search.has(field)).map((field) => {
    const allowed = { relation_type: domain.RELATIONS, age_range: domain.AGE_BUCKETS, occasion: domain.OCCASIONS, price_range: domain.PRICE_RANGES, wanted_level: domain.WANTED_LEVELS }[field];
    const value = search.get(field);
    if (!allowed.includes(value)) fail(400, 'VALIDATION_ERROR', '筛选条件无效');
    values.push(value);
    return `c.${field}=$${values.length}`;
  });
  const offset = Number(search.get('offset') || 0);
  if (!Number.isInteger(offset) || offset < 0 || offset > 10000) fail(400, 'VALIDATION_ERROR', '分页位置无效');
  return { clauses, values, offset };
}
async function saveTags(db, recipientId, tags) {
  await db.query('UPDATE recipient_tags SET deleted_at=now(),updated_at=now() WHERE recipient_id=$1', [
    recipientId
  ]);
  await db.query(
    `INSERT INTO recipient_tags(recipient_id,tag_id) SELECT $1,id FROM tags WHERE name=ANY($2::text[]) AND enabled ON CONFLICT(recipient_id,tag_id) DO UPDATE SET deleted_at=NULL,updated_at=now()`,
    [recipientId, tags]
  );
}
async function stats(db, userId) {
  return (
    await db.query(
      `SELECT (SELECT count(*) FROM recipients WHERE user_id=$1 AND deleted_at IS NULL) AS recipients,(SELECT count(*) FROM gift_records WHERE user_id=$1 AND deleted_at IS NULL) AS gifts`,
      [userId]
    )
  ).rows[0];
}
// Only fixed event names and enumerated/boolean properties may enter analytics.
const eventRules = {
  login_success: { is_new_user: (value) => typeof value === 'boolean' },
  recipient_create_start: { entry: (value) => ['home', 'record'].includes(value) },
  recipient_created: {
    relation_type: (value) => domain.RELATIONS.includes(value),
    has_tags: (value) => typeof value === 'boolean'
  },
  gift_create_start: {
    entry: (value) => ['recipient', 'tab', 'home'].includes(value),
    recipient_id_hash: (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
  },
  gift_created: {
    reaction_level: (value) => Number.isInteger(value) && value >= 1 && value <= 5,
    has_note: (value) => typeof value === 'boolean',
    has_price: (value) => typeof value === 'boolean'
  },
  recipient_viewed: { gift_count_bucket: (value) => ['0', '1-5', '6-20', '21+'].includes(value) },
  gift_edited: {
    changed_fields: (value) =>
      Array.isArray(value) &&
      value.length <= 7 &&
      value.every((item) =>
        ['gift_name', 'reaction_level', 'gifted_at', 'occasion', 'price_fen', 'note'].includes(item)
      )
  },
  gift_deleted: {},
  case_share_started: { entry: (value) => ['gift_detail', 'gift_menu', 'my_shares'].includes(value), edit: (value) => typeof value === 'boolean' },
  case_published: {
    relation_type: (value) => domain.RELATIONS.includes(value),
    age_range: (value) => domain.AGE_BUCKETS.includes(value),
    occasion: (value) => domain.OCCASIONS.includes(value),
    price_range: (value) => domain.PRICE_RANGES.includes(value),
    wanted_level: (value) => domain.WANTED_LEVELS.includes(value),
    reaction_level: (value) => Number.isInteger(value) && value >= 1 && value <= 5,
    evidence_count: (value) => Number.isInteger(value) && value >= 1 && value <= 5
  },
  case_opened: { is_mine: (value) => typeof value === 'boolean' },
  case_filter_changed: {
    field: (value) => ['relation_type', 'age_range', 'occasion', 'price_range', 'wanted_level'].includes(value),
    active: (value) => typeof value === 'boolean',
    value: (value) => ['全部', ...domain.RELATIONS, ...domain.AGE_BUCKETS, ...domain.OCCASIONS, ...domain.PRICE_RANGES, ...domain.WANTED_LEVELS].includes(value)
  },
  case_helpful: { count_bucket: (value) => ['1', '2-5', '6-20', '21+'].includes(value) },
  case_unpublished: { had_helpful: (value) => typeof value === 'boolean' },
  gift_match_started: { relation_type: (v) => domain.RELATIONS.includes(v), age_range: (v) => !v || domain.AGE_BUCKETS.includes(v), occasion: (v) => domain.OCCASIONS.includes(v), price_range: (v) => domain.PRICE_RANGES.includes(v) },
  gift_match_results: { result_count_bucket: (v) => ['0','1-5','6-20','21+'].includes(v) },
  gift_idea_saved: { source_type: (v) => ['user_generated','verified_seed','internal_mock'].includes(v) },
  saved_gift_converted: {},
  saved_gift_removed: {}
};
function createApi(options = {}) {
  const pool = options.pool || defaultPool;
  const env = options.env || process.env;
  const fetcher = options.fetch || globalThis.fetch;
  const log = options.log || ((entry) => console.log(JSON.stringify(entry)));
  const emit = (event, properties = {}) => {
    const rules = Object.hasOwn(eventRules, event) ? eventRules[event] : null;
    if (!rules) fail(400, 'VALIDATION_ERROR', '无效的事件');
    const safe = {};
    for (const [key, value] of Object.entries(properties))
      if (Object.hasOwn(rules, key) && rules[key](value)) safe[key] = value;
    if (event === 'case_filter_changed' && safe.value) {
      const options = {
        relation_type: domain.RELATIONS, age_range: domain.AGE_BUCKETS, occasion: domain.OCCASIONS,
        price_range: domain.PRICE_RANGES, wanted_level: domain.WANTED_LEVELS
      }[safe.field];
      if (!options || (safe.value !== '全部' && !options.includes(safe.value)) || safe.active !== (safe.value !== '全部')) delete safe.value;
    }
    log({ event, properties: safe });
  };
  async function login(input, provider) {
    let identity, appid, unionid;
    if (provider === 'local') {
      if (env.NODE_ENV !== 'development' || env.ALLOW_LOCAL_LOGIN !== 'true')
        fail(404, 'NOT_FOUND', '此入口不可用');
      if (typeof input.device_key !== 'string' || !/^[a-f0-9]{64}$/i.test(input.device_key))
        fail(400, 'VALIDATION_ERROR', '本机账号凭证无效，请重新打开页面');
      identity = hash(input.device_key);
    } else {
      if (!env.WECHAT_APP_ID || !env.WECHAT_APP_SECRET)
        fail(503, 'WECHAT_NOT_CONFIGURED', '微信登录暂未配置，请稍后再试');
      if (typeof input.code !== 'string' || !input.code || input.code.length > 512)
        fail(400, 'VALIDATION_ERROR', '请重新获取微信登录凭证');
      appid = env.WECHAT_APP_ID;
      let result;
      try {
        const url = new URL('https://api.weixin.qq.com/sns/jscode2session');
        url.search = new URLSearchParams({
          appid,
          secret: env.WECHAT_APP_SECRET,
          js_code: input.code,
          grant_type: 'authorization_code'
        });
        const response = await fetcher(url, { signal: AbortSignal.timeout(8000) });
        if (!response.ok) throw new Error();
        result = await response.json();
      } catch {
        fail(502, 'WECHAT_UNAVAILABLE', '微信登录暂时不可用，请重试');
      }
      if (result.errcode || typeof result.openid !== 'string' || !result.openid)
        fail(401, 'WECHAT_CODE_INVALID', '微信凭证已失效，请重新登录');
      identity = result.openid;
      unionid = result.unionid || null;
    }
    const result = await transaction(pool, async (db) => {
      // Serialize only the same external identity: concurrent first login creates one business user.
      await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
        `${provider}:${appid || ''}:${identity}`
      ]);
      const old =
        provider === 'local'
          ? (
              await db.query(
                'SELECT u.* FROM local_accounts a JOIN users u ON u.id=a.user_id WHERE a.device_hash=$1 AND u.deleted_at IS NULL',
                [identity]
              )
            ).rows[0]
          : (
              await db.query(
                'SELECT u.* FROM wechat_accounts a JOIN users u ON u.id=a.user_id WHERE a.appid=$1 AND a.openid=$2 AND u.deleted_at IS NULL',
                [appid, identity]
              )
            ).rows[0];
      const user =
        old || (await db.query('INSERT INTO users(id) VALUES($1) RETURNING *', [randomUUID()])).rows[0];
      if (!old) {
        if (provider === 'local')
          await db.query('INSERT INTO local_accounts(id,user_id,device_hash) VALUES($1,$2,$3)', [
            randomUUID(),
            user.id,
            identity
          ]);
        else
          await db.query(
            'INSERT INTO wechat_accounts(id,user_id,appid,openid,unionid) VALUES($1,$2,$3,$4,$5)',
            [randomUUID(), user.id, appid, identity, unionid]
          );
      } else if (provider === 'wechat')
        await db.query(
          'UPDATE wechat_accounts SET last_login_at=now(),updated_at=now() WHERE appid=$1 AND openid=$2',
          [appid, identity]
        );
      const token = randomBytes(32).toString('hex');
      await db.query('DELETE FROM sessions WHERE user_id=$1 AND expires_at<=now()', [user.id]);
      await db.query(
        "INSERT INTO sessions(id,user_id,token_hash,expires_at) VALUES($1,$2,$3,now()+interval '7 days')",
        [randomUUID(), user.id, hash(token)]
      );
      return { token, user: publicRow(user), isNew: !old };
    });
    emit('login_success', { is_new_user: result.isNew });
    delete result.isNew;
    return result;
  }
  return async function handleApi(req, res) {
    const requestId = randomUUID();
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const send = (status, value) => {
      res.statusCode = status;
      res.end(JSON.stringify({ ...value, request_id: requestId }));
    };
    let url;
    try {
      url = new URL(req.url, 'http://localhost');
    } catch {
      send(400, { error: { code: 'INVALID_URL', message: '请求地址无效' } });
      return true;
    }
    if (!url.pathname.startsWith('/v1/')) return false;
    try {
      const method = req.method,
        route = url.pathname;
      // Browser writes must originate from this server; native clients do not send Origin.
      if (!['GET', 'HEAD'].includes(method) && req.headers.origin) {
        let origin;
        try {
          origin = new URL(req.headers.origin);
        } catch {
          fail(403, 'ORIGIN_REJECTED', '请求来源无效');
        }
        if (origin.host !== req.headers.host) fail(403, 'ORIGIN_REJECTED', '请求来源无效');
      }
      const input = ['POST', 'PATCH'].includes(method) && route !== '/v1/auth/logout' ? await body(req) : {};
      let data;
      if (method === 'GET' && route === '/v1/config')
        data = { local_login: env.NODE_ENV === 'development' && env.ALLOW_LOCAL_LOGIN === 'true' };
      else if (method === 'POST' && ['/v1/auth/local/login', '/v1/auth/wechat/login'].includes(route))
        data = await login(input, route.includes('/local/') ? 'local' : 'wechat');
      else {
        const token = /^Bearer ([a-f0-9]{64})$/i.exec(req.headers.authorization || '')?.[1];
        if (!token) fail(401, 'UNAUTHENTICATED', '请先登录');
        const session = (
          await pool.query(
            "SELECT s.id AS session_id,u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.deleted_at IS NULL AND u.status='active'",
            [hash(token)]
          )
        ).rows[0];
        if (!session) fail(401, 'UNAUTHENTICATED', '登录已过期，请重新登录');
        const userId = session.id;
        if (method === 'POST' && route === '/v1/auth/logout') {
          await pool.query('DELETE FROM sessions WHERE id=$1', [session.session_id]);
          data = null;
        } else if (method === 'GET' && route === '/v1/me') {
          const { session_id, ...user } = session;
          data = { user: publicRow(user), stats: await stats(pool, userId) };
        } else if (method === 'PATCH' && route === '/v1/me') {
          const name = typeof input.display_name === 'string' ? input.display_name.trim() : '';
          if (!name || [...name].length > 20) fail(400, 'VALIDATION_ERROR', '昵称需要 1–20 个字');
          data = publicRow(
            (
              await pool.query(
                'UPDATE users SET display_name=$1,updated_at=now() WHERE id=$2 AND deleted_at IS NULL RETURNING *',
                [name, userId]
              )
            ).rows[0]
          );
        } else if (method === 'PATCH' && route === '/v1/me/active-recipient') {
          await recipient(pool, userId, input.recipient_id);
          data = publicRow((await pool.query('UPDATE users SET last_active_recipient_id=$1,updated_at=now() WHERE id=$2 RETURNING *', [input.recipient_id, userId])).rows[0]);
        } else if (method === 'DELETE' && route === '/v1/me') {
          await transaction(pool, async (db) => {
            await db.query('UPDATE public_cases c SET helpful_count=GREATEST(0,c.helpful_count-votes.n) FROM (SELECT case_id,count(*)::integer AS n FROM case_helpful WHERE user_id=$1 GROUP BY case_id) votes WHERE c.id=votes.case_id AND c.owner_id<>$1', [userId]);
            await db.query('DELETE FROM users WHERE id=$1', [userId]);
          });
          data = null;
        } else if (method === 'GET' && route === '/v1/tags')
          data = (await pool.query('SELECT name FROM tags WHERE enabled ORDER BY sort_order')).rows.map(
            (row) => row.name
          );
        else if (method === 'POST' && route === '/v1/events') {
          emit(input.event, input.properties && typeof input.properties === 'object' ? input.properties : {});
          data = null;
        } else if (method === 'GET' && route === '/v1/cases') {
          const { clauses, values, offset } = caseFilters(url.searchParams);
          const rows = (await pool.query(
            `SELECT ${caseFields.split(',').map((field) => 'c.' + field).join(',')},c.owner_id=$${values.length + 2} AS is_mine,EXISTS(SELECT 1 FROM case_helpful h WHERE h.case_id=c.id AND h.user_id=$${values.length + 2}) AS helped FROM public_cases c WHERE c.status='published' AND c.source_type=ANY($${values.length + 1}::text[])${clauses.length ? ' AND ' + clauses.join(' AND ') : ''} ORDER BY c.created_at DESC,c.id DESC LIMIT 21 OFFSET $${values.length + 3}`,
            [...values, visibleCaseSources(env), userId, offset]
          )).rows;
          data = { items: rows.slice(0, 20), next_offset: rows.length > 20 ? offset + 20 : null };
        } else if (method === 'GET' && route === '/v1/me/cases') {
          data = (await pool.query(`SELECT ${caseFields},status,source_gift_id,legacy_price_range FROM public_cases WHERE owner_id=$1 ORDER BY created_at DESC,id DESC`, [userId])).rows;
        } else if (method === 'POST' && route === '/v1/cases') {
          const giftId = uuid(input.source_gift_id);
          const value = validate(domain.validateCase, input);
          data = await transaction(pool, async (db) => {
            const source = (await db.query('SELECT g.*,r.display_name,r.deleted_at AS recipient_deleted_at FROM gift_records g JOIN recipients r ON r.id=g.recipient_id WHERE g.id=$1 AND g.user_id=$2 FOR UPDATE OF g', [giftId, userId])).rows[0];
            if (!source || source.deleted_at || source.recipient_deleted_at) missing();
            reviewCase(value, source.display_name);
            if ((await db.query("SELECT 1 FROM public_cases WHERE source_gift_id=$1 AND status='published'", [giftId])).rowCount)
              fail(409, 'ALREADY_SHARED', '这份礼物已经分享过');
            const id = randomUUID();
            const row = (await db.query(`INSERT INTO public_cases(id,owner_id,source_gift_id,gift_name,relation_type,age_range,occasion,price_range,wanted_level,reaction_level,behavior_evidence,experience,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'published') ON CONFLICT(source_gift_id) WHERE status='published' DO NOTHING RETURNING ${caseFields},status,source_gift_id`, [id,userId,giftId,value.gift_name,value.relation_type,value.age_range,value.occasion,value.price_range,value.wanted_level,value.reaction_level,value.behavior_evidence,value.experience])).rows[0];
            if (!row) fail(409, 'ALREADY_SHARED', '这份礼物已经分享过');
            return row;
          });
          emit('case_published', { relation_type: value.relation_type, age_range: value.age_range, occasion: value.occasion, price_range: value.price_range, wanted_level: value.wanted_level, reaction_level: value.reaction_level, evidence_count: value.behavior_evidence.length });
        } else if (/^\/v1\/cases\/[^/]+\/helpful$/.test(route) && method === 'POST') {
          const id = uuid(route.split('/')[3]);
          data = await transaction(pool, async (db) => {
            const item = (await db.query("SELECT owner_id,source_type FROM public_cases WHERE id=$1 AND status='published' AND source_type=ANY($2::text[]) FOR UPDATE", [id,visibleCaseSources(env)])).rows[0];
            if (!item) missing();
            if (item.owner_id === userId) fail(400, 'OWN_CASE', '不能给自己的分享点有帮助');
            const inserted = await db.query('INSERT INTO case_helpful(case_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING', [id,userId]);
            if (inserted.rowCount) await db.query('UPDATE public_cases SET helpful_count=helpful_count+1 WHERE id=$1', [id]);
            return { ...(await db.query('SELECT helpful_count,source_type FROM public_cases WHERE id=$1', [id])).rows[0], added: inserted.rowCount > 0 };
          });
          if (data.added && data.source_type !== 'internal_mock') emit('case_helpful', { count_bucket: data.helpful_count === 1 ? '1' : data.helpful_count <= 5 ? '2-5' : data.helpful_count <= 20 ? '6-20' : '21+' });
          delete data.added;
          delete data.source_type;
        } else if (/^\/v1\/cases\/[^/]+$/.test(route)) {
          const id = uuid(route.split('/')[3]);
          if (method === 'GET') {
            const row = (await pool.query(`SELECT ${caseFields.split(',').map((field) => 'c.' + field).join(',')},c.owner_id=$2 AS is_mine,EXISTS(SELECT 1 FROM case_helpful h WHERE h.case_id=c.id AND h.user_id=$2) AS helped FROM public_cases c WHERE c.id=$1 AND c.status='published' AND c.source_type=ANY($3::text[])`, [id,userId,visibleCaseSources(env)])).rows[0];
            if (!row) missing();
            data = row;
            if (row.source_type !== 'internal_mock') emit('case_opened', { is_mine: row.is_mine });
          } else if (method === 'PATCH') {
            const value = validate(domain.validateCase, input);
            data = await transaction(pool, async (db) => {
              const old = (await db.query("SELECT * FROM public_cases WHERE id=$1 AND owner_id=$2 AND status='published' FOR UPDATE", [id,userId])).rows[0];
              if (!old) missing();
              const name = (await db.query('SELECT display_name FROM recipients r JOIN gift_records g ON g.recipient_id=r.id WHERE g.id=$1', [old.source_gift_id])).rows[0]?.display_name;
              reviewCase(value, name);
              return (await db.query(`UPDATE public_cases SET gift_name=$1,relation_type=$2,age_range=$3,occasion=$4,price_range=$5,wanted_level=$6,reaction_level=$7,behavior_evidence=$8,experience=$9,legacy_price_range=NULL,updated_at=now() WHERE id=$10 RETURNING ${caseFields},status,source_gift_id`, [value.gift_name,value.relation_type,value.age_range,value.occasion,value.price_range,value.wanted_level,value.reaction_level,value.behavior_evidence,value.experience,id])).rows[0];
            });
          } else if (method === 'DELETE') {
            const row = (await pool.query("UPDATE public_cases SET status='removed',updated_at=now() WHERE id=$1 AND owner_id=$2 AND status='published' RETURNING id,helpful_count", [id,userId])).rows[0];
            if (!row) missing();
            data = null;
            emit('case_unpublished', { had_helpful: row.helpful_count > 0 });
          } else missing();
        } else if (method === 'GET' && route === '/v1/home')
          data = {
            recipients: (
              await pool.query(
                `${recipientSelect} WHERE r.user_id=$1 AND r.deleted_at IS NULL ORDER BY r.sort_order,r.created_at DESC,r.id DESC`,
                [userId]
              )
            ).rows.map(publicRow),
            recent_gifts: (
              await pool.query(
                'SELECT * FROM gift_records WHERE user_id=$1 AND deleted_at IS NULL ORDER BY gifted_at DESC,created_at DESC,id DESC LIMIT 5',
                [userId]
              )
            ).rows.map(publicRow),
            stats: await stats(pool, userId)
          };
        else if (method === 'GET' && route === '/v1/recipients')
          data = (
            await pool.query(
              `${recipientSelect} WHERE r.user_id=$1 AND r.deleted_at IS NULL ORDER BY r.sort_order,r.created_at DESC,r.id DESC`,
              [userId]
            )
          ).rows.map(publicRow);
        else if (method === 'PATCH' && route === '/v1/recipients/order') {
          if (!Array.isArray(input.recipient_ids) || input.recipient_ids.some((id) => typeof id !== 'string' || !UUID.test(id)) || new Set(input.recipient_ids).size !== input.recipient_ids.length)
            fail(400, 'VALIDATION_ERROR', 'TA 顺序无效');
          data = await transaction(pool, async (db) => {
            await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`recipient-order:${userId}`]);
            const existing = (await db.query('SELECT id FROM recipients WHERE user_id=$1 AND deleted_at IS NULL', [userId])).rows.map((row) => row.id);
            if (existing.length !== input.recipient_ids.length || input.recipient_ids.some((id) => !existing.includes(id)))
              fail(400, 'VALIDATION_ERROR', 'TA 顺序已变化，请刷新后重试');
            await db.query('UPDATE recipients r SET sort_order=ordered.position,updated_at=now() FROM unnest($1::uuid[]) WITH ORDINALITY AS ordered(id,position) WHERE r.id=ordered.id AND r.user_id=$2', [input.recipient_ids, userId]);
            return (await db.query(`${recipientSelect} WHERE r.user_id=$1 AND r.deleted_at IS NULL ORDER BY r.sort_order,r.id`, [userId])).rows.map(publicRow);
          });
        } else if (method === 'POST' && route === '/v1/recipients') {
          const value = validate(domain.validateRecipient, input);
          data = await transaction(pool, async (db) => {
            const id = randomUUID();
            await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`recipient-order:${userId}`]);
            await db.query(
              'INSERT INTO recipients(id,user_id,display_name,relation_type,age_range,gender,note,sort_order) VALUES($1,$2,$3,$4,$5,$6,$7,(SELECT COALESCE(max(sort_order),0)+1 FROM recipients WHERE user_id=$2 AND deleted_at IS NULL))',
              [id, userId, value.display_name, value.relation_type, value.age_range, value.gender, value.note]
            );
            await saveTags(db, id, value.tags);
            return recipient(db, userId, id);
          });
          emit('recipient_created', { relation_type: value.relation_type, has_tags: value.tags.length > 0 });
        } else if (/^\/v1\/recipients\/[^/]+\/gift-matches$/.test(route) && method === 'GET') {
          const person = await recipient(pool, userId, route.split('/')[3]);
          const criteria = { occasion: url.searchParams.get('occasion'), price_range: url.searchParams.get('price_range') };
          if (!domain.OCCASIONS.includes(criteria.occasion) || !domain.PRICE_RANGES.includes(criteria.price_range))
            fail(400, 'VALIDATION_ERROR', '请选择场景和预算');
          const limit = Number(url.searchParams.get('limit') || 20);
          if (!Number.isInteger(limit) || limit < 1 || limit > 50) fail(400, 'VALIDATION_ERROR', '结果数量无效');
          const rows = (await pool.query(
            `SELECT ${caseFields.split(',').map((field) => 'c.' + field).join(',')} FROM public_cases c WHERE c.status='published' AND c.occasion=$1 AND c.source_type=ANY($2::text[])`,
            [criteria.occasion, visibleCaseSources(env)]
          )).rows;
          const ranked = rows.map((item) => matchCase(person, criteria, item)).sort(sortMatches).slice(0, limit);
          const ids = ranked.map((item) => item.case.id);
          const saved = ids.length ? new Set((await pool.query("SELECT source_case_id FROM saved_gifts WHERE user_id=$1 AND recipient_id=$2 AND status='saved' AND source_case_id=ANY($3::uuid[])", [userId,person.id,ids])).rows.map((row) => row.source_case_id)) : new Set();
          data = { recipient: { id: person.id, display_name: person.display_name, relation_type: person.relation_type, age_range: person.age_range }, criteria, items: ranked.map((item) => ({ ...item, saved: saved.has(item.case.id) })) };
          emit('gift_match_started', { relation_type: person.relation_type, age_range: person.age_range, ...criteria });
          const realCount = rows.filter((item) => item.source_type !== 'internal_mock').length;
          emit('gift_match_results', { result_count_bucket: realCount === 0 ? '0' : realCount <= 5 ? '1-5' : realCount <= 20 ? '6-20' : '21+' });
        } else if (/^\/v1\/recipients\/[^/]+\/saved-gifts$/.test(route) && method === 'GET') {
          const person = await recipient(pool, userId, route.split('/')[3]);
          data = (await pool.query(
            `SELECT s.id,s.recipient_id,s.source_case_id,s.gift_name,s.source_snapshot,s.intended_occasion,s.intended_price_range,s.status,s.linked_gift_id,s.created_at,s.updated_at,
              (c.status='published' AND c.source_type=ANY($3::text[])) AS source_available
             FROM saved_gifts s LEFT JOIN public_cases c ON c.id=s.source_case_id
             WHERE s.user_id=$1 AND s.recipient_id=$2 AND s.status='saved' AND ($4::boolean OR s.source_snapshot->>'source_type'<>'internal_mock') ORDER BY s.created_at DESC,s.id DESC`,
            [userId,person.id,visibleCaseSources(env),env.NODE_ENV !== 'production']
          )).rows.map((row) => ({ ...row, source_available: !!row.source_available }));
        } else if (method === 'POST' && route === '/v1/saved-gifts') {
          const recipientId = uuid(input.recipient_id), caseId = uuid(input.source_case_id);
          if (!domain.OCCASIONS.includes(input.intended_occasion) || !domain.PRICE_RANGES.includes(input.intended_price_range))
            fail(400, 'VALIDATION_ERROR', '请选择场景和预算');
          data = await transaction(pool, async (db) => {
            await recipient(db,userId,recipientId,true);
            const source = (await db.query(`SELECT ${caseFields} FROM public_cases WHERE id=$1 AND status='published' AND source_type=ANY($2::text[])`, [caseId,visibleCaseSources(env)])).rows[0];
            if (!source) missing();
            const snapshot = { gift_name: source.gift_name, relation_type: source.relation_type, age_range: source.age_range,
              occasion: source.occasion, price_range: source.price_range, reaction_level: source.reaction_level,
              behavior_evidence: source.behavior_evidence, source_type: source.source_type };
            const row = (await db.query(
              `INSERT INTO saved_gifts(id,user_id,recipient_id,source_case_id,gift_name,source_snapshot,intended_occasion,intended_price_range,status)
               VALUES($1,$2,$3,$4,$5,$6,$7,$8,'saved')
               ON CONFLICT(user_id,recipient_id,source_case_id) WHERE status='saved' DO NOTHING
               RETURNING id,recipient_id,source_case_id,gift_name,source_snapshot,intended_occasion,intended_price_range,status,linked_gift_id,created_at,updated_at`,
              [randomUUID(),userId,recipientId,caseId,source.gift_name,snapshot,input.intended_occasion,input.intended_price_range]
            )).rows[0];
            return row || (await db.query("SELECT id,recipient_id,source_case_id,gift_name,source_snapshot,intended_occasion,intended_price_range,status,linked_gift_id,created_at,updated_at FROM saved_gifts WHERE user_id=$1 AND recipient_id=$2 AND source_case_id=$3 AND status='saved'", [userId,recipientId,caseId])).rows[0];
          });
          if (data.source_snapshot.source_type !== 'internal_mock') emit('gift_idea_saved', { source_type: data.source_snapshot.source_type });
        } else if (/^\/v1\/saved-gifts\/[^/]+\/convert$/.test(route) && method === 'POST') {
          const savedId = uuid(route.split('/')[3]);
          uuid(input.request_id);
          let created = false;
          data = await transaction(pool, async (db) => {
            const saved = (await db.query('SELECT * FROM saved_gifts WHERE id=$1 AND user_id=$2 FOR UPDATE', [savedId,userId])).rows[0];
            if (!saved) missing();
            if (env.NODE_ENV === 'production' && saved.source_snapshot.source_type === 'internal_mock') missing();
            const value = validate(domain.validateGift, { ...input, recipient_id: saved.recipient_id });
            const requestHash = hash(JSON.stringify({ saved_id: savedId, ...value }));
            if (saved.status === 'gifted') {
              const previous = (await db.query('SELECT * FROM gift_records WHERE id=$1 AND user_id=$2', [saved.linked_gift_id,userId])).rows[0];
              if (previous?.request_id === input.request_id && previous.request_hash === requestHash && !previous.deleted_at) return publicRow(previous);
              fail(409, 'ALREADY_GIFTED', '这份想送已经记为已送');
            }
            if (saved.status !== 'saved') missing();
            await recipient(db,userId,saved.recipient_id,true);
            const id = randomUUID();
            const inserted = await db.query(
              `INSERT INTO gift_records(id,user_id,recipient_id,request_id,request_hash,gift_name,reaction_level,gifted_at,occasion,price_fen,note)
               VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(user_id,request_id) DO NOTHING`,
              [id,userId,saved.recipient_id,input.request_id,requestHash,value.gift_name,value.reaction_level,value.gifted_at,value.occasion,value.price_fen,value.note]
            );
            if (!inserted.rowCount) fail(409, 'IDEMPOTENCY_CONFLICT', '这次保存的内容已变化，请重新保存');
            await db.query("UPDATE saved_gifts SET status='gifted',linked_gift_id=$1,updated_at=now() WHERE id=$2", [id,savedId]);
            created = true;
            return publicRow((await db.query('SELECT * FROM gift_records WHERE id=$1', [id])).rows[0]);
          });
          if (created && (await pool.query('SELECT source_snapshot->>\'source_type\' AS source_type FROM saved_gifts WHERE id=$1', [savedId])).rows[0]?.source_type !== 'internal_mock') emit('saved_gift_converted');
        } else if (/^\/v1\/saved-gifts\/[^/]+$/.test(route) && method === 'DELETE') {
          const id = uuid(route.split('/')[3]);
          const row = (await pool.query("UPDATE saved_gifts SET status='removed',updated_at=now() WHERE id=$1 AND user_id=$2 AND status='saved' AND ($3::boolean OR source_snapshot->>'source_type'<>'internal_mock') RETURNING id,source_snapshot", [id,userId,env.NODE_ENV !== 'production'])).rows[0];
          if (!row) missing();
          data = null;
          if (row.source_snapshot.source_type !== 'internal_mock') emit('saved_gift_removed');
        } else if (/^\/v1\/recipients\/[^/]+\/gifts$/.test(route) && method === 'GET') {
          const id = route.split('/')[3];
          await recipient(pool, userId, id);
          const limit = Number(url.searchParams.get('limit') || 20);
          if (!Number.isInteger(limit) || limit < 1 || limit > 100)
            fail(400, 'VALIDATION_ERROR', '分页数量无效');
          let cursor = null;
          if (url.searchParams.has('cursor')) {
            try {
              cursor = JSON.parse(Buffer.from(url.searchParams.get('cursor'), 'base64url').toString());
              if (
                !Array.isArray(cursor) ||
                cursor.length !== 3 ||
                !/^\d{4}-\d{2}-\d{2}$/.test(cursor[0]) ||
                new Date(cursor[0]).toISOString().slice(0, 10) !== cursor[0] ||
                typeof cursor[1] !== 'string' ||
                !/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}/.test(cursor[1]) ||
                !Number.isFinite(Date.parse(cursor[1])) ||
                typeof cursor[2] !== 'string' ||
                !UUID.test(cursor[2])
              )
                throw new Error();
            } catch {
              fail(400, 'VALIDATION_ERROR', '分页位置无效');
            }
          }
          const rows = (
            await pool.query(
              `SELECT g.*,g.created_at::text AS cursor_created_at,c.id AS published_case_id,CASE WHEN c.id IS NULL THEN 'none' ELSE 'published' END AS share_state FROM gift_records g LEFT JOIN public_cases c ON c.source_gift_id=g.id AND c.status='published' WHERE g.recipient_id=$1 AND g.user_id=$2 AND g.deleted_at IS NULL ${cursor ? 'AND (g.gifted_at,g.created_at,g.id)<($4::date,$5::timestamptz,$6::uuid)' : ''} ORDER BY g.gifted_at DESC,g.created_at DESC,g.id DESC LIMIT $3`,
              [id, userId, limit + 1, ...(cursor || [])]
            )
          ).rows;
          const more = rows.length > limit;
          const items = rows.slice(0, limit).map(publicRow);
          const last = rows[Math.min(rows.length, limit) - 1];
          data = {
            items,
            next_cursor: more
              ? Buffer.from(JSON.stringify([last.gifted_at, last.cursor_created_at, last.id])).toString(
                  'base64url'
                )
              : null
          };
        } else if (/^\/v1\/recipients\/[^/]+$/.test(route)) {
          const id = route.split('/')[3];
          if (method === 'GET') {
            data = await recipient(pool, userId, id);
            const count = (
              await pool.query(
                'SELECT count(*) FROM gift_records WHERE recipient_id=$1 AND user_id=$2 AND deleted_at IS NULL',
                [id, userId]
              )
            ).rows[0].count;
            emit('recipient_viewed', {
              gift_count_bucket: count === 0 ? '0' : count <= 5 ? '1-5' : count <= 20 ? '6-20' : '21+'
            });
          } else if (method === 'PATCH')
            data = await transaction(pool, async (db) => {
              const old = await recipient(db, userId, id, true),
                value = validate(domain.validateRecipient, { ...old, ...input });
              await db.query(
                'UPDATE recipients SET display_name=$1,relation_type=$2,age_range=$3,gender=$4,note=$5,updated_at=now() WHERE id=$6 AND user_id=$7',
                [
                  value.display_name,
                  value.relation_type,
                  value.age_range,
                  value.gender,
                  value.note,
                  id,
                  userId
                ]
              );
              await saveTags(db, id, value.tags);
              return recipient(db, userId, id);
            });
          else if (method === 'DELETE') {
            await transaction(pool, async (db) => {
              await recipient(db, userId, id, true);
              await db.query(
                'UPDATE recipients SET deleted_at=now(),updated_at=now() WHERE id=$1 AND user_id=$2',
                [id, userId]
              );
              await db.query('UPDATE users SET last_active_recipient_id=NULL WHERE id=$1 AND last_active_recipient_id=$2', [userId,id]);
              await db.query(
                'UPDATE gift_records SET deleted_at=now(),updated_at=now() WHERE recipient_id=$1 AND user_id=$2 AND deleted_at IS NULL',
                [id, userId]
              );
              await db.query("UPDATE public_cases SET status='removed',updated_at=now() WHERE owner_id=$1 AND source_gift_id IN (SELECT id FROM gift_records WHERE recipient_id=$2) AND status='published'", [userId,id]);
              await db.query(
                'UPDATE recipient_tags SET deleted_at=now(),updated_at=now() WHERE recipient_id=$1 AND deleted_at IS NULL',
                [id]
              );
            });
            data = null;
          } else missing();
        } else if (method === 'POST' && route === '/v1/gifts') {
          uuid(input.request_id);
          uuid(input.recipient_id);
          const value = validate(domain.validateGift, input);
          const requestHash = hash(JSON.stringify({ recipient_id: input.recipient_id, ...value }));
          let created = false;
          data = await transaction(pool, async (db) => {
            await recipient(db, userId, input.recipient_id, true);
            const inserted = await db.query(
              `INSERT INTO gift_records(id,user_id,recipient_id,request_id,request_hash,gift_name,reaction_level,gifted_at,occasion,price_fen,note) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(user_id,request_id) DO NOTHING`,
              [
                randomUUID(),
                userId,
                input.recipient_id,
                input.request_id,
                requestHash,
                value.gift_name,
                value.reaction_level,
                value.gifted_at,
                value.occasion,
                value.price_fen,
                value.note
              ]
            );
            created = inserted.rowCount > 0;
            const row = (
              await db.query('SELECT * FROM gift_records WHERE user_id=$1 AND request_id=$2', [
                userId,
                input.request_id
              ])
            ).rows[0];
            if (row.request_hash !== requestHash)
              fail(409, 'IDEMPOTENCY_CONFLICT', '这次保存的内容已变化，请重新保存');
            if (row.deleted_at) missing();
            return publicRow(row);
          });
          if (created)
            emit('gift_created', {
              reaction_level: value.reaction_level,
              has_note: !!value.note,
              has_price: value.price_fen !== null
            });
        } else if (/^\/v1\/gifts\/[^/]+$/.test(route)) {
          const id = route.split('/')[3];
          if (method === 'GET') data = publicRow(await gift(pool, userId, id));
          else if (method === 'PATCH') {
            data = await transaction(pool, async (db) => {
              let old = await gift(db, userId, id);
              await recipient(db, userId, old.recipient_id, true);
              old = await gift(db, userId, id);
              if (input.recipient_id && input.recipient_id !== old.recipient_id)
                fail(400, 'VALIDATION_ERROR', '不能更改礼物所属的 TA');
              const value = validate(domain.validateGift, { ...old, ...input });
              const row = (
                await db.query(
                  'UPDATE gift_records SET gift_name=$1,reaction_level=$2,gifted_at=$3,occasion=$4,price_fen=$5,note=$6,updated_at=now() WHERE id=$7 AND user_id=$8 AND deleted_at IS NULL RETURNING *',
                  [
                    value.gift_name,
                    value.reaction_level,
                    value.gifted_at,
                    value.occasion,
                    value.price_fen,
                    value.note,
                    id,
                    userId
                  ]
                )
              ).rows[0];
              if (!row) missing();
              return publicRow(row);
            });
            emit('gift_edited', {
              changed_fields: Object.keys(input).filter((key) =>
                ['gift_name', 'reaction_level', 'gifted_at', 'occasion', 'price_fen', 'note'].includes(key)
              )
            });
          } else if (method === 'DELETE') {
            await transaction(pool, async (db) => {
              const row = (await db.query('UPDATE gift_records SET deleted_at=now(),updated_at=now() WHERE id=$1 AND user_id=$2 AND deleted_at IS NULL RETURNING id', [uuid(id), userId])).rows[0];
              if (!row) missing();
              await db.query("UPDATE public_cases SET status='removed',updated_at=now() WHERE source_gift_id=$1 AND owner_id=$2 AND status='published'", [id,userId]);
            });
            data = null;
            emit('gift_deleted');
          } else missing();
        } else missing();
      }
      send(200, { data });
    } catch (error) {
      const status = error instanceof ApiError ? error.status : 500;
      if (status === 500)
        log({
          event: 'api_error',
          request_id: requestId,
          code: typeof error.code === 'string' ? error.code : 'INTERNAL_ERROR'
        });
      send(status, {
        error: {
          code: error instanceof ApiError ? error.code : 'INTERNAL_ERROR',
          message: status === 500 ? '暂时无法完成，请稍后重试' : error.message
        }
      });
    }
    return true;
  };
}
module.exports = { createApi };
