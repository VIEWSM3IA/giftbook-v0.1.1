const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { createPreviewAccess } = require('../server/preview-auth');

const password = 'p'.repeat(32);
const secret = 's'.repeat(43);
const publicOrigin = 'https://giftbook.91341117.xyz';

async function fixture() {
  let currentTime = Date.now();
  const access = createPreviewAccess(
    {
      PUBLIC_PREVIEW: 'true',
      PREVIEW_PUBLIC_ORIGIN: publicOrigin,
      PREVIEW_ACCESS_PASSWORD: password,
      PREVIEW_ACCESS_SECRET: secret
    },
    { now: () => currentTime }
  );
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (await access.handle(req, res, url)) return;
    res.writeHead(200, { 'Content-Type': 'text/plain' }).end('private app');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    request(path, { method = 'GET', headers = {}, body = '' } = {}) {
      return new Promise((resolve, reject) => {
        const req = http.request({
          hostname: '127.0.0.1',
          port: server.address().port,
          path,
          method,
          headers: { Host: 'giftbook.91341117.xyz', ...headers }
        }, (res) => {
          const chunks = [];
          res.on('data', (chunk) => chunks.push(chunk));
          res.on('end', () => resolve({
            status: res.statusCode,
            headers: res.headers,
            text: Buffer.concat(chunks).toString('utf8'),
            json() { return JSON.parse(this.text); }
          }));
        });
        req.on('error', reject);
        req.end(body);
      });
    },
    setTime(value) {
      currentTime = value;
    },
    close: () => new Promise((resolve) => server.close(resolve))
  };
}

test('公网验收在口令验证前不返回 H5 或 API 内容，成功后发短时安全 Cookie', async (t) => {
  const app = await fixture();
  t.after(app.close);

  const page = await app.request('/');
  assert.equal(page.status, 200);
  assert.match(page.text, /验收口令/);
  assert.doesNotMatch(page.text, /private app/);

  const asset = await app.request('/app.js');
  assert.equal(asset.status, 401);
  assert.doesNotMatch(asset.text, /private app/);

  const api = await app.request('/v1/config');
  assert.equal(api.status, 401);
  assert.equal(api.json().error.code, 'PREVIEW_AUTH_REQUIRED');

  const wrong = await app.request('/__preview/login', {
    method: 'POST',
    headers: { Origin: publicOrigin, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ password: 'wrong' }).toString()
  });
  assert.equal(wrong.status, 200);
  assert.match(wrong.text, /口令不正确/);

  const login = await app.request('/__preview/login', {
    method: 'POST',
    headers: { Origin: publicOrigin, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ password }).toString()
  });
  assert.equal(login.status, 303);
  const setCookie = login.headers['set-cookie'];
  assert.match(setCookie.join(';'), /HttpOnly; Secure; SameSite=Strict/);
  const cookie = setCookie[0].split(';')[0];
  const authenticated = await app.request('/app.js', { headers: { Cookie: cookie } });
  assert.equal(authenticated.status, 200);
  assert.equal(authenticated.text, 'private app');

  app.setTime(Date.now() + 12 * 60 * 60 * 1000 + 1000);
  const expired = await app.request('/app.js', { headers: { Cookie: cookie } });
  assert.equal(expired.status, 401);
});

test('口令门禁拒绝跨源登录并限制错误尝试', async (t) => {
  const app = await fixture();
  t.after(app.close);
  const options = {
    method: 'POST',
    headers: {
      Origin: publicOrigin,
      'CF-Connecting-IP': '203.0.113.20',
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({ password: 'wrong' }).toString()
  };
  const wrongHost = await app.request('/__preview/login', {
    ...options,
    headers: { ...options.headers, Host: 'attacker.example' }
  });
  assert.equal(wrongHost.status, 421);

  const crossOrigin = await app.request('/__preview/login', {
    ...options,
    headers: { ...options.headers, Origin: 'https://attacker.example' }
  });
  assert.equal(crossOrigin.status, 403);

  const missingOrigin = await app.request('/__preview/login', {
    ...options,
    headers: Object.fromEntries(Object.entries(options.headers).filter(([key]) => key !== 'Origin'))
  });
  assert.equal(missingOrigin.status, 403);

  for (let index = 0; index < 8; index++) {
    const response = await app.request('/__preview/login', options);
    assert.equal(response.status, 200);
  }
  const limited = await app.request('/__preview/login', options);
  assert.equal(limited.status, 200);
  assert.match(limited.text, /尝试次数过多/);
  assert.ok(Number(limited.headers['retry-after']) > 0);
});

test('公网模式缺少强口令或 Cookie 密钥时启动失败，本地模式不启用门禁', () => {
  assert.throws(() => createPreviewAccess({ PUBLIC_PREVIEW: 'true' }), /固定 HTTPS 来源/);
  assert.throws(() => createPreviewAccess({
    PUBLIC_PREVIEW: 'true',
    PREVIEW_PUBLIC_ORIGIN: 'http://giftbook.91341117.xyz',
    PREVIEW_ACCESS_PASSWORD: password,
    PREVIEW_ACCESS_SECRET: secret
  }), /固定 HTTPS 来源/);
  assert.throws(() => createPreviewAccess({
    PUBLIC_PREVIEW: 'true',
    PREVIEW_PUBLIC_ORIGIN: publicOrigin,
    PREVIEW_ACCESS_PASSWORD: password
  }), /公网验收需要/);
  assert.equal(createPreviewAccess({}).enabled, false);
});
