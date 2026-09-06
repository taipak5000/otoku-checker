// calc.js の単体テスト（node --test 不要、素の node で実行できる最小アサーション方式）
import assert from 'node:assert/strict';
import {
  unitPriceResult,
  compare,
  effectivePackCount,
  totalBaseQuantity,
  categoryOf,
} from '../calc.js';

let pass = 0;
let fail = 0;

function test(name, fn) {
  try {
    fn();
    pass++;
    console.log(`  ok - ${name}`);
  } catch (e) {
    fail++;
    console.error(`  FAIL - ${name}`);
    console.error(`         ${e.message}`);
  }
}

function approx(actual, expected, epsilon = 1e-6, msg = '') {
  assert.ok(
    Math.abs(actual - expected) < epsilon,
    `${msg} expected ${expected}, got ${actual}`
  );
}

console.log('categoryOf');
test('g/kg は weight', () => {
  assert.equal(categoryOf('g'), 'weight');
  assert.equal(categoryOf('kg'), 'weight');
});
test('未知の単位は null', () => {
  assert.equal(categoryOf('foo'), null);
  assert.equal(categoryOf(undefined), null);
});

console.log('unitPriceResult: 基本ケース');
test('100g 198円 → 100gあたり198円', () => {
  const r = unitPriceResult({ price: 198, qty: 100, unit: 'g' });
  assert.equal(r.ok, true);
  assert.equal(r.category, 'weight');
  approx(r.displayValue, 198, 1e-6, '100gあたりの価格');
  assert.equal(r.displayLabel, '100g');
});

test('1kg 1580円 → 100gあたり158円（kg→g換算)', () => {
  const r = unitPriceResult({ price: 1580, qty: 1, unit: 'kg' });
  assert.equal(r.ok, true);
  approx(r.displayValue, 158, 1e-6);
});

test('500ml 128円 → 100mlあたり25.6円', () => {
  const r = unitPriceResult({ price: 128, qty: 500, unit: 'ml' });
  approx(r.displayValue, 25.6, 1e-6);
});

test('2L 398円 → 100mlあたり19.9円（L→ml換算)', () => {
  const r = unitPriceResult({ price: 398, qty: 2, unit: 'L' });
  approx(r.displayValue, 19.9, 1e-6);
});

test('individual 個数はそのまま1個あたり', () => {
  const r = unitPriceResult({ price: 300, qty: 6, unit: '個' });
  approx(r.displayValue, 50, 1e-6);
  assert.equal(r.displayLabel, '1個');
});

test('枚数はそのまま1枚あたり', () => {
  const r = unitPriceResult({ price: 400, qty: 200, unit: '枚' });
  approx(r.displayValue, 2, 1e-6);
});

test('50m 300円 → 1mあたり6円', () => {
  const r = unitPriceResult({ price: 300, qty: 50, unit: 'm' });
  approx(r.displayValue, 6, 1e-6);
});

test('cm指定でも正しく換算される (500cm 300円 = 5m → 1mあたり60円)', () => {
  const r = unitPriceResult({ price: 300, qty: 500, unit: 'cm' });
  approx(r.displayValue, 60, 1e-6);
});

console.log('unitPriceResult: 異常系');
test('価格が空/0/負はエラー', () => {
  assert.equal(unitPriceResult({ price: '', qty: 100, unit: 'g' }).error, 'price');
  assert.equal(unitPriceResult({ price: 0, qty: 100, unit: 'g' }).error, 'price');
  assert.equal(unitPriceResult({ price: -10, qty: 100, unit: 'g' }).error, 'price');
});
test('単位未選択/不正はエラー', () => {
  assert.equal(unitPriceResult({ price: 100, qty: 100, unit: '' }).error, 'unit');
  assert.equal(unitPriceResult({ price: 100, qty: 100, unit: 'xyz' }).error, 'unit');
});
test('容量が空/0はエラー', () => {
  assert.equal(unitPriceResult({ price: 100, qty: '', unit: 'g' }).error, 'qty');
  assert.equal(unitPriceResult({ price: 100, qty: 0, unit: 'g' }).error, 'qty');
});

