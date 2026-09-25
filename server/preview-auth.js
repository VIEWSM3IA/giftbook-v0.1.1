const { createHash, createHmac, randomUUID, timingSafeEqual } = require('node:crypto');

const COOKIE = 'giftbook_preview';
const LOGIN_PATH = '/__preview/login';
const SESSION_SECONDS = 12 * 60 * 60;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 8;
const LOGIN_PAGE = `<!doctype html>
<html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>礼物簿验收</title><style>body{margin:0;background:#f6f5f7;color:#29252b;font:16px system-ui,sans-serif;display:grid;min-height:100vh;place-items:center}.card{width:min(360px,calc(100% - 48px));padding:28px;background:white;border-radius:20px;box-sizing:border-box}h1{font-size:24px;margin:0 0 8px}p{color:#77717a;line-height:1.6}label{display:block;margin:24px 0 8px}input,button{box-sizing:border-box;width:100%;height:48px;border-radius:12px;font:inherit}input{border:1px solid #d9d4da;padding:0 12px}button{margin-top:16px;border:0;background:#9e4762;color:white;font-weight:600}</style>
<main class="card"><h1>礼物簿验收</h1><p>输入验收口令后继续。</p><p class="message" aria-live="polite">__MESSAGE__</p><form action="${LOGIN_PATH}" method="post"><label for="password">验收口令</label><input id="password" name="password" type="password" autocomplete="current-password" required autofocus><button>继续</button></form></main></html>`;

function constantEqual(left, right) {
  return timingSafeEqual(
    createHash('sha256').update(String(left)).digest(),
    createHash('sha256').update(String(right)).digest()
  );
}

function createPreviewAccess(env = process.env, { now = Date.now } = {}) {
  const enabled = env.PUBLIC_PREVIEW === 'true';
  const password = env.PREVIEW_ACCESS_PASSWORD || '';
  const secret = env.PREVIEW_ACCESS_SECRET || '';
  let publicOrigin;
  if (enabled) {
    try {
      publicOrigin = new URL(env.PREVIEW_PUBLIC_ORIGIN || '');
    } catch {
      throw new Error('公网验收必须配置固定 HTTPS 来源。');
    }
    if (
      publicOrigin.protocol !== 'https:' ||
      publicOrigin.origin !== env.PREVIEW_PUBLIC_ORIGIN ||
      publicOrigin.pathname !== '/' ||
      publicOrigin.search ||
      publicOrigin.hash ||
      publicOrigin.username ||
      publicOrigin.password
    ) throw new Error('公网验收必须配置固定 HTTPS 来源。');
    if (Buffer.byteLength(password) < 24 || Buffer.byteLength(secret) < 32)
      throw new Error('公网验收需要至少 24 字节口令和 32 字节 Cookie 密钥。');
  }

  const attempts = new Map();
  const signature = (issuedAt) =>
    createHmac('sha256', secret).update(`giftbook-preview:${issuedAt}`).digest('base64url');
  function hasSession(req) {
    const pair = (req.headers.cookie || '').split(';').map((item) => item.trim()).find((item) => item.startsWith(`${COOKIE}=`));
    const [issuedAt, signed] = (pair?.slice(COOKIE.length + 1) || '').split('.');
    if (!/^\d{10}$/.test(issuedAt || '') || !signed) return false;
    const age = Math.floor(now() / 1000) - Number(issuedAt);
    return age >= 0 && age <= SESSION_SECONDS && constantEqual(signed, signature(issuedAt));
  }
  function page(res, status = 200, retryAfter = 0, message = '', head = false) {
    res.writeHead(status, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      ...(retryAfter ? { 'Retry-After': String(retryAfter) } : {})
    });
    res.end(head ? undefined : LOGIN_PAGE.replace('__MESSAGE__', message));
  }
  async function readPassword(req) {
    if (!(req.headers['content-type'] || '').startsWith('application/x-www-form-urlencoded')) {
      const error = new Error('CONTENT_TYPE');
      error.status = 415;
      throw error;
    }
    let size = 0;
    let tooLarge = false;
    const chunks = [];
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 2048) tooLarge = true;
      else chunks.push(chunk);
    }
    if (tooLarge) {
      const error = new Error('BODY_TOO_LARGE');
      error.status = 413;
      throw error;
    }
    return new URLSearchParams(Buffer.concat(chunks).toString('utf8')).get('password') || '';
  }
  function attemptFor(req) {
    const current = now();
    for (const [address, record] of attempts) if (record.until <= current) attempts.delete(address);
    const address = req.headers['cf-connecting-ip'] || req.socket.remoteAddress || 'unknown';
    let record = attempts.get(address);
    if (!record) {
      if (attempts.size >= 1024) return { allowed: false, retryAfter: Math.ceil(ATTEMPT_WINDOW_MS / 1000) };
      record = { count: 0, until: current + ATTEMPT_WINDOW_MS };
      attempts.set(address, record);
    }
    if (record.count >= MAX_ATTEMPTS)
      return { allowed: false, retryAfter: Math.ceil((record.until - current) / 1000) };
    record.count += 1;
    return { allowed: true, address };
  }
  async function handle(req, res, url) {
    if (!enabled) return false;
    if (req.headers.host !== publicOrigin.host) {
      req.resume();
      page(res, 421, 0, '');
      return true;
    }
    if (hasSession(req)) {
      if (url.pathname === LOGIN_PATH) {
        req.resume();
        res.writeHead(303, { Location: '/', 'Cache-Control': 'no-store' }).end();
        return true;
      }
      return false;
    }
    if (url.pathname === LOGIN_PATH && ['GET', 'HEAD'].includes(req.method)) {
      page(res, 200, 0, '', req.method === 'HEAD');
      return true;
    }
    if (url.pathname === LOGIN_PATH && req.method === 'POST') {
      if (req.headers.origin !== publicOrigin.origin) {
        req.resume();
        page(res, 403);
        return true;
      }
      try {
        const candidate = await readPassword(req);
        const attempt = attemptFor(req);
        if (!attempt.allowed) {
          page(res, 200, attempt.retryAfter, '尝试次数过多，请稍后再试。');
          return true;
        }
        if (!constantEqual(candidate, password)) {
          page(res, 200, 0, '口令不正确，请重试。');
          return true;
        }
        attempts.delete(attempt.address);
        const issuedAt = String(Math.floor(now() / 1000));
        const value = `${issuedAt}.${signature(issuedAt)}`;
        res.writeHead(303, {
          Location: '/',
          'Cache-Control': 'no-store',
          'Set-Cookie': `${COOKIE}=${value}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${SESSION_SECONDS}`
        }).end();
      } catch (error) {
        req.resume();
        page(res, error.status || 400);
      }
      return true;
    }
    req.resume();
    if (url.pathname.startsWith('/v1/')) {
      res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ error: { code: 'PREVIEW_AUTH_REQUIRED', message: '请输入验收口令' }, request_id: randomUUID() }));
    } else if (url.pathname === '/' || url.pathname === '/index.html') page(res, 200, 0, '', req.method === 'HEAD');
    else page(res, 401, 0, '', req.method === 'HEAD');
    return true;
  }
  return { enabled, handle };
}

module.exports = { createPreviewAccess };
