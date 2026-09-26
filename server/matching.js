const { AGE_BUCKETS, PRICE_RANGES } = require('../miniprogram/utils/domain');

function matchCase(person, criteria, item) {
  let score = 25;
  const reasons = ['同场景'];
  if (person.relation_type === item.relation_type && person.relation_type !== '其他') {
    score += 30; reasons.unshift('关系相同');
  } else if (['恋人', '配偶'].includes(person.relation_type) && ['恋人', '配偶'].includes(item.relation_type)) {
    score += 18; reasons.unshift('关系相近');
  } else if (['同事', '领导', '客户'].includes(person.relation_type) && ['同事', '领导', '客户'].includes(item.relation_type)) {
    score += 12; reasons.unshift('关系相近');
  }
  const ageDistance = person.age_range ? Math.abs(AGE_BUCKETS.indexOf(person.age_range) - AGE_BUCKETS.indexOf(item.age_range)) : Infinity;
  if (ageDistance === 0) { score += 20; reasons.push('年龄相同'); }
  else if (ageDistance === 1) { score += 10; reasons.push('年龄相近'); }
  const budgetDelta = PRICE_RANGES.indexOf(criteria.price_range) - PRICE_RANGES.indexOf(item.price_range);
  score += budgetDelta === 0 ? 15 : budgetDelta === 1 ? 10 : budgetDelta === 2 ? 6 : budgetDelta > 2 ? 3 : budgetDelta === -1 ? 2 : 0;
  if (budgetDelta === 0) reasons.push('预算同档');
  else if (budgetDelta > 0) reasons.push('预算内');
  else if (budgetDelta === -1) reasons.push('略高于预算');
  const reaction = [0, 0, 2, 4, 6, 7][item.reaction_level] || 0;
  const evidence = item.behavior_evidence || [];
  const outcome = reaction + (evidence.includes('used_repeatedly') ? 2 : 0) +
    (evidence.includes('mentioned_later') ? 1 : 0) + (evidence.includes('shared_with_others') ? 1 : 0) -
    (evidence.includes('rarely_used') ? 2 : 0) - (evidence.includes('returned_or_exchanged') ? 3 : 0);
  score += Math.max(0, Math.min(10, outcome));
  return { case: item, match_score: score, match_reasons: reasons };
}

function sortMatches(a, b) {
  return b.match_score - a.match_score || b.case.helpful_count - a.case.helpful_count ||
    new Date(b.case.updated_at) - new Date(a.case.updated_at) || a.case.id.localeCompare(b.case.id);
}

module.exports = { matchCase, sortMatches };
