/* Persistence. IndexedDB is the real store (receipt photos are blobs and would
   never fit in localStorage); localStorage is a degraded fallback so the app
   still works if IndexedDB is blocked. Entries are also kept in memory so
   rendering never has to await the database. */
(function () {
  'use strict';

  const DB_NAME = 'expense-tracker';
  const DB_VERSION = 1;
  const LS_KEY = 'expense-tracker:fallback';

  const Store = {
    db: null,
    useFallback: false,
    entries: [],
    trips: [],
    settings: null,
  };

  const DEFAULT_SETTINGS = {
    name: 'Sebastjan Brajer',
    company: 'EPSON',
    ratePerKm: 0.43,
    homePlace: null,
    roundTripDefault: true,
    ocrLang: 'eng',
    autoRouteLookup: true,
    gpsRoadFactor: 1.0,
    /* Where the Mac is on the network, and the pairing code it expects. */
    syncHost: '',
    syncCode: '',
  };

  /* ── Open ──────────────────────────────────────────────────────── */
  function openDB() {
    return new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) return reject(new Error('no indexedDB'));
      let req;
      try {
        req = indexedDB.open(DB_NAME, DB_VERSION);
      } catch (e) {
        return reject(e);
      }
      req.onupgradeneeded = function () {
        const db = req.result;
        if (!db.objectStoreNames.contains('entries')) {
          const s = db.createObjectStore('entries', { keyPath: 'id' });
          s.createIndex('company', 'company');
          s.createIndex('date', 'date');
          s.createIndex('type', 'type');
        }
        if (!db.objectStoreNames.contains('receipts')) db.createObjectStore('receipts', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('trips')) db.createObjectStore('trips', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv', { keyPath: 'k' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('indexedDB open failed'));
      req.onblocked = () => reject(new Error('indexedDB blocked'));
    });
  }

  function tx(storeName, mode) {
    return Store.db.transaction(storeName, mode).objectStore(storeName);
  }

  function wrap(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /* ── localStorage fallback ─────────────────────────────────────── */
  function lsRead() {
    try {
      return JSON.parse(localStorage.getItem(LS_KEY) || '{}') || {};
    } catch (e) {
      return {};
    }
  }
  function lsWrite() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({
        entries: Store.entries,
        trips: Store.trips,
        settings: Store.settings,
        kv: Store._kv || {},
      }));
    } catch (e) {
      console.warn('fallback write failed', e);
    }
  }

  /* ── Boot ──────────────────────────────────────────────────────── */
  Store.init = async function () {
    try {
      Store.db = await openDB();
    } catch (e) {
      console.warn('IndexedDB unavailable, falling back to localStorage:', e && e.message);
      Store.useFallback = true;
    }

    if (Store.useFallback) {
      const data = lsRead();
      Store.entries = data.entries || [];
      Store.trips = data.trips || [];
      Store._kv = data.kv || {};
      Store.settings = Object.assign({}, DEFAULT_SETTINGS, data.settings || {});
    } else {
      Store.entries = await wrap(tx('entries', 'readonly').getAll());
      Store.trips = await wrap(tx('trips', 'readonly').getAll());
      const s = await wrap(tx('kv', 'readonly').get('settings'));
      Store.settings = Object.assign({}, DEFAULT_SETTINGS, (s && s.v) || {});
    }
    return Store;
  };

  /* ── Entries ───────────────────────────────────────────────────── */
  Store.saveEntry = async function (entry) {
    entry.updatedAt = Date.now();
    if (!entry.id) entry.id = window.U.uid();
    if (!entry.createdAt) entry.createdAt = entry.updatedAt;
    const i = Store.entries.findIndex((e) => e.id === entry.id);
    if (i > -1) Store.entries[i] = entry; else Store.entries.push(entry);
    if (Store.useFallback) lsWrite();
    else await wrap(tx('entries', 'readwrite').put(entry));
    return entry;
  };

  /* Saves without restamping updatedAt.
     `saveEntry` marks every write with the current time, which is right for an
     edit and wrong for a sync: an entry accepted from the other device would
     immediately look newer than the copy it came from, and the next sync would
     push it straight back — forever, with the other device's edits always
     losing. Syncing writes the timestamp it was given. */
  Store.saveEntrySynced = async function (entry) {
    if (!entry.id) entry.id = window.U.uid();
    if (!entry.createdAt) entry.createdAt = entry.updatedAt || Date.now();
    const i = Store.entries.findIndex((e) => e.id === entry.id);
    if (i > -1) Store.entries[i] = entry; else Store.entries.push(entry);
    if (Store.useFallback) lsWrite();
    else await wrap(tx('entries', 'readwrite').put(entry));
    return entry;
  };

  Store.saveTripSynced = async function (trip) {
    if (!trip.id) trip.id = window.U.uid();
    const i = Store.trips.findIndex((t) => t.id === trip.id);
    if (i > -1) Store.trips[i] = trip; else Store.trips.push(trip);
    if (Store.useFallback) lsWrite();
    else await wrap(tx('trips', 'readwrite').put(trip));
    return trip;
  };

  Store.deleteEntry = async function (id) {
    const entry = Store.entries.find((e) => e.id === id);
    Store.entries = Store.entries.filter((e) => e.id !== id);
    if (entry) {
      for (const rid of collectReceiptIds(entry)) await Store.deleteReceipt(rid);
    }
    if (Store.useFallback) lsWrite();
    else await wrap(tx('entries', 'readwrite').delete(id));
  };

  function collectReceiptIds(entry) {
    const ids = [];
    if (entry.receiptId) ids.push(entry.receiptId);
    (entry.items || []).forEach((it) => { if (it.receiptId) ids.push(it.receiptId); });
    return ids;
  }

  Store.getEntry = (id) => Store.entries.find((e) => e.id === id) || null;

  /* Entries for one company, newest first. */
  Store.byCompany = function (company, type) {
    return Store.entries
      .filter((e) => e.company === company && (!type || e.type === type))
      .sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.createdAt - a.createdAt);
  };

  /* ── Receipts ──────────────────────────────────────────────────── */
  Store.putReceipt = async function (rec) {
    if (!rec.id) rec.id = window.U.uid();
    rec.addedAt = rec.addedAt || Date.now();
    if (Store.useFallback) {
      Store._kv['receipt:' + rec.id] = { id: rec.id, thumb: rec.thumb, name: rec.name, addedAt: rec.addedAt };
      lsWrite();
    } else {
      await wrap(tx('receipts', 'readwrite').put(rec));
    }
    return rec.id;
  };

  Store.getReceipt = async function (id) {
    if (!id) return null;
    if (Store.useFallback) return Store._kv['receipt:' + id] || null;
    return (await wrap(tx('receipts', 'readonly').get(id))) || null;
  };

  Store.deleteReceipt = async function (id) {
    if (!id) return;
    if (Store.useFallback) { delete Store._kv['receipt:' + id]; lsWrite(); }
    else await wrap(tx('receipts', 'readwrite').delete(id));
  };

  Store.countReceipts = function () {
    let n = 0;
    Store.entries.forEach((e) => { n += collectReceiptIds(e).length; });
    return n;
  };

  /* ── Trips ─────────────────────────────────────────────────────── */
  Store.saveTrip = async function (trip) {
    if (!trip.id) trip.id = window.U.uid();
    const i = Store.trips.findIndex((t) => t.id === trip.id);
    if (i > -1) Store.trips[i] = trip; else Store.trips.push(trip);
    if (Store.useFallback) lsWrite();
    else await wrap(tx('trips', 'readwrite').put(trip));
    return trip;
  };

  Store.deleteTrip = async function (id) {
    Store.trips = Store.trips.filter((t) => t.id !== id);
    if (Store.useFallback) lsWrite();
    else await wrap(tx('trips', 'readwrite').delete(id));
  };

  Store.activeTrip = () => Store.trips.find((t) => t.status === 'active') || null;

  /* ── Key/value (settings, route cache) ─────────────────────────── */
  Store.kvGet = async function (k) {
    if (Store.useFallback) return Store._kv[k];
    const r = await wrap(tx('kv', 'readonly').get(k));
    return r ? r.v : undefined;
  };

  Store.kvSet = async function (k, v) {
    if (Store.useFallback) { Store._kv[k] = v; lsWrite(); return; }
    await wrap(tx('kv', 'readwrite').put({ k: k, v: v }));
  };

  Store.saveSettings = async function (patch) {
    Store.settings = Object.assign({}, Store.settings, patch);
    await Store.kvSet('settings', Store.settings);
    if (Store.useFallback) lsWrite();
    return Store.settings;
  };

  /* ── Backup ────────────────────────────────────────────────────── */
  Store.exportJSON = async function () {
    const receipts = [];
    for (const e of Store.entries) {
      for (const id of collectReceiptIds(e)) {
        const r = await Store.getReceipt(id);
        if (r && r.thumb) receipts.push({ id: r.id, thumb: r.thumb, name: r.name });
      }
    }
    return {
      app: 'expense-tracker',
      version: 1,
      exportedAt: new Date().toISOString(),
      settings: Store.settings,
      entries: Store.entries,
      trips: Store.trips,
      receipts: receipts,
    };
  };

  Store.importJSON = async function (data, mode) {
    if (!data || data.app !== 'expense-tracker') throw new Error('Not an Expense Tracker backup file');
    if (mode === 'replace') {
      for (const e of Store.entries.slice()) await Store.deleteEntry(e.id);
      for (const t of Store.trips.slice()) await Store.deleteTrip(t.id);
    }
    const existing = new Set(Store.entries.map((e) => e.id));
    let added = 0;
    for (const r of data.receipts || []) await Store.putReceipt(r);
    for (const e of data.entries || []) {
      if (existing.has(e.id)) continue;
      await Store.saveEntry(e);
      added++;
    }
    for (const t of data.trips || []) {
      if (!Store.trips.some((x) => x.id === t.id)) await Store.saveTrip(t);
    }
    if (data.settings) await Store.saveSettings(data.settings);
    return added;
  };

  Store.DEFAULT_SETTINGS = DEFAULT_SETTINGS;
  window.Store = Store;
}());
