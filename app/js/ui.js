// Small DOM / UI helpers: escaping, element creation, sheets, toast, animations.

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export const $ = (root, sel) => root.querySelector(sel);
export const $$ = (root, sel) => [...root.querySelectorAll(sel)];

export const icons = {
  camera: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h3l1.6-2.2h6.8L17 8h3v11H4z" stroke="currentColor" stroke-width="2" stroke-linejoin="round" fill="none"/><circle cx="12" cy="13.2" r="3.4" stroke="currentColor" stroke-width="2" fill="none"/></svg>',
  edit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4zM13.5 6.5l4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>',
  trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 7h15M9.5 7V4.8h5V7M6.5 7l.9 12.2h9.2L17.5 7M10.2 10.5v5.5M13.8 10.5v5.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>',
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" fill="none"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" fill="none"/></svg>',
  back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>',
  next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>',
  search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5" stroke="currentColor" stroke-width="2.4" fill="none"/><path d="M16 16l4.5 4.5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
  star: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5l2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.8l-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z" stroke="currentColor" stroke-width="2" stroke-linejoin="round" fill="none"/></svg>',
  starFill: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5l2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.8l-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z" fill="#ffb547" stroke="#ffb547" stroke-width="2" stroke-linejoin="round"/></svg>',
  scan: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8V5h3M17 5h3v3M20 16v3h-3M7 19H4v-3M8 9v6M11 9v6M14 9v6M17 9v6" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/></svg>',
};

// ---------- status colours ----------
/** For limits (calories, macros): green on track, amber close, red over. */
export function limitStatus(value, goal) {
  if (!goal) return 'green';
  const p = value / goal;
  if (p > 1.05) return 'red';
  if (p >= 0.9) return 'amber';
  return 'green';
}
/** For targets to reach (micronutrients): red low, amber getting there, green met. */
export function targetStatus(value, goal) {
  if (!goal) return 'green';
  const p = value / goal;
  if (p >= 1) return 'green';
  if (p >= 0.5) return 'amber';
  return 'red';
}

export function setFill(fillEl, frac, status) {
  const f = Math.max(0, Math.min(1, frac || 0));
  fillEl.style.transform = `scaleX(${f})`;
  fillEl.classList.remove('bg-green', 'bg-amber', 'bg-red');
  fillEl.classList.add(`bg-${status}`);
}

// ---------- animated numbers ----------
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
export function animateNumber(node, to, format = (v) => Math.round(v).toLocaleString('en-GB'), dur = 700) {
  const from = node._val ?? 0;
  node._val = to;
  cancelAnimationFrame(node._raf);
  if (reduceMotion || from === to || document.hidden) {
    node.textContent = format(to);
    return;
  }
  const t0 = performance.now();
  const step = (t) => {
    const k = Math.min(1, (t - t0) / dur);
    const e = 1 - Math.pow(1 - k, 3);
    node.textContent = format(from + (to - from) * e);
    if (k < 1) node._raf = requestAnimationFrame(step);
  };
  node._raf = requestAnimationFrame(step);
}

// ---------- toast ----------
let toastTimer;
export function toast(msg, action) {
  const t = document.getElementById('toast');
  t.innerHTML = `<span>${esc(msg)}</span>`;
  if (action) {
    const b = el(`<button type="button">${esc(action.label)}</button>`);
    b.onclick = () => {
      t.classList.remove('show');
      action.run();
    };
    t.appendChild(b);
  }
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), action ? 5000 : 2400);
}

// ---------- bottom sheets (stackable) ----------
const stack = [];

/**
 * openSheet({ title, body: Element|string, foot?: Element|string, tall?, onClose? })
 * Returns the sheet handle { el, body, foot, close }.
 */
