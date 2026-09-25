const store = require('../../utils/store');
const domain = require('../../utils/domain');
Page({
  data: { busy: false, error: '', statusTop: 0 },
  onLoad() {
    this.setData({ statusTop: wx.getSystemInfoSync ? wx.getSystemInfoSync().statusBarHeight : 0 });
  },
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
  },
  privacy() {
    wx.showModal({ title: '隐私说明', content: 'TA 与礼物记录仅自己可见。注销账号会删除账号及私人记录，无法恢复。', showCancel: false });
  }
});
