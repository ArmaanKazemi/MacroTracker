// Quick log: type everything you ate in one box, check the matches, log it all.
//   "200g chicken breast, 2 eggs, 1 scoop impact whey"
//   "chicken wrap 450kcal 35p 40c 12f sodium 800mg"
import { el, esc, $, $$, icons, openSheet, toast } from './ui.js';
import { MEALS, MICROS, SUBS, scale, fmt, normNutrients } from './nutrients.js';
import { parseQuickLog } from './quickparse.js';
import * as fooddb from './fooddb.js';
import * as store from './store.js';
import { openFoodPicker, changed } from './sheets.js';

const STOP = new Set(['of', 'the', 'a', 'an', 'with', 'some', 'my', 'and']);
const words = (s) => s.toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9%]+/g, ' ').split(' ')
  .filter((w) => w && !STOP.has(w)).map((w) => w.replace(/ies$/, 'y').replace(/(?<=[a-z]{3})(es|s)$/, ''));

/** Best match among the user's own foods: every typed word must appear (prefix match allowed). */
function matchMine(name, foods) {
  const q = words(name);
  if (!q.length) return null;
  let best = null;
  for (const f of foods) {
    const fw = words(`${f.name} ${f.brand || ''}`);
    const hit = q.filter((t) => fw.some((x) => x.startsWith(t) || (t.length > 3 && t.startsWith(x) && x.length > 3))).length;
    if (hit < q.length) continue;
    const score = hit / fw.length + (f.favourite ? 0.2 : 0) + (f.lastUsed ? 0.1 : 0);
    if (!best || score > best.score) best = { f, score };
  }
  return best?.f || null;
}

/** Best generic (CoFID) match. */
function matchGeneric(name) {
  let res = fooddb.search(name, 5);
  if (!res.length) res = fooddb.search(words(name).join(' '), 5);
  const g = res[0];
  return g ? { source: 'generic', genericId: g.id, name: g.name, unit: 'g', servings: [] } : null;
}

// Typical weights when you say "2 eggs" and the food has no serving sizes.
const EACH = [
  [/\begg/, 50], [/\bbanana/, 100], [/\bapple/, 150], [/\borange/, 130], [/\bpear/, 150], [/\bkiwi/, 70],
  [/\bclementine|satsuma|mandarin/, 60], [/\bavocado/, 140], [/\bslice|toast|bread/, 36], [/\bcrumpet/, 55],
  [/\bbagel/, 85], [/\bwrap|tortilla/, 60], [/\bpotato/, 175], [/\btomato/, 85], [/\bcarrot/, 60],
];
const UNIT_EACH = { tbsp: 15, tsp: 5, glass: 250, can: 330, bottle: 500, handful: 30, scoop: 30, slice: 36, bowl: 250, cup: 240, pot: 150, bar: 50, sachet: 30, pack: 50, tin: 400 };

function resolveAmount(item, food) {
  const servings = food.servings || [];
  if (item.amount) return { amount: item.amount, servingLabel: null, qty: null, note: null };
  if (item.count) {
    let sv = item.countUnit ? servings.find((s) => s.label.toLowerCase().includes(item.countUnit)) : null;
    if (!sv && !item.countUnit && servings.length) sv = servings[0];
    if (sv) return { amount: sv.amount * item.count, servingLabel: sv.label, qty: item.count, note: null };
    const each = (item.countUnit && UNIT_EACH[item.countUnit]) || EACH.find(([re]) => re.test(`${item.name} ${food.name}`.toLowerCase()))?.[1];
    if (each) return { amount: each * item.count, servingLabel: null, qty: null, note: `≈${each} ${food.unit || 'g'} each` };
    return { amount: 100 * item.count, servingLabel: null, qty: null, note: 'amount guessed — check it' };
  }
  const d = store.defaultAmount(food);
  const known = food.lastAmount || servings.length;
  return { ...d, note: known ? (food.lastAmount ? 'your usual amount' : null) : 'no amount given — check it' };
}

