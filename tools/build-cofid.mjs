#!/usr/bin/env node
// Builds app/data/cofid.json (compact, offline-searchable) from the UK government's
// "Composition of Foods Integrated Dataset" (CoFID, McCance & Widdowson) spreadsheet.
// Also (re)writes app/data/starter.json.
//
// Usage:
//   node tools/build-cofid.mjs --download        # fetch the latest xlsx from gov.uk
//   node tools/build-cofid.mjs path/to/CoFID.xlsx # use a file you downloaded yourself
//
// Requires the `xlsx` (SheetJS) package: `npm install` inside tools/.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as XLSX from 'xlsx';
import { FIELDS, STARTER, starterJson } from './starter-foods.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', 'app', 'data');

const PAGE = 'https://www.gov.uk/government/publications/composition-of-foods-integrated-dataset-cofid';
const CONTENT_API = 'https://www.gov.uk/api/content/government/publications/composition-of-foods-integrated-dataset-cofid';

// Column header matchers (CoFID headers look like "Energy (kcal) (kcal)", "Potassium (mg)").
const COLS = {
  code: /^food\s*code$/i,
  name: /^food\s*name$/i,
  group: /^group$/i,
  kcal: /^energy\s*\(kcal\)/i,
  protein: /^protein\b/i,
  carbs: /^carbohydrate\b/i,
  fat: /^fat\s*(\(g\))?\s*(\(g\))?$/i,
  sugars: /^total\s*sugars\b/i,
  fibreAOAC: /^aoac\s*fibre/i,
  fibreNSP: /^nsp\b/i,
  potassium: /^potassium\b/i,
  magnesium: /^magnesium\b/i,
  calcium: /^calcium\b/i,
  iron: /^iron\b/i,
  zinc: /^zinc\b/i,
  folate: /^folate\s*(\(|$)/i,
  vitC: /^vitamin\s*c\b/i,
  vitD: /^vitamin\s*d\s*(\(|$)/i,
  vitA: /^retinol\s*equivalent/i,
  vitK: /^vitamin\s*k1\b/i,
  sodium: /^sodium\b/i,
  iodine: /^iodine\b/i,
  selenium: /^selenium\b/i,
  vitB12: /^vitamin\s*b12\b/i,
};

// Fatty acids (g). CoFID has them both per 100 g food and per 100 g total fatty
// acids; only the per-food columns are usable.
// Patterns tried in order. DHA's column has no "n-3" label (C22:6 is always n-3).
const FA_COLS = {
  ala: [/(18:3.*n-?3)|(n-?3.*18:3)/i],
  epa: [/(20:5.*n-?3)|(n-?3.*20:5)/i],
  dha: [/(22:6.*n-?3)|(n-?3.*22:6)/i, /\bC?22:6\b/i],
  // "Satd FA /100g fd (g)" in Proximates; "/100g FA" columns are skipped by perFood().
  satfat: [/^sat(ur)?(ate)?d?\b.*\b(fa|fatty)\b/i, /total saturated/i],
};
const perFA = (text) => /100\s*g\s*(total\s*)?(fa\b|fatty)/i.test(text);
const perFood = (text) => /\b(food|fd)\b/i.test(text) && !perFA(text);
// Saturates also appear in Proximates with no "/100g" basis at all (that's per food).
const perFoodOrPlain = (text) => perFood(text) || (!perFA(text) && !/100\s*g/i.test(text));

const GROUPS = {
  A: 'Cereals', B: 'Milk & dairy', C: 'Eggs', D: 'Vegetables', F: 'Fruit', G: 'Nuts & seeds',
  H: 'Herbs & spices', J: 'Fish', M: 'Meat', O: 'Fats & oils', P: 'Drinks', Q: 'Alcohol',
  S: 'Sugars & snacks', W: 'Soups & sauces',
};

export function parseValue(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v).trim();
  if (!s || /^n$/i.test(s)) return null;
  if (/^tr(ace)?$/i.test(s)) return 0;
  const m = s.match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
}

// Header row = the one with "Food Code" or "Food Name". (In CoFID 2021 the
// Inorganics sheet has a blank cell where "Food Code" should be.)
function findHeader(rows) {
  for (let r = 0; r < Math.min(rows.length, 10); r++) {
    const row = rows[r] || [];
    if (row.some((c) => COLS.code.test(String(c ?? '').trim()) || COLS.name.test(String(c ?? '').trim()))) return r;
  }
  return -1;
}

/** Parse a CoFID workbook buffer into { code: {name, group, ...nutrients} }. */
export function parseWorkbook(buf) {
  const wb = XLSX.read(buf, { type: 'buffer' });
  const foods = new Map();
  for (const sheetName of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, raw: true, defval: null });
    const h = findHeader(rows);
    if (h < 0) continue;
    const header = rows[h].map((c) => String(c ?? '').replace(/\s+/g, ' ').trim());
    const idx = {};
    for (const [key, re] of Object.entries(COLS)) {
      const i = header.findIndex((c) => re.test(c));
      if (i >= 0) idx[key] = i;
    }
    if (idx.code === undefined && idx.name > 0) idx.code = idx.name - 1; // unlabelled code column
    if (idx.code === undefined) continue;
    for (const [key, patterns] of Object.entries(FA_COLS)) {
      for (const re of patterns) {
        const ok = key === 'satfat' ? perFoodOrPlain : perFood;
        const i = header.findIndex((c) => re.test(c) && ok(`${sheetName} ${c}`));
        if (i >= 0) { idx[key] = i; break; }
      }
    }
    const valueKeys = Object.keys(idx).filter((k) => !['code', 'name', 'group'].includes(k));
    for (let r = h + 1; r < rows.length; r++) {
      const row = rows[r];
      if (!row) continue;
      const code = String(row[idx.code] ?? '').trim();
      if (!/^\d{2,}-\d+/.test(code)) continue; // skips the code/unit rows under the header
      const f = foods.get(code) || { code };
      if (idx.name !== undefined && row[idx.name] && !f.name) f.name = String(row[idx.name]).trim();
      if (idx.group !== undefined && row[idx.group] && !f.group) f.group = String(row[idx.group]).trim();
      for (const key of valueKeys) {
        const v = parseValue(row[idx[key]]);
        if (f[key] === undefined || f[key] === null) f[key] = v;
      }
      foods.set(code, f);
    }
  }
  return foods;
}

