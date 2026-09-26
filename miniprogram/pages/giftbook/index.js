const store = require('../../utils/store');
const domain = require('../../utils/domain');
Page({
  data: {
    user: null, avatarText: '我', avatarKey: '', recipients: [], active: null, gifts: [], cursor: null,
    loading: true, loadingLog: false, error: '', logError: '', viewMode: 'records', savedGifts: [], savedLoading: false, savedError: '',
    findOccasions: ['请选择场景', ...domain.OCCASIONS], findPrices: ['请选择预算', ...domain.PRICE_RANGES],
    findOccasion: '', findPrice: '', matches: [], matchLoading: false, matchError: '',
    sortingId: '', targetId: '', activeTabId: '', railLeft: 0, scrolled: false, statusTop: 0,
    sheet: '', sheetEditId: '', sheetFull: false, sheetBusy: false, sheetError: '', sheetExpanded: false,
    personForm: { display_name: '', relation_type: '', age_range: '', gender: '', tags: [], note: '' },
    relations: domain.RELATIONS,
    ages: ['不记录', ...domain.AGE_BUCKETS], genders: ['不记录', ...domain.GENDERS.filter((value) => value !== '不记录')],
    tagChoices: domain.TAGS.map((label) => ({ label, selected: false })),
    swipeId: ''
  },
  onLoad(query) {
    this.preferredId = query.recipient_id || '';
    this.setData({ statusTop: wx.getSystemInfoSync ? wx.getSystemInfoSync().statusBarHeight : 0 });
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
      const preserveView = !this.preferredId && this.data.active?.id === id;
      this.preferredId = '';
      const active = recipients.find((person) => person.id === id) || null;
      this.setData({ user: me.user, avatarText: Array.from(me.user.display_name || '我')[0], avatarKey: me.user.avatar_key || '', recipients, active, loading: false });
      if (id) await this.selectId(id, preserveView);
      else this.setData({ active: null, gifts: [], cursor: null });
      if (this.restoreScroll != null && wx.pageScrollTo) {
        wx.pageScrollTo({ scrollTop: this.restoreScroll, duration: 0 });
        this.restoreScroll = null;
      }
    } catch (error) {
      this.setData({ error: error.message, loading: false });
    }
  },
  async selectId(id, preserveView = false) {
    const active = this.data.recipients.find((person) => person.id === id);
    if (!active) return;
    const viewMode = preserveView ? this.data.viewMode : 'records';
    this.setData({ active, activeTabId: 'recipient-' + id, gifts: [], cursor: null, logError: '', loadingLog: true, viewMode, savedGifts: [] });
    const sequence = this.sequence = (this.sequence || 0) + 1;
    this.activeWrite = (this.activeWrite || Promise.resolve()).catch(() => {}).then(() => store.request('/v1/me/active-recipient', 'PATCH', { recipient_id: id }));
    this.activeWrite.catch((error) => wx.showToast({ title: error.message, icon: 'none' }));
    try {
      const result = await store.request('/v1/recipients/' + id + '/gifts');
      if (sequence !== this.sequence) return;
      this.setData({ gifts: domain.giftLog(result.items), cursor: result.next_cursor });
      if (viewMode === 'saved') await this.loadSaved();
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
  create() {
    this.setData({ sheet: 'person', sheetEditId: '', sheetFull: false, sheetExpanded: false, sheetError: '', personForm: { display_name: '', relation_type: '', age_range: '', gender: '', tags: [], note: '' }, tagChoices: domain.TAGS.map((label) => ({ label, selected: false })) });
  },
  edit() {
    const person = this.data.active;
    this.setData({ sheet: 'person', sheetEditId: person.id, sheetFull: true, sheetExpanded: true, sheetError: '', personForm: { ...person }, tagChoices: domain.TAGS.map((label) => ({ label, selected: person.tags.includes(label) })) });
  },
  add() {
    if (!this.data.active) return;
    this.selectComponent('#gift-sheet').open({ recipientId: this.data.active.id, recipientName: this.data.active.display_name });
  },
  giftSheetSaved() { this.setData({ viewMode: 'records' }); return this.selectId(this.data.active.id); },
  showRecords() { this.setData({ viewMode: 'records' }); },
  showSaved() { this.setData({ viewMode: 'saved' }); return this.loadSaved(); },
  async loadSaved() {
    if (!this.data.active) return;
    const id = this.data.active.id;
    this.setData({ savedLoading: true, savedError: '' });
    try {
      const savedGifts = await store.request('/v1/recipients/' + id + '/saved-gifts');
      if (this.data.active?.id === id) this.setData({ savedGifts: savedGifts.map((item) => ({ ...item, reaction_label: domain.reaction(item.source_snapshot.reaction_level).label, evidence_label: domain.evidenceLabels(item.source_snapshot.behavior_evidence) })) });
    } catch (error) { this.setData({ savedError: error.message }); }
    finally { this.setData({ savedLoading: false }); }
  },
  findGift() { if (this.data.active) this.setData({ sheet: 'find', sheetError: '', findOccasion: '', findPrice: '' }); },
  findPick(e) {
    const field = e.currentTarget.dataset.field;
    const list = field === 'findOccasion' ? this.data.findOccasions : this.data.findPrices;
    this.setData({ [field]: list[Number(e.detail.value)] === list[0] ? '' : list[Number(e.detail.value)], sheetError: '' });
  },
  async findMatches() {
    if (!this.data.findOccasion || !this.data.findPrice) { this.setData({ sheetError: '请选择场景和预算' }); return; }
    const id = this.data.active.id;
    this.setData({ sheet: 'matches', matchLoading: true, matchError: '', matches: [] });
    try {
      const query = `occasion=${encodeURIComponent(this.data.findOccasion)}&price_range=${encodeURIComponent(this.data.findPrice)}`;
      const result = await store.request('/v1/recipients/' + id + '/gift-matches?' + query);
      if (this.data.active?.id === id) this.setData({ matches: result.items.map((entry) => ({ ...entry, id: entry.case.id, reason_text: entry.match_reasons.join(' · '), reaction_label: domain.reaction(entry.case.reaction_level).label, evidence_label: domain.evidenceLabels(entry.case.behavior_evidence) })) });
    } catch (error) { this.setData({ matchError: error.message }); }
    finally { this.setData({ matchLoading: false }); }
  },
  backFind() { this.setData({ sheet: 'find' }); },
  openMatch(e) { wx.navigateTo({ url: '/pages/case/detail?id=' + e.currentTarget.dataset.id }); },
  async saveMatch(e) {
    const id = e.currentTarget.dataset.id;
    if (e.currentTarget.dataset.saved) return;
    try {
      await store.request('/v1/saved-gifts', 'POST', { recipient_id: this.data.active.id, source_case_id: id, intended_occasion: this.data.findOccasion, intended_price_range: this.data.findPrice });
      this.setData({ matches: this.data.matches.map((item) => item.case.id === id ? { ...item, saved: true } : item) });
      wx.showToast({ title: '已收藏给 TA', icon: 'none' });
    } catch (error) { this.setData({ matchError: error.message }); }
  },
  convertSaved(e) {
    const saved = this.data.savedGifts.find((item) => item.id === e.currentTarget.dataset.id);
    if (saved) this.selectComponent('#gift-sheet').open({ recipientId: this.data.active.id, recipientName: this.data.active.display_name, saved });
  },
  async savedActions(e) {
    const saved = this.data.savedGifts.find((item) => item.id === e.currentTarget.dataset.id);
    if (!saved) return;
    const choice = await new Promise((resolve) => wx.showActionSheet({ itemList: ['查看来源案例', '移除想送'], success: (r) => resolve(r.tapIndex), fail: () => resolve(-1) }));
    if (choice === 0) {
      if (saved.source_available) wx.navigateTo({ url: '/pages/case/detail?id=' + saved.source_case_id });
      else wx.showToast({ title: '来源案例已下架', icon: 'none' });
    }
    if (choice === 1) {
      const confirmed = await new Promise((resolve) => wx.showModal({ title: '移除想送？', content: '这份礼物想法将不再显示。', success: (r) => resolve(r.confirm), fail: () => resolve(false) }));
      if (!confirmed) return;
      try { await store.request('/v1/saved-gifts/' + saved.id, 'DELETE'); await this.loadSaved(); }
      catch (error) { this.setData({ savedError: error.message }); }
    }
  },
  account() { this.restoreScroll = this.scrollTop || 0; wx.navigateTo({ url: '/pages/me/index' }); },
  closeSheet() { if (!this.data.sheetBusy) this.setData({ sheet: '', sheetFull: false }); },
  expandSheet() { this.setData({ sheetFull: !this.data.sheetFull }); },
  expandFields() { this.setData({ sheetExpanded: !this.data.sheetExpanded, sheetFull: true }); },
  sheetInput(e) { this.setData({ [e.currentTarget.dataset.form + '.' + e.currentTarget.dataset.field]: e.detail.value }); },
  sheetPick(e) {
    const { form, field, options } = e.currentTarget.dataset;
    const index = Number(e.detail.value);
    this.setData({ [form + '.' + field]: options !== 'relations' && index === 0 ? '' : this.data[options][index] });
  },
  sheetTag(e) {
    const tag = e.currentTarget.dataset.tag;
    const tags = this.data.personForm.tags.slice();
    const index = tags.indexOf(tag);
    if (index >= 0) tags.splice(index, 1);
    else if (tags.length < 8) tags.push(tag);
    else { this.setData({ sheetError: '最多选择 8 个喜好' }); return; }
    this.setData({ 'personForm.tags': tags, tagChoices: domain.TAGS.map((label) => ({ label, selected: tags.includes(label) })), sheetError: '' });
  },
  async saveSheet() {
    if (this.data.sheetBusy || this.data.sheet !== 'person') return;
    this.setData({ sheetBusy: true, sheetError: '' });
    try {
      const person = await store.request('/v1/recipients' + (this.data.sheetEditId ? '/' + this.data.sheetEditId : ''), this.data.sheetEditId ? 'PATCH' : 'POST', domain.validateRecipient(this.data.personForm));
      this.setData({ sheet: '' });
      this.preferredId = person.id;
      await this.load();
      if (wx.vibrateShort) wx.vibrateShort({ type: 'light' });
    } catch (error) { this.setData({ sheetError: error.message }); }
    finally { this.setData({ sheetBusy: false }); }
  },
  async personActions() {
    const choice = await new Promise((resolve) => wx.showActionSheet({ itemList: ['编辑 TA', '调整顺序', '删除 TA'], success: (r) => resolve(r.tapIndex), fail: () => resolve(-1) }));
    if (choice === 0) this.edit();
    if (choice === 1) wx.showToast({ title: '长按上方 TA 并拖动排序', icon: 'none' });
    if (choice === 2 && await store.confirm('删除这位 TA？', 'TA 的资料和全部送礼记录将一起删除，无法恢复。')) {
      try { await store.request('/v1/recipients/' + this.data.active.id, 'DELETE'); if (wx.vibrateShort) wx.vibrateShort({ type: 'light' }); await this.load(); }
      catch (error) { this.setData({ error: error.message }); }
    }
  },
  openGift(e) {
    if (this.suppressGiftTap) { this.suppressGiftTap = false; return; }
    this.restoreScroll = this.scrollTop || 0;
    wx.navigateTo({ url: '/pages/record/detail?id=' + e.currentTarget.dataset.id });
  },
  swipeStart(e) { this.swipeStartX = e.touches?.[0]?.clientX; this.swipeStartY = e.touches?.[0]?.clientY; },
  swipeMove(e) {
    if (this.swipeStartX == null) return;
    const touch = e.touches?.[0];
    if (!touch || Math.abs(touch.clientY - this.swipeStartY) > Math.abs(touch.clientX - this.swipeStartX)) return;
    const dx = touch.clientX - this.swipeStartX;
    if (dx < -32) { this.setData({ swipeId: e.currentTarget.dataset.id }); this.suppressGiftTap = true; }
    if (dx > 32) { this.setData({ swipeId: '' }); this.suppressGiftTap = true; }
  },
  swipeEnd() { this.swipeStartX = null; setTimeout(() => { this.suppressGiftTap = false; }, 0); },
  async editGift(e) {
    const id = e.currentTarget.dataset.id;
    try {
      const gift = await store.request('/v1/gifts/' + id);
      this.selectComponent('#gift-sheet').open({ gift, recipientId: gift.recipient_id, recipientName: this.data.active.display_name });
      this.setData({ swipeId: '' });
    } catch (error) { this.setData({ logError: error.message }); }
  },
  async deleteGift(e) {
    const id = e.currentTarget.dataset.id;
    if (!await store.confirm('删除这份记录？', '删除后无法恢复，TA 的其他记录不受影响。')) return;
    try { await store.request('/v1/gifts/' + id, 'DELETE'); this.setData({ swipeId: '' }); if (wx.vibrateShort) wx.vibrateShort({ type: 'light' }); await this.selectId(this.data.active.id); }
    catch (error) { this.setData({ logError: error.message }); }
  },
  shareGift(id) {
    const gift = this.data.gifts.find((item) => item.id === id);
    if (!gift) return;
    if (gift.share_state === 'published' && gift.published_case_id) {
      wx.navigateTo({ url: '/pages/case/detail?id=' + gift.published_case_id });
    } else this.selectComponent('#case-share-sheet').open({ gift, person: this.data.active, entry: 'gift_menu' });
  },
  caseShareSaved(e) {
    this.selectId(this.data.active.id);
    wx.navigateTo({ url: '/pages/case/detail?id=' + e.detail.item.id });
  },
  async giftActions(e) {
    this.suppressGiftTap = true;
    setTimeout(() => { this.suppressGiftTap = false; }, 500);
    const id = e.currentTarget.dataset.id;
    const gift = this.data.gifts.find((item) => item.id === id);
    if (!gift) return;
    const choice = await new Promise((resolve) => wx.showActionSheet({ itemList: ['查看记录', gift.share_state === 'published' ? '查看公开分享' : '匿名分享', '编辑记录', '删除记录'], success: (result) => resolve(result.tapIndex), fail: () => resolve(-1) }));
    if (choice === 0) { this.restoreScroll = this.scrollTop || 0; wx.navigateTo({ url: '/pages/record/detail?id=' + id }); }
    if (choice === 1) this.shareGift(id);
    if (choice === 2) await this.editGift({ currentTarget: { dataset: { id } } });
    if (choice === 3) await this.deleteGift({ currentTarget: { dataset: { id } } });
  },
  onPageScroll(e) { this.scrollTop = e.scrollTop; const scrolled = e.scrollTop > 14; if (scrolled !== this.data.scrolled) this.setData({ scrolled }); },
  railScroll(e) { this.railLeft = e.detail.scrollLeft; },
  longPress(e) {
    this.suppressTap = true;
    this.setData({ sortingId: e.currentTarget.dataset.id, targetId: e.currentTarget.dataset.id });
    if (wx.vibrateShort) wx.vibrateShort({ type: 'light' });
    wx.createSelectorQuery().in(this).select('.recipient-scroll').boundingClientRect((rect) => { this.railRect = rect; }).exec();
    wx.createSelectorQuery().in(this).selectAll('.recipient-tab').boundingClientRect((rects) => { this.tabRects = rects || []; this.rectScrollLeft = this.railLeft || 0; }).exec();
  },
  dragMove(e) {
    if (!this.data.sortingId || !this.tabRects?.length) return;
    const x = e.touches?.[0]?.clientX;
    if (x == null) return;
    this.dragX = x;
    if (this.railRect) {
      this.edgeDirection = x < this.railRect.left + 32 ? -1 : x > this.railRect.right - 32 ? 1 : 0;
      if (this.edgeDirection && !this.edgeTimer) this.autoScroll();
    }
    const delta = (this.railLeft || 0) - (this.rectScrollLeft || 0);
    const index = this.tabRects.findIndex((rect) => x < rect.left + rect.width / 2 - delta);
    const target = this.data.recipients[index < 0 ? this.tabRects.length - 1 : index];
    if (target && target.id !== this.data.targetId) this.setData({ targetId: target.id });
  },
  autoScroll() {
    if (!this.data.sortingId || !this.edgeDirection) { this.edgeTimer = null; return; }
    const next = Math.max(0, (this.railLeft || 0) + this.edgeDirection * 8);
    this.railLeft = next;
    this.setData({ railLeft: next });
    const delta = next - (this.rectScrollLeft || 0);
    const index = this.tabRects.findIndex((rect) => this.dragX < rect.left + rect.width / 2 - delta);
    const target = this.data.recipients[index < 0 ? this.tabRects.length - 1 : index];
    if (target && target.id !== this.data.targetId) this.setData({ targetId: target.id });
    this.edgeTimer = setTimeout(() => this.autoScroll(), 16);
  },
  async dragEnd() {
    clearTimeout(this.edgeTimer); this.edgeTimer = null; this.edgeDirection = 0;
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
