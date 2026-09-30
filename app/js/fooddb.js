// Generic food database (CoFID, or the bundled starter set) + Open Food Facts.
import { normNutrients, MICRO_KEYS } from './nutrients.js';

let loaded = null;
const state = { full: false, rows: [], byId: new Map(), aliases: {}, source: '' };

// CoFID calls raw poultry cuts "light meat" (breast) and "dark meat" (leg/thigh).
// Say so in the name, so searching "chicken breast" or "turkey thigh" finds them.
export function displayName(name) {
  if (!/^(chicken|turkey)\b/i.test(name)) return name;
  return name.replace(/\blight meat\b/i, 'light meat (breast)').replace(/\bdark meat\b/i, 'dark meat (leg/thigh)');
}

function rowToFood(fields, row) {
  const [id, rawName, group, ...vals] = row;
  const name = displayName(rawName);
  const n = {};
  fields.forEach((k, i) => (n[k] = vals[i]));
  return { id, name, group, per100: normNutrients(n), lower: name.toLowerCase() };
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(res.status);
  return res.json();
}

export function load() {
  if (loaded) return loaded;
  loaded = (async () => {
    const starter = await fetchJson('data/starter.json');
    const starterFoods = starter.foods.map((r) => rowToFood(starter.fields, r));
    for (const f of starterFoods) state.byId.set(f.id, f);
    let cofid = null;
    try {
      cofid = await fetchJson('data/cofid.json');
    } catch {
      /* not built yet - fall back to the starter set */
    }
    if (cofid && cofid.foods?.length) {
      state.full = true;
      state.source = cofid.source;
      state.aliases = cofid.aliases || {};
      state.rows = cofid.foods.map((r) => rowToFood(cofid.fields, r));
      for (const f of state.rows) state.byId.set(f.id, f);
    } else {
      state.source = starter.source;
      state.rows = starterFoods;
    }
    return state;
  })();
  return loaded;
}

export function info() {
  return { full: state.full, count: state.rows.length, source: state.source };
}

/** Look up a generic food by id; starter ids resolve to their CoFID match when available. */
export function lookup(id) {
  if (!id) return null;
  const alias = state.aliases[id];
  return (alias && state.byId.get(alias)) || state.byId.get(id) || null;
}

/** Simple ranked token search. Every query word must appear in the name. */
export function search(q, limit = 60) {
  const words = q.toLowerCase().split(/[\s,]+/).filter(Boolean);
  if (!words.length) return [];
  const out = [];
  for (const f of state.rows) {
    if (!words.every((w) => f.lower.includes(w))) continue;
    let score = 0;
    const first = f.lower.split(/[\s,]+/)[0];
    if (f.lower.startsWith(words[0])) score -= 20;
    if (first === words[0] || first === words[0] + 's') score -= 10;
    if (/\braw\b/.test(f.lower)) score -= 3;
    score += f.lower.length / 10;
    out.push([score, f]);
  }
  out.sort((a, b) => a[0] - b[0]);
  return out.slice(0, limit).map((x) => x[1]);
}

export function microCount(per100) {
  return MICRO_KEYS.filter((k) => per100[k] !== null).length;
}

// ---------------- Open Food Facts ----------------
const OFF = 'https://world.openfoodfacts.org';
const OFF_FIELDS = 'code,product_name,product_name_en,brands,nutriments,serving_size,serving_quantity,quantity,product_quantity_unit,nutrition_data_per';

// OFF stores minerals/vitamins in grams per 100 g. Convert to our units.
const OFF_MAP = [
  ['fibre', 'fiber', 1],
  ['potassium', 'potassium', 1000],
  ['magnesium', 'magnesium', 1000],
  ['calcium', 'calcium', 1000],
  ['iron', 'iron', 1000],
  ['zinc', 'zinc', 1000],
  ['vitC', 'vitamin-c', 1000],
  ['folate', 'folates', 1e6],
  ['vitA', 'vitamin-a', 1e6],
  ['vitK', 'vitamin-k', 1e6],
  ['vitD', 'vitamin-d', 1e6],
  ['vitB12', 'vitamin-b12', 1e6],
  ['iodine', 'iodine', 1e6],
  ['selenium', 'selenium', 1e6],
  ['ala', 'alpha-linolenic-acid', 1],
];

