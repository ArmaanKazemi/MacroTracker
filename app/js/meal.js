// Meal page: everything logged in one meal, with its nutrition against the
// meal's share of the daily goals. Opened from a meal card on Today.
import { el, esc, $, icons, toast, dateLabel, round1, swipeToDelete, animateNumber } from './ui.js';
import { MEALS, MEAL_SHARE, MICRO_GROUPS, totals, scale, fmt } from './nutrients.js';
import * as store from './store.js';
import { mealIcons } from './art.js';
import { openAddFood, openFoodDetail, sameAsYesterday, changed } from './sheets.js';

export function mountMeal(view, state) {
  view.innerHTML = '';
  const params = new URLSearchParams(location.hash.split('?')[1] || '');
  const meal = MEALS.find((m) => m.key === params.get('m')) || MEALS[0];
  if (params.get('d')) state.date = params.get('d');

  const top = el(`
    <div class="meal-top">
      <a class="iconbtn" href="#/today" data-back aria-label="Back to Today">${icons.back}</a>
      <div class="meal-top-icon">${mealIcons[meal.key]}</div>
      <div style="min-width:0"><h1 class="title">${meal.label}</h1><div class="muted" data-date></div></div>
    </div>`);
  $(top, '[data-back]').onclick = (e) => {
    // Came from Today: step back through history instead of stacking another entry.
    if (window.__prevRoute === 'today') { e.preventDefault(); history.back(); }
  };

  const summary = el(`
    <section class="card meal-sum">
      <div class="meal-kcal"><b class="num" data-kcal>0</b> <span>kcal</span></div>
      <div class="muted" data-range></div>
      <div class="meal-macros num" data-macros></div>
    </section>`);
  const itemsCard = el('<section class="card" aria-label="Foods in this meal"><div class="items meal-items" data-items></div></section>');
  const same = el('<div></div>');
  const actions = el(`<div class="btns" style="margin:4px 0 6px"><button class="btn go" type="button" data-add>${icons.plus} Add food</button></div>`);
  $(actions, '[data-add]').onclick = () => openAddFood({ date: state.date, meal: meal.key });
  const info = el('<section class="card" aria-label="Nutritional information"><div class="eyebrow">Nutritional information</div><div data-info></div></section>');
  view.append(top, summary, itemsCard, same, actions, info);

  async function refresh() {
    $(top, '[data-date]').textContent = dateLabel(state.date);
    const [settings, all] = await Promise.all([store.getSettings(), store.entriesFor(state.date)]);
    const list = all.filter((e) => e.meal === meal.key).sort((a, b) => a.ts - b.ts);
    const t = totals(list);
    const [loF, hiF] = MEAL_SHARE[meal.key];
    const lo = Math.round((settings.kcal * loF) / 5) * 5;
    const hi = Math.round((settings.kcal * hiF) / 5) * 5;
    const kcal = t.kcal.value;

    animateNumber($(summary, '[data-kcal]'), kcal);
    $(summary, '[data-kcal]').className = `num${list.length && kcal > hi ? ' c-red' : ''}`;
    $(summary, '[data-range]').textContent = `Recommended ${lo.toLocaleString('en-GB')} – ${hi.toLocaleString('en-GB')} kcal${list.length ? (kcal > hi ? ' · over' : kcal >= lo ? ' · on target' : '') : ''}`;
    $(summary, '[data-macros]').innerHTML = `P <b>${fmt(t.protein.value)}</b>g · C <b>${fmt(t.carbs.value)}</b>g · F <b>${fmt(t.fat.value)}</b>g`;

    // Items
    const items = $(itemsCard, '[data-items]');
    items.innerHTML = '';
    if (!list.length) items.appendChild(el('<p class="empty" style="margin:4px 0">Nothing logged yet.</p>'));
    for (const e of list) {
      const n = scale(e.per100, e.amount);
      const amountText = e.servingLabel && e.qty ? `${round1(e.qty)} × ${e.servingLabel}` : `${fmt(e.amount)} ${e.unit}`;
      const row = el(`
        <div class="item meal-item" role="button" tabindex="0">
          <div class="item-main">
            <div class="item-name">${esc(e.name)}</div>
            <div class="item-meta num">${e.brand ? `${esc(e.brand)} · ` : ''}${esc(amountText)} · P ${fmt(n.protein)} C ${fmt(n.carbs)} F ${fmt(n.fat)}</div>
          </div>
          <div class="item-kcal num">${n.kcal === null ? '—' : fmt(n.kcal, 'kcal')} <small>kcal</small></div>
          <button class="iconbtn" type="button" data-del aria-label="Remove ${esc(e.name)}">${icons.close}</button>
        </div>`);
      const open = async () => {
        const food = (e.foodId && (await store.getFood(e.foodId))) || { name: e.name, brand: e.brand, unit: e.unit, servings: [], source: 'entry' };
        openFoodDetail(food, { entry: e });
      };
      const remove = async () => {
        await store.deleteEntry(e.id);
        changed();
        toast(`Removed ${e.name.slice(0, 28)}`, { label: 'Undo', run: async () => { await store.saveEntry(e); changed(); } });
      };
      row.onclick = (ev) => { if (!ev.target.closest('[data-del]')) open(); };
      row.onkeydown = (ev) => { if (ev.key === 'Enter') open(); };
      $(row, '[data-del]').onclick = remove;
      items.appendChild(swipeToDelete(row, { label: 'Remove', onDelete: remove }));
    }

    // Same as yesterday (only while this meal is empty)
    same.innerHTML = '';
    if (!list.length) {
      const card = await sameAsYesterday({ date: state.date, meal: meal.key });
      if (card) same.appendChild(card);
    }

    // Nutrition vs this meal's share of the daily goals
    const share = (g) => (g ? Math.round(g * hiF) : null);
    const val = (k, unit) => {
      const v = t[k];
      if (!list.length) return `<span class="muted">—</span>`;
      if (v.missing === list.length) return '<span class="pill na">No data</span>';
      return `${fmt(v.value)}${unit === 'kcal' ? '' : ' '}${unit === 'kcal' ? '' : unit}${v.missing ? '<sup class="muted" title="Some foods have no data for this">*</sup>' : ''}`;
    };
    const row = (label, k, unit, target, sub = false) => {
      const over = target && list.length && t[k].value > target;
      return `<div class="kv ${sub ? 'kv-sub' : ''}"><span>${label}</span><b class="num${over ? ' c-red' : ''}">${val(k, unit)}${target ? ` <span class="muted" style="font-weight:500">/ ${target.toLocaleString('en-GB')}${unit === 'kcal' ? ' kcal' : ' ' + unit}</span>` : ''}</b></div>`;
    };
    const anyMissing = list.length && Object.values(t).some((v) => v.missing && v.missing < list.length);
    $(info, '[data-info]').innerHTML = `
      ${row('Calories', 'kcal', 'kcal', hi)}
      ${row('Protein', 'protein', 'g', share(settings.protein))}
      <div class="info-group">
        ${row('Carbs', 'carbs', 'g', share(settings.carbs))}
        ${row('of which sugars', 'sugars', 'g', share(settings.sugars ?? 90), true)}
        ${row('Fibre', 'fibre', 'g', null, true)}
      </div>
      <div class="info-group">
        ${row('Fat', 'fat', 'g', share(settings.fat))}
        ${row('of which saturates', 'satfat', 'g', share(settings.satfat ?? 20), true)}
      </div>
      <div class="info-group">
        <div class="kv"><span><b>Other</b></span><span></span></div>
        ${row('Sodium', 'sodium', 'mg', null, true)}
        ${row('Potassium', 'potassium', 'mg', null, true)}
      </div>
      <details class="info-more">
        <summary>All vitamins &amp; minerals</summary>
        ${MICRO_GROUPS.map((g) => `<div class="sub-h">${g.label}</div>${g.items.map((m) => row(m.label, m.key, m.unit, null, true)).join('')}`).join('')}
      </details>
      <p class="note">Targets are this meal's share (${Math.round(hiF * 100)}%) of your daily goals.${anyMissing ? ' * Some foods have no data for this nutrient, so the real total may be higher.' : ''}</p>`;
  }
  return { refresh };
}
