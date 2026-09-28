// Bottom-sheet flows: add food, food detail / log / edit entry, link to CoFID,
// custom food form, saved meals (recipes), barcode scanning.
import { el, esc, $, $$, icons, openSheet, toast, confirmSheet, round1, swipeToDelete } from './ui.js';
import { MEALS, MICROS, scale, fmt, normNutrients, macroKcal, MICRO_KEYS } from './nutrients.js';
import * as fooddb from './fooddb.js';
import * as store from './store.js';

export const changed = () => window.dispatchEvent(new Event('data-changed'));

/** Delete a saved food (logged entries keep their own copy), with Undo. */
export async function removeFood(food) {
  const copy = { ...food };
  await store.deleteFood(food.id);
  changed();
  toast(`Deleted ${food.name.slice(0, 26)}`, { label: 'Undo', run: async () => { await store.saveFood(copy); changed(); } });
}

/** Delete a saved meal, with Undo. */
export async function removeRecipe(recipe) {
  const copy = JSON.parse(JSON.stringify(recipe));
  await store.deleteRecipe(recipe.id);
  changed();
  toast(`Deleted ${recipe.name.slice(0, 26)}`, { label: 'Undo', run: async () => { await store.saveRecipe(copy); changed(); } });
}
const mealLabel = (k) => MEALS.find((m) => m.key === k)?.label || k;

function sourceTag(food) {
  if (food.source === 'generic') return fooddb.info().full ? 'CoFID' : 'Generic';
  if (food.source === 'off') return 'Branded';
  if (food.source === 'preset') return 'Label';
  return 'Custom';
}

function macrosLine(per100, amount = 100, unit = 'g') {
  const n = scale(per100, amount);
  const v = (x) => (x === null ? '—' : fmt(x));
  return `<b>${v(n.kcal)}</b> kcal · P ${v(n.protein)} · C ${v(n.carbs)} · F ${v(n.fat)} <span class="muted">per ${fmt(amount)}${unit}</span>`;
}

function foodRow(food, { quick = false } = {}) {
  const { per100 } = store.resolve(food);
  const d = store.defaultAmount(food);
  const amountLabel = d.servingLabel ? `${d.qty && d.qty !== 1 ? d.qty + ' × ' : ''}${d.servingLabel}` : null;
  const row = el(`
    <div class="result" role="button" tabindex="0">
      <div class="item-main">
        <div class="item-name">${esc(food.name)}${food.brand && !food.name.includes(food.brand) ? ` <span class="muted small">${esc(food.brand)}</span>` : ''}<span class="tag">${sourceTag(food)}</span></div>
        <div class="macros-line">${macrosLine(per100, quick ? d.amount : 100, food.unit || 'g')}${quick && amountLabel ? ` <span class="muted">(${esc(amountLabel)})</span>` : ''}</div>
      </div>
      ${quick ? `<button class="iconbtn accent" type="button" data-quick aria-label="Log ${esc(food.name)}">${icons.plus}</button>` : ''}
    </div>`);
  return row;
}

