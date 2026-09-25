const store = require('../../utils/store');
Page({
  data: {
    user: null,
    stats: { recipients: 0, gifts: 0 },
    error: '',
    busy: false,
    editing: false,
    nickname: '',
    nameError: ''
  },
  onShow() {
    return this.load();
  },
  async load() {
    if (!store.requireSession()) return;
    this.setData({ error: '' });
    try {
      this.setData(await store.request('/v1/me'));
    } catch (error) {
      this.setData({ error: error.message });
    }
  },
  editName() {
    if (this.data.busy || !this.data.user) return;
    this.setData({ editing: true, nickname: this.data.user.display_name, nameError: '' });
  },
  inputName(event) {
    this.setData({ nickname: event.detail.value });
  },
  cancelName() {
    if (!this.data.busy) this.setData({ editing: false, nickname: '', nameError: '' });
  },
  async saveName() {
    if (this.data.busy) return;
    const display_name = this.data.nickname.trim();
    if (!display_name || Array.from(display_name).length > 20) {
      this.setData({ nameError: '昵称请填写 1–20 个字' });
      return;
    }
    this.setData({ busy: true, nameError: '' });
    try {
      const user = await store.request('/v1/me', 'PATCH', { display_name });
      this.setData({ user, editing: false, nickname: '' });
    } catch (error) {
      this.setData({ nameError: error.message });
    } finally {
      this.setData({ busy: false });
    }
  },
  privacy() {
    wx.showModal({ title: '隐私与数据', content: 'TA 与礼物记录默认仅自己可见。主动匿名分享时，只有确认的案例字段公开，TA 称呼与私人备注不公开；可在“我的分享”下架。退出登录保留记录；注销账号删除账号及分享。', showCancel: false });
  },
  about() {
    wx.showModal({ title: '关于礼物簿', content: '围绕具体的 TA，记下送过什么，以及 TA 的真实反应。', showCancel: false });
  },
  async logout() {
    if (this.data.busy) return;
    this.setData({ busy: true, error: '' });
    try {
      await store.request('/v1/auth/logout', 'POST');
      store.clear();
      wx.reLaunch({ url: '/pages/login/index' });
    } catch (error) {
      this.setData({ error: error.message });
    } finally {
      this.setData({ busy: false });
    }
  },
  async remove() {
    if (this.data.busy) return;
    if (!(await store.confirm('注销账号？', '账号、所有 TA 和送礼记录都会永久删除，无法恢复。'))) return;
    this.setData({ busy: true, error: '' });
    try {
      await store.request('/v1/me', 'DELETE');
      store.clear();
      wx.reLaunch({ url: '/pages/login/index' });
    } catch (error) {
      this.setData({ error: error.message });
    } finally {
      this.setData({ busy: false });
    }
  }
});
