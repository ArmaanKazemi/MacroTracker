// End-to-end tests (Playwright + Chromium, iPhone viewport).
// Run: cd tools && npm install && npm test
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile, writeFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { serve } from './serve.mjs';

const require = createRequire(join(process.cwd(), 'tools', 'package.json'));
let pw;
try { pw = require('playwright'); } catch { pw = createRequire(new URL('../tools/package.json', import.meta.url)).call(null, 'playwright'); }
const { chromium, devices } = pw;

const server = await serve();
const BASE = `http://127.0.0.1:${server.address().port}/`;
const exe = existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
const browser = await chromium.launch({ executablePath: exe });
const iphone = { ...devices['iPhone 13'] };
delete iphone.defaultBrowserType;

// ---- Open Food Facts mock (the real API is called in production) ----
const OFF_PRODUCT = {
  code: '5000000000017', product_name: 'Test Protein Bar', brands: 'TestBrand', serving_size: '60 g', serving_quantity: 60,
  nutriments: { 'energy-kcal_100g': 350, proteins_100g: 33.3, carbohydrates_100g: 30, fat_100g: 10, fiber_100g: 5, salt_100g: 1.0 },
};
async function mockOff(ctx) {
  await ctx.route('https://world.openfoodfacts.org/**', (route) => {
    const u = route.request().url();
    if (u.includes('/api/v2/product/5000000000017')) return route.fulfill({ json: { status: 1, product: OFF_PRODUCT } });
    if (u.includes('/api/v2/product/')) return route.fulfill({ status: 404, json: { status: 0 } });
    if (u.includes('search.pl')) return route.fulfill({ json: { products: [OFF_PRODUCT] } });
    return route.abort();
  });
}

let passed = 0;
async function step(name, fn) {
  process.stdout.write(`• ${name} … `);
  await fn();
  passed++;
  console.log('ok');
}

const ctx = await browser.newContext({ ...iphone, acceptDownloads: true });
await mockOff(ctx);
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/404|Failed to load resource/.test(m.text())) errors.push(m.text()); });

const settle = () => page.waitForTimeout(1100); // let count-up animations finish
const num = async (sel) => Number((await page.locator(sel).first().textContent()).replace(/[^\d.-]/g, ''));
const eaten = () => num('[data-eaten]');
const topSheet = () => page.locator('.sheet.open').last();
async function closeTop() { await topSheet().locator('[data-close]').click(); await page.waitForTimeout(450); }

await page.goto(BASE);
await page.waitForSelector('.hero');
await settle();

await step('home screen renders with goal and empty meals', async () => {
  assert.equal(await num('[data-goal]'), 2200);
  assert.equal(await eaten(), 0);
  assert.equal(await page.locator('.meal-title').count(), 4);
  assert.equal(await page.locator('[data-remaining-label]').textContent(), 'kcal remaining');
});

await step('pre-loaded favourites are seeded', async () => {
  await page.locator('[data-meal="breakfast"] [data-add]').click();
  await topSheet().locator('[data-tab="fav"]').click();
  await page.waitForTimeout(300);
  const names = await topSheet().locator('.item-name').allTextContents();
  for (const n of ['Fage Total 0% Greek yoghurt', 'Impact Whey + Collagen protein powder', "Lizi's protein granola", 'Ground flaxseed', 'Morrisons 100% smooth peanut butter', 'Peanut butter powder', 'Naturya spirulina powder', 'Plenish oat milk', 'Raspberries, raw', 'Blueberries, raw']) {
    assert.ok(names.some((x) => x.includes(n)), `missing favourite ${n}`);
  }
});

await step('one-tap log a favourite serving (1 scoop = 96 kcal)', async () => {
  const row = topSheet().locator('.result', { hasText: 'Impact Whey' });
  assert.match(await row.textContent(), /1 scoop/);
  await row.locator('[data-quick]').click();
  await page.waitForTimeout(300);
  await closeTop();
  await settle();
  assert.equal(await eaten(), 96);
  const item = page.locator('[data-meal="breakfast"] .item');
  assert.equal(await item.count(), 1);
  assert.match(await item.textContent(), /1 × 1 scoop/);
});

