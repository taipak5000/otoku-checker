// calc.js — 単価計算のロジック（DOM に依存しない純粋関数のみ）
// テストしやすいように UI コードから分離してある。

// 単位 → カテゴリー（同じカテゴリー同士でしか比較できない）
export const UNIT_CATEGORY = Object.freeze({
  g: 'weight',
  kg: 'weight',
  ml: 'volume',
  L: 'volume',
  cm: 'length',
  m: 'length',
  個: 'count',
  枚: 'sheet',
});

// カテゴリーごとの基準単位（内部計算はすべてこの単位に揃える）
export const BASE_UNIT = Object.freeze({
  weight: 'g',
  volume: 'ml',
  length: 'cm',
  count: '個',
  sheet: '枚',
});

// 各単位 → 基準単位への倍率
export const UNIT_TO_BASE_FACTOR = Object.freeze({
  g: 1,
  kg: 1000,
  ml: 1,
  L: 1000,
  cm: 1,
  m: 100,
  個: 1,
  枚: 1,
});

// 表示用（100g・100ml・1m・1個・1枚あたりの単価として見せる）
export const DISPLAY_UNIT = Object.freeze({
  weight: { factor: 100, label: '100g' },
  volume: { factor: 100, label: '100ml' },
  length: { factor: 100, label: '1m' },
  count: { factor: 1, label: '1個' },
  sheet: { factor: 1, label: '1枚' },
});

export const CATEGORY_LABEL = Object.freeze({
  weight: '重さ',
  volume: 'かさ(体積)',
  length: '長さ',
  count: '個数',
  sheet: '枚数',
});

export function categoryOf(unit) {
  return UNIT_CATEGORY[unit] ?? null;
}

function toNumber(v) {
  if (v === '' || v === null || v === undefined) return NaN;
  const n = typeof v === 'number' ? v : Number(v);
  return n;
}

export function toBaseQuantity(value, unit) {
  const factor = UNIT_TO_BASE_FACTOR[unit];
  const n = toNumber(value);
  if (factor == null || !Number.isFinite(n)) return null;
  return n * factor;
}

// まとめ買いモードのパック数。モードが OFF、または未入力/0以下のときは 1 として扱う
// （モードを ON にしただけで既存の計算結果が壊れないようにするため）。
export function effectivePackCount(item) {
  if (!item || !item.multipack) return 1;
  const n = toNumber(item.packCount);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

// item: { price, qty, unit, multipack, packCount }
export function totalBaseQuantity(item) {
  const base = toBaseQuantity(item.qty, item.unit);
  if (base == null || base <= 0) return null;
  return base * effectivePackCount(item);
}

/**
 * 1商品分の単価を計算する。
 * 戻り値: { ok: true, category, pricePerBase, totalBaseQty, displayValue, displayLabel }
 *      | { ok: false, error: 'price' | 'unit' | 'qty' }
 */
export function unitPriceResult(item) {
  const price = toNumber(item && item.price);
  if (!Number.isFinite(price) || price <= 0) {
    return { ok: false, error: 'price' };
  }
  const category = categoryOf(item && item.unit);
  if (!category) {
    return { ok: false, error: 'unit' };
  }
  const totalBaseQty = totalBaseQuantity(item);
  if (totalBaseQty == null || totalBaseQty <= 0) {
    return { ok: false, error: 'qty' };
  }
  const pricePerBase = price / totalBaseQty;
  const disp = DISPLAY_UNIT[category];
  return {
    ok: true,
    category,
    pricePerBase,
    totalBaseQty,
    displayValue: pricePerBase * disp.factor,
    displayLabel: disp.label,
  };
}

/**
 * 2商品を比較する。
 * 戻り値の status:
 *  - 'incomplete'       : どちらか(または両方)がまだ計算できない
 *  - 'category-mismatch': 単位のカテゴリーが違う(重さ⇔かさ、など)ので比較不可
 *  - 'ok'                : 比較成功
 */
export function compare(itemA, itemB) {
  const resA = unitPriceResult(itemA);
  const resB = unitPriceResult(itemB);

  if (!resA.ok || !resB.ok) {
    return { status: 'incomplete', resA, resB };
  }
  if (resA.category !== resB.category) {
    return { status: 'category-mismatch', resA, resB };
  }

  const epsilon = 1e-9;
  const diff = resA.pricePerBase - resB.pricePerBase;
  let cheaper;
  if (Math.abs(diff) < epsilon) {
    cheaper = 'tie';
  } else {
    cheaper = diff < 0 ? 'A' : 'B';
  }

  const cheaperPrice = Math.min(resA.pricePerBase, resB.pricePerBase);
  const expensivePrice = Math.max(resA.pricePerBase, resB.pricePerBase);
  const percentCheaper = expensivePrice > 0
    ? ((expensivePrice - cheaperPrice) / expensivePrice) * 100
    : 0;

  return { status: 'ok', cheaper, percentCheaper, resA, resB };
}
