// Home screen: calorie gauge, macro cards, water, meals.
import { el, esc, $, $$, icons, animateNumber, setFill, limitStatus, dateSwitcher, toast, round1 } from './ui.js';
import { MEALS, MACROS, totals, scale, fmt } from './nutrients.js';
import * as store from './store.js';
import * as fooddb from './fooddb.js';
import { openAddFood, openFoodDetail, changed } from './sheets.js';
import { openSheet } from './ui.js';
import * as health from './health.js';
import { laurels, mealIcons, hydriaSvg, HYDRIA_H } from './art.js';

// Open arc gauge: 250° sweep, open at the bottom.
const CX = 150, CY = 142, R = 116, SWEEP = 125;
const pt = (deg) => [CX + R * Math.sin((deg * Math.PI) / 180), CY - R * Math.cos((deg * Math.PI) / 180)];
const [AX, AY] = pt(-SWEEP);
const [BX, BY] = pt(SWEEP);
const ARC = `M${AX.toFixed(1)} ${AY.toFixed(1)} A${R} ${R} 0 1 1 ${BX.toFixed(1)} ${BY.toFixed(1)}`;
const TICKS = Array.from({ length: 26 }, (_, i) => {
  const a = -SWEEP + (i * 2 * SWEEP) / 25;
  const r1 = R + 13, r2 = R + (i % 5 === 0 ? 20 : 17);
  const s1 = [CX + r1 * Math.sin((a * Math.PI) / 180), CY - r1 * Math.cos((a * Math.PI) / 180)];
  const s2 = [CX + r2 * Math.sin((a * Math.PI) / 180), CY - r2 * Math.cos((a * Math.PI) / 180)];
  return `<line x1="${s1[0].toFixed(1)}" y1="${s1[1].toFixed(1)}" x2="${s2[0].toFixed(1)}" y2="${s2[1].toFixed(1)}"/>`;
}).join('');

// Suggested share of the calorie goal per meal.
const MEAL_SHARE = { breakfast: [0.25, 0.35], lunch: [0.3, 0.4], dinner: [0.3, 0.4], snacks: [0.05, 0.15] };

const sectionHead = (label) => el(`<div class="section-h"><span>${label}</span><i class="meander" aria-hidden="true"></i></div>`);