await step('search CoFID/generic food offline-capable and log by grams', async () => {
  await page.locator('[data-meal="breakfast"] [data-add]').click();
  await topSheet().locator('input[type=search]').fill('raspberries');
  await page.waitForTimeout(300);
  await topSheet().locator('.result', { hasText: 'Raspberries, raw' }).first().click();
  await page.waitForTimeout(450);
  const d = topSheet();
  await d.locator('select[data-unit]').selectOption('unit');
  await d.locator('input.big-input').fill('200');
  assert.match(await d.locator('[data-preview]').textContent(), /50/); // 25 kcal/100g × 2
  await d.locator('[data-save]').click();
  await page.waitForTimeout(450);
  await closeTop();
  await settle();
  assert.equal(await eaten(), 146);
});

await step('branded search via Open Food Facts shows "no data" micros and logs a serving', async () => {
  await page.locator('[data-meal="snacks"] [data-add]').click();
  await topSheet().locator('input[type=search]').fill('protein bar');
  await topSheet().locator('.result', { hasText: 'Test Protein Bar' }).waitFor({ timeout: 4000 });
  await topSheet().locator('.result', { hasText: 'Test Protein Bar' }).click();
  await page.waitForTimeout(450);
  const d = topSheet();
  assert.match(await d.locator('[data-micro-count]').textContent(), /15 no data/);
  assert.equal(await d.locator('[data-micros] .pill.na').count(), 15);
  assert.match(await d.locator('[data-micros]').textContent(), /Sodium.*240 mg/); // salt 1 g/100 g → 400 mg/100 g × 60 g
  assert.match(await d.locator('[data-micros]').textContent(), /Fibre.*3 g/);
  await d.locator('[data-save]').click(); // default = 1 serving (60 g) = 210 kcal
  await page.waitForTimeout(450);
  await closeTop();
  await settle();
  assert.equal(await eaten(), 356);
});

await step('link branded food to similar CoFID food fills estimates (and updates logged entry)', async () => {
  await page.locator('[data-meal="snacks"] .item').first().click();
  await page.waitForTimeout(450);
  await topSheet().locator('[data-pick]').click();
  await page.waitForTimeout(450);
  await topSheet().locator('input[type=search]').fill('peanuts');
  await page.waitForTimeout(200);
  await topSheet().locator('.result').first().click();
  await page.waitForTimeout(500);
  const d = topSheet();
  assert.match(await d.locator('[data-link]').textContent(), /estimated from/i);
  assert.ok((await d.locator('[data-micros] .pill.est').count()) >= 13);
  assert.ok((await d.locator('[data-micros] .pill.na').count()) <= 1); // peanuts: iodine unknown
  await closeTop();
});

await step('barcode manual lookup finds product', async () => {
  await page.locator('[data-meal="lunch"] [data-add]').click();
  await topSheet().locator('[data-tab="scan"]').click();
  await page.waitForTimeout(400);
  await topSheet().locator('[data-manual] input').fill('5000000000017');
  await topSheet().locator('[data-manual] button').click();
  await page.waitForTimeout(700);
  assert.equal(await topSheet().locator('h2').textContent(), 'Test Protein Bar');
  await closeTop();
  await topSheet().locator('[data-manual] input').fill('123');
  await topSheet().locator('[data-manual] button').click();
  await page.waitForTimeout(600);
  assert.match(await topSheet().locator('[data-status]').textContent(), /No product found/);
  await closeTop();
});

await step('edit an entry amount updates totals', async () => {
  await page.locator('[data-meal="breakfast"] .item', { hasText: 'Raspberries' }).click();
  await page.waitForTimeout(450);
  await topSheet().locator('input.big-input').fill('100');
  await topSheet().locator('[data-save]').click();
  await page.waitForTimeout(500);
  await settle();
  assert.equal(await eaten(), 331);
});

