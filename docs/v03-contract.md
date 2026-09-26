# V0.3 交付契约

## 目标

在当前 TA 下选择场景和预算，查看按关系、年龄、预算与结果排序的公开案例；收藏给 TA 后，可在「想送」里查看、移除或转成私人礼物记录。生成的记录继续支持 V0.2 匿名分享。

## 数据与边界

- `public_cases.source_type` 区分 `user_generated`、`verified_seed`、`internal_mock`。`internal_mock` 只在非生产环境的公开接口出现，UI 标明「演示案例」；不会计入真实案例互动事件。
- `npm run seed:v03` 从 `data/seed_cases_v03.json` 幂等导入 120 条模拟案例。`NODE_ENV=production` 默认拒绝，只有显式设置 `ALLOW_INTERNAL_MOCK_IMPORT=true` 才可导入；生产 API 仍排除模拟案例。
- 匹配只读取 TA 的关系与年龄，以及用户选的场景与预算。场景是硬过滤；分数仅用于排序，界面展示事实理由，不展示分数或成功率。
- 收藏保存公开案例快照，不保存来源用户、来源礼物 ID、私人备注或精确价格。来源案例下架后，想送仍保留快照，来源入口不可用。
- `saved_gifts` 状态为 `saved`、`gifted`、`removed`。移除是软删除；转换在同一事务里创建礼物记录、设为 `gifted` 并写入 `linked_gift_id`，重复 `request_id` 不重复创建。
- 「记录 / 想送」是 TA 页面二级切换；默认显示记录。原生小程序与 H5 验收预览保持相同流程。

## API

| 方法 | 路径 | 作用 |
|---|---|---|
| GET | `/v1/recipients/:id/gift-matches?occasion=…&price_range=…&limit=20` | 按规则返回案例、分数和理由；验证 TA 所有权 |
| POST | `/v1/saved-gifts` | 收藏公开且当前环境可见的案例；同 TA 同案例幂等 |
| GET | `/v1/recipients/:id/saved-gifts` | 仅当前用户的 `saved` 想送 |
| DELETE | `/v1/saved-gifts/:id` | 软移除想送 |
| POST | `/v1/saved-gifts/:id/convert` | 幂等、原子地生成私人礼物记录 |

V0.3 不接真实微信发布链路，不增加 AI、购买、评论、关注或私信。