// ======================================================================
// Add food sheet
// ======================================================================
export function openAddFood({ date, meal }) {
  let tab = 'search';
  let q = '';
  let offCtrl = null;
  let offTimer = null;
  let stopScan = null;

  const body = el(`
    <div>
      <div class="search">${icons.search}<input class="input" type="search" placeholder="Search foods" enterkeyhint="search" autocomplete="off" aria-label="Search foods"></div>
      <div class="seg" role="tablist" style="margin-top:10px">
        <button role="tab" data-tab="search">Search</button>
        <button role="tab" data-tab="fav">Favourites</button>
        <button role="tab" data-tab="mine">My foods</button>
        <button role="tab" data-tab="meals">Meals</button>
        <button role="tab" data-tab="scan">Scan</button>
      </div>
      <div data-list></div>
    </div>`);
  const input = $(body, 'input');
  const list = $(body, '[data-list]');

  const sheet = openSheet({
    title: `Add to ${mealLabel(meal)}`,
    body,
    tall: true,
    onClose: () => { stopScan?.(); offCtrl?.abort(); },
  });

  const logged = (food, entry) => {
    changed();
    toast(`Added ${food.name.slice(0, 28)}`, {
      label: 'Undo',
      run: async () => { await store.deleteEntry(entry.id); changed(); },
    });
  };

  const quickLog = async (food, rowEl) => {
    const d = store.defaultAmount(food);
    const entry = await store.logFood(food, { date, meal, amount: d.amount, servingLabel: d.servingLabel, qty: d.qty });
    rowEl?.classList.remove('flash');
    void rowEl?.offsetWidth;
    rowEl?.classList.add('flash');
    logged(food, entry);
  };

  const openDetail = (food) => openFoodDetail(food, { date, meal, onLogged: (f, e) => logged(f, e) });

  const bindRow = (row, food) => {
    row.onclick = (e) => {
      if (e.target.closest('[data-quick]')) return;
      openDetail(food);
    };
    row.onkeydown = (e) => { if (e.key === 'Enter') openDetail(food); };
    const qb = $(row, '[data-quick]');
    if (qb) qb.onclick = () => quickLog(food, row);
  };

  const filterFoods = (foods) => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return foods.filter((f) => words.every((w) => `${f.name} ${f.brand || ''}`.toLowerCase().includes(w)));
  };

  // Renders are queued so two overlapping refreshes can't both append rows.
  let chain = Promise.resolve();
  function render() {
    chain = chain.then(renderNow).catch((e) => console.error(e));
    return chain;
  }

  async function renderNow() {
    stopScan?.();
    stopScan = null;
    $$(body, '[data-tab]').forEach((b) => b.setAttribute('aria-selected', b.dataset.tab === tab));
    input.parentElement.style.display = tab === 'scan' ? 'none' : '';
    list.innerHTML = '';
    if (tab === 'search') return renderSearch();
    if (tab === 'fav' || tab === 'mine') {
      const foods = (await store.getFoods())
        .filter((f) => (tab === 'fav' ? f.favourite : f.source !== 'generic'))
        .sort((a, b) => (b.lastUsed || 0) - (a.lastUsed || 0) || a.name.localeCompare(b.name));
      const shown = filterFoods(foods);
      if (tab === 'mine') {
        const nb = el(`<button class="btn sm block" type="button" style="margin:4px 0 8px">${icons.plus} New custom food</button>`);
        nb.onclick = () => openFoodForm(null, { onSaved: (f) => { render(); openDetail(f); } });
        list.appendChild(nb);
      }
      if (!shown.length) list.appendChild(el(`<p class="empty">${tab === 'fav' ? 'No favourites yet. Tap the star on any food to add it here.' : 'No foods yet.'}</p>`));
      for (const f of shown) {
        const row = foodRow(f, { quick: true });
        bindRow(row, f);
        list.appendChild(swipeToDelete(row, { onDelete: () => removeFood(f) }));
      }
      if (shown.length) list.appendChild(el('<p class="hint">Swipe left on a food to delete it.</p>'));
      return;
    }
    if (tab === 'meals') {
      const recipes = (await store.getRecipes()).sort((a, b) => a.name.localeCompare(b.name));
      const nb = el(`<button class="btn sm block" type="button" style="margin:4px 0 8px">${icons.plus} New saved meal</button>`);
      nb.onclick = () => openRecipeEditor(null, { onSaved: render });
      list.appendChild(nb);
      const words = q.toLowerCase().split(/\s+/).filter(Boolean);
      const shown = recipes.filter((r) => words.every((w) => r.name.toLowerCase().includes(w)));
      if (!shown.length) list.appendChild(el('<p class="empty">Save combinations you eat often, like your usual yoghurt bowl, and log them in one tap.</p>'));
      for (const r of shown) {
        const tot = await recipeTotals(r);
        const row = el(`
          <div class="result" role="button" tabindex="0">
            <div class="item-main"><div class="item-name">${esc(r.name)}</div>
              <div class="macros-line"><b>${fmt(tot.kcal)}</b> kcal · P ${fmt(tot.protein)} · C ${fmt(tot.carbs)} · F ${fmt(tot.fat)} <span class="muted">· ${r.items.length} items</span></div></div>
            <button class="iconbtn accent" type="button" data-quick aria-label="Log ${esc(r.name)}">${icons.plus}</button>
          </div>`);
        row.onclick = (e) => {
          if (e.target.closest('[data-quick]')) return;
          openRecipeLog(r, { date, meal, onLogged: () => { changed(); } , onEdited: render });
        };
        $(row, '[data-quick]').onclick = async () => {
          const created = await store.logRecipe(r, { date, meal });
          row.classList.remove('flash'); void row.offsetWidth; row.classList.add('flash');
          changed();
          toast(`Added ${r.name}`, { label: 'Undo', run: async () => { for (const e of created) await store.deleteEntry(e.id); changed(); } });
        };
        list.appendChild(swipeToDelete(row, { onDelete: () => removeRecipe(r) }));
      }
      return;
    }
    if (tab === 'scan') return renderScan();
  }

  async function renderSearch() {
    await fooddb.load();
    if (!q.trim()) {
      const recent = (await store.getFoods()).filter((f) => f.lastUsed).sort((a, b) => b.lastUsed - a.lastUsed).slice(0, 12);
      if (recent.length) {
        list.appendChild(el('<div class="list-h">Recent</div>'));
        for (const f of recent) { const r = foodRow(f, { quick: true }); bindRow(r, f); list.appendChild(r); }
      } else {
        list.appendChild(el('<p class="empty">Search generic foods (works offline) and UK branded products.</p>'));
      }
      const nb = el(`<button class="btn sm block" type="button" style="margin-top:14px">${icons.plus} Create custom food</button>`);
      nb.onclick = () => openFoodForm(null, { onSaved: (f) => openDetail(f) });
      list.appendChild(nb);
      return;
    }
    const info = fooddb.info();
    const generic = fooddb.search(q, 30);
    list.appendChild(el(`<div class="list-h">${info.full ? 'Generic foods · CoFID' : 'Generic foods · starter set'}</div>`));
    if (!generic.length) list.appendChild(el('<p class="empty">No generic matches.</p>'));
    for (const g of generic) {
      const food = { source: 'generic', genericId: g.id, name: g.name, unit: 'g', servings: [] };
      const row = foodRow(food);
      bindRow(row, food);
      list.appendChild(row);
    }
    const offBox = el('<div><div class="list-h">Branded · Open Food Facts</div><div data-off></div></div>');
    list.appendChild(offBox);
    const offList = $(offBox, '[data-off]');
    if (!navigator.onLine) {
      offList.innerHTML = '<p class="empty">You are offline. Branded search needs a connection.</p>';
    } else {
      offList.innerHTML = '<div class="spin" aria-label="Searching"></div>';
      clearTimeout(offTimer);
      const query = q;
      offTimer = setTimeout(async () => {
        offCtrl?.abort();
        offCtrl = new AbortController();
        try {
          const res = await fooddb.offSearch(query, offCtrl.signal);
          if (query !== q) return;
          offList.innerHTML = '';
          if (!res.length) offList.innerHTML = '<p class="empty">No branded matches.</p>';
          for (const f of res) { const r = foodRow(f); bindRow(r, f); offList.appendChild(r); }
        } catch (e) {
          if (e.name === 'AbortError') return;
          offList.innerHTML = `<p class="empty">Couldn't reach Open Food Facts (${esc(e.message)}).</p>`;
        }
      }, 450);
    }
    const nb = el(`<button class="btn sm block" type="button" style="margin-top:14px">${icons.plus} Create custom food</button>`);
    nb.onclick = () => openFoodForm({ name: q }, { onSaved: (f) => openDetail(f) });
    list.appendChild(nb);
  }

  function renderScan() {
    const box = el(`
      <div>
        <div class="scan-box"><video playsinline muted autoplay></video></div>
        <p class="note" data-status>Point the camera at a barcode.</p>
        <form class="row" data-manual style="gap:8px">
          <input class="input" inputmode="numeric" pattern="[0-9]*" placeholder="Or type the barcode" aria-label="Barcode number">
          <button class="btn sm" type="submit">Look up</button>
        </form>
      </div>`);
    list.appendChild(box);
    const status = $(box, '[data-status]');
    const lookupCode = async (code) => {
      status.textContent = `Looking up ${code}…`;
      try {
        const local = (await store.getFoods()).find((f) => f.barcode === code);
        const food = local || (await fooddb.offBarcode(code));
        if (!food) {
          status.innerHTML = `No product found for <b>${esc(code)}</b>. `;
          const b = el('<button class="btn sm" type="button">Create it as a custom food</button>');
          b.onclick = () => openFoodForm({ barcode: code }, { onSaved: (f) => openDetail(f) });
          status.appendChild(b);
          return;
        }
        status.textContent = `Found: ${food.name}`;
        openDetail(food);
      } catch (e) {
        status.textContent = navigator.onLine ? `Lookup failed: ${e.message}` : 'You are offline. Barcode lookup needs a connection.';
      }
    };
    $(box, '[data-manual]').onsubmit = (e) => {
      e.preventDefault();
      const v = $(box, '[data-manual] input').value.replace(/\D/g, '');
      if (v) lookupCode(v);
    };
    import('./scanner.js').then(({ startScan }) =>
      startScan($(box, 'video'), (code) => { stopScan = null; lookupCode(code); })
        .then((s) => { if (tab === 'scan' && !sheet.closed) stopScan = s; else s(); })
        .catch((e) => { status.textContent = `Camera unavailable (${e.message}). You can type the barcode instead.`; }));
  }

  $$(body, '[data-tab]').forEach((b) => (b.onclick = () => { tab = b.dataset.tab; render(); }));
  input.oninput = () => { q = input.value; if (tab === 'scan') tab = 'search'; render(); };
  window.addEventListener('data-changed', function onChange() {
    if (sheet.closed) return window.removeEventListener('data-changed', onChange);
    if (tab === 'fav' || tab === 'mine' || tab === 'meals' || (tab === 'search' && !q)) render();
  });
  render();
  return sheet;
}

