// Nutrient definitions shared across the app.
// Values in food records are always "per 100 g" (or per 100 ml) in the unit listed here.
// A value of null means "no data" and must never be treated as zero.

export const MACROS = [
  { key: 'protein', label: 'Protein', unit: 'g', kcalPerG: 4 },
  { key: 'carbs', label: 'Carbs', unit: 'g', kcalPerG: 4 },
  { key: 'fat', label: 'Fat', unit: 'g', kcalPerG: 9 },
];

// Default daily targets and upper limits (all editable in Settings).
// kind 'target' = aim to reach it; kind 'limit' = stay under it (sodium).
// upperNote marks upper limits that only apply to supplements / fortified /
// preformed sources: food totals can't tell those apart, so they're shown but
// never flagged red.
export const MICROS = [
  { key: 'fibre', label: 'Fibre', unit: 'g', target: 38, upper: null },
  { key: 'potassium', label: 'Potassium', unit: 'mg', target: 3400, upper: null },
  { key: 'magnesium', label: 'Magnesium', unit: 'mg', target: 400, upper: 350, upperNote: 'from supplements only' },
  { key: 'folate', label: 'Folate', unit: 'µg', target: 400, upper: 1000, upperNote: 'from supplements / fortified foods' },
  { key: 'vitC', label: 'Vitamin C', unit: 'mg', target: 90, upper: 2000 },
  { key: 'vitA', label: 'Vitamin A', unit: 'µg', target: 900, upper: 3000, upperNote: 'preformed vitamin A only' },
  { key: 'vitK', label: 'Vitamin K', unit: 'µg', target: 120, upper: null },
  { key: 'iron', label: 'Iron', unit: 'mg', target: 8, upper: 45 },
  { key: 'zinc', label: 'Zinc', unit: 'mg', target: 11, upper: 40 },
  { key: 'calcium', label: 'Calcium', unit: 'mg', target: 1000, upper: 2500 },
  { key: 'vitD', label: 'Vitamin D', unit: 'µg', target: 15, upper: 100 },
  { key: 'vitB12', label: 'Vitamin B12', unit: 'µg', target: 2.4, upper: null },
  { key: 'iodine', label: 'Iodine', unit: 'µg', target: 150, upper: 1100 },
  { key: 'selenium', label: 'Selenium', unit: 'µg', target: 55, upper: 400 },
  { key: 'ala', label: 'Omega-3 ALA', unit: 'g', target: 1.6, upper: null },
  { key: 'epadha', label: 'EPA + DHA', unit: 'mg', target: 250, upper: null },
  { key: 'sodium', label: 'Sodium', unit: 'mg', target: null, upper: 2300, kind: 'limit' },
];
// Bump when the default targets change so saved settings pick up the new values.
export const MICROS_VERSION = 2;

export const MICRO_KEYS = MICROS.map((m) => m.key);

// Display grouping: vitamins, minerals, then fibre and omega-3 fats.
export const MICRO_GROUPS = [
  { key: 'vitamins', label: 'Vitamins', keys: ['vitA', 'vitC', 'vitD', 'vitK', 'vitB12', 'folate'] },
  { key: 'minerals', label: 'Minerals', keys: ['sodium', 'potassium', 'calcium', 'magnesium', 'iron', 'zinc', 'iodine', 'selenium'] },
  { key: 'other', label: 'Fibre & omega-3s', keys: ['fibre', 'ala', 'epadha'] },
].map((g) => ({ ...g, items: g.keys.map((k) => MICROS.find((m) => m.key === k)) }));
export const ALL_KEYS = ['kcal', 'protein', 'carbs', 'fat', ...MICRO_KEYS];

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
    water: 2500,
    micros: Object.fromEntries(MICROS.map((m) => [m.key, m.target])),
    upper: Object.fromEntries(MICROS.map((m) => [m.key, m.upper])),
    microsVersion: MICROS_VERSION,
    health: { enabled: false, shortcut: 'Pithos to Health' },
    theme: 'system',
  };
}

/**
 * Status of a micronutrient total against its target / upper limit.
 * Returns { status: 'red'|'amber'|'green', pill: 'low'|'mid'|'ok', label }.
 */
export function microStatus(def, value, target, upper) {
  if (def.kind === 'limit') {
    if (!upper) return { status: 'green', pill: 'ok', label: 'OK' };
    const p = value / upper;
    if (p >= 1) return { status: 'red', pill: 'low', label: 'Over limit' };
    if (p >= 0.9) return { status: 'amber', pill: 'mid', label: 'Near limit' };
    return { status: 'green', pill: 'ok', label: `${Math.round(p * 100)}% of limit` };
  }
  if (upper && !def.upperNote && value >= upper) return { status: 'red', pill: 'low', label: 'Over upper limit' };
  if (!target) return { status: 'green', pill: 'ok', label: 'Met' };
  const p = value / target;
  if (p >= 1) return { status: 'green', pill: 'ok', label: 'Met' };
  if (p >= 0.5) return { status: 'amber', pill: 'mid', label: `${Math.round(p * 100)}%` };
  return { status: 'red', pill: 'low', label: 'Low' };
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
 * Fill "no data" micronutrients from a linked (similar) food.
 * Returns { per100, estimated: [keys filled from the link] }.
 */
export function applyLink(per100, linked) {
  const out = normNutrients(per100);
  const estimated = [];
  if (!linked) return { per100: out, estimated };
  for (const k of MICRO_KEYS) {
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
