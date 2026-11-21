// Planner & Pantry maths: badges, reorder dates, deductions, prep, shopping list, text, restock.
import assert from 'node:assert/strict';
import { pantryStatus, pantryUse, deductions, applyDeductions, prepFor, showPrepOnToday, shoppingList, groupLines, shoppingText, restock, mondayOf, weekDates, qtyText } from '../app/js/planner.js';

const today = '2026-11-21';
// Badges
assert.deepEqual(pantryStatus({ qty: 2, low: 3 }, today).low, true);
assert.equal(pantryStatus({ qty: 5, low: 3 }, today).low, false);
assert.equal(pantryStatus({ qty: 5, expiry: '2026-11-24' }, today).expiresIn, 3);
assert.equal(pantryStatus({ qty: 5, expiry: '2026-11-25' }, today).expiresIn, null, '4 days away: no badge');
assert.equal(pantryStatus({ qty: 5, expiry: '2026-11-20' }, today).expired, true);
const vit = pantryStatus({ qty: 20, dailyDose: 2, unit: 'capsules' }, today);
assert.equal(vit.daysLeft, 10);
assert.equal(vit.reorderIn, 3);
assert.equal(qtyText(1500, 'g'), '1.5 kg');
assert.equal(qtyText(1, 'packs'), '1 pack');
assert.equal(mondayOf('2026-11-21'), '2026-11-16');
assert.deepEqual(weekDates('2026-11-16').slice(-1), ['2026-11-22']);

// Pantry
const pantry = [
  { id: 'oats', name: 'Oats', location: 'cupboard', qty: 400, unit: 'g', packSize: 1000, low: 200 },
  { id: 'milk', name: 'Milk', location: 'fridge', qty: 1000, unit: 'ml', packSize: 2000, low: 500 },
  { id: 'chicken', name: 'Chicken breast', location: 'freezer', qty: 2, unit: 'items', perItem: 150, low: 1 },
  { id: 'eggs', name: 'Eggs', location: 'fridge', qty: 2, unit: 'items', packSize: 6, low: 3 },
  { id: 'vitd', name: 'Vitamin D', location: 'supplements', qty: 100, unit: 'capsules', low: 10, dailyDose: 1 },
];
// Ingredient amounts in pantry units: same unit, per-item conversion, explicit pantryQty
assert.equal(pantryUse({ amount: 80, unit: 'g' }, pantry[0]), 80);
assert.equal(pantryUse({ amount: 300, unit: 'g' }, pantry[2]), 2);
assert.equal(pantryUse({ amount: 100, unit: 'g', pantryQty: 2 }, pantry[3]), 2);
assert.equal(pantryUse({ amount: 100, unit: 'g' }, pantry[3]), null, 'eggs in g with no per-item weight: unknown');

const oats = { id: 'r1', name: 'Overnight oats', prep: 'Make overnight oats', tags: ['breakfast'], items: [{ name: 'Oats', amount: 80, unit: 'g', pantryId: 'oats' }, { name: 'Milk', amount: 200, unit: 'ml', pantryId: 'milk' }, { name: 'Honey', amount: 10, unit: 'g' }] };
const chick = { id: 'r2', name: 'Chicken & rice', tags: ['dinner'], items: [{ name: 'Chicken breast', amount: 150, unit: 'g', pantryId: 'chicken' }, { name: 'Rice', amount: 75, unit: 'g' }] };
assert.deepEqual(deductions(oats, 2, pantry), [{ pantryId: 'oats', name: 'Oats', qty: 160, unit: 'g' }, { pantryId: 'milk', name: 'Milk', qty: 400, unit: 'ml' }]);
const after = applyDeductions(pantry, deductions(chick, 3, pantry));
assert.equal(after.find((p) => p.id === 'chicken').qty, 0, 'never below zero');
assert.equal(pantry.find((p) => p.id === 'chicken').qty, 2, 'original untouched');

// Plan: overnight oats every day Mon–Sun, chicken on Sunday
const plan = {};
for (const d of weekDates('2026-11-16')) plan[d] = { breakfast: { recipeId: 'r1', servings: 1 } };
plan['2026-11-22'].dinner = { recipeId: 'r2', servings: 2 };
plan['2026-11-21'].breakfast.eaten = true;

// Prep for Sunday (shown Saturday evening): the oats note and defrosting the chicken
assert.deepEqual(prepFor('2026-11-22', plan, [oats, chick], pantry).map((p) => p.text), ['Make overnight oats', 'Defrost Chicken breast']);
assert.deepEqual(prepFor('2026-11-21', plan, [oats, chick], pantry), [], 'eaten slots need no prep');
assert.equal(showPrepOnToday(16), false);
assert.equal(showPrepOnToday(17), true);

// Shopping for the rest of the week (Sat 21 eaten, Sun 22 to go): 80 g oats, 200 ml milk, 10 g honey, 2 chicken, 150 g rice
const lines = shoppingList({ plan, recipes: [oats, chick], pantry, from: today, to: '2026-11-22', manual: [{ id: 'm1', name: 'Whiteboard', location: 'other' }], ticked: { 'p:eggs': true } });
const by = Object.fromEntries(lines.map((l) => [l.key, l]));
// Oats: 400 - 80 = 320 left, above the 200 low level: nothing to buy
assert.ok(!by['p:oats']);
// Chicken: need 2, have 2, ending at 0 <= low 1: buy enough to end above low (2 - 2 + 1 + 1 = 2)
assert.equal(by['p:chicken'].qty, 2);
assert.equal(by['p:chicken'].reason, 'plan');
// Not in the pantry
assert.equal(by['n:honey|g'].qty, 10);
assert.equal(by['n:rice|g'].qty, 150);
// Low stock, not in the plan: eggs (2 <= 3) topped up by a pack of 6
assert.equal(by['p:eggs'].reason, 'low');
assert.equal(by['p:eggs'].qty, 6);
assert.equal(by['p:eggs'].packs, 1);
assert.equal(by['p:eggs'].done, true, 'ticks are kept');
assert.ok(!by['p:vitd'], 'vitamin D is above its low level');
assert.ok(by['m:m1'].manual);
assert.deepEqual(groupLines(lines).map((g) => g.key), ['fridge', 'freezer', 'other']);

// Plain text: grouped, ticked lines left out
const text = shoppingText(lines, 'Shopping list');
assert.match(text, /^Shopping list\n\nFREEZER\n- Chicken breast 2 items\n\nOTHER\n/);
assert.match(text, /- Honey 10 g/);
assert.match(text, /- Whiteboard/);
assert.doesNotMatch(text, /Eggs/);
assert.match(shoppingText(lines.map((l) => ({ ...l, done: false }))), /- Eggs: 1 pack \(6 items\)/);

// Restock with ticked lines: eggs +6; honey added as a new cupboard item; manual items ignored
const ticked = lines.map((l) => (l.key === 'n:honey|g' || l.key === 'm:m1' ? { ...l, done: true } : l));
let n = 0;
const re = restock(pantry, ticked, () => `new${++n}`);
assert.equal(re.find((p) => p.id === 'eggs').qty, 8);
assert.deepEqual(re.find((p) => p.id === 'new1'), { id: 'new1', name: 'Honey', brand: '', location: 'cupboard', qty: 10, unit: 'g', packSize: null, low: null, expiry: null });
assert.equal(re.length, pantry.length + 1);
console.log('planner: all assertions passed');
