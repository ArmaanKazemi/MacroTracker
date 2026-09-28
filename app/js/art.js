// Original line-art in a classical style (inline SVG, themed via currentColor / CSS variables).

/** A laurel sprig: leaves alternating along a gently curved stem, pointing up-right. */
function sprig(mirror = false) {
  // Quadratic stem from (0,0) up to (46,-58).
  const P0 = [0, 0], P1 = [4, -34], P2 = [46, -58];
  const at = (t) => [
    (1 - t) ** 2 * P0[0] + 2 * (1 - t) * t * P1[0] + t * t * P2[0],
    (1 - t) ** 2 * P0[1] + 2 * (1 - t) * t * P1[1] + t * t * P2[1],
  ];
  const tan = (t) => [2 * (1 - t) * (P1[0] - P0[0]) + 2 * t * (P2[0] - P1[0]), 2 * (1 - t) * (P1[1] - P0[1]) + 2 * t * (P2[1] - P1[1])];
  let leaves = '';
  const n = 6;
  for (let i = 0; i < n; i++) {
    const t = 0.14 + (i / (n - 1)) * 0.78;
    const [x, y] = at(t);
    const [dx, dy] = tan(t);
    const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
    const size = 1 - i * 0.07;
    for (const side of [-1, 1]) {
      const rot = ang + side * 38;
      leaves += `<ellipse cx="0" cy="0" rx="${(8.5 * size).toFixed(1)}" ry="${(3.1 * size).toFixed(1)}" transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${rot.toFixed(1)}) translate(${(7 * size).toFixed(1)} 0)"/>`;
    }
  }
  const tip = at(1);
  leaves += `<ellipse cx="0" cy="0" rx="7" ry="2.8" transform="translate(${tip[0]} ${tip[1]}) rotate(-24) translate(5 0)"/>`;
  return `<g transform="${mirror ? 'scale(-1 1)' : ''}">
    <path d="M${P0} Q${P1} ${P2}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
    <g fill="currentColor">${leaves}</g></g>`;
}

/** Two laurel sprigs meeting at the bottom, like the base of a wreath. */
export function laurels() {
  return `<svg class="laurels" viewBox="-70 -66 140 72" aria-hidden="true">
    <g transform="translate(-6 0) rotate(-8)">${sprig(true)}</g>
    <g transform="translate(6 0) rotate(8)">${sprig(false)}</g>
    <circle cx="0" cy="1" r="2.6" fill="currentColor"/>
  </svg>`;
}

// ---- Meal icons (terracotta line drawings on a stone disc) ----
const stroke = 'fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"';

export const mealIcons = {
  // Helios: sun rising over the horizon
  breakfast: `<svg viewBox="0 0 48 48" aria-hidden="true"><g ${stroke}>
    <path d="M10 31a14 14 0 0 1 28 0"/><path d="M6 31h36"/><path d="M12 36h24" opacity=".55"/>
    <path d="M24 9v5M12.3 13.8l3.3 3.6M35.7 13.8l-3.3 3.6M5.5 22.5l4.6 1.6M42.5 22.5l-4.6 1.6"/></g></svg>`,
  // Steaming bowl (mirror-symmetric about x = 24)
  lunch: `<svg viewBox="0 0 48 48" aria-hidden="true"><g ${stroke} transform="translate(0 -1.75)">
    <path d="M8 25h32"/><path d="M9.5 25c0 7.6 6.4 13 14.5 13s14.5-5.4 14.5-13"/><path d="M18.5 41.5h11"/>
    <path d="M17 19c-2-2.2 2-4.3 0-6.5M31 19c2-2.2-2-4.3 0-6.5M24 19v-9" opacity=".7"/></g></svg>`,
  // Amphora
  dinner: `<svg viewBox="0 0 48 48" aria-hidden="true"><g ${stroke}>
    <path d="M19 6h10M20 6v5c0 2-6 5-6 13 0 7 4 12 7 15l3 3 3-3c3-3 7-8 7-15 0-8-6-11-6-13V6"/>
    <path d="M20 11c-5 0-7 3-7 6s2 4 3 4M28 11c5 0 7 3 7 6s-2 4-3 4"/>
    <path d="M16.5 24h15M17.5 29h13" opacity=".6"/></g></svg>`,
  // Bunch of grapes
  snacks: `<svg viewBox="0 0 48 48" aria-hidden="true"><g ${stroke}>
    <path d="M24 11c0-3 1-5 3-6"/><path d="M26 9c4-3 9-2 11 1-4 2-8 2-11-1z"/></g>
    <g fill="none" stroke="currentColor" stroke-width="2">
    ${[[17, 16], [24, 15], [31, 16], [20.5, 22.5], [27.5, 22.5], [17, 29], [24, 29], [31, 29], [20.5, 35.5], [27.5, 35.5], [24, 41.5]]
      .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3.6"/>`).join('')}</g></svg>`,
};

// ---- Hydria (Greek water jar) that fills with water ----
// Interior spans y = 10 → 134 (124 units) so the fill maths matches the old glass.
export const HYDRIA_H = 124;
const HYDRIA_PATH = 'M38 10 H62 V20 C62 24 70 26 74 32 C84 44 88 62 86 80 C84 102 74 120 64 130 C60 133 56 134 50 134 C44 134 40 133 36 130 C26 120 16 102 14 80 C12 62 16 44 26 32 C30 26 38 24 38 20 Z';

export function hydriaSvg() {
  return `
  <svg viewBox="0 0 100 146" role="img" aria-label="Water jar">
    <defs>
      <clipPath id="hydriaClip"><path d="${HYDRIA_PATH}"/></clipPath>
      <linearGradient id="waterGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" style="stop-color:var(--water-top)"/><stop offset="1" style="stop-color:var(--water-bottom)"/>
      </linearGradient>
    </defs>
    <!-- handles -->
    <path d="M26 34 C10 34 6 52 16 60" fill="none" style="stroke:var(--vessel-line)" stroke-width="3.2" stroke-linecap="round"/>
    <path d="M74 34 C90 34 94 52 84 60" fill="none" style="stroke:var(--vessel-line)" stroke-width="3.2" stroke-linecap="round"/>
    <g clip-path="url(#hydriaClip)">
      <rect x="0" y="0" width="100" height="146" style="fill:var(--vessel-fill)"/>
      <g class="level" style="transform: translateY(${HYDRIA_H + 6}px)">
        <path class="wave2" style="fill:var(--water-back)" d="M0 8 Q12.5 0 25 8 T50 8 T75 8 T100 8 T125 8 T150 8 T175 8 T200 8 V200 H0 Z"/>
        <path class="wave" fill="url(#waterGrad)" d="M0 10 Q12.5 3 25 10 T50 10 T75 10 T100 10 T125 10 T150 10 T175 10 T200 10 V200 H0 Z"/>
      </g>
      <!-- painted band, like black-figure pottery -->
      <path d="M14 66 H86 M14 71 H86" style="stroke:var(--vessel-line)" stroke-width="1.3" opacity=".35"/>
    </g>
    <path class="outline" d="${HYDRIA_PATH}" fill="none" style="stroke:var(--vessel-line)" stroke-width="3" stroke-linejoin="round"/>
    <path d="M34 10 H66" style="stroke:var(--vessel-line)" stroke-width="3.2" stroke-linecap="round"/>
  </svg>`;
}