export function offToFood(p) {
  const n = p.nutriments || {};
  const num = (k) => {
    const v = n[k];
    return v === undefined || v === null || v === '' ? null : Number(v);
  };
  let kcal = num('energy-kcal_100g');
  if (kcal === null && num('energy_100g') !== null) kcal = num('energy_100g') / 4.184;
  const per100 = { kcal, protein: num('proteins_100g'), carbs: num('carbohydrates_100g'), fat: num('fat_100g'), sugars: num('sugars_100g'), satfat: num('saturated-fat_100g') };
  for (const [ours, theirs, mult] of OFF_MAP) {
    let v = num(`${theirs}_100g`);
    if (v === null && theirs === 'folates') v = num('vitamin-b9_100g');
    per100[ours] = v === null ? null : v * mult;
  }
  // UK labels give salt; sodium = salt / 2.5.
  const na = num('sodium_100g') ?? (num('salt_100g') === null ? null : num('salt_100g') / 2.5);
  per100.sodium = na === null ? null : na * 1000;
  const epa = num('eicosapentaenoic-acid_100g');
  const dha = num('docosahexaenoic-acid_100g');
  per100.epadha = epa === null && dha === null ? null : ((epa || 0) + (dha || 0)) * 1000;
  const isMl = /ml|cl|l\b/i.test(p.product_quantity_unit || '') || /\bml\b|\bcl\b|\d\s*l\b/i.test(p.quantity || '');
  const servings = [];
  const sq = Number(p.serving_quantity);
  if (sq > 0) servings.push({ label: p.serving_size ? `Serving (${p.serving_size})` : 'Serving', amount: sq });
  return {
    name: (p.product_name_en || p.product_name || 'Unnamed product').trim(),
    brand: (p.brands || '').split(',')[0].trim(),
    barcode: p.code,
    unit: isMl ? 'ml' : 'g',
    per100: normNutrients(per100),
    servings,
    source: 'off',
  };
}

// Branded search. Tries Open Food Facts' newer search service first (fast, CORS-friendly),
// then the classic search endpoint, each with a timeout. Results are cached per query
// so retyping doesn't spend OFF's rate limit.
const SEARCH = 'https://search.openfoodfacts.org/search';
const offCache = new Map();
const hasEnergy = (p) => p.nutriments && (p.nutriments['energy-kcal_100g'] !== undefined || p.nutriments['energy_100g'] !== undefined);

async function getJson(url, signal, ms = 9000) {
  const ctrl = new AbortController();
  const stop = () => ctrl.abort();
  signal?.addEventListener('abort', stop, { once: true });
  const timer = setTimeout(() => ctrl.abort(new Error('timed out')), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`error ${res.status}`);
    return await res.json();
  } catch (e) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    throw ctrl.signal.aborted ? new Error('timed out') : e;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', stop);
  }
}

async function searchNew(q, signal) {
  const url = `${SEARCH}?q=${encodeURIComponent(q)}&page_size=40&langs=en&fields=${OFF_FIELDS},countries_tags`;
  const json = await getJson(url, signal);
  const hits = (json.hits || []).filter(hasEnergy);
  // UK products first, then everything else.
  const uk = (p) => (p.countries_tags || []).includes('en:united-kingdom');
  return [...hits.filter(uk), ...hits.filter((p) => !uk(p))].slice(0, 30);
}

async function searchClassic(q, signal) {
  const url = `${OFF}/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=30&fields=${OFF_FIELDS}&tagtype_0=countries&tag_contains_0=contains&tag_0=united-kingdom`;
  const json = await getJson(url, signal);
  return (json.products || []).filter(hasEnergy);
}

export async function offSearch(q, signal) {
  const key = q.trim().toLowerCase();
  const hit = offCache.get(key);
  if (hit && Date.now() - hit.t < 10 * 60 * 1000) return hit.foods;
  let products = null;
  let firstErr = null;
  try {
    products = await searchNew(q, signal);
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    firstErr = e;
  }
  if (!products || !products.length) {
    try {
      products = await searchClassic(q, signal);
    } catch (e) {
      if (e.name === 'AbortError') throw e;
      if (!products) throw new Error(firstErr ? `${firstErr.message}; ${e.message}` : e.message);
    }
  }
  const foods = products.map(offToFood);
  offCache.set(key, { t: Date.now(), foods });
  return foods;
}

/**
 * Look a barcode up on Open Food Facts: the product API first, then the search service
 * as a backup, each with a time limit. 12-digit UPC codes are also tried with a leading
 * 0 (the EAN-13 form most UK products are stored under).
 */
export async function offBarcode(code) {
  const codes = code.length === 12 ? [code, '0' + code] : [code];
  let lastErr = null;
  for (const c of codes) {
    try {
      const json = await getJson(`${OFF}/api/v2/product/${encodeURIComponent(c)}.json?fields=${OFF_FIELDS}`, null, 9000);
      if (json.status === 1 && json.product) return offToFood({ ...json.product, code: json.product.code || c });
    } catch (e) {
      // 404 = not in the database; anything else = OFF unreachable, try the backup.
      if (!/error 404/.test(e.message)) lastErr = e;
    }
  }
  try {
    const json = await getJson(`${SEARCH}?q=${codes.map((c) => `code:${c}`).join(' OR ')}&page_size=5&fields=${OFF_FIELDS}`, null, 9000);
    const hit = (json.hits || []).find((p) => codes.includes(p.code));
    if (hit) return offToFood(hit);
  } catch {
    /* backup unavailable: only an error if the product API failed too */
  }
  if (lastErr) throw new Error(`Open Food Facts didn't respond (${lastErr.message})`);
  return null;
}
