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
      <button type="button" class="label" data-label><span>${esc(dateLabel(key))}</span>
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