await step('move entry to another meal', async () => {
  await page.locator('[data-meal="breakfast"] .item', { hasText: 'Raspberries' }).click();
  await page.waitForTimeout(450);
  await topSheet().locator('select[data-meal]').selectOption('dinner');
  await topSheet().locator('[data-save]').click();
  await page.waitForTimeout(500);
  assert.equal(await page.locator('[data-meal="dinner"] .item', { hasText: 'Raspberries' }).count(), 1);
  assert.equal(await page.locator('[data-meal="breakfast"] .item', { hasText: 'Raspberries' }).count(), 0);
});

await step('delete entry with undo', async () => {
  await page.locator('[data-meal="dinner"] .item').click();
  await page.waitForTimeout(450);
  await topSheet().locator('[data-del]').click();
  await page.waitForTimeout(500);
  await settle();
  assert.equal(await eaten(), 306);
  await page.locator('#toast button', { hasText: 'Undo' }).click();
  await settle();
  assert.equal(await eaten(), 331);
  await page.locator('[data-meal="dinner"] .item').click();
  await page.waitForTimeout(450);
  await topSheet().locator('[data-del]').click();
  await settle();
  assert.equal(await eaten(), 306);
});

await step('create custom food from per-serving label values with a serving size', async () => {
  await page.locator('[data-meal="lunch"] [data-add]').click();
  await topSheet().locator('[data-tab="mine"]').click();
  await page.waitForTimeout(300);
  await topSheet().locator('button', { hasText: 'New custom food' }).click();
  await page.waitForTimeout(450);
  const f = topSheet();
  await f.locator('[data-f="name"]').fill('Overnight oats');
  await f.locator('[data-basis]').fill('50');
  await f.locator('[data-n="kcal"]').fill('200');
  await f.locator('[data-n="protein"]').fill('10');
  await f.locator('[data-n="carbs"]').fill('30');
  await f.locator('[data-n="fat"]').fill('4');
  await f.locator('[data-n="fibre"]').fill('3');
  await f.locator('[data-salt]').fill('1.5');
  assert.equal(await f.locator('[data-n="sodium"]').inputValue(), '600'); // salt → sodium
  await f.locator('[data-add-serv]').click();
  const sv = f.locator('[data-servings] input');
  await sv.nth(0).fill('1 jar');
  await sv.nth(1).fill('250');
  await f.locator('[data-save]').click();
  await page.waitForTimeout(600);
  // detail opens after creation with serving preselected: 250 g = 1000 kcal
  const d = topSheet();
  assert.equal(await d.locator('h2').textContent(), 'Overnight oats');
  assert.match(await d.locator('[data-preview]').textContent(), /1,000/);
  assert.match(await d.locator('[data-micros]').textContent(), /Fibre.*15 g/);
  assert.match(await d.locator('[data-micros]').textContent(), /Sodium.*3,000 mg/);
  await d.locator('[data-save]').click();
  await page.waitForTimeout(450);
  await closeTop();
  await settle();
  assert.equal(await eaten(), 1306);
});

