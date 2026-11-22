// Planner & Pantry screens: weekly planner, recipes, pantry and shopping list, plus the
// "Today's plan" card on Today. Logging a planned recipe can take its ingredients out of
// the pantry (after asking).
import { el, esc, $, $$, icons, openSheet, toast, todayKey, parseKey, swipeToDelete, confirmSheet } from './ui.js';
import * as store from './store.js';
import { fmt } from './nutrients.js';
import { changed, openRecipeEditor, openFoodPicker, recipeNutrients } from './sheets.js';
import {
  LOCATIONS, UNITS, SLOTS, RECIPE_TAGS, addDays, mondayOf, weekDates, qtyText, stepFor, pantryStatus,
  deductions, applyDeductions, plannedSlots, prepFor, showPrepOnToday, shoppingList, groupLines, lineText, shoppingText, restock,
} from './planner.js';

const LOC_LABEL = Object.fromEntries([...LOCATIONS, { key: 'other', label: 'Other' }].map((l) => [l.key, l.label]));
const TAG_LABEL = Object.fromEntries(RECIPE_TAGS.map((t) => [t.key, t.label]));
const dayName = (k, long = false) => parseKey(k).toLocaleDateString('en-GB', long ? { weekday: 'long', day: 'numeric', month: 'short' } : { weekday: 'short', day: 'numeric' });

