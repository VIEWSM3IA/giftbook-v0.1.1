# V0.3 验收记录

## 构建与数据

- 版本：`0.3.0`
- 迁移：`005_v03_find_for_ta.sql`，增加来源分层、负向证据和 `saved_gifts`；重复迁移及旧数据回归测试通过。
- Seed：`120` 条 `internal_mock`，重复导入后仍为 `120` 条。
- 生产保护：自动化验证 Explore、Match、Case Detail、Save source lookup 均排除模拟案例，生产导入默认拒绝。

## 产品闭环

- H5 浏览器验收：Rose → 找礼物 → 生日 / 预算 → 匹配理由 → 案例详情 → 收藏 → 想送 → 来源详情 / 移除 → 已经送了 → 私人记录 → 匿名分享入口。
- 原生小程序：结构检查和页面逻辑测试通过；未在微信开发者工具中编译或真机运行。
- 320 / 390 / 430 像素宽度：H5 无横向溢出。

## 本地检查

- `npm run check`：通过。
- `npm test`：通过。
- `npm run check:h5`：通过，使用本地开发预览端口。
- `npm run check:v03:h5`：通过，浏览器无页面异常。
- `NODE_ENV=production npm run seed:v03`：按预期拒绝。
- GitHub Actions：[Verify 运行 #36224585601](https://github.com/VIEWSM3IA/giftbook-v0.1.1/actions/runs/36224585601) 通过，包含安装、结构检查、31 项测试、Seed 导入、V0.2 回归及 V0.3 H5 浏览器闭环。

证据位于 [`docs/evidence/v03/`](evidence/v03/)：12 张截图、匹配及想送 API 样本、生产保护测试输出。

## 发布门槛

- 开发包验收矩阵中的 P0 未解决：`0`；P1 未解决：`0`。
- **V0.3 FROZEN CANDIDATE**。此结论针对仓库代码、H5 浏览器验收和 GitHub Actions；尚未在微信开发者工具中编译或真机运行，也未将本分支部署到固定公网验收地址。
- 接受的 P2：游标分页、真实 `verified_seed` 采集、排序调优、真实用户试验、微信接入。

## 部署与回退边界

本分支尚未部署。部署前须备份现有 PostgreSQL。若回退到不识别 `source_type` 的 V0.2 服务，先将 `internal_mock` 案例设为 `removed`，防止旧版公开接口把演示数据当作真实案例返回；保留 005 迁移和 `saved_gifts` 数据，不清库。源码回退不会撤销已转换的私人礼物记录。
