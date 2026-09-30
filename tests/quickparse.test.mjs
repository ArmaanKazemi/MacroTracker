// Unit tests for the Quick log text parser.
import assert from 'node:assert/strict';
import { parseQuickLog, extractNutrients, extractAmount } from '../app/js/quickparse.js';

const one = (t) => { const r = parseQuickLog(t); assert.equal(r.length, 1, `one item for "${t}"`); return r[0]; };
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, `${msg}: ${a} vs ${b}`);

// Amounts
let it = one('200g chicken breast');
assert.deepEqual([it.name, it.amount, it.unit, it.count], ['chicken breast', 200, 'g', null]);
it = one('chicken breast 200 grams');
assert.deepEqual([it.name, it.amount, it.unit], ['chicken breast', 200, 'g']);
it = one('250ml oat milk');
assert.deepEqual([it.name, it.amount, it.unit], ['oat milk', 250, 'ml']);
it = one('0.5 l water');
assert.deepEqual([it.amount, it.unit], [500, 'ml']);
it = one('2 eggs');
assert.deepEqual([it.name, it.count, it.countUnit, it.amount], ['eggs', 2, null, null]);
it = one('1 scoop impact whey');
assert.deepEqual([it.name, it.count, it.countUnit], ['impact whey', 1, 'scoop']);
it = one('2 slices of toast');
assert.deepEqual([it.name, it.count, it.countUnit], ['toast', 2, 'slice']);
it = one('half a banana');
assert.deepEqual([it.name, it.count], ['banana', 0.5]);
it = one('impact whey x2');
assert.deepEqual([it.name, it.count], ['impact whey', 2]);
it = one('raspberries');
assert.deepEqual([it.name, it.amount, it.count, it.typed], ['raspberries', null, null, null]);

// Typed nutrients
it = one('chicken wrap 450kcal 35p 40c 12f sodium 800mg');
assert.equal(it.name, 'chicken wrap');
assert.deepEqual(it.typed, { kcal: 450, protein: 35, carbs: 40, fat: 12, sodium: 800 });
it = one('burrito 650 calories 40g protein 70g carbs 20g fat 5g saturated fat 8g sugar 1.2g salt');
assert.equal(it.name, 'burrito');
assert.equal(it.typed.kcal, 650);
assert.equal(it.typed.satfat, 5);
assert.equal(it.typed.fat, 20);
assert.equal(it.typed.sugars, 8);
near(it.typed.sodium, 480, 'salt 1.2 g -> 480 mg sodium');
it = one('smoothie kcal: 300, protein 20g, fibre 6, vitamin c 90mg, iron 2mg');
assert.equal(it.name, 'smoothie', 'value-only pieces join their food');
assert.deepEqual(it.typed, { kcal: 300, protein: 20, fibre: 6, vitC: 90, iron: 2 });
it = one('shake 30p 5c 3f');
assert.equal(it.typed.kcal, 30 * 4 + 5 * 4 + 3 * 9, 'kcal worked out from macros');
it = one('salmon 2000mg epa+dha 0.9g sodium');
near(it.typed.epadha, 2000, 'EPA+DHA mg');
near(it.typed.sodium, 900, 'g sodium converted to mg');
it = one('tablet 25mcg vitamin d');
assert.equal(it.typed.vitD, 25);

// Food names that look like nutrients stay food names
it = one('30g protein powder');
assert.deepEqual([it.name, it.amount, it.typed], ['protein powder', 30, null]);
it = one('1 protein bar');
assert.deepEqual([it.name, it.count, it.typed], ['protein bar', 1, null]);
it = one('fat free yoghurt 150g');
assert.deepEqual([it.name, it.amount, it.typed], ['fat free yoghurt', 150, null]);
it = one('fish and chips');
assert.equal(it.name, 'fish and chips');

// Several items
const many = parseQuickLog('200g chicken breast, 2 eggs\n1 scoop impact whey + 30g lizis granola\n- banana');
assert.deepEqual(many.map((x) => x.name), ['chicken breast', 'eggs', 'impact whey', 'lizis granola', 'banana']);
assert.deepEqual(parseQuickLog('  ,, \n'), []);

// Helpers
assert.deepEqual(extractNutrients('no numbers here').nutrients, {});
assert.equal(extractAmount('1/2 cup rice').count, 0.5);

console.log('quickparse: all assertions passed');
