const store = require('../../utils/store');
Page({
  data: { items: [], loading: true, error: '' },
  onShow() { if (store.requireSession()) this.load(); },
  async load() {
    this.setData({ error: '', loading: true });
    try { this.setData({ items: await store.request('/v1/me/cases') }); }
    catch (error) { this.setData({ error: error.message }); }
    finally { this.setData({ loading: false }); }
  },
  edit(e) {
    const item = this.data.items.find((entry) => entry.id === e.currentTarget.dataset.id && entry.status === 'published');
    if (item) this.selectComponent('#case-share-sheet').open({ caseItem: item, entry: 'my_shares' });
  },
  caseShareSaved() { return this.load(); },
  open(e) { wx.navigateTo({ url: '/pages/case/detail?id=' + e.currentTarget.dataset.id }); },
  async remove(e) {
    const confirmed = await new Promise((resolve) => wx.showModal({ title: '下架这条分享？', content: '公开案例会消失，私人礼物记录仍会保留。', success: (r) => resolve(r.confirm), fail: () => resolve(false) }));
    if (!confirmed) return;
    try { await store.request('/v1/cases/' + e.currentTarget.dataset.id, 'DELETE'); await this.load(); }
    catch (error) { this.setData({ error: error.message }); }
  }
});
