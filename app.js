// app.js — 画面の配線(DOM操作)。計算は calc.js、保存は storage.js、
// 履歴シートのドラッグ演出は motion.js に委譲する。
import { unitPriceResult, compare, CATEGORY_LABEL, parseQuantityInput } from './calc.js';
import { addRecord, deleteRecord, queryRecords } from './storage.js';
import { makeDraggableSheet } from './motion.js';

const $ = (id) => document.getElementById(id);
const on = (el, events, handler) => {
  events.split(' ').forEach((ev) => el.addEventListener(ev, handler));
};

const cardA = document.querySelector('.item-card[data-item="A"]');
const cardB = document.querySelector('.item-card[data-item="B"]');
const multipackToggle = $('multipackToggle');
const resultBar = $('resultBar');
const resultHeadline = $('resultHeadline');

/* ---------------------------------------------------------------------- *
 * 数値フォーマット
 * ---------------------------------------------------------------------- */

function formatYen(v) {
  if (!Number.isFinite(v)) return '—';
  const decimals = v >= 100 ? 0 : v >= 10 ? 1 : 2;
  return v.toLocaleString('ja-JP', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

const ERROR_MESSAGE = {
  price: '価格を入力してください',
  unit: '単位を選択してください',
  qty: '容量を入力してください',
};

/* ---------------------------------------------------------------------- *
 * 商品カードの読み書き
 * ---------------------------------------------------------------------- */

function readItem(prefix) {
  const qtyParsed = parseQuantityInput($(`${prefix}-qty`).value);
  return {
    name: $(`${prefix}-name`).value.trim(),
    memo: $(`${prefix}-memo`).value.trim(),
    price: $(`${prefix}-price`).value,
    qty: Number.isFinite(qtyParsed.value) ? qtyParsed.value : '',
    unit: $(`${prefix}-unit`).value,
    multipack: multipackToggle.checked,
    packCount: $(`${prefix}-packCount`).value,
    packUnit: $(`${prefix}-packUnit`).value,
  };
}

// 容量欄に「500g」のように単位ごと入力されていたら、単位プルダウンを自動で合わせる。
// 単位が読み取れない(数字だけ、または認識できない表記)ときはプルダウンの現在値のまま。
function syncUnitFromQtyText(prefix) {
  const parsed = parseQuantityInput($(`${prefix}-qty`).value);
  if (parsed.unit) {
    $(`${prefix}-unit`).value = parsed.unit;
  }
}

// 単位プルダウンを手動で選び直したときは、容量欄のテキストを数値だけに整えて
// 「表示は g のままなのに kg で計算されている」ような食い違いが起きないようにする。
function stripUnitSuffixFromQtyText(prefix) {
  const qtyEl = $(`${prefix}-qty`);
  const parsed = parseQuantityInput(qtyEl.value);
  if (Number.isFinite(parsed.value)) {
    qtyEl.value = String(parsed.value);
  }
}

function applyMultipackClass() {
  const on = multipackToggle.checked;
  cardA.classList.toggle('multipack-on', on);
  cardB.classList.toggle('multipack-on', on);
}

function renderPreview(prefix, res) {
  const el = $(`${prefix}-preview`);
  el.classList.toggle('is-error', !res.ok);
  if (res.ok) {
    el.innerHTML = '';
    const value = document.createElement('span');
    value.className = 'value';
    value.textContent = formatYen(res.displayValue);
    const label = document.createElement('span');
    label.className = 'unit-label';
    label.textContent = `円 / ${res.displayLabel}`;
    el.append(value, label);
  } else {
    el.innerHTML = '';
    const value = document.createElement('span');
    value.className = 'value';
    if (res.error === 'unit') {
      // 単位が定まらない原因が「認識できない表記」なら、その表記を具体的に伝える
      const qtyParsed = parseQuantityInput($(`${prefix}-qty`).value);
      value.textContent = qtyParsed.unrecognizedSuffix
        ? `単位「${qtyParsed.unrecognizedSuffix}」は認識できません`
        : ERROR_MESSAGE.unit;
    } else {
      value.textContent = ERROR_MESSAGE[res.error] || '入力してください';
    }
    el.append(value);
  }
}

function updateSaveButton(prefix, res) {
  $(`${prefix}-save`).disabled = !res.ok;
}

function update() {
  const itemA = readItem('A');
  const itemB = readItem('B');
  const resA = unitPriceResult(itemA);
  const resB = unitPriceResult(itemB);

  renderPreview('A', resA);
  renderPreview('B', resB);
  updateSaveButton('A', resA);
  updateSaveButton('B', resB);

  const cmp = compare(itemA, itemB);
  cardA.classList.remove('is-cheaper');
  cardB.classList.remove('is-cheaper');
  resultBar.classList.remove('status-ok', 'status-warn', 'status-neutral');

  if (cmp.status === 'incomplete') {
    resultBar.classList.add('status-neutral');
    resultHeadline.textContent = '価格と容量を入力すると、ここに比較結果が出ます';
  } else if (cmp.status === 'category-mismatch') {
    resultBar.classList.add('status-warn');
    resultHeadline.textContent =
      `単位の種類が違うため比較できません(${CATEGORY_LABEL[cmp.resA.category]} と ${CATEGORY_LABEL[cmp.resB.category]})`;
  } else if (cmp.cheaper === 'tie') {
    resultBar.classList.add('status-neutral');
    resultHeadline.textContent = '同じ単価です';
  } else {
    resultBar.classList.add('status-ok');
    const winnerCard = cmp.cheaper === 'A' ? cardA : cardB;
    winnerCard.classList.add('is-cheaper');
    const pct = cmp.percentCheaper;
    const pctText = pct >= 10 ? Math.round(pct) : pct.toFixed(1);
    resultHeadline.textContent = `商品${cmp.cheaper}がお得です(約${pctText}%安い)`;
  }
}

/* ---------------------------------------------------------------------- *
 * 入力イベントの配線
 * ---------------------------------------------------------------------- */

['A', 'B'].forEach((prefix) => {
  ['name', 'price', 'packCount', 'memo'].forEach((field) => {
    on($(`${prefix}-${field}`), 'input', update);
  });
  on($(`${prefix}-packUnit`), 'change input', update);

  // 容量欄: 「500g」のように単位ごと入力されたら単位プルダウンを自動で合わせる
  on($(`${prefix}-qty`), 'input', () => {
    syncUnitFromQtyText(prefix);
    update();
  });

  // 単位プルダウン: 手動で選び直したときは容量欄の表記を数値だけに整える
  on($(`${prefix}-unit`), 'change', () => {
    stripUnitSuffixFromQtyText(prefix);
    update();
  });
});

multipackToggle.addEventListener('change', () => {
  applyMultipackClass();
  update();
});

['A', 'B'].forEach((prefix) => {
  const btn = $(`${prefix}-memoToggle`);
  const wrap = $(`${prefix}-memoWrap`);
  btn.addEventListener('click', () => {
    const open = wrap.classList.toggle('open');
    btn.setAttribute('aria-expanded', String(open));
    if (open) $(`${prefix}-memo`).focus({ preventScroll: true });
  });
});

/* ---------------------------------------------------------------------- *
 * 記録(履歴)への保存
 * ---------------------------------------------------------------------- */

['A', 'B'].forEach((prefix) => {
  $(`${prefix}-save`).addEventListener('click', () => {
    const item = readItem(prefix);
    const res = unitPriceResult(item);
    if (!res.ok) return;

    addRecord({
      name: item.name || '(名称未設定)',
      memo: item.memo,
      price: Number(item.price),
      qty: Number(item.qty),
      unit: item.unit,
      multipack: item.multipack,
      packCount: item.multipack ? Number(item.packCount) || 1 : null,
      packUnit: item.multipack ? item.packUnit : null,
      category: res.category,
      pricePerBase: res.pricePerBase,
      displayValue: res.displayValue,
      displayLabel: res.displayLabel,
    });

    showToast('保存しました');
    renderHistory();
  });
});

/* ---------------------------------------------------------------------- *
 * トースト通知
 * ---------------------------------------------------------------------- */

let toastTimer = null;
function showToast(message) {
  const toast = $('toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 1800);
}

/* ---------------------------------------------------------------------- *
 * 履歴シート(ボトムシート)
 * ---------------------------------------------------------------------- */

const sheet = $('historySheet');
const sheetBackdrop = $('sheetBackdrop');
const sheetHandle = $('sheetHandle');
const historyOpenBtn = $('historyOpenBtn');
const historyCloseBtn = $('historyCloseBtn');
const historySearch = $('historySearch');
const historySort = $('historySort');
const historyList = $('historyList');

function getMaxOffset() {
  return sheet.getBoundingClientRect().height || sheet.offsetHeight || 600;
}

const sheetController = makeDraggableSheet(sheet, sheetHandle, sheetBackdrop, {
  getMaxOffset,
  onOpenChange(isOpen) {
    sheet.setAttribute('aria-hidden', String(!isOpen));
    if (isOpen) {
      historySearch.focus({ preventScroll: true });
    } else {
      historyOpenBtn.focus({ preventScroll: true });
    }
  },
});
sheet.style.transform = `translateY(${getMaxOffset()}px)`;

historyOpenBtn.addEventListener('click', () => {
  renderHistory();
  sheetController.open();
});
historyCloseBtn.addEventListener('click', () => sheetController.close());
sheetBackdrop.addEventListener('click', () => sheetController.close());
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && sheetController.isOpen) sheetController.close();
});
window.addEventListener('resize', () => sheetController.refresh());

