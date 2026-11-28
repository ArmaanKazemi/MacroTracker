// Home screen: calorie gauge, macro cards, water, meals.
import { el, esc, $, $$, icons, animateNumber, setFill, limitStatus, dateSwitcher, toast, round1, swipeToDelete } from './ui.js';
import { MEALS, MACROS, SUBS, MEAL_SHARE, totals, scale, fmt } from './nutrients.js';
import * as store from './store.js';
import * as fooddb from './fooddb.js';
import { openAddFood, openFoodDetail, changed } from './sheets.js';
import { openSheet } from './ui.js';
import * as health from './health.js';
import { mealIcons, hydriaSvg, HYDRIA_H, playSpill } from './art.js';
import { supplementsCard } from './supplements.js';
import { gutTodayCard } from './gutview.js';
import { planTodayCard } from './plannerview.js';
import { dayScore } from './score.js';

// Score ring: a full circle drawn from the top, with a faint dotted halo.
const RING = 'M110 18 a92 92 0 1 1 -0.01 0';
const statusIcon = { optimal: '<svg viewBox="0 0 12 12"><path d="M2.5 6.2l2.3 2.3 4.7-5"/></svg>', good: '<svg viewBox="0 0 12 12"><path d="M3 6h6"/></svg>', low: '<svg viewBox="0 0 12 12"><path d="M6 2.5v7M3 6.5l3 3 3-3"/></svg>', over: '<svg viewBox="0 0 12 12"><path d="M6 9.5v-7M3 5.5l3-3 3 3"/></svg>' };
const STATUS_LABEL = { optimal: 'Optimal', good: 'Good', low: 'Low', over: 'Over' };

// Suggested share of the calorie goal per meal.

const sectionHead = (label) => el(`<div class="section-h"><span>${label}</span></div>`);

// Which meal cards are collapsed (remembered on this device).
const COLLAPSE_KEY = 'pithos-collapsed';
function collapsed() {
  try { return new Set(JSON.parse(localStorage.getItem(COLLAPSE_KEY) || '[]')); } catch { return new Set(); }
}
function saveCollapsed(set) {
  try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...set])); } catch { /* private mode */ }
}
function applyCollapse(card, key, count) {
  const shut = count > 0 && collapsed().has(key);
  card.classList.toggle('collapsed', shut);
  const t = $(card, '[data-toggle]');
  t.hidden = !count;
  t.setAttribute('aria-expanded', String(!shut));
  $(card, '[data-count]')?.toggleAttribute('hidden', !shut);
}

