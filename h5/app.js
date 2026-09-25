(() => {
  'use strict';
  const D = window.GiftbookDomain;
  const app = document.getElementById('app');
  const tabs = document.getElementById('tabs');
  const dialog = document.getElementById('dialog');
  const TOKEN_KEY = 'giftbook_v01_token';
  const DEVICE_KEY = 'giftbook_v01_device';
  let token = localStorage.getItem(TOKEN_KEY) || '';
  let user = null,
    routeVersion = 0,
    current = null,
    toastTimer,
    localLogin = false,
    suppressTabClick = false,
    sortTimer = null,
    sortState = null,
    touchState = null,
    giftTouch = null,
    suppressGiftClick = false,
    sheetBackground = '',
    homeScroll = 0,
    activeWrite = Promise.resolve();
  const e = (value) =>
    String(value == null ? '' : value).replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
    );
  const paths = {
    book: 'M4 4h13a3 3 0 0 1 3 3v14H6a2 2 0 0 1-2-2V4Zm0 13h16M8 4v13m6-13v8l2-1.5 2 1.5V4',
    back: 'm14 5-7 7 7 7',
    chevron: 'm9 5 7 7-7 7'
  };
  function icon(name, cls = '') {
    return `<svg class="icon ${cls}" viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[name] || paths.book}"/></svg>`;
  }
  function nav(to) {
    if (current?.type === 'home' && !to.startsWith('home')) homeScroll = scrollY;
    if (to === 'person-new' || to.startsWith('record/') || to.startsWith('person-edit/') || to.startsWith('gift-edit/') || to.startsWith('case-new/') || to.startsWith('case-edit/'))
      sheetBackground = app.innerHTML;
    else if (!to.startsWith('gift/')) sheetBackground = '';
    if (location.hash.slice(1) === to) render();
    else location.hash = to;
  }
  function brand() {
    return `<span class="brand">${icon('book')}礼物簿</span>`;
  }
  function top(back = '', right = '') {
    return `<div class="topline">${back ? `<button class="back" data-go="${e(back)}">${icon('back')}返回</button>` : brand()}${right}</div>`;
  }
  function sheetFrame(back, content, detail = false) {
    const close = detail ? 'data-action="close-detail-sheet"' : `data-go="${e(back)}"`;
    const background = detail ? '<div id="detail-sheet">' : `<div class="sheet-background" aria-hidden="true">${sheetBackground}</div>`;
    return `${background}<button class="sheet-backdrop" ${close} aria-label="关闭表单"></button><section class="form-sheet ${detail ? 'full' : ''}" role="dialog" aria-modal="true"><button class="sheet-handle" data-action="sheet-expand" aria-label="展开或收起表单"><span></span></button><button class="sheet-close" ${close} aria-label="关闭">×</button><div class="sheet-scroll">${content}</div></section>${detail ? '</div>' : ''}`;
  }
  function toast(message) {
    const el = document.getElementById('toast');
    clearTimeout(toastTimer);
    el.textContent = message;
    el.className = 'show';
    toastTimer = setTimeout(() => (el.className = ''), 2400);
  }
  function showError(error) {
    const el = document.getElementById('form-error');
    if (el) {
      el.textContent = error.message;
      el.scrollIntoView({ block: 'nearest' });
    } else toast(error.message);
  }
  function uuid() {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    const hex = Array.from(bytes, (n) => n.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  function clearPrivate() {
    token = '';
    user = null;
    current = null;
    localStorage.removeItem(TOKEN_KEY);
    Object.keys(sessionStorage)
      .filter((k) => k.startsWith('giftbook_v01_draft'))
      .forEach((k) => sessionStorage.removeItem(k));
  }
  async function api(path, method = 'GET', body) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch('/v1' + path, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: 'Bearer ' + token } : {})
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: controller.signal
      });
      const result = await response.json();
      if (!response.ok) {
        if (response.status === 401) {
          clearPrivate();
          if (location.hash !== '#welcome') nav('welcome');
        }
        const error = new Error(result.error?.message || '暂时无法完成，请重试');
        error.status = response.status;
        throw error;
      }
      return result.data;
    } catch (error) {
      if (error.name === 'AbortError') throw new Error('连接超时，内容已保留，请重试');
      if (error instanceof TypeError) throw new Error('网络连接失败，请检查网络后重试');
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
  function hideTabs() {
    tabs.className = '';
    tabs.innerHTML = '';
    tabs.hidden = true;
  }
  function showTabs(active) {
    tabs.hidden = false;
    tabs.className = 'bottom-nav';
    tabs.innerHTML = `<button data-go="home" class="${active === 'home' ? 'active' : ''}" ${active === 'home' ? 'aria-current="page"' : ''}>礼物簿</button><button data-go="cases" class="${active === 'cases' ? 'active' : ''}" ${active === 'cases' ? 'aria-current="page"' : ''}>看看</button>`;
  }
  function welcome() {
    hideTabs();
    app.classList.add('login-screen');
    app.innerHTML = `<section class="login-native"><div class="login-main"><h1>礼物簿</h1><p>记录送给重要的人什么。</p></div><div class="login-actions"><div id="form-error" class="error" role="alert"></div><button class="login-primary" data-action="login">${localLogin ? '开始记录' : '微信登录'}</button><button class="privacy-link" data-action="privacy">隐私说明</button></div></section>`;
  }
  function bookHeader() {
    const avatar = user?.avatar_key
      ? `<img src="${e(user.avatar_key)}" alt="">`
      : e(Array.from(user?.display_name || '我')[0]);
    return `<header class="book-header"><button class="book-avatar" data-go="me" aria-label="账号与设置">${avatar}</button><h1>礼物簿</h1><span class="book-header-space"></span></header>`;
  }
  function recipientTabs(people, activeId) {
    return `<nav class="recipient-switcher" aria-label="切换 TA"><div class="recipient-scroll">${people.map((p) => `<button class="recipient-tab ${p.id === activeId ? 'active' : ''}" data-recipient-id="${e(p.id)}" ${p.id === activeId ? 'aria-current="page"' : ''} title="${e(p.display_name)}">${e(p.display_name)}</button>`).join('')}</div><button class="recipient-add" data-go="person-new" aria-label="添加 TA">＋</button></nav>`;
  }
  function logHTML(gifts) {
    if (!gifts.length) return `<div class="log-empty"><h3>还没有礼物记录</h3><button data-action="add-gift">记第一份</button></div>`;
    return D.giftLog(gifts).map((g) => `<div class="log-shell" id="gift-${e(g.id)}"><div class="swipe-actions"><button data-go="gift-edit/${e(g.id)}">编辑</button><button data-action="delete-inline" data-id="${e(g.id)}">删除</button></div><article class="log-entry" data-gift-id="${e(g.id)}" tabindex="0" role="button" aria-label="查看${e(g.gift_name)}"><time class="log-date" datetime="${e(g.gifted_at)}"><strong>${e(g.log_date)}</strong>${g.log_year ? `<span>${e(g.log_year)}</span>` : ''}</time><div class="log-title-row"><h3>${e(g.gift_name)}</h3><button class="log-more" data-action="gift-menu" data-id="${e(g.id)}" aria-label="${e(g.gift_name)}更多操作">•••</button></div>${g.log_meta ? `<p class="log-meta">${e(g.log_meta)}</p>` : ''}<p class="log-reaction">${e(g.log_reaction)}</p>${g.note ? `<p class="log-note">${e(g.note)}</p>` : ''}<div class="share-strip"><span>这次经历可以帮到别人</span><button data-go="case-new/${e(g.id)}">匿名分享</button></div></article></div>`).join('');
  }
  async function selectRecipient(id, remember = true) {
    if (current?.type !== 'home') return;
    const person = current.people.find((p) => p.id === id);
    if (!person) return;
    const sequence = current.sequence = (current.sequence || 0) + 1;
    current.person = person;
    current.gifts = [];
    current.cursor = null;
    history.replaceState(null, '', '#home?recipient=' + encodeURIComponent(id));
    const scroll = app.querySelector('.recipient-scroll');
    const left = scroll?.scrollLeft || 0;
    app.querySelector('#book-tabs').innerHTML = recipientTabs(current.people, id);
    const nextScroll = app.querySelector('.recipient-scroll');
    nextScroll.scrollLeft = left;
    const tabRect = nextScroll.querySelector('.active').getBoundingClientRect();
    const scrollRect = nextScroll.getBoundingClientRect();
    if (tabRect.left < scrollRect.left) nextScroll.scrollLeft -= scrollRect.left - tabRect.left;
    if (tabRect.right > scrollRect.right) nextScroll.scrollLeft += tabRect.right - scrollRect.right;
    app.querySelector('#book-content').innerHTML = `<section class="recipient-summary"><div><h2>${e(person.display_name)}</h2><p>${[person.relation_type, person.age_range ? person.age_range + ' 岁' : ''].filter(Boolean).map(e).join(' · ')}</p></div><button class="summary-edit" data-action="person-menu" aria-label="管理这位 TA">•••</button></section>${person.tags?.length ? `<div class="book-tags">${person.tags.map((tag) => `<span>${e(tag)}</span>`).join('')}</div>` : ''}<section class="gift-log" id="book-log"><p class="log-loading">正在读取记录…</p></section><button class="gift-fab" data-go="record/${e(id)}" aria-label="记一份礼物">＋</button>`;
    if (remember) {
      activeWrite = activeWrite.catch(() => {}).then(() => api('/me/active-recipient', 'PATCH', { recipient_id: id }));
      activeWrite.catch((error) => toast(error.message));
    }
    try {
      const result = await api('/recipients/' + id + '/gifts');
      if (current?.type !== 'home' || current.sequence !== sequence) return;
      current.gifts = result.items;
      current.cursor = result.next_cursor;
      app.querySelector('#book-log').innerHTML = logHTML(result.items) + (result.next_cursor ? '<button class="load-more" data-action="load-more-home">更早的记录</button>' : '');
    } catch (error) {
      if (current?.type === 'home' && current.sequence === sequence)
        app.querySelector('#book-log').innerHTML = `<div class="book-error">${e(error.message)}<button data-action="retry-person">重试</button></div>`;
    }
  }
  async function home(version, query) {
    const [people, meData] = await Promise.all([api('/recipients'), api('/me')]);
    if (version !== routeVersion) return;
    user = meData.user;
    const id = [query.get('recipient'), user.last_active_recipient_id, people[0]?.id]
      .find((candidate) => people.some((p) => p.id === candidate));
    current = { type: 'home', people, person: null, gifts: [], cursor: null, sequence: 0 };
    showTabs('home');
    app.innerHTML = bookHeader() + (people.length
      ? `<div id="book-tabs">${recipientTabs(people, id)}</div><div id="book-content"></div>`
      : '<section class="book-first"><h2>还没有人</h2><button data-go="person-new">添加第一个人</button></section>');
    if (id) await selectRecipient(id, true);
    if (version === routeVersion && homeScroll) requestAnimationFrame(() => window.scrollTo(0, homeScroll));
  }
  function optionList(options, value, placeholder = '请选择') {
    return (
      `<option value="">${e(placeholder)}</option>` +
      options.map((o) => `<option value="${e(o)}" ${o === value ? 'selected' : ''}>${e(o)}</option>`).join('')
    );
  }
  function inputField(label, name, value = '', placeholder = '', max = 60) {
    return `<label class="field"><span class="field-label">${label}</span><input name="${name}" value="${e(value)}" placeholder="${e(placeholder)}" maxlength="${max}" autocomplete="off"></label>`;
  }
  function selectField(label, name, options, value = '', placeholder = '不记录') {
    return `<label class="field row-field"><span class="field-label">${label}</span><select aria-label="${e(label)}" name="${name}">${optionList(options, value, placeholder)}</select></label>`;
  }
  function noteField(name, value, max, label = '备注', placeholder = '记下只属于你的细节') {
    return `<label class="field"><span class="field-label">${label}<small>选填 · ${max} 字以内</small></span><textarea name="${name}" maxlength="${max}" placeholder="${placeholder}">${e(value)}</textarea></label>`;
  }
  function draftKey(key) {
    return `giftbook_v01_draft_${user?.id || 'session'}_${key}`;
  }
  function getDraft(key) {
    try {
      return JSON.parse(sessionStorage.getItem(draftKey(key))) || {};
    } catch {
      return {};
    }
  }
  function saveDraft(form) {
    if (!form.dataset.draft) return;
    const data = Object.fromEntries(new FormData(form));
    if (form.dataset.form === 'person') data.tags = new FormData(form).getAll('tags');
    data._expanded = !!form.querySelector('details[open]');
    data.request_id = form.dataset.requestId;
    sessionStorage.setItem(draftKey(form.dataset.draft), JSON.stringify(data));
  }
  function clearDraft(form) {
    if (form.dataset.draft) sessionStorage.removeItem(draftKey(form.dataset.draft));
  }
  async function personForm(id, version) {
    const original = id ? await api('/recipients/' + id) : {};
    if (version !== routeVersion) return;
    hideTabs();
    const key = id ? 'person-' + id : 'person-new';
    const draft = getDraft(key);
    const p = { ...original, ...draft };
    current = { type: 'person-form', original };
    app.innerHTML = sheetFrame('home',
      `<header class="form-heading"><h1>${id ? '编辑 TA' : '添加一个人'}</h1></header><form data-form="person" data-id="${e(id || '')}" data-draft="${key}" novalidate><div class="form-group">${inputField('称呼', 'display_name', p.display_name, '你平时怎么称呼 TA？', 20)}${selectField('关系', 'relation_type', D.RELATIONS, p.relation_type, '请选择你和 TA 的关系')}</div><details class="optional" ${p._expanded ? 'open' : ''}><summary>再多记一点${icon('chevron')}</summary><div class="form-group">${selectField('年龄段', 'age_range', D.AGE_BUCKETS, p.age_range)}${selectField('性别', 'gender', D.GENDERS, p.gender)}<fieldset class="field"><legend class="field-label">TA 的喜好<small>选填 · 最多 8 个</small></legend><div class="tag-options">${D.TAGS.map((tag) => `<label class="tag-option"><input type="checkbox" name="tags" value="${e(tag)}" ${(p.tags || []).includes(tag) ? 'checked' : ''}><span>${tag}</span></label>`).join('')}</div></fieldset>${noteField('note', p.note, 200)}</div></details><div id="form-error" class="error" role="alert"></div><div class="form-footer"><button type="submit" class="primary">${id ? '保存修改' : '加入礼物簿'}</button></div>${id ? '<button type="button" class="danger-button" data-action="delete-person">删除 TA</button>' : ''}</form>`);
  }
  function giftFormHTML(person, original, editId, key, detail = false) {
    const draft = getDraft(key);
    const g = { ...original, ...draft };
    const price = draft.price !== undefined ? draft.price : D.formatPrice(original.price_fen);
    return `<header class="form-heading"><h1>${editId ? '编辑礼物' : '记一份礼物'}</h1></header><div class="recipient-chip"><div><span class="for-label">送给</span><strong> ${e(person.display_name)}</strong><small>${e(person.relation_type)}</small></div></div><form data-form="gift" data-id="${e(editId || '')}" data-recipient="${e(person.id)}" data-draft="${key}" data-request-id="${e(draft.request_id || uuid())}" ${detail ? 'data-return="detail"' : ''} novalidate><div class="form-group">${inputField('礼物', 'gift_name', g.gift_name, '送了什么礼物？', 60)}</div><fieldset class="reaction-section"><legend>TA 的反应</legend><div class="reactions">${D.REACTIONS.map((r) => `<label class="reaction-choice"><input type="radio" name="reaction_level" value="${r.value}" ${Number(g.reaction_level) === r.value ? 'checked' : ''}><span>${r.label}</span></label>`).join('')}</div></fieldset><div class="form-group"><label class="field row-field"><span class="field-label">送礼日期</span><input aria-label="送礼日期" type="date" name="gifted_at" max="${D.today()}" value="${e(g.gifted_at || D.today())}"></label></div><details class="optional" ${editId || g._expanded ? 'open' : ''}><summary>再记一点细节${icon('chevron')}</summary><div class="form-group">${selectField('场景', 'occasion', D.OCCASIONS, g.occasion)}<label class="field row-field"><span class="field-label">价格 · 元</span><input name="price" inputmode="decimal" placeholder="选填" value="${e(price)}" maxlength="12"></label>${noteField('note', g.note, 300, '一句话备注', '比如，TA 收到时说了什么')}</div></details><div id="form-error" class="error" role="alert"></div><div class="form-footer"><button class="primary" type="submit">${editId ? '保存修改' : '记下来'}</button></div></form>`;
  }
  async function recordForm(recipientId, editId, version) {
    let original = {};
    if (editId) {
      original = await api('/gifts/' + editId);
      recipientId = original.recipient_id;
    }
    if (!recipientId) {
      const [people, meData] = await Promise.all([api('/recipients'), api('/me')]);
      if (version !== routeVersion) return;
      const person = people.find((p) => p.id === meData.user.last_active_recipient_id) || people[0];
      nav(person ? 'record/' + person.id : 'home');
      return;
    }
    const p = await api('/recipients/' + recipientId);
    if (version !== routeVersion) return;
    const key = editId ? 'gift-' + editId : 'record-' + recipientId;
    current = { type: 'record-form', person: p, original };
    hideTabs();
    app.innerHTML = sheetFrame(editId ? 'gift/' + editId : 'home?recipient=' + recipientId,
      giftFormHTML(p, original, editId, key));
  }
  async function giftDetail(id, version) {
    const g = await api('/gifts/' + id);
    const p = await api('/recipients/' + g.recipient_id);
    if (version !== routeVersion) return;
    current = { type: 'gift', gift: g, person: p };
    hideTabs();
    app.innerHTML =
      top('home?recipient=' + p.id, '<button class="text-button" data-action="edit-detail-gift">编辑</button>') +
      `<section class="record-hero"><h1 class="detail-title">${e(g.gift_name)}</h1><div class="record-reaction">${e(D.reaction(g.reaction_level).label)}</div></section><dl class="detail-list"><div class="detail-line"><dt>送给</dt><dd>${e(p.display_name)}</dd></div><div class="detail-line"><dt>日期</dt><dd>${e(D.formatDate(g.gifted_at))}</dd></div>${g.occasion ? `<div class="detail-line"><dt>场景</dt><dd>${e(g.occasion)}</dd></div>` : ''}${g.price_fen !== null && g.price_fen !== undefined ? `<div class="detail-line"><dt>价格</dt><dd>¥ ${e(D.formatPrice(g.price_fen))}</dd></div>` : ''}</dl>${g.note ? `<section class="note-card"><p>${e(g.note)}</p></section>` : ''}<button class="primary case-share" data-go="case-new/${e(g.id)}">匿名分享</button><button class="danger-button" data-action="delete-gift">删除这条记录</button>`;
  }
  const caseFilters = [
    ['relation_type', '关系', D.RELATIONS], ['age_range', '年龄段', D.AGE_BUCKETS],
    ['occasion', '场景', D.OCCASIONS], ['price_range', '预算', D.PRICE_RANGES],
    ['wanted_level', '想要程度', D.WANTED_LEVELS]
  ];
  function caseCard(item, mine = false) {
    const content = `<h3>${e(item.gift_name)}</h3><p>${e(item.relation_type)} · ${e(item.age_range)} 岁 · ${e(item.occasion)}</p><p>${e(item.price_range)} 元 · ${e(item.wanted_level)}</p><p class="case-result">${e(D.reaction(item.reaction_level).label)} · ${e(item.behavior)}</p>${item.experience ? `<p class="case-experience">“${e(item.experience)}”</p>` : ''}`;
    const visible = item.status !== 'removed';
    return `<article class="case-card">${visible ? `<button class="case-open" data-go="case/${e(item.id)}">${content}</button>` : `<div class="case-open">${content}</div>`}${mine ? `<p class="case-status">${visible ? '公开中' : '已下架'} · 有帮助 ${item.helpful_count}</p>${visible ? `<div class="case-actions"><button data-go="case-edit/${e(item.id)}">编辑</button><button data-action="unpublish-case" data-id="${e(item.id)}">下架</button></div>` : ''}` : `<div class="case-actions"><button data-action="helpful-case" data-id="${e(item.id)}" ${item.helped || item.is_mine ? 'disabled' : ''}>${item.is_mine ? '我的分享' : item.helped ? '已觉得有帮助' : '有帮助'} · ${item.helpful_count}</button></div>`}</article>`;
  }
  async function cases(version, query) {
    const params = new URLSearchParams(query);
    const result = await api('/cases?' + params);
    if (version !== routeVersion) return;
    current = { type: 'cases', params, items: result.items, nextOffset: result.next_offset };
    showTabs('cases');
    app.innerHTML = `<header class="explore-header"><h1>看看</h1><button data-go="my-cases">我的分享 ›</button></header><p class="case-intro">来自真实礼物记录的匿名分享</p><div class="case-filters">${caseFilters.map(([field, label, options]) => `<label><span>${label}</span><select data-filter="${field}" aria-label="${label}">${optionList(options, params.get(field) || '', '全部')}</select></label>`).join('')}</div><div id="case-list">${result.items.length ? result.items.map((item) => caseCard(item)).join('') : '<p class="case-empty">还没有符合条件的案例。可以换个条件看看。</p>'}</div>${result.next_offset !== null ? '<button class="load-more" data-action="load-more-cases">加载更多</button>' : ''}`;
  }
  async function myCases(version) {
    const items = await api('/me/cases');
    if (version !== routeVersion) return;
    current = { type: 'my-cases', items };
    hideTabs();
    app.innerHTML = top('cases') + `<h1 class="settings-title">我的分享</h1><p class="case-intro">下架不会删除你的礼物记录。</p>${items.length ? items.map((item) => caseCard(item, true)).join('') : '<p class="case-empty">还没有分享。打开礼物记录就能匿名分享。</p>'}`;
  }
  async function caseDetail(id, version) {
    const item = await api('/cases/' + id);
    if (version !== routeVersion) return;
    current = { type: 'case', item };
    hideTabs();
    const rows = [['关系', item.relation_type], ['年龄段', item.age_range + ' 岁'], ['场景', item.occasion], ['价格区间', item.price_range + ' 元'], ['对方之前想要吗', item.wanted_level], ['TA 的反应', D.reaction(item.reaction_level).label], ['行为证据', item.behavior], ...(item.experience ? [['一句经验', item.experience]] : [])];
    app.innerHTML = top('cases') + `<section class="record-hero"><h1>${e(item.gift_name)}</h1><p class="case-intro">匿名真实送礼案例</p></section><dl class="detail-list">${rows.map(([label, value]) => `<div class="detail-line"><dt>${e(label)}</dt><dd>${e(value)}</dd></div>`).join('')}</dl><button class="primary case-share" data-action="helpful-case" data-id="${e(id)}" ${item.helped || item.is_mine ? 'disabled' : ''}>${item.is_mine ? '我的分享' : item.helped ? '已觉得有帮助' : '有帮助'} · ${item.helpful_count}</button>`;
  }
  async function caseForm(sourceId, edit, version) {
    let item, giftName;
    if (edit) {
      item = (await api('/me/cases')).find((entry) => entry.id === sourceId && entry.status === 'published');
      if (!item) throw new Error('分享不存在或已下架');
      giftName = item.gift_name;
    } else {
      const gift = await api('/gifts/' + sourceId);
      const person = await api('/recipients/' + gift.recipient_id);
      item = { relation_type: person.relation_type, age_range: person.age_range, occasion: gift.occasion, price_range: D.priceRange(gift.price_fen), wanted_level: '', reaction_level: gift.reaction_level, behavior: '', experience: '' };
      giftName = gift.gift_name;
    }
    if (version !== routeVersion) return;
    current = { type: 'case-form', sourceId, edit, giftName };
    hideTabs();
    const fields = [selectField('关系', 'relation_type', D.RELATIONS, item.relation_type, '请选择'), selectField('年龄段', 'age_range', D.AGE_BUCKETS, item.age_range, '请选择'), selectField('场景', 'occasion', D.OCCASIONS, item.occasion, '请选择'), selectField('价格区间', 'price_range', D.PRICE_RANGES, item.price_range, '请选择'), selectField('对方之前想要吗', 'wanted_level', D.WANTED_LEVELS, item.wanted_level, '请选择')].join('');
    app.innerHTML = sheetFrame(edit ? 'my-cases' : 'gift/' + sourceId, `<header class="form-heading"><h1>${edit ? '编辑匿名分享' : '匿名分享这次经历'}</h1><p class="case-intro">来自你的“${e(giftName)}”记录。不会公开 TA 的称呼或私人备注。</p></header><form data-form="case" data-id="${edit ? e(sourceId) : ''}" data-source="${edit ? '' : e(sourceId)}" novalidate>${fields}<fieldset class="reaction-section"><legend>TA 的实际反应</legend><div class="reactions">${D.REACTIONS.map((r) => `<label class="reaction-choice"><input type="radio" name="reaction_level" value="${r.value}" ${Number(item.reaction_level) === r.value ? 'checked' : ''}><span>${r.label}</span></label>`).join('')}</div></fieldset>${inputField('行为证据 · 必填', 'behavior', item.behavior, '比如：当天就用了', 80)}${noteField('experience', item.experience, 120, '一句经验', '什么细节可能帮到别人？')}<section class="case-preview"><h2>公开预览</h2><h3 data-preview="gift"></h3><p data-preview="facts"></p><p data-preview="price"></p><p data-preview="reaction"></p><p data-preview="experience"></p></section><p class="case-intro">发布前会检查联系方式、地址和私人称呼。公开后可在“我的分享”编辑或下架。</p><div id="form-error" class="error" role="alert"></div><button type="submit" class="primary">${edit ? '保存修改' : '确认匿名分享'}</button></form>`);
    updateCasePreview(app.querySelector('form[data-form="case"]'));
  }
  function updateCasePreview(form) {
    if (!form || current?.type !== 'case-form') return;
    const value = Object.fromEntries(new FormData(form));
    for (const [key, content] of Object.entries({
      gift: current.giftName,
      facts: `${value.relation_type || '关系'} · ${value.age_range || '年龄段'} 岁 · ${value.occasion || '场景'}`,
      price: `${value.price_range || '价格区间'} 元 · ${value.wanted_level || '想要程度'}`,
      reaction: `${D.reaction(value.reaction_level).label} · ${value.behavior || '行为证据'}`,
      experience: value.experience ? `“${value.experience}”` : ''
    })) form.querySelector(`[data-preview="${key}"]`).textContent = content;
  }
  async function me(version) {
    const data = await api('/me');
    if (version !== routeVersion) return;
    user = data.user;
    current = { type: 'me', data };
    hideTabs();
    app.innerHTML = top('home') +
      `<h1 class="settings-title">账号与设置</h1><section class="settings-profile"><span class="settings-avatar">${e(Array.from(user.display_name || '我')[0])}</span><div><h2>${e(user.display_name)}</h2><p>礼物簿账号</p></div><button data-action="nickname">个人设置</button></section><section class="settings-rows"><button data-action="privacy">隐私与数据</button><button data-action="about">关于礼物簿</button><button data-action="logout">退出登录</button></section><button class="settings-delete" data-action="delete-account">注销账号</button>`;
  }
  async function render() {
    const version = ++routeVersion;
    const raw = location.hash.slice(1) || 'home';
    const [path, queryString] = raw.split('?');
    const [view, id] = path.split('/');
    const query = new URLSearchParams(queryString || '');
    document.body.classList.toggle('sheet-open', ['person-new', 'person-edit', 'record', 'gift-edit', 'case-new', 'case-edit'].includes(view));
    if (dialog.open) dialog.close();
    window.scrollTo(0, 0);
    if (!token || view === 'welcome') {
      welcome();
      return;
    }
    app.classList.remove('login-screen');
    app.innerHTML = top() + '<p class="loading-label">正在打开礼物簿…</p>';
    hideTabs();
    try {
      if (!user) {
        const meData = await api('/me');
        if (version !== routeVersion) return;
        user = meData.user;
      }
      if (view === 'home') await home(version, query);
      else if (view === 'person-new') await personForm('', version);
      else if (view === 'person-edit' && id) await personForm(id, version);
      else if (view === 'person' && id) nav('home?recipient=' + id);
      else if (view === 'record') await recordForm(id, '', version);
      else if (view === 'gift-edit' && id) await recordForm('', id, version);
      else if (view === 'gift' && id) await giftDetail(id, version);
      else if (view === 'cases') await cases(version, query);
      else if (view === 'my-cases') await myCases(version);
      else if (view === 'case' && id) await caseDetail(id, version);
      else if (view === 'case-new' && id) await caseForm(id, false, version);
      else if (view === 'case-edit' && id) await caseForm(id, true, version);
      else if (view === 'me') await me(version);
      else nav('home');
    } catch (error) {
      if (version !== routeVersion || error.status === 401) return;
      app.innerHTML =
        top('home') +
        `<section class="empty"><h2>${error.status === 404 ? '这条内容已不在礼物簿中' : '暂时没能打开'}</h2><p>${e(error.message)}</p><button class="primary" data-action="retry">重新加载</button><button class="text-button" data-go="home">回到礼物簿</button></section>`;
    }
  }
  function openDialog(html) {
    dialog.innerHTML = html;
    dialog.showModal();
  }
  function confirmAction(title, message, label, run) {
    openDialog(
      `<h2>${e(title)}</h2><p>${e(message)}</p><div class="error" id="dialog-error" role="alert"></div><div class="dialog-actions"><button class="secondary" data-action="close-dialog" autofocus>取消</button><button class="primary danger-bg" id="confirm-action">${e(label)}</button></div>`
    );
    const button = document.getElementById('confirm-action');
    button.addEventListener('click', async () => {
      if (button.disabled) return;
      button.disabled = true;
      button.textContent = '正在处理…';
      try {
        await run();
        dialog.close();
      } catch (error) {
        document.getElementById('dialog-error').textContent = error.message;
        button.disabled = false;
        button.textContent = label;
      }
    });
  }
  function track(event, properties = {}) {
    if (token) api('/events', 'POST', { event, properties }).catch(() => {});
  }
  async function action(name, button) {
    if (name === 'sheet-expand') { button.closest('.form-sheet')?.classList.toggle('full'); return; }
    if (name === 'edit-detail-gift' && current?.type === 'gift') {
      const { gift, person } = current;
      app.insertAdjacentHTML('beforeend', sheetFrame('', giftFormHTML(person, gift, gift.id, 'gift-' + gift.id, true), true));
      document.body.classList.add('sheet-open');
      return;
    }
    if (name === 'close-detail-sheet') {
      document.getElementById('detail-sheet')?.remove();
      document.body.classList.remove('sheet-open');
      return;
    }
    if (name === 'person-menu') {
      const id = current?.person?.id;
      if (id) openDialog(`<h2>${e(current.person.display_name)}</h2><div class="gift-menu"><button data-go="person-edit/${e(id)}">编辑 TA</button><button data-action="sort-hint">调整顺序</button><button data-action="delete-current-person">删除 TA</button></div>`);
      return;
    }
    if (name === 'sort-hint') { dialog.close(); toast('长按上方 TA 并拖动排序'); return; }
    if (name === 'delete-current-person') {
      const person = current?.person;
      if (!person) return;
      dialog.close();
      confirmAction(`删除 ${person.display_name}？`, 'TA 的资料和所有礼物记录会一起删除，无法恢复。', '删除 TA', async () => {
        await api('/recipients/' + person.id, 'DELETE');
        nav('home'); toast('已删除 TA');
      });
      return;
    }
    if (name === 'close-dialog') {
      dialog.close();
      return;
    }
    if (name === 'retry') {
      render();
      return;
    }
    if (name === 'about') {
      openDialog('<h2>关于礼物簿</h2><p>围绕具体的 TA，记下送过什么，以及 TA 的真实反应。</p><div class="dialog-actions"><button class="primary" data-action="close-dialog">知道了</button></div>');
      return;
    }
    if (name === 'add-gift') {
      if (current?.person) nav('record/' + current.person.id);
      return;
    }
    if (name === 'helpful-case') {
      const result = await api('/cases/' + button.dataset.id + '/helpful', 'POST', {});
      button.disabled = true;
      button.textContent = `已觉得有帮助 · ${result.helpful_count}`;
      return;
    }
    if (name === 'unpublish-case') {
      const item = current?.items?.find((entry) => entry.id === button.dataset.id);
      if (!item) return;
      confirmAction('下架这条分享？', '公开案例会消失，私人礼物记录仍会保留。', '下架', async () => {
        await api('/cases/' + item.id, 'DELETE');
        render();
      });
      return;
    }
    if (name === 'load-more-cases') {
      if (current?.type !== 'cases' || current.nextOffset == null) return;
      button.disabled = true;
      try {
        const params = new URLSearchParams(current.params);
        params.set('offset', current.nextOffset);
        const result = await api('/cases?' + params);
        current.items.push(...result.items);
        current.nextOffset = result.next_offset;
        app.querySelector('#case-list').insertAdjacentHTML('beforeend', result.items.map((item) => caseCard(item)).join(''));
        if (result.next_offset === null) button.remove(); else button.disabled = false;
      } catch (error) { button.disabled = false; throw error; }
      return;
    }
    if (name === 'retry-person') {
      if (current?.person) await selectRecipient(current.person.id, false);
      return;
    }
    if (name === 'gift-menu') {
      const g = current?.gifts?.find((item) => item.id === button.dataset.id);
      if (!g) return;
      openDialog(`<h2>${e(g.gift_name)}</h2><div class="gift-menu"><button data-go="gift/${e(g.id)}">查看记录</button><button data-go="gift-edit/${e(g.id)}">编辑记录</button><button data-action="delete-inline" data-id="${e(g.id)}">删除记录</button></div>`);
      return;
    }
    if (name === 'delete-inline') {
      const g = current?.gifts?.find((item) => item.id === button.dataset.id);
      if (!g) return;
      dialog.close();
      confirmAction('删除这条记录？', `“${g.gift_name}”将从礼物簿中删除，无法恢复。`, '删除记录', async () => {
        await api('/gifts/' + g.id, 'DELETE');
        dialog.close();
        await selectRecipient(current.person.id, false);
      });
      return;
    }
    if (name === 'load-more-home') {
      if (button.disabled || current?.type !== 'home' || !current.cursor) return;
      const snapshot = current, id = snapshot.person.id, sequence = snapshot.sequence;
      button.disabled = true;
      try {
        const result = await api('/recipients/' + id + '/gifts?cursor=' + encodeURIComponent(snapshot.cursor));
        if (current !== snapshot || snapshot.sequence !== sequence) return;
        const seen = new Set(snapshot.gifts.map((g) => g.id));
        snapshot.gifts.push(...result.items.filter((g) => !seen.has(g.id)));
        snapshot.cursor = result.next_cursor;
        app.querySelector('#book-log').innerHTML = logHTML(snapshot.gifts) + (snapshot.cursor ? '<button class="load-more" data-action="load-more-home">更早的记录</button>' : '');
      } catch (error) { toast(error.message); button.disabled = false; }
      return;
    }
    if (name === 'privacy') {
      openDialog(
        `<h2>隐私与数据</h2><p>TA 与礼物记录默认仅自己可见。主动匿名分享时，只有确认的案例字段公开，TA 称呼与私人备注不公开；可在“我的分享”下架。\n\n记录会保存在本服务中。退出登录会保留记录；注销账号会删除账号、私人记录及分享，无法恢复。\n\n本地网页使用此浏览器保存的账号凭证识别你。请保留浏览器数据，避免丢失重新进入礼物簿的凭证。</p><div class="dialog-actions"><button class="primary" data-action="close-dialog" autofocus>知道了</button></div>`
      );
      return;
    }
    if (name === 'login') {
      if (button.disabled) return;
      button.disabled = true;
      button.textContent = '正在打开…';
      try {
        const config = await api('/config');
        localLogin = config.local_login;
        if (!localLogin) throw new Error('请在微信小程序中登录后使用礼物簿');
        let key = localStorage.getItem(DEVICE_KEY);
        if (!key) {
          const bytes = new Uint8Array(32);
          crypto.getRandomValues(bytes);
          key = Array.from(bytes, (n) => n.toString(16).padStart(2, '0')).join('');
          localStorage.setItem(DEVICE_KEY, key);
        }
        const result = await api('/auth/local/login', 'POST', { device_key: key });
        token = result.token;
        user = result.user;
        localStorage.setItem(TOKEN_KEY, token);
        nav('home');
      } catch (error) {
        showError(error);
        button.disabled = false;
        button.textContent = '重新登录';
      }
      return;
    }
    if (name === 'delete-person') {
      const p = current.original;
      confirmAction(
        `删除 ${p.display_name}？`,
        'TA 的资料和所有礼物记录会一起删除，无法恢复。',
        '删除 TA',
        async () => {
          await api('/recipients/' + p.id, 'DELETE');
          sessionStorage.removeItem(draftKey('person-' + p.id));
          sessionStorage.removeItem(draftKey('record-' + p.id));
          nav('home');
          toast('已删除 TA');
        }
      );
      return;
    }
    if (name === 'delete-gift') {
      const g = current.gift;
      confirmAction(
        '删除这条记录？',
        `“${g.gift_name}”将从礼物簿中删除，无法恢复。`,
        '删除记录',
        async () => {
          await api('/gifts/' + g.id, 'DELETE');
          sessionStorage.removeItem(draftKey('gift-' + g.id));
          nav('home?recipient=' + g.recipient_id);
          toast('已删除记录');
        }
      );
      return;
    }
    if (name === 'logout') {
      confirmAction('退出登录？', '已保存的 TA 和礼物记录会保留。', '退出登录', async () => {
        await api('/auth/logout', 'POST');
        clearPrivate();
        nav('welcome');
      });
      return;
    }
    if (name === 'delete-account') {
      confirmAction(
        '注销礼物簿账号？',
        '账号、TA 资料和全部礼物记录都会删除，无法恢复。',
        '确认注销',
        async () => {
          await api('/me', 'DELETE');
          clearPrivate();
          localStorage.removeItem(DEVICE_KEY);
          nav('welcome');
          toast('账号已注销');
        }
      );
      return;
    }
    if (name === 'nickname') {
      openDialog(
        `<h2>修改昵称</h2><form data-form="nickname" novalidate>${inputField('昵称', 'display_name', user.display_name, '你想用的昵称', 20)}<div id="dialog-error" class="error" role="alert"></div><div class="dialog-actions"><button type="button" class="secondary" data-action="close-dialog">取消</button><button type="submit" class="primary">保存昵称</button></div></form>`
      );
      dialog.querySelector('input').focus();
      return;
    }

  }
  function beginSort(id, x) {
    if (current?.type !== 'home') return;
    clearTimeout(sortTimer);
    sortState = { id, x, active: false, target: id };
    sortTimer = setTimeout(() => {
      if (!sortState || sortState.id !== id) return;
      sortState.active = true;
      suppressTabClick = true;
      app.querySelector(`[data-recipient-id="${CSS.escape(id)}"]`)?.classList.add('sorting');
    }, 420);
  }
  function moveSort(x, event) {
    if (!sortState) return;
    if (!sortState.active) {
      if (Math.abs(x - sortState.x) > 8) { clearTimeout(sortTimer); sortState = null; }
      return;
    }
    event.preventDefault();
    sortState.x = x;
    const tabs = [...app.querySelectorAll('.recipient-tab')];
    const target = tabs.find((tab) => x < tab.getBoundingClientRect().left + tab.getBoundingClientRect().width / 2) || tabs.at(-1);
    if (target) sortState.target = target.dataset.recipientId;
    tabs.forEach((tab) => tab.classList.toggle('sort-target', tab.dataset.recipientId === sortState.target && sortState.target !== sortState.id));
    if (!sortState.frame) sortState.frame = requestAnimationFrame(autoSortScroll);
  }
  function autoSortScroll() {
    if (!sortState?.active) return;
    const scroll = app.querySelector('.recipient-scroll');
    if (!scroll) return;
    const rect = scroll.getBoundingClientRect();
    const direction = sortState.x < rect.left + 32 ? -1 : sortState.x > rect.right - 32 ? 1 : 0;
    if (direction) {
      scroll.scrollLeft += direction * 8;
      const tabs = [...scroll.querySelectorAll('.recipient-tab')];
      const target = tabs.find((tab) => sortState.x < tab.getBoundingClientRect().left + tab.getBoundingClientRect().width / 2) || tabs.at(-1);
      if (target) sortState.target = target.dataset.recipientId;
      tabs.forEach((tab) => tab.classList.toggle('sort-target', tab.dataset.recipientId === sortState.target && sortState.target !== sortState.id));
      sortState.frame = requestAnimationFrame(autoSortScroll);
    } else sortState.frame = null;
  }
  async function finishSort() {
    clearTimeout(sortTimer);
    const state = sortState;
    sortState = null;
    if (state?.frame) cancelAnimationFrame(state.frame);
    if (!state?.active) return;
    setTimeout(() => { suppressTabClick = false; }, 0);
    const old = current.people.slice(), from = old.findIndex((p) => p.id === state.id), to = old.findIndex((p) => p.id === state.target);
    if (from < 0 || to < 0 || from === to) {
      app.querySelectorAll('.recipient-tab').forEach((tab) => tab.classList.remove('sorting', 'sort-target'));
      return;
    }
    const reordered = old.slice();
    reordered.splice(to, 0, ...reordered.splice(from, 1));
    current.people = reordered;
    const scroll = app.querySelector('.recipient-scroll'), left = scroll.scrollLeft;
    app.querySelector('#book-tabs').innerHTML = recipientTabs(reordered, current.person.id);
    app.querySelector('.recipient-scroll').scrollLeft = left;
    try {
      current.people = await api('/recipients/order', 'PATCH', { recipient_ids: reordered.map((p) => p.id) });
    } catch (error) {
      current.people = old;
      app.querySelector('#book-tabs').innerHTML = recipientTabs(old, current.person.id);
      toast(error.message);
    }
  }
  document.addEventListener('touchstart', (event) => {
    const gift = event.target.closest('.log-entry');
    if (gift) {
      const touch = event.touches[0];
      giftTouch = { gift, x: touch.clientX, y: touch.clientY, moved: false };
      giftTouch.timer = setTimeout(() => {
        if (giftTouch?.gift === gift && !giftTouch.moved) {
          suppressGiftClick = true;
          action('gift-menu', { dataset: { id: gift.dataset.giftId } });
          setTimeout(() => { suppressGiftClick = false; }, 500);
        }
      }, 520);
      return;
    }
    const tab = event.target.closest('.recipient-tab');
    if (!tab) return;
    event.preventDefault();
    const x = event.touches[0].clientX;
    touchState = { id: tab.dataset.recipientId, x, left: tab.parentElement.scrollLeft, moved: false };
    beginSort(touchState.id, x);
  }, { passive: false });
  document.addEventListener('touchmove', (event) => {
    if (giftTouch) {
      const touch = event.touches[0], dx = touch.clientX - giftTouch.x, dy = touch.clientY - giftTouch.y;
      if (Math.abs(dx) > 12 || Math.abs(dy) > 12) { giftTouch.moved = true; clearTimeout(giftTouch.timer); }
      if (Math.abs(dx) > 28 && Math.abs(dx) > Math.abs(dy)) {
        event.preventDefault();
        giftTouch.gift.classList.toggle('swiped', dx < 0);
      }
      return;
    }
    if (!touchState) return;
    event.preventDefault();
    const x = event.touches[0].clientX;
    if (sortState?.active) moveSort(x, event);
    else if (Math.abs(x - touchState.x) > 8) {
      clearTimeout(sortTimer);
      sortState = null;
      touchState.moved = true;
      app.querySelector('.recipient-scroll').scrollLeft = touchState.left - (x - touchState.x);
    }
  }, { passive: false });
  document.addEventListener('touchend', () => {
    if (giftTouch) { clearTimeout(giftTouch.timer); giftTouch = null; return; }
    const touch = touchState;
    touchState = null;
    if (!touch) return;
    if (sortState?.active) finishSort();
    else {
      clearTimeout(sortTimer);
      sortState = null;
      if (!touch.moved) selectRecipient(touch.id).catch(showError);
    }
  });
  document.addEventListener('touchcancel', () => { clearTimeout(sortTimer); clearTimeout(giftTouch?.timer); giftTouch = null; touchState = null; if (sortState?.frame) cancelAnimationFrame(sortState.frame); sortState = null; });
  document.addEventListener('contextmenu', (event) => {
    const gift = event.target.closest('.log-entry');
    if (gift) { event.preventDefault(); if (!dialog.open) action('gift-menu', { dataset: { id: gift.dataset.giftId } }); }
  });
  document.addEventListener('mousedown', (event) => {
    const tab = event.target.closest('.recipient-tab');
    if (tab) beginSort(tab.dataset.recipientId, event.clientX);
  });
  document.addEventListener('mousemove', (event) => { if (sortState) moveSort(event.clientX, event); });
  document.addEventListener('mouseup', finishSort);
  document.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button) {
      const gift = event.target.closest('.log-entry');
      if (gift && !gift.classList.contains('swiped') && !suppressGiftClick) nav('gift/' + gift.dataset.giftId);
      return;
    }
    if (button.disabled) return;
    if (button.dataset.recipientId) {
      if (suppressTabClick) { suppressTabClick = false; return; }
      selectRecipient(button.dataset.recipientId).catch(showError);
    } else if (button.dataset.go !== undefined) {
      event.preventDefault();
      const to = button.dataset.go;
      if (to === 'person-new') track('recipient_create_start', { entry: current?.type || 'home' });
      if (to.startsWith('record/')) track('gift_create_start', { entry: current?.type || 'home' });
      nav(to);
    } else if (button.dataset.action) {
      event.preventDefault();
      action(button.dataset.action, button).catch(showError);
    }
  });
  document.addEventListener('input', (event) => {
    const form = event.target.closest('form');
    if (form) { saveDraft(form); if (form.dataset.form === 'case') updateCasePreview(form); }
  });
  document.addEventListener('change', (event) => {
    if (event.target.dataset.filter) {
      const params = new URLSearchParams(current?.params || '');
      if (event.target.value) params.set(event.target.dataset.filter, event.target.value);
      else params.delete(event.target.dataset.filter);
      nav('cases' + (params.toString() ? '?' + params : ''));
      return;
    }
    const form = event.target.closest('form');
    if (!form) return;
    if (event.target.name === 'tags' && new FormData(form).getAll('tags').length > 8) {
      event.target.checked = false;
      toast('最多选择 8 个喜好');
    }
    saveDraft(form);
    if (form.dataset.form === 'case') updateCasePreview(form);
  });
  document.addEventListener(
    'toggle',
    (event) => {
      if (event.target.matches('details')) {
        const form = event.target.closest('form');
        if (form) saveDraft(form);
      }
    },
    true
  );
  document.addEventListener('submit', async (event) => {
    const form = event.target;
    if (!form.dataset.form) return;
    event.preventDefault();
    const button = form.querySelector('[type="submit"]');
    if (button.disabled) return;
    const data = Object.fromEntries(new FormData(form));
    const label = button.textContent;
    const version = routeVersion;
    const errorEl = form.querySelector('.error');
    if (errorEl) errorEl.textContent = '';
    try {
      let payload;
      if (form.dataset.form === 'person')
        payload = D.validateRecipient({ ...data, tags: new FormData(form).getAll('tags') });
      else if (form.dataset.form === 'gift')
        payload = D.validateGift({
          ...data,
          recipient_id: form.dataset.recipient,
          reaction_level: Number(data.reaction_level),
          price_fen: D.parsePrice(data.price)
        });
      else if (form.dataset.form === 'case')
        payload = D.validateCase({ ...data, reaction_level: Number(data.reaction_level) });
      else {
        const value = data.display_name.trim();
        if (!value || Array.from(value).length > 20) throw new Error('昵称请填写 1–20 个字');
        payload = { display_name: value };
      }
      button.disabled = true;
      button.textContent = '正在保存…';
      saveDraft(form);
      if (form.dataset.form === 'person') {
        const id = form.dataset.id;
        const result = await api('/recipients' + (id ? '/' + id : ''), id ? 'PATCH' : 'POST', payload);
        clearDraft(form);
        if (version === routeVersion) {
          nav('home?recipient=' + result.id);
          toast(id ? '已保存修改' : '已记住这个 TA');
        }
      } else if (form.dataset.form === 'gift') {
        const id = form.dataset.id;
        const result = await api('/gifts' + (id ? '/' + id : ''), id ? 'PATCH' : 'POST', {
          ...payload,
          ...(!id ? { request_id: form.dataset.requestId } : {})
        });
        clearDraft(form);
        if (version === routeVersion) {
          if (form.dataset.return === 'detail') {
            await giftDetail(id, version);
            document.body.classList.remove('sheet-open');
          } else nav('home?recipient=' + result.recipient_id);
          toast(id ? '已保存修改' : '已记下这份礼物');
        }
      } else if (form.dataset.form === 'case') {
        const id = form.dataset.id;
        const item = await api('/cases' + (id ? '/' + id : ''), id ? 'PATCH' : 'POST', id ? payload : { ...payload, source_gift_id: form.dataset.source });
        if (version === routeVersion) {
          nav(id ? 'my-cases' : 'case/' + item.id);
          toast(id ? '分享已更新' : '匿名分享成功');
        }
      } else {
        await api('/me', 'PATCH', payload);
        dialog.close();
        user = null;
        render();
        toast('昵称已修改');
      }
    } catch (error) {
      if (errorEl) {
        errorEl.textContent = error.message;
        errorEl.scrollIntoView({ block: 'nearest' });
      } else showError(error);
    } finally {
      button.disabled = false;
      button.textContent = label;
    }
  });
  window.addEventListener('hashchange', render);
  window.addEventListener('scroll', () => app.classList.toggle('book-scrolled', current?.type === 'home' && scrollY > 14), { passive: true });
  window.addEventListener('storage', (event) => {
    if (event.key === TOKEN_KEY && event.newValue !== token) {
      token = event.newValue || '';
      user = null;
      render();
    }
  });
  async function start() {
    try {
      const config = await api('/config');
      localLogin = config.local_login;
    } catch {}
    await render();
  }
  start();
})();