on(historySearch, 'input', renderHistory);
on(historySort, 'change', renderHistory);

function renderHistory() {
  const records = queryRecords({ query: historySearch.value, sort: historySort.value });
  historyList.innerHTML = '';

  if (records.length === 0) {
    const li = document.createElement('li');
    li.className = 'history-empty';
    li.textContent = historySearch.value.trim()
      ? '一致する記録がありません'
      : 'まだ記録がありません。商品カードの「記録する」ボタンから保存できます。';
    historyList.append(li);
    return;
  }

  records.forEach((r) => historyList.append(renderHistoryItem(r)));
}

function renderHistoryItem(record) {
  const li = document.createElement('li');
  li.className = 'history-item';

  const rowTop = document.createElement('div');
  rowTop.className = 'row-top';
  const name = document.createElement('span');
  name.className = 'h-name';
  name.textContent = record.name || '(名称未設定)';
  const price = document.createElement('span');
  price.className = 'h-price';
  price.textContent = `${formatYen(record.displayValue)}円/${record.displayLabel}`;
  rowTop.append(name, price);
  li.append(rowTop);

  const meta = document.createElement('p');
  meta.className = 'h-meta';
  const packText = record.multipack && record.packCount ? ` × ${record.packCount}${record.packUnit || '個'}` : '';
  meta.textContent = `¥${record.price} / ${record.qty}${record.unit}${packText} ・ ${formatDate(record.createdAt)}`;
  li.append(meta);

  if (record.memo) {
    const memo = document.createElement('p');
    memo.className = 'h-memo';
    memo.textContent = record.memo;
    li.append(memo);
  }

  const actions = document.createElement('div');
  actions.className = 'row-actions';

  const loadA = document.createElement('button');
  loadA.type = 'button';
  loadA.className = 'btn btn-ghost';
  loadA.textContent = 'Aへ読込';
  loadA.addEventListener('click', () => loadRecordInto('A', record));

  const loadB = document.createElement('button');
  loadB.type = 'button';
  loadB.className = 'btn btn-ghost';
  loadB.textContent = 'Bへ読込';
  loadB.addEventListener('click', () => loadRecordInto('B', record));

  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'btn btn-ghost';
  del.textContent = '削除';
  let confirming = false;
  let revertTimer = null;
  del.addEventListener('click', () => {
    if (!confirming) {
      confirming = true;
      del.textContent = '本当に削除?';
      del.classList.add('btn-danger-confirm');
      revertTimer = setTimeout(() => {
        confirming = false;
        del.textContent = '削除';
        del.classList.remove('btn-danger-confirm');
      }, 3000);
      return;
    }
    clearTimeout(revertTimer);
    deleteRecord(record.id);
    renderHistory();
    showToast('削除しました');
  });

  actions.append(loadA, loadB, del);
  li.append(actions);
  return li;
}

