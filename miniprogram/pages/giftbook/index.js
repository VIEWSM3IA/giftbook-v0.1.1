const store = require('../../utils/store');
const domain = require('../../utils/domain');
Page({
  data: {
    user: null, avatarText: '我', avatarKey: '', recipients: [], active: null, gifts: [], cursor: null,
    loading: true, loadingLog: false, error: '', logError: '',
    sortingId: '', targetId: '', activeTabId: ''
  },
  onLoad(query) {
    this.preferredId = query.recipient_id || '';
  },
  onShow() {
    return this.load();
  },
  async load() {
    if (!store.requireSession()) return;
    this.setData({ error: '', loading: !this.data.recipients.length });
    try {
      const [me, recipients] = await Promise.all([
        store.request('/v1/me'), store.request('/v1/recipients')
      ]);
      const id = [this.preferredId, this.data.active?.id, me.user.last_active_recipient_id]
        .find((candidate) => recipients.some((person) => person.id === candidate)) || recipients[0]?.id;
      this.preferredId = '';
      const active = recipients.find((person) => person.id === id) || null;
      this.setData({ user: me.user, avatarText: Array.from(me.user.display_name || '我')[0], avatarKey: me.user.avatar_key || '', recipients, active, loading: false });
      if (id) await this.selectId(id);
      else this.setData({ active: null, gifts: [], cursor: null });
    } catch (error) {
      this.setData({ error: error.message, loading: false });
    }
  },
  async selectId(id) {
    const active = this.data.recipients.find((person) => person.id === id);
    if (!active) return;
    this.setData({ active, activeTabId: 'recipient-' + id, gifts: [], cursor: null, logError: '', loadingLog: true });
    const sequence = this.sequence = (this.sequence || 0) + 1;
    this.activeWrite = (this.activeWrite || Promise.resolve()).catch(() => {}).then(() => store.request('/v1/me/active-recipient', 'PATCH', { recipient_id: id }));
    await this.activeWrite.catch((error) => wx.showToast({ title: error.message, icon: 'none' }));
    try {
      const result = await store.request('/v1/recipients/' + id + '/gifts');
      if (sequence !== this.sequence) return;
      this.setData({ gifts: domain.giftLog(result.items), cursor: result.next_cursor });
    } catch (error) {
      if (sequence === this.sequence) this.setData({ logError: error.message });
    } finally {
      if (sequence === this.sequence) this.setData({ loadingLog: false });
    }
  },
  select(e) {
    if (this.suppressTap) { this.suppressTap = false; return; }
    this.selectId(e.currentTarget.dataset.id);
  },
  async more() {
    if (!this.data.cursor || this.data.loadingLog || !this.data.active) return;
    const id = this.data.active.id;
    this.setData({ loadingLog: true, logError: '' });
    try {
      const result = await store.request('/v1/recipients/' + id + '/gifts?cursor=' + encodeURIComponent(this.data.cursor));
      if (this.data.active?.id !== id) return;
      const seen = new Set(this.data.gifts.map((gift) => gift.id));
      this.setData({ gifts: domain.giftLog(this.data.gifts.concat(result.items.filter((gift) => !seen.has(gift.id)))), cursor: result.next_cursor });
    } catch (error) {
      this.setData({ logError: error.message });
    } finally {
      this.setData({ loadingLog: false });
    }
  },
  create() { wx.navigateTo({ url: '/pages/recipient/create' }); },
  edit() { wx.navigateTo({ url: '/pages/recipient/create?id=' + this.data.active.id }); },
  add() { wx.navigateTo({ url: '/pages/record/create?recipient_id=' + this.data.active.id }); },
  account() { wx.navigateTo({ url: '/pages/me/index' }); },
  async giftActions(e) {
    const id = e.currentTarget.dataset.id;
    const choice = await new Promise((resolve) => wx.showActionSheet({ itemList: ['查看记录', '编辑记录', '删除记录'], success: (result) => resolve(result.tapIndex), fail: () => resolve(-1) }));
    if (choice === 0) wx.navigateTo({ url: '/pages/record/detail?id=' + id });
    if (choice === 1) wx.navigateTo({ url: '/pages/record/create?id=' + id });
    if (choice === 2 && await store.confirm('删除这份记录？', '删除后无法恢复，TA 的其他记录不受影响。')) {
      try { await store.request('/v1/gifts/' + id, 'DELETE'); await this.selectId(this.data.active.id); }
      catch (error) { this.setData({ logError: error.message }); }
    }
  },
  longPress(e) {
    this.suppressTap = true;
    this.setData({ sortingId: e.currentTarget.dataset.id, targetId: e.currentTarget.dataset.id });
    wx.createSelectorQuery().in(this).selectAll('.recipient-tab').boundingClientRect((rects) => { this.tabRects = rects || []; }).exec();
  },
  dragMove(e) {
    if (!this.data.sortingId || !this.tabRects?.length) return;
    const x = e.touches?.[0]?.clientX;
    if (x == null) return;
    const index = this.tabRects.findIndex((rect) => x < rect.left + rect.width / 2);
    const target = this.data.recipients[index < 0 ? this.tabRects.length - 1 : index];
    if (target && target.id !== this.data.targetId) this.setData({ targetId: target.id });
  },
  async dragEnd() {
    const from = this.data.recipients.findIndex((p) => p.id === this.data.sortingId);
    const to = this.data.recipients.findIndex((p) => p.id === this.data.targetId);
    this.setData({ sortingId: '', targetId: '' });
    setTimeout(() => { this.suppressTap = false; }, 0);
    if (from < 0 || to < 0 || from === to) return;
    const old = this.data.recipients;
    const reordered = old.slice();
    reordered.splice(to, 0, ...reordered.splice(from, 1));
    this.setData({ recipients: reordered });
    try { this.setData({ recipients: await store.request('/v1/recipients/order', 'PATCH', { recipient_ids: reordered.map((p) => p.id) }) }); }
    catch (error) { this.setData({ recipients: old, error: error.message }); }
  }
});
