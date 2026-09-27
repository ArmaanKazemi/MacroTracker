// Nutrients, Foods and Settings screens.
import { el, esc, $, $$, icons, animateNumber, setFill, dateSwitcher, toast, addDays, parseKey, todayKey, confirmSheet } from './ui.js';
import { MICROS, MACROS, totals, fmt, macroKcal, defaultSettings, microStatus } from './nutrients.js';
import * as store from './store.js';
import * as fooddb from './fooddb.js';
import * as db from './db.js';
import { openFoodDetail, openFoodForm, openRecipeEditor, openRecipeLog, recipeTotals, changed } from './sheets.js';

export function guessMeal() {
  const h = new Date().getHours();
  if (h < 11) return 'breakfast';
  if (h < 15) return 'lunch';
  if (h >= 17 && h < 21) return 'dinner';
  return 'snacks';
}

// ======================================================================
// Nutrients
// ======================================================================
export function mountNutrients(view, state) {
  view.innerHTML = '';
  let mode = state.microMode || 'day';
  const top = el('<div class="topbar"><h1 class="title">Nutrients</h1></div>');
  const seg = el(`<div class="seg" role="tablist"><button role="tab" data-m="day">Day</button><button role="tab" data-m="week">7-day average</button></div>`);
  const summary = el(`<div class="micro-sum">
      <div class="card"><div class="stat-v num c-red" data-low>0</div><div class="stat-l">Low / over</div></div>
      <div class="card"><div class="stat-v num c-amber" data-mid>0</div><div class="stat-l">Getting there</div></div>
      <div class="card"><div class="stat-v num c-green" data-ok>0</div><div class="stat-l">On target</div></div>
    </div>`);
  const card = el(`<section class="card" aria-label="Micronutrients">${MICROS.map((m) => `
    <div class="bar-row" data-k="${m.key}">
      <div class="bar-head"><span class="bar-name">${m.label} <span class="pill" data-pill></span></span><span class="bar-val num"><b data-v>0</b> / ${m.kind === 'limit' ? 'max ' : ''}<span data-t></span> ${m.unit}</span></div>
      <div class="track thin"><div class="fill"></div></div>
      <div class="days" data-days hidden>${'<i></i>'.repeat(7)}</div>
      <div class="nodata" data-ul hidden></div>
      <div class="nodata" data-nd hidden></div>
    </div>`).join('')}</section>`);
  const foot = el('<p class="note" data-foot style="padding:0 4px"></p>');
  view.append(top, seg, summary, card, foot);
  $$(seg, '[data-m]').forEach((b) => (b.onclick = () => { mode = state.microMode = b.dataset.m; refresh(); }));

  async function refresh() {
    top.replaceChildren(el('<h1 class="title">Nutrients</h1>'), dateSwitcher(state.date, (d) => { state.date = d; refresh(); }));
    $$(seg, '[data-m]').forEach((b) => b.setAttribute('aria-selected', b.dataset.m === mode));
    const settings = await store.getSettings();
    let values; // key -> { value, missing }
    let perDay = null;
    let loggedDays = 1;
    if (mode === 'day') {
      const list = await store.entriesFor(state.date);
      values = totals(list);
      foot.textContent = list.length ? '' : 'Nothing logged on this day yet.';
    } else {
      const from = addDays(state.date, -6);
      const all = await store.entriesBetween(from, state.date);
      perDay = [];
      for (let i = 0; i < 7; i++) {
        const d = addDays(from, i);
        const list = all.filter((e) => e.date === d);
        perDay.push(list.length ? totals(list) : null);
      }
      const logged = perDay.filter(Boolean);
      loggedDays = logged.length;
      values = {};
      for (const m of MICROS) {
        const sum = logged.reduce((s, t) => s + t[m.key].value, 0);
        const missing = logged.reduce((s, t) => s + t[m.key].missing, 0);
        values[m.key] = { value: loggedDays ? sum / loggedDays : 0, missing };
      }
      const f = parseKey(from).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
      const t = parseKey(state.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
      foot.textContent = loggedDays
        ? `Average of ${loggedDays} logged ${loggedDays === 1 ? 'day' : 'days'}, ${f} – ${t}. Days with nothing logged are skipped. The strip under each bar shows each day.`
        : `Nothing logged between ${f} and ${t}.`;
    }
    let low = 0, mid = 0, ok = 0;
    for (const m of MICROS) {
      const row = $(card, `[data-k="${m.key}"]`);
      const target = m.kind === 'limit' ? null : settings.micros[m.key] || m.target;
      const upper = settings.upper?.[m.key] ?? m.upper;
      const scaleTo = m.kind === 'limit' ? upper : target;
      const { value, missing } = values[m.key];
      const st = microStatus(m, value, target, upper);
      const hasData = mode === 'week' ? loggedDays > 0 : true;
      if (hasData) { if (st.status === 'red') low++; else if (st.status === 'amber') mid++; else ok++; }
      animateNumber($(row, '[data-v]'), value, (v) => fmt(v));
      $(row, '[data-t]').textContent = scaleTo ? Number(scaleTo).toLocaleString('en-GB') : '—';
      setFill($(row, '.fill'), scaleTo ? value / scaleTo : 0, st.status);
      const pill = $(row, '[data-pill]');
      pill.className = `pill ${st.pill}`;
      pill.textContent = st.label;
      const nd = $(row, '[data-nd]');
      nd.hidden = !missing;
      nd.textContent = missing ? `${missing} logged ${missing === 1 ? 'food has' : 'foods have'} no data for ${m.label} — the real total may be higher.` : '';
      // Upper-limit info, shown once the target is met (or always when exceeded).
      const ul = $(row, '[data-ul]');
      const ulText = upper ? `${Number(upper).toLocaleString('en-GB')} ${m.unit}` : '';
      if (m.kind !== 'limit' && upper && (value >= (target || 0) || value >= upper)) {
        ul.hidden = false;
        if (m.upperNote) ul.innerHTML = `Upper limit ${ulText} applies ${esc(m.upperNote)} — food totals aren't flagged.`;
        else if (value >= upper) ul.innerHTML = `<span class="c-red">Above the upper limit of ${ulText}.</span>`;
        else ul.innerHTML = `Upper limit ${ulText}.`;
      } else ul.hidden = true;
      const days = $(row, '[data-days]');
      days.hidden = mode !== 'week';
      if (perDay) {
        $$(days, 'i').forEach((cell, i) => {
          const t = perDay[i];
          cell.className = t ? `bg-${microStatus(m, t[m.key].value, target, upper).status}` : '';
          cell.title = t ? `${fmt(t[m.key].value)} ${m.unit}` : 'Nothing logged';
        });
      }
    }
    animateNumber($(summary, '[data-low]'), low);
    animateNumber($(summary, '[data-mid]'), mid);
    animateNumber($(summary, '[data-ok]'), ok);
  }
  return { refresh };
}

// ======================================================================
// Foods (my foods, favourites, saved meals)
// ======================================================================
export function mountFoods(view, state) {
  view.innerHTML = '';
  let tab = state.foodsTab || 'fav';
  view.append(el('<div class="topbar"><h1 class="title">Foods</h1></div>'));
  const seg = el(`<div class="seg" role="tablist"><button role="tab" data-t="fav">Favourites</button><button role="tab" data-t="mine">My foods</button><button role="tab" data-t="meals">Saved meals</button></div>`);
  const actions = el(`<div class="btns" style="margin:0 0 12px"><button class="btn sm" type="button" data-nf>${icons.plus} New food</button><button class="btn sm" type="button" data-nm>${icons.plus} New meal</button></div>`);
  const card = el('<section class="card"></section>');
  view.append(seg, actions, card);
  $(actions, '[data-nf]').onclick = () => openFoodForm(null);
  $(actions, '[data-nm]').onclick = () => openRecipeEditor(null);
  $$(seg, '[data-t]').forEach((b) => (b.onclick = () => { tab = state.foodsTab = b.dataset.t; refresh(); }));

  async function refresh() {
    await fooddb.load();
    $$(seg, '[data-t]').forEach((b) => b.setAttribute('aria-selected', b.dataset.t === tab));
    card.innerHTML = '';
    if (tab === 'meals') {
      const recipes = (await store.getRecipes()).sort((a, b) => a.name.localeCompare(b.name));
      if (!recipes.length) card.innerHTML = '<p class="empty">No saved meals yet. Tap “New meal” to combine foods you often eat together.</p>';
      for (const r of recipes) {
        const t = await recipeTotals(r);
        const row = el(`<button class="result" type="button"><div class="item-main"><div class="item-name">${esc(r.name)}</div>
          <div class="macros-line"><b>${fmt(t.kcal, 'kcal')}</b> kcal · P ${fmt(t.protein)} · C ${fmt(t.carbs)} · F ${fmt(t.fat)} · ${r.items.length} items</div></div></button>`);
        row.onclick = () => openRecipeLog(r, { date: todayKey(), meal: guessMeal(), onLogged: () => changed(), onEdited: refresh });
        card.appendChild(row);
      }
      return;
    }
    const foods = (await store.getFoods())
      .filter((f) => (tab === 'fav' ? f.favourite : f.source !== 'generic'))
      .sort((a, b) => a.name.localeCompare(b.name));
    if (!foods.length) card.innerHTML = `<p class="empty">${tab === 'fav' ? 'No favourites yet.' : 'No custom foods yet.'}</p>`;
    for (const f of foods) {
      const { per100, estimated } = store.resolve(f);
      const noData = MICROS.filter((m) => per100[m.key] === null).length;
      const row = el(`<button class="result" type="button"><div class="item-main">
        <div class="item-name">${esc(f.name)}${f.favourite && tab !== 'fav' ? ' <span class="c-amber">★</span>' : ''}</div>
        <div class="macros-line"><b>${fmt(per100.kcal, 'kcal')}</b> kcal · P ${fmt(per100.protein)} · C ${fmt(per100.carbs)} · F ${fmt(per100.fat)} <span class="muted">per 100${f.unit || 'g'}</span>
        ${noData ? ` · <span class="pill na">${noData} no data</span>` : estimated.length ? ' · <span class="pill est">micros est.</span>' : ''}</div></div></button>`);
      row.onclick = () => openFoodDetail(f, { date: todayKey(), meal: guessMeal(), onLogged: () => { changed(); toast(`Logged ${f.name.slice(0, 28)} to today`); } });
      card.appendChild(row);
    }
  }
  return { refresh };
}

// ======================================================================
// Settings
// ======================================================================
export function mountSettings(view) {
  view.innerHTML = '';
  view.append(el('<div class="topbar"><h1 class="title">Settings</h1></div>'));
  const goals = el(`
    <section class="card">
      <div class="eyebrow">Daily goals</div>
      <label class="field"><span>Calories <i class="unit">(kcal)</i></span><input class="input num" type="number" inputmode="numeric" min="0" step="1" data-s="kcal"></label>
      <div class="grid3">
        ${MACROS.map((m) => `<label class="field"><span>${m.label} <i class="unit">(g)</i></span><input class="input num" type="number" inputmode="numeric" min="0" step="1" data-s="${m.key}"></label>`).join('')}
      </div>
      <div class="kv" style="border-top:0;padding-top:4px"><span class="muted">Macros add up to</span><b class="num" data-mk></b></div>
      <p class="note" data-mdiff style="margin-top:0"></p>
      <button class="btn sm" type="button" data-usemk hidden>Set calorie goal to match macros</button>
      <label class="field" style="margin-top:16px"><span>Water (litres)</span><input class="input num" type="number" inputmode="decimal" min="0" step="0.1" data-s="water"></label>
    </section>`);
  const micros = el(`
    <section class="card">
      <div class="row"><div class="eyebrow">Micronutrients</div><span class="spacer"></span><button class="btn sm" type="button" data-reset style="min-height:36px">Reset defaults</button></div>
      <p class="note">Daily target and upper limit for each nutrient. Leave an upper limit blank for none. Sodium is a limit only: it turns amber near it and red once you reach it.</p>
      <div class="mtable">
        <div class="mrow mhead"><span>Nutrient</span><span>Target</span><span>Upper limit</span></div>
        ${MICROS.map((m) => `
        <div class="mrow">
          <span class="mname">${m.label} <i class="unit">${m.unit}</i>${m.upperNote ? `<small>UL ${esc(m.upperNote)}</small>` : ''}</span>
          ${m.kind === 'limit'
            ? '<span class="mnone">—</span>'
            : `<input class="input num" type="number" inputmode="decimal" min="0" step="any" data-micro="${m.key}" aria-label="${m.label} target (${m.unit})">`}
          <input class="input num" type="number" inputmode="decimal" min="0" step="any" data-upper="${m.key}" placeholder="none" aria-label="${m.label} upper limit (${m.unit})">
        </div>`).join('')}
      </div>
    </section>`);
  const data = el(`
    <section class="card">
      <div class="eyebrow">Your data</div>
      <p class="note">Everything is stored on this device only. Export a backup regularly — especially before clearing Safari data or changing phones.</p>
      <div class="btns"><button class="btn" type="button" data-export>Export JSON</button><button class="btn" type="button" data-import>Import JSON</button></div>
      <input type="file" accept="application/json,.json" data-file hidden>
      <p class="note" data-counts></p>
    </section>`);
  const about = el(`
    <section class="card">
      <div class="eyebrow">Food database</div>
      <p class="note" data-dbinfo></p>
      <p class="note">Branded products from Open Food Facts (openfoodfacts.org, ODbL). Generic foods from the UK Composition of Foods Integrated Dataset (CoFID), Public Health England / OHID.</p>
      <p class="note" data-ver></p>
    </section>`);
  view.append(goals, micros, data, about);

  let s;
  const save = async () => { await store.saveSettings(s); changed(); };

  async function refresh() {
    s = structuredClone(await store.getSettings());
    for (const inp of $$(goals, '[data-s]')) {
      const k = inp.dataset.s;
      if (document.activeElement !== inp) inp.value = k === 'water' ? s.water / 1000 : s[k];
    }
    for (const inp of $$(micros, '[data-micro]')) if (document.activeElement !== inp) inp.value = s.micros[inp.dataset.micro];
    for (const inp of $$(micros, '[data-upper]')) if (document.activeElement !== inp) inp.value = s.upper[inp.dataset.upper] ?? '';
    updateMacroKcal();
    const [foods, recipes, entries] = await Promise.all([store.getFoods(), store.getRecipes(), db.getAll('entries')]);
    const days = new Set(entries.map((e) => e.date)).size;
    $(data, '[data-counts]').textContent = `${entries.length} logged entries over ${days} ${days === 1 ? 'day' : 'days'} · ${foods.length} saved foods · ${recipes.length} saved meals`;
    await fooddb.load();
    const info = fooddb.info();
    $(about, '[data-dbinfo]').innerHTML = info.full
      ? `<b style="color:var(--text)">${info.count.toLocaleString('en-GB')}</b> generic foods from ${esc(info.source)}, available offline.`
      : `Using the bundled starter set (${info.count} common foods, approximate values). The full CoFID dataset is added automatically when the site is deployed with the included GitHub Action.`;
    $(about, '[data-ver]').textContent = `App version ${window.APP_VERSION || ''}`;
  }

  function updateMacroKcal() {
    const mk = macroKcal(s.protein, s.carbs, s.fat);
    $(goals, '[data-mk]').textContent = `${Math.round(mk).toLocaleString('en-GB')} kcal`;
    const diff = Math.round(mk - s.kcal);
    const dEl = $(goals, '[data-mdiff]');
    if (Math.abs(diff) < 10) { dEl.innerHTML = '<span class="c-green">Matches your calorie goal.</span>'; }
    else dEl.innerHTML = `<span class="c-amber">${Math.abs(diff).toLocaleString('en-GB')} kcal ${diff > 0 ? 'more' : 'less'} than your calorie goal.</span> Protein & carbs 4 kcal/g, fat 9 kcal/g.`;
    const b = $(goals, '[data-usemk]');
    b.hidden = Math.abs(diff) < 10;
    b.textContent = `Set calorie goal to ${Math.round(mk).toLocaleString('en-GB')} kcal`;
  }

  for (const inp of $$(goals, '[data-s]')) {
    inp.oninput = () => {
      const k = inp.dataset.s;
      const v = Number(inp.value);
      if (inp.value === '' || !(v >= 0)) return;
      s[k] = k === 'water' ? Math.round(v * 1000) : Math.round(v);
      updateMacroKcal();
    };
    inp.onchange = save;
  }
  $(goals, '[data-usemk]').onclick = async () => {
    s.kcal = Math.round(macroKcal(s.protein, s.carbs, s.fat));
    $(goals, '[data-s="kcal"]').value = s.kcal;
    updateMacroKcal();
    await save();
    toast('Calorie goal updated');
  };
  for (const inp of $$(micros, '[data-micro]')) {
    inp.onchange = async () => {
      const v = Number(inp.value);
      if (inp.value === '' || !(v > 0)) { inp.value = s.micros[inp.dataset.micro]; return; }
      s.micros[inp.dataset.micro] = v;
      await save();
    };
  }
  for (const inp of $$(micros, '[data-upper]')) {
    inp.onchange = async () => {
      const key = inp.dataset.upper;
      const v = Number(inp.value);
      if (inp.value === '') s.upper[key] = null;
      else if (v > 0) s.upper[key] = v;
      else { inp.value = s.upper[key] ?? ''; return; }
      await save();
    };
  }
  $(micros, '[data-reset]').onclick = async () => {
    const d = defaultSettings();
    s.micros = d.micros;
    s.upper = d.upper;
    await save();
    toast('Targets and limits reset to defaults');
  };

  $(data, '[data-export]').onclick = async () => {
    const json = await db.exportAll();
    const blob = new Blob([JSON.stringify(json, null, 1)], { type: 'application/json' });
    const name = `fuel-backup-${todayKey()}.json`;
    const file = new File([blob], name, { type: 'application/json' });
    // iOS home-screen apps can't always trigger downloads; the share sheet lets you "Save to Files".
    if (navigator.canShare?.({ files: [file] }) && /iPhone|iPad|iPod/.test(navigator.userAgent)) {
      try { await navigator.share({ files: [file], title: name }); return; } catch (e) { if (e.name === 'AbortError') return; }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    toast('Backup exported');
  };
  const file = $(data, '[data-file]');
  $(data, '[data-import]').onclick = () => file.click();
  file.onchange = async () => {
    const f = file.files[0];
    file.value = '';
    if (!f) return;
    let json;
    try { json = JSON.parse(await f.text()); } catch { return toast('That file is not valid JSON'); }
    if (json?.app !== 'macrotracker') return toast('Not a backup from this app');
    const n = json.data?.entries?.length ?? 0;
    if (!(await confirmSheet(`Replace ALL current data with this backup (${n} entries, exported ${json.exportedAt ? new Date(json.exportedAt).toLocaleString('en-GB') : 'unknown date'})?`, 'Replace data'))) return;
    try {
      await db.importAll(json);
      store.resetCache();
      changed();
      toast('Backup restored');
    } catch (e) {
      toast(`Import failed: ${e.message}`);
    }
  };
  return { refresh };
}
