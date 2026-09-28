// Renders the app icons (original artwork: the hydria water jar) to PNG.
// Usage: node tools/make-icons.mjs   (needs Playwright + Chromium)
import { chromium } from 'playwright';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'app', 'icons');

// The hydria (Greek water jar) from the Today screen's water card - see app/js/art.js.
const HYDRIA_PATH = 'M38 10 H62 V20 C62 24 70 26 74 32 C84 44 88 62 86 80 C84 102 74 120 64 130 C60 133 56 134 50 134 C44 134 40 133 36 130 C26 120 16 102 14 80 C12 62 16 44 26 32 C30 26 38 24 38 20 Z';

function svg(size, { maskable = false, rounded = false } = {}) {
  // Jar artwork spans x 6-94, y 10-134 in its 100x146 box; fit it inside the icon
  // (smaller for maskable icons so it stays within the safe zone).
  const scale = maskable ? 2.3 : 2.7;
  const tx = 256 - 50 * scale;
  const ty = 256 - 72 * scale;
  const level = 64; // water surface y inside the jar (fills roughly the lower half)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
    <defs>
      <radialGradient id="bg" cx="0.5" cy="0.3" r="0.85"><stop offset="0" stop-color="#fbf7f0"/><stop offset="1" stop-color="#e9ddca"/></radialGradient>
      <linearGradient id="water" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7fb3cf"/><stop offset="1" stop-color="#356b8c"/></linearGradient>
      <clipPath id="jar"><path d="${HYDRIA_PATH}"/></clipPath>
    </defs>
    <rect width="512" height="512" rx="${rounded ? 112 : 0}" fill="url(#bg)"/>
    <g transform="translate(${tx} ${ty}) scale(${scale})">
      <path d="M26 34 C10 34 6 52 16 60" fill="none" stroke="#b86a45" stroke-width="3.6" stroke-linecap="round"/>
      <path d="M74 34 C90 34 94 52 84 60" fill="none" stroke="#b86a45" stroke-width="3.6" stroke-linecap="round"/>
      <g clip-path="url(#jar)">
        <rect x="0" y="0" width="100" height="146" fill="#f3ebdd"/>
        <path d="M0 ${level - 2} Q12.5 ${level - 9} 25 ${level - 2} T50 ${level - 2} T75 ${level - 2} T100 ${level - 2} V146 H0 Z" fill="#9cc3d8"/>
        <path d="M0 ${level} Q12.5 ${level - 7} 25 ${level} T50 ${level} T75 ${level} T100 ${level} V146 H0 Z" fill="url(#water)"/>
        <path d="M14 ${level - 16} H86 M14 ${level - 11} H86" stroke="#b86a45" stroke-width="1.3" opacity=".35"/>
      </g>
      <path d="${HYDRIA_PATH}" fill="none" stroke="#b86a45" stroke-width="3.4" stroke-linejoin="round"/>
      <path d="M34 10 H66" stroke="#b86a45" stroke-width="3.6" stroke-linecap="round"/>
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