function loadRecordInto(prefix, record) {
  $(`${prefix}-name`).value = record.name && record.name !== '(名称未設定)' ? record.name : '';
  $(`${prefix}-price`).value = record.price ?? '';
  $(`${prefix}-qty`).value = record.qty ?? '';
  $(`${prefix}-unit`).value = record.unit ?? '';
  $(`${prefix}-memo`).value = record.memo ?? '';

  if (record.multipack) {
    multipackToggle.checked = true;
    applyMultipackClass();
    $(`${prefix}-packCount`).value = record.packCount ?? 1;
    $(`${prefix}-packUnit`).value = record.packUnit ?? '個';
  }

  update();
  sheetController.close();
  showToast(`商品${prefix}に読み込みました`);
}

/* ---------------------------------------------------------------------- *
 * ホーム画面への追加案内
 * ---------------------------------------------------------------------- */

const installHint = $('installHint');
const installBtn = $('installBtn');
const iosInstallHint = $('iosInstallHint');
const installHintClose = $('installHintClose');

const INSTALL_DISMISS_KEY = 'otokuChecker.installHintDismissed';

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}
function isIos() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}
function isInstallHintDismissed() {
  try {
    return localStorage.getItem(INSTALL_DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

function hideInstallHint(remember) {
  installHint.classList.remove('show');
  if (remember) {
    try {
      localStorage.setItem(INSTALL_DISMISS_KEY, '1');
    } catch {
      /* 保存できなくても致命的ではないので無視する */
    }
  }
}

installHintClose.addEventListener('click', () => hideInstallHint(true));

let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  if (!isStandalone() && !isInstallHintDismissed()) {
    installHint.classList.add('show');
    installBtn.hidden = false;
  }
});

installBtn.addEventListener('click', async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  hideInstallHint(false);
});

window.addEventListener('appinstalled', () => {
  hideInstallHint(false);
});

if (!isStandalone() && isIos() && !isInstallHintDismissed()) {
  installHint.classList.add('show');
  iosInstallHint.hidden = false;
}

/* ---------------------------------------------------------------------- *
 * Service Worker 登録
 * ---------------------------------------------------------------------- */

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js').catch((err) => {
      console.error('Service worker の登録に失敗しました', err);
    });
  });
}

/* ---------------------------------------------------------------------- *
 * 初期化
 * ---------------------------------------------------------------------- */

update();
