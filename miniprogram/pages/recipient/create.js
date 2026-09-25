const store = require('../../utils/store');
const domain = require('../../utils/domain');
Page({
  data: {
    id: '',
    form: { display_name: '', relation_type: '', age_range: '', gender: '', tags: [], note: '' },
    relations: domain.RELATIONS,
    ages: ['不记录', ...domain.AGE_BUCKETS],
    genders: ['不记录', ...domain.GENDERS.filter((value) => value !== '不记录')],
    tags: domain.TAGS.map((label) => ({ label, selected: false })),
    expanded: false,
    busy: false,
    loading: false,
    ready: false,
    error: ''
  },
  async onLoad(q) {
    if (!store.requireSession()) return;
    this.id = q.id || '';
    this.setData({ id: this.id, ready: !this.id });
    if (this.id) await this.load();
  },
  async load() {
    this.setData({ loading: true, error: '' });
    try {
      const form = await store.request('/v1/recipients/' + this.id);
      this.setData({
        form,
        ready: true,
        expanded: true,
        tags: domain.TAGS.map((label) => ({ label, selected: form.tags.includes(label) }))
      });
    } catch (e) {
      this.setData({ error: e.message });
    } finally {
      this.setData({ loading: false });
    }
  },
  input(e) {
    this.setData({ ['form.' + e.currentTarget.dataset.field]: e.detail.value });
  },
  pick(e) {
    const { field, options } = e.currentTarget.dataset;
    const index = Number(e.detail.value);
    this.setData({
      ['form.' + field]: options !== 'relations' && index === 0 ? '' : this.data[options][index]
    });
  },
  toggle() {
    this.setData({ expanded: !this.data.expanded });
  },
  tag(e) {
    const tag = e.currentTarget.dataset.tag;
    const tags = [...this.data.form.tags];
    const i = tags.indexOf(tag);
    if (i >= 0) tags.splice(i, 1);
    else {
      if (tags.length >= 8) {
        this.setData({ error: '最多选择 8 个标签' });
        return;
      }
      tags.push(tag);
    }
    this.setData({
      'form.tags': tags,
      tags: domain.TAGS.map((label) => ({ label, selected: tags.includes(label) })),
      error: ''
    });
  },
  async save() {
    if (this.data.busy || this.data.loading || !this.data.ready) return;
    this.setData({ busy: true, error: '' });
    try {
      const payload = domain.validateRecipient(this.data.form);
      const r = await store.request(
        '/v1/recipients' + (this.id ? '/' + this.id : ''),
        this.id ? 'PATCH' : 'POST',
        payload
      );
      wx.reLaunch({ url: '/pages/giftbook/index?recipient_id=' + r.id });
    } catch (e) {
      this.setData({ error: e.message });
    } finally {
      this.setData({ busy: false });
    }
  },
  async remove() {
    if (!this.id || this.data.busy) return;
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