await step('saved meal: create, one-tap log, and tweak amounts before logging', async () => {
  await page.goto(BASE + '#/foods');
  await page.waitForTimeout(400);
  await page.locator('[data-nm]').click();
  await page.waitForTimeout(450);
  const r = topSheet();
  await r.locator('[data-name]').fill('Yoghurt bowl');
  for (const [q, name] of [['fage', 'Fage'], ['granola', "Lizi's"], ['rasp', 'Raspberries']]) {
    await topSheet().locator('[data-add]').click();
    await page.waitForTimeout(450);
    await topSheet().locator('input[type=search]').fill(q);
    await page.waitForTimeout(250);
    await topSheet().locator('.result', { hasText: name }).first().click();
    await page.waitForTimeout(450);
  }
  const amounts = r.locator('[data-items] input');
  assert.equal(await amounts.count(), 3);
  await amounts.nth(0).fill('200'); // 114 kcal
  await amounts.nth(1).fill('40'); // 176.8 kcal
  await amounts.nth(2).fill('80'); // 20 kcal
  await page.waitForTimeout(300);
  assert.match(await r.locator('[data-total]').textContent(), /311/);
  await r.locator('[data-save]').click();
  await page.waitForTimeout(500);
  await page.locator('[data-t="meals"]').click();
  await page.waitForTimeout(400);
  assert.match(await page.locator('.card .result').first().textContent(), /Yoghurt bowl/);

  await page.goto(BASE + '#/today');
  await page.waitForTimeout(400);
  await page.locator('[data-meal="breakfast"] [data-add]').click();
  await topSheet().locator('[data-tab="meals"]').click();
  await page.waitForTimeout(400);
  await topSheet().locator('.result', { hasText: 'Yoghurt bowl' }).locator('[data-quick]').click();
  await page.waitForTimeout(400);
  // tweak: open, change granola to 60 g
  await topSheet().locator('.result', { hasText: 'Yoghurt bowl' }).click();
  await page.waitForTimeout(450);
  await topSheet().locator('[data-items] input').nth(1).fill('60');
  await topSheet().locator('select[data-meal]').selectOption('snacks');
  await topSheet().locator('[data-log]').click();
  await page.waitForTimeout(450);
  await closeTop();
  await settle();
  const expected = 1306 + 311 + (114 + 265.2 + 20);
  assert.ok(Math.abs((await eaten()) - expected) <= 1, `eaten ${await eaten()} vs ${expected}`);
  assert.equal(await page.locator('[data-meal="breakfast"] .item', { hasText: 'Yoghurt bowl' }).count(), 3);
  assert.equal(await page.locator('[data-meal="snacks"] .item', { hasText: 'Yoghurt bowl' }).count(), 3);
});

await step('water: quick add, custom, undo, animated glass', async () => {
  const wv = () => num('[data-wv]');
  await page.locator('[data-add="250"]').click();
  await page.locator('[data-add="500"]').click();
  await settle();
  assert.equal(await wv(), 0.75);
  await page.locator('[data-custom]').click();
  await page.waitForTimeout(450);
  await topSheet().locator('input').fill('1000');
  await topSheet().locator('[data-ok]').click();
  await settle();
  assert.equal(await wv(), 1.75);
  await page.locator('[data-undo]').click();
  await settle();
  assert.equal(await wv(), 0.75);
  const t = await page.locator('.glass .level').getAttribute('style');
  assert.match(t, /translateY\(86\.8px\)/); // 124 × (1 - 0.75/2.5)
});

await step('date switcher: previous day is independent and editable', async () => {
  await page.locator('[data-prev]').click();
  await settle();
  assert.equal(await eaten(), 0);
  assert.equal(await page.locator('.datesw .label span').textContent(), 'Yesterday');
  await page.locator('[data-meal="dinner"] [data-add]').click();
  await topSheet().locator('[data-tab="fav"]').click();
  await page.waitForTimeout(300);
  await topSheet().locator('.result', { hasText: 'Ground flaxseed' }).locator('[data-quick]').click();
  await page.waitForTimeout(300);
  await closeTop();
  await settle();
  assert.equal(await eaten(), 36); // 3 tsp = 7 g × 5.14
  await page.locator('[data-next]').click();
  await settle();
  assert.ok((await eaten()) > 2000);
  assert.ok(await page.locator('[data-next]').isDisabled());
});

await step('goals: macro grams show calories they add up to; changes apply to home', async () => {
  await page.goto(BASE + '#/settings');
  await page.waitForTimeout(500);
  await page.locator('[data-s="protein"]').fill('180');
  await page.locator('[data-s="protein"]').dispatchEvent('change');
  assert.equal(await page.locator('[data-mk]').textContent(), '2,275 kcal'); // 180*4+220*4+75*9
  assert.match(await page.locator('[data-mdiff]').textContent(), /75 kcal more/);
  await page.locator('[data-usemk]').click();
  await page.waitForTimeout(300);
  assert.equal(await page.locator('[data-s="kcal"]').inputValue(), '2275');
  await page.locator('[data-s="water"]').fill('3');
  await page.locator('[data-s="water"]').dispatchEvent('change');
  await page.locator('[data-micro="vitD"]').fill('15');
  await page.locator('[data-micro="vitD"]').dispatchEvent('change');
  assert.equal(await page.locator('[data-micro="fibre"]').inputValue(), '38');
  assert.equal(await page.locator('[data-upper="sodium"]').inputValue(), '2300');
  assert.equal(await page.locator('[data-micro="sodium"]').count(), 0, 'sodium has no target, only a limit');
  await page.locator('[data-upper="calcium"]').fill('100');
  await page.locator('[data-upper="calcium"]').dispatchEvent('change');
  await page.waitForTimeout(300);
  await page.goto(BASE + '#/today');
  await settle();
  assert.equal(await num('[data-goal]'), 2275);
  assert.equal(await page.locator('[data-macro="protein"] [data-g]').textContent(), '180');
  assert.equal(await page.locator('[data-wg]').textContent(), '3');
});

