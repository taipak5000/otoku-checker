// storage.js — 記録(履歴)の永続化。localStorage に JSON 配列として保存する。
// ブラウザ以外(テスト環境など)でも動くよう、localStorage / crypto は
// グローバルから参照するだけにして、この中では新たに import しない。

const STORAGE_KEY = 'otokuChecker.records.v1';

function safeParse(json) {
  try {
    const data = JSON.parse(json);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function makeId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function loadRecords() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return safeParse(raw);
  } catch (e) {
    console.error('履歴の読み込みに失敗しました', e);
    return [];
  }
}

function persist(records) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    return true;
  } catch (e) {
    console.error('履歴の保存に失敗しました', e);
    return false;
  }
}

/**
 * 新しい記録を先頭に追加して保存する。
 * @param {object} record - name, memo, price, qty, unit, multipack, packCount,
 *   packUnitLabel, category, pricePerBase, displayValue, displayLabel など
 * @returns {object} id と createdAt を付与した記録
 */
export function addRecord(record) {
  const records = loadRecords();
  const full = {
    id: makeId(),
    createdAt: new Date().toISOString(),
    ...record,
  };
  records.unshift(full);
  persist(records);
  return full;
}

export function deleteRecord(id) {
  const records = loadRecords().filter((r) => r.id !== id);
  persist(records);
  return records;
}

export function clearAllRecords() {
  persist([]);
}

/**
 * 検索語(商品名・メモ部分一致)と並び順で履歴を取得する。
 * @param {{ query?: string, sort?: 'new' | 'cheap' }} opts
 */
export function queryRecords({ query = '', sort = 'new' } = {}) {
  let records = loadRecords();
  const q = query.trim().toLowerCase();
  if (q) {
    records = records.filter((r) => {
      const name = (r.name || '').toLowerCase();
      const memo = (r.memo || '').toLowerCase();
      return name.includes(q) || memo.includes(q);
    });
  }
  if (sort === 'cheap') {
    records = [...records].sort((a, b) => (a.displayValue ?? Infinity) - (b.displayValue ?? Infinity));
  } else {
    records = [...records].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }
  return records;
}
