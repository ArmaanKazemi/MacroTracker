// Apple Health sync via Apple Shortcuts.
// Web apps can't access HealthKit, so the app opens a Shortcut (built once by
// the user) with the day's nutrition as JSON; the Shortcut writes it to Health.
// Only amounts not sent before are included, so tapping Send twice never
// double-counts.
import * as db from './db.js';
import * as store from './store.js';
import { totals } from './nutrients.js';
import { todayKey } from './ui.js';

// [our key, Apple Health type (as named in Shortcuts' "Log Health Sample"), unit, decimals]
export const HEALTH_FIELDS = [
  ['kcal', 'Dietary Energy', 'kcal', 0],
  ['protein', 'Protein', 'g', 1],
  ['carbs', 'Carbohydrates', 'g', 1],
  ['fat', 'Total Fat', 'g', 1],
  ['sugars', 'Dietary Sugar', 'g', 1],
  ['satfat', 'Saturated Fat', 'g', 1],
  ['water', 'Water', 'mL', 0],
  ['fibre', 'Fiber', 'g', 1],
  ['sodium', 'Sodium', 'mg', 0],
  ['potassium', 'Potassium', 'mg', 0],
  ['calcium', 'Calcium', 'mg', 0],
  ['magnesium', 'Magnesium', 'mg', 0],
  ['iron', 'Iron', 'mg', 1],
  ['zinc', 'Zinc', 'mg', 1],
  ['vitC', 'Vitamin C', 'mg', 1],
  ['vitA', 'Vitamin A', 'mcg', 0],
  ['vitD', 'Vitamin D', 'mcg', 1],
  ['vitK', 'Vitamin K', 'mcg', 0],
  ['vitB12', 'Vitamin B12', 'mcg', 1],
  ['folate', 'Folate', 'mcg', 0],
  ['iodine', 'Iodine', 'mcg', 0],
  ['selenium', 'Selenium', 'mcg', 0],
];
export const CORE_KEYS = ['kcal', 'protein', 'carbs', 'fat', 'water'];
export const DEFAULT_SHORTCUT = 'Pithos to Health';

const round = (v, d) => Math.round(v * 10 ** d) / 10 ** d;

async function getSent() {
  return (await db.get('kv', 'healthSent')) || {};
}

/** Current day totals in Health units, keyed like HEALTH_FIELDS. */
export async function dayTotals(date) {
  const [entries, water] = await Promise.all([store.entriesFor(date), store.waterFor(date)]);
  const t = totals(entries);
  const out = {};
  for (const [key] of HEALTH_FIELDS) out[key] = key === 'water' ? water.reduce((s, w) => s + w.ml, 0) : t[key]?.value || 0;
  return out;
}

/**
 * What would be sent now: current totals minus what was already sent for that day.
 * `reduced` lists nutrients that went DOWN since the last send (Health can't be
 * reduced from here, so those need fixing in the Health app).
 */
export async function pending(date) {
  const now = await dayTotals(date);
  const sent = (await getSent())[date]?.totals || {};
  const delta = {};
  const reduced = [];
  let any = false;
  for (const [key, , , d] of HEALTH_FIELDS) {
    const diff = round((now[key] || 0) - (sent[key] || 0), d);
    if (diff < 0) reduced.push(key);
    delta[key] = Math.max(0, diff);
    if (delta[key] > 0) any = true;
  }
  const record = (await getSent())[date];
  return { now, delta, reduced, any, lastSentAt: record?.at || null };
}

function payloadDate(date) {
  // Today: the current time. Past days: midday, so the samples land on the right day.
  if (date === todayKey()) {
    const d = new Date();
    return `${date} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
  return `${date} 12:00`;
}

export function shortcutURL(name, payload) {
  return `shortcuts://run-shortcut?name=${encodeURIComponent(name)}&input=text&text=${encodeURIComponent(JSON.stringify(payload))}`;
}

/** Send the not-yet-sent amounts for `date` to the Shortcut and remember them as sent. */
export async function send(date) {
  const settings = await store.getSettings();
  const name = settings.health?.shortcut || DEFAULT_SHORTCUT;
  const p = await pending(date);
  const payload = { date: payloadDate(date), ...p.delta };
  const all = await getSent();
  await db.put('kv', { date, record: all[date] || null }, 'healthSentPrev');
  all[date] = { totals: p.now, at: Date.now() };
  await db.put('kv', all, 'healthSent');
  openURL(shortcutURL(name, payload));
  return payload;
}

/** "It didn't arrive": forget the last send so the same amounts can be sent again. */
export async function undoLastSend() {
  const prev = await db.get('kv', 'healthSentPrev');
  if (!prev) return false;
  const all = await getSent();
  if (prev.record) all[prev.date] = prev.record;
  else delete all[prev.date];
  await db.put('kv', all, 'healthSent');
  await db.del('kv', 'healthSentPrev');
  return true;
}

export async function canUndo(date) {
  const prev = await db.get('kv', 'healthSentPrev');
  return !!prev && prev.date === date;
}

function openURL(url) {
  if (typeof window.__fuelOpenURL === 'function') return window.__fuelOpenURL(url); // test hook
  window.location.href = url;
}
