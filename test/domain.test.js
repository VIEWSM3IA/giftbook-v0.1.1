const test = require('node:test');
const assert = require('node:assert/strict');
const d = require('../miniprogram/utils/domain');
test('TA：两个必填、准确枚举、八个喜好与长度边界', () => {
  assert.deepEqual(d.validateRecipient({ display_name: ' 小岚 ', relation_type: '朋友' }), {
    display_name: '小岚',
    relation_type: '朋友',
    age_range: '',
    gender: '',
    tags: [],
    note: ''
  });
  for (const patch of [
    { display_name: '' },
    { display_name: '字'.repeat(21) },
    { relation_type: '长辈' },
    { age_range: '18–25' },
    { gender: '未知' },
    { tags: d.TAGS.slice(0, 9) },
    { tags: ['未知标签'] },
    { note: '字'.repeat(201) }
  ]) {
    assert.throws(() => d.validateRecipient({ display_name: '某某', relation_type: '家人', ...patch }));
  }
  assert.equal(
    d.validateRecipient({ display_name: '🌷'.repeat(20), relation_type: '配偶', tags: d.TAGS.slice(0, 8) })
      .tags.length,
    8
  );
});
test('礼物：反应主动选择、有效历史日期、整数分、输入长度', () => {
  const valid = { recipient_id: 'a', gift_name: ' 照片书 ', reaction_level: 4 };
  assert.equal(d.validateGift(valid).gifted_at, d.today());
  assert.equal(d.validateGift(valid).gift_name, '照片书');
  for (const patch of [
    { reaction_level: undefined },
    { reaction_level: 0 },
    { reaction_level: 6 },
    { reaction_level: '3' },
    { gift_name: '字'.repeat(61) },
    { gifted_at: '2026-02-30' },
    { gifted_at: '9999-01-01' },
    { gifted_at: '' },
    { gifted_at: '0000-01-01' },
    { occasion: '测试' },
    { price_fen: -1 },
    { price_fen: 1.2 },
    { price_fen: 2147483648 },
    { note: '字'.repeat(301) }
  ])
    assert.throws(() => d.validateGift({ ...valid, ...patch }));
  assert.equal(d.validateGift({ ...valid, gifted_at: '2024-02-29', price_fen: 0 }).price_fen, 0);
});
test('金额按十进制转整数分，不能浮点截断、负值或超界', () => {
  assert.equal(d.parsePrice('19.99'), 1999);
  assert.equal(d.parsePrice('0.29'), 29);
  assert.equal(d.parsePrice(''), null);
  assert.equal(d.parsePrice('0'), 0);
  for (const bad of ['1.999', '-1', '1e3', 'Infinity', '21474836.48']) assert.throws(() => d.parsePrice(bad));
  assert.equal(d.formatPrice(1999), '19.99');
  assert.equal(d.formatPrice(0), '0');
});
test('时间日志同年只显示一次年份，跨年重新显示', () => {
  const gifts = [
    { gifted_at: '2026-09-12', occasion: '生日', price_fen: 89900, reaction_level: 4 },
    { gifted_at: '2026-02-14', occasion: '', price_fen: null, reaction_level: 2 },
    { gifted_at: '2025-10-04', occasion: '纪念日', price_fen: 0, reaction_level: 5 }
  ];
  const entries = d.giftLog(gifts);
  assert.deepEqual(entries.map((entry) => entry.log_year), ['2026', '', '2025']);
  assert.equal(entries[0].log_meta, '生日 · ¥899');
  assert.equal(entries[1].log_reaction, '还不错');
  assert.equal(entries[2].log_meta, '纪念日 · ¥0');
});
test('匿名案例：公开礼物名、固定行为证据和不重叠价格区间', () => {
  const value = { gift_name: '公开版礼物', relation_type: '朋友', age_range: '26–30', occasion: '生日', price_range: '500–999', wanted_level: '没提过', reaction_level: 4, behavior_evidence: ['used_immediately'], experience: '' };
  assert.deepEqual(d.validateCase(value).behavior_evidence, ['used_immediately']);
  assert.equal(d.evidenceLabels(value.behavior_evidence), '马上用了');
  for (const [fen, label] of [[9999,'0–99'],[10000,'100–299'],[29999,'100–299'],[30000,'300–499'],[50000,'500–999'],[100000,'1000–1499'],[150000,'1500+']]) assert.equal(d.priceRange(fen), label);
  assert.equal(d.priceRange(null), '');
  for (const patch of [{ gift_name: '' }, { gift_name: '字'.repeat(61) }, { age_range: '' }, { price_range: '899' }, { wanted_level: '' }, { reaction_level: 0 }, { behavior_evidence: [] }, { behavior_evidence: ['legacy_observed'] }, { behavior_evidence: ['used_immediately','used_immediately'] }])
    assert.throws(() => d.validateCase({ ...value, ...patch }));
});
