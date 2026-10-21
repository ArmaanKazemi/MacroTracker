// Trends: calories, macros, water and every tracked nutrient over time, with a
// smoothed trend line, period changes, a daily score and nutrient coverage.
import { el, esc, $, $$, icons, animateNumber, addDays, parseKey, todayKey } from './ui.js';
import { MACROS, SUBS, totals, fmt, microStatus, limitPart, trackedMicros, trackedSince } from './nutrients.js';
import * as store from './store.js';
import * as db from './db.js';

export const RANGES = [
  { key: '1W', days: 7 }, { key: '1M', days: 30 }, { key: '3M', days: 91 },
  { key: '6M', days: 182 }, { key: '1Y', days: 365 }, { key: 'All', days: null },
];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const short = (k) => { const d = parseKey(k); return `${d.getDate()} ${MON[d.getMonth()]}`; };
const longDate = (k) => { const d = parseKey(k); return `${WD[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]}`; };
const STORE_KEY = 'pithos-trends';

/** Everything that can be charted. kind: 'goal' (aim for it), 'target' (reach it), 'limit' (stay under). */
function metrics(settings) {
  const list = [
    { key: 'kcal', label: 'Calories', unit: 'kcal', goal: settings.kcal, kind: 'goal' },
    ...MACROS.map((m) => ({ key: m.key, label: m.label, unit: 'g', goal: settings[m.key], kind: m.key === 'protein' ? 'target' : 'goal' })),
    ...SUBS.map((s) => ({ key: s.key, label: s.label, unit: 'g', goal: settings[s.key] ?? s.limit, kind: 'limit' })),
    { key: 'water', label: 'Water', unit: 'ml', goal: settings.water, kind: 'target' },
    ...trackedMicros(settings).map((m) => ({
      key: m.key, label: m.label, unit: m.unit, def: m, kind: m.kind === 'limit' ? 'limit' : 'target',
      goal: m.kind === 'limit' ? settings.upper?.[m.key] ?? m.upper : settings.micros[m.key] || m.target,
    })),
  ];
  return list;
}
const fmtV = (m, v) => (v === null || v === undefined ? '—' : m.unit === 'kcal' || m.unit === 'ml' || Math.abs(v) >= 100 ? Math.round(v).toLocaleString('en-GB') : fmt(v));
const unitText = (m) => (m.unit === 'ml' ? 'ml' : m.unit);

// ---------- maths ----------
/** Exponentially smoothed trend (about a 7-day window), like a weight trend line. */
function trend(values) {
  const a = 2 / (7 + 1);
  let t = null;
  return values.map((v) => (v === null ? t : (t = t === null ? v : t + a * (v - t))));
}
/** Round chart bounds to friendly numbers. */
function niceStep(span) {
  const raw = span / 3;
  const p = 10 ** Math.floor(Math.log10(raw || 1));
  const n = raw / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}
/** Smooth path through points (Catmull-Rom as cubic Béziers). */
function smooth(pts) {
  if (!pts.length) return '';
  let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d;
}

/**
 * Score for one day (0–100): how close it got to each goal. Calories by closeness to
 * the goal, protein and tracked nutrients by how much of the target was reached
 * (capped at 100%), limits (sugars, saturates, sodium) full marks until passed.
 */
export function dayScore(t, list, settings, date) {
  const parts = [];
  const close = (v, g) => Math.max(0, 1 - Math.abs(v - g) / g);
  const reach = (v, g) => Math.min(1, v / g);
  const under = (v, g) => (v <= g ? 1 : Math.max(0, 1 - (v - g) / g));
  if (settings.kcal) parts.push(close(t.kcal.value, settings.kcal));
  if (settings.protein) parts.push(reach(t.protein.value, settings.protein));
  for (const s of SUBS) { const g = settings[s.key] ?? s.limit; if (g) parts.push(under(t[s.key].value, g)); }
  for (const m of trackedMicros(settings)) {
    const since = trackedSince(settings, m.key);
    if (since && date < since) continue;
    const upper = settings.upper?.[m.key] ?? m.upper;
    if (m.kind === 'limit') { if (upper) parts.push(under(t[m.key].value, upper)); continue; }
    const target = settings.micros[m.key] || m.target;
    if (!target) continue;
    const lim = limitPart(m, list);
    parts.push(upper && lim > upper ? 0.5 : reach(t[m.key].value, target));
  }
  return parts.length ? Math.round((parts.reduce((a, b) => a + b, 0) / parts.length) * 100) : 0;
}

