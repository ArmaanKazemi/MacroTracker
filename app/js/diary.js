// Food diary export: every logged food, day by day and meal by meal, as a CSV
// that opens in Numbers, Excel or Google Sheets. Pure (no DOM, no storage).
import { MEALS, SUBS, scale, totals, trackedMicros } from './nutrients.js';

const MEAL_ORDER = [...MEALS.map((m) => m.key), 'supplements'];
const MEAL_LABEL = { ...Object.fromEntries(MEALS.map((m) => [m.key, m.label])), supplements: 'Supplements' };

const r1 = (v) => (v === null || v === undefined || Number.isNaN(v) ? '' : String(Math.round(v * 10) / 10));
const r0 = (v) => (v === null || v === undefined || Number.isNaN(v) ? '' : String(Math.round(v)));
const cell = (v) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const amountText = (e) => (e.servingLabel && e.qty ? `${Math.round(e.qty * 100) / 100} × ${e.servingLabel}` : `${r1(e.amount)} ${e.unit || 'g'}`);

/**
 * entries: logged entries; water: water records ({date, ml}); settings: for the tracked nutrients.
 * Returns the CSV text: one row per food (Date, Meal, Food, Brand, Amount, kcal, macros,
 * sugars, saturates, then each tracked nutrient), and a "Day total" row after each day
 * (with that day's water).
 */
export function diaryCsv(entries, water = [], settings = {}) {
  const micros = trackedMicros(settings);
  const keys = ['kcal', 'protein', 'carbs', 'sugars', 'fat', 'satfat', ...micros.map((m) => m.key)];
  const sub = (k) => SUBS.find((s) => s.key === k);
  const head = ['Date', 'Meal', 'Food', 'Brand', 'Amount', 'Calories (kcal)', 'Protein (g)', 'Carbs (g)', `${sub('sugars').of} (g)`, 'Fat (g)', `${sub('satfat').of} (g)`,
    ...micros.map((m) => `${m.label} (${m.unit})`), 'Water (ml)'];
  const fmtVal = (k, v) => (k === 'kcal' ? r0(v) : r1(v));
  const waterBy = new Map();
  for (const w of water) waterBy.set(w.date, (waterBy.get(w.date) || 0) + (w.ml || 0));
  const dates = [...new Set([...entries.map((e) => e.date), ...waterBy.keys()])].sort();
  const rank = (m) => { const i = MEAL_ORDER.indexOf(m); return i < 0 ? MEAL_ORDER.length : i; };
  const rows = [head];
  for (const d of dates) {
    const day = entries.filter((e) => e.date === d).sort((a, b) => rank(a.meal) - rank(b.meal) || (a.ts || 0) - (b.ts || 0));
    for (const e of day) {
      const n = scale(e.per100 || {}, e.amount);
      rows.push([d, MEAL_LABEL[e.meal] || e.meal || '', e.name || '', e.brand || '', amountText(e), ...keys.map((k) => fmtVal(k, n[k])), '']);
    }
    const t = totals(day);
    rows.push([d, 'Day total', `${day.length} ${day.length === 1 ? 'item' : 'items'}`, '', '', ...keys.map((k) => fmtVal(k, t[k].value)), waterBy.has(d) ? r0(waterBy.get(d)) : '']);
  }
  return rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}
