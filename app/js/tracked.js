// Tracked nutrients (Settings → Tracked nutrients): choose which micronutrients
// the app tracks, apply a preset, and edit each one's daily target and upper limit.
// Turning a nutrient off only hides it; logged values are kept, so turning it
// back on brings its history back.
import { el, esc, $, $$, icons, toast, todayKey } from './ui.js';
import { MICRO_GROUPS, MICRO_BY_KEY, TRACK_PRESETS, CORE_MICROS, defaultSettings } from './nutrients.js';
import * as store from './store.js';
import { changed } from './sheets.js';

/**
 * Switch nutrients on/off. A nutrient switched on for the first time counts in
 * stats from today; the original 17 (and anything switched on before) keep their
 * full history.
 */
export function setTracked(settings, keys) {
  const on = new Set(keys);
  settings.trackedSince = { ...(settings.trackedSince || {}) };
  for (const k of on) {
    if (!(settings.tracked || []).includes(k) && !CORE_MICROS.includes(k) && !settings.trackedSince[k]) settings.trackedSince[k] = todayKey();
  }
  // Keep display order.
  settings.tracked = MICRO_GROUPS.flatMap((g) => g.keys).filter((k) => on.has(k));
  return settings;
}

const num = (v) => (v === null || v === undefined ? '' : Number(v).toLocaleString('en-GB'));

