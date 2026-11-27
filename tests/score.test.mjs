// Day score: statuses (100% = optimal), points, counts.
import assert from 'node:assert/strict';
import { dayScore } from '../app/js/score.js';

const t = (o) => new Proxy({}, { get: (_, k) => ({ value: o[k] ?? 0, missing: 0 }) });
const settings = { kcal: 2000, protein: 100, carbs: 200, fat: 70, micros: {}, tracked: ['vitC', 'fibre', 'sodium'] };

// Nothing logged: everything low except sodium (under its limit), score = 100 / 7 items
let r = dayScore(t({}), [], settings, '2026-11-27');
assert.equal(r.items.length, 7);
assert.deepEqual(r.counts, { optimal: 1, good: 0, low: 6, over: 0 });
assert.equal(r.score, Math.round(100 / 7));

// 100% is optimal, 99% is good, 59% is low; kcal 120% is over and scores 60
r = dayScore(t({ kcal: 2400, protein: 100, carbs: 198, fat: 41, vitC: 90, fibre: 40, sodium: 2400 }), [], settings, '2026-11-27');
const by = Object.fromEntries(r.items.map((i) => [i.key, i]));
assert.equal(by.kcal.status, 'over');
assert.equal(Math.round(by.kcal.points), 60);
assert.equal(by.protein.status, 'optimal');
assert.equal(by.carbs.status, 'good');
assert.equal(by.fat.status, 'low');
assert.equal(by.vitC.status, 'optimal');
assert.equal(by.sodium.status, 'over', 'past the sodium limit');
assert.equal(by.sodium.points, 0);
assert.equal(by.fibre.status, 'optimal');
assert.deepEqual(r.counts, { optimal: 3, good: 1, low: 1, over: 2 });

// Carbs over 110% is over; protein over 110% is still optimal
r = dayScore(t({ kcal: 2000, protein: 200, carbs: 230, fat: 70 }), [], { ...settings, tracked: [] }, '2026-11-27');
assert.deepEqual(r.items.map((i) => i.status), ['optimal', 'optimal', 'over', 'optimal']);
assert.equal(r.score, Math.round((100 + 100 + 70 + 100) / 4));

// A nutrient switched on after the date isn't judged
r = dayScore(t({}), [], { ...settings, trackedSince: { vitC: '2026-12-01' } }, '2026-11-27');
assert.ok(!r.items.some((i) => i.key === 'vitC'));
console.log('score: all assertions passed');
