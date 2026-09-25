const store = require('../../utils/store');
const D = require('../../utils/domain');
Page({
  data: { item: null, error: '', loading: true },
  onLoad(q) { this.id = q.id; },
  onShow() { if (store.requireSession()) this.load(); },
  async load() {
    this.setData({ error: '', loading: true, item: null });
    try { const item = await store.request('/v1/cases/' + this.id); this.setData({ item: { ...item, reaction: D.reaction(item.reaction_level).label, evidence_label: D.evidenceLabels(item.behavior_evidence) } }); }
    catch (error) { this.setData({ error: error.message }); }
    finally { this.setData({ loading: false }); }
  },
  async helpful() {
    try { const result = await store.request('/v1/cases/' + this.id + '/helpful', 'POST', {}); this.setData({ 'item.helped': true, 'item.helpful_count': result.helpful_count }); }
    catch (error) { this.setData({ error: error.message }); }
  }
});
