# 礼物簿公网验收部署

## 固定入口

- 验收地址：`https://giftbook.91341117.xyz/`
- Cloudflare Tunnel：`giftbook-acceptance`
- Tunnel 源站：`http://127.0.0.1:43117`
- PostgreSQL：`127.0.0.1:55437`
- DNS：代理开启的 CNAME，目标为 Tunnel 的 `<tunnel-id>.cfargotunnel.com`

此项目用应用内共享口令保护验收入口。Cloudflare Access 未配置；持有验收口令的人可以进入 H5。H5 使用浏览器本地账号，数据库与账号数据保留在部署机的独立 PostgreSQL 实例中。

## 当前部署状态

2026-09-25 已更新至 V0.2 匿名案例预览。新增 `public_cases` 与 `case_helpful` 表；迁移前备份为 `/tmp/giftbook-v02-predeploy-20260925.dump`，仅部署用户可读。回退旧版代码时保留新增表，旧版可继续读取私有数据；恢复 V0.2 代码并重启服务即可再次读取公开案例。若需要恢复迁移前数据库，必须先停止服务并另存当前数据库，再使用该备份恢复；这会丢失备份之后的全部写入。

子域名 DNS、Tunnel 路由和 HTTPS 已配置。Cloudflare Tunnel 已连接到源站；公网匿名请求只会看到口令页，未登录的 API 和静态资源被拦截，成功登录后 H5 与 API 可用。HTTP 请求会跳转到 HTTPS，HTTPS 响应附带 HSTS。入口由 Cloudflare Tunnel 转发，Node 和 PostgreSQL 均只监听本机回环地址，没有向公网开放服务端口。

`giftbook-db`、`giftbook-preview`、`giftbook-tunnel` 是已启用的用户级 systemd 服务。PostgreSQL 使用 `~/.local/share/giftbook-v01-postgres`，与机器上的其他数据库实例隔离。用户服务通过 systemd linger 在用户退出后继续运行。

```bash
systemctl --user status giftbook-db giftbook-preview giftbook-tunnel
systemctl --user restart giftbook-preview giftbook-tunnel
```

## 本机凭据

机器上的 `~/.config/giftbook/access.env` 保存随机验收口令与 Cookie 签名密钥，文件权限为 `0600`，目录权限为 `0700`；`~/.config/giftbook/cloudflared-tunnel.token` 也为 `0600`。这些凭据不进入源码、日志或交付包。需更换口令时更新 `PREVIEW_ACCESS_PASSWORD` 并重启 `giftbook-preview`。

公网口令门禁要求 HTTPS 固定来源 `https://giftbook.91341117.xyz`，缺少或跨来源登录请求会被拒绝。登录 Cookie 为 HttpOnly、Secure、SameSite=Strict，12 小时过期；单个客户端 15 分钟最多可失败 8 次。Tunnel 源站绑定 `127.0.0.1`，因此 `CF-Connecting-IP` 仅由 Cloudflare Tunnel 转发到应用。

## 维护与回退

不要将 Node、PostgreSQL 或 SSH 端口映射到公网。日常验收请始终使用固定子域名。部署服务文件位于 `deploy/`；重新安装或替换服务后运行：

```bash
systemctl --user daemon-reload
systemctl --user restart giftbook-db giftbook-preview giftbook-tunnel
```

停用公网入口时，先删除 Cloudflare DNS 记录，再停止并禁用 `giftbook-tunnel`。保留数据库目录；恢复公网入口只需重新创建指向原 Tunnel 的代理 CNAME 并启动 Tunnel 服务。
