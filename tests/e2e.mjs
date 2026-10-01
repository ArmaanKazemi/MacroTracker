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
    if (u.includes('/api/v2/product/5000000000012')) return route.fulfill({ json: { status: 1, product: { ...OFF_PRODUCT, code: '5000000000012', product_name: 'Photo Scanned Bar' } } });
    if (u.includes('/api/v2/product/0123456789012')) return route.fulfill({ json: { status: 1, product: { ...OFF_PRODUCT, code: '0123456789012', product_name: 'UPC Oat Bar' } } });
    if (u.includes('/api/v2/product/')) return route.fulfill({ status: 404, json: { status: 0 } });
    if (u.includes('search.pl')) return route.fulfill({ json: { products: [OFF_PRODUCT] } });
    return route.abort();
  });
  // Newer search service: answers for "protein", unreachable otherwise (exercises the fallback).
  await ctx.route('https://search.openfoodfacts.org/**', (route) => {
    const u = route.request().url();
    if (/q=[^&]*protein/i.test(u)) return route.fulfill({ json: { hits: [{ ...OFF_PRODUCT, countries_tags: ['en:united-kingdom'] }] } });
    if (/q=code(:|%3A)5000000000017/i.test(u)) return route.fulfill({ json: { hits: [OFF_PRODUCT] } });
    if (/q=code/i.test(u)) return route.fulfill({ json: { hits: [] } });
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
await ctx.addInitScript(() => { window.__opened = []; window.__fuelOpenURL = (u) => window.__opened.push(u); });
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
  assert.equal(await page.locator('[data-remaining-label]').textContent(), 'Remaining');
});

