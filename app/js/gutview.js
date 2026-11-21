// Gut log screens: the quick-add sheet, the row on Today, and the Gut log page
// (blood banner, weekly summary, possible triggers, history with the foods eaten
// before each entry, CSV export).
import { el, esc, $, $$, icons, openSheet, toast, todayKey, addDays, parseKey, swipeToDelete, confirmSheet } from './ui.js';
import * as store from './store.js';
import { changed } from './sheets.js';
import { BRISTOL, URGENCY, TAGS, BLOOD_BANNER, groupOf, weekSummary, foodsBefore, triggers, gutCsv, newestFirst } from './gut.js';

const GROUP_LABEL = { hard: 'Hard', normal: 'Normal', loose: 'Loose' };
const YN = [
  ['straining', 'Straining'],
  ['incomplete', 'Incomplete emptying'],
  ['relieved', 'Pain relieved by it'],
  ['blood', 'Blood'],
  ['mucus', 'Mucus'],
];

/** Small drawing of each Bristol type. */
export function bristolIcon(type) {
  const s = 'fill="currentColor"';
  const shapes = {
    1: `<circle cx="9" cy="16" r="4" ${s}/><circle cx="19" cy="12" r="3.6" ${s}/><circle cx="28" cy="17" r="4.2" ${s}/><circle cx="37" cy="12" r="3.4" ${s}/>`,
    2: `<path d="M6 14c0-4 4-6 8-5 2-3 7-3 9 0 2-2 7-2 9 1 3-1 7 1 7 4s-3 6-7 5c-2 3-7 3-9 1-2 2-7 2-9-1-4 1-8-1-8-5z" ${s}/>`,
    3: `<path d="M5 14c0-3 3-5 6-5h26c3 0 6 2 6 5s-3 5-6 5H11c-3 0-6-2-6-5z" ${s}/><path d="M15 9.5l2 3M23 9.5l-1 3.5M31 9.5l2 3M19 18.5l1.5-3M28 18.5l-1-3" stroke="var(--card)" stroke-width="1.4" stroke-linecap="round"/>`,
    4: `<path d="M4 16c4-7 9-7 13-3s9 4 13-1 9-4 13 1" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round"/>`,
    5: `<ellipse cx="11" cy="15" rx="6" ry="4.5" ${s}/><ellipse cx="24" cy="12" rx="5.5" ry="4" ${s}/><ellipse cx="36" cy="16" rx="6" ry="4.5" ${s}/>`,
    6: `<path d="M6 17c-1-4 3-5 5-4 0-4 5-5 7-2 2-3 7-3 8 1 3-2 8 0 7 4 4 0 6 4 3 6H9c-3 0-4-3-3-5z" ${s} opacity=".9"/><circle cx="10" cy="22" r="1.4" ${s}/><circle cx="40" cy="20" r="1.2" ${s}/>`,
    7: `<path d="M5 18c4-3 8 2 12-1s8 2 12-1 8 2 13-1v4c-5 3-9-2-13 1s-8-2-12 1-8-2-12 1z" ${s} opacity=".85"/><circle cx="14" cy="11" r="1.6" ${s}/><circle cx="30" cy="10" r="1.3" ${s}/>`,
  };
  return `<svg viewBox="0 0 46 28" aria-hidden="true">${shapes[type]}</svg>`;
}

const nowTimeStr = () => store.nowTime();
const ynText = (e) => YN.filter(([k]) => e[k]).map(([, l]) => l);

/**
 * Quick-add (or edit) sheet. Only the Bristol type is needed: tap a type, tap Save.
 */
