// motion.js — 依存ライブラリを使わない、最小限のバネ物理アニメーション。
//
// オフライン前提の PWA なので、CDN 上のアニメーションライブラリには頼らない
// (電波が悪い店内で動かなくなると本末転倒なため)。Apple の
// "Designing Fluid Interfaces" (WWDC18) が提案する「ダンピング比 + 反応速度」
// というパラメータ化だけを借りて、ごく小さなバネ積分器を自前で持つ。
//
// 使うのは、ジェスチャーで直接つかむ履歴シート(ボトムシート)のドラッグだけ。
// それ以外の状態変化(カードのハイライトなど)は CSS transition で十分なので、
// ここでは「指に追従する・途中でつかみ直せる」ことが必要な場面に絞っている。

export function prefersReducedMotion() {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * 1次元の値をバネで target に近づけ続けるコントローラーを作る。
 * set() を呼ぶたびに「今の値・今の速度」から再計算するので、
 * アニメーションの途中で目標を変えても飛ばずに自然につながる。
 */
export function createSpringValue(initial = 0) {
  let value = initial;
  let velocity = 0;
  let target = initial;
  let dampingRatio = 1;
  let angularFreq = (2 * Math.PI) / 0.4;
  let rafId = null;
  let onUpdate = null;
  let onSettle = null;

  let settleDistance = 0.001;
  let settleVelocity = 0.001;

  function tick() {
    const dt = 1 / 60;
    const k = angularFreq * angularFreq;
    const c = 2 * dampingRatio * angularFreq;
    const accel = -k * (value - target) - c * velocity;
    velocity += accel * dt;
    value += velocity * dt;
    if (onUpdate) onUpdate(value);

    if (Math.abs(value - target) < settleDistance && Math.abs(velocity) < settleVelocity) {
      value = target;
      velocity = 0;
      if (onUpdate) onUpdate(value);
      rafId = null;
      if (onSettle) onSettle();
      return;
    }
    rafId = requestAnimationFrame(tick);
  }

  return {
    set(
      newTarget,
      {
        dampingRatio: dr = 1,
        response = 0.4,
        velocity: initialVelocity,
        update,
        settle,
        immediate,
        settleDistance: sd = 0.001,
        settleVelocity: sv = 0.001,
      } = {}
    ) {
      target = newTarget;
      dampingRatio = dr;
      angularFreq = (2 * Math.PI) / Math.max(response, 0.001);
      if (update) onUpdate = update;
      onSettle = settle || null;
      settleDistance = sd;
      settleVelocity = sv;
      if (typeof initialVelocity === 'number') velocity = initialVelocity;

      if (immediate || prefersReducedMotion()) {
        if (rafId) cancelAnimationFrame(rafId);
        rafId = null;
        value = target;
        velocity = 0;
        if (onUpdate) onUpdate(value);
        if (onSettle) onSettle();
        return;
      }
      if (!rafId) rafId = requestAnimationFrame(tick);
    },
    jumpTo(v) {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = null;
      value = v;
      target = v;
      velocity = 0;
    },
    get value() {
      return value;
    },
    get velocity() {
      return velocity;
    },
    stop() {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = null;
    },
  };
}

// 境界を超えた分だけ抵抗をかける(ゴムひものような手応え)。
// overshoot: 境界を超えた量(px), dimension: 全体の可動域(px)
export function rubberband(overshoot, dimension, constant = 0.55) {
  if (dimension <= 0) return 0;
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}

// 離した瞬間の速度(px/秒)から、慣性で最終的にどこまで動くかを予測する。
export function projectMomentum(velocityPxPerSec, decelerationRate = 0.998) {
  return ((velocityPxPerSec / 1000) * decelerationRate) / (1 - decelerationRate);
}

/**
 * ドラッグ可能なボトムシート(履歴パネル)を 1本のハンドルに紐づける。
 * - ハンドルを押した瞬間から指に 1:1 で追従する
 * - 可動域を超えたらラバーバンドで抵抗する
 * - 離したら速度から着地点(開く/閉じる)を予測し、その速度を引き継いでバネで着地する
 *
 * @param {HTMLElement} sheetEl  translateY で動かす要素
 * @param {HTMLElement} handleEl ここを掴んでドラッグする
 * @param {HTMLElement} backdropEl 背景の暗幕(なくても可)
 * @param {{getMaxOffset: () => number, onOpenChange?: (isOpen:boolean)=>void}} opts
 */
export function makeDraggableSheet(sheetEl, handleEl, backdropEl, opts) {
  const spring = createSpringValue(opts.getMaxOffset());
  let dragging = false;
  let dragStartY = 0;
  let dragStartOffset = 0;
  let history = []; // {y, t}
  let isOpen = false;

  function applyOffset(offsetPx) {
    const max = opts.getMaxOffset();
    sheetEl.style.transform = `translateY(${offsetPx}px)`;
    if (backdropEl) {
      const ratio = max > 0 ? 1 - Math.min(Math.max(offsetPx / max, 0), 1) : 0;
      backdropEl.style.opacity = String(ratio * 0.45);
      backdropEl.style.pointerEvents = ratio > 0.02 ? 'auto' : 'none';
    }
  }

  function settleTo(target, velocity) {
    const opening = target < opts.getMaxOffset() - 1;
    spring.set(target, {
      dampingRatio: 0.86,
      response: 0.32,
      velocity,
      settleDistance: 0.5,
      settleVelocity: 20,
      update: applyOffset,
      settle: () => {
        if (isOpen !== opening) {
          isOpen = opening;
          if (opts.onOpenChange) opts.onOpenChange(isOpen);
        }
      },
    });
  }

  function onPointerDown(e) {
    dragging = true;
    dragStartY = e.clientY;
    dragStartOffset = spring.value;
    spring.stop();
    history = [{ y: e.clientY, t: performance.now() }];
    handleEl.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e) {
    if (!dragging) return;
    const max = opts.getMaxOffset();
    const rawDelta = e.clientY - dragStartY;
    let offset = dragStartOffset + rawDelta;

    if (offset < 0) {
      offset = -rubberband(-offset, max);
    } else if (offset > max) {
      offset = max + rubberband(offset - max, max);
    }
    spring.jumpTo(offset);
    applyOffset(offset);

    history.push({ y: e.clientY, t: performance.now() });
    if (history.length > 5) history.shift();
  }

  function onPointerUp() {
    if (!dragging) return;
    dragging = false;

    let velocity = 0;
    if (history.length >= 2) {
      const first = history[0];
      const last = history[history.length - 1];
      const dt = (last.t - first.t) / 1000;
      if (dt > 0) velocity = (last.y - first.y) / dt;
    }

    const max = opts.getMaxOffset();
    const projected = spring.value + projectMomentum(velocity);
    const shouldClose = projected > max * 0.5 || velocity > 600;
    settleTo(shouldClose ? max : 0, velocity);
  }

  handleEl.addEventListener('pointerdown', onPointerDown);
  handleEl.addEventListener('pointermove', onPointerMove);
  handleEl.addEventListener('pointerup', onPointerUp);
  handleEl.addEventListener('pointercancel', onPointerUp);

  return {
    open() {
      settleTo(0, 0);
    },
    close() {
      settleTo(opts.getMaxOffset(), 0);
    },
    get isOpen() {
      return isOpen;
    },
    // リサイズなどでシートを表示したまま最大量が変わった時に瞬時に合わせ直す
    refresh() {
      applyOffset(isOpen ? 0 : opts.getMaxOffset());
    },
  };
}