await step('pre-loaded favourites are seeded', async () => {
  await page.locator('[data-meal="breakfast"] [data-add]').click();
  await topSheet().locator('[data-tab="mine"]').click();
  await page.waitForTimeout(300);
  const names = await topSheet().locator('.item-name').allTextContents();
  for (const n of ['Fage Total 0% Greek yoghurt', 'Impact Whey + Collagen protein powder', "Lizi's protein granola", 'Ground flaxseed', 'Morrisons 100% smooth peanut butter', 'Peanut butter powder', 'Naturya spirulina powder', 'Plenish oat milk', 'Raspberries, raw', 'Blueberries, raw']) {
    assert.ok(names.some((x) => x.includes(n)), `missing favourite ${n}`);
  }
  // one merged My foods tab: starred foods pinned first and marked
  assert.equal(await topSheet().locator('[data-tab="fav"]').count(), 0, 'no separate Favourites tab');
  assert.equal(await topSheet().locator('.result').first().locator('.star-mark').count(), 1);
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
  // 12-digit UPC codes are also tried as EAN-13 with a leading 0
  await topSheet().locator('[data-manual] input').fill('123456789012');
  await topSheet().locator('[data-manual] button').click();
  await page.waitForTimeout(700);
  assert.equal(await topSheet().locator('h2').textContent(), 'UPC Oat Bar');
  await closeTop();
  // product API down: the search service answers instead
  await page.route('https://world.openfoodfacts.org/**', (r) => r.abort());
  await topSheet().locator('[data-manual] input').fill('5000000000017');
  await topSheet().locator('[data-manual] button').click();
  await page.waitForTimeout(800);
  assert.equal(await topSheet().locator('h2').textContent(), 'Test Protein Bar');
  await closeTop();
  await page.unroute('https://world.openfoodfacts.org/**');
  // the photo route is offered alongside the live camera, and reads a real EAN-13 from an image
  assert.equal(await topSheet().locator('[data-photo]').getAttribute('capture'), 'environment');
  const png = await page.evaluate(() => {
    // Draw EAN-13 5000000000012 (quiet zones, guards, L/G/R patterns by first digit).
    const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
    const G = L.map((p) => [...p].map((b) => (b === '0' ? '1' : '0')).reverse().join(''));
    const R = L.map((p) => [...p].map((b) => (b === '0' ? '1' : '0')).join(''));
    const PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];
    const d = '5000000000012'.split('').map(Number);
    let bits = '101';
    for (let i = 1; i <= 6; i++) bits += (PARITY[d[0]][i - 1] === 'L' ? L : G)[d[i]];
    bits += '01010';
    for (let i = 7; i <= 12; i++) bits += R[d[i]];
    bits += '101';
    const m = 6, c = document.createElement('canvas');
    c.width = (bits.length + 22) * m; c.height = 360;
    const x = c.getContext('2d');
    x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
    x.fillStyle = '#000';
    [...bits].forEach((b, i) => { if (b === '1') x.fillRect((i + 11) * m, 40, m, 280); });
    return c.toDataURL('image/png').split(',')[1];
  });
  await topSheet().locator('[data-photo]').setInputFiles({ name: 'barcode.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  await topSheet().locator('h2', { hasText: 'Photo Scanned Bar' }).waitFor({ timeout: 8000 });
  await closeTop();
  await closeTop();
});

await step('scan tab starts the live scanner with photo as an option; scanned product: save to My foods, edit values, corrected copy used next time', async () => {
  await page.goto(BASE + '#/today');
  await settle();
  await page.locator('[data-meal="snacks"] [data-add]').click();
  await page.waitForTimeout(300);
  let opened = false;
  const onChooser = () => { opened = true; };
  page.on('filechooser', onChooser);
  await topSheet().locator('[data-tab="scan"]').click();
  await page.waitForTimeout(500);
  assert.equal(opened, false, 'the photo camera does not open by itself');
  assert.equal(await topSheet().locator('.scan-box video').count(), 1, 'live scanner shown');
  const chooser = page.waitForEvent('filechooser', { timeout: 3000 });
  await topSheet().locator('[data-take]').click();
  assert.ok(await chooser, 'Take a photo opens the camera when tapped');
  page.off('filechooser', onChooser);
  await topSheet().locator('[data-manual] input').fill('5000000000012');
  await topSheet().locator('[data-manual] button').click();
  await topSheet().locator('h2', { hasText: 'Photo Scanned Bar' }).waitFor({ timeout: 5000 });
  const d = topSheet();
  assert.match(await d.textContent(), /check them against the pack/);
  // save without logging
  await d.locator('[data-save-mine]').click();
  await page.waitForTimeout(300);
  assert.equal(await d.locator('[data-save-mine]').count(), 0, 'saved');
  // correct the values from the label
  await d.locator('[data-edit-values]').click();
  await page.waitForTimeout(450);
  const f = topSheet();
  await f.locator('[data-n="kcal"]').fill('320');
  await f.locator('[data-save]').click();
  await page.waitForTimeout(450);
  assert.match(await topSheet().locator('[data-preview]').textContent(), /^192/, '320 kcal/100 g × 60 g serving');
  await closeTop();
  // scanning it again uses your corrected copy
  await topSheet().locator('[data-manual] input').fill('5000000000012');
  await topSheet().locator('[data-manual] button').click();
  await page.waitForTimeout(500);
  assert.match(await topSheet().locator('[data-preview]').textContent(), /^192/);
  await closeTop();
  assert.match(await topSheet().locator('[data-status]').textContent(), /your saved copy/);
  // and it's in My foods
  await topSheet().locator('[data-tab="mine"]').click();
  await page.waitForTimeout(300);
  assert.equal(await topSheet().locator('.result', { hasText: 'Photo Scanned Bar' }).count(), 1);
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
  assert.equal(await f.locator('[data-salt]').count(), 0, 'no salt field: sodium is entered in mg');
  await f.locator('[data-n="sodium"]').fill('600'); // mg per 50 g
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
  await topSheet().locator('[data-tab="mine"]').click();
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
  assert.match(await page.locator('[data-mdiff]').textContent(), /75 kcal over/);
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

// Real touch events (like an iPhone), via the Chrome DevTools protocol.
let cdp;
async function swipeLeft(locator, fraction) {
  cdp ||= await ctx.newCDPSession(page);
  await locator.evaluate((e) => e.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(150);
  const box = await locator.boundingBox();
  const y = box.y + box.height / 2;
  const x = box.x + box.width - 20;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  const steps = 10;
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - (box.width * fraction * i) / steps, y }] });
    await page.waitForTimeout(16);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(450);
}