export function openGutSheet(entry = null, { date = todayKey(), onSaved } = {}) {
  const e = entry ? structuredClone(entry) : { date, time: nowTimeStr(), bristol: null, urgency: 0, straining: false, incomplete: false, pain: 0, bloating: 0, relieved: false, blood: false, mucus: false, tags: [], notes: '' };
  const body = el(`
    <form class="gut-form" autocomplete="off">
      <div class="gut-when">
        <label class="field"><span>Date</span><input class="input num" type="date" data-date max="${todayKey()}"></label>
        <label class="field"><span>Time</span><input class="input num" type="time" data-time></label>
      </div>
      <div class="list-h" style="margin-top:6px">Bristol stool type</div>
      <div class="bristol-grid" role="radiogroup" aria-label="Bristol stool type">${BRISTOL.map((b) => `
        <button type="button" class="bristol ${b.group}" role="radio" aria-checked="false" data-bristol="${b.type}" aria-label="Type ${b.type}: ${esc(b.name)}">
          <span class="bristol-n">${b.type}</span><span class="bristol-ic">${bristolIcon(b.type)}</span>
          <span class="bristol-t"><b>${esc(b.name)}</b><small>${esc(b.desc)}</small></span>
        </button>`).join('')}</div>
      <div class="list-h">Urgency</div>
      <div class="seg gut-seg" role="radiogroup" aria-label="Urgency">${URGENCY.map((u, i) => `<button type="button" role="radio" data-urgency="${i}">${i} ${esc(u)}</button>`).join('')}</div>
      <div class="chips gut-chips" style="margin-top:4px">${YN.map(([k, l]) => `<button type="button" class="chip" data-yn="${k}" aria-pressed="false">${esc(l)}</button>`).join('')}</div>
      <div class="gut-banner" data-blood-banner hidden role="alert">${esc(BLOOD_BANNER)}</div>
      <div class="gut-sliders">
        <label class="field"><span>Abdominal pain <b class="num" data-pain-v>0</b>/10</span><input type="range" min="0" max="10" step="1" data-pain aria-label="Abdominal pain 0 to 10"></label>
        <label class="field"><span>Bloating <b class="num" data-bloat-v>0</b>/10</span><input type="range" min="0" max="10" step="1" data-bloat aria-label="Bloating 0 to 10"></label>
      </div>
      <div class="list-h">Context</div>
      <div class="chips gut-chips" style="margin-top:0">${TAGS.map((t) => `<button type="button" class="chip" data-tag="${t.key}" aria-pressed="false">${esc(t.label)}</button>`).join('')}</div>
      <label class="field" style="margin-top:12px"><span>Notes</span><textarea class="input gut-notes" rows="2" data-notes placeholder="Anything else worth remembering"></textarea></label>
    </form>`);
  const foot = el(`<div class="btns">${entry ? '<button class="btn danger" type="button" data-del>Delete</button>' : ''}<button class="btn go" type="button" data-save>${entry ? 'Save' : 'Save entry'}</button></div>`);
  const sheet = openSheet({ title: entry ? 'Edit gut entry' : 'Gut log', body, foot, tall: true });

  const dateIn = $(body, '[data-date]'), timeIn = $(body, '[data-time]');
  dateIn.value = e.date; timeIn.value = e.time || '';
  const pain = $(body, '[data-pain]'), bloat = $(body, '[data-bloat]');
  pain.value = e.pain || 0; bloat.value = e.bloating || 0;
  $(body, '[data-notes]').value = e.notes || '';

  const paint = () => {
    $$(body, '[data-bristol]').forEach((b) => b.setAttribute('aria-checked', String(Number(b.dataset.bristol) === e.bristol)));
    $$(body, '[data-urgency]').forEach((b) => b.setAttribute('aria-checked', String(Number(b.dataset.urgency) === (e.urgency || 0))));
    $$(body, '[data-yn]').forEach((b) => b.setAttribute('aria-pressed', String(!!e[b.dataset.yn])));
    $$(body, '[data-tag]').forEach((b) => b.setAttribute('aria-pressed', String((e.tags || []).includes(b.dataset.tag))));
    $(body, '[data-blood-banner]').hidden = !e.blood;
    $(body, '[data-pain-v]').textContent = pain.value;
    $(body, '[data-bloat-v]').textContent = bloat.value;
    $(foot, '[data-save]').disabled = !e.bristol;
  };
  $$(body, '[data-bristol]').forEach((b) => (b.onclick = () => { e.bristol = Number(b.dataset.bristol); navigator.vibrate?.(8); paint(); }));
  $$(body, '[data-urgency]').forEach((b) => (b.onclick = () => { e.urgency = Number(b.dataset.urgency); paint(); }));
  $$(body, '[data-yn]').forEach((b) => (b.onclick = () => { e[b.dataset.yn] = !e[b.dataset.yn]; paint(); }));
  $$(body, '[data-tag]').forEach((b) => (b.onclick = () => {
    const t = b.dataset.tag;
    e.tags = (e.tags || []).includes(t) ? e.tags.filter((x) => x !== t) : [...(e.tags || []), t];
    paint();
  }));
  pain.oninput = paint;
  bloat.oninput = paint;
  paint();

  $(foot, '[data-save]').onclick = async () => {
    if (!e.bristol) return toast('Pick a stool type');
    Object.assign(e, {
      date: dateIn.value || todayKey(),
      time: timeIn.value || nowTimeStr(),
      pain: Number(pain.value), bloating: Number(bloat.value),
      notes: $(body, '[data-notes]').value.trim(),
    });
    const saved = await store.saveGut(e);
    changed();
    sheet.close();
    toast(entry ? 'Gut entry updated' : `Logged type ${saved.bristol}`, entry ? undefined : { label: 'Undo', run: async () => { await store.deleteGut(saved.id); changed(); } });
    onSaved?.(saved);
  };
  const del = $(foot, '[data-del]');
  if (del) del.onclick = async () => {
    if (!(await confirmSheet('Delete this gut entry?', 'Delete'))) return;
    await store.deleteGut(entry.id);
    changed();
    sheet.close();
    toast('Gut entry deleted', { label: 'Undo', run: async () => { await store.saveGut(entry); changed(); } });
  };
  return sheet;
}