console.log('まとめ買いモード (effectivePackCount / totalBaseQuantity)');
test('multipack=false のときは常に1倍', () => {
  assert.equal(effectivePackCount({ multipack: false, packCount: 12 }), 1);
});
test('multipack=true でも未入力/0以下なら1倍にフォールバック', () => {
  assert.equal(effectivePackCount({ multipack: true, packCount: '' }), 1);
  assert.equal(effectivePackCount({ multipack: true, packCount: 0 }), 1);
  assert.equal(effectivePackCount({ multipack: true, packCount: -3 }), 1);
});
test('multipack=true で入力があればその倍率', () => {
  assert.equal(effectivePackCount({ multipack: true, packCount: 12 }), 12);
});

test('トイレットペーパー: 1ロール55m×12ロール入り 498円 → 1mあたり約0.754円', () => {
  const item = { price: 498, qty: 55, unit: 'm', multipack: true, packCount: 12 };
  assert.equal(totalBaseQuantity(item), 55 * 100 * 12); // 基準単位はcm
  const r = unitPriceResult(item);
  approx(r.displayValue, 498 / 660, 1e-6); // 1mあたり
});

test('ティッシュ: 150組×5箱、1箱あたり価格ではなく総額で計算する想定', () => {
  // 200組(400枚)入りが5箱で合計1000組、価格は総額1200円と仮定
  const item = { price: 1200, qty: 200, unit: '枚', multipack: true, packCount: 5 };
  const r = unitPriceResult(item);
  approx(r.totalBaseQty, 1000, 1e-6);
  approx(r.displayValue, 1200 / 1000, 1e-6); // 1枚あたり1.2円
});

console.log('compare()');
test('同じ重さ系で安い方を正しく判定する (A: 158円/100g, B: 198円/100g → A)', () => {
  const a = { price: 1580, qty: 1, unit: 'kg' };
  const b = { price: 198, qty: 100, unit: 'g' };
  const c = compare(a, b);
  assert.equal(c.status, 'ok');
  assert.equal(c.cheaper, 'A');
  approx(c.percentCheaper, (198 - 158) / 198 * 100, 1e-6);
});

test('逆にBが安ければBと判定する', () => {
  const a = { price: 300, qty: 100, unit: 'g' }; // 100gあたり300円
  const b = { price: 150, qty: 100, unit: 'g' }; // 100gあたり150円
  const c = compare(a, b);
  assert.equal(c.cheaper, 'B');
  approx(c.percentCheaper, 50, 1e-6);
});

test('同じ単価なら tie', () => {
  const a = { price: 200, qty: 100, unit: 'g' };
  const b = { price: 400, qty: 200, unit: 'g' };
  const c = compare(a, b);
  assert.equal(c.status, 'ok');
  assert.equal(c.cheaper, 'tie');
  approx(c.percentCheaper, 0, 1e-9);
});

test('カテゴリーが違う(重さ⇔かさ)ときは category-mismatch', () => {
  const a = { price: 200, qty: 100, unit: 'g' };
  const b = { price: 200, qty: 100, unit: 'ml' };
  const c = compare(a, b);
  assert.equal(c.status, 'category-mismatch');
});

test('片方が未入力なら incomplete', () => {
  const a = { price: 200, qty: 100, unit: 'g' };
  const b = { price: '', qty: '', unit: '' };
  const c = compare(a, b);
  assert.equal(c.status, 'incomplete');
});

test('長さと重さの組み合わせも mismatch になる', () => {
  const a = { price: 200, qty: 100, unit: 'cm' };
  const b = { price: 200, qty: 100, unit: 'g' };
  assert.equal(compare(a, b).status, 'category-mismatch');
});

test('まとめ買い商品同士の比較: パック数を考慮しても正しい方が安いと出る', () => {
  // A: 1ロール55m×12ロール 498円 → 1mあたり約0.7545円
  const a = { price: 498, qty: 55, unit: 'm', multipack: true, packCount: 12 };
  // B: 1ロール50m×8ロール 398円 → 1mあたり0.995円 (Aの方が安いはず)
  const b = { price: 398, qty: 50, unit: 'm', multipack: true, packCount: 8 };
  const c = compare(a, b);
  assert.equal(c.status, 'ok');
  assert.equal(c.cheaper, 'A');
});

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
