/* Syncing with the Mac.

   The phone and the Mac find each other over Bonjour and talk with a
   pre-shared key. A browser can do neither — no raw sockets, no mDNS — and,
   the hard stop, a page served over HTTPS is forbidden from reaching http://
   on the local network at all. Chrome blocks it before a connection is tried.

   So the Mac serves plain HTTPS with a certificate signed by a small authority
   of its own, installed once on this device. https-to-https is allowed, and
   the exchange is the backup file both sides already read and write: post
   everything here, the Mac merges it and replies with everything it holds. */
(function () {
  'use strict';

  const Sync = {};

  /* The Mac writes updatedAt in seconds; this app keeps milliseconds. Getting
     this wrong makes every "which is newer" comparison out by a factor of a
     thousand, so one side always wins and the other's edits vanish. */
  /* Never round here. Rounding to whole seconds sends half of all entries
     back a fraction newer than they really are — the other device then accepts
     them, returns them newer still, and that one entry bounces between the two
     forever. Seconds are stored as a real number on both sides, so the
     fraction costs nothing and the round trip is exact. */
  const toSeconds = (v) => (!v ? 0 : (v > 1e12 ? v / 1000 : v));
  const toMillis = (v) => (!v ? 0 : (v > 1e12 ? v : v * 1000));

  /* Inside the car app the page is served by Android's asset loader, and a
     native app is not bound by the browser's mixed-content rule — so a bare
     address there means plain http, which is what the phone offers. In a
     browser it must mean https, or the request never leaves the page. */
  const insideTheCarApp = () => location.hostname === 'appassets.androidplatform.net';

  Sync.inCarApp = insideTheCarApp;

  Sync.address = function () {
    const raw = (window.Store.settings.syncHost || '').trim();
    if (!raw) return '';
    const scheme = insideTheCarApp() ? 'http://' : 'https://';
    const withScheme = /^https?:\/\//i.test(raw) ? raw : scheme + raw;
    return withScheme.replace(/\/+$/, '');
  };

  Sync.isConfigured = function () {
    return !!Sync.address() && !!(window.Store.settings.syncCode || '').trim();
  };

  Sync.run = async function () {
    const base = Sync.address();
    const code = (window.Store.settings.syncCode || '').trim();
    if (!base) throw new Error('Set the Mac’s address in Settings first');
    if (!code) throw new Error('Set the pairing code in Settings first');

    const payload = await window.Store.exportJSON();
    payload.entries = (payload.entries || []).map((e) =>
      Object.assign({}, e, { updatedAt: toSeconds(e.updatedAt) }));
    payload.trips = (payload.trips || []).map((t) =>
      Object.assign({}, t, { updatedAt: toSeconds(t.updatedAt) }));
    /* The other device's preferences are its own — never send ours as an
       instruction, and never take theirs. */
    delete payload.settings;

    let res;
    try {
      res = await fetch(base + '/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + code },
        body: JSON.stringify(payload),
      });
    } catch (e) {
      throw new Error(insideTheCarApp()
        ? 'Could not reach the phone. Check it is on the same network with '
          + 'Expenses open in front — iOS stops answering the moment you leave the app.'
        : 'Could not reach the Mac. Check it is awake, on the same network, has '
          + 'Expenses open, and that the certificate is installed here.');
    }

    if (res.status === 401) throw new Error('The pairing code did not match');
    if (!res.ok) {
      let message = 'The Mac refused the sync (' + res.status + ')';
      try {
        const body = await res.json();
        if (body && body.error) message = body.error;
      } catch (e) { /* not JSON; keep the status */ }
      throw new Error(message);
    }

    return Sync.merge(await res.json());
  };

  /* Newest wins, per entry. Nothing is ever deleted by a sync. */
  Sync.merge = async function (data) {
    if (!data || data.app !== 'expense-tracker') {
      throw new Error('The Mac sent something this app did not recognise');
    }
    const store = window.Store;
    let added = 0, updated = 0;

    for (const r of data.receipts || []) await store.putReceipt(r);

    const mine = new Map(store.entries.map((e) => [e.id, e]));
    for (const raw of data.entries || []) {
      const incoming = Object.assign({}, raw, { updatedAt: toMillis(raw.updatedAt) });
      const here = mine.get(incoming.id);
      if (!here) { await store.saveEntrySynced(incoming); added++; }
      else if ((incoming.updatedAt || 0) > (here.updatedAt || 0)) {
        await store.saveEntrySynced(incoming); updated++;
      }
    }

    const trips = new Map((store.trips || []).map((t) => [t.id, t]));
    for (const raw of data.trips || []) {
      const incoming = Object.assign({}, raw, { updatedAt: toMillis(raw.updatedAt) });
      const here = trips.get(incoming.id);
      if (!here || (incoming.updatedAt || 0) > (here.updatedAt || 0)) {
        await store.saveTripSynced(incoming);
      }
    }

    return { added: added, updated: updated };
  };

  window.Sync = Sync;
}());
