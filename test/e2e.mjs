// e2e.mjs — Playwright を使ったブラウザ上での動作確認。
// 起動: NODE_PATH=$(npm root -g) node test/e2e.mjs
import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const BASE = 'http://127.0.0.1:8000';
let pass = 0;
let fail = 0;

async function step(name, fn) {
  try {
    await fn();
    pass++;
    console.log(`  ok - ${name}`);
  } catch (e) {
    fail++;
    console.error(`  FAIL - ${name}`);
    console.error(`         ${e.stack || e.message}`);
  }
}

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 420, height: 900 } });
const page = await context.newPage();
page.on('pageerror', (err) => console.error('  [pageerror]', err.message));
page.on('console', (msg) => {
  if (msg.type() === 'error') console.error('  [console.error]', msg.text());
});

await step('ページが読み込め、タイトルが正しい', async () => {
  await page.goto(BASE, { waitUntil: 'load' });
  assert.equal(await page.title(), 'おとくチェック');
});

await step('初期状態では結果バーが案内文になっている', async () => {
  const text = await page.locator('#resultHeadline').textContent();
  assert.match(text, /入力すると/);
});

await step('2商品を入力すると単価が計算され、安い方がハイライトされる', async () => {
  await page.fill('#A-price', '1580');
  await page.fill('#A-qty', '1');
  await page.selectOption('#A-unit', 'kg');

  await page.fill('#B-price', '198');
  await page.fill('#B-qty', '100');
  await page.selectOption('#B-unit', 'g');

  // A: 1580円/1kg -> 158円/100g, B: 198円/100g -> Aが安い
  await page.waitForTimeout(50);
  const headline = await page.locator('#resultHeadline').textContent();
  assert.match(headline, /商品Aがお得/);

  const aClasses = await page.locator('.item-card[data-item="A"]').getAttribute('class');
  assert.match(aClasses, /is-cheaper/);

  const previewA = await page.locator('#A-preview .value').textContent();
  assert.equal(previewA.trim(), '158');
});

await step('容量欄に単位ごと入力すると、単位プルダウンが自動で切り替わる', async () => {
  await page.fill('#A-qty', '2kg');
  await page.waitForTimeout(50);
  const unitValue = await page.inputValue('#A-unit');
  assert.equal(unitValue, 'kg');
  // A: 1580円 / 2kg = 100gあたり79円 (formatYenは10〜99.999円の範囲を小数1桁で表示する)
  const previewA = await page.locator('#A-preview .value').textContent();
  assert.equal(previewA.trim(), '79.0');
});

await step('日本語の単位表記(グラム等)でも自動認識する', async () => {
  await page.fill('#B-qty', '200グラム');
  await page.waitForTimeout(50);
  const unitValue = await page.inputValue('#B-unit');
  assert.equal(unitValue, 'g');
});

await step('単位プルダウンを手動で選び直すと、容量欄の表記が数値だけに整う', async () => {
  await page.selectOption('#A-unit', 'g');
  await page.waitForTimeout(50);
  const qtyValue = await page.inputValue('#A-qty');
  assert.equal(qtyValue, '2'); // "2kg" -> "2" (単位はプルダウン側のgが優先される)
  // 1580円 / 2g という極端な値になるので、念のため元の状態に戻しておく
  await page.fill('#A-qty', '1kg');
  await page.waitForTimeout(50);
});

await step('認識できない単位を入力すると、その表記を含むメッセージが出る', async () => {
  await page.selectOption('#B-unit', ''); // 単位を未選択に戻す
  await page.fill('#B-qty', '500xyz');
  await page.waitForTimeout(50);
  const previewB = await page.locator('#B-preview .value').textContent();
  assert.match(previewB, /xyz/);
  // 後続のテストのために元に戻す
  await page.fill('#B-qty', '100g');
  await page.waitForTimeout(50);
});

await step('単位のカテゴリーが違うと警告になる', async () => {
  await page.selectOption('#B-unit', 'ml');
  await page.waitForTimeout(50);
  const headline = await page.locator('#resultHeadline').textContent();
  assert.match(headline, /比較できません/);
  await page.selectOption('#B-unit', 'g'); // 元に戻す
  await page.waitForTimeout(50);
});

await step('まとめ買いモードでパック数を反映して計算できる', async () => {
  await page.click('#multipackToggle');
  await page.fill('#A-price', '498');
  await page.fill('#A-qty', '55');
  await page.selectOption('#A-unit', 'm');
  await page.fill('#A-packCount', '12');

  await page.fill('#B-price', '398');
  await page.fill('#B-qty', '50');
  await page.selectOption('#B-unit', 'm');
  await page.fill('#B-packCount', '8');

  await page.waitForTimeout(50);
  // A: 498/(55*12)=0.7545円/m, B: 398/(50*8)=0.995円/m -> Aが安い
  const headline = await page.locator('#resultHeadline').textContent();
  assert.match(headline, /商品Aがお得/);
  const previewA = await page.locator('#A-preview .value').textContent();
  assert.equal(previewA.trim(), '0.75');
});