await step('swipe left to delete foods and saved meals (with undo)', async () => {
  await page.goto(BASE + '#/foods');
  await page.waitForTimeout(500);
  await page.locator('[data-t="mine"]').click();
  await page.waitForTimeout(300);
  const names = () => page.locator('.card .item-name').allTextContents();
  const before = (await names()).length;
  // Long swipe deletes immediately
  await swipeLeft(page.locator('.swipe', { hasText: 'Spirulina' }), 0.8);
  await page.waitForTimeout(300);
  assert.ok(!(await names()).some((n) => /spirulina/i.test(n)));
  assert.equal((await names()).length, before - 1);
  await page.locator('#toast button', { hasText: 'Undo' }).click();
  await page.waitForTimeout(400);
  assert.ok((await names()).some((n) => /spirulina/i.test(n)), 'undo restores the food');
  // Short swipe reveals Delete; tapping the row closes it without opening the food
  const row = page.locator('.swipe', { hasText: 'Plenish' });
  await swipeLeft(row, 0.3);
  assert.ok(await row.evaluate((w) => w.classList.contains('open')));
  const bb = await row.boundingBox();
  await page.touchscreen.tap(bb.x + bb.width - 30, bb.y + bb.height / 2); // the revealed Delete area
  await page.waitForTimeout(500);
  assert.ok(!(await names()).some((n) => n.includes('Plenish')));
  assert.equal(await page.locator('.sheet.open').count(), 0, 'swiping never opens the food sheet');
  // A plain tap still opens the food
  await page.locator('.card .result', { hasText: 'Ground flaxseed' }).click();
  await page.waitForTimeout(450);
  assert.equal(await topSheet().locator('h2').textContent(), 'Ground flaxseed');
  await closeTop();
  // Saved meals too
  await page.locator('[data-t="meals"]').click();
  await page.waitForTimeout(400);
  await swipeLeft(page.locator('.swipe', { hasText: 'Yoghurt bowl' }), 0.8);
  await page.waitForTimeout(300);
  assert.equal(await page.locator('.card .result', { hasText: 'Yoghurt bowl' }).count(), 0);
  await page.locator('#toast button', { hasText: 'Undo' }).click();
  await page.waitForTimeout(400);
  assert.equal(await page.locator('.card .result', { hasText: 'Yoghurt bowl' }).count(), 1);
  // And inside the add-food sheet (My foods tab)
  await page.goto(BASE + '#/today');
  await page.waitForTimeout(400);
  await page.locator('[data-meal="snacks"] [data-add]').click();
  await topSheet().locator('[data-tab="mine"]').click();
  await page.waitForTimeout(400);
  await swipeLeft(topSheet().locator('.swipe', { hasText: 'Overnight oats' }), 0.8);
  await page.waitForTimeout(300);
  assert.equal(await topSheet().locator('.result', { hasText: 'Overnight oats' }).count(), 0);
  await closeTop();
});

