const store = require('../../utils/store');
const domain = require('../../utils/domain');
Page({
  data: { gift: null, person: null, error: '', busy: false },
  onLoad(q) {
    this.id = q.id;
  },
  onShow() {
    return this.load();
  },
  async load() {
    if (!store.requireSession()) return;
    this.setData({ error: '' });
    try {
      const gift = await store.request('/v1/gifts/' + this.id);
      const person = await store.request('/v1/recipients/' + gift.recipient_id);
      this.setData({
        gift: {
          ...gift,
          reaction: domain.reaction(gift.reaction_level).label,
          price: gift.price_fen === null ? '' : domain.formatPrice(gift.price_fen)
        },
        person
      });
    } catch (e) {
      this.setData({ error: e.message });
    }
  },
  edit() {
    wx.navigateTo({ url: '/pages/record/create?id=' + this.id });
  },
  async remove() {
    if (this.data.busy) return;
    if (!(await store.confirm('删除这份记录？', '删除后无法恢复，TA 的其他记录不受影响。'))) return;
    this.setData({ busy: true, error: '' });
    try {
      await store.request('/v1/gifts/' + this.id, 'DELETE');
      wx.reLaunch({ url: '/pages/giftbook/index?recipient_id=' + this.data.gift.recipient_id });
    } catch (e) {
      this.setData({ error: e.message });
    } finally {
      this.setData({ busy: false });
    }
  }
});