// ======================================================================
// Food detail: log a food, or edit an existing entry
// ======================================================================
export function openFoodDetail(food, { date, meal, entry = null, onLogged } = {}) {
  food = { ...food };
  const unit = food.unit || 'g';
  let servings = food.servings || [];
  // Current selection
  let sel = 'unit'; // 'unit' or serving index
  let num = 100;
  let curMeal = entry ? entry.meal : meal;
  if (entry) {
    const si = servings.findIndex((s) => s.label === entry.servingLabel);
    if (si >= 0 && entry.qty) { sel = si; num = entry.qty; } else { num = round1(entry.amount); }
  } else {
    const d = store.defaultAmount(food);
    const si = servings.findIndex((s) => s.label === d.servingLabel);
    if (si >= 0) { sel = si; num = d.qty || 1; } else num = d.amount;
  }
  const amount = () => (sel === 'unit' ? Number(num) || 0 : (Number(num) || 0) * servings[sel].amount);
  const nutr = () => {
    if (entry && !food.id && food.source !== 'generic') return { per100: entry.per100, estimated: entry.estimated || [] };
    return store.resolve(food);
  };

  const body = el(`
    <div>
      <div class="row" style="align-items:flex-start">
        <div style="flex:1;min-width:0">
          <div class="muted small" data-sub></div>
        </div>
        <button class="iconbtn" type="button" data-fav aria-label="Favourite"></button>
      </div>
      <div class="amount-row" style="margin-top:12px">
        <input class="input big-input num" type="number" inputmode="decimal" step="any" min="0" aria-label="Amount">
        <select class="input" aria-label="Unit or serving" data-unit></select>
      </div>
      <button type="button" class="btn sm" data-add-serving style="margin-top:8px;background:transparent;color:var(--muted);padding:0 4px">${icons.plus} Add serving size</button>
      <div class="preview num" data-preview></div>
      <label class="field"><span>Meal</span><select class="input" data-meal>${MEALS.map((m) => `<option value="${m.key}">${m.label}</option>`).join('')}</select></label>
      <div class="list-h" style="display:flex;align-items:center;gap:8px">Micronutrients <span class="spacer"></span><span data-micro-count style="letter-spacing:0;text-transform:none;font-weight:600"></span></div>
      <div data-link></div>
      <div data-micros></div>
      <div data-actions style="margin-top:16px"></div>
    </div>`);
  const foot = el(`<div class="btns">${entry ? '<button class="btn danger" type="button" data-del>Delete</button>' : ''}<button class="btn go" type="button" data-save>${entry ? 'Save' : 'Log food'}</button></div>`);
  const sheet = openSheet({ title: food.name, body, foot });

  const amtInput = $(body, 'input');
  const unitSel = $(body, '[data-unit]');
  $(body, '[data-meal]').value = curMeal;
  $(body, '[data-meal]').onchange = (e) => (curMeal = e.target.value);

  function renderUnits() {
    unitSel.innerHTML = `<option value="unit">${unit}</option>` +
      servings.map((s, i) => `<option value="${i}">${esc(s.label)} (${fmt(s.amount)}${unit})</option>`).join('');
    unitSel.value = String(sel);
  }
  renderUnits();
  amtInput.value = num;
  amtInput.oninput = () => { num = amtInput.value; renderDynamic(); };
  amtInput.onfocus = () => amtInput.select();
  unitSel.onchange = () => {
    const prevAmount = amount();
    sel = unitSel.value === 'unit' ? 'unit' : Number(unitSel.value);
    num = sel === 'unit' ? round1(prevAmount || 100) : 1;
    amtInput.value = num;
    renderDynamic();
  };

  $(body, '[data-sub]').innerHTML = `${food.brand ? esc(food.brand) + ' · ' : ''}<span class="tag" style="margin:0">${sourceTag(food)}</span>${entry?.recipe ? ` · from ${esc(entry.recipe)}` : ''}`;

  const favBtn = $(body, '[data-fav]');
  const renderFav = () => { favBtn.innerHTML = food.favourite ? icons.starFill : icons.star; favBtn.setAttribute('aria-pressed', !!food.favourite); };
  renderFav();
  favBtn.onclick = async () => {
    food.favourite = !food.favourite;
    const saved = await store.persistFood(food);
    saved.favourite = food.favourite;
    await store.saveFood(saved);
    food = { ...saved };
    renderFav();
    toast(food.favourite ? 'Added to favourites' : 'Removed from favourites');
    changed();
  };

  $(body, '[data-add-serving]').onclick = () => {
    const f = el(`
      <div>
        <label class="field"><span>Label</span><input class="input" data-l placeholder="e.g. 1 scoop" required></label>
        <label class="field"><span>Amount <i class="unit">(${unit})</i></span><input class="input" data-a type="number" inputmode="decimal" step="any" min="0" placeholder="e.g. 25" required></label>
      </div>`);
    const s = openSheet({ title: 'Add serving size', body: f, foot: '<div class="btns"><button class="btn go" data-ok>Save serving</button></div>' });
    $(s.el, '[data-ok]').onclick = async () => {
      const label = $(f, '[data-l]').value.trim();
      const a = Number($(f, '[data-a]').value);
      if (!label || !(a > 0)) return toast('Enter a label and amount');
      const saved = await store.persistFood(food);
      saved.servings = [...(saved.servings || []), { label, amount: a }];
      await store.saveFood(saved);
      food = { ...saved };
      servings = saved.servings;
      sel = servings.length - 1;
      num = 1;
      amtInput.value = 1;
      renderUnits();
      renderDynamic();
      s.close();
      changed();
    };
  };

  function renderDynamic() {
    const { per100, estimated } = nutr();
    const a = amount();
    const n = scale(per100, a);
    $(body, '[data-preview]').innerHTML = [['kcal', 'Kcal'], ['protein', 'Protein'], ['carbs', 'Carbs'], ['fat', 'Fat']]
      .map(([k, l]) => `<div><div class="stat-v">${n[k] === null ? '—' : fmt(n[k], k === 'kcal' ? 'kcal' : '')}${k !== 'kcal' && n[k] !== null ? '<small class="muted" style="font-size:12px">g</small>' : ''}</div><div class="stat-l">${l}</div></div>`).join('');
    const missing = MICRO_KEYS.filter((k) => per100[k] === null).length;
    $(body, '[data-micro-count]').innerHTML = missing
      ? `<span class="pill na">${missing} no data</span>`
      : estimated.length ? `<span class="pill est">${estimated.length} estimated</span>` : '';
    $(body, '[data-micros]').innerHTML = MICROS.map((m) => {
      const v = n[m.key];
      const badge = v === null ? '<span class="pill na">No data</span>' : estimated.includes(m.key) ? '<span class="pill est">Est.</span>' : '';
      return `<div class="kv"><span>${m.label}</span><span class="row" style="gap:8px">${badge}<b class="num">${v === null ? '' : fmt(v) + ' ' + m.unit}</b></span></div>`;
    }).join('');
    renderLink();
  }

  function renderLink() {
    const box = $(body, '[data-link]');
    box.innerHTML = '';
    if (food.source === 'generic') return;
    const linked = food.link ? fooddb.lookup(food.link) : null;
    const { per100 } = store.resolve(food);
    const anyMissingOwn = MICRO_KEYS.some((k) => (food.per100 || normNutrients())[k] === null);
    if (!anyMissingOwn && !linked) return;
    if (linked) {
      box.appendChild(el(`<p class="note">Missing values estimated from <b style="color:var(--text)">${esc(linked.name)}</b>.</p>`));
    } else {
      box.appendChild(el('<p class="note">This food has missing micronutrient data. Link it to a similar generic food to estimate them.</p>'));
    }
    const row = el(`<div class="row" style="gap:8px;margin-bottom:6px"><button class="btn sm" type="button" data-pick>${linked ? 'Change link' : 'Link similar CoFID food'}</button>${linked ? '<button class="btn sm" type="button" data-unlink>Remove link</button>' : ''}</div>`);
    $(row, '[data-pick]').onclick = () =>
      openLinkPicker(food.name, async (g) => {
        const saved = await store.persistFood(food);
        saved.link = g.id;
        await store.saveFood(saved);
        food = { ...saved };
        const n = await store.relinkEntries(saved);
        if (entry) { entry.foodId = saved.id; }
        renderDynamic();
        changed();
        toast(n ? `Linked · updated ${n} logged ${n === 1 ? 'entry' : 'entries'}` : 'Linked');
      });
    const ub = $(row, '[data-unlink]');
    if (ub) ub.onclick = async () => {
      const saved = await store.persistFood(food);
      saved.link = null;
      await store.saveFood(saved);
      food = { ...saved };
      await store.relinkEntries(saved);
      renderDynamic();
      changed();
    };
    box.appendChild(row);
    void per100;
  }

  // Extra actions
  const actions = $(body, '[data-actions]');
  if (food.id && (food.source === 'custom' || food.source === 'preset' || food.source === 'off')) {
    const b = el('<button class="btn sm block" type="button">Edit food details</button>');
    b.onclick = () => openFoodForm(food, { onSaved: (f) => { food = { ...f }; servings = f.servings || []; if (sel !== 'unit' && sel >= servings.length) sel = 'unit'; renderUnits(); renderDynamic(); sheet.el.querySelector('h2').textContent = f.name; } });
    actions.appendChild(b);
  }

  renderDynamic();

  $(foot, '[data-save]').onclick = async () => {
    const a = amount();
    if (!(a > 0)) return toast('Enter an amount');
    const servingLabel = sel === 'unit' ? null : servings[sel].label;
    const qty = sel === 'unit' ? null : Number(num);
    if (entry) {
      const { per100, estimated } = nutr();
      Object.assign(entry, { amount: a, servingLabel, qty, meal: curMeal, per100, estimated, name: food.name });
      await store.saveEntry(entry);
      changed();
      sheet.close();
      toast('Entry updated');
      return;
    }
    // Branded / generic results are stored so they appear in Recent and can be linked later.
    const saved = food.source === 'generic' || food.source === 'off' ? await store.persistFood(food) : food;
    const e = await store.logFood(saved, { date, meal: curMeal, amount: a, servingLabel, qty });
    sheet.close();
    onLogged?.(saved, e);
  };
  const del = $(foot, '[data-del]');
  if (del) del.onclick = async () => {
    const copy = { ...entry };
    await store.deleteEntry(entry.id);
    changed();
    sheet.close();
    toast(`Deleted ${entry.name.slice(0, 28)}`, { label: 'Undo', run: async () => { await store.saveEntry(copy); changed(); } });
  };
  return sheet;
}

