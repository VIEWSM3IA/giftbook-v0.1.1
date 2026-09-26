const fs = require('node:fs');
const path = require('node:path');
const domain = require('../miniprogram/utils/domain');
const cases = require('../data/seed_cases_v03.json');

if (cases.length !== 120 || cases.some((item) => item.source_type !== 'internal_mock') ||
    new Set(cases.map((item) => item.seed_key)).size !== cases.length)
  throw new Error('V0.3 seed batch is incomplete or invalid');

function distribution(title, field, choices) {
  const counts = new Map(choices.map((choice) => [choice, 0]));
  for (const item of cases) {
    const values = field === 'behavior_evidence' ? item[field] : [item[field]];
    for (const value of values) {
      if (!counts.has(value)) throw new Error(`Unexpected ${field}: ${value}`);
      counts.set(value, counts.get(value) + 1);
    }
  }
  return `## ${title}\n\n| 类别 | 案例数 |\n| --- | ---: |\n${[...counts].map(([value, count]) => `| ${value} | ${count} |`).join('\n')}\n`;
}

const report = [
  '# V0.3 Seed Distribution Report',
  '',
  '由 `npm run report:v03:seed` 从 `data/seed_cases_v03.json` 自动生成。',
  '',
  `- 总量：${cases.length} 条`,
  `- 来源：${cases.length} 条均为 \`internal_mock\`，仅供开发和验收。`,
  '- Production：Explore、Match、Case Detail、Save 不展示或使用 `internal_mock`；生产环境默认拒绝导入。',
  '',
  distribution('关系 relation_type', 'relation_type', domain.RELATIONS),
  distribution('年龄 age_range', 'age_range', domain.AGE_BUCKETS),
  distribution('场景 occasion', 'occasion', domain.OCCASIONS),
  distribution('价格 price_range', 'price_range', domain.PRICE_RANGES),
  distribution('想要程度 wanted_level', 'wanted_level', domain.WANTED_LEVELS),
  distribution('反应 reaction_level', 'reaction_level', domain.REACTIONS.map((item) => item.value)),
  '反应等级：1=一般，2=还不错，3=喜欢，4=很喜欢，5=特别喜欢。',
  '',
  distribution('行为证据 behavior_evidence', 'behavior_evidence', domain.BEHAVIOR_EVIDENCE.map((item) => item.code)),
  '行为证据可多选，因此各项案例数之和可超过总量。',
  ''
].join('\n');

const target = path.join(__dirname, '../docs/v03-seed-distribution.md');
fs.writeFileSync(target, report);
console.log(`Generated ${path.relative(path.join(__dirname, '..'), target)}`);