/** The Gut log row on Today: today's count, the last type, a quick + button. */
export function gutTodayCard(getDate) {
  const card = el(`
    <section class="card gut-today" aria-label="Gut log">
      <div class="gut-banner" data-gt-blood hidden role="alert">${esc(BLOOD_BANNER)}</div>
      <div class="row">
        <a class="gut-link" href="#/gut" aria-label="Open Gut log">
          <span class="gut-today-ic" data-gt-ic>${bristolIcon(4)}</span>
          <span style="min-width:0"><span class="gut-title">Gut log</span><span class="gut-sub" data-gt-sub></span></span>
        </a>
        <button class="iconbtn add" type="button" data-gut-add aria-label="Log a bowel movement">${icons.plus}</button>
      </div>
    </section>`);
  $(card, '[data-gut-add]').onclick = () => openGutSheet(null, { date: getDate() > todayKey() ? todayKey() : getDate() });
  async function refresh() {
    const date = getDate();
    const all = await store.getGut();
    const day = all.filter((x) => x.date === date).sort(newestFirst);
    const recentBlood = all.some((x) => x.blood && x.date >= addDays(todayKey(), -29));
    $(card, '[data-gt-blood]').hidden = !recentBlood;
    const last = day[0];
    $(card, '[data-gt-sub]').innerHTML = day.length
      ? `<b>${day.length} today</b> · last ${esc(last.time || '')} · type ${last.bristol} (${GROUP_LABEL[groupOf(last.bristol)].toLowerCase()})`
      : 'Nothing logged today · tap + to add';
    const ic = $(card, '[data-gt-ic]');
    ic.className = `gut-today-ic ${last ? groupOf(last.bristol) : ''}`;
    ic.innerHTML = bristolIcon(last ? last.bristol : 4);
  }
  return { el: card, refresh };
}

const fmt1 = (v) => (v === null || v === undefined ? '—' : (Math.round(v * 10) / 10).toString());
const shortDate = (k) => parseKey(k).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