export function openQuickLog({ date, meal, onLogged }) {
  const body = el(`
    <div class="ql">
      <p class="note" style="margin-top:0">Type everything you had, one food per line or separated by commas. Use the mic on your keyboard to speak it.</p>
      <textarea class="input ql-text" rows="4" autocomplete="off" autocorrect="off" spellcheck="false" placeholder="200g chicken breast, 2 eggs, 1 scoop impact whey
chicken wrap 450kcal 35p 40c 12f sodium 800mg"></textarea>
      <details class="ql-help"><summary>What can I type?</summary>
        <ul>
          <li><b>Amounts:</b> 200g, 250ml, 2 eggs, 1 scoop, 2 slices, half a banana, x2</li>
          <li><b>Your own values:</b> kcal / cal, protein or p, carbs or c, fat or f, sugar, sat fat, fibre, sodium (mg), salt (g), and any vitamin or mineral, e.g. <i>iron 2mg</i>, <i>vitamin d 10µg</i></li>
          <li><b>Shorthand:</b> <i>450kcal 35p 40c 12f</i></li>
          <li>Foods you've saved are matched first, then the UK database. Tap <b>Change</b> to pick a different one.</li>
        </ul>
      </details>
      <div data-rows></div>
    </div>`);
  const foot = el(`
    <div>
      <label class="toggle" data-save-row hidden style="margin:0 0 6px;min-height:40px"><span class="small">Save typed foods to My foods</span><span class="switch"><input type="checkbox" data-save-typed><span></span></span></label>
      <div class="row" style="gap:8px">
        <select class="input" data-meal style="flex:1" aria-label="Meal">${MEALS.map((m) => `<option value="${m.key}">${m.label}</option>`).join('')}</select>
        <button class="btn go" type="button" data-log disabled style="flex:1.4">Log</button>
      </div>
    </div>`);
  const sheet = openSheet({ title: 'Quick log', body, foot, tall: true });
  const text = $(body, '.ql-text');
  const rowsBox = $(body, '[data-rows]');
  const logBtn = $(foot, '[data-log]');
  $(foot, '[data-meal]').value = meal;

  // Manual changes survive re-parsing, keyed by what was typed.
  const overrides = new Map();
  let items = [];
  let seq = 0;

  async function build() {
    const my = ++seq;
    await fooddb.load();
    const mine = await store.getFoods();
    if (my !== seq) return;
    const parsed = parseQuickLog(text.value);
    items = parsed.map((it) => {
      const o = overrides.get(it.raw) || {};
      if (o.removed) return null;
      if (it.typed && !o.food) {
        const per100 = normNutrients(it.typed);
        return { it, typed: true, food: { name: cap(it.name || 'Quick entry'), unit: 'g', per100, source: 'custom', servings: [] }, amount: 100, servingLabel: 'portion', qty: 1, note: null };
      }
      const food = o.food || matchMine(it.name, mine) || matchGeneric(it.name);
      if (!food) return { it, food: null };
      const a = resolveAmount(it, food);
      if (o.amount !== undefined) { a.amount = o.amount; a.servingLabel = null; a.qty = null; a.note = null; }
      return { it, food, ...a };
    }).filter(Boolean);
    render();
  }

  function render() {
    rowsBox.innerHTML = '';
    if (!items.length) {
      if (text.value.trim()) rowsBox.appendChild(el('<p class="empty">Nothing recognised yet.</p>'));
      logBtn.disabled = true;
      logBtn.textContent = 'Log';
      $(foot, '[data-save-row]').hidden = true;
      return;
    }
    const tot = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
    for (const row of items) {
      const r = el('<div class="ql-row"></div>');
      if (!row.food) {
        r.classList.add('missing');
        r.innerHTML = `
          <div class="item-main"><div class="item-name">No match for “${esc(row.it.name)}”</div>
            <div class="item-meta">Pick a food, or add values like <i>${esc(row.it.name)} 300kcal 20p</i></div></div>
          <button class="btn sm" type="button" data-change>Find</button>
          <button class="iconbtn" type="button" data-rm aria-label="Remove">${icons.close}</button>`;
      } else {
        const { per100 } = row.typed ? { per100: row.food.per100 } : store.resolve(row.food);
        const n = scale(per100, row.amount);
        for (const k of Object.keys(tot)) tot[k] += n[k] || 0;
        const extras = row.typed ? Object.keys(row.it.typed).filter((k) => !['kcal', 'protein', 'carbs', 'fat'].includes(k)) : [];
        const label = (k) => (SUBS.find((s) => s.key === k)?.label || MICROS.find((m) => m.key === k)?.label || k);
        const unitOf = (k) => (SUBS.find((s) => s.key === k)?.unit || MICROS.find((m) => m.key === k)?.unit || 'g');
        r.innerHTML = `
          <div class="item-main">
            <div class="item-name">${esc(row.food.name)} <span class="tag">${row.typed ? 'Typed' : row.food.source === 'generic' ? (fooddb.info().full ? 'CoFID' : 'Generic') : 'Yours'}</span></div>
            <div class="item-meta num"><b>${n.kcal === null ? '—' : fmt(n.kcal, 'kcal')}</b> kcal · P ${fmt(n.protein)} · C ${fmt(n.carbs)} · F ${fmt(n.fat)}${extras.map((k) => ` · ${esc(label(k))} ${fmt(row.it.typed[k])}${unitOf(k)}`).join('')}</div>
            ${row.typed ? '<div class="item-meta">1 portion, your values</div>' : `
            <div class="ql-amt"><input class="input num" type="number" inputmode="decimal" min="0" step="any" value="${Math.round(row.amount * 10) / 10}" aria-label="Amount"> <span>${esc(row.food.unit || 'g')}${row.servingLabel ? ` · ${fmt(row.qty)} × ${esc(row.servingLabel)}` : ''}${row.note ? ` · <i>${esc(row.note)}</i>` : ''}</span></div>`}
            <div class="item-meta ql-typed">“${esc(row.it.raw)}”</div>
          </div>
          ${row.typed ? '' : '<button class="btn sm" type="button" data-change>Change</button>'}
          <button class="iconbtn" type="button" data-rm aria-label="Remove">${icons.close}</button>`;
        const amt = $(r, '.ql-amt input');
        if (amt) amt.onchange = () => { const v = Number(amt.value); if (v > 0) { overrides.set(row.it.raw, { ...overrides.get(row.it.raw), amount: v }); build(); } };
      }
      $(r, '[data-rm]').onclick = () => { overrides.set(row.it.raw, { removed: true }); build(); };
      const ch = $(r, '[data-change]');
      if (ch) ch.onclick = () => openFoodPicker((food) => { overrides.set(row.it.raw, { food }); build(); });
      rowsBox.appendChild(r);
    }
    const ok = items.filter((x) => x.food);
    rowsBox.appendChild(el(`<div class="ql-total num">Total <b>${fmt(tot.kcal, 'kcal')}</b> kcal · P ${fmt(tot.protein)} · C ${fmt(tot.carbs)} · F ${fmt(tot.fat)}</div>`));
    logBtn.disabled = !ok.length;
    logBtn.textContent = ok.length ? `Log ${ok.length} ${ok.length === 1 ? 'item' : 'items'}` : 'Log';
    $(foot, '[data-save-row]').hidden = !ok.some((x) => x.typed);
  }

  let timer = 0;
  text.oninput = () => { clearTimeout(timer); timer = setTimeout(build, 350); };
  text.focus();

  logBtn.onclick = async () => {
    const m = $(foot, '[data-meal]').value;
    const saveTyped = $(foot, '[data-save-typed]').checked;
    const created = [];
    for (const row of items.filter((x) => x.food)) {
      let food = row.food;
      if (row.typed && saveTyped) {
        food = await store.saveFood({ ...food, servings: [{ label: 'portion', amount: 100 }], favourite: false, createdAt: Date.now() });
      }
      created.push(await store.logFood(food, { date, meal: m, amount: row.amount, servingLabel: row.servingLabel || null, qty: row.qty || null }));
    }
    changed();
    sheet.close();
    onLogged?.();
    const label = MEALS.find((x) => x.key === m)?.label || m;
    toast(`Logged ${created.length} ${created.length === 1 ? 'item' : 'items'} to ${label}`, { label: 'Undo', run: async () => { for (const e of created) await store.deleteEntry(e.id); changed(); } });
  };
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
