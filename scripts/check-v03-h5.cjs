const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright-core');

const base = process.env.H5_BASE_URL || 'http://127.0.0.1:43117';
const output = process.env.H5_SCREENSHOT_DIR || 'docs/evidence/v03';

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const shot = async (name) => {
    await page.waitForTimeout(400);
    await page.locator('#toast.show').waitFor({ state: 'hidden' });
    await page.screenshot({ path: `${output}/${name}.png` });
  };
  const api = (path, method = 'GET', body) => page.evaluate(async ({ path, method, body }) => {
    const response = await fetch('/v1' + path, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + localStorage.getItem('giftbook_v01_token') },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    return { status: response.status, ...(await response.json()) };
  }, { path, method, body });
  try {
    await page.goto(base);
    await page.getByRole('button', { name: '开始记录' }).click();
    await page.getByRole('button', { name: '添加第一个人' }).click();
    await page.getByLabel('称呼', { exact: true }).fill('Rose');
    await page.getByLabel('关系', { exact: true }).selectOption('恋人');
    await page.getByText('再多记一点', { exact: true }).click();
    await page.getByLabel('年龄段', { exact: true }).selectOption('26–30');
    await page.getByRole('button', { name: '加入礼物簿' }).click();
    await page.getByRole('heading', { name: 'Rose', exact: true }).waitFor();
    const personId = (await api('/recipients')).data[0].id;
    await shot('current-ta-records');
    await page.getByRole('button', { name: '找礼物 ›' }).click();
    await page.getByRole('heading', { name: '给 Rose 找礼物' }).waitFor();
    await shot('find-gift-sheet');
    await page.getByLabel('场景 *').selectOption('生日');
    await page.getByLabel('预算 *').selectOption('500–999');
    await page.getByRole('button', { name: '看看案例' }).click();
    await page.locator('.match-card').first().waitFor();
    const match = (await api(`/recipients/${personId}/gift-matches?occasion=${encodeURIComponent('生日')}&price_range=${encodeURIComponent('500–999')}`)).data;
    assert.ok(match.items.length > 0);
    fs.writeFileSync(`${output}/match-api-response.json`, JSON.stringify(match, null, 2) + '\n');
    await shot('match-results');
    await page.locator('.match-card .case-open').first().click();
    await page.getByText('演示案例 · 仅供开发验收').waitFor();
    await shot('case-from-match');
    await page.getByRole('button', { name: '返回' }).click();
    await page.locator('.match-card').first().waitFor();
    await page.locator('.match-card .saved-convert').first().click();
    await page.locator('.match-card .saved-convert').first().getByText('已收藏').waitFor();
    await shot('save-success');
    const saved = (await api(`/recipients/${personId}/saved-gifts`)).data;
    assert.equal(saved.length, 1);
    fs.writeFileSync(`${output}/saved-gift-response.json`, JSON.stringify(saved[0], null, 2) + '\n');
    await page.getByRole('button', { name: '查看想送' }).click();
    await page.getByRole('button', { name: '想送' }).waitFor();
    await page.locator('.saved-card').waitFor();
    await shot('ta-saved-list');
    await page.locator('.saved-row button').first().click();
    await page.getByRole('dialog').getByRole('button', { name: '查看来源案例' }).click();
    await page.getByText('演示案例 · 仅供开发验收').waitFor();
    await page.getByRole('button', { name: '返回' }).click();
    await page.locator('.saved-card').waitFor();
    await page.getByRole('button', { name: '找礼物 ›' }).click();
    await page.getByLabel('场景 *').selectOption('生日');
    await page.getByLabel('预算 *').selectOption('500–999');
    await page.getByRole('button', { name: '看看案例' }).click();
    await page.locator('.match-card').nth(1).locator('.saved-convert').click();
    await page.getByRole('button', { name: '查看想送' }).click();
    await page.locator('.saved-card').nth(1).waitFor();
    await page.locator('.saved-card').first().locator('.saved-row button').click();
    await page.getByRole('dialog').getByRole('button', { name: '移除想送' }).click();
    await page.getByRole('dialog').getByRole('button', { name: '移除', exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll('.saved-card').length === 1);
    assert.equal((await api(`/recipients/${personId}/saved-gifts`)).data.length, 1);
    for (const width of [320,390,430]) {
      await page.setViewportSize({ width, height: 844 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
      await shot(`width-${width}`);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: '已经送了' }).click();
    await page.getByRole('heading', { name: '记一份礼物' }).waitFor();
    await page.locator('.sheet-handle').click();
    assert.equal(await page.getByLabel('礼物', { exact: true }).inputValue(), saved[0].gift_name);
    assert.equal(await page.getByLabel('场景', { exact: true }).inputValue(), '生日');
    await shot('convert-sheet');
    await page.locator('[name="reaction_level"][value="4"]').check();
    await page.getByRole('button', { name: '记下来' }).click();
    await page.locator('.log-entry').waitFor();
    assert.match(await page.locator('.log-entry').first().innerText(), new RegExp(saved[0].gift_name));
    assert.equal((await api(`/recipients/${personId}/saved-gifts`)).data.length, 0);
    await shot('gift-created');
    await page.locator('.log-entry').first().click();
    await page.getByRole('button', { name: '匿名分享' }).waitFor();
    await shot('v02-share-entry');
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ result: 'PASS', evidence: output, screenshots: 12, errors }));
  } finally {
    await api('/me','DELETE').catch(() => {});
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
