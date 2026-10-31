// Food diary CSV: rows per food in meal order, day totals, quoting.
import assert from 'node:assert/strict';
import { diaryCsv } from '../app/js/diary.js';
import { normNutrients, CORE_MICROS } from '../app/js/nutrients.js';

const e = (id, date, meal, name, kcal, extra = {}) => ({ id, date, meal, name, brand: '', unit: 'g', amount: 100, ts: Number(id.slice(1)), per100: normNutrients({ kcal, protein: 10, carbs: 20, fat: 5, ...extra }), ...extra.entry });
const csv = diaryCsv([
  e('e3', '2026-10-30', 'dinner', 'Salmon, rice', 600),
  e('e1', '2026-10-30', 'breakfast', 'Oats "jumbo"', 350),
  e('e2', '2026-10-30', 'snacks', 'Kiwi', 50),
  e('e4', '2026-10-31', 'lunch', 'Wrap', 450, { entry: { servingLabel: 'portion', qty: 1 } }),
  e('e5', '2026-10-31', 'supplements', 'Fish oil', 14),
], [{ date: '2026-10-30', ml: 500 }, { date: '2026-10-30', ml: 250 }], { tracked: CORE_MICROS });
const lines = csv.trim().split('\r\n');
assert.equal(lines.length, 1 + 5 + 2);
assert.match(lines[1], /^2026-10-30,Breakfast,"Oats ""jumbo""",,100 g,350,10,20,/);
assert.match(lines[2], /^2026-10-30,Dinner,"Salmon, rice",/);
assert.match(lines[3], /^2026-10-30,Snacks,Kiwi,/);
assert.match(lines[4], /^2026-10-30,Day total,3 items,,,1000,30,60,.*,750$/);
assert.match(lines[5], /^2026-10-31,Lunch,Wrap,,1 × portion,450,/);
assert.match(lines[6], /^2026-10-31,Supplements,Fish oil,/);
assert.match(lines[7], /^2026-10-31,Day total,2 items,,,464,.*,$/);
assert.equal(lines[0].split(',').length, 11 + CORE_MICROS.length + 1);
console.log('diary: all assertions passed');
