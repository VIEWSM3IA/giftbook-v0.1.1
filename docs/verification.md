# V0.1.1 验收记录 · 2026-09-25

V0.1.1 已更新固定公网 H5 验收入口。数据库升级保留旧数据，并可重复执行；迁移前的数据库快照位于部署机 `/tmp/giftbook-v011-predeploy-20260925.dump`（仅本机账号可读）。

- `npm run check`：原生小程序 8 个注册页面、无底部 Tab、WXML 路由及 JS 语法检查通过。
- `npm test`：23 项通过，包含 PostgreSQL API 排序与归属校验、上次停留 TA、旧数据迁移、共享日志分组和原生页面逻辑。
- `npm run check:h5`：独立本地服务与固定公网地址均通过。覆盖空状态、TA 创建/编辑/切换、当前 TA 新增礼物、跨年日志、记录编辑、鼠标及触控排序、刷新恢复、账号设置与重新登录、320/390/430px 手机宽度；浏览器无 pageerror。自动化验收账号已注销。
- 公网服务重启后返回 HTTP 200；口令门禁及用户级服务继续运行。

未验证：微信开发者工具编译、真实微信授权、微信头像获取以及 iOS/Android 微信真机操作。当前头像显示已保存的 `avatar_key`，无头像数据时显示昵称首字；正式微信头像来源需在有 AppID 的真机环境确认。代码回退可保留新增数据库列，不能通过清库回退。

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
