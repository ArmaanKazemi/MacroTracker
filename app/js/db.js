// Tiny promise wrapper around IndexedDB. All user data lives here.
const DB_NAME = 'macrotracker';
const DB_VERSION = 1;
export const STORES = ['kv', 'foods', 'recipes', 'entries', 'water'];

let dbp = null;

function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
      if (!db.objectStoreNames.contains('foods')) db.createObjectStore('foods', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('recipes')) db.createObjectStore('recipes', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('entries')) {
        db.createObjectStore('entries', { keyPath: 'id' }).createIndex('date', 'date');
      }
      if (!db.objectStoreNames.contains('water')) {
        db.createObjectStore('water', { keyPath: 'id' }).createIndex('date', 'date');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

function wrap(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(store, mode = 'readonly') {
  const db = await open();
  return db.transaction(store, mode).objectStore(store);
}

export async function get(store, key) {
  return wrap((await tx(store)).get(key));
}
export async function getAll(store) {
  return wrap((await tx(store)).getAll());
}
export async function byDate(store, date) {
  return wrap((await tx(store)).index('date').getAll(date));
}
export async function byDateRange(store, from, to) {
  return wrap((await tx(store)).index('date').getAll(IDBKeyRange.bound(from, to)));
}
export async function put(store, value, key) {
  const s = await tx(store, 'readwrite');
  return wrap(key === undefined ? s.put(value) : s.put(value, key));
}
export async function del(store, key) {
  return wrap((await tx(store, 'readwrite')).delete(key));
}

export async function exportAll() {
  const out = { app: 'macrotracker', version: 1, exportedAt: new Date().toISOString(), data: {} };
  for (const s of STORES) {
    if (s === 'kv') {
      const st = await tx('kv');
      const keys = await wrap(st.getAllKeys());
      const vals = await wrap((await tx('kv')).getAll());
      out.data.kv = keys.map((k, i) => [k, vals[i]]);
    } else {
      out.data[s] = await getAll(s);
    }
  }
  return out;
}

/** Replace all data with an export. Validates before touching anything. */
export async function importAll(json) {
  if (!json || json.app !== 'macrotracker' || !json.data) throw new Error('Not a MacroTracker backup file');
  for (const s of STORES) {
    if (json.data[s] && !Array.isArray(json.data[s])) throw new Error(`Backup is corrupt (${s})`);
  }
  const db = await open();
  await new Promise((resolve, reject) => {
    const t = db.transaction(STORES, 'readwrite');
    t.oncomplete = resolve;
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('Import aborted'));
    for (const s of STORES) {
      const st = t.objectStore(s);
      st.clear();
      for (const row of json.data[s] || []) {
        if (s === 'kv') st.put(row[1], row[0]);
        else st.put(row);
      }
    }
  });
}

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
