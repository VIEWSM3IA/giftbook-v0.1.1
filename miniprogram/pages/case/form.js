const store = require('../../utils/store');
const D = require('../../utils/domain');
Page({
  data: {
    giftId: '', caseId: '', giftName: '', reactionLabel: '', busy: false, error: '', loading: true, unavailable: false,
    form: { relation_type: '', age_range: '', occasion: '', price_range: '', wanted_level: '', reaction_level: 0, behavior: '', experience: '' },
    relations: D.RELATIONS, ages: D.AGE_BUCKETS, occasions: D.OCCASIONS,
    prices: D.PRICE_RANGES, wanted: D.WANTED_LEVELS, reactions: D.REACTIONS
  },
  async onLoad(q) {
    if (!store.requireSession()) return;
    try {
      if (q.case_id) {
        const cases = await store.request('/v1/me/cases');
        const item = cases.find((entry) => entry.id === q.case_id && entry.status === 'published');
        if (!item) throw new Error('分享不存在或已下架');
        this.setData({ caseId: item.id, giftName: item.gift_name, reactionLabel: D.reaction(item.reaction_level).label, form: item, loading: false });
      } else {
        const gift = await store.request('/v1/gifts/' + q.gift_id);
        const person = await store.request('/v1/recipients/' + gift.recipient_id);
        this.setData({ giftId: gift.id, giftName: gift.gift_name, reactionLabel: D.reaction(gift.reaction_level).label, loading: false, form: {
          relation_type: person.relation_type, age_range: person.age_range,
          occasion: gift.occasion, price_range: D.priceRange(gift.price_fen),
          wanted_level: '', reaction_level: gift.reaction_level, behavior: '', experience: ''
        } });
      }
    } catch (error) { this.setData({ error: error.message, loading: false, unavailable: true }); }
  },
  pick(e) {
    const { field, options } = e.currentTarget.dataset;
    this.setData({ ['form.' + field]: this.data[options][Number(e.detail.value)], error: '' });
  },
  input(e) { this.setData({ ['form.' + e.currentTarget.dataset.field]: e.detail.value }); },
  reaction(e) { const value = Number(e.currentTarget.dataset.value); this.setData({ 'form.reaction_level': value, reactionLabel: D.reaction(value).label }); },
  async save() {
    if (this.data.busy || this.data.unavailable) return;
    try {
      const value = D.validateCase(this.data.form);
      this.setData({ busy: true, error: '' });
      const item = await store.request(this.data.caseId ? '/v1/cases/' + this.data.caseId : '/v1/cases', this.data.caseId ? 'PATCH' : 'POST', this.data.caseId ? value : { ...value, source_gift_id: this.data.giftId });
      if (this.data.caseId) wx.navigateBack();
      else wx.redirectTo({ url: '/pages/case/detail?id=' + item.id });
    } catch (error) { this.setData({ error: error.message }); }
    finally { this.setData({ busy: false }); }
  }
});