// ---------- page ----------
export function mountTrends(view) {
  view.innerHTML = '';
  let pref = {};
  try { pref = JSON.parse(localStorage.getItem(STORE_KEY) || '{}'); } catch { /* private mode */ }
  let range = RANGES.find((r) => r.key === pref.range)?.key || '1M';
  let metricKey = pref.metric || 'kcal';
  let scoreDays = pref.scoreDays === 30 ? 30 : 7;
  const remember = () => { try { localStorage.setItem(STORE_KEY, JSON.stringify({ range, metric: metricKey, scoreDays })); } catch { /* private mode */ } };

  const top = el(`<div class="topbar trends-top"><h1 class="title">Trends</h1><span class="spacer"></span>
    <label class="tr-pick"><select data-metric aria-label="What to chart"></select><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10l5 5 5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></label>
    <a class="iconbtn gear" href="#/settings" aria-label="Settings">${icons.settings}</a></div>`);
  const main = el(`
    <section class="tr-card tr-main" aria-label="Chart">
      <div class="tr-stats">
        <div><div class="tr-l" data-l1>Average</div><div class="tr-v"><b class="num" data-avg>—</b> <span data-u></span></div></div>
        <div><div class="tr-l" data-l2>Difference</div><div class="tr-v"><b class="num" data-diff>—</b> <span data-u2></span></div></div>
      </div>
      <div class="tr-range" data-span></div>
      <div class="tr-chart" data-chart></div>
      <div class="tr-ranges" role="tablist" aria-label="Time range">${RANGES.map((r) => `<button type="button" role="tab" data-r="${r.key}">${r.key}</button>`).join('')}</div>
      <div class="tr-legend" data-legend></div>
    </section>`);
  const insightsH = el('<h2 class="tr-h">Insights &amp; data</h2>');
  const changes = el('<section class="tr-card" aria-label="Changes"><div class="tr-card-h" data-ch-title>Changes</div><div data-changes></div></section>');
  const score = el(`
    <section class="tr-card" aria-label="Daily score">
      <div class="tr-card-h row"><span>Average daily score</span><span class="spacer"></span>
        <div class="tr-mini-seg" role="tablist"><button type="button" role="tab" data-sd="7">7 days</button><button type="button" role="tab" data-sd="30">30 days</button></div></div>
      <div class="tr-score"><b class="num" data-score>0</b><span>%</span><span class="tr-delta" data-score-delta></span></div>
      <div class="tr-bars" data-bars></div>
      <div class="tr-trio">
        <div><b class="num" data-logged>0</b><span>Days logged</span></div>
        <div><b class="num" data-streak>0</b><span>Day streak</span></div>
        <div><b class="num" data-ontarget>0</b><span>On target</span></div>
      </div>
      <p class="note" style="margin-bottom:0">How close each day came to your calorie goal, protein, sugar and saturates limits and every tracked nutrient.</p>
    </section>`);
  const best = el(`
    <div class="tr-two">
      <section class="tr-card"><div class="tr-card-h c-green">Strongest</div><div data-strong></div></section>
      <section class="tr-card"><div class="tr-card-h c-red">Needs attention</div><div data-weak></div></section>
    </div>`);
  const coverH = el('<h2 class="tr-h">Nutrient coverage<small>Average per logged day against your daily target. Tap one to chart it.</small></h2>');
  const cover = el('<section class="tr-card" aria-label="Nutrient coverage"><div data-cover></div></section>');
  view.append(top, main, insightsH, changes, score, best, coverH, cover);

  const sel = $(top, '[data-metric]');
  sel.onchange = () => { metricKey = sel.value; remember(); refresh(); };
  $$(main, '[data-r]').forEach((b) => (b.onclick = () => { range = b.dataset.r; remember(); refresh(); }));
  $$(score, '[data-sd]').forEach((b) => (b.onclick = () => { scoreDays = Number(b.dataset.sd); remember(); refresh(); }));

  async function refresh() {
    const settings = await store.getSettings();
    const ms = metrics(settings);
    const m = ms.find((x) => x.key === metricKey) || ms[0];
    metricKey = m.key;
    sel.innerHTML = [['Energy & macros', ms.filter((x) => ['kcal', 'protein', 'carbs', 'fat', 'sugars', 'satfat'].includes(x.key))],
      ['Water', ms.filter((x) => x.key === 'water')], ['Tracked nutrients', ms.filter((x) => x.def)]]
      .filter(([, l]) => l.length).map(([g, l]) => `<optgroup label="${g}">${l.map((x) => `<option value="${x.key}">${esc(x.label)}</option>`).join('')}</optgroup>`).join('');
    sel.value = m.key;
    $$(main, '[data-r]').forEach((b) => b.setAttribute('aria-selected', b.dataset.r === range));
    $$(score, '[data-sd]').forEach((b) => b.setAttribute('aria-selected', Number(b.dataset.sd) === scoreDays));

    // Load enough history for the chart, the previous period and the score.
    const today = todayKey();
    const all = await db.getAll('entries');
    const first = all.reduce((a, e) => (e.date < a ? e.date : a), today);
    const r = RANGES.find((x) => x.key === range);
    const days = r.days || Math.max(7, Math.round((parseKey(today) - parseKey(first)) / 864e5) + 1);
    const from = addDays(today, -(days - 1));
    const prevFrom = addDays(from, -days);
    const loadFrom = [prevFrom, addDays(today, -59)].sort()[0];
    const byDate = new Map();
    for (const e of all) if (e.date >= loadFrom && e.date <= today) { if (!byDate.has(e.date)) byDate.set(e.date, []); byDate.get(e.date).push(e); }
    const water = new Map();
    for (const w of await db.byDateRange('water', loadFrom, today)) water.set(w.date, (water.get(w.date) || 0) + w.ml);
    const dayCache = new Map();
    // A day counts as logged once it has food in it (supplements alone don't count).
    const day = (k) => {
      if (dayCache.has(k)) return dayCache.get(k);
      const list = byDate.get(k) || [];
      const logged = list.some((e) => e.meal !== 'supplements');
      const v = logged ? { list, t: totals(list) } : null;
      dayCache.set(k, v);
      return v;
    };
    const valueOf = (mm, k) => {
      if (mm.key === 'water') return water.get(k) || null;
      const d = day(k);
      if (!d) return null;
      const since = mm.def && trackedSince(settings, mm.key);
      if (since && k < since) return null;
      return d.t[mm.key].value;
    };
    const keys = Array.from({ length: days }, (_, i) => addDays(from, i));
    const series = keys.map((k) => ({ k, v: valueOf(m, k) }));
    const logged = series.filter((p) => p.v !== null);
    const avg = (arr) => (arr.length ? arr.reduce((s, p) => s + p.v, 0) / arr.length : null);
    const prev = Array.from({ length: days }, (_, i) => addDays(prevFrom, i)).map((k) => ({ k, v: valueOf(m, k) })).filter((p) => p.v !== null);
    const a = avg(logged), pa = avg(prev);

    // Header stats
    animateNumber($(main, '[data-avg]'), a ?? 0, (v) => (a === null ? '—' : fmtV(m, v)));
    $(main, '[data-u]').textContent = unitText(m);
    const diff = a !== null && pa !== null ? a - pa : null;
    $(main, '[data-l2]').textContent = diff !== null ? 'vs previous period' : 'vs goal';
    const d2 = diff ?? (a !== null && m.goal ? a - m.goal : null);
    $(main, '[data-diff]').textContent = d2 === null ? '—' : `${d2 > 0 ? '+' : d2 < 0 ? '−' : '±'}${fmtV(m, Math.abs(d2))}`;
    $(main, '[data-u2]').textContent = d2 === null ? '' : unitText(m);
    $(main, '[data-span]').textContent = `${short(from)} – ${short(today)} ${parseKey(today).getFullYear()} · ${logged.length} of ${days} days logged`;

    // Weekly points for long ranges, daily otherwise.
    const weekly = days > 92;
    const tr = trend(series.map((p) => p.v));
    let pts = series.map((p, i) => ({ k: p.k, v: p.v, t: tr[i] }));
    if (weekly) {
      const buckets = [];
      for (let i = 0; i < pts.length; i += 7) {
        const chunk = pts.slice(i, i + 7);
        const vals = chunk.filter((p) => p.v !== null);
        buckets.push({ k: chunk[0].k, end: chunk[chunk.length - 1].k, v: vals.length ? vals.reduce((s, p) => s + p.v, 0) / vals.length : null, t: chunk[chunk.length - 1].t });
      }
      pts = buckets;
    }
    drawChart($(main, '[data-chart]'), pts, m, { weekly, onScrub: (p) => {
      if (!p) { $(main, '[data-l1]').textContent = 'Average'; $(main, '[data-avg]').textContent = a === null ? '—' : fmtV(m, a); return; }
      $(main, '[data-l1]').textContent = weekly ? `Week of ${short(p.k)}` : longDate(p.k);
      $(main, '[data-avg]').textContent = p.v === null ? '—' : fmtV(m, p.v);
    } });
    $(main, '[data-legend]').innerHTML = `<span><i class="lg-bar"></i>${weekly ? 'Weekly average' : 'Daily'}</span><span><i class="lg-line"></i>Trend</span>${m.goal ? `<span><i class="lg-goal"></i>${m.kind === 'limit' ? 'Limit' : 'Goal'}</span>` : ''}`;

    // Changes: recent average vs the same number of days before it.
    $(changes, '[data-ch-title]').textContent = `${m.label} changes`;
    $(changes, '[data-changes]').innerHTML = [3, 7, 14, 30].map((n) => {
      const cur = Array.from({ length: n }, (_, i) => addDays(today, -i)).map((k) => ({ k, v: valueOf(m, k) })).filter((p) => p.v !== null);
      const bef = Array.from({ length: n }, (_, i) => addDays(today, -n - i)).map((k) => ({ k, v: valueOf(m, k) })).filter((p) => p.v !== null);
      const c = avg(cur), b = avg(bef);
      const dd = c !== null && b !== null ? c - b : null;
      const steady = dd !== null && Math.abs(dd) < (m.goal ? m.goal * 0.02 : 0.5);
      const dir = dd === null ? '' : steady ? 'Steady' : dd > 0 ? 'Increase' : 'Decrease';
      const spark = Array.from({ length: n * 2 }, (_, i) => valueOf(m, addDays(today, -(n * 2 - 1) + i)));
      return `<div class="tr-change"><span class="tr-cl">${n}-day</span>${sparkline(spark, dd === null ? '' : steady ? 'flat' : dd > 0 ? 'up' : 'down')}
        <span class="tr-cv num">${dd === null ? '<span class="muted">Not enough data</span>' : `${dd > 0 ? '+' : dd < 0 ? '−' : ''}${fmtV(m, Math.abs(dd))} ${unitText(m)}`}</span>
        <span class="tr-cd ${dir.toLowerCase()}">${dir ? `${arrow(dir)} ${dir}` : ''}</span></div>`;
    }).join('');

    // Daily score
    const sKeys = Array.from({ length: scoreDays }, (_, i) => addDays(today, -(scoreDays - 1) + i));
    const scores = sKeys.map((k) => { const d = day(k); return d ? dayScore(d.t, d.list, settings, k) : null; });
    const prevScores = Array.from({ length: scoreDays }, (_, i) => addDays(today, -(2 * scoreDays - 1) + i)).map((k) => { const d = day(k); return d ? dayScore(d.t, d.list, settings, k) : null; }).filter((x) => x !== null);
    const sc = scores.filter((x) => x !== null);
    const sAvg = sc.length ? Math.round(sc.reduce((x, y) => x + y, 0) / sc.length) : 0;
    animateNumber($(score, '[data-score]'), sAvg);
    const pAvg = prevScores.length ? Math.round(prevScores.reduce((x, y) => x + y, 0) / prevScores.length) : null;
    const sd = $(score, '[data-score-delta]');
    sd.hidden = !sc.length || pAvg === null || sAvg === pAvg;
    sd.className = `tr-delta ${sAvg >= (pAvg ?? 0) ? 'up' : 'down'}`;
    sd.textContent = pAvg === null ? '' : `${sAvg >= pAvg ? '↑' : '↓'} ${Math.abs(sAvg - pAvg)} vs previous ${scoreDays} days`;
    $(score, '[data-bars]').innerHTML = sKeys.map((k, i) => {
      const v = scores[i];
      const cls = v === null ? 'none' : v >= 80 ? 'green' : v >= 50 ? 'amber' : 'red';
      const lab = scoreDays === 7 ? WD[parseKey(k).getDay()].charAt(0) : (i % 5 === 4 || i === scoreDays - 1 ? parseKey(k).getDate() : '');
      return `<div class="tr-bar" title="${esc(longDate(k))}: ${v === null ? 'nothing logged' : v + '%'}"><i class="bg-${cls}" style="height:${v === null ? 4 : Math.max(6, v)}%"></i><span${k === today ? ' class="now"' : ''}>${lab}</span></div>`;
    }).join('');
    $(score, '[data-bars]').classList.toggle('dense', scoreDays === 30);
    $(score, '[data-logged]').textContent = `${sc.length}/${scoreDays}`;
    let streak = 0;
    for (let k = day(today) ? today : addDays(today, -1); day(k); k = addDays(k, -1)) streak++;
    $(score, '[data-streak]').textContent = streak;

    // Nutrient coverage over the score window (logged days, from when each was tracked).
    const tracked = trackedMicros(settings);
    const cov = tracked.map((mm) => {
      const target = mm.kind === 'limit' ? null : settings.micros[mm.key] || mm.target;
      const upper = settings.upper?.[mm.key] ?? mm.upper;
      const use = sKeys.filter((k) => day(k) && !(trackedSince(settings, mm.key) && k < trackedSince(settings, mm.key)));
      const n = use.length;
      const v = n ? use.reduce((s, k) => s + day(k).t[mm.key].value, 0) / n : null;
      const lim = n ? use.reduce((s, k) => s + limitPart(mm, day(k).list), 0) / n : null;
      const st = v === null ? null : microStatus(mm, v, target, upper, lim);
      const pct = v === null ? null : mm.kind === 'limit' ? (upper ? v / upper : null) : target ? v / target : null;
      return { m: mm, v, pct, st };
    });
    const withPct = cov.filter((c) => c.pct !== null && c.m.kind !== 'limit');
    const onTarget = cov.filter((c) => c.st && c.st.status === 'green').length;
    $(score, '[data-ontarget]').textContent = `${onTarget}/${tracked.length}`;
    const line = (c) => `<button type="button" class="tr-nl" data-chart-key="${c.m.key}"><span class="tr-badge">${esc(badge(c.m))}</span><span class="tr-nn">${esc(c.m.label)}</span><span class="num">${Math.round(c.pct * 100)}%</span></button>`;
    const sorted = [...withPct].sort((x, y) => y.pct - x.pct);
    $(best, '[data-strong]').innerHTML = sorted.slice(0, 3).map(line).join('') || '<p class="empty">Log a few days to see this.</p>';
    $(best, '[data-weak]').innerHTML = [...sorted].reverse().slice(0, 3).map(line).join('') || '<p class="empty">Nothing yet.</p>';
    $(cover, '[data-cover]').innerHTML = cov.length ? cov.map((c) => {
      const p = c.pct === null ? 0 : c.pct;
      const status = c.st ? c.st.status : 'none';
      return `<button type="button" class="tr-cov" data-chart-key="${c.m.key}">
        <span class="tr-badge">${esc(badge(c.m))}</span>
        <span class="tr-cov-main"><span class="tr-cov-top"><b>${esc(c.m.label)}</b><span class="muted num">${c.v === null ? 'no data' : `${fmt(c.v)} ${c.m.unit}/day`}</span></span>
          <span class="track thin"><span class="fill bg-${status}" style="transform:scaleX(${Math.min(1, p)})"></span></span></span>
        <span class="tr-cov-pct num ${status === 'red' ? 'c-red' : ''}">${c.pct === null ? '—' : `${Math.round(c.pct * 100)}%`}</span></button>`;
    }).join('') : '<p class="empty">No nutrients tracked. Choose some in Settings → Tracked nutrients.</p>';
    $$(view, '[data-chart-key]').forEach((b) => (b.onclick = () => { metricKey = b.dataset.chartKey; remember(); refresh(); window.scrollTo({ top: 0, behavior: 'smooth' }); }));
  }
  return { refresh };
}

