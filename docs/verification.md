# V0.1.1 Final Polish 验收 · 2026-09-25

按最终优化包收口：原生与 H5 登录页只保留品牌、短说明、登录和隐私入口；原生首页与详情共用 Gift Sheet，详情页编辑在原页预填、PATCH 后刷新；H5 详情页同路由打开复用字段的 Gift Sheet。删除两个无入口的原生 create 页面及旧样式，原生主包剩 4 个页面。业务校验继续共用 `miniprogram/utils/domain.js`，数据库和 API 未改动。

- `npm run check`：4 个原生注册页面及组件文件、JS/JSON 语法、旧样式与旧路由检查通过。
- `npm test`：26 项通过，包括原数据迁移、TA/礼物 CRUD、原生登录结构、Gift Sheet 预填和 PATCH、详情原地刷新。
- `npm run check:h5`：本地与固定公网入口的移动浏览器完整流程通过。登录、详情编辑 Sheet 与主页在 320/390/430px 无横向溢出，浏览器无 pageerror；测试账号已注销。截图在 `/tmp/giftbook-v011-final-polish/` 和 `/tmp/giftbook-v011-final-public/`。
- 原生结构与逻辑已验证；微信开发者工具编译、真实微信授权和 iOS/Android 真机触控仍需有 AppID 的设备验收。

**V0.1.1 源码冻结**；后续产品功能进入 V0.2。

---

# V0.1.1 Native Mobile 优化验收 · 2026-09-25

本轮按附件优化移动端交互。保留原数据模型与 V0.1.1 API；首页切换 TA 不再等待保存上次 TA 的请求。长按排序靠边自动滚动；原生与 H5 的新增流程改为 Sheet，主页改为中性底色、紧凑导航与扁平日志。礼物行支持左滑编辑/删除，旧的无入口路由已移除。

- `npm run check`：6 个原生注册页面、无底部 Tab，路由文件及 JS 语法检查通过。
- `npm test`：25 项通过，含 PostgreSQL API、旧数据迁移、TA 切换无阻塞、排序靠边自动滚动、Sheet 编辑保存及账号生命周期。
- `npm run check:h5`：本地与固定公网入口均通过。覆盖 Sheet 关闭与全屏、礼物左滑、详情、鼠标及触控排序、长列表边缘自动滚动、返回后滚动位置、刷新恢复、TA/礼物 CRUD、设置与账号注销、320/390/430px 手机宽度；浏览器无 pageerror。测试账号已注销。
- 移动端截图保存于 `/tmp/giftbook-v011-evidence/` 和 `/tmp/giftbook-v011-native-public/`。
- 原生结构与逻辑已验证；微信开发者工具编译、真实微信授权和 iOS/Android 真机触控仍需有 AppID 的设备验收。

原 V0.1 数据迁移保留旧记录，迁移前数据库快照在部署机 `/tmp/giftbook-v011-predeploy-20260925.dump`。回退代码时保留新增数据库列，不清库。

---

# V0.1 历史验收记录 · 2026-09-25

结论：**固定公网 H5 验收入口可用**。本机原生小程序结构与逻辑已检查；未验证真实微信授权、开发者工具编译或实体微信设备。

## 已交付

- 原生微信小程序：8 个页面、礼物簿/记一下/我的 3 个导航入口，接入真实 API 会话流程。
- H5：TA 管理、礼物记录、画像、时间线、昵称、隐私与账号操作。
- Node API 与独立 PostgreSQL：归属校验、软删除、事务、整数金额、短期会话与请求幂等。
- 公网地址固定为 `https://giftbook.91341117.xyz/`，经 Cloudflare Tunnel 转发。应用内口令门禁保护 H5/API；源站与数据库仅监听 `127.0.0.1`。

## 实际运行的验证

- `npm test`：21 项通过，0 失败，包含真实 PostgreSQL API 集成和公网口令门禁测试。
- `npm run check`：8 个主包页面、0 个分包页面；路由文件、结构、语法和范围检查通过。
- `systemd-analyze verify deploy/giftbook-db.service deploy/giftbook-preview.service deploy/giftbook-tunnel.service`：服务单元检查通过。
- 公网 HTTP 浏览器验收：未登录可见口令页；未登录 API 与静态资源被拒绝；正确口令签发 Secure、HttpOnly、SameSite=Strict Cookie；登录后 H5 和 API 可用。
- 公网 HTTP 会 308 跳转到 HTTPS；HTTPS 响应含 HSTS。Cloudflare DNS 为代理开启的 Tunnel CNAME，Tunnel 已连接。
- 公网 Playwright H5 流程通过：空状态、TA/礼物创建编辑、失败恢复、记录详情、个人设置、退出重登、双浏览器隔离、删除及注销；320/390/430px 无横向溢出，无应用 pageerror。Cloudflare 自动注入的 Insights 脚本被站点 CSP 阻止，会在控制台显示策略提示，不影响页面功能。
- 验收截图保存在 `/tmp/giftbook-v01-evidence/`。本轮自动化账号与记录已清理。
- 独立安全复核未发现明显口令门禁绕过或公网直连源站问题；确认 Tunnel 与数据库源站只监听 IPv4 loopback。

## 边界与风险

- 公网入口使用项目共享验收口令，知道口令的人都可进入；不支持按人撤销或访问审计。请仅记录虚构验收数据，不录入私人或敏感信息，不在共用浏览器保留业务会话。
- H5 本地账号保存在各自浏览器，清除站点数据后无法凭昵称找回。
- 未使用真实微信 AppID/Secret，不代表小程序线上登录已可用。真实发布仍需配置微信凭据和合法 HTTPS API 域名。
- 机器离线或 Cloudflare Tunnel 断开时，公网入口暂不可用；三个用户级 systemd 服务已启用自动重启。

## 回退

停用公网入口时先删除 Cloudflare DNS 记录，再停止并禁用 `giftbook-tunnel`。数据库目录独立保留。恢复旧源码不会撤销数据库写入；回退前按 README 的命令备份数据库。
