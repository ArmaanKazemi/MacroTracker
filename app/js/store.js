// App-level data operations on top of IndexedDB.
import * as db from './db.js';
import { defaultSettings, normNutrients, applyLink, MICROS, MICROS_VERSION, ALL_KEYS } from './nutrients.js';
import { lookup } from './fooddb.js';

// ---------- settings ----------
let settingsCache = null;
export async function getSettings() {
  if (settingsCache) return settingsCache;
  const saved = (await db.get('kv', 'settings')) || {};
  const d = defaultSettings();
  // Targets changed in v2: older saved targets are replaced by the new defaults.
  const fresh = (saved.microsVersion || 1) < MICROS_VERSION;
  settingsCache = {
    ...d,
    ...saved,
    micros: { ...d.micros, ...(fresh ? {} : saved.micros || {}) },
    upper: { ...d.upper, ...(fresh ? {} : saved.upper || {}) },
    microsVersion: MICROS_VERSION,
  };
  if (fresh && saved.micros) await db.put('kv', settingsCache, 'settings');
  return settingsCache;
}
export async function saveSettings(s) {
  settingsCache = s;
  await db.put('kv', s, 'settings');
}
export function resetCache() {
  settingsCache = null;
}

// ---------- seed ----------
// Label values per `amount` g/ml -> per 100. `extra` values are already per 100.
const per = (amount, kcal, protein, carbs, fat, extra = {}) => {
  const f = 100 / amount;
  const r = (v) => Math.round(v * f * 100) / 100;
  return normNutrients({ kcal: r(kcal), protein: r(protein), carbs: r(carbs), fat: r(fat), ...extra });
};

export const PRESETS = [
  { id: 'p-fage0', name: 'Fage Total 0% Greek yoghurt', brand: 'Fage', unit: 'g', per100: per(100, 57, 10.3, 3, 0, { sodium: 40 }), link: 'S03', servings: [] },
  { id: 'p-impact', name: 'Impact Whey + Collagen protein powder', brand: '', unit: 'g', per100: per(25, 96, 20, 2.6, 0.7), link: 'S09', servings: [{ label: '1 scoop', amount: 25 }] },
  { id: 'p-lizis', name: "Lizi's protein granola", brand: "Lizi's", unit: 'g', per100: per(100, 442, 26.9, 40.7, 17.6), link: 'S10', servings: [] },
  { id: 'p-flax', name: 'Ground flaxseed', brand: '', unit: 'g', per100: per(100, 514, 18.3, 1.6, 42.2), link: 'S04', servings: [{ label: '3 tsp', amount: 7 }] },
  { id: 'p-pb', name: 'Morrisons 100% smooth peanut butter', brand: 'Morrisons', unit: 'g', per100: per(32, 196, 6.4, 6.4, 15, { sodium: 5 }), link: 'S05', servings: [{ label: '1 portion', amount: 32 }] },
  { id: 'p-pbpowder', name: 'Peanut butter powder', brand: '', unit: 'g', per100: per(16, 71, 8, 5, 2), link: 'S06', servings: [{ label: '2 tbsp', amount: 16 }] },
  { id: 'p-spirulina', name: 'Naturya spirulina powder', brand: 'Naturya', unit: 'g', per100: per(100, 345, 67, 15, 0.9), link: 'S07', servings: [{ label: '1 tsp', amount: 3 }] },
  { id: 'p-oatmilk', name: 'Plenish oat milk', brand: 'Plenish', unit: 'ml', per100: per(100, 33, 0.6, 6.6, 0.3), link: 'S08', servings: [] },
  { id: 'p-rasp', name: 'Raspberries, raw', brand: '', unit: 'g', source: 'generic', genericId: 'S01', servings: [{ label: '1 portion', amount: 80 }] },
  { id: 'p-blue', name: 'Blueberries, raw', brand: '', unit: 'g', source: 'generic', genericId: 'S02', servings: [{ label: '1 portion', amount: 80 }] },
];

export async function seedIfNeeded() {
  if (!(await db.get('kv', 'seeded'))) {
    for (const p of PRESETS) {
      await db.put('foods', { source: 'preset', favourite: true, createdAt: Date.now(), ...p });
    }
    await db.put('kv', true, 'seeded');
    await db.put('kv', DATA_VERSION, 'dataVersion');
  }
}

const DATA_VERSION = 4;

/**
 * Upgrades stored data. Needs the food database loaded.
 * v2: new nutrients (B12, iodine, selenium, omega-3s, sodium) added to preset foods.
 * v3: fill "no data" gaps in logged entries from the (fixed) food database - the
 *     first CoFID build had no minerals. Values that already exist are never changed.
 * v4: sugars and saturated fat added; filled into logged entries the same way.
 */
export async function migrateIfNeeded() {
  const from = (await db.get('kv', 'dataVersion')) || 1;
  if (from >= DATA_VERSION) return;
  if (from < 2) {
    for (const p of PRESETS) {
      const f = await db.get('foods', p.id);
      if (!f || !f.per100 || !p.per100) continue;
      f.per100 = { ...p.per100, ...Object.fromEntries(Object.entries(f.per100).filter(([, v]) => v !== null && v !== undefined)) };
      await db.put('foods', f);
    }
  }
  for (const e of await db.getAll('entries')) {
    if (!e.foodId) continue;
    const f = await db.get('foods', e.foodId);
    if (!f) continue;
    const r = resolve(f);
    let changed = false;
    for (const k of ALL_KEYS) {
      if ((e.per100[k] === null || e.per100[k] === undefined) && r.per100[k] !== null && r.per100[k] !== undefined) {
        e.per100[k] = r.per100[k];
        if (r.estimated.includes(k)) e.estimated = [...new Set([...(e.estimated || []), k])];
        changed = true;
      } else if (e.per100[k] === undefined) {
        e.per100[k] = null;
        changed = true;
      }
    }
    if (changed) await db.put('entries', e);
  }
  await db.put('kv', DATA_VERSION, 'dataVersion');
}

