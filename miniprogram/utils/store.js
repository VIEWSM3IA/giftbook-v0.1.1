const { apiBase } = require('../config');
const TOKEN_KEY = 'giftbook-v01-session';
function token() {
  return wx.getStorageSync(TOKEN_KEY) || '';
}
function clear() {
  wx.removeStorageSync(TOKEN_KEY);
}
function requireSession() {
  if (token()) return true;
  wx.reLaunch({ url: '/pages/login/index' });
  return false;
}
function request(path, method = 'GET', data) {
  return new Promise((resolve, reject) =>
    wx.request({
      url: apiBase + path,
      method,
      data,
      timeout: 15000,
      header: {
        'content-type': 'application/json',
        ...(token() ? { Authorization: 'Bearer ' + token() } : {})
      },
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) return resolve(res.data.data);
        if (res.statusCode === 401) {
          clear();
          wx.reLaunch({ url: '/pages/login/index' });
        }
        reject(new Error(res.data?.error?.message || '暂时无法完成，请稍后重试'));
      },
      fail() {
        reject(new Error('连接失败，请检查网络后重试'));
      }
    })
  );
}
async function login() {
  const code = await new Promise((resolve, reject) =>
    wx.login({
      timeout: 10000,
      success: (r) => (r.code ? resolve(r.code) : reject(new Error('微信登录失败，请重试'))),
      fail: () => reject(new Error('微信登录失败，请重试'))
    })
  );
  const session = await request('/v1/auth/wechat/login', 'POST', { code });
  wx.setStorageSync(TOKEN_KEY, session.token);
  return session;
}
function confirm(title, content) {
  return new Promise((resolve) =>
    wx.showModal({
      title,
      content,
      confirmText: '确认删除',
      confirmColor: '#B33D4F',
      success: (r) => resolve(r.confirm),
      fail: () => resolve(false)
    })
  );
}
function requestId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const n = Math.floor(Math.random() * 16);
    return (c === 'x' ? n : (n & 3) | 8).toString(16);
  });
}
module.exports = {
  hasSession: () => Boolean(token()),
  request,
  login,
  clear,
  requireSession,
  confirm,
  requestId
};