await step('micronutrients: daily bars flag low nutrients and missing data; weekly average', async () => {
  await page.goto(BASE + '#/nutrients');
  await settle();
  const vitD = page.locator('[data-k="vitD"]');
  assert.match(await vitD.locator('.bar-val').textContent(), /\/ 15 µg/);
  assert.equal(await vitD.locator('[data-pill]').textContent(), 'Low');
  const low = await num('[data-low]');
  assert.ok(low >= 1);
  assert.equal((await num('[data-low]')) + (await num('[data-mid]')) + (await num('[data-ok]')), 17);
  const na = page.locator('[data-k="sodium"]');
  assert.equal(await na.locator('[data-pill]').textContent(), 'Over limit');
  assert.match(await na.locator('.bar-val').textContent(), /\/ max 2,300 mg/);
  assert.match(await na.locator('.fill').getAttribute('class'), /bg-red/);
  const ca = page.locator('[data-k="calcium"]');
  assert.equal(await ca.locator('[data-pill]').textContent(), 'Over upper limit');
  assert.match(await ca.locator('[data-ul]').textContent(), /Above the upper limit of 100 mg/);
  for (const k of ['vitB12', 'iodine', 'selenium', 'ala', 'epadha']) assert.equal(await page.locator(`[data-k="${k}"]`).count(), 1);
  await page.locator('[data-m="week"]').click();
  await settle();
  assert.match(await page.locator('[data-foot]').textContent(), /Average of 2 logged days/);
  assert.equal(await page.locator('[data-k="fibre"] [data-days] i').count(), 7);
  assert.ok(!(await page.locator('[data-k="fibre"] [data-days]').isHidden()));
});

let backupPath;
await step('export JSON backup', async () => {
  await page.goto(BASE + '#/settings');
  await page.waitForTimeout(400);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('[data-export]').click()]);
  const dir = await mkdtemp(join(tmpdir(), 'fuel-'));
  backupPath = join(dir, dl.suggestedFilename());
  await dl.saveAs(backupPath);
  const json = JSON.parse(await readFile(backupPath, 'utf8'));
  assert.equal(json.app, 'macrotracker');
  assert.ok(json.data.entries.length >= 10);
  assert.ok(json.data.water.length === 2);
  assert.ok(json.data.recipes.length === 1);
  assert.ok(json.data.kv.some(([k, v]) => k === 'settings' && v.protein === 180));
});

await step('import JSON backup into a fresh install restores everything', async () => {
  const ctx2 = await browser.newContext({ ...iphone });
  const p2 = await ctx2.newPage();
  await p2.goto(BASE + '#/settings');
  await p2.waitForTimeout(600);
  await p2.locator('[data-file]').setInputFiles(backupPath);
  await p2.waitForTimeout(500);
  await p2.locator('.sheet.open [data-yes]').click();
  await p2.waitForTimeout(600);
  assert.equal(await p2.locator('[data-s="protein"]').inputValue(), '180');
  await p2.goto(BASE + '#/today');
  await p2.waitForTimeout(1300);
  assert.ok(Number((await p2.locator('[data-eaten]').textContent()).replace(/\D/g, '')) > 2000);
  // bad file is rejected without touching data
  const bad = join(tmpdir(), 'bad.json');
  await writeFile(bad, '{"hello":1}');
  await p2.goto(BASE + '#/settings');
  await p2.waitForTimeout(500);
  await p2.locator('[data-file]').setInputFiles(bad);
  await p2.waitForTimeout(400);
  assert.match(await p2.locator('#toast').textContent(), /Not a backup/);
  await ctx2.close();
});

