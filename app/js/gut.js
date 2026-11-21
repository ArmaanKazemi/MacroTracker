// Gut log: Bristol stool chart entries, weekly summary, links to the food log and
// a "possible triggers" ranking. Pure (no DOM, no storage) so it can be unit-tested.

export const BRISTOL = [
  { type: 1, name: 'Separate hard lumps', desc: 'Like nuts, hard to pass', group: 'hard' },
  { type: 2, name: 'Lumpy sausage', desc: 'Sausage-shaped but lumpy', group: 'hard' },
  { type: 3, name: 'Cracked sausage', desc: 'Sausage with cracks on the surface', group: 'normal' },
  { type: 4, name: 'Smooth snake', desc: 'Smooth and soft, like a snake', group: 'normal' },
  { type: 5, name: 'Soft blobs', desc: 'Soft blobs with clear edges', group: 'normal' },
  { type: 6, name: 'Mushy', desc: 'Fluffy, ragged edges, mushy', group: 'loose' },
  { type: 7, name: 'Watery', desc: 'Entirely liquid, no solid pieces', group: 'loose' },
];
export const URGENCY = ['None', 'Mild', 'Strong', 'Had to rush'];
export const TAGS = [
  { key: 'sleep', label: 'Poor sleep' },
  { key: 'stress', label: 'Stress' },
  { key: 'exercise', label: 'Exercise' },
  { key: 'travel', label: 'Travel' },
  { key: 'newfood', label: 'New or unusual food' },
  { key: 'other', label: 'Other' },
];
export const BLOOD_BANNER = 'Blood in stool: contact your GP.';

/** 'hard' (types 1–2), 'normal' (3–5) or 'loose' (6–7). */
export const groupOf = (type) => (type <= 2 ? 'hard' : type >= 6 ? 'loose' : 'normal');

const pad = (n) => String(n).padStart(2, '0');
const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** Local time in ms for a date ("YYYY-MM-DD") and optional time ("HH:MM"). */
export function toMs(date, time = '00:00') {
  const [y, m, d] = date.split('-').map(Number);
  const [h, mi] = (time || '00:00').split(':').map(Number);
  return new Date(y, m - 1, d, h || 0, mi || 0).getTime();
}
const addDays = (date, n) => { const [y, m, d] = date.split('-').map(Number); return keyOf(new Date(y, m - 1, d + n)); };

/** Newest first. */
export const newestFirst = (a, b) => toMs(b.date, b.time) - toMs(a.date, a.time) || (b.createdAt || 0) - (a.createdAt || 0);

/**
 * Summary of the entries in the 7 days ending on `end` (inclusive).
 * { days, from, to, count, perDay, dist: {1..7}, pct: {hard, normal, loose}, avgPain, avgBloating, urgencyDays, bloodDays }
 */
export function weekSummary(entries, end, days = 7) {
  const from = addDays(end, -(days - 1));
  const list = entries.filter((e) => e.date >= from && e.date <= end);
  const dist = Object.fromEntries(BRISTOL.map((b) => [b.type, 0]));
  const groups = { hard: 0, normal: 0, loose: 0 };
  for (const e of list) { dist[e.bristol] = (dist[e.bristol] || 0) + 1; groups[groupOf(e.bristol)]++; }
  const n = list.length;
  const pct = Object.fromEntries(Object.entries(groups).map(([k, v]) => [k, n ? Math.round((v / n) * 100) : 0]));
  const avg = (k) => (n ? list.reduce((s, e) => s + (Number(e[k]) || 0), 0) / n : null);
  return {
    days, from, to: end, count: n,
    perDay: n / days,
    dist, groups, pct,
    avgPain: avg('pain'),
    avgBloating: avg('bloating'),
    urgencyDays: new Set(list.filter((e) => (e.urgency || 0) >= 1).map((e) => e.date)).size,
    bloodDays: new Set(list.filter((e) => e.blood).map((e) => e.date)).size,
  };
}

/**
 * Foods logged 6–48 hours before a gut entry. A food with a time uses it; one without
 * (logged before times existed) counts if its date falls in the window.
 * Supplements are left out. Returns food entries, oldest first.
 */
export function foodsBefore(gut, foodEntries, { minH = 6, maxH = 48 } = {}) {
  const t = toMs(gut.date, gut.time);
  const lo = t - maxH * 3600e3, hi = t - minH * 3600e3;
  const loDate = keyOf(new Date(lo)), hiDate = keyOf(new Date(hi));
  return foodEntries.filter((f) => {
    if (f.meal === 'supplements') return false;
    if (f.time) { const ft = toMs(f.date, f.time); return ft >= lo && ft <= hi; }
    return f.date >= loDate && f.date <= hiDate;
  }).sort((a, b) => toMs(a.date, a.time || '12:00') - toMs(b.date, b.time || '12:00'));
}

const foodKey = (name) => String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * Foods ranked by how much more often they appear 6–48 h before loose (6–7) entries
 * than before normal (3–5) ones. Each food counts once per gut entry.
 * Returns { rows: [{ name, loose, normal, loosePct, normalPct, diff }], looseN, normalN }.
 * Only foods seen before at least `minLoose` loose entries are listed.
 */
export function triggers(gutEntries, foodEntries, { minLoose = 2, limit = 10 } = {}) {
  const loose = gutEntries.filter((e) => groupOf(e.bristol) === 'loose');
  const normal = gutEntries.filter((e) => groupOf(e.bristol) === 'normal');
  const count = (list) => {
    const m = new Map();
    for (const g of list) {
      const seen = new Map();
      for (const f of foodsBefore(g, foodEntries)) seen.set(foodKey(f.name), f.name);
      for (const [k, name] of seen) { const c = m.get(k) || { name, n: 0 }; c.n++; m.set(k, c); }
    }
    return m;
  };
  const L = count(loose), N = count(normal);
  const rows = [];
  for (const [k, { name, n }] of L) {
    if (n < minLoose) continue;
    const nn = N.get(k)?.n || 0;
    const loosePct = loose.length ? n / loose.length : 0;
    const normalPct = normal.length ? nn / normal.length : 0;
    rows.push({ name, loose: n, normal: nn, loosePct, normalPct, diff: loosePct - normalPct });
  }
  rows.sort((a, b) => b.diff - a.diff || b.loose - a.loose || a.name.localeCompare(b.name));
  return { rows: rows.filter((r) => r.diff > 0).slice(0, limit), looseN: loose.length, normalN: normal.length };
}

const cell = (v) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const yn = (v) => (v === true ? 'Yes' : v === false ? 'No' : '');

/** All gut entries as CSV, oldest first. */
export function gutCsv(entries) {
  const head = ['Date', 'Time', 'Bristol type', 'Category', 'Urgency (0-3)', 'Urgency', 'Straining', 'Incomplete emptying', 'Abdominal pain (0-10)', 'Bloating (0-10)', 'Pain relieved by BM', 'Blood', 'Mucus', 'Context', 'Notes'];
  const label = Object.fromEntries(TAGS.map((t) => [t.key, t.label]));
  const rows = [head, ...[...entries].sort((a, b) => -newestFirst(a, b)).map((e) => [
    e.date, e.time || '', e.bristol, groupOf(e.bristol), e.urgency ?? 0, URGENCY[e.urgency ?? 0], yn(e.straining), yn(e.incomplete),
    e.pain ?? 0, e.bloating ?? 0, yn(e.relieved), yn(e.blood), yn(e.mucus), (e.tags || []).map((t) => label[t] || t).join('; '), e.notes || '',
  ])];
  return rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}
