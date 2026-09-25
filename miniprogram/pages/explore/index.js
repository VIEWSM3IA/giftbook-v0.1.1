const store = require('../../utils/store');
const D = require('../../utils/domain');
const filters = [
  { field: 'relation_type', label: '关系', options: ['全部', ...D.RELATIONS] },
  { field: 'age_range', label: '年龄段', options: ['全部', ...D.AGE_BUCKETS] },
  { field: 'occasion', label: '场景', options: ['全部', ...D.OCCASIONS] },
  { field: 'price_range', label: '预算', options: ['全部', ...D.PRICE_RANGES] },
  { field: 'wanted_level', label: '想要程度', options: ['全部', ...D.WANTED_LEVELS] }
];
Page({
  data: { filters, selected: {}, items: [], nextOffset: null, loading: true, error: '' },
  onShow() { if (store.requireSession()) this.load(true); },
  filter(e) {
    const field = e.currentTarget.dataset.field;
    const option = filters.find((item) => item.field === field).options[Number(e.detail.value)];
    const selected = { ...this.data.selected };
    if (option === '全部') delete selected[field]; else selected[field] = option;
    this.setData({ selected, filters: filters.map((item) => ({ ...item, active: selected[item.field] || item.label })) });
    this.load(true);
  },
  async load(reset = false) {
    if (this.data.loading && !reset) return;
    const sequence = this.sequence = (this.sequence || 0) + 1;
    this.setData({ loading: true, error: '' });
    try {
      const values = { ...this.data.selected };
      if (!reset && this.data.nextOffset != null) values.offset = this.data.nextOffset;
      const query = Object.entries(values).map(([key, value]) => encodeURIComponent(key) + '=' + encodeURIComponent(value)).join('&');
      const result = await store.request('/v1/cases?' + query);
      if (sequence !== this.sequence) return;
      this.setData({ items: (reset ? [] : this.data.items).concat(result.items.map((item) => ({ ...item, reaction: D.reaction(item.reaction_level).label }))), nextOffset: result.next_offset });
    } catch (error) { if (sequence === this.sequence) this.setData({ error: error.message }); }
    finally { if (sequence === this.sequence) this.setData({ loading: false }); }
  },
  more() { if (this.data.nextOffset != null) this.load(false); },
  open(e) { wx.navigateTo({ url: '/pages/case/detail?id=' + e.currentTarget.dataset.id }); },
  mine() { wx.navigateTo({ url: '/pages/case/mine' }); },
  async helpful(e) {
    const id = e.currentTarget.dataset.id;
    try {
      const result = await store.request('/v1/cases/' + id + '/helpful', 'POST', {});
      this.setData({ items: this.data.items.map((item) => item.id === id ? { ...item, helped: true, helpful_count: result.helpful_count } : item) });
    } catch (error) { wx.showToast({ title: error.message, icon: 'none' }); }
  }
});
