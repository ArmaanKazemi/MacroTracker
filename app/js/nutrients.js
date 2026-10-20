// Nutrient definitions shared across the app.
// Values in food records are always "per 100 g" (or per 100 ml) in the unit listed here.
// A value of null means "no data" and must never be treated as zero.

export const MACROS = [
  { key: 'protein', label: 'Protein', unit: 'g', kcalPerG: 4 },
  { key: 'carbs', label: 'Carbs', unit: 'g', kcalPerG: 4 },
  { key: 'fat', label: 'Fat', unit: 'g', kcalPerG: 9 },
];

// "Of which" sub-values shown under their macro (like a UK label). Both are
// daily limits: UK reference intakes, editable in Settings.
export const SUBS = [
  { key: 'sugars', parent: 'carbs', label: 'Sugars', of: 'of which sugars', unit: 'g', limit: 90 },
  { key: 'satfat', parent: 'fat', label: 'Saturates', of: 'of which saturates', unit: 'g', limit: 20 },
];
export const SUB_KEYS = SUBS.map((s) => s.key);

// Default daily targets and upper limits (US adult male; all editable in Settings).
// kind 'target' = aim to reach it; kind 'limit' = stay under it (sodium).
// upperNote marks upper limits that only apply to part of the intake (supplements,
// fortified foods, preformed vitamin A). `ulPart` says which part is counted
// towards the limit: 'supplements' (supplement doses only) or 'retinol' (preformed
// vitamin A, from foods that give it separately).
export const MICROS = [
  // Vitamins
  { key: 'vitA', label: 'Vitamin A', unit: 'µg', target: 900, upper: 3000, ulPart: 'retinol', upperNote: "Applies to preformed vitamin A (retinol) only. Beta-carotene from plants doesn't count." },
  { key: 'vitC', label: 'Vitamin C', unit: 'mg', target: 90, upper: 2000 },
  { key: 'vitD', label: 'Vitamin D', unit: 'µg', target: 15, upper: 100 },
  { key: 'vitE', label: 'Vitamin E', unit: 'mg', target: 15, upper: 1000, ulPart: 'supplements', upperNote: 'Applies to supplements only.' },
  { key: 'vitK', label: 'Vitamin K', unit: 'µg', target: 120, upper: null },
  { key: 'vitB1', label: 'Thiamin (B1)', unit: 'mg', target: 1.2, upper: null },
  { key: 'vitB2', label: 'Riboflavin (B2)', unit: 'mg', target: 1.3, upper: null },
  { key: 'vitB3', label: 'Niacin (B3)', unit: 'mg', target: 16, upper: 35, ulPart: 'supplements', upperNote: 'Applies to supplements and fortified foods only.' },
  { key: 'vitB5', label: 'Pantothenic acid (B5)', unit: 'mg', target: 5, upper: null },
  { key: 'vitB6', label: 'Vitamin B6', unit: 'mg', target: 1.3, upper: 100 },
  { key: 'vitB7', label: 'Biotin (B7)', unit: 'µg', target: 30, upper: null },
  { key: 'folate', label: 'Folate (B9)', unit: 'µg', target: 400, upper: 1000, ulPart: 'supplements', upperNote: 'Applies to folic acid from supplements and fortified foods only.' },
  { key: 'vitB12', label: 'Vitamin B12', unit: 'µg', target: 2.4, upper: null },
  { key: 'choline', label: 'Choline', unit: 'mg', target: 550, upper: 3500 },
  // Minerals
  { key: 'sodium', label: 'Sodium', unit: 'mg', target: null, upper: 2300, kind: 'limit' },
  { key: 'potassium', label: 'Potassium', unit: 'mg', target: 3400, upper: null },
  { key: 'calcium', label: 'Calcium', unit: 'mg', target: 1000, upper: 2500 },
  { key: 'magnesium', label: 'Magnesium', unit: 'mg', target: 400, upper: 350, ulPart: 'supplements', upperNote: 'Applies to supplements only.' },
  { key: 'iron', label: 'Iron', unit: 'mg', target: 8, upper: 45 },
  { key: 'zinc', label: 'Zinc', unit: 'mg', target: 11, upper: 40 },
  { key: 'iodine', label: 'Iodine', unit: 'µg', target: 150, upper: 1100 },
  { key: 'selenium', label: 'Selenium', unit: 'µg', target: 55, upper: 400 },
  { key: 'phosphorus', label: 'Phosphorus', unit: 'mg', target: 700, upper: 4000 },
  { key: 'copper', label: 'Copper', unit: 'mg', target: 0.9, upper: 10 },
  { key: 'manganese', label: 'Manganese', unit: 'mg', target: 2.3, upper: 11 },
  { key: 'chromium', label: 'Chromium', unit: 'µg', target: 35, upper: null },
  { key: 'molybdenum', label: 'Molybdenum', unit: 'µg', target: 45, upper: 2000 },
  { key: 'chloride', label: 'Chloride', unit: 'mg', target: 2300, upper: 3600 },
  { key: 'fluoride', label: 'Fluoride', unit: 'mg', target: 4, upper: 10 },
  // Fibre & fats
  { key: 'fibre', label: 'Fibre', unit: 'g', target: 38, upper: null },
  { key: 'ala', label: 'Omega-3 ALA', unit: 'g', target: 1.6, upper: null },
  { key: 'epadha', label: 'EPA + DHA', unit: 'mg', target: 250, upper: null },
];
// Bump when the default targets change so saved settings pick up the new values.
// (Adding nutrients doesn't need a bump: new keys get their defaults on load.)
export const MICROS_VERSION = 2;

