const store = require('../../utils/store');
const domain = require('../../utils/domain');

Component({
  data: {
    visible: false, full: false, expanded: false, busy: false, error: '',
    editId: '', savedId: '', recipientId: '', recipientName: '', statusTop: 0,
    form: { gift_name: '', reaction_level: null, gifted_at: domain.today(), occasion: '', note: '' },
    price: '', today: domain.today(), reactions: domain.REACTIONS,
    occasions: ['不记录', ...domain.OCCASIONS]
  },
  methods: {
    open({ recipientId, recipientName, gift, saved }) {
      if (!recipientId) return;
      this.requestId = store.requestId();
      this.setData({
        visible: true, full: !!gift || !!saved, expanded: !!gift || !!saved, busy: false, error: '',
        editId: gift?.id || '', savedId: saved?.id || '', recipientId, recipientName,
        statusTop: wx.getSystemInfoSync ? wx.getSystemInfoSync().statusBarHeight : 0,
        today: domain.today(),
        form: gift ? {
          gift_name: gift.gift_name, reaction_level: gift.reaction_level,
          gifted_at: gift.gifted_at, occasion: gift.occasion || '', note: gift.note || ''
        } : { gift_name: saved?.gift_name || '', reaction_level: null, gifted_at: domain.today(), occasion: saved?.intended_occasion || '', note: '' },
        price: gift ? domain.formatPrice(gift.price_fen) : ''
      });
    },
    close() { if (!this.data.busy) this.setData({ visible: false }); },
    toggleFull() { this.setData({ full: !this.data.full }); },
    toggleExpanded() { this.setData({ expanded: !this.data.expanded, full: true }); },
    input(e) { this.setData({ ['form.' + e.currentTarget.dataset.field]: e.detail.value }); },
    priceInput(e) { this.setData({ price: e.detail.value }); },
    reaction(e) { this.setData({ 'form.reaction_level': Number(e.currentTarget.dataset.value) }); },
    occasion(e) {
      const index = Number(e.detail.value);
      this.setData({ 'form.occasion': index === 0 ? '' : this.data.occasions[index] });
    },
    async save() {
      if (this.data.busy || !this.data.visible) return;
      this.setData({ busy: true, error: '' });
      try {
        const payload = domain.validateGift({
          ...this.data.form, recipient_id: this.data.recipientId,
          price_fen: domain.parsePrice(this.data.price)
        });
        const id = this.data.editId;
        const gift = this.data.savedId
          ? await store.request('/v1/saved-gifts/' + this.data.savedId + '/convert', 'POST', { ...payload, request_id: this.requestId })
          : await store.request('/v1/gifts' + (id ? '/' + id : ''), id ? 'PATCH' : 'POST', id ? payload : { ...payload, request_id: this.requestId });
        this.setData({ visible: false });
        if (wx.vibrateShort) wx.vibrateShort({ type: 'light' });
        this.triggerEvent('saved', { gift, editId: id, savedId: this.data.savedId });
      } catch (error) {
        this.setData({ error: error.message });
      } finally {
        this.setData({ busy: false });
      }
    }
  }
});
