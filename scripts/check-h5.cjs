const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const base = process.env.H5_BASE_URL || 'http://127.0.0.1:43117';
const output = process.env.H5_SCREENSHOT_DIR || '/tmp/giftbook-v011-evidence';
const previewPassword = process.env.PREVIEW_ACCESS_PASSWORD || '';
(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const click = (name) => page.getByRole('button', { name, exact: true }).click();
  const call = (path, method = 'GET', data) => page.evaluate(async (args) => {
    const response = await fetch('/v1' + args.path, {
      method: args.method,
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + localStorage.getItem('giftbook_v01_token') },
      ...(args.data === undefined ? {} : { body: JSON.stringify(args.data) })
    });
    return { status: response.status, ...(await response.json()) };
  }, { path, method, data });
  let deleted = false;
  try {
    await page.goto(base);
    const passwordField = page.getByLabel('验收口令');
    if (previewPassword && await passwordField.count()) {
      await passwordField.fill(previewPassword);
      await click('继续');
    }
    await page.locator('.login-native').waitFor();
    assert.equal(await page.locator('.login-main h1').innerText(), '礼物簿');
    assert.equal(await page.locator('.login-primary').count(), 1);
    assert.equal(await page.locator('.privacy-link').count(), 1);
    assert.equal(await page.locator('.book-art, .welcome-visual, .book-shape').count(), 0);
    assert.equal(await page.getByText(/送礼不用猜|为你珍藏|记录每一份心意/).count(), 0);
    for (const width of [320, 390, 430]) {
      await page.setViewportSize({ width, height: 844 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width,
        JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('*')].filter((el) => el.getBoundingClientRect().right > innerWidth + 1).slice(0, 8).map((el) => [el.className, el.getBoundingClientRect().right]))));
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await click('开始记录');
    await click('添加第一个人');
    await page.locator('.form-sheet').waitFor();
    await page.waitForTimeout(400);
    await page.locator('.sheet-close').click();
    await page.getByRole('button', { name: '添加第一个人' }).waitFor();
    await click('添加第一个人');
    await page.getByLabel('称呼', { exact: true }).fill('Rose');
    await page.getByLabel('关系', { exact: true }).selectOption('恋人');
    await click('加入礼物簿');
    await page.getByRole('heading', { name: 'Rose', exact: true }).waitFor();
    const roseId = (await call('/recipients')).data[0].id;
    await page.locator('.summary-edit').click();
    await page.getByRole('dialog').getByRole('button', { name: '编辑 TA' }).click();
    await page.getByText('再多记一点', { exact: true }).click();
    await page.locator('[name="tags"][value="摄影"]').check();
    await page.locator('[name="tags"][value="旅行"]').check();
    await click('保存修改');
    await page.getByText('摄影', { exact: true }).waitFor();
    await click('添加 TA');
    await page.getByLabel('称呼', { exact: true }).fill('妈妈');
    await page.getByLabel('关系', { exact: true }).selectOption('家人');
    await click('加入礼物簿');
    await page.getByRole('heading', { name: '妈妈', exact: true }).waitFor();
    const motherId = (await call('/recipients')).data.find((person) => person.display_name === '妈妈').id;
    assert.equal(await page.locator('.recipient-add').count(), 1);
    await page.locator('[data-recipient-id="' + roseId + '"]').click();
    await page.getByRole('heading', { name: 'Rose', exact: true }).waitFor();
    await click('记一份礼物');
    await page.locator('.sheet-handle').click();
    assert.ok(await page.locator('.form-sheet.full').isVisible());
    await page.locator('.sheet-handle').click();
    await page.waitForTimeout(400);
    await page.locator('#toast.show').waitFor({ state: 'hidden' });
    await page.getByLabel('礼物', { exact: true }).waitFor();
    assert.match(await page.locator('.recipient-chip').innerText(), /Rose/);
    assert.equal(await page.locator('select[name="recipient_id"]').count(), 0);
    await page.getByLabel('礼物', { exact: true }).fill('拍立得');
    await page.locator('[name="reaction_level"][value="4"]').check();
    await page.getByLabel('送礼日期', { exact: true }).fill('2026-09-12');
    await page.getByText('再记一点细节', { exact: true }).click();
    await page.getByLabel('场景', { exact: true }).selectOption('生日');
    await page.getByLabel('价格 · 元', { exact: true }).fill('899');
    await page.getByLabel(/一句话备注/).fill('后来旅行也一直带着。');
    const requestId = await page.locator('form[data-form="gift"]').getAttribute('data-request-id');
    await page.route('**/v1/gifts', (route) => route.abort('connectionfailed'));
    await click('记下来');
    await page.getByText(/网络连接失败/).waitFor();
    assert.equal(await page.getByLabel('礼物', { exact: true }).inputValue(), '拍立得');
    assert.equal(await page.locator('form[data-form="gift"]').getAttribute('data-request-id'), requestId);
    await page.unroute('**/v1/gifts');
    await click('记下来');
    await page.locator('.log-entry').waitFor();
    assert.match(await page.locator('.log-entry').innerText(), /拍立得/);
    assert.match(await page.locator('.log-entry').innerText(), /09月12日/);
    const giftId = (await call('/recipients/' + roseId + '/gifts')).data.items[0].id;
    await click('记一份礼物');
    await page.getByLabel('礼物', { exact: true }).fill('演唱会门票');
    await page.locator('[name="reaction_level"][value="5"]').check();
    await page.getByLabel('送礼日期', { exact: true }).fill('2025-10-04');
    await click('记下来');
    await page.locator('.log-entry').nth(1).waitFor();
    assert.equal(await page.locator('.log-date span').count(), 2);
    const olderGiftId = (await call('/recipients/' + roseId + '/gifts')).data.items[1].id;
    await page.locator('#toast.show').waitFor({ state: 'hidden' });
    await page.locator('.log-entry').first().click();
    await page.getByRole('heading', { name: '拍立得', exact: true }).waitFor();
    const detailUrl = page.url();
    await click('编辑');
    assert.equal(page.url(), detailUrl);
    await page.locator('#detail-sheet .form-sheet').waitFor();
    assert.equal(await page.getByLabel('礼物', { exact: true }).inputValue(), '拍立得');
    assert.equal(await page.getByLabel('价格 · 元', { exact: true }).inputValue(), '899');
    await page.waitForTimeout(400);
    for (const width of [320, 390, 430]) {
      await page.setViewportSize({ width, height: 844 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByLabel('礼物', { exact: true }).fill('拍立得相机');
    await click('保存修改');
    await page.getByRole('heading', { name: '拍立得相机', exact: true }).waitFor();
    await page.locator('#toast.show').waitFor({ state: 'hidden' });
    assert.equal(page.url(), detailUrl);
    assert.equal(await page.locator('#detail-sheet').count(), 0);
    assert.equal((await call('/gifts/' + giftId)).data.gift_name, '拍立得相机');
    await page.screenshot({ path: output + '/01-gift-detail-unshared.png' });
    await click('匿名分享');
    await page.locator('form[data-form="case"]').waitFor();
    await page.screenshot({ path: output + '/02-share-sheet.png' });
    assert.match(await page.locator('.case-intro').first().innerText(), /不会公开 TA 的称呼/);
    await page.getByLabel('年龄段', { exact: true }).selectOption('26–30');
    await page.getByLabel('对方之前想要吗', { exact: true }).selectOption('没提过');
    await page.getByLabel('公开礼物名称', { exact: true }).fill('a@example.com');
    await page.locator('[name="behavior_evidence"][value="used_immediately"]').check();
    await page.locator('[name="behavior_evidence"][value="happy_on_receive"]').check();
    assert.match(await page.locator('[data-preview="reaction"]').innerText(), /马上用了/);
    await page.getByLabel(/一句经验/).fill('先了解对方的使用习惯');
    await click('确认匿名分享');
    await page.getByText(/公开内容可能包含/).waitFor();
    assert.equal(await page.getByLabel('公开礼物名称', { exact: true }).inputValue(), 'a@example.com');
    assert.ok(await page.locator('[name="behavior_evidence"][value="used_immediately"]').isChecked());
    await page.getByLabel('公开礼物名称', { exact: true }).fill('公开版拍立得');
    await page.locator('.case-preview').scrollIntoViewIfNeeded();
    await page.screenshot({ path: output + '/03-share-preview.png' });
    await click('确认匿名分享');
    await page.waitForURL(/#case\/[0-9a-f-]+$/);
    await page.getByRole('heading', { name: '公开版拍立得', exact: true }).waitFor();
    const sharedId = page.url().split('#case/')[1];
    const publicResponse = (await call('/cases/' + sharedId)).data;
    const privateKeys = new Set(['owner_id', 'source_gift_id', 'recipient_id', 'display_name', 'recipient_note', 'gift_note', 'price_fen', 'tags', 'gender', 'behavior_legacy']);
    const checkPublic = (value) => {
      if (Array.isArray(value)) return value.forEach(checkPublic);
      if (value && typeof value === 'object') for (const [key, nested] of Object.entries(value)) {
        assert.ok(!privateKeys.has(key), 'private field leaked: ' + key);
        checkPublic(nested);
      }
    };
    checkPublic(publicResponse);
    assert.ok(!JSON.stringify(publicResponse).includes('后来旅行也一直带着'));
    assert.ok(!JSON.stringify(publicResponse).includes('Rose'));
    fs.writeFileSync(output + '/public-case-response.json', JSON.stringify(publicResponse, null, 2) + '\n');
    await page.screenshot({ path: output + '/04-case-detail-after-publish.png' });
    assert.equal((await call('/cases/' + sharedId)).data.gift_name, '公开版拍立得');
    await page.goto(base + '/#gift/' + giftId);
    await page.getByRole('button', { name: '查看公开分享', exact: true }).waitFor();
    await page.screenshot({ path: output + '/05-gift-detail-published.png' });
    await click('查看公开分享');
    await page.getByRole('heading', { name: '公开版拍立得', exact: true }).waitFor();
    await click('返回');
    await page.getByRole('heading', { name: '看看', exact: true }).waitFor();
    await page.screenshot({ path: output + '/06-explore.png' });
    await page.getByLabel('关系', { exact: true }).selectOption('恋人');
    await page.getByRole('heading', { name: '公开版拍立得', exact: true }).waitFor();
    for (const width of [320, 390, 430]) {
      await page.setViewportSize({ width, height: 844 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width,
        JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('*')].filter((el) => el.getBoundingClientRect().right > innerWidth + 1).slice(0, 8).map((el) => [el.className, el.getBoundingClientRect().right]))));
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: output + '/07-explore-filtered.png' });
    const viewer = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const viewerPage = await viewer.newPage();
    viewerPage.on('pageerror', (error) => errors.push(error.message));
    try {
      await viewerPage.goto(base);
      const viewerPassword = viewerPage.getByLabel('验收口令');
      if (previewPassword && await viewerPassword.count()) {
        await viewerPassword.fill(previewPassword);
        await viewerPage.getByRole('button', { name: '继续', exact: true }).click();
      }
      await viewerPage.getByRole('button', { name: '开始记录', exact: true }).click();
      await viewerPage.getByRole('button', { name: '看看', exact: true }).click();
      await viewerPage.getByRole('heading', { name: '公开版拍立得', exact: true }).waitFor();
      const viewerResponse = await viewerPage.evaluate(async (id) => {
        const response = await fetch('/v1/cases/' + id, { headers: { Authorization: 'Bearer ' + localStorage.getItem('giftbook_v01_token') } });
        return (await response.json()).data;
      }, sharedId);
      checkPublic(viewerResponse);
      assert.equal(viewerResponse.is_mine, false);
      assert.ok(!JSON.stringify(viewerResponse).includes('Rose'));
      fs.writeFileSync(output + '/public-case-viewer-response.json', JSON.stringify(viewerResponse, null, 2) + '\n');
      await viewerPage.getByRole('button', { name: '有帮助 · 0' }).click();
      await viewerPage.getByRole('button', { name: '已觉得有帮助 · 1' }).waitFor();
      await viewerPage.getByRole('heading', { name: '公开版拍立得', exact: true }).click();
      await viewerPage.getByRole('button', { name: '已觉得有帮助 · 1' }).waitFor();
      assert.equal((await call('/cases/' + sharedId)).data.helpful_count, 1);
      await viewerPage.evaluate(async () => fetch('/v1/me', { method: 'DELETE', headers: { Authorization: 'Bearer ' + localStorage.getItem('giftbook_v01_token') } }));
    } finally { await viewer.close(); }
    await page.getByRole('button', { name: '我的分享 ›' }).click();
    await page.getByRole('heading', { name: '我的分享' }).waitFor();
    await page.screenshot({ path: output + '/08-my-shares.png' });
    await page.getByRole('button', { name: '编辑', exact: true }).click();
    await page.getByLabel(/一句经验/).fill('旅行时也能使用');
    await click('保存修改');
    await page.getByRole('heading', { name: '我的分享' }).waitFor();
    assert.equal((await call('/cases/' + sharedId)).data.experience, '旅行时也能使用');
    await page.getByRole('button', { name: '下架', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: '下架', exact: true }).click();
    await page.getByText('已下架').waitFor();
    assert.equal((await call('/cases/' + sharedId)).status, 404);
    assert.equal((await call('/gifts/' + giftId)).status, 200);
    await page.goto(base + '/#gift/' + giftId);
    await page.getByRole('heading', { name: '拍立得相机', exact: true }).waitFor();
    await page.getByRole('button', { name: '匿名分享', exact: true }).waitFor();
    await page.screenshot({ path: output + '/09-unpublished-private-gift-still-exists.png' });
    await click('返回');
    await page.getByRole('heading', { name: 'Rose', exact: true }).waitFor();
    const touch = await context.newCDPSession(page);
    const giftRow = await page.locator('.log-entry').first().boundingBox();
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: giftRow.x + 180, y: giftRow.y + 35 }] });
    await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: giftRow.x + 60, y: giftRow.y + 35 }] });
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    assert.ok(await page.locator('.log-entry').first().evaluate((el) => el.classList.contains('swiped')));
    await page.locator('.log-shell').first().locator('.swipe-actions button').first().click();
    await page.getByLabel('礼物', { exact: true }).fill('拍立得相机 Pro');
    await click('保存修改');
    await page.getByText('拍立得相机 Pro', { exact: true }).waitFor();
    await page.locator('.log-entry').last().evaluate((el) => el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true })));
    await page.getByRole('dialog').getByRole('button', { name: '删除记录' }).click();
    await page.getByRole('dialog').getByRole('button', { name: '删除记录' }).click();
    await page.waitForFunction(() => document.querySelectorAll('.log-entry').length === 1);
    assert.equal((await call('/gifts/' + olderGiftId)).status, 404);
    await page.locator('[data-recipient-id="' + motherId + '"]').click();
    await page.getByRole('heading', { name: '妈妈', exact: true }).waitFor();
    assert.equal(await page.locator('.log-entry').count(), 0);
    await page.waitForFunction(async (id) => {
      const response = await fetch('/v1/me', { headers: { Authorization: 'Bearer ' + localStorage.getItem('giftbook_v01_token') } });
      return (await response.json()).data.user.last_active_recipient_id === id;
    }, motherId);
    await page.reload();
    await page.getByRole('heading', { name: '妈妈', exact: true }).waitFor();
    const tabs = page.locator('.recipient-tab');
    const from = await tabs.nth(1).boundingBox();
    const to = await tabs.nth(0).boundingBox();
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(500);
    await page.mouse.move(to.x + 2, to.y + to.height / 2, { steps: 5 });
    await page.mouse.up();
    await page.waitForFunction(async (id) => {
      const response = await fetch('/v1/recipients', { headers: { Authorization: 'Bearer ' + localStorage.getItem('giftbook_v01_token') } });
      return (await response.json()).data[0].id === id;
    }, motherId);
    const firstTab = await page.locator('.recipient-tab').nth(0).boundingBox();
    const secondTab = await page.locator('.recipient-tab').nth(1).boundingBox();
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: firstTab.x + firstTab.width / 2, y: firstTab.y + firstTab.height / 2 }] });
    await page.waitForTimeout(500);
    await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: secondTab.x + secondTab.width + 2, y: secondTab.y + secondTab.height / 2 }] });
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForFunction(async (id) => {
      const response = await fetch('/v1/recipients', { headers: { Authorization: 'Bearer ' + localStorage.getItem('giftbook_v01_token') } });
      return (await response.json()).data[0].id === id;
    }, roseId);
    for (const name of ['爸爸', '小王', '阿禾', '外婆', '大学室友', '表姐阿宁', '同事小周', '舅舅'])
      assert.equal((await call('/recipients', 'POST', { display_name: name, relation_type: '家人' })).status, 200);
    await page.reload();
    await page.locator('.recipient-tab').nth(9).waitFor();
    assert.ok(await page.locator('.recipient-scroll').evaluate((el) => el.scrollWidth > el.clientWidth));
    const swipeTab = await page.locator('.recipient-tab').nth(1).boundingBox();
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: swipeTab.x + swipeTab.width / 2, y: swipeTab.y + swipeTab.height / 2 }] });
    await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: swipeTab.x - 40, y: swipeTab.y + swipeTab.height / 2 }] });
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    assert.ok(await page.locator('.recipient-scroll').evaluate((el) => el.scrollLeft > 0));
    await page.locator('.recipient-scroll').evaluate((el) => { el.scrollLeft = 0; });
    const firstVisible = await page.locator('.recipient-tab').first().boundingBox();
    const rail = await page.locator('.recipient-scroll').boundingBox();
    await page.mouse.move(firstVisible.x + firstVisible.width / 2, firstVisible.y + firstVisible.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(500);
    await page.mouse.move(rail.x + rail.width - 5, rail.y + rail.height / 2, { steps: 5 });
    await page.waitForTimeout(400);
    assert.ok(await page.locator('.recipient-scroll').evaluate((el) => el.scrollLeft > 24));
    await page.mouse.up();
    await page.getByRole('heading', { name: '妈妈', exact: true }).waitFor();
    for (let i = 0; i < 9; i++) {
      const result = await call('/gifts', 'POST', { recipient_id: motherId, gift_name: '滚动验收 ' + i, reaction_level: 3, gifted_at: '2026-09-01', occasion: '', price_fen: null, note: '', request_id: crypto.randomUUID() });
      assert.equal(result.status, 200);
    }
    await page.reload();
    await page.locator('.log-entry').last().scrollIntoViewIfNeeded();
    const beforeDetail = await page.evaluate(() => scrollY);
    assert.ok(beforeDetail > 0);
    await page.locator('.log-entry').last().click();
    await page.getByRole('heading', { name: '滚动验收 0', exact: true }).waitFor();
    await click('返回');
    await page.waitForFunction((old) => scrollY >= old - 5, beforeDetail);
    await page.evaluate(() => window.scrollTo(0, 0));
    for (const width of [320, 390, 430]) {
      await page.setViewportSize({ width, height: 844 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width,
        JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('*')].filter((el) => el.getBoundingClientRect().right > innerWidth + 1).slice(0, 8).map((el) => [el.className, el.getBoundingClientRect().right]))));
      await page.screenshot({ path: output + '/1' + ({320:'0',390:'1',430:'2'})[width] + '-width-' + width + '.png', fullPage: true });
    }
    await click('账号与设置');
    await page.getByRole('heading', { name: '账号与设置' }).waitFor();
    await click('个人设置');
    await page.getByLabel('昵称', { exact: true }).fill('测试礼物簿');
    await click('保存昵称');
    await page.getByRole('heading', { name: '测试礼物簿', exact: true }).waitFor();
    await click('关于礼物簿');
    assert.ok(await page.getByRole('dialog').isVisible());
    await click('知道了');
    await click('隐私与数据');
    assert.ok(await page.getByRole('dialog').isVisible());
    await click('知道了');
    await click('退出登录');
    await page.getByRole('dialog').getByRole('button', { name: '退出登录' }).click();
    await click('开始记录');
    await page.getByRole('heading', { name: '妈妈', exact: true }).waitFor();
    assert.equal((await call('/gifts/' + giftId)).status, 200);
    await click('账号与设置');
    await click('注销账号');
    await page.getByRole('dialog').getByRole('button', { name: '确认注销' }).click();
    await page.getByRole('button', { name: '开始记录', exact: true }).waitFor();
    deleted = true;
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ result: 'PASS', screenshots: output, errors }, null, 2));
  } finally {
    if (!deleted) await call('/me', 'DELETE').catch(() => {});
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exit(1); });