// ======================================================================
// Link picker: choose a similar generic (CoFID) food
// ======================================================================
export function openLinkPicker(initialQuery, onPick) {
  const body = el(`
    <div>
      <p class="note" style="margin-top:0">Pick the closest generic food. Its micronutrients will be used (per 100 g) wherever this food has no data. Label values always take priority.</p>
      <div class="search">${icons.search}<input class="input" type="search" placeholder="Search generic foods" aria-label="Search generic foods"></div>
      <div data-list style="margin-top:8px"></div>
    </div>`);
  const s = openSheet({ title: 'Link similar food', body, tall: true });
  const input = $(body, 'input');
  const list = $(body, '[data-list]');
  const guess = (initialQuery || '').toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter((w) => w.length > 3).slice(-2).join(' ');
  input.value = guess;
  const render = async () => {
    await fooddb.load();
    list.innerHTML = '';
    const res = fooddb.search(input.value, 40);
    if (!res.length) list.innerHTML = '<p class="empty">No matches. Try a simpler word (e.g. "peanut", "yogurt").</p>';
    for (const g of res) {
      const count = fooddb.microCount(g.per100);
      const r = el(`<button class="result" type="button"><div class="item-main"><div class="item-name">${esc(g.name)}</div><div class="macros-line">${count} of ${MICRO_KEYS.length} micronutrients · ${fmt(g.per100.kcal)} kcal/100g</div></div></button>`);
      r.onclick = () => { onPick(g); s.close(); };
      list.appendChild(r);
    }
  };
  input.oninput = render;
  render();
}

