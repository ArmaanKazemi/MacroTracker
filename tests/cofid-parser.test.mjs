// Tests the CoFID spreadsheet parser against a synthetic workbook laid out like
// the published CoFID 2021 file (header row, then a row of nutrient codes, then data,
// with nutrients split across "Proximates", "Inorganics" and "Vitamins" sheets).
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { parseWorkbook, toCompact, buildAliases, parseValue } from '../tools/build-cofid.mjs';

const require = createRequire(import.meta.url);
const XLSX = require('../tools/node_modules/xlsx');

const meta = ['Food Code', 'Food Name', 'Description', 'Group', 'Previous', 'Main data references', 'Footnote'];
const prox = [
  ['1.3 Proximates'],
  [...meta, 'Water (g)', 'Protein (g)', 'Fat (g)', 'Carbohydrate (g)', 'Energy (kcal) (kcal)', 'Energy (kJ) (kJ)', 'Starch (g)', 'Total sugars (g)', 'NSP (g)', 'AOAC fibre (g)', 'Fatty acids, total saturated (g)'],
  [null, null, null, null, null, null, null, 'WATER', 'PROT', 'FAT', 'CHO', 'KCALS', 'KJ', 'STARCH', 'TOTSUG', 'NSP', 'AOACFIB', 'SATFOD'],
  ['14-319', 'Raspberries, raw', '', 'FA', '', '', '', 87, 1.4, 0.3, 4.6, 25, 109, 0, 4.6, 2.5, 6.5, 0.1],
  ['14-101', 'Blueberries, raw', '', 'FA', '', '', '', 85, 0.9, 0.2, 9.1, 40, 170, 0, 9.1, 'N', '', 'Tr'],
  ['13-500', 'Peanut butter, smooth', '', 'GA', '', '', '', 1, 22.6, 51.8, 13.1, 607, 2515, 6, 7, 5.4, 'N', 10],
  ['11-999', 'Mystery food no energy', '', 'AA', '', '', '', 1, 'N', 'N', 'N', 'N', 'N', '', '', '', '', ''],
];
const inorg = [
  [...meta, 'Sodium (mg)', 'Potassium (mg)', 'Calcium (mg)', 'Magnesium (mg)', 'Phosphorus (mg)', 'Iron (mg)', 'Copper (mg)', 'Zinc (mg)', 'Chloride (mg)', 'Manganese (mg)', 'Selenium (µg)', 'Iodine (µg)'],
  [null, null, null, null, null, null, null, 'NA', 'K', 'CA', 'MG', 'P', 'FE', 'CU', 'ZN', 'CL', 'MN', 'SE', 'I'],
  ['14-319', 'Raspberries, raw', '', 'FA', '', '', '', 3, 170, 25, 19, 31, 0.7, 0.1, 0.4, 10, 0.4, 'Tr', 'N'],
  ['14-101', 'Blueberries, raw', '', 'FA', '', '', '', 6, 'N', 10, 6, 12, 'Tr', 0.1, 0.2, 5, 0.3, 0.1, ''],
  ['13-500', 'Peanut butter, smooth', '', 'GA', '', '', '', 350, 700, 37, 180, 330, 2.1, 0.7, 3.0, 500, 1.7, 4, 3],
];
const vits = [
  [...meta, 'Retinol (µg)', 'Carotene (µg)', 'Retinol Equivalent (µg)', 'Vitamin D (µg)', 'Vitamin E (mg)', 'Vitamin K1 (µg)', 'Thiamin (mg)', 'Vitamin B12 (µg)', 'Folate (µg)', 'Vitamin C (mg)'],
  [null, null, null, null, null, null, null, 'RETOL', 'CAROT', 'RETEQU', 'VITD', 'VITE', 'VITK1', 'THIA', 'VITB12', 'FOLT', 'VITC'],
  ['14-319', 'Raspberries, raw', '', 'FA', '', '', '', 0, 6, 1, 0, 0.5, 7.8, 0.03, 0, 33, 32],
  ['13-500', 'Peanut butter, smooth', '', 'GA', '', '', '', 0, 0, 0, 0, 5, 0.3, 0.2, 'Tr', 53, 0],
];
// Omega-3s per 100 g of total fatty acids (must be ignored) and per 100 g food (used).
const faPerFA = [
  [...meta, 'cis n-3 C18:3 /100g FA (g)', 'cis n-3 C20:5 /100g FA (g)', 'cis n-3 C22:6 /100g FA (g)'],
  ['14-319', 'Raspberries, raw', '', 'FA', '', '', '', 45, 0, 0],
  ['13-500', 'Peanut butter, smooth', '', 'GA', '', '', '', 1, 0, 0],
];
const faPerFood = [
  [...meta, 'cis n-3 C18:3 /100g food (g)', 'cis n-3 C20:5 /100g food (g)', 'cis n-3 C22:6 /100g food (g)'],
  ['14-319', 'Raspberries, raw', '', 'FA', '', '', '', 0.13, 0, 0],
  ['13-500', 'Peanut butter, smooth', '', 'GA', '', '', '', 'Tr', 'N', 'N'],
  ['17-100', 'Salmon, grilled', '', 'JC', '', '', '', 0.3, 0.8, 1.2],
];

const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(prox), '1.3 Proximates');
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(inorg), '1.4 Inorganics');
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(vits), '1.5 Vitamins');
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(faPerFA), '1.9 (PUFA FA)');
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(faPerFood), '1.12 (PUFA food)');
const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

assert.equal(parseValue('Tr'), 0);
assert.equal(parseValue('N'), null);
assert.equal(parseValue(''), null);
assert.equal(parseValue('(0.4)'), 0.4);

const foods = parseWorkbook(buf);
const rows = toCompact(foods);
const byCode = Object.fromEntries(rows.map((r) => [r[0], r]));
assert.equal(rows.length, 3, 'food without energy (and salmon, only in the FA sheet) is dropped');
// [code, name, group, kcal, P, C, F, fibre, K, Mg, folate, vitC, vitA, vitK, Fe, Zn, Ca, vitD, Na, B12, I, Se, ALA, EPA+DHA]
assert.deepEqual(byCode['14-319'], ['14-319', 'Raspberries, raw', 'Fruit', 25, 1.4, 4.6, 0.3, 6.5, 170, 19, 33, 32, 1, 7.8, 0.7, 0.4, 25, 0, 3, 0, null, 0, 0.13, 0]);
const pb = byCode['13-500'];
assert.deepEqual(pb.slice(18), [350, 0, 3, 4, 0, null], 'PB: sodium, B12 Tr, iodine, selenium, ALA Tr (per food, not per FA), EPA+DHA N');
const bb = byCode['14-101'];
assert.equal(bb[7], null, 'blueberry fibre N/blank -> no data');
assert.equal(bb[8], null, 'potassium N -> no data');
assert.equal(bb[14], 0, 'iron Tr -> 0');
assert.equal(bb[10], null, 'no vitamins sheet row -> no data');
assert.equal(byCode['13-500'][7], 5.4, 'falls back to NSP fibre when AOAC missing');
assert.equal(byCode['13-500'][2], 'Nuts & seeds');

const aliases = buildAliases(rows);
assert.equal(aliases.S01, '14-319');
assert.equal(aliases.S02, '14-101');
assert.equal(aliases.S05, '13-500');
console.log('cofid-parser: all assertions passed');