// ---------------------------------------------------------------- pantry item editor
export function openPantryItem(item = null, { onSaved } = {}) {
  const p = item ? structuredClone(item) : { name: '', brand: '', location: 'cupboard', qty: 0, unit: 'g', packSize: null, low: null, expiry: null, dailyDose: null, perItem: null, food: null };
  const body = el(`
    <form autocomplete="off">
      <label class="field"><span>Name</span><input class="input" data-f="name" value="${esc(p.name)}" placeholder="e.g. Oats, Chicken breast, Vitamin D"></label>
      <label class="field"><span>Brand <i class="unit">(optional)</i></span><input class="input" data-f="brand" value="${esc(p.brand || '')}"></label>
      <div class="seg" role="radiogroup" aria-label="Location" style="margin-top:10px">${LOCATIONS.map((l) => `<button type="button" role="radio" data-loc="${l.key}">${l.label}</button>`).join('')}</div>
      <div class="grid2">
        <label class="field"><span>Quantity</span><input class="input num" type="number" inputmode="decimal" step="any" min="0" data-f="qty" value="${p.qty ?? 0}"></label>
        <label class="field"><span>Unit</span><select class="input" data-f="unit">${UNITS.map((u) => `<option value="${u}">${u}</option>`).join('')}</select></label>
        <label class="field"><span>Pack size <i class="unit">(optional)</i></span><input class="input num" type="number" inputmode="decimal" step="any" min="0" data-f="packSize" value="${p.packSize ?? ''}" placeholder="e.g. 1000"></label>
        <label class="field"><span>Low stock at <i class="unit">(optional)</i></span><input class="input num" type="number" inputmode="decimal" step="any" min="0" data-f="low" value="${p.low ?? ''}" placeholder="e.g. 200"></label>
        <label class="field"><span>Expiry <i class="unit">(optional)</i></span><input class="input num" type="date" data-f="expiry" value="${p.expiry || ''}"></label>
        <label class="field" data-peritem-row><span>Weight of one <i class="unit">(g, optional)</i></span><input class="input num" type="number" inputmode="decimal" step="any" min="0" data-f="perItem" value="${p.perItem ?? ''}" placeholder="e.g. egg 50"></label>
      </div>
      <label class="field" data-dose-row><span>Daily dose <i class="unit">(capsules a day)</i></span><input class="input num" type="number" inputmode="decimal" step="any" min="0" data-f="dailyDose" value="${p.dailyDose ?? ''}" placeholder="e.g. 1"></label>
      <div class="list-h">Nutrition</div>
      <div class="row" style="gap:8px"><span class="muted small" data-food style="flex:1"></span><button class="btn sm" type="button" data-link>Link food</button></div>
      <p class="note" style="margin-top:4px">Link a food so recipes made from this item get its calories, macros and micronutrients.</p>
    </form>`);
  const foot = el(`<div class="btns">${item ? '<button class="btn danger" type="button" data-del>Delete</button>' : ''}<button class="btn go" type="button" data-save>${item ? 'Save' : 'Add to pantry'}</button></div>`);
  const sheet = openSheet({ title: item ? 'Edit pantry item' : 'New pantry item', body, foot, tall: true });
  const unitSel = $(body, '[data-f="unit"]');
  unitSel.value = p.unit;
  const paint = () => {
    $$(body, '[data-loc]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.loc === p.location)));
    $(body, '[data-dose-row]').hidden = p.location !== 'supplements' && unitSel.value !== 'capsules';
    $(body, '[data-peritem-row]').hidden = !['items', 'capsules'].includes(unitSel.value);
    $(body, '[data-food]').textContent = p.food ? `Linked: ${p.food.name}` : 'No food linked';
  };
  $$(body, '[data-loc]').forEach((b) => (b.onclick = () => { p.location = b.dataset.loc; if (p.location === 'supplements' && unitSel.value === 'g') unitSel.value = 'capsules'; paint(); }));
  unitSel.onchange = paint;
  $(body, '[data-link]').onclick = () => openFoodPicker((food) => { p.food = food.id ? { id: food.id, name: food.name, unit: food.unit || 'g' } : { ...food }; if (!$(body, '[data-f="name"]').value.trim()) $(body, '[data-f="name"]').value = food.name; paint(); });
  paint();
  const num = (k) => { const v = $(body, `[data-f="${k}"]`).value; return v === '' ? null : Number(v); };
  $(foot, '[data-save]').onclick = async () => {
    const name = $(body, '[data-f="name"]').value.trim();
    if (!name) return toast('Give the item a name');
    Object.assign(p, { name, brand: $(body, '[data-f="brand"]').value.trim(), unit: unitSel.value, qty: num('qty') || 0, packSize: num('packSize'), low: num('low'), expiry: $(body, '[data-f="expiry"]').value || null, dailyDose: num('dailyDose'), perItem: num('perItem') });
    if (!p.id) p.id = store.newId('pi');
    const list = await store.getPantry();
    const i = list.findIndex((x) => x.id === p.id);
    if (i >= 0) list[i] = p; else list.push(p);
    await store.savePantry(list);
    changed();
    sheet.close();
    toast(item ? 'Pantry item updated' : `Added ${name} to the pantry`);
    onSaved?.(p);
  };
  const del = $(foot, '[data-del]');
  if (del) del.onclick = async () => {
    if (!(await confirmSheet(`Delete “${p.name}” from the pantry?`))) return;
    await store.savePantry((await store.getPantry()).filter((x) => x.id !== p.id));
    changed();
    sheet.close();
  };
}

// ---------------------------------------------------------------- logging a planned slot
/** Log a planned recipe as eaten, then offer to take its ingredients out of the pantry. */
export async function logPlanned(date, slotKey) {
  const plan = await store.getPlan();
  const v = plan[date]?.[slotKey];
  if (!v?.recipeId) return;
  const recipe = (await store.getRecipes()).find((r) => r.id === v.recipeId);
  if (!recipe) return toast('That recipe no longer exists');
  const servings = v.servings || 1;
  const slot = SLOTS.find((s) => s.key === slotKey);
  const created = await store.logRecipe(recipe, { date, meal: slot.meal, amounts: recipe.items.map((it) => (Number(it.amount) || 0) * servings) });
  plan[date][slotKey] = { ...v, eaten: true, entryIds: created.map((e) => e.id) };
  await store.savePlan(plan);
  changed();
  toast(`Logged ${recipe.name} to ${slot.meal === 'snacks' ? 'Snacks' : slot.label}`);
  const pantry = await store.getPantry();
  const take = deductions(recipe, servings, pantry);
  if (!take.length) return;
  const ok = await confirmSheet(`Take these out of the pantry?\n${take.map((d) => `• ${d.name}: ${qtyText(d.qty, d.unit)}`).join('\n')}`, 'Deduct from pantry');
  if (!ok) return;
  await store.savePantry(applyDeductions(await store.getPantry(), take));
  changed();
  toast('Pantry updated');
}

// ---------------------------------------------------------------- slot sheet
function openSlot(date, slotKey, { recipes, onDone }) {
  const slot = SLOTS.find((s) => s.key === slotKey);
  const body = el('<div></div>');
  const sheet = openSheet({ title: `${slot.label} · ${dayName(date)}`, body, tall: true });
  (async () => {
    const plan = await store.getPlan();
    const cur = plan[date]?.[slotKey] || null;
    const save = async (v) => {
      const p = await store.getPlan();
      p[date] = { ...(p[date] || {}) };
      if (v) p[date][slotKey] = v; else delete p[date][slotKey];
      if (!Object.keys(p[date]).length) delete p[date];
      await store.savePlan(p);
      changed();
      onDone?.();
    };
    if (cur?.recipeId) {
      const r = recipes.find((x) => x.id === cur.recipeId);
      const top = el(`
        <div class="slot-cur">
          <div class="item-name">${esc(r?.name || 'Deleted recipe')}</div>
          <div class="row" style="gap:8px;margin-top:8px"><span class="muted small">Servings</span>
            <button class="iconbtn" type="button" data-sv="-1" aria-label="Fewer servings">−</button><b class="num" data-serv>${cur.servings || 1}</b><button class="iconbtn" type="button" data-sv="1" aria-label="More servings">+</button></div>
          <div class="btns" style="margin-top:10px;flex-wrap:wrap">
            ${cur.eaten ? '<span class="pill ok">Eaten</span>' : '<button class="btn sm go" type="button" data-eat>Log as eaten</button>'}
            <button class="btn sm" type="button" data-move>Move to…</button>
            <button class="btn sm danger" type="button" data-clear>Remove</button>
          </div>
        </div>`);
      $$(top, '[data-sv]').forEach((b) => (b.onclick = async () => { const n = Math.max(0.5, (cur.servings || 1) + Number(b.dataset.sv) * 0.5); cur.servings = n; $(top, '[data-serv]').textContent = n; await save(cur); }));
      const eat = $(top, '[data-eat]');
      if (eat) eat.onclick = async () => { sheet.close(); await logPlanned(date, slotKey); onDone?.(); };
      $(top, '[data-clear]').onclick = async () => { await save(null); sheet.close(); };
      $(top, '[data-move]').onclick = () => {
        const days = weekDates(mondayOf(date));
        top.innerHTML = `<div class="list-h" style="margin-top:0">Move to</div><div class="move-grid">${days.map((d) => SLOTS.map((s) => `<button type="button" class="chip" data-to="${d}|${s.key}">${dayName(d)} · ${s.label}</button>`).join('')).join('')}</div>`;
        $$(top, '[data-to]').forEach((b) => (b.onclick = async () => {
          const [d, k] = b.dataset.to.split('|');
          const p = await store.getPlan();
          const other = p[d]?.[k] || null;
          p[d] = { ...(p[d] || {}), [k]: cur };
          if (other) p[date][slotKey] = other; else delete p[date][slotKey];
          for (const x of [date, d]) if (p[x] && !Object.keys(p[x]).length) delete p[x];
          await store.savePlan(p);
          changed();
          sheet.close();
          onDone?.();
          toast(`Moved to ${dayName(d)} · ${SLOTS.find((s) => s.key === k).label}`);
        }));
      };
      body.appendChild(top);
    }
    body.appendChild(el(`<div class="list-h">${cur?.recipeId ? 'Change to' : 'Pick a recipe'}</div>`));
    const sorted = [...recipes].sort((a, b) => ((b.tags || []).includes(slotKey) - (a.tags || []).includes(slotKey)) || a.name.localeCompare(b.name));
    if (!sorted.length) body.appendChild(el('<p class="empty">No recipes yet. Create one in the Recipes tab.</p>'));
    for (const r of sorted) {
      const row = el(`<button class="result" type="button" data-pick="${r.id}"><div class="item-main"><div class="item-name">${esc(r.name)}</div><div class="macros-line">${(r.tags || []).map((t) => TAG_LABEL[t]).filter(Boolean).join(' · ') || 'No tags'} · ${r.items.length} ingredients</div></div></button>`);
      row.onclick = async () => { await save({ recipeId: r.id, servings: cur?.recipeId ? cur.servings || 1 : 1 }); sheet.close(); };
      body.appendChild(row);
    }
  })();
}

// ---------------------------------------------------------------- shopping text sheet
function openShoppingText(text) {
  const body = el(`<div><textarea class="input shop-text" rows="14" readonly data-text>${esc(text)}</textarea></div>`);
  const foot = el('<div class="btns"><button class="btn" type="button" data-share>Share</button><button class="btn go" type="button" data-copy>Copy</button></div>');
  const s = openSheet({ title: 'Shopping list as text', body, foot, tall: true });
  const ta = $(body, '[data-text]');
  $(foot, '[data-copy]').onclick = async () => {
    try { await navigator.clipboard.writeText(text); toast('Copied. Paste it into Notes or Reminders'); } catch { ta.select(); document.execCommand?.('copy'); toast('Copied'); }
  };
  $(foot, '[data-share]').onclick = async () => {
    if (navigator.share) { try { await navigator.share({ text }); return; } catch (e) { if (e.name === 'AbortError') return; } }
    ta.select();
    toast('Select all and copy');
  };
  return s;
}

// ---------------------------------------------------------------- page
export function mountPlan(view, state) {
  view.innerHTML = '';
  let tab = state.planTab || 'planner';
  let monday = mondayOf(todayKey());
  let tagFilter = '';
  const top = el(`
    <div class="meal-top">
      <a class="iconbtn" href="#/foods" data-back aria-label="Back">${icons.back}</a>
      <div style="min-width:0;flex:1"><h1 class="title">Planner &amp; Pantry</h1></div>
    </div>`);
  $(top, '[data-back]').onclick = (e) => { if (window.__prevRoute && window.__prevRoute !== 'plan') { e.preventDefault(); history.back(); } };
  const seg = el(`<div class="seg" role="tablist">${[['planner', 'Planner'], ['recipes', 'Recipes'], ['pantry', 'Pantry'], ['shopping', 'Shopping']].map(([k, l]) => `<button role="tab" type="button" data-ptab="${k}">${l}</button>`).join('')}</div>`);
  const box = el('<div data-pbox></div>');
  view.append(top, seg, box);
  $$(seg, '[data-ptab]').forEach((b) => (b.onclick = () => { tab = state.planTab = b.dataset.ptab; refresh(); }));

  let chain = Promise.resolve();
  function refresh() { chain = chain.then(render).catch((e) => console.error(e)); return chain; }

  async function render() {
    $$(seg, '[data-ptab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.ptab === tab)));
    const [recipes, pantry, plan, settingsFor] = await Promise.all([store.getRecipes(), store.getPantry(), store.getPlan(), store.goalsByDate()]);
    box.innerHTML = '';
    if (tab === 'planner') return renderPlanner(recipes, pantry, plan, settingsFor);
    if (tab === 'recipes') return renderRecipes(recipes);
    if (tab === 'pantry') return renderPantry(pantry);
    return renderShopping(recipes, pantry, plan);
  }

  async function renderPlanner(recipes, pantry, plan, goalsOn) {
    const days = weekDates(monday);
    const byId = new Map(recipes.map((r) => [r.id, r]));
    const nutCache = new Map();
    const nut = async (id) => { if (!nutCache.has(id)) nutCache.set(id, byId.has(id) ? await recipeNutrients(byId.get(id)) : null); return nutCache.get(id); };
    const head = el(`
      <div class="row plan-week" style="margin:4px 0 10px">
        <button class="iconbtn" type="button" data-wprev aria-label="Previous week">${icons.back}</button>
        <div style="flex:1;text-align:center"><b data-wlabel></b></div>
        <button class="iconbtn" type="button" data-wnext aria-label="Next week">${icons.next}</button>
      </div>`);
    const thisMon = mondayOf(todayKey());
    $(head, '[data-wlabel]').textContent = monday === thisMon ? 'This week' : monday === addDays(thisMon, 7) ? 'Next week' : `Week of ${dayName(monday, true)}`;
    $(head, '[data-wprev]').onclick = () => { monday = addDays(monday, -7); refresh(); };
    $(head, '[data-wnext]').onclick = () => { monday = addDays(monday, 7); refresh(); };
    box.appendChild(head);

    // Prep tomorrow
    const tomorrow = addDays(todayKey(), 1);
    const prep = prepFor(tomorrow, plan, recipes, pantry);
    if (prep.length) {
      box.appendChild(el(`<section class="tr-card prep-card" aria-label="Prep for tomorrow"><div class="tr-card-h">Prep tonight for tomorrow</div>${prep.map((p) => `<div class="prep-line"><span class="prep-dot${p.auto ? ' auto' : ''}"></span><span><b>${esc(p.text)}</b><small>${esc(p.recipe)} · ${esc(SLOTS.find((s) => s.key === p.slot).label)}</small></span></div>`).join('')}<p class="note" style="margin-bottom:0">Also shown on Today from 5pm.</p></section>`));
    }
    if (!recipes.length) box.appendChild(el('<p class="note">Create recipes in the Recipes tab (your saved meals are already there), then tap a slot to plan it.</p>'));

    for (const d of days) {
      const g = goalsOn(d);
      const card = el(`
        <section class="tr-card plan-day${d === todayKey() ? ' today' : ''}" aria-label="${esc(dayName(d, true))}">
          <div class="plan-day-h"><b>${esc(dayName(d, true))}</b>${d === todayKey() ? '<span class="pill ok">Today</span>' : ''}</div>
          <div class="plan-slots"></div>
          <div class="plan-tot num" data-tot></div>
        </section>`);
      const slotsBox = $(card, '.plan-slots');
      const tot = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
      let any = false;
      for (const s of SLOTS) {
        const v = plan[d]?.[s.key];
        const r = v?.recipeId && byId.get(v.recipeId);
        if (s.optional && !r) {
          const add = el(`<button type="button" class="plan-slot empty opt" data-slot="${d}|${s.key}">${icons.plus} Pre-training snack</button>`);
          slotsBox.appendChild(add);
          continue;
        }
        if (r) {
          any = true;
          const n = await nut(r.id);
          const sv = v.servings || 1;
          if (n) for (const k of Object.keys(tot)) tot[k] += n[k].value * sv;
        }
        const el2 = el(`<button type="button" class="plan-slot${r ? '' : ' empty'}${v?.eaten ? ' eaten' : ''}" data-slot="${d}|${s.key}" ${r ? 'draggable="true"' : ''}>
          <span class="plan-slot-l">${s.label}</span>
          <span class="plan-slot-v">${r ? `${esc(r.name)}${(v.servings || 1) !== 1 ? ` <small>× ${v.servings}</small>` : ''}${v.eaten ? ' <span class="pill ok">Eaten</span>' : ''}` : '<i>Tap to plan</i>'}</span>
        </button>`);
        slotsBox.appendChild(el2);
      }
      if (any) {
        const bar = (k, label, goal, unit) => {
          const v = tot[k];
          const over = goal && v > goal * (k === 'kcal' ? 1.1 : 1.15);
          return `<span class="${over ? 'c-red' : ''}">${label} <b>${fmt(v, k === 'kcal' ? 'kcal' : '')}</b>${goal ? `/${fmt(goal, k === 'kcal' ? 'kcal' : '')}` : ''}${unit}</span>`;
        };
        $(card, '[data-tot]').innerHTML = [bar('kcal', '', g.kcal, ' kcal'), bar('protein', 'P', g.protein, 'g'), bar('carbs', 'C', g.carbs, 'g'), bar('fat', 'F', g.fat, 'g')].join(' · ');
      } else $(card, '[data-tot]').innerHTML = '<span class="muted">Nothing planned</span>';
      box.appendChild(card);
    }
    // Tap to pick; drag (with a mouse) to move or swap.
    $$(box, '[data-slot]').forEach((b) => {
      const [d, k] = b.dataset.slot.split('|');
      b.onclick = () => openSlot(d, k, { recipes, onDone: refresh });
      b.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', b.dataset.slot); b.classList.add('dragging'); });
      b.addEventListener('dragend', () => b.classList.remove('dragging'));
      b.addEventListener('dragover', (e) => { e.preventDefault(); b.classList.add('drop'); });
      b.addEventListener('dragleave', () => b.classList.remove('drop'));
      b.addEventListener('drop', async (e) => {
        e.preventDefault();
        b.classList.remove('drop');
        const from = e.dataTransfer.getData('text/plain');
        if (!from || from === b.dataset.slot) return;
        const [fd, fk] = from.split('|');
        const p = await store.getPlan();
        const a = p[fd]?.[fk];
        if (!a) return;
        const other = p[d]?.[k] || null;
        p[d] = { ...(p[d] || {}), [k]: a };
        if (other) p[fd][fk] = other; else delete p[fd][fk];
        for (const x of [fd, d]) if (p[x] && !Object.keys(p[x]).length) delete p[x];
        await store.savePlan(p);
        changed();
        refresh();
      });
    });
  }

  async function renderRecipes(recipes) {
    const tools = el(`<div><button class="btn sm block" type="button" data-new-recipe>${icons.plus} New recipe</button>
      <div class="chips" style="margin:10px 0 6px"><button class="chip" type="button" data-rtag="">All</button>${RECIPE_TAGS.map((t) => `<button class="chip" type="button" data-rtag="${t.key}">${t.label}</button>`).join('')}</div></div>`);
    $(tools, '[data-new-recipe]').onclick = () => openRecipeEditor(null, { onSaved: refresh });
    $$(tools, '[data-rtag]').forEach((b) => { b.setAttribute('aria-pressed', String(b.dataset.rtag === tagFilter)); b.onclick = () => { tagFilter = b.dataset.rtag; refresh(); }; });
    box.appendChild(tools);
    const card = el('<section class="card" style="padding:4px 14px"></section>');
    const shown = recipes.filter((r) => !tagFilter || (r.tags || []).includes(tagFilter)).sort((a, b) => a.name.localeCompare(b.name));
    if (!shown.length) card.innerHTML = '<p class="empty">No recipes here yet. Your saved meals appear here too.</p>';
    for (const r of shown) {
      const n = await recipeNutrients(r);
      const row = el(`<button class="result" type="button" data-recipe="${r.id}"><div class="item-main"><div class="item-name">${esc(r.name)}</div>
        <div class="macros-line"><b>${fmt(n.kcal.value, 'kcal')}</b> kcal · P ${fmt(n.protein.value)} · C ${fmt(n.carbs.value)} · F ${fmt(n.fat.value)} · ${r.items.length} ingredients</div>
        <div class="macros-line">${(r.tags || []).map((t) => `<span class="tag">${esc(TAG_LABEL[t] || t)}</span>`).join(' ')}${r.prep ? ` <span class="muted">· Prep: ${esc(r.prep)}</span>` : ''}</div></div></button>`);
      row.onclick = () => openRecipeEditor(r, { onSaved: refresh });
      card.appendChild(row);
    }
    box.appendChild(card);
  }

  function renderPantry(pantry) {
    const today = todayKey();
    const add = el(`<button class="btn sm block" type="button" data-new-pantry>${icons.plus} Add pantry item</button>`);
    add.onclick = () => openPantryItem(null, { onSaved: refresh });
    box.appendChild(add);
    if (!pantry.length) { box.appendChild(el('<p class="empty">Track what you have at home: food in the fridge, freezer and cupboard, and your supplements.</p>')); return; }
    for (const loc of LOCATIONS) {
      const items = pantry.filter((p) => p.location === loc.key).sort((a, b) => a.name.localeCompare(b.name));
      if (!items.length) continue;
      box.appendChild(el(`<div class="sub-h page">${loc.label}</div>`));
      const card = el('<section class="card" style="padding:4px 14px"></section>');
      for (const p of items) {
        const st = pantryStatus(p, today);
        const badges = [
          st.low ? '<span class="pill low">Low stock</span>' : '',
          st.expired ? '<span class="pill low">Expired</span>' : st.expiresIn !== null ? `<span class="pill mid">${st.expiresIn === 0 ? 'Expires today' : `Expires in ${st.expiresIn} ${st.expiresIn === 1 ? 'day' : 'days'}`}</span>` : '',
          st.reorderIn !== null ? `<span class="pill ${st.reorderIn <= 0 ? 'low' : st.reorderIn <= 7 ? 'mid' : 'ok'}">${st.reorderIn <= 0 ? 'Reorder now' : `Reorder in ${st.reorderIn} ${st.reorderIn === 1 ? 'day' : 'days'}`}</span>` : '',
        ].filter(Boolean).join(' ');
        const row = el(`
          <div class="pantry-row" data-pantry-id="${p.id}">
            <button type="button" class="pantry-main" data-edit><span class="item-name">${esc(p.name)}${p.brand ? ` <span class="muted small">${esc(p.brand)}</span>` : ''}</span>
              <span class="pantry-sub"><b class="num" data-q>${esc(qtyText(p.qty, p.unit))}</b>${st.daysLeft !== null ? ` <span class="muted">· ${st.daysLeft} days left</span>` : ''} ${badges}</span></button>
            <button class="iconbtn" type="button" data-minus aria-label="Less ${esc(p.name)}">−</button>
            <button class="iconbtn" type="button" data-plus aria-label="More ${esc(p.name)}">+</button>
          </div>`);
        const adjust = async (dir) => {
          const list = await store.getPantry();
          const it = list.find((x) => x.id === p.id);
          if (!it) return;
          it.qty = Math.max(0, Math.round(((Number(it.qty) || 0) + dir * stepFor(it.unit)) * 10) / 10);
          await store.savePantry(list);
          changed();
          refresh();
        };
        $(row, '[data-minus]').onclick = () => adjust(-1);
        $(row, '[data-plus]').onclick = () => adjust(1);
        $(row, '[data-edit]').onclick = () => openPantryItem(p, { onSaved: refresh });
        card.appendChild(swipeToDelete(row, {
          onDelete: async () => {
            const list = await store.getPantry();
            await store.savePantry(list.filter((x) => x.id !== p.id));
            changed();
            toast(`Removed ${p.name}`, { label: 'Undo', run: async () => { await store.savePantry([...(await store.getPantry()), p]); changed(); } });
          },
        }));
      }
      box.appendChild(card);
    }
    box.appendChild(el('<p class="hint">Tap an item to edit it, swipe left to delete.</p>'));
  }

  async function renderShopping(recipes, pantry, plan) {
    const shop = await store.getShopping();
    const from = monday > todayKey() ? monday : todayKey();
    const to = addDays(monday, 6);
    const lines = from <= to ? shoppingList({ plan, recipes, pantry, from, to, manual: shop.manual, ticked: shop.ticked }) : shoppingList({ plan: {}, recipes, pantry, from, to, manual: shop.manual, ticked: shop.ticked });
    const thisMon = mondayOf(todayKey());
    const wk = monday === thisMon ? 'this week' : `week of ${dayName(monday, true)}`;
    box.appendChild(el(`<p class="note" style="margin-top:0">For what's planned ${esc(wk)} (from ${esc(dayName(from))}) minus what's in the pantry, plus anything low on stock. Change the week in Planner.</p>`));
    const manualForm = el(`<form class="row shop-add" style="gap:8px;margin-bottom:10px"><input class="input" data-mname placeholder="Add an item, e.g. whiteboard" autocomplete="off"><button class="btn sm go" type="submit">Add</button></form>`);
    manualForm.onsubmit = async (e) => {
      e.preventDefault();
      const name = $(manualForm, '[data-mname]').value.trim();
      if (!name) return;
      const s = await store.getShopping();
      s.manual = [...s.manual, { id: store.newId('m'), name, location: 'other' }];
      await store.saveShopping(s);
      changed();
      refresh();
    };
    box.appendChild(manualForm);
    if (!lines.length) box.appendChild(el('<p class="empty">Nothing to buy: the plan is covered by the pantry and nothing is low.</p>'));
    for (const g of groupLines(lines)) {
      box.appendChild(el(`<div class="sub-h page">${esc(g.label)}</div>`));
      const card = el('<section class="card" style="padding:4px 14px"></section>');
      for (const l of g.lines) {
        const need = l.packs ? ` · need ${qtyText(l.qty, l.unit)} more` : '';
        const why = l.reason === 'low' ? `Low stock · have ${qtyText(l.have, l.unit)}` : l.reason === 'plan' ? (l.have !== null && l.have !== undefined ? `For the plan${need} · have ${qtyText(l.have, l.unit)}` : 'For the plan · not in the pantry') : 'Added by you';
        const row = el(`<label class="shop-line${l.done ? ' done' : ''}" data-line="${esc(l.key)}"><input type="checkbox" ${l.done ? 'checked' : ''} aria-label="Bought ${esc(l.name)}"><span><b>${esc(lineText(l))}</b><small>${esc(why)}</small></span>${l.manual ? `<button class="iconbtn" type="button" data-mrm aria-label="Remove ${esc(l.name)}">${icons.close}</button>` : ''}</label>`);
        $(row, 'input').onchange = async (e) => {
          const s = await store.getShopping();
          s.ticked = { ...s.ticked, [l.key]: e.target.checked };
          if (!e.target.checked) delete s.ticked[l.key];
          await store.saveShopping(s);
          row.classList.toggle('done', e.target.checked);
          l.done = e.target.checked;
          paintActions();
        };
        const rm = $(row, '[data-mrm]');
        if (rm) rm.onclick = async (e) => {
          e.preventDefault();
          const s = await store.getShopping();
          s.manual = s.manual.filter((m) => m.id !== l.manualId);
          delete s.ticked[l.key];
          await store.saveShopping(s);
          refresh();
        };
        card.appendChild(row);
      }
      box.appendChild(card);
    }
    const actions = el(`<div class="btns" style="margin-top:12px;flex-wrap:wrap"><button class="btn go" type="button" data-bought>Add bought items to pantry</button><button class="btn" type="button" data-text>Export as text</button></div>`);
    const paintActions = () => {
      const n = lines.filter((l) => l.done).length;
      $(actions, '[data-bought]').disabled = !n;
      $(actions, '[data-bought]').textContent = n ? `Add ${n} bought ${n === 1 ? 'item' : 'items'} to pantry` : 'Add bought items to pantry';
    };
    paintActions();
    $(actions, '[data-bought]').onclick = async () => {
      const done = lines.filter((l) => l.done);
      if (!done.length) return;
      const before = await store.getPantry();
      await store.savePantry(restock(before, done, () => store.newId('pi')));
      const s = await store.getShopping();
      s.manual = s.manual.filter((m) => !done.some((l) => l.manualId === m.id));
      s.ticked = {};
      await store.saveShopping(s);
      changed();
      toast(`Pantry updated with ${done.filter((l) => !l.manual).length} ${done.filter((l) => !l.manual).length === 1 ? 'item' : 'items'}`);
      refresh();
    };
    $(actions, '[data-text]').onclick = () => openShoppingText(shoppingText(lines, `Shopping list (${dayName(from)} – ${dayName(to)})`));
    box.appendChild(actions);
  }

  return { refresh };
}

// ---------------------------------------------------------------- Today card
/** Today's planned meals (with Log as eaten), and in the evening, prep for tomorrow. */
export function planTodayCard(getDate, now = () => new Date()) {
  const card = el('<section class="tr-card plan-today" aria-label="Today\'s plan" hidden></section>');
  async function refresh() {
    const date = getDate();
    const [plan, recipes, pantry] = await Promise.all([store.getPlan(), store.getRecipes(), store.getPantry()]);
    const byId = new Map(recipes.map((r) => [r.id, r]));
    const slots = plannedSlots(plan, date, date).filter((s) => byId.has(s.recipeId));
    const isToday = date === todayKey();
    const prep = isToday && showPrepOnToday(now().getHours()) ? prepFor(addDays(date, 1), plan, recipes, pantry) : [];
    card.hidden = !slots.length && !prep.length;
    if (card.hidden) return;
    card.innerHTML = `
      <div class="row"><div class="tr-card-h" style="margin:0;flex:1">${isToday ? "Today's plan" : `Plan for ${esc(dayName(date))}`}</div><a class="btn link sm" href="#/plan" data-open-plan>Planner ${icons.next}</a></div>
      ${slots.map((s) => `<div class="plan-today-row" data-ps="${s.slot}"><span class="plan-slot-l">${esc(SLOTS.find((x) => x.key === s.slot).label)}</span><span class="plan-today-n">${esc(byId.get(s.recipeId).name)}${s.servings !== 1 ? ` × ${s.servings}` : ''}</span>${s.eaten ? '<span class="pill ok">Eaten</span>' : `<button class="btn sm go" type="button" data-eat="${s.slot}">Log as eaten</button>`}</div>`).join('')}
      ${prep.length ? `<div class="prep-today"><div class="list-h" style="margin-top:10px">Prep tonight for tomorrow</div>${prep.map((p) => `<div class="prep-line"><span class="prep-dot${p.auto ? ' auto' : ''}"></span><span><b>${esc(p.text)}</b><small>${esc(p.recipe)}</small></span></div>`).join('')}</div>` : ''}`;
    $$(card, '[data-eat]').forEach((b) => (b.onclick = async () => { b.disabled = true; await logPlanned(date, b.dataset.eat); }));
  }
  return { el: card, refresh };
}