function arrow(dir) {
  if (dir === 'Increase') return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 17l6-6 4 4 7-7M15 8h5v5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  if (dir === 'Decrease') return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7l6 6 4-4 7 7M15 16h5v-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h16M15 7l5 5-5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
}

/** Short tag for a nutrient: "D", "B12", "Ca". */
function badge(m) {
  const sym = { sodium: 'Na', potassium: 'K', calcium: 'Ca', magnesium: 'Mg', iron: 'Fe', zinc: 'Zn', iodine: 'I', selenium: 'Se', phosphorus: 'P', copper: 'Cu', manganese: 'Mn', chromium: 'Cr', molybdenum: 'Mo', chloride: 'Cl', fluoride: 'F', fibre: 'Fi', ala: 'ALA', epadha: 'EPA', folate: 'B9', choline: 'Ch' };
  if (sym[m.key]) return sym[m.key];
  return m.key.replace(/^vit/, '');
}

/** Tiny area sparkline for the changes rows. */
function sparkline(values, dir) {
  const W = 64, H = 22;
  const pts = values.map((v, i) => [i, v]).filter(([, v]) => v !== null);
  if (pts.length < 2) return `<svg class="tr-spark" viewBox="0 0 ${W} ${H}" aria-hidden="true"></svg>`;
  const vs = pts.map(([, v]) => v);
  const lo = Math.min(...vs), hi = Math.max(...vs);
  const x = (i) => (i / (values.length - 1)) * W;
  const y = (v) => (hi === lo ? H / 2 : H - 3 - ((v - lo) / (hi - lo)) * (H - 6));
  const sm = trend(values).map((v, i) => [i, v]).filter(([, v]) => v !== null).map(([i, v]) => [x(i), y(v)]);
  const d = smooth(sm);
  return `<svg class="tr-spark ${dir}" viewBox="0 0 ${W} ${H}" aria-hidden="true"><path class="a" d="${d} L${sm[sm.length - 1][0].toFixed(1)} ${H} L${sm[0][0].toFixed(1)} ${H}Z"/><path class="l" d="${d}"/></svg>`;
}