/** The Gut log page. */
export function mountGut(view) {
  view.innerHTML = '';
  let weekEnd = todayKey();
  let range = '30';
  let from = addDays(todayKey(), -29), to = todayKey();

  const top = el(`
    <div class="meal-top">
      <a class="iconbtn" href="#/today" data-back aria-label="Back to Today">${icons.back}</a>
      <div style="min-width:0;flex:1"><h1 class="title">Gut log</h1><div class="muted">Bowel movements, symptoms and possible food triggers</div></div>
      <button class="iconbtn add" type="button" data-gut-add aria-label="Log a bowel movement">${icons.plus}</button>
    </div>`);
  $(top, '[data-back]').onclick = (ev) => { if (window.__prevRoute === 'today') { ev.preventDefault(); history.back(); } };
  $(top, '[data-gut-add]').onclick = () => openGutSheet();
  const banner = el(`<div class="gut-banner big" data-blood role="alert" hidden><b>${esc(BLOOD_BANNER)}</b><small data-blood-when></small></div>`);
  const week = el(`
    <section class="tr-card gut-week" aria-label="Weekly summary">
      <div class="row"><div class="tr-card-h" style="margin:0">Weekly summary</div><span class="spacer"></span>
        <button class="iconbtn" type="button" data-wprev aria-label="Previous 7 days">${icons.back}</button>
        <button class="iconbtn" type="button" data-wnext aria-label="Next 7 days">${icons.next}</button></div>
      <div class="muted small" data-wspan></div>
      <div class="gut-stats">
        <div><b class="num" data-perday>0</b><span>per day</span></div>
        <div><b class="num" data-pain>—</b><span>avg pain</span></div>
        <div><b class="num" data-bloat>—</b><span>avg bloating</span></div>
        <div><b class="num" data-urg>0</b><span>days with urgency</span></div>
      </div>
      <div class="gut-dist" data-dist></div>
      <div class="gut-split" data-split></div>
    </section>`);
  const trig = el(`
    <section class="tr-card" aria-label="Possible triggers">
      <div class="tr-card-h">Possible triggers</div>
      <p class="note" style="margin-top:0">Foods logged 6–48 hours before loose stools (types 6–7), ranked by how much more often they came before loose than before normal ones (types 3–5). A pattern to look into, not a diagnosis.</p>
      <div data-trig></div>
    </section>`);
  const hist = el(`
    <section aria-label="History">
      <div class="row" style="margin:22px 2px 10px"><h2 class="tr-h" style="margin:0">History</h2><span class="spacer"></span><button class="btn sm" type="button" data-csv>Export CSV</button></div>
      <div class="seg" role="tablist" aria-label="Date range">
        <button role="tab" type="button" data-range="7">7 days</button><button role="tab" type="button" data-range="30">30 days</button><button role="tab" type="button" data-range="all">All</button><button role="tab" type="button" data-range="custom">Dates</button>
      </div>
      <div class="gut-when" data-custom hidden>
        <label class="field"><span>From</span><input class="input num" type="date" data-from></label>
        <label class="field"><span>To</span><input class="input num" type="date" data-to></label>
      </div>
      <div class="muted small" data-hcount style="margin:2px 4px 8px"></div>
      <section class="card" style="padding:4px 14px"><div data-list></div></section>
      <p class="hint">Tap an entry to edit it, swipe left to delete.</p>
    </section>`);
  view.append(top, banner, week, trig, hist);

  $(week, '[data-wprev]').onclick = () => { weekEnd = addDays(weekEnd, -7); refresh(); };
  $(week, '[data-wnext]').onclick = () => { weekEnd = addDays(weekEnd, 7) > todayKey() ? todayKey() : addDays(weekEnd, 7); refresh(); };
  $$(hist, '[data-range]').forEach((b) => (b.onclick = () => {
    range = b.dataset.range;
    if (range === '7') { from = addDays(todayKey(), -6); to = todayKey(); }
    if (range === '30') { from = addDays(todayKey(), -29); to = todayKey(); }
    if (range === 'all') { from = '0000-01-01'; to = '9999-12-31'; }
    if (range === 'custom') { $(hist, '[data-from]').value = from > '0001' ? from : addDays(todayKey(), -29); $(hist, '[data-to]').value = to < '9999' ? to : todayKey(); from = $(hist, '[data-from]').value; to = $(hist, '[data-to]').value; }
    refresh();
  }));
  $(hist, '[data-from]').onchange = (ev) => { from = ev.target.value || '0000-01-01'; refresh(); };
  $(hist, '[data-to]').onchange = (ev) => { to = ev.target.value || '9999-12-31'; refresh(); };
  $(hist, '[data-csv]').onclick = async () => {
    const all = await store.getGut();
    if (!all.length) return toast('No gut entries yet');
    const name = `pithos-gut-log-${todayKey()}.csv`;
    const blob = new Blob(['﻿' + gutCsv(all)], { type: 'text/csv' });
    const f = new File([blob], name, { type: 'text/csv' });
    if (navigator.canShare?.({ files: [f] }) && /iPhone|iPad|iPod/.test(navigator.userAgent)) {
      try { await navigator.share({ files: [f], title: name }); return; } catch (err) { if (err.name === 'AbortError') return; }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    toast('Gut log exported');
  };

  async function refresh() {
    const [all, foods] = await Promise.all([store.getGut(), (await import('./db.js')).getAll('entries')]);
    // Blood banner: anything in the last 30 days
    const bloodDays = [...new Set(all.filter((x) => x.blood && x.date >= addDays(todayKey(), -29)).map((x) => x.date))].sort();
    banner.hidden = !bloodDays.length;
    $(banner, '[data-blood-when]').textContent = bloodDays.length ? `Logged on ${bloodDays.map(shortDate).join(', ')}.` : '';

    // Weekly summary
    const s = weekSummary(all, weekEnd);
    $(week, '[data-wspan]').textContent = `${shortDate(s.from)} – ${shortDate(s.to)} · ${s.count} ${s.count === 1 ? 'entry' : 'entries'}`;
    $(week, '[data-wnext]').disabled = weekEnd >= todayKey();
    $(week, '[data-perday]').textContent = fmt1(s.perDay);
    $(week, '[data-pain]').textContent = fmt1(s.avgPain);
    $(week, '[data-bloat]').textContent = fmt1(s.avgBloating);
    $(week, '[data-urg]').textContent = `${s.urgencyDays}/7`;
    const maxN = Math.max(1, ...Object.values(s.dist));
    $(week, '[data-dist]').innerHTML = BRISTOL.map((b) => `
      <div class="gut-dcol" title="Type ${b.type}: ${s.dist[b.type]}"><span class="num">${s.dist[b.type] || ''}</span><i class="${b.group}" style="height:${s.dist[b.type] ? Math.max(8, (s.dist[b.type] / maxN) * 100) : 3}%"></i><small>${b.type}</small></div>`).join('');
    $(week, '[data-split]').innerHTML = ['hard', 'normal', 'loose'].map((g) => `<div class="gut-pill ${g}"><b class="num">${s.pct[g]}%</b><span>${GROUP_LABEL[g]} <small>${g === 'hard' ? '1–2' : g === 'normal' ? '3–5' : '6–7'}</small></span></div>`).join('');

    // Possible triggers (all history)
    const t = triggers(all, foods);
    $(trig, '[data-trig]').innerHTML = t.looseN < 2
      ? `<p class="empty">Needs at least 2 loose entries with food logged in the 2 days before (${t.looseN} so far).</p>`
      : t.rows.length
        ? `<table class="gut-table"><thead><tr><th>Food</th><th>Before loose</th><th>Before normal</th></tr></thead><tbody>${t.rows.map((r) => `
            <tr><td>${esc(r.name)}</td><td class="num">${r.loose}/${t.looseN} <small>${Math.round(r.loosePct * 100)}%</small></td><td class="num">${r.normal}/${t.normalN} <small>${Math.round(r.normalPct * 100)}%</small></td></tr>`).join('')}</tbody></table>`
        : '<p class="empty">No food stands out yet: nothing comes before loose stools noticeably more often than before normal ones.</p>';

    // History
    $$(hist, '[data-range]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.range === range)));
    $(hist, '[data-custom]').hidden = range !== 'custom';
    const shown = all.filter((x) => x.date >= from && x.date <= to).sort(newestFirst);
    $(hist, '[data-hcount]').textContent = `${shown.length} ${shown.length === 1 ? 'entry' : 'entries'}${range === 'all' ? '' : range === 'custom' ? ` · ${shortDate(from)} – ${shortDate(to)}` : ` in the last ${range} days`}`;
    const list = $(hist, '[data-list]');
    list.innerHTML = shown.length ? '' : '<p class="empty">No entries in this period. Tap + to log one.</p>';
    for (const x of shown) {
      const g = groupOf(x.bristol);
      const flags = [x.urgency ? `Urgency: ${URGENCY[x.urgency].toLowerCase()}` : '', ...ynText(x), x.pain ? `Pain ${x.pain}` : '', x.bloating ? `Bloating ${x.bloating}` : '', ...(x.tags || []).map((k) => TAGS.find((tg) => tg.key === k)?.label || k)].filter(Boolean);
      const before = g === 'normal' ? [] : foodsBefore(x, foods);
      const names = [...new Map(before.map((f) => [f.name.toLowerCase(), f.name])).values()];
      const row = el(`
        <div class="gut-row" role="button" tabindex="0" data-gut-id="${x.id}">
          <span class="gut-type ${g}"><b>${x.bristol}</b>${bristolIcon(x.bristol)}</span>
          <span class="gut-main">
            <span class="gut-line"><b>${esc(shortDate(x.date))} · ${esc(x.time || '')}</b> <span class="gut-g ${g}">${GROUP_LABEL[g]}</span>${x.blood ? ' <span class="gut-g blood">Blood</span>' : ''}</span>
            ${flags.length ? `<span class="gut-flags">${esc(flags.join(' · '))}</span>` : ''}
            ${x.notes ? `<span class="gut-notes-t">${esc(x.notes)}</span>` : ''}
            ${g !== 'normal' ? `<span class="gut-foods" data-foods><b>Foods 6–48 h before:</b> ${names.length ? esc(names.join(', ')) : '<i>none logged</i>'}</span>` : ''}
          </span>
        </div>`);
      const open = () => openGutSheet(x);
      row.onclick = open;
      row.onkeydown = (ev) => { if (ev.key === 'Enter') open(); };
      list.appendChild(swipeToDelete(row, {
        onDelete: async () => {
          await store.deleteGut(x.id);
          changed();
          toast('Gut entry deleted', { label: 'Undo', run: async () => { await store.saveGut(x); changed(); } });
        },
      }));
    }
  }
  return { refresh };
}