export function mountToday(view, state) {
  view.innerHTML = '';

  const hero = el(`
    <section class="hero" aria-label="Daily score and calories">
      <div class="datebar" data-datebar></div>
      <a class="score-card grain" href="#/nutrients" aria-label="Daily score: open nutrients">
        <div class="score-ring">
          <svg viewBox="0 0 220 220" aria-hidden="true">
            <circle class="ring-halo" cx="110" cy="110" r="104" pathLength="100"/>
            <path class="ring-track" d="${RING}"/>
            <path class="ring-bar" d="${RING}" pathLength="100" stroke-dasharray="100 100" stroke-dashoffset="100"/>
          </svg>
          <div class="ring-center">
            <div class="eyebrow">Daily score</div>
            <div class="score-big num" data-score>0</div>
            <div class="score-sub">out of 100</div>
          </div>
        </div>
        <div class="glass-row">
          <div class="glass-text"><span class="eyebrow">Nutrients</span><span data-score-line>Nothing logged yet</span></div>
          <span class="round-arrow" aria-hidden="true">${icons.next}</span>
        </div>
      </a>
      <div class="kcal-card">
        <div class="kcal-top">
          <div>
            <div class="eyebrow" data-remaining-label>Remaining</div>
            <div class="kcal-big num" data-remaining>0</div>
          </div>
          <div class="kcal-unit">kcal</div>
        </div>
        <div class="kcal-bar"><i class="arc-bar c-green"></i></div>
        <div class="kcal-meta num"><span>Eaten <b data-eaten>0</b></span><span>Goal <b data-goal>0</b></span><span><b data-pct>0%</b> of goal</span></div>
      </div>
    </section>`);
  view.appendChild(hero);

  const statusCard = el(`
    <section class="card status-card" aria-label="Nutrient status">
      <div class="status-head"><span class="eyebrow">Nutrient status</span><span class="muted small num" data-total></span></div>
      <div class="seg-bar" aria-hidden="true"><i class="s-optimal"></i><i class="s-good"></i><i class="s-low"></i><i class="s-over"></i></div>
      <div class="status-counts">${['optimal', 'good', 'low', 'over'].map((k) => `<div><b class="num" data-n="${k}">0</b><span><i class="dot s-${k}"></i>${STATUS_LABEL[k]}</span></div>`).join('')}</div>
      <div class="chip-group" data-on hidden><div class="chip-h" data-on-h></div><div class="nchips" data-on-list></div></div>
      <div class="chip-group" data-off hidden><div class="chip-h" data-off-h></div><div class="nchips" data-off-list></div></div>
    </section>`);
  const macroCard = el(`<section class="macro-grid" aria-label="Macros">${MACROS.map((m) => `
    <div class="macro" data-macro="${m.key}">
      <div class="macro-name">${m.label}</div>
      <div class="macro-val num"><b data-v>0</b><span>/<span data-g>0</span>g</span></div>
      <div class="track thin"><div class="fill"></div></div>
      ${SUBS.filter((s) => s.parent === m.key).map((s) => `<div class="macro-sub" data-sub="${s.key}"><div class="ms-l">${s.of}</div><div class="ms-v num"><b data-v>0</b>/<span data-g>0</span>g</div></div>`).join('')}
    </div>`).join('')}</section>`);
  view.appendChild(macroCard);
  view.appendChild(statusCard);

  // Water and supplements share one card: swipe (or tap the tabs) between the two pages.
  const dailyHead = sectionHead('Water & supplements');
  const daily = el(`
    <section class="card daily" aria-label="Water and supplements">
      <div class="seg daily-tabs" role="tablist">
        <button role="tab" type="button" data-page="0">Water</button>
        <button role="tab" type="button" data-page="1">Supplements <span class="daily-badge" data-supp-badge></span></button>
      </div>
      <div class="daily-track"></div>
      <div class="daily-dots" aria-hidden="true"><i></i><i></i></div>
    </section>`);
  const water = el(`
    <div class="daily-page" aria-label="Water">
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
    </div>`);
  let lastWaterMl = null;
  const supps = supplementsCard(() => state.date);
  const track = $(daily, '.daily-track');
  track.append(water, supps.el);
  const PAGE_KEY = 'pithos-daily-page';
  const showPage = (i, smooth = true) => track.scrollTo({ left: i * track.clientWidth, behavior: smooth ? 'smooth' : 'auto' });
  const markPage = () => {
    const i = Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
    daily.querySelectorAll('[data-page]').forEach((b) => b.setAttribute('aria-selected', String(Number(b.dataset.page) === i)));
    daily.querySelectorAll('.daily-dots i').forEach((d, j) => d.classList.toggle('on', j === i));
    try { localStorage.setItem(PAGE_KEY, String(i)); } catch { /* private mode */ }
  };
  daily.querySelectorAll('[data-page]').forEach((b) => (b.onclick = () => showPage(Number(b.dataset.page))));
  track.addEventListener('scroll', () => requestAnimationFrame(markPage), { passive: true });
  requestAnimationFrame(() => {
    let start = 0;
    try { start = Number(localStorage.getItem(PAGE_KEY)) || 0; } catch { /* private mode */ }
    showPage(start, false);
    markPage();
  });

  const healthCard = el(`
    <section class="card" aria-label="Apple Health" hidden>
      <div class="row">
        <div style="flex:1;min-width:0"><div class="eyebrow">Apple Health</div><div class="small muted" data-hstatus style="margin-top:4px"></div></div>
        <button class="chip primary" type="button" data-hsend>Send to Health</button>
      </div>
      <p class="note" data-hwarn hidden></p>
      <button class="btn sm link" type="button" data-hundo hidden>Didn't arrive? Mark as not sent</button>
    </section>`);

  view.appendChild(sectionHead('Meals'));
  const mealsBox = el('<div></div>');
  view.appendChild(mealsBox);
  // Supplements (and anything else outside the four meals) still count towards the
  // day's totals; this line shows what they add so the meals plus it equal "Eaten".
  const extraLine = el(`<button class="extra-line" type="button" hidden><span class="extra-l" data-extra-l>Supplements</span><span class="num" data-extra-v></span>${icons.next}</button>`);
  view.appendChild(extraLine);
  extraLine.onclick = () => { daily.scrollIntoView({ behavior: 'smooth', block: 'center' }); showPage(1); };
  // Below the meals: water & supplements, then the Apple Health card.
  // Then the Gut log row, then Apple Health.
  const gut = gutTodayCard(() => state.date);
  view.append(dailyHead, daily, gut.el, healthCard);
  // Today's plan (planned meals, and in the evening tomorrow's prep) sits above the meals.
  const planCard = planTodayCard(() => state.date);
  mealsBox.before(planCard.el);
  for (const m of MEALS) {
    const card = el(`
      <section class="card meal" data-meal="${m.key}" aria-label="${m.label}">
        <div class="meal-head">
          <a class="meal-link" href="#/meal?m=${m.key}" data-open aria-label="Open ${m.label}">
            <div class="meal-icon">${mealIcons[m.key]}</div>
            <div style="flex:1;min-width:0"><div class="meal-title">${m.label}</div><div class="meal-sub num" data-sub></div></div>
          </a>
          <button class="iconbtn chev" type="button" data-toggle aria-label="Show or hide ${m.label} foods" hidden>${icons.next}</button>
          <button class="iconbtn add" type="button" data-add aria-label="Add food to ${m.label}">${icons.plus}</button>
        </div>
        <div class="items-wrap"><div class="items" data-items></div></div>
      </section>`);
    $(card, '[data-add]').onclick = () => openAddFood({ date: state.date, meal: m.key });
    $(card, '[data-toggle]').onclick = () => {
      const c = collapsed();
      c.has(m.key) ? c.delete(m.key) : c.add(m.key);
      saveCollapsed(c);
      applyCollapse(card, m.key, card.dataset.count | 0);
    };
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
    const g = $(water, '.glass');
    g.classList.remove('bump'); void g.offsetWidth; g.classList.add('bump');
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
    gut.refresh();
    planCard.refresh();
    $(hero, '[data-datebar]').replaceChildren(dateSwitcher(state.date, (d) => { state.date = d; refresh(); }, { future: true, tapToday: true }), el(`<a class="iconbtn gear" href="#/settings" aria-label="Settings" data-settings>${icons.settings}</a>`));
    const [settings, entries, waterList] = await Promise.all([store.settingsFor(state.date), store.entriesFor(state.date), store.waterFor(state.date)]); // that day's goals
    await fooddb.load();
    const t = totals(entries);

    // Calories (pale lime card)
    const eaten = t.kcal.value;
    const goal = settings.kcal;
    const remaining = goal - eaten;
    const st = goal && eaten > goal ? 'red' : 'green'; // green until the goal is passed
    const bar = $(hero, '.arc-bar');
    bar.setAttribute('class', `arc-bar c-${st}`);
    bar.style.transform = `scaleX(${Math.min(1, goal ? eaten / goal : 0)})`;
    animateNumber($(hero, '[data-remaining]'), Math.abs(remaining));
    $(hero, '[data-remaining]').className = `kcal-big num${remaining < 0 ? ' c-red' : ''}`;
    $(hero, '[data-remaining-label]').textContent = remaining < 0 ? 'Over' : 'Remaining';
    animateNumber($(hero, '[data-eaten]'), eaten);
    animateNumber($(hero, '[data-goal]'), goal);
    animateNumber($(hero, '[data-pct]'), goal ? (eaten / goal) * 100 : 0, (v) => `${Math.round(v)}%`);

    // Daily score (olive card) and nutrient status
    const sc = dayScore(t, entries, settings, state.date);
    const score = entries.length ? sc.score : 0;
    animateNumber($(hero, '[data-score]'), score, (v) => String(Math.round(v)));
    $(hero, '.ring-bar').style.strokeDashoffset = 100 - score;
    $(hero, '.ring-bar').style.opacity = score > 0 ? 1 : 0;
    const on = sc.items.filter((i) => i.status === 'optimal');
    const off = sc.items.filter((i) => i.status !== 'optimal');
    $(hero, '[data-score-line]').textContent = entries.length
      ? `${on.length} on target · ${off.length} with room to improve`
      : 'Nothing logged yet';
    $(statusCard, '[data-total]').textContent = `${sc.items.length} tracked`;
    $$(statusCard, '.seg-bar i').forEach((i) => {
      const k = i.className.slice(2);
      i.style.flexGrow = entries.length ? sc.counts[k] : 0;
    });
    statusCard.classList.toggle('empty-day', !entries.length);
    for (const k of Object.keys(sc.counts)) $(statusCard, `[data-n="${k}"]`).textContent = entries.length ? sc.counts[k] : 0;
    const chip = (i) => `<a class="nchip s-${i.status}" href="#/nutrients" title="${STATUS_LABEL[i.status]}"><i class="nchip-ic">${statusIcon[i.status]}</i>${esc(i.label)} <b class="num">${Math.round(i.pct)}${i.limit ? '%' : ''}</b></a>`;
    const showOn = entries.length && on.length, showOff = entries.length && off.length;
    $(statusCard, '[data-on]').hidden = !showOn;
    $(statusCard, '[data-off]').hidden = !showOff;
    $(statusCard, '[data-on-h]').textContent = `${on.length} ${on.length === 1 ? 'nutrient' : 'nutrients'} on target`;
    $(statusCard, '[data-off-h]').textContent = `${off.length} with room to improve`;
    $(statusCard, '[data-on-list]').innerHTML = on.map(chip).join('');
    $(statusCard, '[data-off-list]').innerHTML = off.map(chip).join('');

    // Macros
    for (const m of MACROS) {
      const row = $(macroCard, `[data-macro="${m.key}"]`);
      const v = t[m.key].value;
      const g = settings[m.key];
      animateNumber($(row, '[data-v]'), v);
      $(row, '[data-g]').textContent = g;
      setFill($(row, '.fill'), g ? v / g : 0, limitStatus(v, g));
    }
    for (const s of SUBS) {
      const row = $(macroCard, `[data-sub="${s.key}"]`);
      const v = t[s.key].value;
      const g = settings[s.key] ?? s.limit;
      $(row, '[data-v]').textContent = fmt(v);
      $(row, '[data-g]').textContent = g;
      row.className = `macro-sub${g && v > g ? ' over' : ''}`; // a limit: fine until it's passed
      row.title = t[s.key].missing ? `${t[s.key].missing} logged ${t[s.key].missing === 1 ? 'food has' : 'foods have'} no ${s.label.toLowerCase()} data` : '';
    }

    // Water
    const ml = waterList.reduce((s, w) => s + w.ml, 0);
    const wgoal = settings.water || 2500;
    const frac = Math.min(1, ml / wgoal);
    $(water, '.level').style.transform = `translateY(${HYDRIA_H * (1 - frac) + (frac > 0 ? 0 : 6)}px)`;
    $(water, '.glass').classList.toggle('full', ml >= wgoal);
    $(water, '.glass').classList.toggle('over', ml > wgoal);
    // Overflow plays when you first pass the goal, and again each time you drink more.
    if (ml > wgoal && ml !== lastWaterMl) playSpill($(water, '.glass'));
    lastWaterMl = ml;
    animateNumber($(water, '[data-wv]'), ml / 1000, (v) => v.toFixed(2));
    $(water, '[data-wg]').textContent = (wgoal / 1000).toFixed(2).replace(/\.?0+$/, '');
    $(water, '[data-wleft]').textContent = ml > wgoal ? `Overflowing: ${Math.round(ml - wgoal).toLocaleString('en-GB')} ml past your goal.` : ml >= wgoal ? 'Goal reached — nice work.' : `${Math.round(wgoal - ml).toLocaleString('en-GB')} ml to go · ${waterList.length} ${waterList.length === 1 ? 'drink' : 'drinks'}`;
    $(water, '[data-undo]').disabled = !waterList.length;

    // Supplements
    const sum = await supps.refresh(entries);
    $(daily, '[data-supp-badge]').textContent = sum.total ? `${sum.done}/${sum.total}` : '';

    // What supplements (or entries outside the four meals) add to the totals
    const outside = entries.filter((e) => !MEALS.some((m) => m.key === e.meal));
    const ot = totals(outside);
    const adds = ot.kcal.value >= 0.5 || ['protein', 'carbs', 'fat'].some((k) => ot[k].value >= 0.05);
    extraLine.hidden = !adds;
    if (adds) {
      $(extraLine, '[data-extra-l]').textContent = outside.every((e) => e.meal === 'supplements') ? 'Supplements' : 'Other entries';
      $(extraLine, '[data-extra-v]').innerHTML = `<b>${fmt(ot.kcal.value, 'kcal')} kcal</b> · P ${fmt(ot.protein.value)} · C ${fmt(ot.carbs.value)} · F ${fmt(ot.fat.value)}`;
    }

    // Meals
    for (const m of MEALS) {
      const card = $(mealsBox, `[data-meal="${m.key}"]`);
      const list = entries.filter((e) => e.meal === m.key).sort(store.byTime);
      const mt = totals(list);
      const [lo, hi] = MEAL_SHARE[m.key].map((f) => Math.round((settings.kcal * f) / 5) * 5);
      $(card, '[data-sub]').innerHTML = list.length
        ? `<b>${fmt(mt.kcal.value, 'kcal')} kcal</b> · P ${fmt(mt.protein.value)} · C ${fmt(mt.carbs.value)} · F ${fmt(mt.fat.value)}<span data-count hidden> · ${list.length} ${list.length === 1 ? 'item' : 'items'}</span>`
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
              <div class="item-meta num">${e.time ? `<span class="item-time">${esc(e.time)}</span> · ` : ''}${esc(amountText)}${e.recipe ? ` · ${esc(e.recipe)}` : ''} · P ${fmt(n.protein)} C ${fmt(n.carbs)} F ${fmt(n.fat)}</div>
            </div>
            <div class="item-kcal num">${n.kcal === null ? '—' : fmt(n.kcal, 'kcal')} <small>kcal</small></div>
          </button>`);
        b.onclick = async () => {
          const food = (e.foodId && (await store.getFood(e.foodId))) || { name: e.name, brand: e.brand, unit: e.unit, servings: [], source: 'entry' };
          openFoodDetail(food, { entry: e });
        };
        // Swipe left to remove straight from Today (with Undo).
        items.appendChild(swipeToDelete(b, {
          label: 'Remove',
          onDelete: async () => {
            await store.deleteEntry(e.id);
            changed();
            toast(`Removed ${e.name.slice(0, 28)}`, { label: 'Undo', run: async () => { await store.saveEntry(e); changed(); } });
          },
        }));
      }
      if (list.length) items.appendChild(el(`<a class="meal-more" href="#/meal?m=${m.key}">Meal details ${icons.next}</a>`));
      card.dataset.count = list.length;
      applyCollapse(card, m.key, list.length);
    }
  }
  return { refresh };
}
