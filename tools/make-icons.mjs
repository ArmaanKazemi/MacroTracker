// Renders the app icons (original artwork: two concentric progress arcs) to PNG.
// Usage: node tools/make-icons.mjs   (needs Playwright + Chromium)
import { chromium } from 'playwright';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'app', 'icons');

function laurelSprig(mirror) {
  // same construction as app/js/art.js, simplified
  const P0 = [0, 0], P1 = [4, -34], P2 = [46, -58];
  const at = (t) => [(1 - t) ** 2 * P0[0] + 2 * (1 - t) * t * P1[0] + t * t * P2[0], (1 - t) ** 2 * P0[1] + 2 * (1 - t) * t * P1[1] + t * t * P2[1]];
  const tan = (t) => [2 * (1 - t) * (P1[0] - P0[0]) + 2 * t * (P2[0] - P1[0]), 2 * (1 - t) * (P1[1] - P0[1]) + 2 * t * (P2[1] - P1[1])];
  let leaves = '';
  for (let i = 0; i < 6; i++) {
    const t = 0.14 + (i / 5) * 0.78;
    const [x, y] = at(t); const [dx, dy] = tan(t);
    const ang = (Math.atan2(dy, dx) * 180) / Math.PI; const k = 1 - i * 0.07;
    for (const side of [-1, 1]) leaves += `<ellipse rx="${8.5 * k}" ry="${3.1 * k}" transform="translate(${x} ${y}) rotate(${ang + side * 38}) translate(${7 * k} 0)"/>`;
  }
  return `<g transform="${mirror ? 'scale(-1 1)' : ''}"><path d="M0 0 Q4 -34 46 -58" fill="none" stroke="#a88450" stroke-width="2"/><g fill="#a88450">${leaves}</g></g>`;
}

function svg(size, { maskable = false, rounded = false } = {}) {
  const k = maskable ? 0.78 : 1; // keep artwork inside the maskable safe zone
  const c = 256, r = 150 * k, w = 34 * k, sweep = 125;
  const p = (deg) => [c + r * Math.sin((deg * Math.PI) / 180), 250 - r * Math.cos((deg * Math.PI) / 180)];
  const [ax, ay] = p(-sweep), [bx, by] = p(sweep), [mx, my] = p(55);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
    <defs><radialGradient id="bg" cx="0.5" cy="0.25" r="0.9"><stop offset="0" stop-color="#fbf7f0"/><stop offset="1" stop-color="#eadfcd"/></radialGradient></defs>
    <rect width="512" height="512" rx="${rounded ? 112 : 0}" fill="url(#bg)"/>
    <path d="M${ax} ${ay} A${r} ${r} 0 1 1 ${bx} ${by}" fill="none" stroke="#e2d6c3" stroke-width="${w}" stroke-linecap="round"/>
    <path d="M${ax} ${ay} A${r} ${r} 0 1 1 ${mx} ${my}" fill="none" stroke="#c15f3c" stroke-width="${w}" stroke-linecap="round"/>
    <g transform="translate(256 ${250 + r * 0.92}) scale(${1.55 * k})">
      <g transform="translate(-6 0) rotate(-8)">${laurelSprig(true)}</g>
      <g transform="translate(6 0) rotate(8)">${laurelSprig(false)}</g>
      <circle cy="1" r="3" fill="#a88450"/>
    </g>
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
