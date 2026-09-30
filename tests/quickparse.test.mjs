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

// Real example: numbers-first shorthand, then words-first, µg/mg units, and an untracked vitamin
it = one('sweet potato lamb bowl 877kcal 65.4p 69.9c 37.6f sugar 16.2g sat fat 14.1g fibre 12.5g salt 1.6g vitamin a 2200µg vitamin c 75mg vitamin e 1.8mg potassium 2100mg calcium 390mg magnesium 160mg iron 6.2mg zinc 10.9mg vitamin b12 6µg');
assert.equal(it.name, 'sweet potato lamb bowl');
assert.deepEqual({ ...it.typed, sodium: Math.round(it.typed.sodium) }, {
  kcal: 877, protein: 65.4, carbs: 69.9, fat: 37.6, sugars: 16.2, satfat: 14.1, fibre: 12.5, sodium: 640,
  vitA: 2200, vitC: 75, potassium: 2100, calcium: 390, magnesium: 160, iron: 6.2, zinc: 10.9, vitB12: 6,
});
assert.deepEqual(it.ignored, ['vitamin e']);
// Same with the Greek mu (μ) some keyboards type, thousands separators and "energy"
it = one('lunch energy 2,100 kj protein 40g vitamin d 10μg potassium 1,200mg');
assert.equal(it.name, 'lunch');
assert.equal(Math.round(it.typed.kcal), 502);
assert.equal(it.typed.vitD, 10);
assert.equal(it.typed.potassium, 1200);
// Value before word, all the way through
it = one('curry 700 kcal 30 g protein 900 mg sodium 5 g fibre');
assert.deepEqual(it.typed, { kcal: 700, protein: 30, sodium: 900, fibre: 5 });

// Formats AI chat apps tend to produce
it = one('Sweet potato lamb bowl – 877 kcal, 65.4 g protein, 69.9 g carbs, 37.6 g fat, 1.6 g salt');
assert.equal(it.name, 'Sweet potato lamb bowl');
assert.deepEqual({ ...it.typed, sodium: Math.round(it.typed.sodium) }, { kcal: 877, protein: 65.4, carbs: 69.9, fat: 37.6, sodium: 640 });
it = one('Chicken salad | Calories: 420 kcal | Protein: 38 g | Carbs: 12 g | Fat: 22 g | Sodium: 610 mg');
assert.equal(it.name, 'Chicken salad');
assert.deepEqual(it.typed, { kcal: 420, protein: 38, carbs: 12, fat: 22, sodium: 610 });
it = one('Porridge: Energy 350kcal, Fat 8g, of which saturates 2g, Carbohydrate 55g, of which sugars 12g, Fibre 7g, Protein 14g, Salt 0.1g');
assert.equal(it.name, 'Porridge');
assert.deepEqual({ ...it.typed, sodium: Math.round(it.typed.sodium) }, { kcal: 350, fat: 8, satfat: 2, carbs: 55, sugars: 12, fibre: 7, protein: 14, sodium: 40 });
const two = parseQuickLog('Protein shake 250kcal 30p\nBanana 105 kcal 1g protein 27g carbs');
assert.deepEqual(two.map((x) => [x.name, x.typed.kcal, x.typed.protein]), [['Protein shake', 250, 30], ['Banana', 105, 1]]);

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
