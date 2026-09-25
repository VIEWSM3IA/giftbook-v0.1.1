const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createApi } = require('../server/app');
const { createPreviewAccess } = require('../server/preview-auth');
const { migrate, pool } = require('../server/db');
const root = path.resolve(__dirname, '..');
const port = Number(process.env.PORT || process.argv[2] || 43117);
const host = process.env.HOST || '0.0.0.0';
const previewAccess = createPreviewAccess();
const previewOrigin = previewAccess.enabled ? new URL(process.env.PREVIEW_PUBLIC_ORIGIN) : null;
const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8'
};
const files = {
  '/': 'h5/index.html',
  '/index.html': 'h5/index.html',
  '/styles.css': 'h5/styles.css',
  '/app.js': 'h5/app.js',
  '/shared/domain.js': 'miniprogram/utils/domain.js'
};
async function start() {
  if (previewAccess.enabled && host !== '127.0.0.1')
    throw new Error('启用公网验收口令时，HOST 必须为 127.0.0.1。');
  await migrate();
  const api = createApi();
  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"
    );
    try {
      let url;
      try {
        url = new URL(req.url, 'http://localhost');
      } catch {
        res.writeHead(400).end('Bad request');
        return;
      }
      if (previewAccess.enabled && req.headers.host === previewOrigin.host) {
        let edgeScheme = '';
        try {
          edgeScheme = JSON.parse(req.headers['cf-visitor'] || '{}').scheme || '';
        } catch {}
        if (!edgeScheme) edgeScheme = (req.headers['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase();
        if (edgeScheme === 'http') {
          const destination = new URL(`${url.pathname}${url.search}`, previewOrigin);
          res.writeHead(308, { Location: destination.toString(), 'Cache-Control': 'no-store' }).end();
          return;
        }
        if (edgeScheme === 'https') res.setHeader('Strict-Transport-Security', 'max-age=31536000');
      }
      if (await previewAccess.handle(req, res, url)) return;
      if (await api(req, res)) return;
      if (!['GET', 'HEAD'].includes(req.method)) {
        res.writeHead(405, { Allow: 'GET, HEAD' }).end();
        return;
      }
      const target = files[url.pathname];
      if (!target) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
        return;
      }
      const body = await fs.readFile(path.join(root, target));
      res
        .writeHead(200, { 'Content-Type': types[path.extname(target)], 'Cache-Control': 'no-store' })
        .end(req.method === 'HEAD' ? undefined : body);
    } catch {
      if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Service unavailable');
    }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  server.listen(port, host, () => console.log(`礼物簿：http://${host}:${port}`));
  const stop = () => {
    server.close(() => pool.end().then(() => process.exit(0)));
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}
start().catch(() => {
  console.error('礼物簿启动失败，请检查数据库配置。');
  process.exit(1);
});
