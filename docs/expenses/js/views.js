/* Screens. Each view returns { html, mount(root) } so the shell can swap them
   in without a framework. */
(function () {
  'use strict';

  const U = window.U;
  const I = window.ICONS;
  const C = window.C;
  const F = () => window.Forms;
  const Views = {};

  /* Which sections each company uses. Mileage and the running costs of the car
     are EPSON's; meetings and travel are claimed at both. */
  Views.sections = function (company) {
    const both = [
      { id: 'meetings', label: 'Meetings', icon: I.users, type: 'meeting' },
      { id: 'travel', label: 'Travel', icon: I.plane, type: 'travel' },
    ];
    if (company === 'EPSON') {
      return [
        { id: 'mileage', label: 'Mileage', icon: I.car, type: 'mileage' },
        { id: 'other', label: 'Other expenses', icon: I.receipt, type: 'other' },
      ].concat(both);
    }
    return both;
  };

  Views.typeLabel = {
    mileage: 'Mileage', other: 'Other expense', meeting: 'Meeting', travel: 'Travel',
  };

  /* ── Row rendering ─────────────────────────────────────────────── */
  function rowTitle(e) {
    if (e.type === 'mileage') {
      const via = (e.via || []).length ? ' · via ' + e.via.map((v) => v.name).join(', ') : '';
      return (e.from ? e.from.name : '?') + ' → ' + (e.to ? e.to.name : '?') + via;
    }
    if (e.type === 'other') return F().kindLabel(e.category) + (e.vendor ? ' · ' + e.vendor : '');
    if (e.type === 'meeting') return (e.client || 'Meeting') + (e.venue ? ' · ' + e.venue : '');
    if (e.type === 'travel') return (e.countryName || e.country) + (e.city ? ' · ' + e.city : '');
    return 'Entry';
  }

  function rowSub(e) {
    const bits = [U.dateLabel(e.date)];
    if (e.type === 'mileage') {
      bits.push(U.num2(e.km) + ' km' + (e.roundTrip ? ' return' : ''));
      if (e.visited) bits.push(e.visited);
      if (e.kmSource === 'gps') bits.push('GPS');
      else if (e.kmManual !== null && e.kmManual !== undefined) bits.push('by hand');
    } else if (e.type === 'other') {
      if (e.description) bits.push(e.description);
    } else if (e.type === 'meeting') {
      const n = (e.attendees || []).length;
      if (e.location) bits.push(e.location);
      bits.push(n ? n + (n === 1 ? ' guest' : ' guests') : 'no guests listed');
    } else if (e.type === 'travel') {
      if (e.dateTo && e.dateTo !== e.date) bits[0] = U.dateLabel(e.date) + ' – ' + U.dateLabel(e.dateTo);
      if (e.client) bits.push(e.client);
      bits.push((e.items || []).length + ' items');
    }
    return bits.join(' · ');
  }

  function entryRow(e, opts) {
    opts = opts || {};
    return '<div class="row" data-id="' + U.attr(e.id) + '">' +
      '<div class="tile t-' + e.type + '">' + (e.type === 'other' ? F().kindIcon(e.category) :
        e.type === 'mileage' ? I.car : e.type === 'meeting' ? I.users : I.plane) + '</div>' +
      '<div class="row-main">' +
        '<div class="row-title">' + U.esc(rowTitle(e)) + '</div>' +
        '<div class="row-sub">' + U.esc(rowSub(e)) + (opts.showType ? ' · ' + Views.typeLabel[e.type] : '') + '</div>' +
      '</div>' +
      '<div class="row-amt">' + U.esc(U.eur(e.total)) + '</div>' +
      '<div class="row-actions desktop-only">' +
        '<button class="btn btn-icon btn-ghost" data-act="edit" title="Edit">' + I.edit + '</button>' +
        '<button class="btn btn-icon btn-ghost" data-act="copy" title="Duplicate">' + I.copy + '</button>' +
        '<button class="btn btn-icon btn-ghost btn-danger" data-act="del" title="Delete">' + I.trash + '</button>' +
      '</div>' +
    '</div>';
  }
  Views.entryRow = entryRow;

  function emptyState(title, text, action) {
    return '<div class="empty">' + I.inbox +
      '<h3>' + U.esc(title) + '</h3><p>' + U.esc(text) + '</p>' +
      (action || '') + '</div>';
  }

  /* Wires up edit / duplicate / delete on any list of entry rows. */
  Views.wireRows = function (root, refresh) {
    root.addEventListener('click', async (ev) => {
      const row = ev.target.closest('.row[data-id]');
      if (!row) return;
      const entry = window.Store.getEntry(row.dataset.id);
      if (!entry) return;
      const act = ev.target.closest('[data-act]');
      const what = act ? act.dataset.act : 'edit';

      if (what === 'del') {
        const ok = await C.confirm('Delete this entry of ' + U.eur(entry.total) + '? This cannot be undone.',
          { danger: true, title: 'Delete entry' });
        if (!ok) return;
        await window.Store.deleteEntry(entry.id);
        U.toast('Entry deleted');
        refresh();
        return;
      }
      if (what === 'copy') {
        const copy = JSON.parse(JSON.stringify(entry));
        delete copy.id;
        delete copy.createdAt;
        copy.date = U.today();
        (copy.items || []).forEach((it) => { it.receiptId = null; it.id = U.uid(); });
        copy.receiptId = null;
        Views.openForm(entry.type, copy, entry.company, refresh);
        return;
      }
      Views.openForm(entry.type, entry, entry.company, refresh);
    });
  };

  Views.openForm = function (type, entry, company, refresh) {
    const f = F();
    const done = () => refresh && refresh();
    if (type === 'mileage') f.mileage(entry, company, null, done);
    else if (type === 'other') f.other(entry, company, done);
    else if (type === 'meeting') f.meeting(entry, company, done);
    else if (type === 'travel') f.travel(entry, company, done);
  };

  /* ── Dashboard ─────────────────────────────────────────────────── */
  Views.dashboard = function (app) {
    const company = app.company;
    const all = window.Store.byCompany(company);
    const months = U.lastMonths(6);
    const thisMonth = months[months.length - 1];
    // Six columns will not fit "Aug 2026" on a phone, so drop the year there.
    const barLabel = (k) => (U.isMobile() ? U.monthLabel(k).split(' ')[0] : U.monthLabel(k));
    const byMonth = months.map((k) => ({
      label: barLabel(k),
      value: U.round2(U.sum(all.filter((e) => U.monthKey(e.date) === k), (e) => e.total)),
      key: k,
    }));
    const monthTotal = byMonth[byMonth.length - 1].value;
    const prev = byMonth[byMonth.length - 2] ? byMonth[byMonth.length - 2].value : 0;
    const peak = Math.max.apply(null, byMonth.map((b) => b.value).concat([1]));
    const year = String(new Date().getFullYear());
    const yearTotal = U.round2(U.sum(all.filter((e) => (e.date || '').startsWith(year)), (e) => e.total));
    const kmYear = U.round1(U.sum(all.filter((e) => e.type === 'mileage' && (e.date || '').startsWith(year)), (e) => e.km));

    const delta = prev > 0 ? Math.round(((monthTotal - prev) / prev) * 100) : null;
    const sections = Views.sections(company);
    const counts = sections.map((s) => ({
      s: s,
      n: all.filter((e) => e.type === s.type && U.monthKey(e.date) === thisMonth).length,
      sum: U.round2(U.sum(all.filter((e) => e.type === s.type && U.monthKey(e.date) === thisMonth), (e) => e.total)),
    }));

    const recent = all.slice(0, 8);
    const trip = window.Trip.active();

    const html =
      '<div class="section-head">' +
        '<div><h1>' + U.esc(company) + ' overview</h1>' +
        '<p>' + U.esc(window.Store.settings.name) + ' · ' + U.esc(U.monthLabel(thisMonth)) + '</p></div>' +
        '<div class="spacer"></div>' +
        '<button class="btn btn-primary desktop-only" data-new>' + I.plus + '<span>New entry</span></button>' +
      '</div>' +

      (trip ? tripBanner(trip) : '') +

      '<div class="grid grid-hero" style="margin-top:14px">' +
        '<div class="card">' +
          '<div class="card-head"><div class="card-title">This month</div></div>' +
          (delta !== null ? '<div class="badge-float' + (delta > 0 ? ' is-down' : '') + '">' +
            (delta > 0 ? '+' : '') + delta + '% vs ' + U.esc(U.monthLabel(months[months.length - 2])) + '</div>' : '') +
          C.gauge(monthTotal, Math.max(peak, monthTotal, 1), 'EUR claimed') +
        '</div>' +
        '<div class="card">' +
          '<div class="card-head"><div class="card-title">Last six months</div></div>' +
          C.bars(byMonth, { highlight: 'last' }) +
        '</div>' +
      '</div>' +

      '<div class="grid grid-3" style="margin-top:14px">' +
        '<div class="card"><div class="stat">' +
          '<div class="stat-cap">Year to date</div>' +
          '<div class="stat-num text-money">' + U.esc(U.eur(yearTotal)) + '</div>' +
          '<div class="stat-sub">' + all.length + ' entries recorded</div>' +
        '</div></div>' +
        '<div class="card"><div class="stat">' +
          '<div class="stat-cap">Kilometres this year</div>' +
          '<div class="stat-num">' + U.esc(U.num2(kmYear)) + ' km</div>' +
          '<div class="stat-sub">at ' + U.esc(U.eur(window.Store.settings.ratePerKm)) + ' per km</div>' +
        '</div></div>' +
        '<div class="card"><div class="stat">' +
          '<div class="stat-cap">Receipts stored</div>' +
          '<div class="stat-num">' + window.Store.countReceipts() + '</div>' +
          '<div class="stat-sub">photos attached to entries</div>' +
        '</div></div>' +
      '</div>' +

      '<div class="card" style="margin-top:14px">' +
        '<div class="card-head"><div class="card-title">This month by category</div></div>' +
        '<div class="chips">' + counts.map((c) =>
          '<button type="button" class="chip" data-go="' + U.attr(c.s.id) + '">' +
            '<span class="chip-hash">#</span><span>' + U.esc(c.s.label) + '</span>' +
            '<span class="chip-n">' + c.n + '</span>' +
            '<span style="opacity:.5">·</span><span>' + U.esc(U.eur(c.sum)) + '</span>' +
          '</button>').join('') +
        '</div>' +
      '</div>' +

      '<div class="card card-flush" style="margin-top:14px">' +
        '<div class="list-head"><div class="card-title">Latest entries</div>' +
          '<div style="flex:1"></div>' +
          '<button class="btn btn-sm btn-ghost" data-go="export">' + I.download + '<span>Export</span></button>' +
        '</div>' +
        (recent.length
          ? '<div class="rows">' + recent.map((e) => entryRow(e, { showType: true })).join('') + '</div>'
          : emptyState('Nothing recorded yet',
              'Add your first expense and it will show up here, on the chart and in the Excel export.')) +
      '</div>';

    return {
      html: html,
      mount: function (root) {
        Views.wireRows(root, app.refresh);
        root.addEventListener('click', (ev) => {
          const go = ev.target.closest('[data-go]');
          if (go) return app.go(go.dataset.go);
          if (ev.target.closest('[data-new]')) app.newEntryMenu();
        });
      },
    };
  };

  function tripBanner(trip) {
    return '<div class="trip-live">' +
      '<span class="pulse"></span>' +
      '<div style="flex:1;min-width:0">' +
        '<div class="stat-cap">Recording a drive</div>' +
        '<div class="trip-km" data-trip-km>' + U.esc(U.num2(trip.km)) + ' km</div>' +
        '<div class="small muted" data-trip-sub>started ' + U.esc(U.timeLabel(trip.startedAt)) +
          (trip.startPlace ? ' in ' + U.esc(trip.startPlace.name) : '') + '</div>' +
      '</div>' +
      '<button class="btn" data-go="trips">' + I.route + '<span class="desktop-only">Open</span></button>' +
      '<button class="btn btn-primary" data-act="stop-trip">' + I.stop + '<span>Stop</span></button>' +
    '</div>';
  }
  Views.tripBanner = tripBanner;

  /* ── Generic list screen ───────────────────────────────────────── */
  Views.list = function (app, section) {
    const company = app.company;
    const all = window.Store.byCompany(company, section.type);
    const months = ['all'].concat(U.lastMonths(12).slice().reverse());
    const filter = app.monthFilter || 'all';
    const shown = filter === 'all' ? all : all.filter((e) => U.monthKey(e.date) === filter);
    const total = U.round2(U.sum(shown, (e) => e.total));
    const kmTotal = section.type === 'mileage' ? U.round1(U.sum(shown, (e) => e.km)) : 0;

    const html =
      '<div class="section-head">' +
        '<div><h1>' + U.esc(section.label) + '</h1>' +
          '<p>' + shown.length + (shown.length === 1 ? ' entry' : ' entries') + ' · ' + U.esc(U.eur(total)) +
          (section.type === 'mileage' ? ' · ' + U.esc(U.num2(kmTotal)) + ' km' : '') + '</p></div>' +
        '<div class="spacer"></div>' +
        '<select class="select" data-month style="width:auto;min-width:150px">' +
          C.options(months.map((m) => [m, m === 'all' ? 'All months' : U.monthLabel(m)]), filter) +
        '</select>' +
        '<button class="btn btn-primary" data-add>' + I.plus + '<span class="desktop-only">New</span></button>' +
      '</div>' +

      (section.type === 'mileage' ? mileageStrip(shown) : '') +

      '<div class="card card-flush" style="margin-top:14px">' +
        (shown.length
          ? '<div class="rows">' + shown.map((e) => entryRow(e)).join('') + '</div>'
          : emptyState('No ' + section.label.toLowerCase() + ' yet',
              filter === 'all'
                ? 'Tap New to record the first one.'
                : 'Nothing in ' + U.monthLabel(filter) + '. Pick another month or add an entry.')) +
      '</div>';

    return {
      html: html,
      mount: function (root) {
        Views.wireRows(root, app.refresh);
        const sel = U.$('[data-month]', root);
        if (sel) sel.addEventListener('change', () => { app.monthFilter = sel.value; app.refresh(); });
        root.addEventListener('click', (ev) => {
          if (ev.target.closest('[data-add]')) Views.openForm(section.type, null, company, app.refresh);
        });
      },
    };
  };

  function mileageStrip(entries) {
    const byMonth = U.lastMonths(6).map((k) => ({
      label: U.isMobile() ? U.monthLabel(k).split(' ')[0] : U.monthLabel(k),
      value: U.round1(U.sum(entries.filter((e) => U.monthKey(e.date) === k), (e) => e.km)),
    }));
    if (!U.sum(byMonth, (b) => b.value)) return '';
    return '<div class="card" style="margin-top:14px">' +
      '<div class="card-head"><div class="card-title">Kilometres per month</div></div>' +
      C.bars(byMonth, { highlight: 'last' }) + '</div>';
  }

  /* ── Everything in one list (the phone's main list tab) ────────── */
  Views.all = function (app) {
    const company = app.company;
    const sections = Views.sections(company);
    const filter = app.typeFilter || 'all';
    const all = window.Store.byCompany(company);
    const shown = filter === 'all' ? all : all.filter((e) => e.type === filter);
    const total = U.round2(U.sum(shown, (e) => e.total));

    const chips = [{ id: 'all', label: 'All', icon: I.grid }]
      .concat(sections.map((s) => ({ id: s.type, label: s.label, icon: s.icon })));

    const html =
      '<div class="section-head">' +
        '<div><h1>Entries</h1><p>' + shown.length + (shown.length === 1 ? ' entry · ' : ' entries · ') +
          U.esc(U.eur(total)) + '</p></div>' +
        '<div class="spacer"></div>' +
        // On phones the same action already sits in the top bar.
        '<button class="btn btn-primary desktop-only" data-new>' + I.plus + '<span>New</span></button>' +
      '</div>' +

      '<div class="chips" style="margin-bottom:14px">' + chips.map((c) =>
        '<button type="button" class="chip' + (filter === c.id ? ' is-active' : '') +
          '" data-type="' + U.attr(c.id) + '">' + c.icon + '<span>' + U.esc(c.label) + '</span>' +
          '<span class="chip-n">' + (c.id === 'all' ? all.length : all.filter((e) => e.type === c.id).length) +
          '</span></button>').join('') + '</div>' +

      '<div class="card card-flush">' +
        (shown.length
          ? '<div class="rows">' + shown.map((e) => entryRow(e, { showType: filter === 'all' })).join('') + '</div>'
          : emptyState('Nothing here yet', 'Tap New and record your first entry for ' + company + '.')) +
      '</div>';

    return {
      html: html,
      mount: function (root) {
        Views.wireRows(root, app.refresh);
        root.addEventListener('click', (ev) => {
          const t = ev.target.closest('[data-type]');
          if (t) { app.typeFilter = t.dataset.type; app.refresh(); return; }
          if (ev.target.closest('[data-new]')) app.newEntryMenu();
        });
      },
    };
  };

  /* ── Trips (GPS) ───────────────────────────────────────────────── */
  Views.trips = function (app) {
    const active = window.Trip.active();
    const done = window.Trip.unlogged();
    const logged = window.Store.trips.filter((t) => t.entryId).sort((a, b) => b.startedAt - a.startedAt).slice(0, 10);

    const html =
      '<div class="section-head">' +
        '<div><h1>Drive recorder</h1><p>Record the kilometres while you drive, then turn the trip into a mileage claim.</p></div>' +
      '</div>' +

      (active ? tripBanner(active) :
        '<div class="card" style="display:flex;gap:14px;align-items:center;flex-wrap:wrap">' +
          '<div class="tile t-trip" style="width:46px;height:46px">' + I.route + '</div>' +
          '<div style="flex:1;min-width:160px">' +
            '<div style="font-weight:600">Not recording</div>' +
            '<div class="small muted">Start before you pull away — keep this screen open while driving.</div>' +
          '</div>' +
          '<button class="btn btn-primary" data-act="start-trip">' + I.play + '<span>Start driving</span></button>' +
        '</div>') +

      '<div class="card" style="margin-top:14px">' +
        '<div class="card-head"><div class="card-title">How it works</div></div>' +
        '<p class="small muted" style="margin:0;line-height:1.65">' +
          'The phone follows your position and adds up the real distance travelled. When you stop, the app looks up the ' +
          'nearest towns to where you started and finished and offers a mileage entry with the kilometres already filled in — ' +
          'you only add who you visited. Browsers stop receiving location when the app is in the background, so leave this ' +
          'screen open; the display is kept awake for you. Whatever it records can always be corrected by hand.' +
        '</p>' +
      '</div>' +

      '<div class="card card-flush" style="margin-top:14px">' +
        '<div class="list-head"><div class="card-title">Recorded, not yet claimed</div></div>' +
        (done.length
          ? '<div class="rows">' + done.map(tripRow).join('') + '</div>'
          : emptyState('No unclaimed drives', 'Trips you record show up here until you turn them into a mileage entry.')) +
      '</div>' +

      (logged.length ? '<div class="card card-flush" style="margin-top:14px">' +
        '<div class="list-head"><div class="card-title">Already claimed</div></div>' +
        '<div class="rows">' + logged.map(tripRow).join('') + '</div></div>' : '');

    return {
      html: html,
      mount: function (root) {
        root.addEventListener('click', async (ev) => {
          const act = ev.target.closest('[data-act]');
          const tripEl = ev.target.closest('[data-trip]');
          if (act && act.dataset.act === 'start-trip') {
            try {
              act.disabled = true;
              await window.Trip.start(app.company);
              U.toast('Recording — drive safely');
            } catch (e) {
              U.toast(e.message, 'err');
            } finally {
              act.disabled = false;
              app.refresh();
            }
            return;
          }
          if (act && act.dataset.act === 'stop-trip') { await app.stopTrip(); return; }
          if (act && act.dataset.act === 'claim' && tripEl) { app.claimTrip(tripEl.dataset.trip); return; }
          if (act && act.dataset.act === 'drop' && tripEl) {
            const ok = await C.confirm('Discard this recorded drive?', { danger: true, title: 'Discard drive' });
            if (!ok) return;
            await window.Store.deleteTrip(tripEl.dataset.trip);
            app.refresh();
          }
        });
      },
    };
  };

  function tripRow(t) {
    const where = (t.startPlace ? t.startPlace.name : 'Unknown') + ' → ' + (t.endPlace ? t.endPlace.name : 'Unknown');
    const when = U.dateLabel(U.isoDate(new Date(t.startedAt))) + ' · ' + U.timeLabel(t.startedAt) +
      (t.endedAt ? '–' + U.timeLabel(t.endedAt) + ' · ' + U.duration(t.endedAt - t.startedAt) : '');
    return '<div class="row" data-trip="' + U.attr(t.id) + '">' +
      '<div class="tile t-trip">' + I.route + '</div>' +
      '<div class="row-main">' +
        '<div class="row-title">' + U.esc(where) + '</div>' +
        '<div class="row-sub">' + U.esc(when) + '</div>' +
      '</div>' +
      '<div class="row-amt">' + U.esc(U.num2(t.km)) + ' km</div>' +
      '<div class="row-actions">' +
        (t.entryId ? '' :
          '<button class="btn btn-sm btn-primary" data-act="claim">' + I.plus + '<span class="desktop-only">Claim</span></button>' +
          '<button class="btn btn-icon btn-ghost btn-danger" data-act="drop">' + I.trash + '</button>') +
      '</div>' +
    '</div>';
  }

  /* ── Export ────────────────────────────────────────────────────── */
  Views.export = function (app) {
    const company = app.company;
    const months = U.lastMonths(18).slice().reverse();
    const sections = Views.sections(company);
    const state = app.exportState || (app.exportState = {
      scope: 'month',
      month: U.lastMonths(1)[0],
      from: U.lastMonths(1)[0] + '-01',
      to: U.today(),
      types: sections.map((s) => s.type),
      bothCompanies: false,
    });

    const html =
      '<div class="section-head">' +
        '<div><h1>Export</h1><p>Build the Excel workbook you hand to accounting.</p></div>' +
      '</div>' +

      '<div class="card">' +
        '<div class="form-grid">' +
          '<div class="field"><label>Period</label>' +
            '<select class="select" data-f="scope">' +
              C.options([['month', 'One month'], ['range', 'Date range'], ['year', 'This year'], ['all', 'Everything']], state.scope) +
            '</select></div>' +
          '<div class="field" data-when="month"><label>Month</label>' +
            '<select class="select" data-f="month">' +
              C.options(months.map((m) => [m, U.monthLabel(m)]), state.month) + '</select></div>' +
          '<div class="field" data-when="range" hidden><label>From</label>' +
            '<input class="input" type="date" data-f="from" value="' + U.attr(state.from) + '"></div>' +
          '<div class="field" data-when="range" hidden><label>To</label>' +
            '<input class="input" type="date" data-f="to" value="' + U.attr(state.to) + '"></div>' +
        '</div>' +

        '<div class="divider"></div>' +
        '<div class="card-title" style="margin-bottom:10px">What to include</div>' +
        '<div class="chips">' + sections.map((s) =>
          '<button type="button" class="chip' + (state.types.includes(s.type) ? ' is-active' : '') +
            '" data-type="' + U.attr(s.type) + '">' + s.icon + '<span>' + U.esc(s.label) + '</span></button>').join('') +
        '</div>' +

        '<div class="switch-row" style="margin-top:14px">' +
          '<div class="sw"><input type="checkbox" data-f="bothCompanies"' + (state.bothCompanies ? ' checked' : '') + '><i></i></div>' +
          '<div class="sw-text"><b>Both companies in one file</b>' +
            '<span>Otherwise only ' + U.esc(company) + ' is exported</span></div>' +
        '</div>' +

        '<div class="divider"></div>' +
        '<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">' +
          '<button class="btn btn-primary" data-act="xlsx">' + I.download + '<span>Export Excel</span></button>' +
          '<button class="btn" data-act="csv">' + I.download + '<span>Export CSV</span></button>' +
          '<div style="flex:1"></div>' +
          '<span class="small muted" data-preview></span>' +
        '</div>' +
      '</div>' +

      '<div class="card" style="margin-top:14px">' +
        '<div class="card-head"><div class="card-title">Backup</div></div>' +
        '<p class="small muted" style="margin:0 0 12px">Everything lives on this device. A backup file carries all entries, ' +
          'recorded drives and receipt photos, and can be restored here or on another device.</p>' +
        '<div style="display:flex;gap:10px;flex-wrap:wrap">' +
          '<button class="btn" data-act="backup">' + I.download + '<span>Save backup</span></button>' +
          '<label class="btn" for="restore-file">' + I.upload + '<span>Restore backup</span></label>' +
          '<input id="restore-file" type="file" accept="application/json,.json" hidden>' +
        '</div>' +
      '</div>';

    return {
      html: html,
      mount: function (root) {
        const preview = U.$('[data-preview]', root);

        function range() {
          if (state.scope === 'all') return { from: '0000-01-01', to: '9999-12-31' };
          if (state.scope === 'year') {
            const y = new Date().getFullYear();
            return { from: y + '-01-01', to: y + '-12-31' };
          }
          if (state.scope === 'month') return U.monthRange(state.month);
          return { from: state.from, to: state.to };
        }

        function selection() {
          const r = range();
          const companies = state.bothCompanies ? ['EPSON', 'ATMOCE'] : [company];
          return window.Store.entries.filter((e) =>
            companies.includes(e.company) &&
            state.types.includes(e.type) &&
            (e.date || '') >= r.from && (e.date || '') <= r.to)
            .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
        }

        function paint() {
          U.$$('[data-when]', root).forEach((el) => { el.hidden = el.dataset.when !== state.scope; });
          const rows = selection();
          preview.textContent = rows.length + (rows.length === 1 ? ' entry · ' : ' entries · ') +
            U.eur(U.sum(rows, (e) => e.total));
        }

        root.addEventListener('change', (ev) => {
          const f = ev.target.dataset.f;
          if (!f) return;
          state[f] = f === 'bothCompanies' ? ev.target.checked : ev.target.value;
          paint();
        });
        root.addEventListener('input', (ev) => {
          const f = ev.target.dataset.f;
          if (f === 'from' || f === 'to') { state[f] = ev.target.value; paint(); }
        });

        root.addEventListener('click', async (ev) => {
          const t = ev.target.closest('[data-type]');
          if (t) {
            const type = t.dataset.type;
            state.types = state.types.includes(type)
              ? state.types.filter((x) => x !== type)
              : state.types.concat([type]);
            t.classList.toggle('is-active');
            paint();
            return;
          }
          const act = ev.target.closest('[data-act]');
          if (!act) return;
          const rows = selection();
          if ((act.dataset.act === 'xlsx' || act.dataset.act === 'csv') && !rows.length) {
            return U.toast('Nothing to export for that period', 'err');
          }
          const meta = {
            company: state.bothCompanies ? 'ATMOCE + EPSON' : company,
            range: range(),
            label: state.scope === 'month' ? U.monthLabel(state.month)
              : state.scope === 'year' ? String(new Date().getFullYear())
              : state.scope === 'all' ? 'All time'
              : U.dateLabel(state.from) + ' – ' + U.dateLabel(state.to),
          };
          if (act.dataset.act === 'xlsx') {
            try {
              act.disabled = true;
              await window.Excel.workbook(rows, meta);
              U.toast('Excel file created');
            } catch (e) {
              console.error(e);
              U.toast(e.message || 'Export failed', 'err');
            } finally {
              act.disabled = false;
            }
          } else if (act.dataset.act === 'csv') {
            window.Excel.csv(rows, meta);
            U.toast('CSV file created');
          } else if (act.dataset.act === 'backup') {
            const data = await window.Store.exportJSON();
            window.Excel.download(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
              'expense-backup-' + U.today() + '.json');
            U.toast('Backup saved');
          }
        });

        const restore = U.$('#restore-file', root);
        restore.addEventListener('change', async () => {
          const f = restore.files && restore.files[0];
          if (!f) return;
          try {
            const data = JSON.parse(await f.text());
            const n = await window.Store.importJSON(data, 'merge');
            U.toast(n + ' entries restored');
            app.refresh();
          } catch (e) {
            U.toast(e.message || 'That file could not be read', 'err');
          }
          restore.value = '';
        });

        paint();
      },
    };
  };

  /* ── Settings ──────────────────────────────────────────────────── */
  Views.settings = function (app) {
    const s = window.Store.settings;
    const html =
      '<div class="section-head"><div><h1>Settings</h1><p>Defaults used across both companies.</p></div></div>' +

      '<div class="card">' +
        '<div class="form-grid">' +
          '<div class="field"><label>Name on every claim</label>' +
            '<input class="input" data-s="name" value="' + U.attr(s.name) + '"></div>' +
          '<div class="field"><label>Mileage rate</label>' +
            '<div class="input-group">' +
              '<input class="input input-money" data-s="ratePerKm" inputmode="decimal" value="' +
                U.attr(String(s.ratePerKm).replace('.', ',')) + '">' +
              '<span class="addon">€/km</span></div>' +
            '<div class="field-hint">EPSON pays 0,43 € per kilometre.</div></div>' +
          '<div class="field"><label>Home base</label>' +
            '<div class="suggest" data-place="home"><input class="input" autocomplete="off" placeholder="Town you start from"></div>' +
            '<div class="field-hint">Filled in as the starting point on new mileage.</div></div>' +
          '<div class="field"><label>Receipt language</label>' +
            '<select class="select" data-s="ocrLang">' +
              C.options([['eng', 'English (fastest)'], ['slv', 'Slovenian'], ['hrv', 'Croatian'],
                         ['eng+slv', 'English + Slovenian'], ['eng+hrv', 'English + Croatian']], s.ocrLang) +
            '</select>' +
            '<div class="field-hint">Used when reading amounts off a photographed receipt.</div></div>' +
        '</div>' +

        '<div class="divider"></div>' +
        '<div class="switch-row" style="margin-bottom:10px">' +
          '<div class="sw"><input type="checkbox" data-s="roundTripDefault"' + (s.roundTripDefault ? ' checked' : '') + '><i></i></div>' +
          '<div class="sw-text"><b>New mileage is a return journey</b><span>Most customer visits mean driving back</span></div>' +
        '</div>' +
        '<div class="switch-row">' +
          '<div class="sw"><input type="checkbox" data-s="autoRouteLookup"' + (s.autoRouteLookup ? ' checked' : '') + '><i></i></div>' +
          '<div class="sw-text"><b>Look distances up online</b>' +
            '<span>Real road distance from OpenStreetMap; off, it estimates from coordinates</span></div>' +
        '</div>' +
      '</div>' +

      '<div class="card" style="margin-top:14px">' +
        '<div class="card-head"><div class="card-title">Storage</div></div>' +
        '<div class="small muted" data-usage>Counting…</div>' +
        '<div class="divider"></div>' +
        '<button class="btn btn-danger" data-act="wipe">' + I.trash + '<span>Delete all data</span></button>' +
      '</div>' +

      '<div class="card" style="margin-top:14px">' +
        '<div class="card-head"><div class="card-title">About</div></div>' +
        '<p class="small muted" style="margin:0;line-height:1.7">' +
          'Expense Tracker for ' + U.esc(s.name) + ' — ATMOCE and EPSON.<br>' +
          'Distances from OpenStreetMap routing, place list from GeoNames, receipt reading by Tesseract, ' +
          'all bundled with the app. Nothing is uploaded anywhere: every entry and photo stays on this device ' +
          'until you export it.' +
        '</p>' +
      '</div>';

    return {
      html: html,
      mount: function (root) {
        C.attachPlace(U.$('[data-place=home]', root), {
          initial: s.homePlace,
          onPick: (p) => window.Store.saveSettings({ homePlace: p }),
        });

        root.addEventListener('change', async (ev) => {
          const k = ev.target.dataset.s;
          if (!k) return;
          let v = ev.target.type === 'checkbox' ? ev.target.checked : ev.target.value;
          if (k === 'ratePerKm') v = U.num(v);
          const patch = {};
          patch[k] = v;
          await window.Store.saveSettings(patch);
          if (k === 'ocrLang') window.OCR.dispose();
          U.toast('Saved');
          if (k === 'name') app.refresh();
        });

        root.addEventListener('click', async (ev) => {
          if (!ev.target.closest('[data-act=wipe]')) return;
          const ok = await C.confirm(
            'This deletes every entry, recorded drive and receipt photo on this device. Export a backup first if you might need them.',
            { danger: true, title: 'Delete all data', okLabel: 'Delete everything' });
          if (!ok) return;
          for (const e of window.Store.entries.slice()) await window.Store.deleteEntry(e.id);
          for (const t of window.Store.trips.slice()) await window.Store.deleteTrip(t.id);
          U.toast('All data deleted');
          app.refresh();
        });

        const usage = U.$('[data-usage]', root);
        (async function () {
          const n = window.Store.entries.length;
          let line = n + (n === 1 ? ' entry' : ' entries') + ', ' + window.Store.countReceipts() + ' receipt photos, ' +
            window.Store.trips.length + ' recorded drives.';
          if (navigator.storage && navigator.storage.estimate) {
            try {
              const est = await navigator.storage.estimate();
              if (est && est.usage) line += ' Using ' + (est.usage / 1048576).toFixed(1) + ' MB.';
            } catch (e) { /* not available everywhere */ }
          }
          if (window.Store.useFallback) line += ' (Running in fallback storage — receipts are not kept.)';
          usage.textContent = line;
        }());
      },
    };
  };

  window.Views = Views;
}());
