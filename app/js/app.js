// Entry point: routing, service worker registration, first-run seeding.
import { todayKey, toast, closeAllSheets, $$ } from './ui.js';
import * as store from './store.js';
import * as fooddb from './fooddb.js';
import { mountToday } from './today.js';
import { mountNutrients, mountFoods, mountSettings, guessMeal } from './views.js';
import { mountMeal } from './meal.js';
import { openAddFood } from './sheets.js';

window.APP_VERSION = '2.9.2';

const view = document.getElementById('view');
const state = { date: todayKey(), microMode: 'day', foodsTab: 'fav' };
const routes = { today: mountToday, nutrients: mountNutrients, foods: mountFoods, settings: mountSettings, meal: mountMeal };
let current = null;
let currentName = '';
let enterTimer = 0;
const scrollMemory = {};

function route() {
  const name = (location.hash.replace(/^#\/?/, '') || 'today').split('?')[0];
  const mount = routes[name] || routes.today;
  const key = routes[name] ? name : 'today';
  // Each meal page is its own screen (its query picks the meal).
  const ident = key === 'meal' ? location.hash : key;
  let restoreY = null;
  closeAllSheets();
  if (ident !== currentName) {
    if (currentName) scrollMemory[currentName] = window.scrollY;
    window.__prevRoute = currentName;
    const returning = key === 'today' && window.__prevRoute?.startsWith('#/meal');
    currentName = ident;
    current = mount(view, state);
    view.classList.remove('view-enter');
    void view.offsetWidth;
    view.classList.add('view-enter');
    // Drop the class once the entrance has played, so later refreshes don't replay it.
    clearTimeout(enterTimer);
    enterTimer = setTimeout(() => view.classList.remove('view-enter'), 1400);
    // Back from a meal page lands where you left Today.
    if (returning) { view.classList.remove('view-enter'); restoreY = scrollMemory.today || 0; }
    window.scrollTo(0, 0);
  }
  const tab = key === 'meal' ? 'today' : key;
  $$(document, '.tabbar a').forEach((a) => (a.dataset.tab === tab ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
  moveTabIndicator();
  syncThemeColor();
  const done = current.refresh();
  if (restoreY !== null) { const y = restoreY; Promise.resolve(done).then(() => window.scrollTo(0, y)); }
}

/** Slide the pill behind the active tab. */
function moveTabIndicator() {
  const ind = document.querySelector('.tab-ind');
  const a = document.querySelector('.tabbar a[aria-current]');
  if (!ind || !a) return;
  ind.style.width = `${a.offsetWidth}px`;
  ind.style.transform = `translateX(${a.offsetLeft}px)`;
  ind.classList.add('on');
}
window.addEventListener('resize', moveTabIndicator);

// Central + button: add food to the most likely meal for the current time.
document.querySelector('[data-fab]').addEventListener('click', () => {
  openAddFood({ date: state.date, meal: guessMeal() });
});

/** Apply 'system' | 'light' | 'dark'. Mirrored to localStorage so index.html can apply it before first paint. */
export function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'light' || theme === 'dark') root.dataset.theme = theme;
  else delete root.dataset.theme;
  try { localStorage.setItem('fuel-theme', theme || 'system'); } catch { /* private mode */ }
  syncThemeColor();
}

/** Tint the browser / status-bar area to the page colour (the top of every screen is plain parchment). */
function syncThemeColor() {
  const color = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  if (color) document.querySelector('meta[name="theme-color"]').setAttribute('content', color);
}
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => syncThemeColor());
window.addEventListener('theme-change', (e) => applyTheme(e.detail));

let pending = false;
window.addEventListener('data-changed', () => {
  // Coalesce bursts of changes into one refresh per frame.
  if (pending) return;
  pending = true;
  requestAnimationFrame(() => { pending = false; current?.refresh(); });
});

// When the app is reopened on a new day, jump to today.
let lastToday = todayKey();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  const t = todayKey();
  if (t !== lastToday) {
    if (state.date === lastToday) state.date = t;
    lastToday = t;
    current?.refresh();
  }
});

async function start() {
  try {
    await store.seedIfNeeded();
  } catch (e) {
    console.error(e);
    toast('Storage unavailable — data may not be saved');
  }
  store.getSettings().then((s) => applyTheme(s.theme)).catch(() => {});
  fooddb.load().then(() => store.migrateIfNeeded()).then(() => current?.refresh()).catch((e) => console.error(e));
  window.addEventListener('hashchange', route);
  route();
  if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
}

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').then((reg) => {
      // iOS resumes home-screen apps without reloading, so also check for a new version on return.
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        nw?.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) {
            toast('Update available', { label: 'Reload', run: () => location.reload() });
          }
        });
      });
    }).catch((e) => console.warn('SW registration failed', e));
  });
}

start();
