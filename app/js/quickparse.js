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

// "2,100" is two thousand one hundred; "1,5" is one and a half.
const toNum = (s) => {
  const t = String(s);
  return Number(/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(t) ? t.replace(/,/g, '') : t.replace(',', '.'));
};
const keyOf = (w) => KEY_OF.get(w.toLowerCase().replace(/\s+/g, ' ')) || KEY_OF.get(w.toLowerCase().replace(/\s+/g, ''));

/** Convert a typed value to the nutrient's own unit (g ↔ mg ↔ µg). */
function convert(value, from, to) {
  if (!from || from === to || to === 'kcal') return value;
  const scale = { g: 1, mg: 1e-3, 'µg': 1e-6 };
  if (!(from in scale) || !(to in scale)) return value;
  return (value * scale[from]) / scale[to];
}

// Nutrients the app doesn't track: recognised so their numbers don't get attached
// to a neighbouring nutrient, then dropped (and listed as "not tracked").
const UNTRACKED = ['vitamin e', 'vit e', 'vitamin b6', 'vit b6', 'b6', 'vitamin b1', 'thiamin', 'thiamine', 'vitamin b2',
  'riboflavin', 'vitamin b3', 'niacin', 'pantothenic acid', 'vitamin b5', 'biotin', 'vitamin b7', 'phosphorus', 'copper',
  'manganese', 'chloride', 'chromium', 'molybdenum', 'fluoride', 'cholesterol', 'trans fats', 'trans fat', 'monounsaturated fat',
  'monounsaturated', 'monounsaturates', 'polyunsaturated fat', 'polyunsaturated', 'polyunsaturates', 'omega-6', 'omega 6',
  'caffeine', 'alcohol', 'starch', 'polyols', 'choline', 'water'];
const ALL_WORDS = [...KEY_OF.keys(), ...UNTRACKED, 'energy'].sort((a, b) => b.length - a.length)
  .map((w) => w.replace(/[+.]/g, '\\$&').replace(/[ -]/g, '[\\s-]*'));

// Rough per-meal ranges (in each nutrient's own unit) used to decide which word a number belongs to.
const RANGE = {
  kcal: [1, 5000], protein: [0, 250], carbs: [0, 400], fat: [0, 250], sugars: [0, 300], satfat: [0, 150], fibre: [0, 100],
  sodium: [0, 10000], salt: [0, 25], potassium: [1, 10000], magnesium: [1, 2000], calcium: [1, 5000], iron: [0.01, 100],
  zinc: [0.01, 100], vitC: [0.01, 3000], vitA: [1, 10000], vitD: [0.01, 250], vitK: [0.1, 2000], vitB12: [0.01, 1000],
  folate: [1, 3000], iodine: [1, 3000], selenium: [1, 1000], ala: [0.01, 50], epadha: [1, 10000],
};
const MASS = new Set(['g', 'mg', 'µg']);

// Words that mean the "nutrient" is really part of a food name ("protein powder").
const FOODISH_NEXT = /^(powder|bar|bars|shake|shakes|yog(h)?urt|pudding|bread|pasta|cookie|cookies|balls?|milk|drink|free|snaps?|crisps?|pots?|oats?|granola|cereal|flakes?|cake|pancakes?|wrap|bites?|noodles?|pizza|sauce)\b/i;

/** Split text into keyword, value and word tokens. */
function tokenize(text) {
  const re = new RegExp(
    `(\\d+(?:,\\d{3})+(?:\\.\\d+)?|\\d+(?:[.,]\\d+)?)(?:(p|c|f)(?![a-zµμ])|\\s*(kcal|kj|mg|mcg|µg|μg|ug|grams?|gr|g|kg|ml|l)(?![a-zµμ]))?` + // value
    `|(?<![a-z])(${ALL_WORDS.join('|')})(?![a-z])` + // nutrient word
    `|([^\\s\\d:=]+)`, 'gi'); // any other word
  const out = [];
  let m;
  while ((m = re.exec(text))) {
    if (m[1] !== undefined) {
      let unit = (m[2] || m[3] || '').toLowerCase() || null;
      if (unit === 'mcg' || unit === 'μg' || unit === 'ug') unit = 'µg';
      if (unit === 'gram' || unit === 'grams' || unit === 'gr') unit = 'g';
      let self = null, value = toNum(m[1]);
      if (unit === 'p' || unit === 'c' || unit === 'f') { self = { p: 'protein', c: 'carbs', f: 'fat' }[unit]; unit = 'g'; }
      if (unit === 'kcal') self = 'kcal';
      if (unit === 'kj') { self = 'kcal'; unit = 'kcal'; value /= 4.184; }
      out.push({ t: 'v', value, unit, self, text: m[0] });
    } else if (m[4] !== undefined) {
      const w = m[4].toLowerCase().replace(/[\s-]+/g, ' ');
      const key = w === 'energy' ? 'kcal' : keyOf(w) || keyOf(m[4]);
      out.push({ t: 'k', key: key || null, untracked: key ? null : w, text: m[0] });
    } else out.push({ t: 'w', text: m[0] });
  }
  // "protein powder", "fat free": the nutrient word is part of a food name.
  out.forEach((tk, i) => { if (tk.t === 'k' && out[i + 1]?.t === 'w' && FOODISH_NEXT.test(out[i + 1].text)) out[i] = { t: 'w', text: tk.text }; });
  // "of" between a value and a nutrient ("30g of protein") is filler.
  return out.filter((tk, i) => !(tk.t === 'w' && /^of$/i.test(tk.text) && out[i - 1]?.t === 'v' && out[i + 1]?.t === 'k'));
}

