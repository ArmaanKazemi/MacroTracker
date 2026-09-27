// Renders the app icons (original artwork: two concentric progress arcs) to PNG.
// Usage: node tools/make-icons.mjs   (needs Playwright + Chromium)
import { chromium } from 'playwright';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'app', 'icons');

function svg(size, { maskable = false, rounded = false } = {}) {
  const s = maskable ? 0.62 : 0.78; // keep artwork inside the maskable safe zone
  const c = size / 2;
  const r1 = (size * s) / 2 - size * 0.06;
  const w1 = size * 0.1;
  const r2 = r1 - w1 * 1.35;
  const w2 = size * 0.075;
  const arc = (r, frac) => {
    const a = frac * 2 * Math.PI;
    const x = c + r * Math.sin(a);
    const y = c - r * Math.cos(a);
    return `M ${c} ${c - r} A ${r} ${r} 0 ${frac > 0.5 ? 1 : 0} 1 ${x.toFixed(2)} ${y.toFixed(2)}`;
  };
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5dffb4"/><stop offset="1" stop-color="#12c874"/></linearGradient>
      <radialGradient id="bg" cx="0.5" cy="0.35" r="0.75"><stop offset="0" stop-color="#16191e"/><stop offset="1" stop-color="#050607"/></radialGradient>
    </defs>
    <rect width="${size}" height="${size}" rx="${rounded ? size * 0.22 : 0}" fill="url(#bg)"/>
    <circle cx="${c}" cy="${c}" r="${r1}" fill="none" stroke="#1d2127" stroke-width="${w1}"/>
    <path d="${arc(r1, 0.74)}" fill="none" stroke="url(#g)" stroke-width="${w1}" stroke-linecap="round"/>
    <circle cx="${c}" cy="${c}" r="${r2}" fill="none" stroke="#1d2127" stroke-width="${w2}"/>
    <path d="${arc(r2, 0.52)}" fill="none" stroke="#4aa8ff" stroke-width="${w2}" stroke-linecap="round"/>
  </svg>`;
}

const exe = existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
const browser = await chromium.launch({ executablePath: exe });
const page = await browser.newPage({ deviceScaleFactor: 1 });
const jobs = [
  ['icon-192.png', 192, {}],
  ['icon-512.png', 512, {}],
  ['maskable-512.png', 512, { maskable: true }],
  ['apple-touch-icon.png', 180, {}],
  ['preview.png', 512, { rounded: true }],
];
for (const [name, size, opts] of jobs) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg(size, opts)}</body></html>`);
  await page.locator('svg').screenshot({ path: join(out, name), omitBackground: true });
  console.log('wrote', name);
}
await browser.close();