await step('Apple Health: sends only new amounts to the Shortcut, undo resends', async () => {
  await page.goto(BASE + '#/today');
  await page.waitForTimeout(500);
  assert.ok(await page.locator('[aria-label="Apple Health"]').isHidden(), 'hidden until enabled');
  await page.goto(BASE + '#/settings');
  await page.waitForTimeout(400);
  await page.locator('[data-henabled]').check();
  await page.waitForTimeout(200);
  await page.locator('[data-hguide]').click();
  await page.waitForTimeout(400);
  assert.match(await topSheet().textContent(), /Log Health Sample/);
  assert.match(await topSheet().textContent(), /Dietary Energy/);
  await closeTop();
  await page.goto(BASE + '#/today');
  await settle();
  const card = page.locator('[aria-label="Apple Health"]');
  assert.ok(await card.isVisible());
  const eatenNow = await eaten();
  await card.locator('[data-hsend]').click();
  await page.waitForTimeout(900);
  const urls = await page.evaluate(() => window.__opened);
  assert.equal(urls.length, 1);
  assert.ok(urls[0].startsWith('shortcuts://run-shortcut?name=Pithos%20to%20Health&input=text&text='));
  const payload = JSON.parse(decodeURIComponent(urls[0].split('&text=')[1]));
  assert.ok(Math.abs(payload.kcal - eatenNow) <= 1, `sent ${payload.kcal} vs eaten ${eatenNow}`);
  assert.equal(payload.water, 750);
  assert.match(payload.date, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  for (const k of ['protein', 'carbs', 'fat', 'sodium', 'potassium', 'vitB12', 'selenium']) assert.equal(typeof payload[k], 'number', k);
  assert.match(await card.locator('[data-hstatus]').textContent(), /Up to date/);
  assert.ok(await card.locator('[data-hsend]').isDisabled());
  // Log more: only the new amount is sent
  await page.locator('[data-add="250"]').click();
  await page.waitForTimeout(500);
  await card.locator('[data-hsend]').click();
  await page.waitForTimeout(900);
  const p2 = JSON.parse(decodeURIComponent((await page.evaluate(() => window.__opened))[1].split('&text=')[1]));
  assert.equal(p2.water, 250);
  assert.equal(p2.kcal, 0);
  // "Didn't arrive" lets the same amount be sent again
  await card.locator('[data-hundo]').click();
  await page.waitForTimeout(400);
  assert.ok(!(await card.locator('[data-hsend]').isDisabled()));
  await card.locator('[data-hsend]').click();
  await page.waitForTimeout(900);
  const p3 = JSON.parse(decodeURIComponent((await page.evaluate(() => window.__opened))[2].split('&text=')[1]));
  assert.equal(p3.water, 250);
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
  assert.ok(Number((await p.locator('[data-k="potassium"] [data-v]').textContent()).replace(/,/g, '')) > 0, 'old "no data" potassium filled in');
  await c.close();
});

await step('one-off custom food: logged but not saved to My foods (choice remembered)', async () => {
  await page.goto(BASE + '#/today');
  await settle();
  const before = await eaten();
  await page.locator('[data-meal="dinner"] [data-add]').click();
  await topSheet().locator('input[type=search]').fill('wedding cake');
  await page.waitForTimeout(300);
  await topSheet().locator('button', { hasText: 'Create custom food' }).click();
  await page.waitForTimeout(450);
  const f = topSheet();
  assert.ok(await f.locator('[data-keep]').isChecked(), 'saves by default');
  await f.locator('[data-keep]').uncheck();
  assert.equal(await f.locator('[data-save]').textContent(), 'Continue to log');
  assert.ok(await f.locator('[data-fav-row]').isHidden());
  assert.equal(await f.locator('[data-f="name"]').inputValue(), 'wedding cake');
  await f.locator('[data-n="kcal"]').fill('400');
  await f.locator('[data-n="protein"]').fill('4');
  await f.locator('[data-save]').click();
  await page.waitForTimeout(500);
  const d = topSheet();
  assert.equal(await d.locator('h2').textContent(), 'wedding cake');
  await d.locator('input.big-input').fill('150');
  await d.locator('[data-save]').click();
  await page.waitForTimeout(450);
  // not in My foods, not in Recent
  await topSheet().locator('[data-tab="mine"]').click();
  await page.waitForTimeout(400);
  assert.equal(await topSheet().locator('.result', { hasText: 'wedding cake' }).count(), 0);
  await closeTop();
  await settle();
  assert.equal(await eaten(), before + 600);
  assert.equal(await page.locator('[data-meal="dinner"] .item', { hasText: 'wedding cake' }).count(), 1);
  // editing the logged one-off still works (uses its own copy of the nutrition)
  await page.locator('[data-meal="dinner"] .item', { hasText: 'wedding cake' }).click();
  await page.waitForTimeout(450);
  await topSheet().locator('input.big-input').fill('100');
  await topSheet().locator('[data-save]').click();
  await settle();
  assert.equal(await eaten(), before + 400);
  // the switch remembers "off" next time; the Foods screen form never shows it
  await page.locator('[data-fab]').click();
  await page.waitForTimeout(450);
  await topSheet().locator('button', { hasText: 'Create custom food' }).click();
  await page.waitForTimeout(450);
  assert.ok(!(await topSheet().locator('[data-keep]').isChecked()));
  await closeTop();
  await closeTop();
  await page.goto(BASE + '#/foods');
  await page.waitForTimeout(400);
  await page.locator('[data-nf]').click();
  await page.waitForTimeout(450);
  assert.equal(await topSheet().locator('[data-keep]').count(), 0);
  await closeTop();
});

await step('sugars and saturates: entered on custom foods, shown under carbs and fat, flagged over the limit', async () => {
  await page.goto(BASE + '#/today');
  await settle();
  const sub = async (k) => Number((await page.locator(`[data-sub="${k}"] [data-v]`).textContent()).replace(/,/g, ''));
  const [sug0, sat0] = [await sub('sugars'), await sub('satfat')];
  await page.locator('[data-meal="snacks"] [data-add]').click();
  await topSheet().locator('input[type=search]').fill('fudge');
  await page.waitForTimeout(300);
  await topSheet().locator('button', { hasText: 'Create custom food' }).click();
  await page.waitForTimeout(450);
  const f = topSheet();
  await f.locator('[data-n="kcal"]').fill('450');
  await f.locator('[data-n="carbs"]').fill('70');
  await f.locator('[data-n="sugars"]').fill('60');
  await f.locator('[data-n="fat"]').fill('18');
  await f.locator('[data-n="satfat"]').fill('12');
  await f.locator('[data-save]').click();
  await page.waitForTimeout(500);
  const d = topSheet();
  await d.locator('input.big-input').fill('200');
  await page.waitForTimeout(150);
  assert.match(await d.locator('[data-preview] [data-sub="sugars"]').textContent(), /sugars 120g/);
  assert.match(await d.locator('[data-preview] [data-sub="satfat"]').textContent(), /sat\. 24g/);
  await d.locator('[data-save]').click();
  await page.waitForTimeout(450);
  await closeTop();
  await settle();
  assert.ok(Math.abs(await sub('sugars') - sug0 - 120) < 0.6, 'sugars added to the carbs card');
  assert.ok(Math.abs(await sub('satfat') - sat0 - 24) < 0.6, 'saturates added to the fat card');
  assert.match(await page.locator('[data-sub="sugars"]').getAttribute('class'), /over/, 'over 90 g flagged');
  assert.match(await page.locator('[data-sub="satfat"]').getAttribute('class'), /over/, 'over 20 g flagged');
  assert.equal(await page.locator('[data-sub="sugars"] [data-g]').textContent(), '90');
});

await step('serving sizes can be added and deleted on a generic food (with undo)', async () => {
  await page.goto(BASE + '#/today');
  await settle();
  await page.locator('[data-meal="lunch"] [data-add]').click();
  await topSheet().locator('input[type=search]').fill('lentils');
  await page.waitForTimeout(300);
  await topSheet().locator('.result').first().click();
  await page.waitForTimeout(450);
  const d = topSheet();
  assert.ok(await d.locator('[data-edit-servings]').isHidden(), 'nothing to edit yet');
  await d.locator('[data-add-serving]').click();
  await page.waitForTimeout(400);
  await topSheet().locator('[data-l]').fill('1 bowl');
  await topSheet().locator('[data-a]').fill('180');
  await topSheet().locator('[data-ok]').click();
  await page.waitForTimeout(450);
  const detail = topSheet();
  assert.match(await detail.locator('select[data-unit]').textContent(), /1 bowl/);
  await detail.locator('[data-edit-servings]').click();
  await page.waitForTimeout(400);
  await topSheet().locator('[data-rm]').first().click();
  await page.waitForTimeout(450);
  assert.doesNotMatch(await detail.locator('select[data-unit]').textContent(), /1 bowl/, 'serving removed');
  assert.equal(await detail.locator('select[data-unit]').inputValue(), 'unit', 'falls back to grams');
  await page.locator('#toast button').click();
  await page.waitForTimeout(400);
  assert.match(await detail.locator('select[data-unit]').textContent(), /1 bowl/, 'undo restores it');
  // edit the serving in place
  await detail.locator('select[data-unit]').selectOption({ index: 1 });
  await detail.locator('input.big-input').fill('2');
  await detail.locator('[data-edit-servings]').click();
  await page.waitForTimeout(400);
  await topSheet().locator('[data-sl]').fill('1 big bowl');
  await topSheet().locator('[data-sa]').fill('250');
  await topSheet().locator('[data-sa]').blur();
  await page.waitForTimeout(450);
  await closeTop(); // back to the food sheet
  assert.match(await detail.locator('select[data-unit]').textContent(), /1 big bowl \(250g\)/);
  assert.equal(await detail.locator('select[data-unit]').inputValue(), '0', 'still selected after renaming');
  assert.match(await detail.locator('[data-preview]').textContent(), /500/, '2 × 250 g = 500 kcal (lentils ~100 kcal/100 g)');
  await closeTop(); await closeTop();
  await settle();
});

await step('meal page, collapsible meal cards and "same as yesterday"', async () => {
  // log two foods into yesterday's snacks
  await page.goto(BASE + '#/today');
  await settle();
  const [n1, n2, add, copied] = await page.evaluate(async () => {
    const store = await import('./js/store.js'); const ui = await import('./js/ui.js');
    const foods = (await store.getFoods()).filter((f) => f.source !== 'generic').slice(0, 2);
    const y = ui.addDays(ui.todayKey(), -1);
    for (const f of foods) await store.logFood(f, { date: y, meal: 'snacks', amount: 100 });
    const nut = await import('./js/nutrients.js');
    const all = (await store.entriesFor(y)).filter((e) => e.meal === 'snacks');
    window.dispatchEvent(new Event('data-changed'));
    return [foods[0].name, foods[1].name, Math.round(nut.totals(all).kcal.value), all.length];
  });
  await settle();
  const before = await eaten();
  const itemsBefore = await page.locator('[data-meal="snacks"] .item').count();
  // add sheet offers yesterday's snacks and copies them in one tap
  await page.locator('[data-meal="snacks"] [data-add]').click();
  await page.waitForTimeout(500);
  const same = topSheet().locator('.same-y');
  assert.ok((await same.textContent()).includes(`${n1}, ${n2}`));
  await same.locator('[data-copy]').click();
  await page.waitForTimeout(450);
  await closeTop();
  await settle();
  assert.equal(await eaten(), before + add, 'both foods copied at the same amounts');
  assert.equal(await page.locator('[data-meal="snacks"] .item').count(), itemsBefore + copied);
  // collapse hides the list and remembers it
  await page.locator('[data-meal="snacks"] [data-toggle]').click();
  await page.waitForTimeout(450);
  assert.match(await page.locator('[data-meal="snacks"]').getAttribute('class'), /collapsed/);
  assert.match(await page.locator('[data-meal="snacks"] [data-sub]').textContent(), new RegExp(`${itemsBefore + copied} items`));
  await page.reload(); await settle();
  assert.match(await page.locator('[data-meal="snacks"]').getAttribute('class'), /collapsed/, 'remembered');
  // meal page shows the foods and nutrition, and can remove one (with undo)
  await page.locator('[data-meal="snacks"] [data-open]').click();
  await page.waitForTimeout(600);
  assert.equal(await page.locator('.meal-top .title').textContent(), 'Snacks');
  assert.ok(Number((await page.locator('.meal-sum [data-kcal]').textContent()).replace(/,/g, '')) >= add);
  assert.equal(await page.locator('.meal-items .item').count(), itemsBefore + copied);
  assert.match(await page.locator('[data-info]').textContent(), /Protein[\s\S]*of which sugars[\s\S]*of which saturates[\s\S]*Sodium/);
  await page.locator('.meal-items .item').last().locator('[data-del]').click();
  await page.waitForTimeout(450);
  assert.equal(await page.locator('.meal-items .item').count(), itemsBefore + copied - 1);
  await page.locator('#toast button').click();
  await page.waitForTimeout(450);
  assert.equal(await page.locator('.meal-items .item').count(), itemsBefore + copied, 'undo restores it');
  // back to Today
  await page.locator('.meal-top [data-back]').click();
  await settle();
  assert.equal(await eaten(), before + add);
  // tidy: expand again for later steps
  await page.locator('[data-meal="snacks"] [data-toggle]').click();
});

await step('swipe a logged food off a meal on Today (with undo)', async () => {
  await page.goto(BASE + '#/today');
  await settle();
  const before = await eaten();
  const rows = page.locator('[data-meal="snacks"] .swipe');
  const n = await rows.count();
  assert.ok(n > 0);
  const kcal = Number((await rows.last().locator('.item-kcal').textContent()).replace(/[^0-9.]/g, ''));
  await swipeLeft(rows.last(), 0.8);
  await page.waitForTimeout(600);
  await settle();
  assert.equal(await rows.count(), n - 1);
  assert.ok(Math.abs(await eaten() - (before - kcal)) <= 1, 'calories drop by the removed food');
  await page.locator('#toast button').click();
  await settle();
  assert.equal(await rows.count(), n, 'undo puts it back');
  assert.equal(await eaten(), before);
  // calorie arc: green right up to the goal, red only once it's passed
  const goal = await num('[data-goal]');
  const arc = await page.locator('.arc-bar').getAttribute('class');
  assert.match(arc, before > goal ? /c-red/ : /c-green/);
});

await step('goals: macros turn red until balanced to the calorie goal', async () => {
  await page.goto(BASE + '#/settings');
  await settle();
  const saved = await page.evaluate(() => ['kcal', 'protein', 'carbs', 'fat'].map((k) => document.querySelector(`[data-s="${k}"]`).value));
  await page.locator('[data-s="kcal"]').fill('1900');
  await page.locator('[data-s="kcal"]').dispatchEvent('change');
  await page.waitForTimeout(200);
  assert.match(await page.locator('[data-s="carbs"]').getAttribute('class'), /bad/, 'red while unbalanced');
  assert.ok(await page.locator('[data-fix]').isVisible());
  await page.locator('[data-balance]').click();
  await page.waitForTimeout(300);
  const [p, c, f] = await page.evaluate(() => ['protein', 'carbs', 'fat'].map((k) => Number(document.querySelector(`[data-s="${k}"]`).value)));
  assert.equal(p, Number(saved[1]), 'protein kept');
  assert.ok(Math.abs(p * 4 + c * 4 + f * 9 - 1900) < 10, 'adds up to 1900');
  assert.doesNotMatch(await page.locator('[data-s="carbs"]').getAttribute('class'), /bad/);
  assert.ok(await page.locator('[data-fix]').isHidden());
  // restore the earlier goals for the remaining steps
  for (const [i, k] of ['kcal', 'protein', 'carbs', 'fat'].entries()) {
    await page.locator(`[data-s="${k}"]`).fill(saved[i]);
    await page.locator(`[data-s="${k}"]`).dispatchEvent('change');
  }
  await page.waitForTimeout(200);
});

await step('branded search falls back to the classic OFF search, and offers Try again when both are down', async () => {
  await page.goto(BASE + '#/today');
  await settle();
  await page.locator('[data-meal="lunch"] [data-add]').click();
  // one list ranked by relevance, no generic/branded sections
  await topSheet().locator('input[type=search]').fill('protein bar');
  await topSheet().locator('[data-results] .result', { hasText: 'Test Protein Bar' }).waitFor({ timeout: 5000 });
  assert.equal(await topSheet().locator('[data-list] .list-h').count(), 0, 'no category headings');
  assert.match(await topSheet().locator('[data-results] .result').first().textContent(), /Test Protein Bar/, 'best match first');
  await topSheet().locator('input[type=search]').fill('raspberries');
  await page.waitForTimeout(300);
  assert.match(await topSheet().locator('[data-results] .result').first().textContent(), /Raspberries, raw/, 'your saved food ranks first');
  // new service unreachable for this query -> classic search.pl answers
  await topSheet().locator('input[type=search]').fill('test bar');
  await topSheet().locator('.result', { hasText: 'Test Protein Bar' }).waitFor({ timeout: 5000 });
  // both down -> friendly message and a retry button that works once OFF is back
  await page.route('https://world.openfoodfacts.org/**', (r) => r.abort());
  await topSheet().locator('input[type=search]').fill('granola bar');
  await topSheet().locator('[data-off-retry]').waitFor({ timeout: 5000 });
  assert.match(await topSheet().locator('[data-off]').textContent(), /didn't load/);
  await page.unroute('https://world.openfoodfacts.org/**');
  await topSheet().locator('[data-off-retry]').click();
  await topSheet().locator('[data-results] .result', { hasText: 'Test Protein Bar' }).waitFor({ timeout: 5000 });
  await closeTop();
});

await step('quick log: type several foods and your own values, log them all at once', async () => {
  await page.goto(BASE + '#/today');
  await settle();
  const before = await eaten();
  await page.locator('[data-meal="dinner"] [data-add]').click();
  await page.waitForTimeout(400);
  await topSheet().locator('[data-quicklog]').click();
  await page.waitForTimeout(400);
  const q = topSheet();
  await q.locator('.ql-text').fill('1 scoop impact whey, 200g raspberries\nwrap 450kcal 35p 40c 12f sodium 800mg\nxyzzy');
  await q.locator('.ql-total').waitFor({ timeout: 4000 });
  assert.equal(await q.locator('.ql-row').count(), 4);
  assert.match(await q.locator('.ql-row').nth(0).textContent(), /Impact Whey/);
  assert.match(await q.locator('.ql-row').nth(1).textContent(), /Raspberries/);
  assert.match(await q.locator('.ql-row').nth(2).textContent(), /Wrap[\s\S]*450[\s\S]*Sodium 800mg/);
  assert.match(await q.locator('.ql-row').nth(3).textContent(), /No match for “xyzzy”/);
  // change an amount before logging
  await q.locator('.ql-row').nth(1).locator('.ql-amt input').fill('100');
  await q.locator('.ql-row').nth(1).locator('.ql-amt input').dispatchEvent('change');
  await page.waitForTimeout(500);
  assert.equal(await q.locator('[data-log]').textContent(), 'Log 3 items');
  await q.locator('[data-log]').click();
  await settle();
  assert.equal(await eaten(), before + 96 + 25 + 450, 'whey scoop + 100 g raspberries + typed wrap');
  const wrap = await page.evaluate(async () => {
    const store = await import('./js/store.js'); const ui = await import('./js/ui.js');
    return (await store.entriesFor(ui.todayKey())).find((e) => e.name === 'Wrap');
  });
  assert.equal(wrap.meal, 'dinner');
  assert.equal(wrap.per100.sodium, 800);
  assert.equal(wrap.per100.protein, 35);
  // undo removes all three
  await page.locator('#toast button').click();
  await settle();
  assert.equal(await eaten(), before);
});

await step('water & supplements share a swipe card; supplements: add, tick off (counts towards nutrients), untick, edit', async () => {
  await page.goto(BASE + '#/nutrients');
  await page.waitForTimeout(1300); // let the numbers finish counting up
  const vitD = async () => Number((await page.locator('[data-k="vitD"] [data-v]').textContent()).replace(/,/g, ''));
  const before = await vitD();
  await page.goto(BASE + '#/today');
  await settle();
  const daily = page.locator('.daily');
  assert.equal(await daily.locator('.daily-page').count(), 2, 'one card, two pages');
  assert.equal(await page.locator('.section-h span', { hasText: /^Supplements$/ }).count(), 0, 'no separate supplements section');
  // tap the Supplements tab to swipe across
  await daily.locator('[data-page="1"]').click();
  await page.waitForTimeout(600);
  assert.equal(await daily.locator('[data-page="1"]').getAttribute('aria-selected'), 'true');
  const card = page.locator('.supps');
  await card.locator('[data-add-supp]').click();
  await page.waitForTimeout(400);
  const s = topSheet();
  await s.locator('[data-name]').fill('Vitamin D3');
  await s.locator('[data-dose]').fill('1 capsule');
  await s.locator('[data-text]').fill('vitamin d 25µg, vitamin k 100mcg');
  assert.match(await s.locator('[data-parsed]').textContent(), /Vitamin D 25µg · Vitamin K 100µg/);
  await s.locator('[data-save]').click();
  await settle();
  const pill = card.locator('.supp-pill', { hasText: 'Vitamin D3' });
  assert.match(await pill.textContent(), /1 capsule/);
  assert.equal(await pill.getAttribute('aria-checked'), 'false');
  const kcal = await eaten();
  await pill.click();
  await settle();
  assert.equal(await pill.getAttribute('aria-checked'), 'true');
  assert.match(await card.locator('[data-count]').textContent(), /1 of 1 taken/);
  assert.equal(await daily.locator('[data-supp-badge]').textContent(), '1/1');
  assert.equal(await eaten(), kcal, 'no calories added');
  assert.equal(await page.locator('[data-meal] .item', { hasText: 'Vitamin D3' }).count(), 0, 'not shown in a meal');
  await page.goto(BASE + '#/nutrients');
  await page.waitForTimeout(1300);
  assert.ok(Math.abs(await vitD() - (before + 25)) < 0.11, 'counts towards vitamin D');
  await page.goto(BASE + '#/today');
  await settle();
  assert.equal(await daily.locator('[data-page="1"]').getAttribute('aria-selected'), 'true', 'remembers the page');
  await card.locator('.supp-pill', { hasText: 'Vitamin D3' }).click();
  await settle();
  assert.equal(await card.locator('.supp-pill', { hasText: 'Vitamin D3' }).getAttribute('aria-checked'), 'false', 'untick removes it');
  // edit mode: tapping opens the editor instead of ticking
  await card.locator('[data-supp-edit]').click();
  await card.locator('.supp-pill', { hasText: 'Vitamin D3' }).click();
  await page.waitForTimeout(400);
  await topSheet().locator('[data-dose]').fill('2 capsules');
  await topSheet().locator('[data-save]').click();
  await settle();
  assert.match(await card.locator('.supp-pill', { hasText: 'Vitamin D3' }).textContent(), /2 capsules/);
  await card.locator('[data-supp-edit]').click(); // Done
  // back to the water page for the next steps
  await daily.locator('[data-page="0"]').click();
  await page.waitForTimeout(600);
});

await step('water jar overflows once the goal is beaten', async () => {
  await page.goto(BASE + '#/today');
  await settle();
  const glass = page.locator('.glass');
  const goal = Number(await page.locator('[data-wg]').textContent()) * 1000;
  let have = Number(await page.locator('[data-wv]').textContent()) * 1000;
  while (have <= goal) { await page.locator('[data-add="500"]').click(); await page.waitForTimeout(250); have += 500; }
  await settle();
  assert.match(await glass.getAttribute('class'), /\bover\b/);
  assert.match(await page.locator('[data-wleft]').textContent(), /Overflowing: .* ml past your goal/);
  assert.equal(await glass.locator('.spill').evaluate((g) => getComputedStyle(g).opacity), '1');
  assert.equal(await glass.locator('.bead').count(), 0, 'no droplets sitting on the jar');
  assert.equal(await glass.locator('.spill .stream').count(), 0, 'no dashed streams');
  // drops replay when you drink more, the pool just stays
  await page.locator('[data-add="250"]').click();
  await page.waitForTimeout(700);
  const moving = await glass.locator('.trickle').first().evaluate((g) => g.getCTM().f !== 0 || Number(getComputedStyle(g).opacity) > 0);
  assert.ok(moving, 'overflow drops running');
  await page.waitForTimeout(2800);
  assert.equal(await glass.locator('.puddle').evaluate((e) => getComputedStyle(e).transform), 'none', 'pool stays');
});

await step('central + button opens add food; appearance switch applies themes', async () => {
  await page.goto(BASE + '#/today');
  await page.waitForTimeout(400);
  await page.locator('[data-fab]').click();
  await page.waitForTimeout(450);
  assert.match(await topSheet().locator('h2').textContent(), /^Add to (Breakfast|Lunch|Dinner|Snacks)$/);
  await closeTop();
  await page.goto(BASE + '#/settings');
  await page.waitForTimeout(400);
  await page.locator('[data-theme="dark"]').click();
  await page.waitForTimeout(200);
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark');
  await page.reload();
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark', 'theme survives reload');
  await page.locator('[data-theme="system"]').click();
  await page.waitForTimeout(200);
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), undefined);
});

await step('no JavaScript errors', async () => {
  assert.deepEqual(errors, []);
});

await browser.close();
server.close();
console.log(`\nAll ${passed} e2e checks passed.`);
