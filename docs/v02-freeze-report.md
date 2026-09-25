# 礼物簿 V0.2 收口报告

## 范围与版本

- V0.2 scope additions: none
- V0.3 features added: none
- 分支：`main`
- 迁移：`migrations/004_v02_frozen.sql`
- 公网 H5 验收入口：https://giftbook.91341117.xyz
- 状态：源码与 H5 验收完成；原生开发者工具编译待执行，因此暂不标记 **V0.2 FROZEN**。

## 数据与隐私

- 迁移前后固定公网数据库 `public_cases` 均为 **0** 行；迁移前备份位于部署机 `/tmp/giftbook-v02-frozen-predeploy-20260926.dump`，权限 `0600`。
- 迁移回归测试以历史案例验证了行数不变、旧行为原文进入 `behavior_legacy`、旧价格标签进入 `legacy_price_range`，重复迁移后数据仍在。
- 历史价格桶没有精确价格，编辑时必须重新确认新价格桶。历史 `legacy_observed` 仅展示为「其他明确行为」，编辑时须重新选择固定行为证据。
- 作者和第二账号的公开 API 响应证据在 [evidence/v02-frozen](evidence/v02-frozen/)；递归检查了 `owner_id`、`source_gift_id`、`recipient_id`、私人称呼/备注、精确价格、标签、性别与历史行为原文均未出现。
- 分析事件仅允许固定枚举、布尔值与计数桶；测试验证额外的礼物名称属性会被丢弃。

## 已验证

- `npm run check`：通过，7 个原生主包页面及组件路径检查通过。
- `npm test`：28 项通过，覆盖迁移、API 权限与隐私、原生页面和 Sheet、口令门禁。
- `npm run check:h5`：隔离数据库及固定公网入口均通过；手机视口 320/390/430px 无横向溢出，浏览器 `pageerror` 为 0。
- 固定公网流程：口令门禁、A 发布、B 筛选/浏览/点赞、作者编辑/下架、公开详情 404、私人礼物仍存在均通过。验收测试账号已注销。
- 12 张公网 H5 验收截图和两份公开 API 响应提交于 [evidence/v02-frozen](evidence/v02-frozen/)。
- ChatGPT 网页版对数据/API、原生组件和页面、H5、CI/验收脚本逐段审查；有效问题均已修复并复审。

## 发布门禁

- GitHub Actions：待远端提交后确认绿色状态。
- 微信开发者工具导入、编译和原生分享 Sheet 截图：当前 Linux 环境没有微信开发者工具，尚未执行。`project.config.json` 使用 `touristappid`。
- 真实微信授权、iOS/Android 真机触控：待真实 AppID 与设备环境验收。
- 已知 P0/P1 源码缺陷：0。未完成的原生编译门禁阻止 **FROZEN** 宣告。
- 已接受的后续技术债：公开案例列表仍用 offset 分页，V0.3 前评估改为游标。