/** How well a value fits a nutrient word (higher is better; -Infinity = impossible). */
function fit(k, v) {
  if (v.unit === 'ml' || v.unit === 'l' || v.unit === 'kg') return -Infinity;
  if (k.untracked) return v.self ? -Infinity : 1;
  const key = k.key;
  if (v.self && v.self !== key) return -Infinity;
  const target = UNIT[key];
  let s = 1;
  if (v.unit) {
    if (v.unit === 'kcal') { if (key !== 'kcal') return -Infinity; s += 2; } else if (target === 'kcal') return -Infinity;
    else if (v.unit === target) s += 2;
    else if (MASS.has(v.unit) && MASS.has(target)) s += 0.5;
    else return -Infinity;
  }
  const val = key === 'salt' ? convert(v.value, v.unit || 'g', 'g') : convert(v.value, v.unit, target);
  const [lo, hi] = RANGE[key] || [0, Infinity];
  s += val >= lo && val <= hi ? 3 : -2;
  return s;
}

/**
 * Pull nutrient values out of a piece of text.
 * Each nutrient word is paired with the number right before or after it, choosing the
 * pairing that best fits units and sensible amounts and keeps one direction where possible.
 * Returns { nutrients: {key: value}, ignored: [untracked nutrient names], rest: leftover text }.
 */
export function extractNutrients(text) {
  const tk = tokenize(text);
  const n = tk.length;
  // best[i][d]: best score for tokens[0..i) with the last pair's direction d (0 none, 1 word→number, 2 number→word)
  const best = Array.from({ length: n + 1 }, () => [-Infinity, -Infinity, -Infinity]);
  const from = Array.from({ length: n + 1 }, () => [null, null, null]);
  best[0][0] = 0;
  for (let i = 0; i < n; i++) {
    for (let d = 0; d < 3; d++) {
      const cur = best[i][d];
      if (cur === -Infinity) continue;
      if (cur > best[i + 1][d]) { best[i + 1][d] = cur; from[i + 1][d] = { i, d, pair: false }; }
      const a = tk[i], b = tk[i + 1];
      if (!b) continue;
      let dir = 0, f = -Infinity;
      if (a.t === 'k' && b.t === 'v') { dir = 1; f = fit(a, b); } else if (a.t === 'v' && b.t === 'k') { dir = 2; f = fit(b, a); }
      if (f === -Infinity) continue;
      const sc = cur + f + (d === dir ? 1.5 : 0);
      if (sc > best[i + 2][dir]) { best[i + 2][dir] = sc; from[i + 2][dir] = { i, d, pair: true }; }
    }
  }
  let d = [0, 1, 2].reduce((x, y) => (best[n][y] > best[n][x] ? y : x), 0);
  const used = new Set();
  const pairs = [];
  for (let i = n; i > 0;) {
    const f = from[i][d];
    if (f.pair) { pairs.push([f.i, f.i + 1]); used.add(f.i).add(f.i + 1); }
    i = f.i; d = f.d;
  }
  const found = {};
  const ignored = [];
  const take = (key, v) => {
    if (key === 'salt') { found.sodium = convert(v.value, v.unit || 'g', 'g') * 400; return; }
    found[key] = key === 'kcal' ? v.value : convert(v.value, v.unit, UNIT[key]);
  };
  for (const [x, y] of pairs.reverse()) {
    const k = tk[x].t === 'k' ? tk[x] : tk[y];
    const v = tk[x].t === 'v' ? tk[x] : tk[y];
    if (k.untracked) ignored.push(k.untracked); else take(k.key, v);
  }
  // Self-describing values on their own: "877kcal", "35p".
  tk.forEach((t, i) => { if (!used.has(i) && t.t === 'v' && t.self) { take(t.self, t); used.add(i); } });
  const rest = tk.filter((t, i) => !used.has(i)).map((t) => t.text).join(' ');
  return { nutrients: found, ignored, rest: rest.replace(/\s+/g, ' ').trim() };
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
  // A comma between digits is a thousands separator ("2,100mg"), not a new item.
  const parts = text.split(/\n|;|(?<!\d),|,(?!\d{3}(?!\d))|\s\+\s|•/).map((s) => s.replace(/^\s*(?:[-*]|\d+[.)])\s+/, '').trim()).filter(Boolean);
  const out = [];
  for (const p of parts) {
    const { nutrients, rest, ignored } = extractNutrients(p);
    const onlyValues = (Object.keys(nutrients).length || ignored.length) && !rest.replace(/\b(of which|of|and|incl|including)\b/gi, '').replace(/[^a-z]/gi, '');
    if (onlyValues && out.length) out[out.length - 1] += ` ${p}`;
    else out.push(p);
  }
  return out;
}

/** Parse the whole box into items. */
export function parseQuickLog(text) {
  return splitItems(text).map((raw) => {
    const { nutrients, rest, ignored } = extractNutrients(raw);
    const a = extractAmount(rest);
    // Keep real words only: drop separators like "|" or "–" and label phrases like "of which".
    const name = a.rest.replace(/\bof which\b/gi, ' ').split(/\s+/).filter((w) => /[a-z0-9]/i.test(w)).join(' ')
      .replace(/^(of|with)\s+/i, '').replace(/[\s:–—-]+$/, '').trim();
    const typed = Object.keys(nutrients).length ? { ...nutrients } : null;
    // Only macros given? Work out calories from them.
    if (typed && typed.kcal === undefined && ['protein', 'carbs', 'fat'].some((k) => typed[k] !== undefined)) {
      typed.kcal = (typed.protein || 0) * 4 + (typed.carbs || 0) * 4 + (typed.fat || 0) * 9;
    }
    return { raw, name, amount: a.amount, unit: a.unit, count: a.count, countUnit: a.countUnit, typed, ignored };
  }).filter((it) => it.name || it.typed);
}