await step('商品名・メモを付けて記録すると保存トーストが出る', async () => {
  await page.fill('#A-name', 'テストのトイレットペーパー');
  await page.click('#A-memoToggle');
  await page.fill('#A-memo', 'スーパーXのセール品');
  await page.click('#A-save');
  await page.waitForSelector('#toast.show', { timeout: 2000 });
  const toastText = await page.locator('#toast').textContent();
  assert.equal(toastText, '保存しました');
});

await step('履歴シートを開くと保存した記録が表示される', async () => {
  await page.click('#historyOpenBtn');
  await page.waitForFunction(
    () => document.getElementById('historySheet').getAttribute('aria-hidden') === 'false',
    { timeout: 3000 }
  );
  const nameText = await page.locator('.history-item .h-name').first().textContent();
  assert.equal(nameText, 'テストのトイレットペーパー');
});

await step('履歴の検索で絞り込める', async () => {
  await page.fill('#historySearch', '存在しない商品名xyz');
  await page.waitForTimeout(50);
  const emptyText = await page.locator('.history-empty').textContent();
  assert.match(emptyText, /一致する記録がありません/);
  await page.fill('#historySearch', '');
  await page.waitForTimeout(50);
});

await step('履歴から商品Bへ読み込める', async () => {
  await page.click('.history-item >> text=Bへ読込');
  await page.waitForFunction(
    () => document.getElementById('historySheet').getAttribute('aria-hidden') === 'true',
    { timeout: 3000 }
  );
  const bName = await page.inputValue('#B-name');
  assert.equal(bName, 'テストのトイレットペーパー');
  const bPrice = await page.inputValue('#B-price');
  assert.equal(bPrice, '498');
});

await step('削除は2段階確認になっている(1回目では消えない)', async () => {
  await page.click('#historyOpenBtn');
  await page.waitForFunction(
    () => document.getElementById('historySheet').getAttribute('aria-hidden') === 'false',
    { timeout: 3000 }
  );
  await page.click('.history-item >> text=削除');
  await page.waitForTimeout(50);
  const count1 = await page.locator('.history-item').count();
  assert.equal(count1, 1); // まだ消えていない
  await page.click('.history-item >> text=本当に削除?');
  await page.waitForTimeout(50);
  const emptyVisible = await page.locator('.history-empty').count();
  assert.equal(emptyVisible, 1); // 消えた
});

await step('Service Worker が登録され、有効化まで完了する', async () => {
  await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.register('./service-worker.js');
    await navigator.serviceWorker.ready;
    return reg.active ? true : false;
  });
  const state = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    return reg && reg.active ? reg.active.state : 'none';
  });
  assert.equal(state, 'activated');
});

await step('オフラインでもキャッシュから表示できる(stale-while-revalidate)', async () => {
  // 一度リロードしてプリキャッシュ済みリソースへのSW制御を確実にする
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, { timeout: 5000 });

  await context.setOffline(true);
  try {
    await page.reload({ waitUntil: 'load', timeout: 5000 });
    const title = await page.title();
    assert.equal(title, 'おとくチェック');
    const h1 = await page.locator('h1').textContent();
    assert.equal(h1, 'おとくチェック');
  } finally {
    await context.setOffline(false);
  }
});

await step('manifest.json とアイコンが取得できる', async () => {
  const manifestResp = await page.request.get(`${BASE}/manifest.json`);
  assert.equal(manifestResp.ok(), true);
  const manifest = await manifestResp.json();
  assert.equal(manifest.name, 'おとくチェック');
  for (const icon of manifest.icons) {
    const r = await page.request.get(`${BASE}/${icon.src}`);
    assert.equal(r.ok(), true, `icon ${icon.src} should load`);
  }
});

await step('ライトモードのスクリーンショットを保存', async () => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto(BASE, { waitUntil: 'load' });
  await page.fill('#A-price', '1580');
  await page.fill('#A-qty', '1');
  await page.selectOption('#A-unit', 'kg');
  await page.fill('#B-price', '198');
  await page.fill('#B-qty', '100');
  await page.selectOption('#B-unit', 'g');
  await page.waitForTimeout(400);
  await page.screenshot({ path: '/tmp/screenshot-light.png' });
});

await step('ダークモードのスクリーンショットを保存', async () => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.waitForTimeout(100);
  await page.screenshot({ path: '/tmp/screenshot-dark.png' });
});

await step('履歴シートのスクリーンショットを保存', async () => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.click('#A-save');
  await page.waitForTimeout(200);
  await page.click('#historyOpenBtn');
  await page.waitForTimeout(500);
  await page.screenshot({ path: '/tmp/screenshot-history.png' });
});

await browser.close();

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
