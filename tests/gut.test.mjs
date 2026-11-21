// Gut log maths: groups, weekly summary, food window (with and without times), triggers, CSV.
import assert from 'node:assert/strict';
import { groupOf, weekSummary, foodsBefore, triggers, gutCsv, toMs, newestFirst } from '../app/js/gut.js';

assert.deepEqual([1, 2, 3, 4, 5, 6, 7].map(groupOf), ['hard', 'hard', 'normal', 'normal', 'normal', 'loose', 'loose']);

const g = (date, time, bristol, extra = {}) => ({ id: `${date}${time}${bristol}`, date, time, bristol, urgency: 0, pain: 0, bloating: 0, tags: [], ...extra });

// Weekly summary: 7 days ending 2026-11-20
const week = [
  g('2026-11-14', '08:00', 4, { pain: 2, bloating: 4 }),
  g('2026-11-15', '09:00', 6, { urgency: 2, pain: 6, bloating: 6 }),
  g('2026-11-15', '18:00', 7, { urgency: 3, pain: 8, bloating: 8 }),
  g('2026-11-17', '08:30', 2, { pain: 4, bloating: 2 }),
  g('2026-11-20', '07:45', 4, { urgency: 1 }),
  g('2026-11-13', '08:00', 1), // outside the week
];
const s = weekSummary(week, '2026-11-20');
assert.equal(s.from, '2026-11-14');
assert.equal(s.count, 5);
assert.equal(Math.round(s.perDay * 100) / 100, 0.71);
assert.deepEqual(s.dist, { 1: 0, 2: 1, 3: 0, 4: 2, 5: 0, 6: 1, 7: 1 });
assert.deepEqual(s.pct, { hard: 20, normal: 40, loose: 40 });
assert.equal(s.avgPain, 4);
assert.equal(s.avgBloating, 4);
assert.equal(s.urgencyDays, 2, 'urgency on the 15th and the 20th');
assert.equal(weekSummary([], '2026-11-20').avgPain, null);

// Food window 6–48 h before: timed foods by time, untimed foods by date
const foods = [
  { name: 'Curry', date: '2026-11-14', time: '19:00', meal: 'dinner' },        // 14 h before 09:00 on the 15th: in
  { name: 'Coffee', date: '2026-11-15', time: '07:00', meal: 'breakfast' },    // 2 h before: too recent
  { name: 'Old pasta', date: '2026-11-12', time: '20:00', meal: 'dinner' },    // 61 h before: too old
  { name: 'Lentils', date: '2026-11-14', meal: 'lunch' },                       // no time, date in window: in
  { name: 'Fish oil', date: '2026-11-14', time: '20:00', meal: 'supplements' }, // supplements ignored
];
assert.deepEqual(foodsBefore(week[1], foods).map((f) => f.name), ['Lentils', 'Curry']);
assert.ok(toMs('2026-11-15', '09:00') - toMs('2026-11-14', '19:00') === 14 * 3600e3);

// Triggers: curry before both loose entries, rarely before normal ones
const gut = [
  g('2026-11-02', '09:00', 6), g('2026-11-05', '09:00', 7),
  g('2026-11-08', '09:00', 4), g('2026-11-10', '09:00', 4), g('2026-11-12', '09:00', 3),
];
const meals = [
  { name: 'Curry', date: '2026-11-01', time: '19:00' }, { name: 'Rice', date: '2026-11-01', time: '19:00' },
  { name: 'curry ', date: '2026-11-04', time: '20:00' }, { name: 'Rice', date: '2026-11-04', time: '20:00' },
  { name: 'Rice', date: '2026-11-07', time: '19:00' }, { name: 'Rice', date: '2026-11-09', time: '19:00' },
  { name: 'Curry', date: '2026-11-11', time: '19:00' },
];
const t = triggers(gut, meals);
assert.equal(t.looseN, 2);
assert.equal(t.normalN, 3);
assert.equal(t.rows[0].name, 'Curry', 'curry ranks first (same food despite spacing/case)');
assert.equal(t.rows[0].loose, 2);
assert.equal(t.rows[0].normal, 1);
assert.equal(t.rows[1].name, 'Rice', 'rice is common before normal entries too, so it ranks lower');
assert.ok(t.rows[0].diff > t.rows[1].diff);
assert.equal(triggers(gut, meals.filter((m) => m.name === 'Rice')).rows.length, 1);

// Sorting and CSV
assert.deepEqual([...gut].sort(newestFirst).map((e) => e.date)[0], '2026-11-12');
const csv = gutCsv([g('2026-11-02', '09:00', 6, { urgency: 3, straining: false, blood: true, tags: ['stress', 'newfood'], notes: 'after "takeaway", ugh' })]).trim().split('\r\n');
assert.match(csv[0], /^Date,Time,Bristol type,Category,Urgency \(0-3\),Urgency,Straining,Incomplete emptying,Abdominal pain \(0-10\),Bloating \(0-10\),Pain relieved by BM,Blood,Mucus,Context,Notes$/);
assert.equal(csv[1], '2026-11-02,09:00,6,loose,3,Had to rush,No,,0,0,,Yes,,Stress; New or unusual food,"after ""takeaway"", ugh"');
console.log('gut: all assertions passed');