// ======================================================================
// Custom food form (create / edit)
// ======================================================================
export function openFoodForm(food, { onSaved } = {}) {
  const editing = !!food?.id;
  const f = { name: '', brand: '', unit: 'g', per100: normNutrients(), servings: [], favourite: false, source: 'custom', ...(food || {}) };
  const numField = (key, label, unit) =>
    `<label class="field"><span>${label}${unit ? ` <i class="unit">(${unit})</i>` : ''}</span><input class="input num" type="number" inputmode="decimal" step="any" min="0" data-n="${key}" value="${f.per100?.[key] ?? ''}" placeholder="${key === 'kcal' || key === 'protein' || key === 'carbs' || key === 'fat' ? '0' : 'no data'}"></label>`;
  const body = el(`
    <form>
      <label class="field"><span>Name</span><input class="input" data-f="name" required value="${esc(f.name)}" placeholder="e.g. Overnight oats"></label>
      <label class="field"><span>Brand (optional)</span><input class="input" data-f="brand" value="${esc(f.brand)}"></label>
      <div class="grid2">
        <label class="field"><span>Nutrition per</span><input class="input num" type="number" inputmode="decimal" step="any" min="0" data-basis value="100"></label>
        <label class="field"><span>Unit</span><select class="input" data-f="unit"><option value="g">grams (g)</option><option value="ml">millilitres (ml)</option></select></label>
      </div>
      <p class="note" data-basis-note>Enter values exactly as on the label. They're converted to per 100 when saved.</p>
      <div class="grid2">${numField('kcal', 'Calories', 'kcal')}${numField('protein', 'Protein', 'g')}${numField('carbs', 'Carbs', 'g')}${numField('fat', 'Fat', 'g')}${numField('sodium', 'Sodium', 'mg')}</div>
      <p class="note" style="margin-top:0">Sodium is in milligrams. If the label only lists salt, sodium (mg) = salt (g) × 400.</p>
      <div class="list-h">Micronutrients <span style="text-transform:none;letter-spacing:0;font-weight:600">· leave blank if unknown</span></div>
      <div class="grid2">${MICROS.filter((m) => m.key !== 'sodium').map((m) => numField(m.key, m.label, m.unit)).join('')}</div>
      <div class="list-h">Serving sizes</div>
      <div data-servings></div>
      <button type="button" class="btn sm" data-add-serv style="margin-top:6px">${icons.plus} Add serving</button>
      <div class="toggle" style="margin-top:14px"><span>Favourite</span><label class="switch"><input type="checkbox" data-fav ${f.favourite ? 'checked' : ''} aria-label="Favourite"><span></span></label></div>
      ${f.barcode ? `<p class="note">Barcode: ${esc(f.barcode)}</p>` : ''}
    </form>`);
  $(body, '[data-f="unit"]').value = f.unit;
  const foot = el(`<div class="btns">${editing ? '<button class="btn danger" type="button" data-del>Delete</button>' : ''}<button class="btn go" type="button" data-save>${editing ? 'Save' : 'Create food'}</button></div>`);
  const s = openSheet({ title: editing ? 'Edit food' : 'New food', body, foot, tall: true });

  let servings = [...(f.servings || [])];
  const renderServ = () => {
    const box = $(body, '[data-servings]');
    box.innerHTML = servings.length ? '' : '<p class="empty">None. You can always log by weight.</p>';
    servings.forEach((sv, i) => {
      const r = el(`<div class="row" style="gap:8px;margin:6px 0">
        <input class="input" value="${esc(sv.label)}" aria-label="Serving label" placeholder="1 scoop" style="flex:1.4">
        <input class="input num" type="number" inputmode="decimal" step="any" value="${sv.amount}" aria-label="Serving amount" style="flex:1">
        <button type="button" class="iconbtn" aria-label="Remove serving">${icons.close}</button></div>`);
      const [l, a] = $$(r, 'input');
      l.oninput = () => (sv.label = l.value);
      a.oninput = () => (sv.amount = Number(a.value));
      $(r, 'button').onclick = () => { servings.splice(i, 1); renderServ(); };
      box.appendChild(r);
    });
  };
  renderServ();
  $(body, '[data-add-serv]').onclick = () => { servings.push({ label: '', amount: '' }); renderServ(); $$(body, '[data-servings] input').at(-2)?.focus(); };
  const unitSel = $(body, '[data-f="unit"]');
  const basisNote = () => ($(body, '[data-basis-note]').textContent = `Enter values per ${$(body, '[data-basis]').value || 100} ${unitSel.value}, exactly as on the label. They're converted to per 100 ${unitSel.value} when saved.`);
  unitSel.onchange = basisNote;
  $(body, '[data-basis]').oninput = basisNote;

  $(foot, '[data-save]').onclick = async () => {
    const name = $(body, '[data-f="name"]').value.trim();
    if (!name) { $(body, '[data-f="name"]').focus(); return toast('Give the food a name'); }
    const basis = Number($(body, '[data-basis]').value) || 100;
    const k = 100 / basis;
    const per100 = {};
    for (const inp of $$(body, '[data-n]')) {
      const key = inp.dataset.n;
      const raw = inp.value.trim();
      if (raw === '') per100[key] = ['kcal', 'protein', 'carbs', 'fat'].includes(key) ? 0 : null;
      else per100[key] = Math.round(Number(raw) * k * 1000) / 1000;
    }
    const out = {
      ...f,
      name,
      brand: $(body, '[data-f="brand"]').value.trim(),
      unit: unitSel.value,
      per100: normNutrients(per100),
      servings: servings.filter((sv) => sv.label && sv.amount > 0).map((sv) => ({ label: sv.label.trim(), amount: Number(sv.amount) })),
      favourite: $(body, '[data-fav]').checked,
    };
    if (!editing && out.source !== 'off') out.source = 'custom';
    const saved = await store.saveFood(out);
    if (editing) await store.relinkEntries(saved).catch(() => 0);
    changed();
    s.close();
    toast(editing ? 'Food saved' : 'Food created');
    onSaved?.(saved);
  };
  const del = $(foot, '[data-del]');
  if (del) del.onclick = async () => {
    if (!(await confirmSheet(`Delete “${f.name}”? Logged entries stay in your history.`))) return;
    await store.deleteFood(f.id);
    changed();
    s.close();
    toast('Food deleted');
  };
  // `relinkEntries` rewrites nutrient snapshots for all entries of the food; for
  // edits that's what you want (fixing a typo in the label values fixes history too).
}

