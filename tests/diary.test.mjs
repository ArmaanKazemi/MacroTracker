// Food diary CSV: rows per food in meal and time order, day totals, quoting.
import assert from 'node:assert/strict';
import { diaryCsv } from '../app/js/diary.js';
import { normNutrients, CORE_MICROS } from '../app/js/nutrients.js';

const e = (id, date, meal, name, kcal, extra = {}) => ({ id, date, meal, name, brand: '', unit: 'g', amount: 100, ts: Number(id.slice(1)), per100: normNutrients({ kcal, protein: 10, carbs: 20, fat: 5 }), ...extra });
const csv = diaryCsv([
  e('e3', '2026-10-30', 'dinner', 'Salmon, rice', 600, { time: '19:30' }),
  e('e1', '2026-10-30', 'breakfast', 'Oats "jumbo"', 350, { time: '08:05' }),
  e('e6', '2026-10-30', 'breakfast', 'Coffee', 5, { time: '07:10' }),
  e('e2', '2026-10-30', 'snacks', 'Kiwi', 50),
  e('e4', '2026-10-31', 'lunch', 'Wrap', 450, { servingLabel: 'portion', qty: 1 }),
  e('e5', '2026-10-31', 'supplements', 'Fish oil', 14),
], [{ date: '2026-10-30', ml: 500 }, { date: '2026-10-30', ml: 250 }], { tracked: CORE_MICROS });
const lines = csv.trim().split('\r\n');
assert.equal(lines.length, 1 + 6 + 2);
assert.equal(lines[0].split(',').length, 12 + CORE_MICROS.length + 1);
assert.match(lines[0], /^Date,Meal,Time,Food,Brand,Amount,Calories \(kcal\),/);
// Within a meal, by time eaten: coffee (07:10) before oats (08:05) though it was logged later
assert.match(lines[1], /^2026-10-30,Breakfast,07:10,Coffee,/);
assert.match(lines[2], /^2026-10-30,Breakfast,08:05,"Oats ""jumbo""",,100 g,350,10,20,/);
assert.match(lines[3], /^2026-10-30,Dinner,19:30,"Salmon, rice",/);
assert.match(lines[4], /^2026-10-30,Snacks,,Kiwi,/);
assert.match(lines[5], /^2026-10-30,Day total,,4 items,,,1005,40,80,.*,750$/);
assert.match(lines[6], /^2026-10-31,Lunch,,Wrap,,1 × portion,450,/);
assert.match(lines[7], /^2026-10-31,Supplements,,Fish oil,/);
assert.match(lines[8], /^2026-10-31,Day total,,2 items,,,464,.*,$/);
console.log('diary: all assertions passed');
