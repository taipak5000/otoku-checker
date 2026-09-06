// storage.js の単体テスト。Node には localStorage が無いので簡易ポリフィルを注入する。
import assert from 'node:assert/strict';

class MemoryStorage {
  constructor() { this.map = new Map(); }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v) { this.map.set(k, String(v)); }
  removeItem(k) { this.map.delete(k); }
  clear() { this.map.clear(); }
}

globalThis.localStorage = new MemoryStorage();

const { loadRecords, addRecord, deleteRecord, clearAllRecords, queryRecords } = await import('../storage.js');

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log(`  ok - ${name}`); }
  catch (e) { fail++; console.error(`  FAIL - ${name}`); console.error(`         ${e.message}`); }
}

test('初期状態は空配列', () => {
  assert.deepEqual(loadRecords(), []);
});

test('addRecord で id と createdAt が付与される', () => {
  const r = addRecord({ name: 'テスト商品', price: 100, qty: 100, unit: 'g', displayValue: 100 });
  assert.ok(r.id);
  assert.ok(r.createdAt);
  assert.equal(loadRecords().length, 1);
});

test('新しい記録が先頭に来る', () => {
  addRecord({ name: '2件目', displayValue: 50 });
  const all = loadRecords();
  assert.equal(all[0].name, '2件目');
});

test('deleteRecord で指定したものだけ消える', () => {
  const before = loadRecords();
  const target = before[0];
  deleteRecord(target.id);
  const after = loadRecords();
  assert.equal(after.length, before.length - 1);
  assert.ok(!after.some((r) => r.id === target.id));
});

test('queryRecords: 商品名で部分一致検索できる', () => {
  clearAllRecords();
  addRecord({ name: 'エリエール ティッシュ', displayValue: 2 });
  addRecord({ name: 'トイレットペーパー12ロール', displayValue: 0.75 });
  const res = queryRecords({ query: 'ティッシュ' });
  assert.equal(res.length, 1);
  assert.equal(res[0].name, 'エリエール ティッシュ');
});

test('queryRecords: メモでも部分一致検索できる', () => {
  const res = queryRecords({ query: 'ロール' });
  assert.equal(res.length, 1);
});

test('queryRecords: sort=cheap で displayValue 昇順になる', () => {
  const res = queryRecords({ sort: 'cheap' });
  assert.equal(res[0].displayValue, 0.75);
  assert.equal(res[1].displayValue, 2);
});

test('queryRecords: sort=new で新しい順(デフォルト)になる', () => {
  const res = queryRecords({});
  assert.equal(res[0].name, 'トイレットペーパー12ロール');
});

test('clearAllRecords で全消去できる', () => {
  clearAllRecords();
  assert.deepEqual(loadRecords(), []);
});

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