// ---------- foods ----------
/** Resolve a food's nutrients: generic foods are read live from the dataset, links fill missing micros. */
export function resolve(food) {
  if (food.source === 'generic') {
    const g = lookup(food.genericId);
    return { per100: g ? g.per100 : normNutrients({}), estimated: [], generic: g };
  }
  const linked = food.link ? lookup(food.link) : null;
  const r = applyLink(food.per100, linked?.per100);
  return { ...r, linkedFood: linked };
}

export const getFoods = () => db.getAll('foods');
export const getFood = (id) => db.get('foods', id);
export async function saveFood(food) {
  if (!food.id) food.id = 'f-' + db.uid();
  if (!food.createdAt) food.createdAt = Date.now();
  await db.put('foods', food);
  return food;
}
export const deleteFood = (id) => db.del('foods', id);

/** Persist a transient search result (generic or Open Food Facts) so it can be favourited / linked. */
export async function persistFood(food) {
  if (food.id) return food;
  const all = await getFoods();
  const existing = all.find((f) =>
    (food.source === 'generic' && f.source === 'generic' && f.genericId === food.genericId) ||
    (food.barcode && f.barcode === food.barcode));
  if (existing) return existing;
  return saveFood({ ...food, favourite: !!food.favourite });
}

export function defaultAmount(food) {
  if (food.lastAmount) return { amount: food.lastAmount, servingLabel: food.lastServing || null, qty: food.lastQty || null };
  if (food.servings?.length) return { amount: food.servings[0].amount, servingLabel: food.servings[0].label, qty: 1 };
  return { amount: 100, servingLabel: null, qty: null };
}

// ---------- entries ----------
export const entriesFor = (date) => db.byDate('entries', date);
export const entriesBetween = (from, to) => db.byDateRange('entries', from, to);

export function makeEntry(food, { date, meal, amount, servingLabel = null, qty = null, recipe = null }) {
  const { per100, estimated } = resolve(food);
  return {
    id: 'e-' + db.uid(),
    date,
    meal,
    foodId: food.id || null,
    name: food.name,
    brand: food.brand || '',
    unit: food.unit || 'g',
    amount: Number(amount),
    servingLabel,
    qty,
    per100,
    estimated,
    recipe,
    ts: Date.now(),
  };
}

export async function logFood(food, opts) {
  const entry = makeEntry(food, opts);
  await db.put('entries', entry);
  if (food.id) {
    const f = await getFood(food.id);
    if (f) {
      f.lastAmount = entry.amount;
      f.lastServing = opts.servingLabel || null;
      f.lastQty = opts.qty || null;
      f.lastUsed = Date.now();
      await db.put('foods', f);
    }
  }
  return entry;
}
export const saveEntry = (e) => db.put('entries', e);

/** Copy logged entries to another day / meal (new ids, same foods, amounts and nutrition). */
export async function copyEntries(list, { date, meal }) {
  let ts = Date.now();
  const out = [];
  for (const e of list) {
    const c = { ...e, id: 'e-' + db.uid(), date, meal, ts: ts++ };
    await db.put('entries', c);
    out.push(c);
  }
  return out;
}
export const deleteEntry = (id) => db.del('entries', id);

/** After linking a food, refresh the micronutrient estimates on all its logged entries. */
export async function relinkEntries(food) {
  const all = await db.getAll('entries');
  const { per100, estimated } = resolve(food);
  let n = 0;
  for (const e of all) {
    if (e.foodId !== food.id) continue;
    e.per100 = per100;
    e.estimated = estimated;
    await db.put('entries', e);
    n++;
  }
  return n;
}

// ---------- recipes (saved meals) ----------
export const getRecipes = () => db.getAll('recipes');
export async function saveRecipe(r) {
  if (!r.id) r.id = 'r-' + db.uid();
  await db.put('recipes', r);
  return r;
}
export const deleteRecipe = (id) => db.del('recipes', id);

/** Resolve a recipe item to a food object (stored food, or a generic food by id). */
export async function itemFood(item) {
  if (item.foodId) {
    const f = await getFood(item.foodId);
    if (f) return f;
  }
  if (item.genericId) {
    const g = lookup(item.genericId);
    if (g) return { source: 'generic', genericId: g.id, name: g.name, unit: 'g' };
  }
  return item.snapshot ? { ...item.snapshot } : null;
}

export async function logRecipe(recipe, { date, meal, amounts }) {
  const created = [];
  for (let i = 0; i < recipe.items.length; i++) {
    const item = recipe.items[i];
    const food = await itemFood(item);
    if (!food) continue;
    const amount = amounts?.[i] ?? item.amount;
    if (!(amount > 0)) continue;
    const e = makeEntry(food, { date, meal, amount, recipe: recipe.name });
    await db.put('entries', e);
    created.push(e);
  }
  return created;
}

// ---------- water ----------
export const waterFor = (date) => db.byDate('water', date);
export async function addWater(date, ml) {
  const w = { id: 'w-' + db.uid(), date, ml: Number(ml), ts: Date.now() };
  await db.put('water', w);
  return w;
}
export const deleteWater = (id) => db.del('water', id);

export { MICROS };
