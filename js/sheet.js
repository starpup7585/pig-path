// Apple Maps–style draggable bottom sheet with three snap points: peek, half, full.

export function createSheet(el, { onChange } = {}) {
  const handle = el.querySelector('.sheet-drag');
  const content = el.querySelector('.sheet-content');
  const probe = document.getElementById('safeProbe'); // measures the home-indicator inset

  let state = 'peek';
  let current = 0;
  let drag = null;

  const visibleFor = {
    peek: () => handle.offsetHeight + probe.offsetHeight,
    half: () => Math.round(window.innerHeight * 0.46),
    full: () => el.offsetHeight,
  };
  const translateFor = (s) => Math.max(0, el.offsetHeight - visibleFor[s]());

  function setTranslate(t) {
    current = t;
    el.style.transform = `translate3d(0, ${t}px, 0)`;
  }

  function snapTo(s, animate = true) {
    state = s;
    el.classList.toggle('full', s === 'full');
    if (!animate) el.classList.add('dragging');
    setTranslate(translateFor(s));
    if (!animate) {
      void el.offsetHeight; // flush so the jump isn't animated
      el.classList.remove('dragging');
    }
    if (s !== 'full') content.scrollTop = 0;
    onChange?.(s, el.offsetHeight - current);
  }

  function begin(y, t) {
    drag = { startY: y, startT: current, lastY: y, lastT: t, v: 0 };
    el.classList.add('dragging');
  }

  function move(y, t) {
    if (!drag) return;
    let next = drag.startT + (y - drag.startY);
    const min = translateFor('full');
    const max = translateFor('peek');
    if (next < min) next = min - (min - next) * 0.25; // rubber-band
    if (next > max) next = max + (next - max) * 0.25;
    setTranslate(next);
    const dt = Math.max(1, t - drag.lastT);
    drag.v = 0.8 * ((y - drag.lastY) / dt) + 0.2 * drag.v;
    drag.lastY = y;
    drag.lastT = t;
  }

  function end() {
    if (!drag) return;
    const projected = current + drag.v * 180; // fling momentum
    drag = null;
    el.classList.remove('dragging');
    let best = 'peek';
    let bestD = Infinity;
    for (const s of ['full', 'half', 'peek']) {
      const d = Math.abs(translateFor(s) - projected);
      if (d < bestD) { bestD = d; best = s; }
    }
    snapTo(best);
  }

  // Drag from the grabber / search header.
  handle.addEventListener('pointerdown', (e) => {
    if (e.target.closest('input, button')) return;
    handle.setPointerCapture(e.pointerId);
    begin(e.clientY, e.timeStamp);
  });
  handle.addEventListener('pointermove', (e) => move(e.clientY, e.timeStamp));
  handle.addEventListener('pointerup', end);
  handle.addEventListener('pointercancel', end);

  // Drag from the content: always when not full, or pulling down from the top when full.
  let touch = null;
  content.addEventListener('touchstart', (e) => {
    touch = { y: e.touches[0].clientY, active: false };
  }, { passive: true });
  content.addEventListener('touchmove', (e) => {
    if (!touch) return;
    const y = e.touches[0].clientY;
    const dy = y - touch.y;
    if (!touch.active) {
      const canDrag = state !== 'full' ? Math.abs(dy) > 6 : content.scrollTop <= 0 && dy > 6;
      if (!canDrag) return;
      touch.active = true;
      begin(y, e.timeStamp);
    }
    e.preventDefault();
    move(y, e.timeStamp);
  }, { passive: false });
  const touchEnd = () => {
    if (touch?.active) end();
    touch = null;
  };
  content.addEventListener('touchend', touchEnd);
  content.addEventListener('touchcancel', touchEnd);

  window.addEventListener('resize', () => snapTo(state, false));
  requestAnimationFrame(() => snapTo('peek', false));

  return {
    snapTo,
    get state() { return state; },
  };
}
