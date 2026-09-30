// Quick log parser: turns free text like
//   "200g chicken breast, 2 eggs, 1 scoop impact whey"
//   "chicken wrap 450kcal 35p 40c 12f sodium 800mg"
// into items. Pure (no DOM, no storage) so it can be unit-tested.
import { MICROS } from './nutrients.js';

// Nutrient words people type, longest first so "saturated fat" beats "fat".
const WORDS = {
  kcal: ['kcal', 'kcals', 'calories', 'calorie', 'cals', 'cal'],
  protein: ['protein', 'prot', 'pro'],
  carbs: ['carbohydrates', 'carbohydrate', 'carbs', 'carb'],
  sugars: ['sugars', 'sugar'],
  satfat: ['saturated fat', 'saturates', 'saturated', 'sat fat', 'satfat', 'sats', 'sat'],
  fat: ['fats', 'fat'],
  fibre: ['fibre', 'fiber'],
  sodium: ['sodium', 'na'],
  salt: ['salt'],
  potassium: ['potassium'],
  magnesium: ['magnesium'],
  calcium: ['calcium'],
  iron: ['iron'],
  zinc: ['zinc'],
  folate: ['folate', 'folic acid'],
  vitA: ['vitamin a', 'vit a'],
  vitC: ['vitamin c', 'vit c'],
  vitD: ['vitamin d', 'vit d'],
  vitK: ['vitamin k', 'vit k'],
  vitB12: ['vitamin b12', 'vit b12', 'b12'],
  iodine: ['iodine'],
  selenium: ['selenium'],
  ala: ['omega-3 ala', 'omega 3', 'omega-3', 'ala'],
  epadha: ['epa+dha', 'epa + dha', 'epa/dha', 'epa', 'dha'],
};
const UNIT = { kcal: 'kcal', protein: 'g', carbs: 'g', sugars: 'g', satfat: 'g', fat: 'g', salt: 'g' };
for (const m of MICROS) UNIT[m.key] = m.unit;
const KEY_OF = new Map();
for (const [k, ws] of Object.entries(WORDS)) for (const w of ws) KEY_OF.set(w, k);
const KEYWORDS = [...KEY_OF.keys()].sort((a, b) => b.length - a.length).map((w) => w.replace(/[+.]/g, '\\$&').replace(/ /g, '\\s*'));
const KW = `(${KEYWORDS.join('|')})`;
const NUM = '(\\d+(?:[.,]\\d+)?)';
const MUNIT = '(kcal|g|mg|mcg|µg|ug)?';

const toNum = (s) => Number(String(s).replace(',', '.'));
const keyOf = (w) => KEY_OF.get(w.toLowerCase().replace(/\s+/g, ' ')) || KEY_OF.get(w.toLowerCase().replace(/\s+/g, ''));

/** Convert a typed value to the nutrient's own unit (g ↔ mg ↔ µg). */
function convert(value, from, to) {
  if (!from || from === to || to === 'kcal') return value;
  const scale = { g: 1, mg: 1e-3, mcg: 1e-6, 'µg': 1e-6, ug: 1e-6 };
  if (!(from in scale) || !(to in scale)) return value;
  return (value * scale[from]) / scale[to];
}

// Words that mean the "nutrient" is really part of a food name ("protein powder").
const FOODISH_NEXT = /^(powder|bar|bars|shake|shakes|yog(h)?urt|pudding|bread|pasta|cookie|cookies|balls?|ball|milk|drink|water|free|snap|snaps|crisps?|pot|pots|oats?|granola|cereal|flakes?|cake|pancakes?|wrap|bites?)\b/i;

/**
 * Pull nutrient values out of a piece of text.
 * Returns { nutrients: {key: value}, rest: text with the values removed }.
 */
export function extractNutrients(text) {
  const found = {};
  let rest = ` ${text} `;
  const take = (key, value, unit) => {
    if (key === 'salt') { found.sodium = convert(value, unit || 'g', 'g') * 400; return; }
    found[key] = convert(value, unit, UNIT[key]);
  };
  // "450 kcal", "35g protein", "800mg sodium"
  const valueFirst = () => { rest = rest.replace(new RegExp(`${NUM}\\s*${MUNIT}\\s*(?:of\\s+)?${KW}(?=\\s|$|[;:])`, 'gi'), (m, n, u, w, offset, str) => {
    const key = keyOf(w);
    if (!key) return m;
    const next = str.slice(offset + m.length).trim().split(/\s+/)[0] || '';
    if (FOODISH_NEXT.test(next)) return m; // "30g protein powder" is a food
    if ((u || '').toLowerCase() === 'kcal' && key !== 'kcal') return m;
    take(key, toNum(n), (u || '').toLowerCase() || null);
    return ' ';
  }); };
  // "kcal 450", "protein: 35g", "sodium 800mg"
  const wordFirst = () => { rest = rest.replace(new RegExp(`(^|\\s)${KW}\\s*[:=]?\\s*${NUM}\\s*${MUNIT}(?=\\s|$|[;:])`, 'gi'), (m, lead, w, n, u) => {
    const key = keyOf(w);
    if (!key) return m;
    take(key, toNum(n), (u || '').toLowerCase() || null);
    return lead + ' ';
  }); };
  // "kcal 300 protein 20" vs "300 kcal 20 protein": whichever style comes first wins,
  // otherwise the number between two words gets paired with the wrong one.
  const firstA = rest.search(new RegExp(`${NUM}\\s*${MUNIT}\\s*(?:of\\s+)?${KW}(?=\\s|$|[;:])`, 'i'));
  const firstB = rest.search(new RegExp(`(^|\\s)${KW}\\s*[:=]?\\s*${NUM}`, 'i'));
  if (firstB >= 0 && (firstA < 0 || firstB < firstA)) { wordFirst(); valueFirst(); } else { valueFirst(); wordFirst(); }
  // Shorthand "35p 40c 12f" (also "35gp"), only glued to the number.
  rest = rest.replace(/(^|\s)(\d+(?:[.,]\d+)?)g?(p|c|f)(?=\s|$)/gi, (m, lead, n, l) => {
    take({ p: 'protein', c: 'carbs', f: 'fat' }[l.toLowerCase()], toNum(n), 'g');
    return lead + ' ';
  });
  return { nutrients: found, rest: rest.replace(/\s+/g, ' ').trim() };
}

