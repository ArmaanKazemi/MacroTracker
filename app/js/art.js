// Simple line icons and the water glass (inline SVG, themed via currentColor / CSS variables).

// ---- Meal icons: soft, rounded line drawings ----
const stroke = 'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';

export const mealIcons = {
  // Sunrise
  breakfast: `<svg viewBox="0 0 48 48" aria-hidden="true"><g ${stroke}>
    <path d="M12 31a12 12 0 0 1 24 0"/><path d="M8 35h32"/><path d="M24 11v5M13.4 15.4l3 3M34.6 15.4l-3 3"/></g></svg>`,
  // Bowl
  lunch: `<svg viewBox="0 0 48 48" aria-hidden="true"><g ${stroke}>
    <path d="M9 24h30"/><path d="M10.5 24c0 7.5 6 12.5 13.5 12.5S37.5 31.5 37.5 24"/><path d="M19 39h10"/>
    <path d="M20 18c-1.5-1.8 1.5-3.4 0-5.2M28 18c-1.5-1.8 1.5-3.4 0-5.2"/></g></svg>`,
  // Plate with a fork
  dinner: `<svg viewBox="0 0 48 48" aria-hidden="true"><g ${stroke}>
    <circle cx="26" cy="25" r="11"/><circle cx="26" cy="25" r="6.5" opacity=".55"/>
    <path d="M9 12v8c0 1.6 1.2 2.8 2.5 2.8S14 21.6 14 20v-8M11.5 22.8V37"/></g></svg>`,
  // Apple
  snacks: `<svg viewBox="0 0 48 48" aria-hidden="true"><g ${stroke}>
    <path d="M24 17c-3-2-10-2-11.5 5-1.4 6.5 2.5 15 7.5 15 1.6 0 2.6-.8 4-.8s2.4.8 4 .8c5 0 8.9-8.5 7.5-15C34 15 27 15 24 17z"/>
    <path d="M24 17c0-3 1-5.5 3-7"/><path d="M27 11.5c2.5-2 6-1.8 7.5.2-2.6 1.6-5.4 1.6-7.5-.2z"/></g></svg>`,
};

// ---- Water glass that fills up ----
// Interior spans y = 10 → 134 (124 units).
export const HYDRIA_H = 124;
const HYDRIA_PATH = 'M20 10 H80 L74 122 C73.6 129 69 134 62 134 H38 C31 134 26.4 129 26 122 Z';

// A teardrop of radius r, point up, centred on its round bottom.
const drop = (r) => `M0 ${-r * 2.1} C${r * 0.6} ${-r * 1.1} ${r} ${-r * 0.5} ${r} 0 A${r} ${r} 0 1 1 ${-r} 0 C${-r} ${-r * 0.5} ${-r * 0.6} ${-r * 1.1} 0 ${-r * 2.1} Z`;
// Drops that run from the rim down the outside of each side [path, radius, delay s].
const LEFT = 'M21 11 C20 40 23 85 26 122 C27 131 32 136 40 139';
const RIGHT = 'M79 11 C80 40 77 85 74 122 C73 131 68 136 60 139';
const TRICKLES = [[LEFT, 3.2, 0], [RIGHT, 3, 0.25], [LEFT, 2.5, 0.6], [RIGHT, 3.3, 0.8], [LEFT, 2.8, 1.1], [RIGHT, 2.4, 1.35]];

/** Replay the overflow: drops run over the rim and down the glass. */
export function playSpill(root) {
  root.querySelectorAll('.trickle').forEach((g) => {
    const delay = Number(g.dataset.delay) || 0;
    g.querySelectorAll('animate, animateMotion').forEach((a) => { try { a.beginElementAt(delay); } catch { /* SMIL unsupported */ } });
  });
}

export function hydriaSvg() {
  return `
  <svg viewBox="0 0 100 146" role="img" aria-label="Water glass">
    <defs>
      <clipPath id="hydriaClip"><path d="${HYDRIA_PATH}"/></clipPath>
      <linearGradient id="waterGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" style="stop-color:var(--water-top)"/><stop offset="1" style="stop-color:var(--water-bottom)"/>
      </linearGradient>
    </defs>
    <g clip-path="url(#hydriaClip)">
      <rect x="0" y="0" width="100" height="146" style="fill:var(--vessel-fill)"/>
      <g class="level" style="transform: translateY(${HYDRIA_H + 6}px)">
        <path class="wave2" style="fill:var(--water-back)" d="M0 8 Q12.5 0 25 8 T50 8 T75 8 T100 8 T125 8 T150 8 T175 8 T200 8 V200 H0 Z"/>
        <path class="wave" fill="url(#waterGrad)" d="M0 10 Q12.5 3 25 10 T50 10 T75 10 T100 10 T125 10 T150 10 T175 10 T200 10 V200 H0 Z"/>
      </g>
    </g>
    <path class="outline" d="${HYDRIA_PATH}" fill="none" style="stroke:var(--vessel-line)" stroke-width="2.4" stroke-linejoin="round"/>
    <!-- overflow, once the water goal is beaten: drops that run over the rim and down the
         sides (replayed by playSpill), and a pool that stays -->
    <g class="spill" aria-hidden="true">
      <ellipse class="puddle" cx="50" cy="141" rx="34" ry="3.6" style="fill:var(--water-top)"/>
      ${TRICKLES.map(([path, r, delay]) => `
      <g class="trickle" data-delay="${delay}" opacity="0">
        <path d="${drop(r)}" style="fill:var(--water-top);stroke:var(--water-bottom)" stroke-width=".6"/><circle cx="${-r * 0.35}" cy="${r * 0.05}" r="${r * 0.3}" fill="#fff" opacity=".85"/>
        <animateMotion dur="1.7s" begin="indefinite" fill="freeze" calcMode="spline" keyTimes="0;1" keySplines="0.45 0 0.8 1" path="${path}"/>
        <animate attributeName="opacity" dur="1.7s" begin="indefinite" fill="freeze" values="0;1;1;0" keyTimes="0;0.08;0.85;1"/>
      </g>`).join('')}
    </g>
  </svg>`;
}