export function openSheet({ title, body, foot, tall = false, onClose }) {
  const root = document.getElementById('sheets');
  const back = el('<div class="sheet-back"></div>');
  const sheet = el(`
    <section class="sheet${tall ? ' tall' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="sheet-grab"></div>
      <div class="sheet-head"><h2>${esc(title)}</h2>
        <button class="iconbtn" type="button" data-close aria-label="Close">${icons.close}</button></div>
      <div class="sheet-body"></div>
    </section>`);
  const bodyEl = $(sheet, '.sheet-body');
  if (typeof body === 'string') bodyEl.innerHTML = body;
  else if (body) bodyEl.appendChild(body);
  let footEl = null;
  if (foot) {
    footEl = el('<div class="sheet-foot"></div>');
    if (typeof foot === 'string') footEl.innerHTML = foot;
    else footEl.appendChild(foot);
    sheet.appendChild(footEl);
  }
  sheet.style.zIndex = 41 + stack.length * 2;
  back.style.zIndex = 40 + stack.length * 2;
  root.append(back, sheet);
  const handle = {
    el: sheet,
    body: bodyEl,
    foot: footEl,
    closed: false,
    close() {
      if (handle.closed) return;
      handle.closed = true;
      const i = stack.indexOf(handle);
      if (i >= 0) stack.splice(i, 1);
      sheet.classList.remove('open');
      back.classList.remove('open');
      setTimeout(() => { sheet.remove(); back.remove(); }, 380);
      onClose?.();
    },
  };
  stack.push(handle);
  back.onclick = handle.close;
  $(sheet, '[data-close]').onclick = handle.close;
  // Swipe down on the grab/head area to dismiss.
  let y0 = null;
  const head = $(sheet, '.sheet-head');
  for (const h of [head, $(sheet, '.sheet-grab')]) {
    h.addEventListener('touchstart', (e) => { y0 = e.touches[0].clientY; }, { passive: true });
    h.addEventListener('touchmove', (e) => {
      if (y0 === null) return;
      const dy = Math.max(0, e.touches[0].clientY - y0);
      sheet.style.transition = 'none';
      sheet.style.transform = `translateY(${dy}px)`;
    }, { passive: true });
    h.addEventListener('touchend', (e) => {
      const dy = e.changedTouches[0].clientY - (y0 ?? 0);
      sheet.style.transition = '';
      sheet.style.transform = '';
      y0 = null;
      if (dy > 90) handle.close();
    });
  }
  requestAnimationFrame(() => requestAnimationFrame(() => { sheet.classList.add('open'); back.classList.add('open'); }));
  return handle;
}

export function closeAllSheets() {
  [...stack].reverse().forEach((s) => s.close());
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && stack.length) stack[stack.length - 1].close();
});

export function confirmSheet(message, okLabel = 'Delete') {
  return new Promise((resolve) => {
    let answered = false;
    const s = openSheet({
      title: 'Are you sure?',
      body: `<p class="muted" style="margin:4px 0 8px">${esc(message)}</p>`,
      foot: `<div class="btns"><button class="btn" data-no>Cancel</button><button class="btn danger" data-yes>${esc(okLabel)}</button></div>`,
      onClose: () => { if (!answered) resolve(false); },
    });
    $(s.el, '[data-no]').onclick = () => s.close();
    $(s.el, '[data-yes]').onclick = () => { answered = true; resolve(true); s.close(); };
  });
}

