// Planner & Pantry maths: pantry badges, supplement reorder dates, week dates, prep for
// tomorrow, pantry deductions and the shopping list. Pure (no DOM, no storage).

export const LOCATIONS = [
  { key: 'fridge', label: 'Fridge' },
  { key: 'freezer', label: 'Freezer' },
  { key: 'cupboard', label: 'Cupboard' },
  { key: 'supplements', label: 'Supplements' },
];
export const UNITS = ['g', 'ml', 'items', 'packs', 'capsules'];
export const SLOTS = [
  { key: 'breakfast', label: 'Breakfast', meal: 'breakfast' },
  { key: 'lunch', label: 'Lunch', meal: 'lunch' },
  { key: 'dinner', label: 'Dinner', meal: 'dinner' },
  { key: 'pre', label: 'Pre-training', meal: 'snacks', optional: true },
];
export const RECIPE_TAGS = [
  { key: 'breakfast', label: 'Breakfast' },
  { key: 'lunch', label: 'Lunch' },
  { key: 'dinner', label: 'Dinner' },
  { key: 'pre', label: 'Pre-training' },
];
/** Prep for tomorrow shows on Today from this hour. */
export const PREP_HOUR = 17;

const pad = (n) => String(n).padStart(2, '0');
const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (k, n) => { const d = parse(k); d.setDate(d.getDate() + n); return keyOf(d); };
export const daysBetween = (a, b) => Math.round((parse(b) - parse(a)) / 864e5);
/** Monday of the week containing `date`. */
export const mondayOf = (date) => addDays(date, -((parse(date).getDay() + 6) % 7));
/** The 7 dates of the week starting `monday`. */
export const weekDates = (monday) => Array.from({ length: 7 }, (_, i) => addDays(monday, i));

const r1 = (v) => Math.round(v * 10) / 10;
/** "250 g", "3 items", "1 pack", "12 capsules" */
export function qtyText(qty, unit) {
  const q = r1(qty);
  if (unit === 'g' || unit === 'ml') return q >= 1000 && q % 100 === 0 ? `${q / 1000} ${unit === 'g' ? 'kg' : 'L'}` : `${q} ${unit}`;
  const single = { items: 'item', packs: 'pack', capsules: 'capsule' }[unit] || unit;
  return `${q} ${q === 1 ? single : unit}`;
}
/** +/- step for a unit. */
export const stepFor = (unit) => (unit === 'g' || unit === 'ml' ? 10 : 1);

/**
 * Badges for a pantry item on `today`: low stock, expiring within 3 days / expired,
 * and for supplements with a daily dose, days left and the reorder warning.
 */
export function pantryStatus(item, today) {
  const out = { low: false, expiresIn: null, expired: false, daysLeft: null, reorderIn: null };
  const qty = Number(item.qty) || 0;
  if (item.low !== null && item.low !== undefined && item.low !== '' && qty <= Number(item.low)) out.low = true;
  if (item.expiry) {
    const d = daysBetween(today, item.expiry);
    if (d < 0) out.expired = true;
    else if (d <= 3) out.expiresIn = d;
  }
  if (Number(item.dailyDose) > 0) {
    out.daysLeft = Math.floor(qty / Number(item.dailyDose));
    // Reorder about a week before running out (leaves time for delivery).
    out.reorderIn = Math.max(0, out.daysLeft - 7);
  }
  return out;
}

/** Ingredient amount in the linked pantry item's unit (null when it can't be worked out). */
export function pantryUse(item, pantryItem) {
  if (!pantryItem) return null;
  if (Number(item.pantryQty) > 0) return Number(item.pantryQty);
  const u = item.unit || 'g';
  if (pantryItem.unit === u) return Number(item.amount) || 0;
  if ((pantryItem.unit === 'items' || pantryItem.unit === 'capsules') && Number(pantryItem.perItem) > 0) return (Number(item.amount) || 0) / Number(pantryItem.perItem);
  return null;
}