export const MICRO_KEYS = MICROS.map((m) => m.key);
export const MICRO_BY_KEY = Object.fromEntries(MICROS.map((m) => [m.key, m]));

// Display grouping (Settings, Nutrients, food details).
export const MICRO_GROUPS = [
  { key: 'vitamins', label: 'Vitamins', keys: ['vitA', 'vitC', 'vitD', 'vitE', 'vitK', 'vitB1', 'vitB2', 'vitB3', 'vitB5', 'vitB6', 'vitB7', 'folate', 'vitB12', 'choline'] },
  { key: 'minerals', label: 'Minerals', keys: ['sodium', 'potassium', 'calcium', 'magnesium', 'iron', 'zinc', 'iodine', 'selenium', 'phosphorus', 'copper', 'manganese', 'chromium', 'molybdenum', 'chloride', 'fluoride'] },
  { key: 'other', label: 'Fibre & fats', keys: ['fibre', 'ala', 'epadha'] },
].map((g) => ({ ...g, items: g.keys.map((k) => MICRO_BY_KEY[k]) }));

// Tracked-nutrient presets. Core = the original 17.
export const CORE_MICROS = ['vitA', 'vitC', 'vitD', 'vitK', 'vitB12', 'folate', 'sodium', 'potassium', 'calcium', 'magnesium', 'iron', 'zinc', 'iodine', 'selenium', 'fibre', 'ala', 'epadha'];
export const TRACK_PRESETS = [
  { key: 'core', label: 'Core', keys: CORE_MICROS },
  { key: 'extended', label: 'Extended', keys: [...CORE_MICROS, 'vitE', 'choline', 'vitB6', 'vitB1', 'vitB2', 'vitB3', 'phosphorus'] },
  { key: 'all', label: 'Everything', keys: MICRO_KEYS },
];

/** Tracked micronutrient definitions (in display order) for a settings object. */
export function trackedMicros(settings) {
  const on = new Set(settings?.tracked || CORE_MICROS);
  return MICROS.filter((m) => on.has(m.key));
}
/** Display groups limited to tracked nutrients (empty groups dropped). */
export function trackedGroups(settings) {
  const on = new Set(settings?.tracked || CORE_MICROS);
  return MICRO_GROUPS.map((g) => ({ ...g, items: g.items.filter((m) => on.has(m.key)) })).filter((g) => g.items.length);
}
/** First day a nutrient counts in stats (null = always). */
export function trackedSince(settings, key) {
  return settings?.trackedSince?.[key] || null;
}

// Stored alongside the nutrients but never shown: preformed vitamin A, used only
// for vitamin A's upper limit.
export const AUX_KEYS = ['retinol'];
export const ALL_KEYS = ['kcal', 'protein', 'carbs', 'fat', ...SUB_KEYS, ...MICRO_KEYS, ...AUX_KEYS];

// Recommended share of the day's calories for each meal [low, high].
export const MEAL_SHARE = { breakfast: [0.25, 0.35], lunch: [0.3, 0.4], dinner: [0.3, 0.4], snacks: [0.05, 0.15] };

export const MEALS = [
  { key: 'breakfast', label: 'Breakfast' },
  { key: 'lunch', label: 'Lunch' },
  { key: 'dinner', label: 'Dinner' },
  { key: 'snacks', label: 'Snacks' },
];

export function defaultSettings() {
  return {
    kcal: 2200,
    protein: 160,
    carbs: 220,
    fat: 75,
    sugars: 90,
    satfat: 20,
    water: 2500,
    micros: Object.fromEntries(MICROS.map((m) => [m.key, m.target])),
    upper: Object.fromEntries(MICROS.map((m) => [m.key, m.upper])),
    microsVersion: MICROS_VERSION,
    tracked: [...CORE_MICROS],
    trackedSince: {},
    health: { enabled: false, shortcut: 'Pithos to Health' },
    theme: 'system',
  };
}

