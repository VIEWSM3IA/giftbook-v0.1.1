// Shared by the native Mini Program, H5 and API. No platform state belongs here.
const REACTIONS = [
  { value: 1, label: '一般' },
  { value: 2, label: '还不错' },
  { value: 3, label: '喜欢' },
  { value: 4, label: '很喜欢' },
  { value: 5, label: '特别喜欢' }
];
const RELATIONS = ['恋人', '配偶', '家人', '朋友', '同事', '领导', '客户', '其他'];
const AGE_BUCKETS = ['≤17', '18–22', '23–25', '26–30', '31–35', '36–40', '41–50', '51–60', '60+'];
const GENDERS = ['女', '男', '其他', '不记录'];
const OCCASIONS = ['生日', '纪念日', '节日', '感谢', '日常', '其他'];
const PRICE_RANGES = ['0–99', '100–299', '300–499', '500–999', '1000–1499', '1500+'];
const WANTED_LEVELS = ['明确想要', '暗示过', '没提过'];
const BEHAVIOR_EVIDENCE = [
  { code: 'happy_on_receive', label: '当场很开心' },
  { code: 'used_immediately', label: '马上用了' },
  { code: 'used_repeatedly', label: '后来经常用' },
  { code: 'mentioned_later', label: '后来主动提起过' },
  { code: 'shared_with_others', label: '分享给别人' }
];
const TAGS = [
  '阅读',
  '音乐',
  '摄影',
  '旅行',
  '运动',
  '美食',
  '咖啡',
  '茶',
  '数码',
  '游戏',
  '手作',
  '园艺',
  '艺术',
  '香氛',
  '实用',
  '仪式感'
];
function today() {
  const d = new Date();
  // The product's calendar is China time, including when the API host uses UTC.
  const china = new Date(d.getTime() + 8 * 3600000);
  return china.toISOString().slice(0, 10);
}
function reaction(level) {
  return REACTIONS.find((item) => item.value === Number(level)) || { value: null, label: '请选择 TA 的反应' };
}
function text(value, label, max, required) {
  if (value != null && typeof value !== 'string') throw new Error(`${label}格式不正确`);
  const result = (value || '').trim();
  if (required && !result) throw new Error(`请填写${label}`);
  if (Array.from(result).length > max) throw new Error(`${label}最多 ${max} 个字`);
  return result;
}
function choice(value, values, label, required) {
  if ((value === undefined || value === null || value === '') && !required) return '';
  if (!values.includes(value)) throw new Error(`请选择${label}`);
  return value;
}
function validateRecipient(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('请填写 TA 的资料');
  const tags = input.tags === undefined ? [] : input.tags;
  if (!Array.isArray(tags) || tags.length > 8 || tags.some((tag) => !TAGS.includes(tag)))
    throw new Error('请从喜好中选择，最多 8 个');
  return {
    display_name: text(input.display_name, '称呼', 20, true),
    relation_type: choice(input.relation_type, RELATIONS, '关系', true),
    age_range: choice(input.age_range, AGE_BUCKETS, '年龄段'),
    gender: choice(input.gender, GENDERS, '性别'),
    tags: [...new Set(tags)],
    note: text(input.note, '备注', 200)
  };
}
function parsePrice(value) {
  if (value === '' || value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (!/^\d{1,8}(\.\d{1,2})?$/.test(raw)) throw new Error('价格请填写不超过两位小数的非负金额');
  const parts = raw.split('.');
  const fen = Number(parts[0]) * 100 + Number(((parts[1] || '') + '00').slice(0, 2));
  if (!Number.isSafeInteger(fen) || fen > 2147483647) throw new Error('价格超出可记录范围');
  return fen;
}
function validateGift(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('请填写礼物记录');
  if (!Number.isInteger(input.reaction_level) || input.reaction_level < 1 || input.reaction_level > 5)
    throw new Error('请选择 TA 的反应');
  const date = input.gifted_at === undefined ? today() : input.gifted_at;
  if (
    typeof date !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    Number(date.slice(0, 4)) < 1 ||
    !Number.isFinite(Date.parse(date)) ||
    new Date(date).toISOString().slice(0, 10) !== date
  )
    throw new Error('请选择有效的送礼日期');
  if (date > today()) throw new Error('送礼日期不能晚于今天');
  const price = input.price_fen == null ? null : input.price_fen;
  if (price !== null && (!Number.isInteger(price) || price < 0 || price > 2147483647))
    throw new Error('价格必须是有效的非负整数分');
  return {
    recipient_id: text(input.recipient_id, 'TA', 64, true),
    gift_name: text(input.gift_name, '礼物名称', 60, true),
    reaction_level: input.reaction_level,
    gifted_at: date,
    occasion: choice(input.occasion, OCCASIONS, '场景'),
    price_fen: price,
    note: text(input.note, '备注', 300)
  };
}
function priceRange(fen) {
  if (fen == null) return '';
  const yuan = fen / 100;
  return yuan < 100 ? PRICE_RANGES[0] : yuan < 300 ? PRICE_RANGES[1] : yuan < 500 ? PRICE_RANGES[2] : yuan < 1000 ? PRICE_RANGES[3] : yuan < 1500 ? PRICE_RANGES[4] : PRICE_RANGES[5];
}
function validateCase(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('请补充分享信息');
  if (!Number.isInteger(Number(input.reaction_level)) || Number(input.reaction_level) < 1 || Number(input.reaction_level) > 5) throw new Error('请选择 TA 的实际反应');
  const evidence = input.behavior_evidence;
  if (!Array.isArray(evidence) || evidence.length < 1 || evidence.length > 5 ||
      new Set(evidence).size !== evidence.length || evidence.some((code) => !BEHAVIOR_EVIDENCE.some((item) => item.code === code)))
    throw new Error('请至少选择一项实际发生的行为');
  return {
    gift_name: text(input.gift_name, '公开礼物名称', 60, true),
    relation_type: choice(input.relation_type, RELATIONS, '关系', true),
    age_range: choice(input.age_range, AGE_BUCKETS, '年龄段', true),
    occasion: choice(input.occasion, OCCASIONS, '场景', true),
    price_range: choice(input.price_range, PRICE_RANGES, '价格区间', true),
    wanted_level: choice(input.wanted_level, WANTED_LEVELS, '对方之前是否想要', true),
    reaction_level: Number(input.reaction_level),
    behavior_evidence: evidence,
    experience: text(input.experience, '一句经验', 120)
  };
}
function evidenceLabels(codes) {
  return (codes || []).map((code) => BEHAVIOR_EVIDENCE.find((item) => item.code === code)?.label || (code === 'legacy_observed' ? '其他明确行为' : '')).filter(Boolean).join(' · ');
}
function formatPrice(fen) {
  return fen == null ? '' : (fen / 100).toFixed(2).replace(/\.00$/, '');
}
function formatDate(date) {
  if (!date) return '';
  const parts = date.slice(0, 10).split('-');
  return `${parts[0]}年${Number(parts[1])}月${Number(parts[2])}日`;
}
function giftLog(gifts) {
  let previousYear = '';
  return gifts.map((gift) => {
    const year = gift.gifted_at.slice(0, 4);
    const entry = {
      ...gift,
      log_date: `${gift.gifted_at.slice(5, 7)}月${gift.gifted_at.slice(8, 10)}日`,
      log_year: year === previousYear ? '' : year,
      log_meta: [gift.occasion, gift.price_fen == null ? '' : `¥${formatPrice(gift.price_fen)}`].filter(Boolean).join(' · '),
      log_reaction: reaction(gift.reaction_level).label
    };
    previousYear = year;
    return entry;
  });
}
const domain = {
  REACTIONS,
  RELATIONS,
  AGE_BUCKETS,
  GENDERS,
  OCCASIONS,
  PRICE_RANGES,
  WANTED_LEVELS,
  BEHAVIOR_EVIDENCE,
  TAGS,
  today,
  reaction,
  validateRecipient,
  validateGift,
  validateCase,
  evidenceLabels,
  priceRange,
  parsePrice,
  formatPrice,
  formatDate,
  giftLog
};
if (typeof module !== 'undefined' && module.exports) module.exports = domain;
if (typeof window !== 'undefined') window.GiftbookDomain = domain;