// ---------- dates ----------
export function todayKey() {
  return dateKey(new Date());
}
export function dateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
export function parseKey(k) {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function addDays(k, n) {
  const d = parseKey(k);
  d.setDate(d.getDate() + n);
  return dateKey(d);
}
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function dateLabel(k) {
  const t = todayKey();
  if (k === t) return 'Today';
  if (k === addDays(t, -1)) return 'Yesterday';
  if (k === addDays(t, 1)) return 'Tomorrow';
  return parseKey(k).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

/** Date switcher control. onChange(newKey). */
export function dateSwitcher(key, onChange) {
  const w = el(`
    <div class="datesw">
      <button type="button" data-prev aria-label="Previous day">${icons.back}</button>
      <button type="button" class="label" data-label><span>${esc(dateLabel(key))}</span>${/^(Today|Yesterday|Tomorrow)$/.test(dateLabel(key)) ? `<small>${parseKey(key).getDate()} ${MONTHS[parseKey(key).getMonth()]}</small>` : ''}
        <input type="date" aria-label="Pick a date" value="${key}" max="${todayKey()}"></button>
      <button type="button" data-next aria-label="Next day" ${key >= todayKey() ? 'disabled' : ''}>${icons.next}</button>
    </div>`);
  $(w, '[data-prev]').onclick = () => onChange(addDays(key, -1));
  $(w, '[data-next]').onclick = () => onChange(addDays(key, 1));
  const input = $(w, 'input');
  input.onchange = () => input.value && onChange(input.value > todayKey() ? todayKey() : input.value);
  $(w, '[data-label]').onclick = (e) => {
    if (e.target === input) return;
    try { input.showPicker(); } catch { input.focus(); }
  };
  return w;
}

export function round1(v) {
  return Math.round(v * 10) / 10;
}

// ---------- swipe left to delete ----------
let openSwipe = null;
document.addEventListener('pointerdown', (e) => {
  if (openSwipe && !openSwipe.wrap.contains(e.target)) openSwipe.close();
}, true);

/**
 * Wrap a list row so swiping it left reveals a Delete button.
 * A long swipe (past 60% of the width) deletes straight away.
 * Returns the wrapper element to insert instead of the row.
 */
export function swipeToDelete(content, { label = 'Delete', onDelete }) {
  const wrap = el(`<div class="swipe"><button class="swipe-del" type="button" tabindex="-1">${esc(label)}</button></div>`);
  content.classList.add('swipe-content');
  wrap.appendChild(content);
  const OPEN = 92;
  let x0 = 0, y0 = 0, dx = 0, base = 0, pid = null, decided = false, horizontal = false, suppress = false;

  const set = (x, animate) => {
    content.style.transition = animate ? '' : 'none';
    content.style.transform = x ? `translateX(${x}px)` : '';
  };
  const handle = {
    wrap,
    close() {
      base = 0;
      set(0, true);
      wrap.classList.remove('open');
      setTimeout(() => { if (!wrap.classList.contains('open')) wrap.classList.remove('swiping'); }, 320);
      if (openSwipe === handle) openSwipe = null;
    },
  };
  let deleted = false;
  const doDelete = () => {
    if (deleted) return;
    deleted = true;
    set(-wrap.offsetWidth, true);
    wrap.style.height = `${wrap.offsetHeight}px`;
    requestAnimationFrame(() => wrap.classList.add('gone'));
    if (openSwipe === handle) openSwipe = null;
    setTimeout(() => onDelete(), 220);
  };

  const start = (x, y) => {
    x0 = x;
    y0 = y;
    dx = base;
    decided = horizontal = false;
  };
  // Returns true once the gesture is a horizontal swipe (caller then blocks scrolling).
  const move = (x, y) => {
    const mx = x - x0;
    const my = y - y0;
    if (!decided) {
      if (Math.abs(mx) < 8 && Math.abs(my) < 8) return false;
      decided = true;
      horizontal = Math.abs(mx) > Math.abs(my) * 1.2;
      if (horizontal && openSwipe && openSwipe !== handle) openSwipe.close();
    }
    if (!horizontal) return false;
    wrap.classList.add('swiping');
    dx = Math.max(-wrap.offsetWidth, Math.min(0, base + mx));
    set(dx, false);
    return true;
  };
  const end = () => {
    if (!horizontal) return;
    horizontal = false;
    suppress = true;
    setTimeout(() => (suppress = false), 60);
    const w = wrap.offsetWidth;
    if (dx < -w * 0.6) doDelete();
    else if (dx < -OPEN / 2) {
      base = -OPEN;
      set(-OPEN, true);
      wrap.classList.add('open');
      openSwipe = handle;
    } else handle.close();
  };

  // Touch (iPhone): touch events, so we can stop the page scrolling once the swipe is horizontal.
  content.addEventListener('touchstart', (e) => start(e.touches[0].clientX, e.touches[0].clientY), { passive: true });
  content.addEventListener('touchmove', (e) => {
    if (move(e.touches[0].clientX, e.touches[0].clientY) && e.cancelable) e.preventDefault();
  }, { passive: false });
  content.addEventListener('touchend', end);
  content.addEventListener('touchcancel', end);
  // Mouse (desktop): pointer events.
  content.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    pid = e.pointerId;
    start(e.clientX, e.clientY);
  });
  content.addEventListener('pointermove', (e) => {
    if (e.pointerId !== pid) return;
    if (move(e.clientX, e.clientY)) { try { content.setPointerCapture(pid); } catch { /* ignore */ } }
  });
  const pend = (e) => { if (e.pointerId === pid) { pid = null; end(); } };
  content.addEventListener('pointerup', pend);
  content.addEventListener('pointercancel', pend);
  // Swallow the tap that ends a swipe, and use a tap on an open row to close it.
  wrap.addEventListener('click', (e) => {
    if (e.target.closest('.swipe-del')) return;
    if (suppress || wrap.classList.contains('open')) {
      e.stopPropagation();
      e.preventDefault();
      if (!suppress) handle.close();
    }
  }, true);
  $(wrap, '.swipe-del').onclick = doDelete;
  return wrap;
}
