// Entry point: routing, service worker registration, first-run seeding.
import { todayKey, toast, closeAllSheets, $$ } from './ui.js';
import * as store from './store.js';
import * as fooddb from './fooddb.js';
import { mountToday } from './today.js';
import { mountNutrients, mountFoods, mountSettings } from './views.js';

window.APP_VERSION = '1.2.0';

const view = document.getElementById('view');
const state = { date: todayKey(), microMode: 'day', foodsTab: 'fav' };
const routes = { today: mountToday, nutrients: mountNutrients, foods: mountFoods, settings: mountSettings };
let current = null;
let currentName = '';

function route() {
  const name = (location.hash.replace(/^#\/?/, '') || 'today').split('?')[0];
  const mount = routes[name] || routes.today;
  const key = routes[name] ? name : 'today';
  closeAllSheets();
  if (key !== currentName) {
    currentName = key;
    current = mount(view, state);
    view.classList.remove('view-enter');
    void view.offsetWidth;
    view.classList.add('view-enter');
    window.scrollTo(0, 0);
  }
  $$(document, '.tabbar a').forEach((a) => (a.dataset.tab === key ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
  current.refresh();
}

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
  fooddb.load().then(() => store.migrateIfNeeded()).then(() => current?.refresh()).catch((e) => console.error(e));
  window.addEventListener('hashchange', route);
  route();
  if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
}

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').then((reg) => {
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
