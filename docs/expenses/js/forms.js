/* The four editors: mileage, other expenses, meetings/entertainment, travel.
   Each one opens as a modal on the desktop and as a full-height sheet on the
   phone, and each saves a single entry to the store. */
(function () {
  'use strict';

  const U = window.U;
  const I = window.ICONS;
  const C = window.C;
  const Forms = {};

  /* ── Catalogues ────────────────────────────────────────────────── */
  Forms.OTHER_CATEGORIES = [
    ['phone', 'Phone bill'],
    ['carwash', 'Car wash'],
    ['fuel', 'Fuel'],
    ['parking', 'Parking'],
    ['toll', 'Road toll / vignette'],
    ['service', 'Car service / tyres'],
    ['office', 'Office supplies'],
    ['post', 'Post / courier'],
    ['software', 'Software / subscription'],
    ['other', 'Other'],
  ];

  Forms.MEETING_KINDS = [
    ['restaurant', 'Restaurant / dinner'],
    ['lunch', 'Business lunch'],
    ['coffee', 'Coffee / drinks'],
    ['gift', 'Business gift'],
    ['tickets', 'Event tickets'],
    ['venue', 'Venue / room hire'],
    ['other', 'Other'],
  ];

  Forms.TRAVEL_KINDS = [
    ['flight', 'Plane ticket'],
    ['hotel', 'Hotel'],
    ['taxi', 'Taxi / transfer'],
    ['esim', 'eSIM / mobile data'],
    ['train', 'Train / bus'],
    ['carrental', 'Car rental'],
    ['fuel', 'Fuel'],
    ['parking', 'Parking'],
    ['toll', 'Road toll / vignette'],
    ['meal', 'Meals'],
    ['conference', 'Conference / fair fee'],
    ['visa', 'Visa / insurance'],
    ['other', 'Other'],
  ];

  Forms.ROLES = [
    'CEO', 'CTO', 'COO', 'CFO', 'CIO', 'Owner', 'Managing Director', 'Board Member',
    'General Manager', 'Sales Director', 'Sales Manager', 'Purchasing Manager',
    'Procurement Director', 'Product Manager', 'Marketing Manager', 'IT Manager',
    'Technical Manager', 'Service Technician', 'Project Manager', 'Consultant',
    'Distributor', 'Reseller', 'Other',
  ];

  const KIND_ICON = {
    flight: I.plane, hotel: I.bed, taxi: I.taxi, esim: I.sim, train: I.train,
    carrental: I.car, fuel: I.fuel, parking: I.parking, toll: I.route,
    meal: I.food, conference: I.users, visa: I.receipt, other: I.receipt,
    restaurant: I.food, lunch: I.food, coffee: I.food, gift: I.sparkle,
    tickets: I.receipt, venue: I.building, phone: I.phone, carwash: I.wash,
    service: I.car, office: I.inbox, post: I.inbox, software: I.grid,
  };
  Forms.kindIcon = (k) => KIND_ICON[k] || I.receipt;

  Forms.kindLabel = function (kind) {
    const all = Forms.TRAVEL_KINDS.concat(Forms.MEETING_KINDS, Forms.OTHER_CATEGORIES);
    const hit = all.find((k) => k[0] === kind);
    return hit ? hit[1] : (kind || 'Other');
  };

  Forms.country = (iso) => (window.COUNTRIES || []).find((c) => c[1] === iso) || null;
  Forms.currencyRate = function (code) {
    const hit = (window.CURRENCIES || []).find((c) => c[0] === code);
    return hit ? hit[1] : 1;
  };

  /* ── Shared bits ───────────────────────────────────────────────── */

  function footer(totalLabel, saveLabel) {
    return '<div class="modal-total" data-total>' + U.esc(totalLabel || '') + '</div>' +
      '<div class="spacer"></div>' +
      '<button type="button" class="btn" data-act="cancel">Cancel</button>' +
      '<button type="button" class="btn btn-primary" data-act="save">' + I.check +
      '<span>' + U.esc(saveLabel || 'Save') + '</span></button>';
  }

  /* A compact per-line receipt scanner used inside item cards. */
  function lineReceipt(item, onRead) {
    const holder = document.createElement('div');
    holder.className = 'field';
    const id = 'lr-' + U.uid();
    holder.innerHTML =
      '<label>&nbsp;</label>' +
      '<div style="display:flex;gap:6px;align-items:center">' +
        '<label class="btn btn-sm" for="' + id + '" title="Photograph the receipt">' + I.camera + '</label>' +
        '<img class="receipt-thumb" style="width:34px;height:34px" alt="" hidden>' +
        '<input id="' + id + '" type="file" accept="image/*" capture="environment" hidden>' +
      '</div>';
    const input = holder.querySelector('input');
    const img = holder.querySelector('img');

    if (item.receiptId) {
      window.Store.getReceipt(item.receiptId).then((r) => {
        if (r && r.thumb) { img.src = r.thumb; img.hidden = false; }
      });
    }

    input.addEventListener('change', async () => {
      const f = input.files && input.files[0];
      if (!f) return;
      const shrunk = await U.shrinkImage(f, 1700, 0.85);
      img.src = shrunk.dataUrl;
      img.hidden = false;
      item.receiptId = await window.Store.putReceipt({
        id: item.receiptId || U.uid(), blob: shrunk.blob, thumb: shrunk.dataUrl, name: f.name,
      });
      U.toast('Reading the receipt…');
      try {
        const res = await window.OCR.scan(shrunk.dataUrl);
        if (res.amount) {
          onRead(res);
          U.toast('Read ' + U.eur(res.amount) + ' from the receipt');
        } else {
          U.toast('Nothing recognised — type the amount in', 'err');
        }
      } catch (e) {
        U.toast('Text could not be read from that photo', 'err');
      }
    });
    return holder;
  }

  /* Repeating cost lines with optional foreign currency. */
  function itemList(host, state, kinds, onChange) {
    function rowEl(item, idx) {
      const card = document.createElement('div');
      card.className = 'item-card';
      const isEur = (item.currency || 'EUR') === 'EUR';
      card.innerHTML =
        '<div class="field"><label>Type</label>' +
          '<select class="select" data-f="kind">' + C.options(kinds, item.kind) + '</select></div>' +
        '<div class="field"><label>Description</label>' +
          '<input class="input" data-f="description" value="' + U.attr(item.description || '') +
          '" placeholder="e.g. LJU–FRA return, Lufthansa"></div>' +
        '<div class="field"><label>Amount</label>' +
          '<div class="input-group">' +
            '<input class="input input-money" data-f="amount" inputmode="decimal" value="' +
              U.attr(item.amount ? U.num2(item.amount) : '') + '" placeholder="0,00">' +
            '<select class="addon" data-f="currency" style="border-radius:0 10px 10px 0;padding:0 8px">' +
              C.options((window.CURRENCIES || []).map((c) => [c[0], c[0]]), item.currency || 'EUR') +
            '</select>' +
          '</div>' +
          (isEur ? '' : '<div class="field-hint" data-eur>= ' + U.esc(U.eur(item.amountEur)) + '</div>') +
        '</div>';

      const del = document.createElement('div');
      del.className = 'field del';
      del.innerHTML = '<label>&nbsp;</label><button type="button" class="btn btn-sm btn-ghost btn-danger" ' +
        'aria-label="Remove line">' + I.trash + '</button>';

      card.appendChild(lineReceipt(item, (res) => {
        item.amount = res.amount;
        item.currency = item.currency || 'EUR';
        recalc(item);
        render();
        onChange();
      }));
      card.appendChild(del);

      del.querySelector('button').addEventListener('click', () => {
        state.items.splice(idx, 1);
        if (!state.items.length) state.items.push(newItem(kinds));
        render();
        onChange();
      });

      card.addEventListener('input', (e) => {
        const f = e.target.dataset.f;
        if (!f) return;
        item.touched = true;
        if (f === 'amount') item.amount = U.num(e.target.value);
        else item[f] = e.target.value;
        recalc(item);
        const hint = card.querySelector('[data-eur]');
        if (hint) hint.textContent = '= ' + U.eur(item.amountEur);
        onChange();
      });
      card.addEventListener('change', (e) => {
        const f = e.target.dataset.f;
        if (f === 'currency' || f === 'kind') {
          item.touched = true;
          item[f] = e.target.value;
          if (f === 'currency') item.rate = Forms.currencyRate(item.currency);
          recalc(item);
          render();
          onChange();
        }
      });
      return card;
    }

    function render() {
      host.innerHTML = '';
      state.items.forEach((item, i) => host.appendChild(rowEl(item, i)));
    }

    render();
    return { render: render };
  }

  function newItem(kinds) {
    return {
      id: U.uid(),
      kind: kinds[0][0],
      description: '',
      amount: 0,
      currency: 'EUR',
      rate: 1,
      amountEur: 0,
      receiptId: null,
    };
  }

  function recalc(item) {
    item.rate = item.currency === 'EUR' ? 1 : (item.rate || Forms.currencyRate(item.currency));
    item.amountEur = U.round2(U.num(item.amount) * item.rate);
  }

  const itemsTotal = (items) => U.round2(U.sum(items, (i) => i.amountEur));

  /* Keeps only lines that carry an amount, and drops the editor's own bookkeeping. */
  function cleanItems(items) {
    return items.filter((i) => U.num(i.amount) > 0).map((i) => {
      const out = Object.assign({}, i);
      delete out.touched;
      return out;
    });
  }

  /* ── 1. Mileage (EPSON) ────────────────────────────────────────── */
  Forms.mileage = function (entry, company, prefill, onSaved) {
    const s = window.Store.settings;
    const e = entry || {};
    const p = prefill || {};

    const state = {
      id: e.id || null,
      type: 'mileage',
      company: company,
      date: e.date || p.date || U.today(),
      from: e.from || p.from || (s.homePlace || null),
      to: e.to || p.to || null,
      via: (e.via || []).slice(),
      roundTrip: entry ? !!e.roundTrip : (p.roundTrip !== undefined ? p.roundTrip : !!s.roundTripDefault),
      kmAuto: e.kmAuto || p.km || 0,
      kmManual: e.kmManual || null,
      kmSource: e.kmSource || p.kmSource || 'estimate',
      rate: e.rate || s.ratePerKm || 0.43,
      visited: e.visited || '',
      contact: e.contact || '',
      purpose: e.purpose || '',
      note: e.note || '',
      tripId: e.tripId || p.tripId || null,
      createdAt: e.createdAt,
    };

    const body = document.createElement('div');
    body.innerHTML =
      '<div class="form-grid">' +
        '<div class="field"><label>Date of travel</label>' +
          '<input class="input" type="date" data-f="date" value="' + U.attr(state.date) + '"></div>' +
        '<div class="field"><label>Company visited</label>' +
          '<input class="input" data-f="visited" value="' + U.attr(state.visited) + '" placeholder="Customer or partner"></div>' +

        '<div class="field"><label>Starting point</label>' +
          '<div class="suggest" data-place="from"><input class="input" autocomplete="off" placeholder="Town in Slovenia or Croatia"></div>' +
          '<div style="display:flex;gap:6px;margin-top:2px">' +
            '<button type="button" class="btn btn-sm btn-ghost" data-act="here-from">' + I.pin + '<span>Where I am</span></button>' +
            '<button type="button" class="btn btn-sm btn-ghost" data-act="home">' + I.building + '<span>Home base</span></button>' +
          '</div></div>' +
        '<div class="field"><label>Destination</label>' +
          '<div class="suggest" data-place="to"><input class="input" autocomplete="off" placeholder="Town in Slovenia or Croatia"></div>' +
          '<div style="display:flex;gap:6px;margin-top:2px">' +
            '<button type="button" class="btn btn-sm btn-ghost" data-act="here-to">' + I.pin + '<span>Where I am</span></button>' +
            '<button type="button" class="btn btn-sm btn-ghost" data-act="swap">' + I.swap + '<span>Swap</span></button>' +
            '<button type="button" class="btn btn-sm btn-ghost" data-act="add-stop">' + I.plus + '<span>Add stop</span></button>' +
          '</div></div>' +

        '<div class="span-2" data-vias></div>' +

        '<div class="span-2 switch-row">' +
          '<div class="sw"><input type="checkbox" data-f="roundTrip"' + (state.roundTrip ? ' checked' : '') + '><i></i></div>' +
          '<div class="sw-text"><b>Return journey</b><span>Doubles the distance for the drive back</span></div>' +
        '</div>' +

        '<div class="field span-2">' +
          '<label>Distance</label>' +
          '<div class="card" style="padding:14px;display:flex;gap:14px;align-items:center;flex-wrap:wrap">' +
            '<div class="stat" style="min-width:110px">' +
              '<div class="stat-num" data-km>0,00</div>' +
              '<div class="stat-cap" data-kmsrc>calculating</div>' +
            '</div>' +
            '<div style="flex:1;min-width:170px">' +
              '<div class="switch-row" style="background:none;border:0;padding:0">' +
                '<div class="sw"><input type="checkbox" data-f="manualOn"' + (state.kmManual !== null ? ' checked' : '') + '><i></i></div>' +
                '<div class="sw-text"><b>Correct by hand</b><span>Overrides the calculated distance</span></div>' +
              '</div>' +
              '<div class="input-group" style="margin-top:8px" data-manual-wrap' + (state.kmManual === null ? ' hidden' : '') + '>' +
                '<input class="input input-money" data-f="kmManual" inputmode="decimal" value="' +
                  U.attr(state.kmManual !== null ? U.num2(state.kmManual) : '') + '" placeholder="0,0">' +
                '<span class="addon" data-km-addon>km</span>' +
              '</div>' +
            '</div>' +
            '<div class="field" style="width:130px">' +
              '<label>Rate</label>' +
              '<div class="input-group">' +
                '<input class="input input-money" data-f="rate" inputmode="decimal" value="' + U.attr(String(state.rate).replace('.', ',')) + '">' +
                '<span class="addon">€/km</span>' +
              '</div>' +
            '</div>' +
            '<button type="button" class="btn btn-sm" data-act="recalc">' + I.route + '<span>Recalculate</span></button>' +
          '</div>' +
          '<div class="field-hint" data-note></div>' +
        '</div>' +

        '<div class="field"><label>Contact person</label>' +
          '<input class="input" data-f="contact" value="' + U.attr(state.contact) + '" placeholder="Name — role"></div>' +
        '<div class="field"><label>Purpose of visit</label>' +
          '<input class="input" data-f="purpose" value="' + U.attr(state.purpose) + '" placeholder="e.g. Installation, sales meeting"></div>' +
        '<div class="field span-2"><label>Note</label>' +
          '<textarea class="input" data-f="note" placeholder="Anything worth remembering">' + U.esc(state.note) + '</textarea></div>' +
      '</div>';

    const m = C.modal({
      title: entry ? 'Edit mileage' : 'New mileage',
      sub: company + ' · ' + window.Store.settings.name,
      body: body,
      footer: footer('', 'Save mileage'),
    });

    const kmEl = U.$('[data-km]', body);
    const srcEl = U.$('[data-kmsrc]', body);
    const noteEl = U.$('[data-note]', body);
    const totalEl = U.$('[data-total]', m.foot);
    const manualWrap = U.$('[data-manual-wrap]', body);
    const viasHost = U.$('[data-vias]', body);

    const fromPick = C.attachPlace(U.$('[data-place=from]', body), {
      initial: state.from, onPick: (p) => { state.from = p; lookup(); },
    });
    const toPick = C.attachPlace(U.$('[data-place=to]', body), {
      initial: state.to, onPick: (p) => { state.to = p; lookup(); },
    });

    function renderVias() {
      viasHost.innerHTML = '';
      state.via.forEach((v, i) => {
        const row = document.createElement('div');
        row.className = 'field';
        row.style.marginBottom = '10px';
        row.innerHTML = '<label>Stop ' + (i + 1) + '</label>' +
          '<div style="display:flex;gap:8px">' +
            '<div class="suggest" style="flex:1"><input class="input" autocomplete="off" placeholder="Town on the way"></div>' +
            '<button type="button" class="btn btn-ghost btn-danger btn-icon">' + I.trash + '</button>' +
          '</div>';
        C.attachPlace(row.querySelector('.suggest'), {
          initial: v, onPick: (p) => { state.via[i] = p; lookup(); },
        });
        row.querySelector('button').addEventListener('click', () => {
          state.via.splice(i, 1);
          renderVias();
          lookup();
        });
        viasHost.appendChild(row);
      });
    }
    renderVias();

    function effectiveKm() {
      const base = state.kmManual !== null ? state.kmManual : state.kmAuto;
      return U.round1(base * (state.roundTrip ? 2 : 1));
    }

    function paint() {
      const km = effectiveKm();
      kmEl.textContent = U.num2(km) + ' km';
      const src = state.kmManual !== null ? 'entered by hand'
        : state.kmSource === 'osrm' ? 'road distance'
        : state.kmSource === 'gps' ? 'recorded by GPS'
        : 'estimated';
      srcEl.textContent = src + (state.roundTrip ? ' · return' : ' · one way');
      const addon = U.$('[data-km-addon]', body);
      if (addon) addon.textContent = state.roundTrip ? 'km each way' : 'km';
      totalEl.textContent = U.eur(km * state.rate);
      if (state.kmSource === 'estimate' && state.kmManual === null && state.kmAuto > 0) {
        noteEl.className = 'field-hint is-warn';
        noteEl.textContent = 'Straight-line estimate (no road data available) — check it against your odometer.';
      } else {
        noteEl.className = 'field-hint';
        noteEl.textContent = state.kmSource === 'osrm'
          ? 'Driving distance along real roads.'
          : state.kmSource === 'gps' ? 'Taken from the recorded trip.' : '';
      }
    }

    let lookupToken = 0;
    async function lookup() {
      if (state.kmManual !== null) { paint(); return; }
      if (!state.from || !state.to) { state.kmAuto = 0; paint(); return; }
      const token = ++lookupToken;
      srcEl.textContent = 'calculating…';
      const pts = [state.from].concat(state.via.filter(Boolean), [state.to]);
      const res = await window.Dist.route(pts);
      if (token !== lookupToken) return;
      state.kmAuto = res.km;
      state.kmSource = res.source;
      paint();
    }

    body.addEventListener('input', (ev) => {
      const f = ev.target.dataset.f;
      if (!f) return;
      if (f === 'kmManual') { state.kmManual = U.num(ev.target.value); paint(); }
      else if (f === 'rate') { state.rate = U.num(ev.target.value); paint(); }
      else if (f !== 'roundTrip' && f !== 'manualOn') state[f] = ev.target.value;
    });

    body.addEventListener('change', (ev) => {
      const f = ev.target.dataset.f;
      if (f === 'roundTrip') { state.roundTrip = ev.target.checked; paint(); }
      if (f === 'manualOn') {
        if (ev.target.checked) {
          state.kmManual = state.kmAuto || 0;
          manualWrap.hidden = false;
          const inp = U.$('[data-f=kmManual]', body);
          inp.value = U.num2(state.kmManual);
          inp.focus();
        } else {
          state.kmManual = null;
          manualWrap.hidden = true;
          lookup();
        }
        paint();
      }
      if (f === 'date') state.date = ev.target.value;
    });

    body.addEventListener('click', async (ev) => {
      const act = ev.target.closest('[data-act]');
      if (!act) return;
      const a = act.dataset.act;
      if (a === 'swap') {
        const t = state.from; state.from = state.to; state.to = t;
        fromPick.set(state.from); toPick.set(state.to);
        lookup();
      } else if (a === 'add-stop') {
        state.via.push(null);
        renderVias();
      } else if (a === 'home') {
        if (!window.Store.settings.homePlace) return U.toast('Set a home base in Settings first', 'err');
        state.from = window.Store.settings.homePlace;
        fromPick.set(state.from);
        lookup();
      } else if (a === 'here-from' || a === 'here-to') {
        try {
          U.toast('Finding your location…');
          const pos = await window.Dist.currentPosition();
          const near = window.Dist.nearest(pos.lat, pos.lon, 40);
          if (!near) return U.toast('No known town near you — type the name in', 'err');
          if (a === 'here-from') { state.from = near; fromPick.set(near); }
          else { state.to = near; toPick.set(near); }
          lookup();
        } catch (err) {
          U.toast(err.message, 'err');
        }
      } else if (a === 'recalc') {
        state.kmManual = null;
        U.$('[data-f=manualOn]', body).checked = false;
        manualWrap.hidden = true;
        lookup();
      }
    });

    m.foot.addEventListener('click', async (ev) => {
      const act = ev.target.closest('[data-act]');
      if (!act) return;
      if (act.dataset.act === 'cancel') return m.close();
      if (!state.from || !state.to) return U.toast('Pick a starting point and a destination', 'err');
      const km = effectiveKm();
      if (km <= 0) return U.toast('The distance is zero — check the route', 'err');

      const saved = await window.Store.saveEntry({
        id: state.id, createdAt: state.createdAt,
        type: 'mileage', company: state.company, date: state.date,
        from: state.from, to: state.to, via: state.via.filter(Boolean),
        roundTrip: state.roundTrip,
        kmAuto: state.kmAuto, kmManual: state.kmManual, kmSource: state.kmSource,
        km: km, rate: state.rate, total: U.round2(km * state.rate),
        visited: state.visited, contact: state.contact, purpose: state.purpose,
        note: state.note, tripId: state.tripId,
        person: window.Store.settings.name,
      });
      if (state.tripId) {
        const trip = window.Store.trips.find((t) => t.id === state.tripId);
        if (trip) { trip.entryId = saved.id; await window.Store.saveTrip(trip); }
      }
      m.close();
      U.toast('Mileage saved · ' + U.eur(saved.total));
      if (onSaved) onSaved(saved);
    });

    paint();
    // A claimed drive already carries the distance the phone measured; keep it
    // rather than replacing it with a routed guess. "Recalculate" still works.
    if (!(p.km && p.kmSource === 'gps')) lookup();

  };

  /* ── 2. Other expenses (EPSON) ─────────────────────────────────── */
  Forms.other = function (entry, company, onSaved) {
    const e = entry || {};
    const state = {
      id: e.id || null, createdAt: e.createdAt,
      category: e.category || 'phone',
      date: e.date || U.today(),
      vendor: e.vendor || '',
      description: e.description || '',
      amount: e.total || 0,
      receiptId: e.receiptId || null,
      note: e.note || '',
    };

    const body = document.createElement('div');
    body.innerHTML =
      '<div class="form-grid">' +
        '<div class="field"><label>Category</label>' +
          '<select class="select" data-f="category">' + C.options(Forms.OTHER_CATEGORIES, state.category) + '</select></div>' +
        '<div class="field"><label>Date</label>' +
          '<input class="input" type="date" data-f="date" value="' + U.attr(state.date) + '"></div>' +
        '<div class="field"><label>Supplier</label>' +
          '<input class="input" data-f="vendor" value="' + U.attr(state.vendor) + '" placeholder="e.g. A1 Slovenija, Petrol"></div>' +
        '<div class="field"><label>Amount</label>' +
          '<div class="input-group">' +
            '<input class="input input-money" data-f="amount" inputmode="decimal" value="' +
              U.attr(state.amount ? U.num2(state.amount) : '') + '" placeholder="0,00">' +
            '<span class="addon">€</span></div></div>' +
        '<div class="field span-2"><label>Description</label>' +
          '<input class="input" data-f="description" value="' + U.attr(state.description) + '" placeholder="What was it for"></div>' +
        '<div class="span-2" data-receipt></div>' +
        '<div class="field span-2"><label>Note</label>' +
          '<textarea class="input" data-f="note">' + U.esc(state.note) + '</textarea></div>' +
      '</div>';

    const m = C.modal({
      title: entry ? 'Edit expense' : 'New expense',
      sub: company + ' · ' + window.Store.settings.name,
      body: body,
      footer: footer(U.eur(state.amount), 'Save expense'),
    });

    const totalEl = U.$('[data-total]', m.foot);
    const amountEl = U.$('[data-f=amount]', body);

    const receipt = C.receiptField({
      receiptId: state.receiptId,
      onReceipt: (id) => { state.receiptId = id; },
      onResult: (res) => {
        if (res.amount && !U.num(amountEl.value)) {
          state.amount = res.amount;
          amountEl.value = U.num2(res.amount);
          totalEl.textContent = U.eur(res.amount);
        }
        if (res.date && !entry) {
          state.date = res.date;
          U.$('[data-f=date]', body).value = res.date;
        }
        if (res.vendor && !U.$('[data-f=vendor]', body).value) {
          state.vendor = res.vendor;
          U.$('[data-f=vendor]', body).value = res.vendor;
        }
      },
    });
    U.$('[data-receipt]', body).appendChild(receipt.el);

    body.addEventListener('input', (ev) => {
      const f = ev.target.dataset.f;
      if (!f) return;
      if (f === 'amount') { state.amount = U.num(ev.target.value); totalEl.textContent = U.eur(state.amount); }
      else state[f] = ev.target.value;
    });
    body.addEventListener('change', (ev) => {
      // Line items and attendees own their own fields; only the entry's own
      // inputs reach this handler.
      if (ev.target.closest('.item-card')) return;
      const f = ev.target.dataset.f;
      if (f) state[f] = ev.target.value;
    });

    m.foot.addEventListener('click', async (ev) => {
      const act = ev.target.closest('[data-act]');
      if (!act) return;
      if (act.dataset.act === 'cancel') return m.close();
      if (state.amount <= 0) return U.toast('Enter the amount', 'err');
      const saved = await window.Store.saveEntry({
        id: state.id, createdAt: state.createdAt,
        type: 'other', company: company, date: state.date,
        category: state.category, vendor: state.vendor, description: state.description,
        receiptId: state.receiptId, note: state.note,
        total: U.round2(state.amount),
        person: window.Store.settings.name,
      });
      m.close();
      U.toast('Expense saved · ' + U.eur(saved.total));
      if (onSaved) onSaved(saved);
    });
  };

  /* ── 3. Meetings / entertainment (both companies) ──────────────── */
  Forms.meeting = function (entry, company, onSaved) {
    const e = entry || {};
    const state = {
      id: e.id || null, createdAt: e.createdAt,
      date: e.date || U.today(),
      location: e.location || '',
      venue: e.venue || '',
      client: e.client || '',
      description: e.description || '',
      attendees: (e.attendees || []).slice(),
      items: (e.items || []).map((x) => Object.assign({}, x)),
      note: e.note || '',
    };
    if (!state.items.length) state.items.push(newItem(Forms.MEETING_KINDS));
    if (!state.attendees.length) state.attendees.push({ name: '', role: 'CEO' });

    const body = document.createElement('div');
    body.innerHTML =
      '<div class="form-grid">' +
        '<div class="field"><label>Date</label>' +
          '<input class="input" type="date" data-f="date" value="' + U.attr(state.date) + '"></div>' +
        '<div class="field"><label>Location</label>' +
          '<div class="suggest" data-place="loc"><input class="input" autocomplete="off" value="' +
            U.attr(state.location) + '" placeholder="Town"></div></div>' +
        '<div class="field"><label>Venue</label>' +
          '<input class="input" data-f="venue" value="' + U.attr(state.venue) + '" placeholder="Restaurant, hotel, office"></div>' +
        '<div class="field"><label>Company met</label>' +
          '<input class="input" data-f="client" value="' + U.attr(state.client) + '" placeholder="Customer or partner"></div>' +
        '<div class="field span-2"><label>What it was about</label>' +
          '<input class="input" data-f="description" value="' + U.attr(state.description) + '" placeholder="Purpose of the meeting"></div>' +
      '</div>' +

      '<div class="divider"></div>' +
      '<div class="card-head"><div class="card-title">People present</div>' +
        '<button type="button" class="btn btn-sm" data-act="add-person">' + I.plus + '<span>Add person</span></button></div>' +
      '<div class="chip" style="margin-bottom:10px">' + I.users +
        '<span>' + U.esc(window.Store.settings.name) + ' — host</span></div>' +
      '<div class="items" data-people></div>' +

      '<div class="divider"></div>' +
      '<div class="card-head"><div class="card-title">Costs</div>' +
        '<button type="button" class="btn btn-sm" data-act="add-item">' + I.plus + '<span>Add line</span></button></div>' +
      '<div class="items" data-items></div>' +

      '<div class="divider"></div>' +
      '<div class="field"><label>Note</label>' +
        '<textarea class="input" data-f="note">' + U.esc(state.note) + '</textarea></div>';

    const m = C.modal({
      title: entry ? 'Edit meeting' : 'New meeting / entertainment',
      sub: company + ' · ' + window.Store.settings.name,
      body: body,
      footer: footer(U.eur(itemsTotal(state.items)), 'Save meeting'),
    });

    const totalEl = U.$('[data-total]', m.foot);
    const update = () => { totalEl.textContent = U.eur(itemsTotal(state.items)); };

    C.attachPlace(U.$('[data-place=loc]', body), {
      initial: state.location ? { name: state.location } : null,
      onPick: (p) => { if (p) state.location = p.name; },
    });
    U.$('[data-place=loc] input', body).addEventListener('input', (ev) => { state.location = ev.target.value; });

    const people = U.$('[data-people]', body);
    function renderPeople() {
      people.innerHTML = '';
      state.attendees.forEach((a, i) => {
        const card = document.createElement('div');
        card.className = 'item-card attendee-card';
        card.innerHTML =
          '<div class="field"><label>Name</label>' +
            '<input class="input" data-p="name" value="' + U.attr(a.name) + '" placeholder="Full name"></div>' +
          '<div class="field"><label>Role</label>' +
            '<select class="select" data-p="role">' +
              C.options(Forms.ROLES.map((r) => [r, r]), a.role) + '</select></div>' +
          '<div class="field del"><label>&nbsp;</label>' +
            '<button type="button" class="btn btn-sm btn-ghost btn-danger">' + I.trash + '</button></div>';
        card.addEventListener('input', (ev) => {
          const p = ev.target.dataset.p;
          if (p) a[p] = ev.target.value;
        });
        card.addEventListener('change', (ev) => {
          const p = ev.target.dataset.p;
          if (p) a[p] = ev.target.value;
        });
        card.querySelector('button').addEventListener('click', () => {
          state.attendees.splice(i, 1);
          if (!state.attendees.length) state.attendees.push({ name: '', role: 'CEO' });
          renderPeople();
        });
        people.appendChild(card);
      });
    }
    renderPeople();

    const list = itemList(U.$('[data-items]', body), state, Forms.MEETING_KINDS, update);

    body.addEventListener('click', (ev) => {
      const act = ev.target.closest('[data-act]');
      if (!act) return;
      if (act.dataset.act === 'add-person') {
        state.attendees.push({ name: '', role: 'CTO' });
        renderPeople();
      } else if (act.dataset.act === 'add-item') {
        state.items.push(newItem(Forms.MEETING_KINDS));
        list.render();
        update();
      }
    });

    body.addEventListener('input', (ev) => {
      // Line items and attendees own their own fields; only the entry's own
      // inputs reach this handler.
      if (ev.target.closest('.item-card')) return;
      const f = ev.target.dataset.f;
      if (f) state[f] = ev.target.value;
    });
    body.addEventListener('change', (ev) => {
      // Line items and attendees own their own fields; only the entry's own
      // inputs reach this handler.
      if (ev.target.closest('.item-card')) return;
      const f = ev.target.dataset.f;
      if (f) state[f] = ev.target.value;
    });

    m.foot.addEventListener('click', async (ev) => {
      const act = ev.target.closest('[data-act]');
      if (!act) return;
      if (act.dataset.act === 'cancel') return m.close();
      const items = cleanItems(state.items);
      if (!items.length) return U.toast('Add at least one cost line', 'err');
      const attendees = state.attendees.filter((a) => a.name.trim());
      const saved = await window.Store.saveEntry({
        id: state.id, createdAt: state.createdAt,
        type: 'meeting', company: company, date: state.date,
        location: state.location, venue: state.venue, client: state.client,
        description: state.description, attendees: attendees, items: items,
        note: state.note, total: itemsTotal(items),
        person: window.Store.settings.name,
      });
      m.close();
      U.toast('Meeting saved · ' + U.eur(saved.total));
      if (onSaved) onSaved(saved);
    });
  };

  /* ── 4. Travel (both companies) ────────────────────────────────── */
  Forms.travel = function (entry, company, onSaved) {
    const e = entry || {};
    const state = {
      id: e.id || null, createdAt: e.createdAt,
      country: e.country || 'DE',
      city: e.city || '',
      date: e.date || U.today(),
      dateTo: e.dateTo || e.date || U.today(),
      client: e.client || '',
      purpose: e.purpose || '',
      items: (e.items || []).map((x) => Object.assign({}, x)),
      note: e.note || '',
    };
    if (!state.items.length) state.items.push(newItem(Forms.TRAVEL_KINDS));

    const body = document.createElement('div');
    body.innerHTML =
      '<div class="form-grid">' +
        '<div class="field"><label>Country</label>' +
          '<select class="select" data-f="country">' +
            C.options((window.COUNTRIES || []).map((c) => [c[1], c[0] + (c[3] ? ' · EU' : '')]), state.country) +
          '</select><div class="field-hint" data-eu></div></div>' +
        '<div class="field"><label>City</label>' +
          '<input class="input" data-f="city" value="' + U.attr(state.city) + '" placeholder="e.g. Frankfurt"></div>' +
        '<div class="field"><label>Departure</label>' +
          '<input class="input" type="date" data-f="date" value="' + U.attr(state.date) + '"></div>' +
        '<div class="field"><label>Return</label>' +
          '<input class="input" type="date" data-f="dateTo" value="' + U.attr(state.dateTo) + '"></div>' +
        '<div class="field"><label>Company visited</label>' +
          '<input class="input" data-f="client" value="' + U.attr(state.client) + '" placeholder="Customer, partner or fair"></div>' +
        '<div class="field"><label>Purpose</label>' +
          '<input class="input" data-f="purpose" value="' + U.attr(state.purpose) + '" placeholder="e.g. Trade fair, training"></div>' +
      '</div>' +

      '<div class="divider"></div>' +
      '<div class="card-head"><div class="card-title">Costs</div>' +
        '<div style="margin-left:auto;display:flex;gap:6px;flex-wrap:wrap">' +
          '<button type="button" class="btn btn-sm" data-quick="flight">' + I.plane + '<span>Flight</span></button>' +
          '<button type="button" class="btn btn-sm" data-quick="hotel">' + I.bed + '<span>Hotel</span></button>' +
          '<button type="button" class="btn btn-sm" data-quick="taxi">' + I.taxi + '<span>Taxi</span></button>' +
          '<button type="button" class="btn btn-sm" data-quick="esim" data-esim hidden>' + I.sim + '<span>eSIM</span></button>' +
          '<button type="button" class="btn btn-sm btn-violet" data-act="add-item">' + I.plus + '<span>Add line</span></button>' +
        '</div></div>' +
      '<div class="items" data-items></div>' +

      '<div class="divider"></div>' +
      '<div class="field"><label>Note</label>' +
        '<textarea class="input" data-f="note">' + U.esc(state.note) + '</textarea></div>';

    const m = C.modal({
      title: entry ? 'Edit travel' : 'New travel expense',
      sub: company + ' · ' + window.Store.settings.name,
      body: body,
      footer: footer(U.eur(itemsTotal(state.items)), 'Save travel'),
    });

    const totalEl = U.$('[data-total]', m.foot);
    const euHint = U.$('[data-eu]', body);
    const esimBtn = U.$('[data-esim]', body);
    const update = () => { totalEl.textContent = U.eur(itemsTotal(state.items)); };
    const list = itemList(U.$('[data-items]', body), state, Forms.TRAVEL_KINDS, update);

    function paintCountry() {
      const c = Forms.country(state.country);
      if (!c) return;
      const outsideRoaming = !c[4];
      esimBtn.hidden = !outsideRoaming;
      euHint.className = 'field-hint' + (outsideRoaming ? ' is-warn' : '');
      euHint.textContent = c[3]
        ? 'EU member · roaming included · local currency ' + c[2]
        : outsideRoaming
          ? 'Outside EU roaming — an eSIM data pack is claimable · local currency ' + c[2]
          : 'Non-EU but inside the roaming area · local currency ' + c[2];

      // Offer the country's own currency first on new lines.
      state.items.forEach((it) => {
        if (!it.amount && it.currency === 'EUR' && c[2] !== 'EUR') { /* leave EUR as the default */ }
      });
    }
    paintCountry();

    body.addEventListener('click', (ev) => {
      const quick = ev.target.closest('[data-quick]');
      if (quick) {
        const kind = quick.dataset.quick;
        // Reuse the one untouched line the form starts with; after that every
        // quick button adds a line of its own.
        const only = state.items.length === 1 ? state.items[0] : null;
        const blank = only && !only.touched && !U.num(only.amount) && !only.description ? only : null;
        const item = blank || newItem(Forms.TRAVEL_KINDS);
        item.kind = kind;
        item.touched = true;
        if (!blank) state.items.push(item);
        list.render();
        update();
        return;
      }
      const act = ev.target.closest('[data-act]');
      if (act && act.dataset.act === 'add-item') {
        state.items.push(newItem(Forms.TRAVEL_KINDS));
        list.render();
        update();
      }
    });

    body.addEventListener('input', (ev) => {
      // Line items and attendees own their own fields; only the entry's own
      // inputs reach this handler.
      if (ev.target.closest('.item-card')) return;
      const f = ev.target.dataset.f;
      if (f) state[f] = ev.target.value;
    });
    body.addEventListener('change', (ev) => {
      // Line items and attendees own their own fields; only the entry's own
      // inputs reach this handler.
      if (ev.target.closest('.item-card')) return;
      const f = ev.target.dataset.f;
      if (!f) return;
      state[f] = ev.target.value;
      if (f === 'country') paintCountry();
      if (f === 'date' && state.dateTo < state.date) {
        state.dateTo = state.date;
        U.$('[data-f=dateTo]', body).value = state.date;
      }
    });

    m.foot.addEventListener('click', async (ev) => {
      const act = ev.target.closest('[data-act]');
      if (!act) return;
      if (act.dataset.act === 'cancel') return m.close();
      const items = cleanItems(state.items);
      if (!items.length) return U.toast('Add at least one cost line', 'err');
      const c = Forms.country(state.country);
      const saved = await window.Store.saveEntry({
        id: state.id, createdAt: state.createdAt,
        type: 'travel', company: company, date: state.date, dateTo: state.dateTo,
        country: state.country, countryName: c ? c[0] : state.country, eu: c ? !!c[3] : null,
        city: state.city, client: state.client, purpose: state.purpose,
        items: items, note: state.note, total: itemsTotal(items),
        person: window.Store.settings.name,
      });
      m.close();
      U.toast('Travel saved · ' + U.eur(saved.total));
      if (onSaved) onSaved(saved);
    });
  };

  Forms.newItem = newItem;
  Forms.itemsTotal = itemsTotal;
  window.Forms = Forms;
}());
