const store = require('../../utils/store');
const D = require('../../utils/domain');
const empty = () => ({ gift_name: '', relation_type: '', age_range: '', occasion: '', price_range: '', wanted_level: '', reaction_level: 0, behavior_evidence: [], experience: '' });
Component({
  data: {
    visible: false, full: false, busy: false, error: '', editId: '', giftId: '', statusTop: 0,
    form: empty(), reactionLabel: '', evidenceLabel: '', evidenceChoices: [],
    relations: D.RELATIONS, ages: D.AGE_BUCKETS, occasions: D.OCCASIONS,
    prices: D.PRICE_RANGES, wanted: D.WANTED_LEVELS, reactions: D.REACTIONS
  },
  methods: {
    open({ gift, person, caseItem, entry = 'gift_detail' }) {
      if (!caseItem && !gift?.id) return;
      const evidence = (caseItem?.behavior_evidence || []).filter((code) => D.BEHAVIOR_EVIDENCE.some((item) => item.code === code));
      const form = caseItem ? {
        gift_name: caseItem.gift_name, relation_type: caseItem.relation_type, age_range: caseItem.age_range,
        occasion: caseItem.occasion, price_range: D.PRICE_RANGES.includes(caseItem.price_range) ? caseItem.price_range : '',
        wanted_level: caseItem.wanted_level, reaction_level: caseItem.reaction_level,
        behavior_evidence: evidence, experience: caseItem.experience || ''
      } : {
        ...empty(), gift_name: gift.gift_name, relation_type: person?.relation_type || '',
        age_range: person?.age_range || '', occasion: gift.occasion || '',
        price_range: D.priceRange(gift.price_fen), reaction_level: gift.reaction_level
      };
      this.setData({
        visible: true, full: false, busy: false, error: '', editId: caseItem?.id || '',
        giftId: gift?.id || '', form, statusTop: wx.getSystemInfoSync ? wx.getSystemInfoSync().statusBarHeight : 0,
        reactionLabel: D.reaction(form.reaction_level).label, evidenceLabel: D.evidenceLabels(evidence),
        evidenceChoices: D.BEHAVIOR_EVIDENCE.map((item) => ({ ...item, selected: evidence.includes(item.code) }))
      });
      store.request('/v1/events', 'POST', { event: 'case_share_started', properties: { entry, edit: !!caseItem } }).catch(() => {});
    },
    close() { if (!this.data.busy) this.setData({ visible: false }); },
    toggleFull() {
      if (this.data.busy || this.swipedHandle) return;
      this.setData({ full: !this.data.full });
    },
    handleTouchStart(e) { this.handleStartY = e.touches?.[0]?.clientY; },
    handleTouchEnd(e) {
      if (this.data.busy || this.handleStartY == null) return;
      const delta = (e.changedTouches?.[0]?.clientY || this.handleStartY) - this.handleStartY;
      this.handleStartY = null;
      if (Math.abs(delta) < 40) return;
      this.swipedHandle = true;
      this.setData({ full: delta < 0 });
      setTimeout(() => { this.swipedHandle = false; }, 400);
    },
    pick(e) {
      if (this.data.busy) return;
      const { field, options } = e.currentTarget.dataset;
      this.setData({ ['form.' + field]: this.data[options][Number(e.detail.value)], error: '' });
    },
    input(e) {
      if (this.data.busy) return;
      this.setData({ ['form.' + e.currentTarget.dataset.field]: e.detail.value, error: '' });
    },
    reaction(e) {
      if (this.data.busy) return;
      const value = Number(e.currentTarget.dataset.value);
      this.setData({ 'form.reaction_level': value, reactionLabel: D.reaction(value).label, error: '' });
    },
    evidence(e) {
      if (this.data.busy) return;
      const code = e.currentTarget.dataset.code;
      const selected = this.data.form.behavior_evidence.slice();
      const index = selected.indexOf(code);
      if (index < 0) selected.push(code); else selected.splice(index, 1);
      this.setData({
        'form.behavior_evidence': selected, evidenceLabel: D.evidenceLabels(selected),
        evidenceChoices: D.BEHAVIOR_EVIDENCE.map((item) => ({ ...item, selected: selected.includes(item.code) })), error: ''
      });
    },
    async save() {
      if (!this.data.visible || this.data.busy) return;
      try {
        const value = D.validateCase(this.data.form);
        this.setData({ busy: true, error: '' });
        const editId = this.data.editId;
        const item = await store.request(editId ? '/v1/cases/' + editId : '/v1/cases', editId ? 'PATCH' : 'POST', editId ? value : { ...value, source_gift_id: this.data.giftId });
        this.setData({ visible: false });
        this.triggerEvent('saved', { item, editId });
      } catch (error) { this.setData({ error: error.message }); }
      finally { this.setData({ busy: false }); }
    }
  }
});
