// Nutrient definitions shared across the app.
// Values in food records are always "per 100 g" (or per 100 ml) in the unit listed here.
// A value of null means "no data" and must never be treated as zero.

export const MACROS = [
  { key: 'protein', label: 'Protein', unit: 'g', kcalPerG: 4 },
  { key: 'carbs', label: 'Carbs', unit: 'g', kcalPerG: 4 },
  { key: 'fat', label: 'Fat', unit: 'g', kcalPerG: 9 },
];

// UK reference values (editable in Settings).
export const MICROS = [
  { key: 'fibre', label: 'Fibre', unit: 'g', target: 30 },
  { key: 'potassium', label: 'Potassium', unit: 'mg', target: 3500 },
  { key: 'magnesium', label: 'Magnesium', unit: 'mg', target: 300 },
  { key: 'folate', label: 'Folate', unit: 'µg', target: 200 },
  { key: 'vitC', label: 'Vitamin C', unit: 'mg', target: 40 },
  { key: 'vitA', label: 'Vitamin A', unit: 'µg', target: 700 },
  { key: 'vitK', label: 'Vitamin K', unit: 'µg', target: 70 },
  { key: 'iron', label: 'Iron', unit: 'mg', target: 8.7 },
  { key: 'zinc', label: 'Zinc', unit: 'mg', target: 9.5 },
  { key: 'calcium', label: 'Calcium', unit: 'mg', target: 700 },
  { key: 'vitD', label: 'Vitamin D', unit: 'µg', target: 10 },
];

export const MICRO_KEYS = MICROS.map((m) => m.key);
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
  };
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