// ======================================================================
// Saved meals (recipes)
// ======================================================================
export async function recipeTotals(r, amounts) {
  const t = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  await fooddb.load();
  for (let i = 0; i < r.items.length; i++) {
    const food = await store.itemFood(r.items[i]);
    if (!food) continue;
    const n = scale(store.resolve(food).per100, amounts?.[i] ?? r.items[i].amount);
    for (const k of Object.keys(t)) t[k] += n[k] || 0;
  }
  return t;
}

/** Pick a food for a recipe: favourites, my foods, generic search. */
export function openFoodPicker(onPick) {
  const body = el(`
    <div>
      <div class="search">${icons.search}<input class="input" type="search" placeholder="Search foods" aria-label="Search foods"></div>
      <div data-list style="margin-top:8px"></div>
    </div>`);
  const s = openSheet({ title: 'Choose food', body, tall: true });
  const input = $(body, 'input');
  const list = $(body, '[data-list]');
  const pick = (food) => { onPick(food); s.close(); };
  let seq = 0;
  const render = async () => {
    const my = ++seq;
    await fooddb.load();
    const q = input.value.toLowerCase().trim();
    const all = await store.getFoods();
    if (my !== seq) return;
    list.innerHTML = '';
    const mine = all.filter((f) => !q || `${f.name} ${f.brand || ''}`.toLowerCase().includes(q))
      .sort((a, b) => (b.favourite - a.favourite) || a.name.localeCompare(b.name));
    if (mine.length) list.appendChild(el('<div class="list-h">My foods & favourites</div>'));
    for (const f of mine.slice(0, 40)) { const r = foodRow(f); r.onclick = () => pick(f); list.appendChild(r); }
    if (q) {
      list.appendChild(el('<div class="list-h">Generic foods</div>'));
      for (const g of fooddb.search(q, 25)) {
        const food = { source: 'generic', genericId: g.id, name: g.name, unit: 'g', servings: [] };
        const r = foodRow(food);
        r.onclick = () => pick(food);
        list.appendChild(r);
      }
    }
  };
  input.oninput = render;
  render();
}

