# 礼物簿 V0.1.1

围绕一个人记录送礼经历：建立 TA、维护喜好、记下礼物和反应、查看与修改送礼历史。包含原生微信小程序、H5 页面与 PostgreSQL API；不包含推荐、公开内容等后续版本功能。

## 固定公网验收地址

本项目后续统一使用 **https://giftbook.91341117.xyz/** 验收。打开后输入项目专用验收口令，再点击「开始记录」。口令保存在部署机器的 `~/.config/giftbook/access.env`，不在仓库或交付包中。公网入口经 Cloudflare Tunnel 转发，H5/API 源站与 PostgreSQL 只监听本机回环地址。

## 本机验收

固定公网地址是唯一验收入口；部署机上的源站仅供 Tunnel 访问。开发时可在项目目录运行 `npm run preview:h5 -- 43117`，默认本地端口为 `43117`。

H5 使用独立的浏览器账号，凭证保存在当前浏览器；数据保存在本机 PostgreSQL。刷新或正常退出不会删除记录，重新进入同一浏览器会恢复原账号。不同浏览器/设备的 H5 账号独立，清除站点数据会失去原账号的登录凭证。此入口只在 development 显式启用，不模拟微信登录。

`giftbook-db`、`giftbook-preview`、`giftbook-tunnel` 是用户级持久服务，异常退出会自动重启。公网验收源站只绑定 `127.0.0.1:43117`，数据库只监听 `127.0.0.1:55437`，与其他 PostgreSQL 实例隔离。

```bash
systemctl --user status giftbook-db giftbook-preview giftbook-tunnel
systemctl --user restart giftbook-preview
```

运行时服务不保证跨机器重启保留。需重新启动时，在项目目录执行：

```bash
npm ci
npm run dev:db
npm run db:migrate
npm run preview:h5 -- 43117
```

`dev:db` 使用已安装的 PostgreSQL 17，在 `~/.local/share/giftbook-v01-postgres` 建立独立开发实例。`preview:h5` 显式开启本机账号入口；需自定义环境时参见 `.env.example`（配置文件不会自动加载，需导出环境变量或用 Node `--env-file`）。测试不需要真实微信凭据。

## 微信小程序

用微信开发者工具导入仓库根目录。`miniprogram/` 是原生 WXML/WXSS/JS 工程，只有「礼物簿」一个主空间；TA 横向切换，当前 TA 的送礼记录按时间展示。API 地址在 `miniprogram/config.js`。

微信登录已经实现 `wx.login → 服务端 code2Session → 本产品会话`。未提供真实 AppID、AppSecret，当前不会伪造授权成功。实际微信登录需服务端配置 `WECHAT_APP_ID`、`WECHAT_APP_SECRET`，并将小程序 API 地址改为已配置的 HTTPS 合法域名；本次公网入口用于 H5 验收。

## 实现与验证

- `miniprogram/utils/domain.js`：三端共用的字段校验、枚举、金额与日期规则。
- `server/`：单体 API、短期会话、微信身份交换、私有资源授权。
- `migrations/001_v01.sql`、`002_v011.sql`：保留原记录，增加 TA 顺序和上次停留的 TA；迁移可重复执行。
- `h5/`：与原生端一致的功能，使用同源 API。
- [V0.1.1 交付契约](docs/v011-contract.md)：首页结构、交互、持久化与回退。
- [验收记录](docs/verification.md)：实际运行的检查及未验证边界。

```bash
npm test
npm run check
# 先启动本地 H5；复用现有 Playwright，无需新增产品依赖
PLAYWRIGHT_MODULE=/home/aj/.npm/_npx/e41f203b7505f1fb/node_modules/playwright-core npm run check:h5
```

API 测试在随机隔离的 PostgreSQL schema 内执行，完成后删除自身测试 schema；H5 测试创建独立浏览器账号并在结束时注销，不修改验收者账号。项目唯一新增运行依赖为 `pg`。

## 数据与回退

旧版浏览器/微信本地数据没有被清空，也不会自动上传为新账号记录。旧版源码快照：`/tmp/giftbook-before-v01-20260920.tar.gz`。回退先停止服务、备份 PostgreSQL，再恢复源码；源码回退不撤销新数据库中的记录，不能通过清库进行回退。

```bash
/usr/lib/postgresql/17/bin/pg_dump -h 127.0.0.1 -p 55437 -U giftbook -Fc giftbook > /tmp/giftbook-v01-backup.dump
```
