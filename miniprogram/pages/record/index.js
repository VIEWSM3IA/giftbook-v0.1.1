const store = require('../../utils/store');
Page({
  data: { recipients: [], loading: false, error: '' },
  onShow() {
    return this.load();
  },
  async load() {
    if (!store.requireSession()) return;
    this.setData({ recipients: [], loading: true, error: '' });
    try {
      this.setData({
        recipients: (await store.request('/v1/recipients')).map((p, i) => ({
          ...p,
          initial: Array.from(p.display_name)[0],
          tone: i % 4
        }))
      });
    } catch (error) {
      this.setData({ error: error.message });
    } finally {
      this.setData({ loading: false });
    }
  },
  select(e) {
    wx.navigateTo({ url: '/pages/record/create?recipient_id=' + e.currentTarget.dataset.id });
  },
  create() {
    wx.navigateTo({ url: '/pages/recipient/create' });
  }
});
