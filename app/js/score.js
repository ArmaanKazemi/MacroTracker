// Day score for the Today hero: how much of the day's targets has been met.
// Pure and read-only: it only looks at totals the app already works out.
//
// Each nutrient gets a status:
//   optimal: 100% of its target or more (and under any upper limit); under a limit (sodium)
//   good:    60–99%
//   low:     under 60%
//   over:    kcal, carbs or fat above 110% of goal; past an upper limit or a limit
// and a score out of 100: its % of target, capped at 100. kcal past its goal loses
// 2 points per % over; anything "over" a limit scores 0. The day score is the average.
import { MACROS, microStatus, limitPart, trackedMicros, trackedSince } from './nutrients.js';

export const GOOD_FROM = 60;
export const OVER_FROM = 110;

const capped = new Set(['kcal', 'carbs', 'fat']);

function judge(pct, key) {
  if (capped.has(key) && pct > OVER_FROM) return 'over';
  if (pct >= 100) return 'optimal';
  if (pct >= GOOD_FROM) return 'good';
  return 'low';
}

/**
 * @param {object} t        totals(entries) for the day
 * @param {Array}  entries  the day's entries (for upper limits that count only part of the intake)
 * @param {object} settings that day's settings (goals)
 * @param {string} date     YYYY-MM-DD (nutrients switched on later aren't judged)
 * @returns {{score:number, items:Array<{key,label,pct,status,points}>, counts:{optimal,good,low,over}}}
 */
export function dayScore(t, entries, settings, date) {
  const items = [];
  const kcalGoal = settings.kcal;
  if (kcalGoal) {
    const pct = (t.kcal.value / kcalGoal) * 100;
    const status = judge(pct, 'kcal');
    items.push({ key: 'kcal', label: 'Calories', pct, status, points: pct <= 100 ? pct : Math.max(0, 100 - (pct - 100) * 2) });
  }
  for (const m of MACROS) {
    const goal = settings[m.key];
    if (!goal) continue;
    const pct = (t[m.key].value / goal) * 100;
    const status = judge(pct, m.key);
    items.push({ key: m.key, label: m.label, pct, status, points: status === 'over' ? Math.max(0, 100 - (pct - 100) * 2) : Math.min(100, pct) });
  }
  for (const m of trackedMicros(settings)) {
    const since = trackedSince(settings, m.key);
    if (since && date < since) continue;
    const value = t[m.key]?.value ?? 0;
    const target = m.kind === 'limit' ? null : settings.micros?.[m.key] || m.target;
    const upper = settings.upper?.[m.key] ?? m.upper;
    const st = microStatus(m, value, target, upper, limitPart(m, entries));
    let status, pct, points;
    if (m.kind === 'limit') {
      pct = upper ? (value / upper) * 100 : 0;
      status = st.status === 'red' ? 'over' : 'optimal';
      points = status === 'over' ? 0 : 100;
    } else {
      pct = target ? (value / target) * 100 : 100;
      status = st.label === 'Over upper limit' ? 'over' : judge(pct, m.key);
      points = status === 'over' ? 0 : Math.min(100, pct);
    }
    items.push({ key: m.key, label: m.label, pct, status, points, limit: m.kind === 'limit' });
  }
  const counts = { optimal: 0, good: 0, low: 0, over: 0 };
  for (const i of items) counts[i.status]++;
  const score = items.length ? Math.round(items.reduce((s, i) => s + i.points, 0) / items.length) : 0;
  return { score, items, counts };
}