await step('works offline after first load (service worker)', async () => {
  await page.goto(BASE + '#/today');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForTimeout(800);
  await ctx.setOffline(true);
  await page.reload();
  await page.waitForSelector('.hero');
  await settle();
  assert.ok((await eaten()) > 2000);
  await page.locator('[data-meal="snacks"] [data-add]').click();
  await topSheet().locator('input[type=search]').fill('banana');
  await page.waitForTimeout(400);
  assert.ok((await topSheet().locator('.result', { hasText: 'Bananas' }).count()) >= 1, 'generic search offline');
  assert.match(await topSheet().textContent(), /offline/i);
  await topSheet().locator('.result', { hasText: 'Bananas' }).first().click();
  await page.waitForTimeout(450);
  await topSheet().locator('[data-save]').click();
  await page.waitForTimeout(450);
  await closeTop();
  await page.goto(BASE + '#/nutrients');
  await page.waitForSelector('[data-k="vitC"]');
  await ctx.setOffline(false);
});

await step('upgrade from v1: old targets replaced, new nutrients filled into old entries', async () => {
  const c = await browser.newContext({ ...iphone });
  const p = await c.newPage();
  await p.goto(BASE + '#/settings');
  await p.waitForTimeout(800);
  // Simulate data saved by v1: old UK targets, no dataVersion, entry without the new nutrient keys.
  await p.evaluate(async () => {
    const db = await new Promise((r) => { const q = indexedDB.open('macrotracker', 1); q.onsuccess = () => r(q.result); });
    const put = (store, v, k) => new Promise((r) => { const t = db.transaction(store, 'readwrite'); t.objectStore(store).put(v, k); t.oncomplete = r; });
    const old = { kcal: 2000, protein: 150, carbs: 200, fat: 70, water: 2500, micros: { fibre: 30, potassium: 3500, magnesium: 300, folate: 200, vitC: 40, vitA: 700, vitK: 70, iron: 8.7, zinc: 9.5, calcium: 700, vitD: 10 } };
    await put('kv', old, 'settings');
    await put('kv', 1, 'dataVersion');
    const d = new Date(); const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const per100 = { kcal: 612.5, protein: 20, carbs: 20, fat: 46.88, fibre: null, potassium: null, magnesium: null, folate: null, vitC: null, vitA: null, vitK: null, iron: null, zinc: null, calcium: null, vitD: null };
    await put('entries', { id: 'e-old', date: key, meal: 'lunch', foodId: 'p-pb', name: 'Morrisons 100% smooth peanut butter', unit: 'g', amount: 100, per100, estimated: [], ts: 1 });
    const f = await new Promise((r) => { const q = db.transaction('foods').objectStore('foods').get('p-pb'); q.onsuccess = () => r(q.result); });
    f.per100 = { kcal: 612.5, protein: 20, carbs: 20, fat: 46.88, fibre: null, potassium: null, magnesium: null, folate: null, vitC: null, vitA: null, vitK: null, iron: null, zinc: null, calcium: null, vitD: null };
    await put('foods', f);
    db.close();
  });
  await p.reload();
  await p.waitForTimeout(1200);
  assert.equal(await p.locator('[data-micro="fibre"]').inputValue(), '38');
  assert.equal(await p.locator('[data-micro="vitC"]').inputValue(), '90');
  assert.equal(await p.locator('[data-s="kcal"]').inputValue(), '2000', 'calorie goal kept');
  await p.goto(BASE + '#/nutrients');
  await p.waitForTimeout(1300);
  // Morrisons 100% PB now has 5 mg sodium/100 g from the label.
  assert.equal(await p.locator('[data-k="sodium"] [data-v]').textContent(), '5');
  assert.ok(Number(await p.locator('[data-k="selenium"] [data-v]').textContent()) > 0, 'selenium estimated for old entry');
  await c.close();
});

await step('no JavaScript errors', async () => {
  assert.deepEqual(errors, []);
});

await browser.close();
server.close();
console.log(`\nAll ${passed} e2e checks passed.`);