export function openRecipeEditor(recipe, { onSaved } = {}) {
  const editing = !!recipe?.id;
  const r = recipe ? JSON.parse(JSON.stringify(recipe)) : { name: '', items: [] };
  const body = el(`
    <div>
      <label class="field"><span>Meal name</span><input class="input" data-name value="${esc(r.name)}" placeholder="e.g. Yoghurt bowl"></label>
      <div class="list-h">Foods</div>
      <div data-items></div>
      <button class="btn sm block" type="button" data-add style="margin-top:8px">${icons.plus} Add food</button>
      <div class="preview num" data-total></div>
    </div>`);
  const foot = el(`<div class="btns">${editing ? '<button class="btn danger" type="button" data-del>Delete</button>' : ''}<button class="btn go" type="button" data-save>Save meal</button></div>`);
  const s = openSheet({ title: editing ? 'Edit saved meal' : 'New saved meal', body, foot, tall: true });

  const renderTotal = async () => {
    const t = await recipeTotals(r);
    $(body, '[data-total]').innerHTML = [['kcal', 'Kcal'], ['protein', 'Protein'], ['carbs', 'Carbs'], ['fat', 'Fat']]
      .map(([k, l]) => `<div><div class="stat-v">${fmt(t[k], k === 'kcal' ? 'kcal' : '')}</div><div class="stat-l">${l}</div></div>`).join('');
  };
  const renderItems = () => {
    const box = $(body, '[data-items]');
    box.innerHTML = r.items.length ? '' : '<p class="empty">Add the foods in this meal and their usual amounts.</p>';
    r.items.forEach((it, i) => {
      const row = el(`<div class="row" style="gap:8px;padding:8px 0;border-top:1px solid var(--line)">
        <div class="item-main"><div class="item-name">${esc(it.name)}</div></div>
        <input class="input num" type="number" inputmode="decimal" step="any" min="0" value="${it.amount}" aria-label="Amount for ${esc(it.name)}" style="width:86px;text-align:right">
        <span class="muted small" style="width:20px">${esc(it.unit || 'g')}</span>
        <button class="iconbtn" type="button" aria-label="Remove ${esc(it.name)}">${icons.close}</button></div>`);
      $(row, 'input').oninput = (e) => { it.amount = Number(e.target.value); renderTotal(); };
      $(row, 'button').onclick = () => { r.items.splice(i, 1); renderItems(); };
      box.appendChild(row);
    });
    renderTotal();
  };
  renderItems();
  $(body, '[data-add]').onclick = () => openFoodPicker((food) => {
    const d = store.defaultAmount(food);
    r.items.push({
      foodId: food.id || null,
      genericId: food.source === 'generic' ? food.genericId : null,
      name: food.name,
      unit: food.unit || 'g',
      amount: d.amount,
      snapshot: food.id ? null : { ...food },
    });
    renderItems();
  });
  $(foot, '[data-save]').onclick = async () => {
    r.name = $(body, '[data-name]').value.trim();
    if (!r.name) return toast('Give the meal a name');
    if (!r.items.length) return toast('Add at least one food');
    const saved = await store.saveRecipe(r);
    changed();
    s.close();
    toast('Meal saved');
    onSaved?.(saved);
  };
  const del = $(foot, '[data-del]');
  if (del) del.onclick = async () => {
    if (!(await confirmSheet(`Delete saved meal “${r.name}”?`))) return;
    await store.deleteRecipe(r.id);
    changed();
    s.close();
    onSaved?.(null);
  };
}