/** What eating `servings` of a recipe takes from the pantry: [{ pantryId, name, qty, unit }]. */
export function deductions(recipe, servings, pantry) {
  const byId = new Map(pantry.map((p) => [p.id, p]));
  const sum = new Map();
  for (const it of recipe.items || []) {
    const p = it.pantryId && byId.get(it.pantryId);
    const q = pantryUse(it, p);
    if (!p || !(q > 0)) continue;
    sum.set(p.id, (sum.get(p.id) || 0) + q * (servings || 1));
  }
  return [...sum].map(([id, qty]) => ({ pantryId: id, name: byId.get(id).name, qty: r1(qty), unit: byId.get(id).unit }));
}

/** Apply deductions to a copy of the pantry (stock never goes below 0). */
export function applyDeductions(pantry, list) {
  const take = new Map(list.map((d) => [d.pantryId, d.qty]));
  return pantry.map((p) => (take.has(p.id) ? { ...p, qty: r1(Math.max(0, (Number(p.qty) || 0) - take.get(p.id))) } : p));
}

/** Planned slots from `from` to `to` (inclusive): [{ date, slot, recipeId, servings, eaten }]. */
export function plannedSlots(plan, from, to) {
  const out = [];
  for (const [date, day] of Object.entries(plan || {})) {
    if (date < from || date > to) continue;
    for (const s of SLOTS) {
      const v = day?.[s.key];
      if (v?.recipeId) out.push({ date, slot: s.key, recipeId: v.recipeId, servings: v.servings || 1, eaten: !!v.eaten });
    }
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : SLOTS.findIndex((s) => s.key === a.slot) - SLOTS.findIndex((s) => s.key === b.slot)));
}

/**
 * Things to do the night before `date`: each planned recipe's prep note, plus a
 * "Defrost …" reminder for every freezer ingredient. [{ text, recipe, slot, auto }]
 */
export function prepFor(date, plan, recipes, pantry) {
  const byId = new Map(recipes.map((r) => [r.id, r]));
  const pById = new Map(pantry.map((p) => [p.id, p]));
  const out = [];
  const seen = new Set();
  for (const s of plannedSlots(plan, date, date)) {
    if (s.eaten) continue;
    const r = byId.get(s.recipeId);
    if (!r) continue;
    if (r.prep && r.prep.trim()) out.push({ text: r.prep.trim(), recipe: r.name, slot: s.slot, auto: false });
    for (const it of r.items || []) {
      const p = it.pantryId && pById.get(it.pantryId);
      if (p?.location === 'freezer' && !seen.has(p.id)) {
        seen.add(p.id);
        out.push({ text: `Defrost ${p.name}`, recipe: r.name, slot: s.slot, auto: true });
      }
    }
  }
  return out;
}
/** Show tomorrow's prep on Today? (evenings only) */
export const showPrepOnToday = (hour) => hour >= PREP_HOUR;

const lineKey = (l) => (l.pantryId ? `p:${l.pantryId}` : `n:${l.name.trim().toLowerCase()}|${l.unit}`);

/**
 * The shopping list for planned slots from `from` to `to` that aren't eaten yet:
 * (a) linked ingredients needed beyond current stock, rounded up to whole packs when a
 *     pack size is set, (b) ingredients not in the pantry, (c) items at or below their
 *     low-stock level, (d) manual items.
 * Returns lines [{ key, name, brand, location, qty, unit, packs, have, reason, pantryId, manual, done }].
 */
