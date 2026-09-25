const store = require('../../utils/store');
const domain = require('../../utils/domain');
const present = (gift) => ({ ...gift, reaction: domain.reaction(gift.reaction_level).label });
Page({
  data: { person: null, gifts: [], cursor: null, loading: false, error: '', busy: false, highlight: '' },
  onLoad(query) {
    this.id = query.id;
    this.focus = Boolean(query.focus);
    this.setData({ highlight: query.saved || query.focus || '' });
  },
  onShow() {
    return this.load();
  },
  async load() {
    if (!store.requireSession()) return;
    this.setData({ loading: true, error: '' });
    try {
      const [person, result] = await Promise.all([
        store.request('/v1/recipients/' + this.id),
        store.request('/v1/recipients/' + this.id + '/gifts')
      ]);
      let gifts = result.items;
      const id = this.data.highlight;
      if (id) {
        let highlighted = gifts.find((g) => g.id === id);
        if (!highlighted) {
          try {
            highlighted = await store.request('/v1/gifts/' + id);
          } catch (error) {
            this.setData({ error: error.message });
          }
        }
        if (highlighted?.recipient_id === this.id) gifts = [highlighted, ...gifts.filter((g) => g.id !== id)];
      }
      this.setData({ person, gifts: gifts.map(present), cursor: result.next_cursor }, () => {
        if (this.focus && gifts.some((g) => g.id === id))
          wx.pageScrollTo({ selector: '#gift-' + id, duration: 250 });
      });
    } catch (error) {
      this.setData({ error: error.message });
    } finally {
      this.setData({ loading: false });
    }
  },
  async more() {
    if (this.data.loading || !this.data.cursor) return;
    this.setData({ loading: true, error: '' });
    try {
      const result = await store.request(
        '/v1/recipients/' + this.id + '/gifts?cursor=' + encodeURIComponent(this.data.cursor)
      );
      const seen = new Set(this.data.gifts.map((g) => g.id));
      this.setData({
        gifts: this.data.gifts.concat(result.items.filter((g) => !seen.has(g.id)).map(present)),
        cursor: result.next_cursor
      });
    } catch (error) {
      this.setData({ error: error.message });
    } finally {
      this.setData({ loading: false });
    }
  },
  edit() {
    wx.navigateTo({ url: '/pages/recipient/create?id=' + this.id });
  },
  add() {
    wx.navigateTo({ url: '/pages/record/create?recipient_id=' + this.id });
  },
  open(e) {
    wx.navigateTo({ url: '/pages/record/detail?id=' + e.currentTarget.dataset.id });
  },
  async remove() {
    if (this.data.busy) return;
    if (!(await store.confirm('删除这位 TA？', 'TA 的资料和全部送礼记录将一起删除，无法恢复。'))) return;
    this.setData({ busy: true, error: '' });
    try {
      await store.request('/v1/recipients/' + this.id, 'DELETE');
      wx.reLaunch({ url: '/pages/giftbook/index' });
    } catch (error) {
      this.setData({ error: error.message });
    } finally {
      this.setData({ busy: false });
    }
  }
});