/** Bars for each day (or week), a smoothed trend line through them and a dashed goal line. Press and drag to read values. */
function drawChart(box, pts, m, { weekly, onScrub }) {
  const W = Math.max(280, Math.round(box.clientWidth || 340));
  const H = 200, padR = 44, padT = 10, padB = 24;
  const cw = W - padR, ch = H - padT - padB;
  const vals = pts.flatMap((p) => [p.v, p.t]).filter((v) => v !== null && v !== undefined);
  const top = Math.max(...vals, m.goal || 0, 1) * 1.08;
  const step = niceStep(top);
  const max = Math.ceil(top / step) * step;
  const y = (v) => padT + ch - (v / max) * ch;
  const n = pts.length;
  const slot = cw / n;
  const x = (i) => slot * i + slot / 2;
  const grid = [];
  for (let v = 0; v <= max + 1e-9; v += step) {
    grid.push(`<line class="g" x1="0" x2="${cw}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/><text class="yl" x="${W - 4}" y="${(y(v) + 4).toFixed(1)}">${v >= 10000 ? `${Math.round(v / 1000)}k` : fmtV(m, v)}</text>`);
  }
  const bw = Math.max(2, Math.min(22, slot * 0.62));
  const over = (v) => m.goal && v !== null && ((m.kind === 'limit' || m.kind === 'goal') && v > m.goal * (m.kind === 'goal' ? 1.1 : 1));
  const bars = pts.map((p, i) => (p.v === null ? '' : `<rect class="b${over(p.v) ? ' over' : ''}" x="${(x(i) - bw / 2).toFixed(1)}" y="${y(p.v).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(1.5, ch + padT - y(p.v)).toFixed(1)}" rx="${Math.min(4, bw / 2).toFixed(1)}"/>`)).join('');
  const tp = pts.map((p, i) => (p.t === null || p.t === undefined ? null : [x(i), y(p.t)])).filter(Boolean);
  const showDots = n <= 31;
  const dots = showDots ? pts.map((p, i) => (p.t === null || p.t === undefined || p.v === null ? '' : `<circle class="d" cx="${x(i).toFixed(1)}" cy="${y(p.t).toFixed(1)}" r="3.2"/>`)).join('') : '';
  const goal = m.goal ? `<line class="goal" x1="0" x2="${cw}" y1="${y(m.goal).toFixed(1)}" y2="${y(m.goal).toFixed(1)}"/>` : '';
  // About five evenly spaced date labels (every day for a week).
  const every = n <= 7 ? 1 : Math.ceil(n / 5);
  const xl = pts.map((p, i) => ((n - 1 - i) % every === 0 ? `<text class="xl" x="${x(i).toFixed(1)}" y="${H - 6}">${n <= 7 ? WD[parseKey(p.k).getDay()] : short(p.k)}</text>` : '')).join('');
  box.innerHTML = `<svg class="tr-svg" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${esc(m.label)} ${weekly ? 'by week' : 'by day'}">
    <g>${grid.join('')}</g>${goal}<g>${bars}</g>
    ${tp.length > 1 ? `<path class="tl" d="${smooth(tp)}"/>` : ''}${dots}<g>${xl}</g>
    <line class="cur" y1="${padT}" y2="${padT + ch}" x1="-10" x2="-10"/><circle class="curd" r="5" cx="-10" cy="-10"/></svg>`;
  if (!vals.length) box.insertAdjacentHTML('beforeend', '<p class="tr-empty">Nothing logged in this period yet.</p>');
  const svg = box.querySelector('svg');
  const cur = svg.querySelector('.cur'), curd = svg.querySelector('.curd');
  const at = (ev) => {
    const r = svg.getBoundingClientRect();
    const px = ((ev.clientX - r.left) / r.width) * W;
    const i = Math.max(0, Math.min(n - 1, Math.floor(px / slot)));
    const p = pts[i];
    cur.setAttribute('x1', x(i)); cur.setAttribute('x2', x(i));
    const cy = p.v !== null ? y(p.v) : -10;
    curd.setAttribute('cx', x(i)); curd.setAttribute('cy', cy);
    svg.classList.add('scrub');
    onScrub(p);
  };
  const end = () => { svg.classList.remove('scrub'); onScrub(null); };
  svg.addEventListener('pointerdown', (e) => { svg.setPointerCapture?.(e.pointerId); at(e); });
  svg.addEventListener('pointermove', (e) => { if (e.buttons || e.pointerType === 'mouse') at(e); });
  svg.addEventListener('pointerup', end);
  svg.addEventListener('pointercancel', end);
  svg.addEventListener('pointerleave', end);
}
