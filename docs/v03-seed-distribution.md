# V0.3 Seed Distribution Report

由 `npm run report:v03:seed` 从 `data/seed_cases_v03.json` 自动生成。

- 总量：120 条
- 来源：120 条均为 `internal_mock`，仅供开发和验收。
- Production：Explore、Match、Case Detail、Save 不展示或使用 `internal_mock`；生产环境默认拒绝导入。

## 关系 relation_type

| 类别 | 案例数 |
| --- | ---: |
| 恋人 | 15 |
| 配偶 | 15 |
| 家人 | 15 |
| 朋友 | 15 |
| 同事 | 15 |
| 领导 | 15 |
| 客户 | 15 |
| 其他 | 15 |

## 年龄 age_range

| 类别 | 案例数 |
| --- | ---: |
| ≤17 | 0 |
| 18–22 | 15 |
| 23–25 | 15 |
| 26–30 | 15 |
| 31–35 | 15 |
| 36–40 | 15 |
| 41–50 | 15 |
| 51–60 | 15 |
| 60+ | 15 |

## 场景 occasion

| 类别 | 案例数 |
| --- | ---: |
| 生日 | 20 |
| 纪念日 | 20 |
| 节日 | 20 |
| 感谢 | 20 |
| 日常 | 20 |
| 其他 | 20 |

## 价格 price_range

| 类别 | 案例数 |
| --- | ---: |
| 0–99 | 24 |
| 100–299 | 18 |
| 300–499 | 18 |
| 500–999 | 24 |
| 1000–1499 | 18 |
| 1500+ | 18 |

## 想要程度 wanted_level

| 类别 | 案例数 |
| --- | ---: |
| 明确想要 | 40 |
| 暗示过 | 40 |
| 没提过 | 40 |

## 反应 reaction_level

| 类别 | 案例数 |
| --- | ---: |
| 1 | 10 |
| 2 | 10 |
| 3 | 30 |
| 4 | 40 |
| 5 | 30 |

反应等级：1=一般，2=还不错，3=喜欢，4=很喜欢，5=特别喜欢。

## 行为证据 behavior_evidence

| 类别 | 案例数 |
| --- | ---: |
| happy_on_receive | 50 |
| used_immediately | 30 |
| used_repeatedly | 40 |
| mentioned_later | 20 |
| shared_with_others | 10 |
| polite_thanks_only | 0 |
| rarely_used | 10 |
| returned_or_exchanged | 10 |

行为证据可多选，因此各项案例数之和可超过总量。