const COUNT_WORDS = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, half: 0.5, 'half a': 0.5 };
const SERVING_WORDS = 'scoops?|slices?|portions?|servings?|pieces?|pcs?|tbsp|tablespoons?|tsp|teaspoons?|cups?|handfuls?|bowls?|glass(?:es)?|cans?|bottles?|pots?|bars?|sachets?|packs?|tins?';

/** "slices" -> "slice", "glasses" -> "glass", "tablespoons" -> "tbsp". */
function servingWord(w) {
  const x = w.toLowerCase();
  if (/^tablespoons?$/.test(x)) return 'tbsp';
  if (/^teaspoons?$/.test(x)) return 'tsp';
  if (/^pcs?$/.test(x)) return 'piece';
  if (/^glass(es)?$/.test(x)) return 'glass';
  return x.replace(/s$/, '');
}

/** Amount from the remaining text: grams/ml, or a count with an optional serving word. */
export function extractAmount(text) {
  let rest = ` ${text} `;
  let amount = null, unit = null, count = null, countUnit = null;
  // 200g, 1.5 kg, 250 ml, 0.5 l, 200 grams
  rest = rest.replace(/(^|\s)(\d+(?:[.,]\d+)?)\s*(kg|g|grams?|gr|ml|millilit(?:re|er)s?|l|lit(?:re|er)s?)(?=\s|$)/i, (m, lead, n, u) => {
    const v = toNum(n);
    const uu = u.toLowerCase();
    if (/^kg/.test(uu)) { amount = v * 1000; unit = 'g'; } else if (/^(l|lit)/.test(uu)) { amount = v * 1000; unit = 'ml'; } else if (/^m/.test(uu)) { amount = v; unit = 'ml'; } else { amount = v; unit = 'g'; }
    return lead + ' ';
  });
  // x2 / 2x
  rest = rest.replace(/(^|\s)(?:x\s*(\d+(?:\.\d+)?)|(\d+(?:\.\d+)?)\s*x)(?=\s|$)/i, (m, lead, a, b) => { count = toNum(a || b); return lead + ' '; });
  // "2 scoops", "1/2 cup", "half a banana", "3 eggs"
  if (amount === null && count === null) {
    rest = rest.replace(new RegExp(`^\\s*(\\d+(?:[.,]\\d+)?|\\d+\\s*/\\s*\\d+|half a|half|an|a|one|two|three|four|five|six)\\s+(?:(${SERVING_WORDS})\\s+)?(?:of\\s+)?`, 'i'), (m, n, sw) => {
      if (/\//.test(n)) { const [x, y] = n.split('/').map(Number); count = x / y; } else count = COUNT_WORDS[n.toLowerCase()] ?? toNum(n);
      countUnit = sw ? servingWord(sw) : null;
      return ' ';
    });
  } else if (count !== null) {
    // "x2" plus a serving word: "impact whey scoop x2"
    const sw = rest.match(new RegExp(`\\b(${SERVING_WORDS})\\b`, 'i'));
    if (sw) { countUnit = servingWord(sw[1]); rest = rest.replace(sw[0], ' '); }
  }
  return { amount, unit, count, countUnit, rest: rest.replace(/\s+/g, ' ').trim() };
}

/** Split text into food items on new lines, commas, semicolons and " + ". Pieces that are only values join the item before. */
export function splitItems(text) {
  // Not " and ": it's inside too many food names (fish and chips, salt and vinegar).
  const parts = text.split(/\n|;|,|\s\+\s|•/).map((s) => s.replace(/^\s*(?:[-*]|\d+[.)])\s+/, '').trim()).filter(Boolean);
  const out = [];
  for (const p of parts) {
    const { nutrients, rest } = extractNutrients(p);
    const onlyValues = Object.keys(nutrients).length && !rest.replace(/[^a-z]/gi, '');
    if (onlyValues && out.length) out[out.length - 1] += ` ${p}`;
    else out.push(p);
  }
  return out;
}

/** Parse the whole box into items. */
export function parseQuickLog(text) {
  return splitItems(text).map((raw) => {
    const { nutrients, rest } = extractNutrients(raw);
    const a = extractAmount(rest);
    const name = a.rest.replace(/^(of|with)\s+/i, '').replace(/[\s:–—-]+$/, '').trim();
    const typed = Object.keys(nutrients).length ? { ...nutrients } : null;
    // Only macros given? Work out calories from them.
    if (typed && typed.kcal === undefined && ['protein', 'carbs', 'fat'].some((k) => typed[k] !== undefined)) {
      typed.kcal = (typed.protein || 0) * 4 + (typed.carbs || 0) * 4 + (typed.fat || 0) * 9;
    }
    return { raw, name, amount: a.amount, unit: a.unit, count: a.count, countUnit: a.countUnit, typed };
  }).filter((it) => it.name || it.typed);
}
