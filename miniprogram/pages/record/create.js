const store = require('../../utils/store');
const domain = require('../../utils/domain');
Page({
  data: {
    id: '',
    person: null,
    form: {
      recipient_id: '',
      gift_name: '',
      reaction_level: null,
      gifted_at: '',
      occasion: '',
      price_fen: null,
      note: ''
    },
    price: '',
    reactions: domain.REACTIONS,
    occasions: ['不记录', ...domain.OCCASIONS],
    today: domain.today(),
    expanded: false,
    busy: false,
    loading: false,
    error: ''
  },
  async onLoad(q) {
    if (!store.requireSession()) return;
    this.id = q.id || '';
    this.requestId = store.requestId();
    this.setData({
      id: this.id,
      'form.gifted_at': domain.today(),
      'form.recipient_id': q.recipient_id || ''
    });
    await this.load();
  },
  async load() {
    this.setData({ loading: true, error: '' });
    try {
      if (this.id) {
        const form = await store.request('/v1/gifts/' + this.id);
        this.setData({
          form,
          price: form.price_fen === null ? '' : String(form.price_fen / 100),
          expanded: true
        });
      }
      const person = await store.request('/v1/recipients/' + this.data.form.recipient_id);
      this.setData({ person });
    } catch (e) {
      this.setData({ error: e.message });
    } finally {
      this.setData({ loading: false });
    }
  },
  input(e) {
    this.setData({ ['form.' + e.currentTarget.dataset.field]: e.detail.value });
  },
  priceInput(e) {
    this.setData({ price: e.detail.value });
  },
  selectReaction(e) {
    this.setData({ 'form.reaction_level': Number(e.currentTarget.dataset.value) });
  },
  occasion(e) {
    const index = Number(e.detail.value);
    this.setData({ 'form.occasion': index === 0 ? '' : this.data.occasions[index] });
  },
  toggle() {
    this.setData({ expanded: !this.data.expanded });
  },
  async save() {
    if (this.data.busy || this.data.loading || !this.data.person) return;
    this.setData({ busy: true, error: '' });
    try {
      const payload = domain.validateGift({
        ...this.data.form,
        price_fen: domain.parsePrice(this.data.price)
      });
      if (!this.id) payload.request_id = this.requestId;
      const gift = await store.request(
        '/v1/gifts' + (this.id ? '/' + this.id : ''),
        this.id ? 'PATCH' : 'POST',
        payload
      );
      wx.reLaunch({ url: '/pages/giftbook/index?recipient_id=' + gift.recipient_id });
    } catch (e) {
      this.setData({ error: e.message });
    } finally {
      this.setData({ busy: false });
    }
  }
});