function round(v) {
  return v === null || v === undefined ? null : Math.round(v * 100) / 100;
}

export function toCompact(foods) {
  const out = [];
  for (const f of foods.values()) {
    if (!f.name || f.kcal === null || f.kcal === undefined) continue;
    const derived = {
      fibre: f.fibreAOAC ?? f.fibreNSP ?? null,
      epadha: (f.epa ?? null) === null && (f.dha ?? null) === null ? null : ((f.epa || 0) + (f.dha || 0)) * 1000,
    };
    const vals = FIELDS.map((k) => round(k in derived ? derived[k] : f[k]));
    const g = GROUPS[(f.group || '').charAt(0).toUpperCase()] || 'Other';
    out.push([f.code, f.name, g, ...vals]);
  }
  out.sort((a, b) => a[1].localeCompare(b[1]));
  return out;
}

export function buildAliases(rows) {
  const aliases = {};
  for (const [id, , , patterns] of STARTER) {
    for (const re of patterns) {
      const hits = rows.filter((r) => re.test(r[1])).sort((a, b) => a[1].length - b[1].length);
      if (hits.length) { aliases[id] = hits[0][0]; break; }
    }
  }
  return aliases;
}

async function download() {
  let xlsxUrl = null;
  try {
    const res = await fetch(CONTENT_API);
    if (res.ok) {
      const json = await res.json();
      const atts = [...(json.details?.attachments || []), ...(json.details?.documents || [])];
      const cands = atts
        .map((a) => (typeof a === 'string' ? (a.match(/href="([^"]+\.xlsx)"/) || [])[1] : a.url))
        .filter((u) => u && /\.xlsx$/i.test(u));
      xlsxUrl = pick(cands);
    }
  } catch (e) {
    console.warn('Content API failed:', e.message);
  }
  if (!xlsxUrl) {
    const html = await (await fetch(PAGE)).text();
    const cands = [...html.matchAll(/href="([^"]+\.xlsx)"/gi)].map((m) => m[1]);
    xlsxUrl = pick(cands);
  }
  if (!xlsxUrl) throw new Error('Could not find the CoFID .xlsx link on gov.uk');
  if (xlsxUrl.startsWith('/')) xlsxUrl = 'https://www.gov.uk' + xlsxUrl;
  console.log('Downloading', xlsxUrl);
  const res = await fetch(xlsxUrl);
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

function pick(urls) {
  const good = urls.filter((u) => /(cofid|composition.?of.?foods|integrated.?dataset|mccance)/i.test(decodeURIComponent(u)))
    .filter((u) => !/(factor|guide|user|summary)/i.test(decodeURIComponent(u)));
  return good[0] || urls[0] || null;
}

/** Print each sheet's name, detected header row and header cells (for diagnosing layout changes). */
export function inspectWorkbook(buf) {
  const wb = XLSX.read(buf, { type: 'buffer' });
  for (const sheetName of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, raw: true, defval: null });
    const h = findHeader(rows);
    console.log(`\n=== Sheet "${sheetName}" (${rows.length} rows), header row: ${h}`);
    for (let r = 0; r < Math.min(rows.length, 4); r++) {
      console.log(`  row ${r}:`, JSON.stringify((rows[r] || []).slice(0, 40)).slice(0, 1500));
    }
  }
}

async function main() {
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'starter.json'), JSON.stringify(starterJson()));
  const arg = process.argv[2];
  if (!arg) {
    console.log('Wrote starter.json. Pass --download or a path to the CoFID .xlsx to build cofid.json.');
    return;
  }
  const buf = arg === '--download' || arg === '--inspect' ? await download() : await readFile(arg);
  if (arg === '--inspect' || process.argv.includes('--inspect')) inspectWorkbook(buf);
  const foods = parseWorkbook(buf);
  const rows = toCompact(foods);
  if (rows.length < 500) throw new Error(`Only parsed ${rows.length} foods - the spreadsheet layout may have changed.`);
  const aliases = buildAliases(rows);
  if (process.argv.includes('--inspect')) {
    const kw = /blueberr|raspberr|linseed|flax|oat.*(drink|milk)|spirulina|granola|muesli|peanut|greek|yog.*fat free|whey/i;
    console.log('\nCandidate foods for favourite links:');
    for (const r of rows.filter((r) => kw.test(r[1]))) console.log(`  ${r[0]}  ${r[1]}`);
    for (const [id, code] of Object.entries(aliases)) console.log(`  alias ${id} -> ${code} ${rows.find((r) => r[0] === code)?.[1]}`);
    // Raw staples people search for, to check naming and search coverage.
    console.log('\nRaw chicken / meat / fish entries:');
    for (const r of rows.filter((r) => /\braw\b/i.test(r[1]) && /chicken|turkey|beef|salmon|cod|pork/i.test(r[1]))) console.log(`  ${r[0]}  ${r[1]}  (${r[3]} kcal)`);
  }
  const json = { source: 'CoFID (McCance & Widdowson), UK Government', fields: FIELDS, foods: rows, aliases };
  await writeFile(join(outDir, 'cofid.json'), JSON.stringify(json));
  console.log(`Wrote cofid.json: ${rows.length} foods. Aliases:`, aliases);
  console.log('Foods with data per nutrient:');
  FIELDS.forEach((k, i) => console.log(`  ${k.padEnd(10)} ${rows.filter((r) => r[3 + i] !== null).length}`));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
