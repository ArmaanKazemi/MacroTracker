// Supplements on the Today screen: a short list you tick off each day.
// A supplement can say what one dose contains ("vitamin d 25µg, epa+dha 500mg");
// those amounts then count towards the day's nutrient totals.
import { el, esc, $, icons, openSheet, toast } from './ui.js';
import { MICROS, SUBS, MACROS, fmt } from './nutrients.js';
import { extractNutrients } from './quickparse.js';
import * as store from './store.js';
import * as db from './db.js';
import { changed } from './sheets.js';

const LABEL = Object.fromEntries([...MICROS, ...SUBS, ...MACROS].map((m) => [m.key, [m.label, m.unit]]));
LABEL.kcal = ['kcal', 'kcal'];

/** "Vitamin D 25µg · EPA + DHA 500mg" */
export function nutrientSummary(n = {}) {
  return Object.entries(n).map(([k, v]) => {
    const [label, unit] = LABEL[k] || [k, ''];
    return k === 'kcal' ? `${fmt(v, 'kcal')} kcal` : `${label} ${fmt(v)}${unit}`;
  }).join(' · ');
}

export function supplementsCard(getDate) {
  const card = el(`
    <section class="card supps" aria-label="Supplements">
      <div class="supp-top"><span class="muted small" data-count></span></div>
      <div data-list></div>
      <button class="btn sm" type="button" data-add-supp>${icons.plus} Add supplement</button>
    </section>`);
  const list = $(card, '[data-list]');
  $(card, '[data-add-supp]').onclick = () => openSupplementEditor(null);

  async function refresh(entries) {
    const supps = await store.getSupplements();
    const taken = new Map(entries.filter((e) => e.meal === 'supplements' && e.suppId).map((e) => [e.suppId, e]));
    const done = supps.filter((s) => taken.has(s.id)).length;
    $(card, '[data-count]').textContent = supps.length ? `${done} of ${supps.length} taken` : '';
    list.innerHTML = '';
    if (!supps.length) {
      list.appendChild(el('<p class="empty" style="margin:2px 0 10px">Add the supplements you take, then tick them off each day.</p>'));
      return;
    }
    for (const s of supps) {
      const e = taken.get(s.id);
      const row = el(`
        <div class="supp-row${e ? ' taken' : ''}" role="checkbox" aria-checked="${!!e}" tabindex="0">
          <span class="supp-check" aria-hidden="true">${e ? icons.check : ''}</span>
          <div class="item-main">
            <div class="item-name">${esc(s.name)}</div>
            <div class="item-meta">${esc([s.dose, nutrientSummary(s.nutrients)].filter(Boolean).join(' · ')) || '&nbsp;'}</div>
          </div>
          <button class="iconbtn" type="button" data-edit aria-label="Edit ${esc(s.name)}">${icons.edit}</button>
        </div>`);
      const toggle = async () => {
        if (e) await store.deleteEntry(e.id);
        else { await store.takeSupplement(s, getDate()); navigator.vibrate?.(12); }
        changed();
      };
      row.onclick = (ev) => { if (!ev.target.closest('[data-edit]')) toggle(); };
      row.onkeydown = (ev) => { if (ev.key === ' ' || ev.key === 'Enter') { ev.preventDefault(); toggle(); } };
      $(row, '[data-edit]').onclick = () => openSupplementEditor(s);
      list.appendChild(row);
    }
  }
  return { el: card, refresh };
}

export function openSupplementEditor(supp) {
  const s = supp ? structuredClone(supp) : { id: 's-' + db.uid(), name: '', dose: '', nutrients: {}, text: '' };
  const body = el(`
    <form>
      <label class="field"><span>Name</span><input class="input" data-name required value="${esc(s.name)}" placeholder="e.g. Vitamin D, Creatine, Omega-3" autocomplete="off"></label>
      <label class="field"><span>Dose</span><input class="input" data-dose value="${esc(s.dose || '')}" placeholder="e.g. 1 capsule, 5 g, 2 gummies" autocomplete="off"></label>
      <label class="field"><span>What's in one dose <i class="unit">(optional)</i></span>
        <textarea class="input ql-text" data-text rows="2" placeholder="e.g. vitamin d 25µg, epa+dha 500mg, magnesium 200mg" autocomplete="off" autocorrect="off" spellcheck="false">${esc(s.text || '')}</textarea></label>
      <p class="note" data-parsed style="margin-top:0">Anything listed here counts towards your nutrient totals on the days you take it.</p>
    </form>`);
  const foot = el(`<div class="btns">${supp ? '<button class="btn danger" type="button" data-del>Delete</button>' : ''}<button class="btn go" type="button" data-save>${supp ? 'Save' : 'Add supplement'}</button></div>`);
  const sheet = openSheet({ title: supp ? 'Edit supplement' : 'New supplement', body, foot });
  const text = $(body, '[data-text]');
  const parse = () => {
    const { nutrients, ignored } = extractNutrients(text.value.replace(/,/g, ' '));
    const out = $(body, '[data-parsed]');
    if (!text.value.trim()) { out.textContent = 'Anything listed here counts towards your nutrient totals on the days you take it.'; return nutrients; }
    out.innerHTML = Object.keys(nutrients).length
      ? `Counts as: <b>${esc(nutrientSummary(nutrients))}</b>${ignored.length ? ` <span class="muted">(not tracked: ${esc(ignored.join(', '))})</span>` : ''}`
      : 'Nothing recognised yet. Try “vitamin d 25µg”.';
    return nutrients;
  };
  text.oninput = parse;
  parse();

  $(foot, '[data-save]').onclick = async () => {
    const name = $(body, '[data-name]').value.trim();
    if (!name) { $(body, '[data-name]').focus(); return toast('Give it a name'); }
    Object.assign(s, { name, dose: $(body, '[data-dose]').value.trim(), text: text.value.trim(), nutrients: parse() });
    const list = await store.getSupplements();
    const i = list.findIndex((x) => x.id === s.id);
    if (i >= 0) list[i] = s; else list.push(s);
    await store.saveSupplements(list);
    changed();
    sheet.close();
    toast(supp ? 'Supplement updated' : `Added ${name}`);
  };
  const del = $(foot, '[data-del]');
  if (del) del.onclick = async () => {
    const list = await store.getSupplements();
    const i = list.findIndex((x) => x.id === s.id);
    if (i < 0) return sheet.close();
    const [removed] = list.splice(i, 1);
    await store.saveSupplements(list);
    changed();
    sheet.close();
    toast(`Deleted ${removed.name}`, { label: 'Undo', run: async () => { const l = await store.getSupplements(); l.splice(i, 0, removed); await store.saveSupplements(l); changed(); } });
  };
}
