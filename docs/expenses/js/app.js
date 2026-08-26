/* Shell: navigation, the company switch, and the glue between the views and
   the drive recorder. */
(function () {
  'use strict';

  const U = window.U;
  const I = window.ICONS;
  const C = window.C;

  const App = {
    company: 'EPSON',
    route: 'dashboard',
    monthFilter: 'all',
    typeFilter: 'all',
    exportState: null,
  };

  const viewEl = () => document.getElementById('view');

  /* ── Routing ───────────────────────────────────────────────────── */
  function routes() {
    const sections = window.Views.sections(App.company);
    const map = {
      dashboard: () => window.Views.dashboard(App),
      all: () => window.Views.all(App),
      export: () => window.Views.export(App),
      settings: () => window.Views.settings(App),
    };
    sections.forEach((s) => { map[s.id] = () => window.Views.list(App, s); });
    if (App.company === 'EPSON') map.trips = () => window.Views.trips(App);
    return map;
  }

  App.go = function (route) {
    if (!routes()[route]) route = 'dashboard';
    App.route = route;
    if (location.hash !== '#/' + route) location.hash = '#/' + route;
    else App.refresh();
  };

  App.refresh = function () {
    const map = routes();
    const build = map[App.route] || map.dashboard;
    const view = build();
    const root = viewEl();
    root.innerHTML = view.html;
    root.scrollTop = 0;
    if (view.mount) view.mount(root);
    renderSidebar();
    renderTopbar();
    renderTabbar();
  };

  /* ── Sidebar ───────────────────────────────────────────────────── */
  function navButton(id, label, icon, count) {
    return '<button class="nav-item' + (App.route === id ? ' is-active' : '') + '" data-route="' + U.attr(id) + '">' +
      icon + '<span>' + U.esc(label) + '</span>' +
      (count ? '<span class="nav-count">' + count + '</span>' : '') + '</button>';
  }

  function renderSidebar() {
    const sections = window.Views.sections(App.company);
    const all = window.Store.byCompany(App.company);
    const el = document.getElementById('sidebar');
    el.innerHTML =
      '<div class="brand">' +
        '<div class="brand-mark">' + I.receipt + '</div>' +
        '<div><div class="brand-name">Expenses</div>' +
          '<div class="brand-sub">' + U.esc(window.Store.settings.name) + '</div></div>' +
      '</div>' +

      '<div class="nav-label">Overview</div>' +
      navButton('dashboard', 'Dashboard', I.dashboard) +
      navButton('all', 'All entries', I.grid, all.length) +

      '<div class="nav-label">' + U.esc(App.company) + ' expenses</div>' +
      sections.map((s) => navButton(s.id, s.label, s.icon,
        all.filter((e) => e.type === s.type).length)).join('') +

      (App.company === 'EPSON'
        ? '<div class="nav-label">On the road</div>' + navButton('trips', 'Drive recorder', I.route,
            window.Trip.unlogged().length)
        : '') +

      '<div class="nav-label">Data</div>' +
      navButton('export', 'Export', I.download) +
      navButton('settings', 'Settings', I.settings) +

      '<div class="sidebar-foot">' +
        '<button class="btn btn-primary" style="width:100%" data-new>' + I.plus + '<span>New entry</span></button>' +
      '</div>';
  }

  /* ── Top bar ───────────────────────────────────────────────────── */
  function renderTopbar() {
    const label = App.route === 'dashboard' ? 'Dashboard'
      : App.route === 'all' ? 'All entries'
      : App.route === 'trips' ? 'Drive recorder'
      : App.route === 'export' ? 'Export'
      : App.route === 'settings' ? 'Settings'
      : (window.Views.sections(App.company).find((s) => s.id === App.route) || {}).label || '';

    document.getElementById('topbar').innerHTML =
      '<div class="company-switch">' +
        ['EPSON', 'ATMOCE'].map((c) =>
          '<button data-company="' + c + '"' + (App.company === c ? ' class="is-active"' : '') + '>' +
            c + '</button>').join('') +
      '</div>' +
      '<div class="crumb">' + I.building + '<span>' + U.esc(App.company) + '</span>' +
        '<span class="crumb-sep">/</span><span>' + U.esc(label) + '</span></div>' +
      '<div class="topbar-spacer"></div>' +
      (navigator.onLine ? '' : '<div class="chip" title="Distances will be estimated until you are back online">' +
        I.alert + '<span>Offline</span></div>') +
      '<button class="btn btn-icon btn-ghost mobile-only" data-route="settings" aria-label="Settings">' + I.settings + '</button>' +
      '<button class="btn btn-primary mobile-only" data-new aria-label="New entry">' + I.plus + '</button>';
  }

  /* ── Bottom tab bar (phones) ───────────────────────────────────── */
  function renderTabbar() {
    const tabs = [
      { id: 'dashboard', label: 'Home', icon: I.dashboard },
      { id: 'all', label: 'Entries', icon: I.grid },
    ];
    if (App.company === 'EPSON') tabs.push({ id: 'trips', label: 'Drive', icon: I.route });
    else tabs.push({ id: 'meetings', label: 'Meetings', icon: I.users });
    tabs.push({ id: 'travel', label: 'Travel', icon: I.plane });
    tabs.push({ id: 'export', label: 'Export', icon: I.download });

    document.getElementById('tabbar').innerHTML = tabs.map((t) =>
      '<button class="tab' + (App.route === t.id ? ' is-active' : '') + '" data-route="' + U.attr(t.id) + '">' +
        t.icon + '<span>' + U.esc(t.label) + '</span></button>').join('');
  }

  /* ── New entry menu ────────────────────────────────────────────── */
  App.newEntryMenu = function () {
    const sections = window.Views.sections(App.company);
    const body = document.createElement('div');
    body.innerHTML = '<div class="rows">' + sections.map((s) =>
      '<button class="row" data-type="' + U.attr(s.type) + '">' +
        '<div class="tile t-' + s.type + '">' + s.icon + '</div>' +
        '<div class="row-main"><div class="row-title">' + U.esc(s.label) + '</div>' +
          '<div class="row-sub">' + U.esc(describe(s.type)) + '</div></div>' +
        '<div class="muted">' + I.chevron + '</div>' +
      '</button>').join('') +
      (App.company === 'EPSON' ? '<button class="row" data-type="trip">' +
        '<div class="tile t-trip">' + I.play + '</div>' +
        '<div class="row-main"><div class="row-title">Start recording a drive</div>' +
          '<div class="row-sub">Let the phone count the kilometres for you</div></div>' +
        '<div class="muted">' + I.chevron + '</div></button>' : '') +
      '</div>';

    const m = C.modal({ title: 'What are you adding?', sub: App.company, body: body, footer: null, width: '520px' });
    body.addEventListener('click', async (ev) => {
      const row = ev.target.closest('[data-type]');
      if (!row) return;
      m.close();
      if (row.dataset.type === 'trip') {
        App.go('trips');
        try {
          await window.Trip.start(App.company);
          U.toast('Recording — drive safely');
          App.refresh();
        } catch (e) {
          U.toast(e.message, 'err');
        }
        return;
      }
      window.Views.openForm(row.dataset.type, null, App.company, App.refresh);
    });
  };

  function describe(type) {
    return {
      mileage: 'Route, kilometres and who you visited',
      other: 'Phone bill, car wash, fuel and the rest',
      meeting: 'Who was there, where, and what it cost',
      travel: 'Flights, hotels, taxis, eSIM and more',
    }[type] || '';
  }

  /* ── Drive recorder glue ───────────────────────────────────────── */
  App.stopTrip = async function () {
    const trip = await window.Trip.stop();
    App.refresh();
    if (!trip) return;
    if (trip.km < 0.5) {
      const keep = await C.confirm('Only ' + U.num2(trip.km) + ' km was recorded. Discard this drive?',
        { danger: true, title: 'Very short drive', okLabel: 'Discard', cancelLabel: 'Keep it' });
      if (keep) {
        await window.Store.deleteTrip(trip.id);
        App.refresh();
        return;
      }
    }
    App.claimTrip(trip.id);
  };

  App.claimTrip = function (tripId) {
    const trip = window.Store.trips.find((t) => t.id === tripId);
    if (!trip) return;
    window.Forms.mileage(null, trip.company || App.company, {
      date: U.isoDate(new Date(trip.startedAt)),
      from: trip.startPlace,
      to: trip.endPlace,
      km: trip.km,
      kmSource: 'gps',
      roundTrip: false,
      tripId: trip.id,
    }, App.refresh);
  };

  /* Keep the live banner ticking without re-rendering the whole screen. */
  function wireTripUpdates() {
    window.Trip.onChange((trip) => {
      const km = document.querySelector('[data-trip-km]');
      if (trip && km) {
        km.textContent = U.num2(trip.km) + ' km';
        const sub = document.querySelector('[data-trip-sub]');
        if (sub && window.Trip.lastError) sub.textContent = window.Trip.lastError;
      } else if ((trip && !km) || (!trip && km)) {
        App.refresh();
      }
    });
  }

  /* The shell is sized from a measured height rather than a CSS viewport unit.
     A home-screen web app on iOS resolves percentage and viewport heights
     against a box that leaves out the notch and the home indicator, which left
     the tab bar floating some 90 points above the bottom of the screen.
     window.innerHeight is the one number that is always the real thing. */
  function trackViewportHeight() {
    const apply = () => {
      document.documentElement.style.setProperty('--app-h', window.innerHeight + 'px');
    };
    apply();
    window.addEventListener('resize', apply);
    window.addEventListener('orientationchange', () => setTimeout(apply, 120));
    // Returning from the background can land before iOS has settled the layout.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') setTimeout(apply, 60);
    });
  }

  /* ── Global wiring ─────────────────────────────────────────────── */
  function wireShell() {
    document.body.addEventListener('click', async (ev) => {
      const route = ev.target.closest('[data-route]');
      if (route && !ev.target.closest('.modal')) return App.go(route.dataset.route);

      const comp = ev.target.closest('[data-company]');
      if (comp) {
        App.company = comp.dataset.company;
        App.monthFilter = 'all';
        App.typeFilter = 'all';
        App.exportState = null;
        await window.Store.saveSettings({ company: App.company });
        if (!routes()[App.route]) App.route = 'dashboard';
        App.go(App.route);
        return;
      }

      if (ev.target.closest('[data-new]') && !ev.target.closest('.modal')) App.newEntryMenu();

      const act = ev.target.closest('[data-act=stop-trip]');
      if (act && !ev.target.closest('.modal')) App.stopTrip();
    });

    window.addEventListener('hashchange', () => {
      const r = (location.hash || '').replace(/^#\/?/, '') || 'dashboard';
      App.route = routes()[r] ? r : 'dashboard';
      App.refresh();
    });

    window.addEventListener('online', renderTopbar);
    window.addEventListener('offline', renderTopbar);

    // Cmd/Ctrl+N for a new entry on the desktop.
    document.addEventListener('keydown', (ev) => {
      if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === 'n' && !document.querySelector('.modal-back')) {
        ev.preventDefault();
        App.newEntryMenu();
      }
    });
  }

  /* ── Boot ──────────────────────────────────────────────────────── */
  (async function boot() {
    await window.Store.init();
    await window.Dist.init();

    // The desktop build hides the macOS title bar, so the sidebar has to leave
    // room for the traffic lights.
    if (window.desktop) {
      document.body.classList.add('is-desktop', 'platform-' + window.desktop.platform);
    }

    App.company = window.Store.settings.company || 'EPSON';
    const initial = (location.hash || '').replace(/^#\/?/, '');
    App.route = initial || 'dashboard';

    trackViewportHeight();
    wireShell();
    wireTripUpdates();
    App.refresh();

    try {
      await window.Trip.resume();
    } catch (e) {
      console.warn('could not resume trip', e);
    }

    // Service workers only exist over http(s) — never over file://.
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
      navigator.serviceWorker.register('sw.js').catch((e) => console.warn('sw', e));
    }

    // Ask the browser to keep the data even under storage pressure.
    if (navigator.storage && navigator.storage.persist) {
      navigator.storage.persisted().then((p) => { if (!p) navigator.storage.persist(); }).catch(() => {});
    }

    window.App = App;
  }());
}());