/** Log a saved meal, with the option to tweak amounts first. */
export function openRecipeLog(recipe, { date, meal, onLogged, onEdited }) {
  const amounts = recipe.items.map((it) => it.amount);
  let curMeal = meal;
  const body = el(`
    <div>
      <p class="note" style="margin-top:0">Adjust amounts for this time only, or edit the saved meal.</p>
      <div data-items></div>
      <div class="preview num" data-total></div>
      <label class="field"><span>Meal</span><select class="input" data-meal>${MEALS.map((m) => `<option value="${m.key}">${m.label}</option>`).join('')}</select></label>
      <button class="btn sm block" type="button" data-edit>Edit saved meal</button>
    </div>`);
  const foot = el('<div class="btns"><button class="btn go" type="button" data-log>Log meal</button></div>');
  const s = openSheet({ title: recipe.name, body, foot, tall: true });
  $(body, '[data-meal]').value = meal;
  $(body, '[data-meal]').onchange = (e) => (curMeal = e.target.value);
  const renderTotal = async () => {
    const t = await recipeTotals(recipe, amounts);
    $(body, '[data-total]').innerHTML = [['kcal', 'Kcal'], ['protein', 'Protein'], ['carbs', 'Carbs'], ['fat', 'Fat']]
      .map(([k, l]) => `<div><div class="stat-v">${fmt(t[k], k === 'kcal' ? 'kcal' : '')}</div><div class="stat-l">${l}</div></div>`).join('');
  };
  const box = $(body, '[data-items]');
  recipe.items.forEach((it, i) => {
    const row = el(`<div class="row" style="gap:8px;padding:8px 0;border-top:1px solid var(--line)">
      <div class="item-main"><div class="item-name">${esc(it.name)}</div></div>
      <input class="input num" type="number" inputmode="decimal" step="any" min="0" value="${it.amount}" aria-label="Amount for ${esc(it.name)}" style="width:86px;text-align:right">
      <span class="muted small" style="width:20px">${esc(it.unit || 'g')}</span></div>`);
    $(row, 'input').oninput = (e) => { amounts[i] = Number(e.target.value); renderTotal(); };
    box.appendChild(row);
  });
  renderTotal();
  $(body, '[data-edit]').onclick = () => { s.close(); openRecipeEditor(recipe, { onSaved: onEdited }); };
  $(foot, '[data-log]').onclick = async () => {
    const created = await store.logRecipe(recipe, { date, meal: curMeal, amounts });
    s.close();
    onLogged?.(created);
    toast(`Added ${recipe.name}`, { label: 'Undo', run: async () => { for (const e of created) await store.deleteEntry(e.id); changed(); } });
  };
}
