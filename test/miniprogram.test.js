const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const domain = require('../miniprogram/utils/domain');
const mini = path.resolve(__dirname, '../miniprogram');
function harness() {
  let url = '',
    scroll = '',
    confirmation = true,
    handler = async () => null;
  const calls = [];
  const store = {
    requireSession: () => true,
    requestId: () => 'stable-request-id',
    clear() {
      calls.push(['clear']);
    },
    confirm: async () => confirmation,
    request: async (...args) => {
      calls.push(args);
      return handler(...args);
    },
    login: async () => handler()
  };
  const wx = {
    pageScrollTo(o) {
      scroll = o.selector;
    },
    navigateTo(o) {
      url = o.url;
    },
    redirectTo(o) {
      url = o.url;
    },
    switchTab(o) {
      url = o.url;
    },
    reLaunch(o) {
      url = o.url;
    }
  };
  function load(file) {
    let definition;
    const filename = path.join(mini, file),
      localRequire = createRequire(filename);
    vm.runInNewContext(
      fs.readFileSync(filename, 'utf8'),
      {
        Page: (v) => (definition = v),
        require: (name) => (name.endsWith('/utils/store') ? store : localRequire(name)),
        wx,
        setTimeout,
        clearTimeout
      },
      { filename }
    );
    return {
      ...definition,
      data: structuredClone(definition.data),
      setData(values, callback) {
        for (const [name, value] of Object.entries(values)) {
          const keys = name.split('.');
          let target = this.data;
          for (const key of keys.slice(0, -1)) target = target[key];
          target[keys.at(-1)] = value;
        }
        if (callback) callback();
      }
    };
  }
  return {
    load,
    calls,
    store,
    url: () => url,
    scroll: () => scroll,
    respond(fn) {
      handler = fn;
    },
    confirm(value) {
      confirmation = value;
    }
  };
}
const input = (field, value) => ({ currentTarget: { dataset: { field } }, detail: { value } });
const recipient = {
  id: 'r1',
  display_name: '小林',
  relation_type: '朋友',
  tags: [],
  age_range: '',
  gender: '',
  note: ''
};
const gift = {
  id: 'g1',
  recipient_id: 'r1',
  gift_name: '照片书',
  reaction_level: 4,
  gifted_at: domain.today(),
  occasion: '',
  price_fen: null,
  note: ''
};
test('原生 TA：必填校验、保存失败保留输入、成功跳转', async () => {
  const h = harness(),
    p = h.load('pages/recipient/create.js');
  await p.onLoad({});
  await p.save();
  assert.match(p.data.error, /称呼/);
  assert.equal(h.calls.length, 0);
  p.input(input('display_name', '小林'));
  p.pick({
    currentTarget: { dataset: { field: 'relation_type', options: 'relations' } },
    detail: { value: domain.RELATIONS.indexOf('朋友') }
  });
  h.respond(async () => {
    throw new Error('网络中断');
  });
  await p.save();
  assert.equal(p.data.form.display_name, '小林');
  assert.equal(p.data.error, '网络中断');
  assert.equal(p.data.busy, false);
  h.respond(async () => recipient);
  await p.save();
  assert.equal(h.url(), '/pages/giftbook/index?recipient_id=r1');
});
test('原生记录：没有默认反应、金额转分、失败重试幂等、编辑', async () => {
  const h = harness();
  h.respond(async () => recipient);
  let p = h.load('pages/record/create.js');
  await p.onLoad({ recipient_id: 'r1' });
  assert.equal(p.data.form.reaction_level, null);
  p.input(input('gift_name', '照片书'));
  await p.save();
  assert.match(p.data.error, /反应/);
  p.selectReaction({ currentTarget: { dataset: { value: 4 } } });
  p.priceInput({ detail: { value: '19.90' } });
  h.respond(async () => {
    throw new Error('连接失败');
  });
  await p.save();
  const first = h.calls.at(-1);
  assert.equal(first[2].price_fen, 1990);
  assert.equal(p.data.form.gift_name, '照片书');
  h.respond(async () => gift);
  await p.save();
  assert.equal(h.calls.at(-1)[2].request_id, first[2].request_id);
  assert.equal(h.url(), '/pages/giftbook/index?recipient_id=r1');
  h.respond(async (path) => (path.startsWith('/v1/gifts') ? gift : recipient));
  p = h.load('pages/record/create.js');
  await p.onLoad({ id: 'g1' });
  p.input(input('note', '后来一直在用'));
  await p.save();
  assert.equal(h.calls.at(-1)[1], 'PATCH');
  assert.equal(h.calls.at(-1)[2].note, '后来一直在用');
});
test('首页日志分页去重、删除确认和退出保留数据', async () => {
  const h = harness();
  h.respond(async (path) => path === '/v1/me' ? { user: { display_name: '我', last_active_recipient_id: 'r1' } } :
    path === '/v1/recipients' ? [recipient] : path.includes('cursor=') ? { items: [gift, { ...gift, id: 'g2' }], next_cursor: null } :
    path.endsWith('/gifts') ? { items: [gift], next_cursor: 'next' } : {});
  const p = h.load('pages/giftbook/index.js');
  p.onLoad({});
  await p.onShow();
  await p.more();
  assert.deepEqual(p.data.gifts.map((g) => g.id), ['g1', 'g2']);
  h.confirm(false);
  await p.deleteGift({ currentTarget: { dataset: { id: 'g1' } } });
  assert.equal(h.calls.some((c) => c[1] === 'DELETE'), false);
  const me = h.load('pages/me/index.js');
  await me.logout();
  assert.deepEqual(h.calls.at(-1), ['clear']);
  assert.equal(h.url(), '/pages/login/index');
});
test('原生保存中阻止重复提交', async () => {
  const h = harness(),
    p = h.load('pages/recipient/create.js');
  await p.onLoad({});
  p.setData({ form: recipient });
  let resolve;
  h.respond(() => new Promise((r) => (resolve = r)));
  const first = p.save();
  await p.save();
  assert.equal(h.calls.length, 1);
  resolve(recipient);
  await first;
});
test('所有原生模板事件、已注册路由文件、范围均有效', () => {
  const h = harness();
  function walk(dir) {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
  }
  for (const file of walk(mini).filter((n) => n.endsWith('.wxml'))) {
    const definition = h.load(path.relative(mini, file.replace(/\.wxml$/, '.js')));
    for (const match of fs
      .readFileSync(file, 'utf8')
      .matchAll(/(?:bind|catch)(?::)?(?:tap|change|input|submit|select)="([\w]+)"/g))
      assert.equal(typeof definition[match[1]], 'function', `${file}: ${match[1]}`);
  }
  const config = JSON.parse(fs.readFileSync(path.join(mini, 'app.json')));
  assert.equal(config.pages.length, 6);
  assert.equal(config.subpackages, undefined);
  for (const page of config.pages)
    for (const ext of ['js', 'json', 'wxml', 'wxss'])
      assert.ok(fs.existsSync(path.join(mini, `${page}.${ext}`)));
});
test('wx.request 会话 header、真实微信 code 交换与 401 清理', async () => {
  let request,
    route,
    session = '';
  const filename = path.join(mini, 'utils/store.js'),
    module = { exports: {} };
  const wx = {
    getStorageSync: () => session,
    setStorageSync: (k, v) => (session = v),
    removeStorageSync: () => (session = ''),
    reLaunch: (o) => (route = o.url),
    login: (o) => o.success({ code: 'real-code' }),
    request: (o) => (request = o)
  };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), { module, require: createRequire(filename), wx });
  const store = module.exports;
  const login = store.login();
  await Promise.resolve();
  assert.equal(request.url.endsWith('/v1/auth/wechat/login'), true);
  assert.equal(request.data.code, 'real-code');
  request.success({ statusCode: 200, data: { data: { token: 'server-token', user: { id: 'u1' } } } });
  await login;
  assert.equal(session, 'server-token');
  const failed = store.request('/v1/me');
  assert.equal(request.header.Authorization, 'Bearer server-token');
  request.success({ statusCode: 401, data: { error: { message: '登录已过期' } } });
  await assert.rejects(failed, /登录已过期/);
  assert.equal(session, '');
  assert.equal(route, '/pages/login/index');
});
test('资料加载失败时禁止用空表单覆盖已有 TA', async () => {
  const h = harness();
  h.respond(async () => {
    throw new Error('暂时无法加载');
  });
  const p = h.load('pages/recipient/create.js');
  await p.onLoad({ id: 'r1' });
  p.input(input('display_name', '小林'));
  p.setData({ 'form.relation_type': '朋友' });
  await p.save();
  assert.equal(h.calls.length, 1);
  assert.equal(p.data.ready, false);
});
test('微信登录交换失败保持未登录并展示重试提示', async () => {
  const h = harness();
  h.respond(async () => {
    throw new Error('微信登录暂不可用');
  });
  const p = h.load('pages/login/index.js');
  await p.login();
  assert.equal(p.data.error, '微信登录暂不可用');
  assert.equal(p.data.busy, false);
  assert.equal(h.url(), '');
});
test('礼物簿是唯一主空间，新增礼物在当前 TA 的 Sheet 中', async () => {
  const h = harness();
  const p = h.load('pages/giftbook/index.js');
  p.setData({ active: recipient });
  p.add();
  assert.equal(p.data.sheet, 'gift');
  assert.equal(p.data.giftForm.reaction_level, null);
  assert.equal(h.url(), '');
  p.closeSheet();
  p.create();
  assert.equal(p.data.sheet, 'person');
  const config = JSON.parse(fs.readFileSync(path.join(mini, 'app.json')));
  assert.equal(config.tabBar, undefined);
  assert.equal(config.pages.includes('pages/record/index'), false);
  assert.equal(config.pages.includes('pages/recipient/detail'), false);
});
test('首页 TA 与礼物编辑使用 Sheet，保留数据并发送 PATCH', async () => {
  const h = harness();
  h.respond(async (path, method) => {
    if (path === '/v1/gifts/g1') return gift;
    if (path === '/v1/me') return { user: { display_name: '我', last_active_recipient_id: 'r1' } };
    if (path === '/v1/recipients') return [recipient];
    if (path.endsWith('/gifts')) return { items: [gift], next_cursor: null };
    if (method === 'PATCH') return path.includes('/gifts/') ? gift : recipient;
    return {};
  });
  const p = h.load('pages/giftbook/index.js');
  p.setData({ active: recipient, recipients: [recipient] });
  p.edit();
  assert.equal(p.data.sheetEditId, 'r1');
  assert.equal(p.data.personForm.display_name, '小林');
  await p.saveSheet();
  assert.ok(h.calls.some((c) => c[0] === '/v1/recipients/r1' && c[1] === 'PATCH'));
  await p.editGift({ currentTarget: { dataset: { id: 'g1' } } });
  assert.equal(p.data.sheetEditId, 'g1');
  assert.equal(p.data.giftForm.gift_name, '照片书');
  await p.saveSheet();
  assert.ok(h.calls.some((c) => c[0] === '/v1/gifts/g1' && c[1] === 'PATCH'));
});
test('原生称呼和礼物名按 Unicode 字符校验，不截断表情符号', async () => {
  const h = harness();
  h.respond(async () => recipient);
  const p = h.load('pages/recipient/create.js');
  await p.onLoad({});
  p.setData({ form: { ...recipient, display_name: '🎁'.repeat(20) } });
  await p.save();
  assert.equal(h.calls.at(-1)[2].display_name, '🎁'.repeat(20));
  p.setData({ 'form.display_name': '🎁'.repeat(21) });
  await p.save();
  assert.match(p.data.error, /20/);
});
test('首页读取上次停留的 TA、日志并支持切换和排序', async () => {
  const h = harness();
  const another = { ...recipient, id: 'r2', display_name: '妈妈' };
  h.respond(async (path, method, data) => {
    if (path === '/v1/me') return { user: { display_name: '我', last_active_recipient_id: 'r2' } };
    if (path === '/v1/recipients') return [recipient, another];
    if (path === '/v1/recipients/order') return data.recipient_ids.map((id) => id === 'r1' ? recipient : another);
    if (path.endsWith('/gifts')) return { items: path.includes('r2') ? [] : [gift], next_cursor: null };
    return {};
  });
  const p = h.load('pages/giftbook/index.js');
  p.onLoad({});
  await p.onShow();
  assert.equal(p.data.active.id, 'r2');
  await p.selectId('r1');
  assert.equal(p.data.gifts[0].log_reaction, '很喜欢');
  assert.ok(h.calls.some((c) => c[0] === '/v1/me/active-recipient'));
  p.add();
  assert.equal(p.data.sheet, 'gift');
  p.setData({ sortingId: 'r2', targetId: 'r1' });
  await p.dragEnd();
  assert.deepEqual(p.data.recipients.map((person) => person.id), ['r2', 'r1']);
});
test('切 TA 立即读取礼物，不等待记住 TA 的写入', async () => {
  const h = harness();
  let finishPatch;
  h.respond((path) => {
    if (path === '/v1/me/active-recipient') return new Promise((resolve) => { finishPatch = resolve; });
    if (path.endsWith('/gifts')) return { items: [gift], next_cursor: null };
    return {};
  });
  const p = h.load('pages/giftbook/index.js');
  p.setData({ recipients: [recipient] });
  await p.selectId('r1');
  assert.equal(p.data.gifts.length, 1);
  assert.ok(h.calls.some((c) => c[0] === '/v1/me/active-recipient'));
  finishPatch({});
});
test('长按排序靠边时自动滚动且目标可进入屏外', async () => {
  const h = harness();
  h.respond(async (path, method, data) => path === '/v1/recipients/order' ? data.recipient_ids.map((id) => ({ ...recipient, id })) : {});
  const p = h.load('pages/giftbook/index.js');
  p.setData({ recipients: ['r1', 'r2', 'r3', 'r4'].map((id) => ({ ...recipient, id })), sortingId: 'r1', targetId: 'r1' });
  p.tabRects = [0, 70, 140, 210].map((left) => ({ left, width: 70 }));
  p.railRect = { left: 0, right: 200 };
  p.rectScrollLeft = 0;
  p.dragMove({ touches: [{ clientX: 195 }] });
  assert.ok(p.data.railLeft > 0);
  await p.dragEnd();
  assert.equal(p.edgeTimer, null);
});
test('我的昵称：Unicode长度校验、取消、网络失败保留草稿和防重保存', async () => {
  const h = harness(),
    p = h.load('pages/me/index.js');
  p.setData({ user: { id: 'u1', display_name: '旧昵称' } });
  p.editName();
  assert.equal(p.data.nickname, '旧昵称');
  p.inputName({ detail: { value: '  ' } });
  await p.saveName();
  assert.match(p.data.nameError, /1–20/);
  assert.equal(h.calls.length, 0);
  p.inputName({ detail: { value: '🎁'.repeat(21) } });
  await p.saveName();
  assert.equal(h.calls.length, 0);
  p.cancelName();
  assert.equal(p.data.editing, false);
  assert.equal(p.data.user.display_name, '旧昵称');
  p.editName();
  p.inputName({ detail: { value: '  新昵称  ' } });
  h.respond(async () => {
    throw new Error('连接中断');
  });
  await p.saveName();
  assert.equal(p.data.editing, true);
  assert.equal(p.data.nickname, '  新昵称  ');
  assert.equal(p.data.nameError, '连接中断');
  assert.equal(p.data.user.display_name, '旧昵称');
  let finish;
  h.respond(() => new Promise((resolve) => (finish = resolve)));
  const pending = p.saveName();
  const count = h.calls.length;
  await p.saveName();
  assert.equal(h.calls.length, count);
  assert.equal(h.calls.at(-1)[1], 'PATCH');
  assert.equal(h.calls.at(-1)[2].display_name, '新昵称');
  finish({ id: 'u1', display_name: '新昵称' });
  await pending;
  assert.equal(p.data.user.display_name, '新昵称');
  assert.equal(p.data.editing, false);
  assert.equal(p.data.busy, false);
  p.editName();
  p.inputName({ detail: { value: '🎁'.repeat(20) } });
  h.respond(async (path, method, data) => ({ id: 'u1', display_name: data.display_name }));
  await p.saveName();
  assert.equal(p.data.user.display_name, '🎁'.repeat(20));
});
test('可选年龄、性别、场景已填写后可重新清空', async () => {
  const h = harness(),
    p = h.load('pages/recipient/create.js');
  await p.onLoad({});
  p.setData({ form: { ...recipient, age_range: domain.AGE_BUCKETS[1], gender: '女' } });
  for (const [field, options] of [
    ['age_range', 'ages'],
    ['gender', 'genders']
  ])
    p.pick({ currentTarget: { dataset: { field, options } }, detail: { value: 0 } });
  h.respond(async () => recipient);
  await p.save();
  assert.equal(h.calls.at(-1)[2].age_range, '');
  assert.equal(h.calls.at(-1)[2].gender, '');
  const g = h.load('pages/record/create.js');
  await g.onLoad({ recipient_id: 'r1' });
  g.setData({ form: { ...gift, occasion: '生日' } });
  g.occasion({ detail: { value: 0 } });
  h.respond(async () => gift);
  await g.save();
  assert.equal(h.calls.at(-1)[2].occasion, '');
});