/**
 * Status of a micronutrient total against its target / upper limit.
 * `limitValue` is the part of the intake that counts towards the upper limit
 * (see ulPart; null = can't tell, so never flagged). Defaults to the total.
 * Returns { status: 'red'|'amber'|'green', pill: 'low'|'mid'|'ok', label }.
 */
export function microStatus(def, value, target, upper, limitValue = def.ulPart ? null : value) {
  // Limits (sodium): the aim is to stay under, so there's no "getting there" —
  // green while under the limit (showing how much of it is used), red once over.
  if (def.kind === 'limit') {
    if (!upper) return { status: 'green', pill: 'ok', label: 'OK' };
    const p = value / upper;
    if (p > 1) return { status: 'red', pill: 'low', label: 'Over limit' };
    return { status: 'green', pill: 'ok', label: `${Math.round(p * 100)}% of limit` };
  }
  if (upper && limitValue !== null && limitValue > upper) return { status: 'red', pill: 'low', label: 'Over upper limit' };
  if (!target) return { status: 'green', pill: 'ok', label: 'Met' };
  const p = value / target;
  if (p >= 1) return { status: 'green', pill: 'ok', label: 'Met' };
  if (p >= 0.5) return { status: 'amber', pill: 'mid', label: `${Math.round(p * 100)}%` };
  return { status: 'red', pill: 'low', label: 'Low' };
}

/**
 * The part of a list of entries that counts towards a nutrient's upper limit:
 * everything, supplement doses only, or preformed vitamin A (retinol). A food that
 * doesn't give retinol separately from total vitamin A adds nothing to the limit,
 * so it can never trigger the warning on its own.
 */
export function limitPart(def, entries) {
  const sum = (list, k) => list.reduce((s, e) => s + (scale(e.per100, e.amount)[k] || 0), 0);
  if (def.ulPart === 'supplements') return sum(entries.filter((e) => e.meal === 'supplements'), def.key);
  if (def.ulPart === 'retinol') return sum(entries, 'retinol');
  return sum(entries, def.key);
}

export function macroKcal(p, c, f) {
  return (Number(p) || 0) * 4 + (Number(c) || 0) * 4 + (Number(f) || 0) * 9;
}

/** Empty nutrient object, every value "no data". */
export function emptyNutrients() {
  return Object.fromEntries(ALL_KEYS.map((k) => [k, null]));
}

/** Normalise any partial nutrient object into a full one (unknown -> null). */
export function normNutrients(src = {}) {
  const out = emptyNutrients();
  for (const k of ALL_KEYS) {
    const v = src[k];
    out[k] = v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v);
  }
  return out;
}

/**
 * Fill "no data" sugars, saturates and micronutrients from a linked (similar) food.
 * Returns { per100, estimated: [keys filled from the link] }.
 */
export function applyLink(per100, linked) {
  const out = normNutrients(per100);
  const estimated = [];
  if (!linked) return { per100: out, estimated };
  for (const k of [...SUB_KEYS, ...MICRO_KEYS]) {
    if (out[k] === null && linked[k] !== null && linked[k] !== undefined) {
      out[k] = linked[k];
      estimated.push(k);
    }
  }
  return { per100: out, estimated };
}

/** Scale per-100 values to an amount (g or ml). */
export function scale(per100, amount) {
  const f = (Number(amount) || 0) / 100;
  const out = {};
  for (const k of ALL_KEYS) out[k] = per100[k] === null || per100[k] === undefined ? null : per100[k] * f;
  return out;
}

/**
 * Sum logged entries. For each nutrient returns { value, missing } where
 * missing = number of entries with no data for it.
 */
export function totals(entries) {
  const out = Object.fromEntries(ALL_KEYS.map((k) => [k, { value: 0, missing: 0 }]));
  for (const e of entries) {
    const n = scale(e.per100, e.amount);
    for (const k of ALL_KEYS) {
      if (n[k] === null) out[k].missing++;
      else out[k].value += n[k];
    }
  }
  return out;
}

export function fmt(v, unit) {
  if (v === null || v === undefined) return '—';
  const a = Math.abs(v);
  let s;
  if (unit === 'kcal') s = Math.round(v).toLocaleString('en-GB');
  else if (a >= 100) s = Math.round(v).toLocaleString('en-GB');
  else if (a >= 10) s = (Math.round(v * 10) / 10).toString();
  else s = (Math.round(v * 10) / 10).toString();
  return s;
}