export function mountToday(view, state) {
  view.innerHTML = '';

  const hero = el(`
    <section class="hero" aria-label="Calories">
      <div class="datebar" data-datebar></div>
      <div class="gauge">
        <div class="side"><div class="side-l">Eaten</div><div class="side-v num" data-eaten>0</div><div class="side-u">kcal</div></div>
        <div class="arc-wrap">
          <svg class="arc" viewBox="0 0 300 250" aria-hidden="true">
            <g class="ticks">${TICKS}</g>
            <path class="arc-track" d="${ARC}"/>
            <path class="arc-bar c-green" d="${ARC}" pathLength="100" stroke-dasharray="100 100" stroke-dashoffset="100"/>
          </svg>
          <div class="arc-center">
            <div class="eyebrow" data-remaining-label>Remaining</div>
            <div class="big num" data-remaining>0</div>
            <div class="arc-goal num">Goal <span data-goal>0</span> kcal</div>
          </div>
          <div class="arc-laurels">${laurels()}</div>
        </div>
        <div class="side"><div class="side-l">Of goal</div><div class="side-v num" data-pct>0%</div><div class="side-u">&nbsp;</div></div>
      </div>
    </section>`);
  view.appendChild(hero);

  const macroCard = el(`<section class="macro-grid" aria-label="Macros">${MACROS.map((m) => `
    <div class="macro" data-macro="${m.key}">
      <div class="macro-name">${m.label}</div>
      <div class="macro-val num"><b data-v>0</b><span>/<span data-g>0</span>g</span></div>
      <div class="track thin"><div class="fill"></div></div>
    </div>`).join('')}</section>`);
  view.appendChild(macroCard);

  view.appendChild(sectionHead('Hydration'));
  const water = el(`
    <section class="card" aria-label="Water">
      <div class="water">
        <div class="glass">${hydriaSvg()}</div>
        <div class="water-info">
          <div class="water-big num"><span data-wv>0</span><small> / <span data-wg></span> L</small></div>
          <div class="muted small" data-wleft></div>
          <div class="chips">
            <button class="chip primary" type="button" data-add="250">+250 ml</button>
            <button class="chip primary" type="button" data-add="500">+500 ml</button>
            <button class="chip" type="button" data-custom>Custom</button>
            <button class="chip" type="button" data-undo aria-label="Undo last water entry">Undo</button>
          </div>
        </div>
      </div>
    </section>`);
  view.appendChild(water);

  const healthCard = el(`
    <section class="card" aria-label="Apple Health" hidden>
      <div class="row">
        <div style="flex:1;min-width:0"><div class="eyebrow">Apple Health</div><div class="small muted" data-hstatus style="margin-top:4px"></div></div>
        <button class="chip primary" type="button" data-hsend>Send to Health</button>
      </div>
      <p class="note" data-hwarn hidden></p>
      <button class="btn sm link" type="button" data-hundo hidden>Didn't arrive? Mark as not sent</button>
    </section>`);
  view.appendChild(healthCard);

  view.appendChild(sectionHead('Meals'));
  const mealsBox = el('<div></div>');
  view.appendChild(mealsBox);
  for (const m of MEALS) {
    const card = el(`
      <section class="card meal" data-meal="${m.key}" aria-label="${m.label}">
        <div class="meal-head">
          <div class="meal-icon">${mealIcons[m.key]}</div>
          <div style="flex:1;min-width:0"><div class="meal-title">${m.label}</div><div class="meal-sub num" data-sub></div></div>
          <button class="iconbtn add" type="button" data-add aria-label="Add food to ${m.label}">${icons.plus}</button>
        </div>
        <div class="items" data-items></div>
      </section>`);
    $(card, '[data-add]').onclick = () => openAddFood({ date: state.date, meal: m.key });
    mealsBox.appendChild(card);
  }

  // Water actions
  let waterBusy = false;
  const addWater = async (ml) => {
    if (waterBusy || !(ml > 0)) return;
    waterBusy = true;
    await store.addWater(state.date, ml);
    waterBusy = false;
    navigator.vibrate?.(15);
    changed();
  };
  $$(water, '[data-add]').forEach((b) => (b.onclick = () => addWater(Number(b.dataset.add))));
  $(water, '[data-undo]').onclick = async () => {
    const list = (await store.waterFor(state.date)).sort((a, b) => b.ts - a.ts);
    if (!list.length) return;
    await store.deleteWater(list[0].id);
    toast(`Removed ${list[0].ml} ml`);
    changed();
  };
  $(water, '[data-custom]').onclick = () => {
    const body = el(`<form><label class="field"><span>Amount (ml)</span><input class="input big-input num" type="number" inputmode="numeric" min="1" step="1" value="330"></label>
      <div class="chips">${[150, 330, 750, 1000].map((v) => `<button type="button" class="chip" data-v="${v}">${v} ml</button>`).join('')}</div></form>`);
    const s = openSheet({ title: 'Add water', body, foot: '<div class="btns"><button class="btn go" data-ok>Add</button></div>' });
    const input = $(body, 'input');
    $$(body, '[data-v]').forEach((b) => (b.onclick = () => (input.value = b.dataset.v)));
    const go = () => { const v = Number(input.value); if (v > 0) { addWater(v); s.close(); } };
    $(s.el, '[data-ok]').onclick = go;
    body.onsubmit = (e) => { e.preventDefault(); go(); };
  };

  $(healthCard, '[data-hsend]').onclick = async () => {
    const p = await health.pending(state.date);
    if (!p.any) return toast('Nothing new to send');
    const parts = [['kcal', 'kcal'], ['protein', 'g protein'], ['carbs', 'g carbs'], ['fat', 'g fat'], ['water', 'ml water']]
      .filter(([k]) => p.delta[k] > 0).map(([k, u]) => `${Math.round(p.delta[k]).toLocaleString('en-GB')} ${u}`);
    toast(`Sending ${parts.join(', ') || 'micronutrients'}…`);
    setTimeout(() => health.send(state.date).then(() => refreshHealth()), 350);
  };
  $(healthCard, '[data-hundo]').onclick = async () => {
    if (await health.undoLastSend()) toast('Marked as not sent — tap Send to try again');
    refreshHealth();
  };

  async function refreshHealth() {
    const settings = await store.getSettings();
    healthCard.hidden = !settings.health?.enabled;
    if (healthCard.hidden) return;
    const p = await health.pending(state.date);
    const when = p.lastSentAt ? new Date(p.lastSentAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : null;
    const parts = [];
    if (p.delta.kcal > 0) parts.push(`${Math.round(p.delta.kcal).toLocaleString('en-GB')} kcal`);
    if (p.delta.water > 0) parts.push(`${Math.round(p.delta.water).toLocaleString('en-GB')} ml water`);
    $(healthCard, '[data-hstatus]').textContent = p.any
      ? `${parts.join(' · ') || 'New nutrients'} not sent yet${when ? ` · last sent ${when}` : ''}`
      : when ? `Up to date · last sent ${when}` : 'Nothing logged to send yet';
    $(healthCard, '[data-hsend]').disabled = !p.any;
    const warn = $(healthCard, '[data-hwarn]');
    warn.hidden = !p.reduced.length;
    warn.textContent = p.reduced.length
      ? 'Some amounts went down after you sent them (an entry was edited or deleted). Apple Health can only be added to from here, so adjust those in the Health app.'
      : '';
    $(healthCard, '[data-hundo]').hidden = !(await health.canUndo(state.date));
  }

  async function refresh() {
    refreshHealth();
    $(hero, '[data-datebar]').replaceChildren(dateSwitcher(state.date, (d) => { state.date = d; refresh(); }));
    const [settings, entries, waterList] = await Promise.all([store.getSettings(), store.entriesFor(state.date), store.waterFor(state.date)]);
    await fooddb.load();
    const t = totals(entries);

    // Hero
    const eaten = t.kcal.value;
    const goal = settings.kcal;
    const remaining = goal - eaten;
    const st = limitStatus(eaten, goal);
    const bar = $(hero, '.arc-bar');
    bar.setAttribute('class', `arc-bar c-${st}`);
    bar.style.strokeDashoffset = 100 * (1 - Math.min(1, goal ? eaten / goal : 0));
    animateNumber($(hero, '[data-remaining]'), Math.abs(remaining));
    $(hero, '[data-remaining]').className = `big num${remaining < 0 ? ' c-red' : ''}`;
    $(hero, '[data-remaining-label]').textContent = remaining < 0 ? 'Over' : 'Remaining';
    animateNumber($(hero, '[data-eaten]'), eaten);
    animateNumber($(hero, '[data-goal]'), goal);
    animateNumber($(hero, '[data-pct]'), goal ? (eaten / goal) * 100 : 0, (v) => `${Math.round(v)}%`);

    // Macros
    for (const m of MACROS) {
      const row = $(macroCard, `[data-macro="${m.key}"]`);
      const v = t[m.key].value;
      const g = settings[m.key];
      animateNumber($(row, '[data-v]'), v);
      $(row, '[data-g]').textContent = g;
      setFill($(row, '.fill'), g ? v / g : 0, limitStatus(v, g));
    }

    // Water
    const ml = waterList.reduce((s, w) => s + w.ml, 0);
    const wgoal = settings.water || 2500;
    const frac = Math.min(1, ml / wgoal);
    $(water, '.level').style.transform = `translateY(${HYDRIA_H * (1 - frac) + (frac > 0 ? 0 : 6)}px)`;
    $(water, '.glass').classList.toggle('full', ml >= wgoal);
    animateNumber($(water, '[data-wv]'), ml / 1000, (v) => v.toFixed(2));
    $(water, '[data-wg]').textContent = (wgoal / 1000).toFixed(2).replace(/\.?0+$/, '');
    $(water, '[data-wleft]').textContent = ml >= wgoal ? 'Goal reached — nice work.' : `${Math.round(wgoal - ml).toLocaleString('en-GB')} ml to go · ${waterList.length} ${waterList.length === 1 ? 'drink' : 'drinks'}`;
    $(water, '[data-undo]').disabled = !waterList.length;

    // Meals
    for (const m of MEALS) {
      const card = $(mealsBox, `[data-meal="${m.key}"]`);
      const list = entries.filter((e) => e.meal === m.key).sort((a, b) => a.ts - b.ts);
      const mt = totals(list);
      const [lo, hi] = MEAL_SHARE[m.key].map((f) => Math.round((settings.kcal * f) / 5) * 5);
      $(card, '[data-sub]').innerHTML = list.length
        ? `<b>${fmt(mt.kcal.value, 'kcal')} kcal</b> · P ${fmt(mt.protein.value)} · C ${fmt(mt.carbs.value)} · F ${fmt(mt.fat.value)}`
        : `Recommended ${lo.toLocaleString('en-GB')} – ${hi.toLocaleString('en-GB')} kcal`;
      const items = $(card, '[data-items]');
      items.innerHTML = '';
      for (const e of list) {
        const n = scale(e.per100, e.amount);
        const amountText = e.servingLabel && e.qty ? `${round1(e.qty)} × ${e.servingLabel}` : `${fmt(e.amount)} ${e.unit}`;
        const b = el(`
          <button class="item" type="button">
            <div class="item-main">
              <div class="item-name">${esc(e.name)}</div>
              <div class="item-meta num">${esc(amountText)}${e.recipe ? ` · ${esc(e.recipe)}` : ''} · P ${fmt(n.protein)} C ${fmt(n.carbs)} F ${fmt(n.fat)}</div>
            </div>
            <div class="item-kcal num">${n.kcal === null ? '—' : fmt(n.kcal, 'kcal')} <small>kcal</small></div>
          </button>`);
        b.onclick = async () => {
          const food = (e.foodId && (await store.getFood(e.foodId))) || { name: e.name, brand: e.brand, unit: e.unit, servings: [], source: 'entry' };
          openFoodDetail(food, { entry: e });
        };
        items.appendChild(b);
      }
    }
  }
  return { refresh };
}
