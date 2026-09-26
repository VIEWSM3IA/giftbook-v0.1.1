# V0.3 最终冻结报告

- 分支：`feat/v03-find-for-ta`；PR：[GitHub #1](https://github.com/VIEWSM3IA/giftbook-v0.1.1/pull/1)。
- CI：最终收口提交待 GitHub Actions 验证。

## 构建与数据

- 版本：`0.3.0`
- 迁移：`005_v03_find_for_ta.sql`，增加来源分层、负向证据和 `saved_gifts`；重复迁移及旧数据回归测试通过。
- Seed：隔离测试与本地导入均验证 `120` 条 `internal_mock`，重复导入后仍为 `120` 条。由于当前公网预览进程仍是 V0.2，已从其共用数据库清理本轮临时导入的 120 条模拟案例；清理前确认没有 `saved_gifts` 引用，清理后公开案例表为 0 行。
- 生产保护：自动化验证 Explore、Match、Case Detail、Save source lookup 均排除模拟案例，生产导入默认拒绝。
- Seed 分布：[`v03-seed-distribution.md`](v03-seed-distribution.md) 由 `data/seed_cases_v03.json` 自动生成；CI 重生成后用 `git diff --exit-code` 检查漂移。

## 最终收口

- 账号注销时，`internal_mock` 和 `verified_seed` 的 `owner_id=NULL` 案例会扣除被删除用户的 helpful 投票；投票行仍由外键级联清理。隔离数据库回归覆盖两类 Seed，均从 1 回到 0，并保留本人案例禁止 helpful 的行为。
- 案例列表和详情的 Seed `is_mine` 均稳定返回 boolean `false`。
- Seed 重导入会恢复 `status='published'`、JSON 中的礼物名和 `updated_at`；重复导入仍为 120 条。

## 产品闭环

- H5 浏览器验收：Rose → 找礼物 → 生日 / 预算 → 匹配理由 → 案例详情 → 收藏 → 想送 → 来源详情 / 移除 → 已经送了 → 私人记录 → 匿名分享入口。
- 原生小程序：结构检查和页面逻辑测试通过；未在微信开发者工具中编译或真机运行。
- 320 / 390 / 430 像素宽度：H5 无横向溢出。

## 本地检查

- `npm run check`：通过。
- `npm test`：31/31 通过。
- `npm run seed:v03`：临时数据库导入 120 条后已清理；共享公网 V0.2 数据库未导入模拟案例。
- `npm run report:v03:seed`：通过，报告由 JSON 自动生成。
- `npm run check:h5`：通过，使用隔离数据库与本地开发预览端口。
- `npm run check:v03:h5`：通过，12 张浏览器截图、无页面异常。
- `NODE_ENV=production npm run seed:v03`：按预期拒绝。
- GitHub Actions：当前基线 [Verify 运行 #36225373906](https://github.com/VIEWSM3IA/giftbook-v0.1.1/actions/runs/36225373906) 通过；本轮收口提交待验证。

证据位于 [`docs/evidence/v03/`](evidence/v03/)：12 张截图、匹配及想送 API 样本、生产保护测试输出。

## 发布门槛

- 最终优化包验收矩阵中的 P0 未解决：`0`；P1 未解决：`0`。
- **V0.3 FROZEN CANDIDATE**，等待本轮 GitHub Actions 通过后冻结。尚未在微信开发者工具中编译或真机运行，也未将本分支部署到固定公网验收地址。
- 接受的 P2：游标分页、真实 `verified_seed` 采集、排序调优、真实用户试验、微信接入。

## 部署与回退边界

本分支尚未部署。部署前须备份现有 PostgreSQL。若回退到不识别 `source_type` 的 V0.2 服务，先将 `internal_mock` 案例设为 `removed`，防止旧版公开接口把演示数据当作真实案例返回；保留 005 迁移和 `saved_gifts` 数据，不清库。源码回退不会撤销已转换的私人礼物记录。

当前固定公网入口已固定到独立 V0.2 源码副本；清理临时 Mock 后，公网 V0.2 `npm run check:h5` 回归通过。具体服务路径见 [部署说明](deployment.md)。