export function shoppingList({ plan, recipes, pantry, from, to, manual = [], ticked = {} }) {
  const byId = new Map(recipes.map((r) => [r.id, r]));
  const pById = new Map(pantry.map((p) => [p.id, p]));
  const need = new Map(); // key -> line
  for (const s of plannedSlots(plan, from, to)) {
    if (s.eaten) continue;
    const r = byId.get(s.recipeId);
    if (!r) continue;
    for (const it of r.items || []) {
      const p = it.pantryId && pById.get(it.pantryId);
      if (p) {
        const q = pantryUse(it, p);
        if (!(q > 0)) continue;
        const k = `p:${p.id}`;
        const l = need.get(k) || { pantryId: p.id, name: p.name, brand: p.brand || '', location: p.location, unit: p.unit, needed: 0 };
        l.needed += q * s.servings;
        need.set(k, l);
      } else {
        const unit = it.unit || 'g';
        const k = `n:${it.name.trim().toLowerCase()}|${unit}`;
        const l = need.get(k) || { name: it.name, brand: '', location: 'other', unit, needed: 0 };
        l.needed += (Number(it.amount) || 0) * s.servings;
        need.set(k, l);
      }
    }
  }
  const lines = [];
  for (const l of need.values()) {
    const p = l.pantryId && pById.get(l.pantryId);
    const have = p ? Number(p.qty) || 0 : 0;
    let short = l.needed - have;
    // A low item that's needed: buy enough to cover the plan and get back above its low level.
    if (p && p.low !== null && p.low !== undefined && p.low !== '' && have - l.needed <= Number(p.low)) short = Math.max(short, l.needed - have + Number(p.low) + (stepFor(p.unit) === 1 ? 1 : 0));
    if (!(short > 0.0001)) continue;
    lines.push(finish({ ...l, qty: short, have: p ? have : null, reason: 'plan' }, p));
  }
  for (const p of pantry) {
    if (need.has(`p:${p.id}`)) continue;
    if (p.low === null || p.low === undefined || p.low === '') continue;
    const have = Number(p.qty) || 0;
    if (have > Number(p.low)) continue;
    const top = Number(p.packSize) > 0 ? Number(p.packSize) : Math.max(1, Number(p.low) - have + (stepFor(p.unit) === 1 ? 1 : 0));
    lines.push(finish({ pantryId: p.id, name: p.name, brand: p.brand || '', location: p.location, unit: p.unit, qty: top, have, reason: 'low' }, p));
  }
  for (const m of manual) lines.push({ key: `m:${m.id}`, name: m.name, brand: '', location: m.location || 'other', qty: m.qty || null, unit: m.unit || '', manual: true, manualId: m.id, reason: 'manual' });
  for (const l of lines) l.done = !!ticked[l.key];
  return lines;
}
function finish(l, p) {
  const out = { ...l, qty: r1(l.qty) };
  delete out.needed;
  out.key = lineKey(out);
  if (p && Number(p.packSize) > 0) {
    out.packs = Math.ceil(out.qty / Number(p.packSize) - 1e-9);
    out.buyQty = r1(out.packs * Number(p.packSize));
  } else out.buyQty = out.qty;
  return out;
}

/** Group lines by location in a fixed order. [{ key, label, lines }] */
export function groupLines(lines) {
  const order = [...LOCATIONS, { key: 'other', label: 'Other' }];
  return order.map((g) => ({ ...g, lines: lines.filter((l) => (l.location || 'other') === g.key) })).filter((g) => g.lines.length);
}

/** One shopping line as text: "Oats: 1 pack (1 kg)" or "Rice 150 g". */
export function lineText(l) {
  if (l.manual) return `${l.name}${l.qty ? ` ${qtyText(l.qty, l.unit || 'items')}` : ''}`;
  const name = `${l.name}${l.brand ? ` (${l.brand})` : ''}`;
  // With a pack size, say how many packs to buy; the shortfall is shown separately.
  if (l.packs) return `${name}: ${l.packs} ${l.packs === 1 ? 'pack' : 'packs'} (${qtyText(l.buyQty, l.unit)})`;
  return `${name} ${qtyText(l.qty, l.unit)}`;
}

/** Plain-text list to paste into Notes or Reminders. Ticked lines are left out. */
export function shoppingText(lines, title = 'Shopping list') {
  const groups = groupLines(lines.filter((l) => !l.done));
  if (!groups.length) return `${title}\n\nNothing to buy.`;
  return `${title}\n\n${groups.map((g) => `${g.label.toUpperCase()}\n${g.lines.map((l) => `- ${lineText(l)}`).join('\n')}`).join('\n\n')}\n`;
}

/** Restock the pantry with ticked lines: linked items gain what was bought; others are added to the cupboard. */
export function restock(pantry, lines, newId) {
  let out = pantry.map((p) => ({ ...p }));
  for (const l of lines) {
    if (!l.done || l.manual) continue;
    const add = l.buyQty ?? l.qty;
    if (l.pantryId) {
      out = out.map((p) => (p.id === l.pantryId ? { ...p, qty: r1((Number(p.qty) || 0) + add) } : p));
    } else {
      const unit = UNITS.includes(l.unit) ? l.unit : 'items';
      out.push({ id: newId(), name: l.name, brand: '', location: 'cupboard', qty: r1(add), unit, packSize: null, low: null, expiry: null });
    }
  }
  return out;
}
