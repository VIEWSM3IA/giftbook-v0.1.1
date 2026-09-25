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
    if (!this.data.gift || !this.data.person) return;
    this.selectComponent('#gift-sheet').open({
      gift: this.data.gift,
      recipientId: this.data.gift.recipient_id,
      recipientName: this.data.person.display_name
    });
  },
  share() {
    const { gift, person } = this.data;
    if (!gift || !person) return;
    if (gift.share_state === 'published' && gift.published_case_id) {
      wx.navigateTo({ url: '/pages/case/detail?id=' + gift.published_case_id });
    } else this.selectComponent('#case-share-sheet').open({ gift, person, entry: 'gift_detail' });
  },
  caseShareSaved(e) {
    const id = e.detail.item.id;
    this.setData({ 'gift.share_state': 'published', 'gift.published_case_id': id });
    wx.navigateTo({ url: '/pages/case/detail?id=' + id });
  },
  giftSheetSaved() { return this.load(); },
  async remove() {
    if (this.data.busy) return;
    if (!(await store.confirm('删除这份记录？', '删除后无法恢复，TA 的其他记录不受影响。'))) return;
    this.setData({ busy: true, error: '' });
    try {
      await store.request('/v1/gifts/' + this.id, 'DELETE');
      if (wx.vibrateShort) wx.vibrateShort({ type: 'light' });
      wx.reLaunch({ url: '/pages/giftbook/index?recipient_id=' + this.data.gift.recipient_id });
    } catch (e) {
      this.setData({ error: e.message });
    } finally {
      this.setData({ busy: false });
    }
  }
});