export function mountTracked(view) {
  view.innerHTML = '';
  const top = el(`
    <div class="meal-top">
      <a class="iconbtn" href="#/settings" data-back aria-label="Back to Settings">${icons.back}</a>
      <div style="min-width:0"><h1 class="title">Tracked nutrients</h1><div class="muted" data-count></div></div>
    </div>`);
  $(top, '[data-back]').onclick = (e) => {
    if (window.__prevRoute === 'settings') { e.preventDefault(); history.back(); }
  };
  const intro = el(`
    <section class="card">
      <div class="eyebrow">Presets</div>
      <div class="seg trk-presets" role="group" aria-label="Presets" style="margin:12px 0 4px">${TRACK_PRESETS.map((p) => `<button type="button" data-preset="${p.key}">${p.label}</button>`).join('')}</div>
      <p class="note" data-preset-note style="margin-top:6px"></p>
      <p class="note">Switched-off nutrients are hidden everywhere, but their data is kept: switch one back on and its history returns. A nutrient you switch on for the first time counts from today, so past days aren't marked low.</p>
    </section>`);
  const presetNote = {
    core: 'Core: the 17 essentials (vitamins A, C, D, K, B12, folate; sodium, potassium, calcium, magnesium, iron, zinc, iodine, selenium; fibre, ALA, EPA + DHA).',
    extended: 'Extended: Core plus vitamin E, choline, B6, B1, B2, B3 and phosphorus.',
    all: 'Everything: all 32 vitamins, minerals, fibre and fats.',
  };
  const groups = el(`<div>${MICRO_GROUPS.map((g) => `
    <div class="sub-h page trk-gh"><span>${g.label}</span><span class="spacer"></span>
      <button class="btn link sm" type="button" data-all="${g.key}">Select all</button><button class="btn link sm" type="button" data-none="${g.key}">Clear</button></div>
    <section class="card trk-card" aria-label="${g.label}">${g.items.map((m) => `
      <div class="trk-row" data-k="${m.key}">
        <div class="toggle">
          <span class="mname">${m.label} <i class="unit">${m.unit}</i></span>
          <label class="switch"><input type="checkbox" data-on aria-label="Track ${esc(m.label)}"><span></span></label>
        </div>
        <div class="trk-detail" hidden>
          <div class="grid2">
            ${m.kind === 'limit'
              ? `<div class="field"><span>Daily target</span><div class="mnone trk-none">— (a limit)</div></div>`
              : `<label class="field"><span>Daily target <i class="unit">(${m.unit})</i></span><input class="input num" type="number" inputmode="decimal" min="0" step="any" data-target aria-label="${esc(m.label)} target (${m.unit})"></label>`}
            <label class="field"><span>${m.kind === 'limit' ? 'Maximum' : 'Upper limit'} <i class="unit">(${m.unit})</i></span><input class="input num" type="number" inputmode="decimal" min="0" step="any" data-upper placeholder="none" aria-label="${esc(m.label)} upper limit (${m.unit})"></label>
          </div>
          ${m.upperNote ? `<p class="nodata trk-ulnote" data-ulnote>Upper limit<small class="ul-note">${esc(m.upperNote)}</small></p>` : ''}
          <div class="trk-reset-row"><span class="muted small" data-def></span><button class="btn link sm" type="button" data-reset>Reset to default</button></div>
        </div>
      </div>`).join('')}</section>`).join('')}</div>`);
  view.append(top, intro, groups);

  let s;
  const save = async () => { await store.saveSettings(s); changed(); };

  function paint() {
    const on = new Set(s.tracked);
    $(top, '[data-count]').textContent = `${on.size} of ${Object.keys(MICRO_BY_KEY).length} tracked`;
    const match = TRACK_PRESETS.find((p) => p.keys.length === on.size && p.keys.every((k) => on.has(k)));
    $$(intro, '[data-preset]').forEach((b) => b.setAttribute('aria-selected', b.dataset.preset === match?.key));
    $(intro, '[data-preset-note]').textContent = match ? presetNote[match.key] : 'Custom selection.';
    for (const row of $$(groups, '.trk-row')) {
      const m = MICRO_BY_KEY[row.dataset.k];
      const isOn = on.has(m.key);
      $(row, '[data-on]').checked = isOn;
      row.classList.toggle('on', isOn);
      $(row, '.trk-detail').hidden = !isOn;
      const t = $(row, '[data-target]');
      const u = $(row, '[data-upper]');
      const target = s.micros[m.key] ?? m.target;
      const upper = s.upper?.[m.key] === undefined ? m.upper : s.upper[m.key];
      if (t && document.activeElement !== t) t.value = target ?? '';
      if (document.activeElement !== u) u.value = upper ?? '';
      const ulNote = $(row, '[data-ulnote]');
      if (ulNote) {
        ulNote.hidden = !upper;
        ulNote.firstChild.textContent = upper ? `Upper limit ${num(upper)} ${m.unit}` : '';
      }
      const isDefault = (m.kind === 'limit' || Number(target) === m.target) && (upper ?? null) === (m.upper ?? null);
      // Only once something's been changed: what the default was, and a way back to it.
      $(row, '.trk-reset-row').hidden = isDefault;
      $(row, '[data-def]').textContent = isDefault ? ''
        : `Default: ${m.kind === 'limit' ? '' : `${num(m.target)} ${m.unit}`}${m.upper ? `${m.kind === 'limit' ? 'max' : ', upper limit'} ${num(m.upper)} ${m.unit}` : ''}`;
    }
  }

  async function refresh() {
    s = structuredClone(await store.getSettings());
    paint();
  }

  const apply = async (keys, msg) => {
    setTracked(s, keys);
    paint();
    await save();
    if (msg) toast(msg);
  };

  $$(intro, '[data-preset]').forEach((b) => (b.onclick = () => {
    const p = TRACK_PRESETS.find((x) => x.key === b.dataset.preset);
    apply(p.keys, `${p.label}: ${p.keys.length} nutrients tracked`);
  }));
  for (const g of MICRO_GROUPS) {
    $(groups, `[data-all="${g.key}"]`).onclick = () => apply([...new Set([...s.tracked, ...g.keys])]);
    $(groups, `[data-none="${g.key}"]`).onclick = () => apply(s.tracked.filter((k) => !g.keys.includes(k)));
  }
  for (const row of $$(groups, '.trk-row')) {
    const m = MICRO_BY_KEY[row.dataset.k];
    $(row, '[data-on]').onchange = (e) => apply(e.target.checked ? [...s.tracked, m.key] : s.tracked.filter((k) => k !== m.key));
    const t = $(row, '[data-target]');
    if (t) t.onchange = async () => {
      const v = Number(t.value);
      if (t.value === '' || !(v > 0)) { paint(); return; }
      s.micros[m.key] = v;
      paint();
      await save();
    };
    const u = $(row, '[data-upper]');
    u.onchange = async () => {
      const v = Number(u.value);
      if (u.value === '') s.upper[m.key] = null;
      else if (v > 0) s.upper[m.key] = v;
      else { paint(); return; }
      paint();
      await save();
    };
    $(row, '[data-reset]').onclick = async () => {
      const d = defaultSettings();
      s.micros[m.key] = d.micros[m.key];
      s.upper[m.key] = d.upper[m.key];
      paint();
      await save();
      toast(`${m.label} reset to default`);
    };
  }
  return { refresh };
}
