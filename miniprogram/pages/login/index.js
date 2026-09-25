const store = require('../../utils/store');
const domain = require('../../utils/domain');
Page({
  data: { busy: false, error: '' },
  onShow() {
    if (store.hasSession()) wx.reLaunch({ url: '/pages/giftbook/index' });
  },
  async login() {
    if (this.data.busy) return;
    this.setData({ busy: true, error: '' });
    try {
      await store.login();
      wx.reLaunch({ url: '/pages/giftbook/index' });
    } catch (e) {
      this.setData({ error: e.message });
    } finally {
      this.setData({ busy: false });
    }
  }
});
