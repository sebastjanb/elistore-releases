/* Inline 24x24 stroke icons. Kept as strings so any template can drop one in. */
(function () {
  'use strict';
  const w = (d, extra) =>
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d +
    (extra || '') + '</svg>';

  window.ICONS = {
    dashboard: w('<rect x="3" y="3" width="7" height="9" rx="2"/><rect x="14" y="3" width="7" height="5" rx="2"/><rect x="14" y="12" width="7" height="9" rx="2"/><rect x="3" y="16" width="7" height="5" rx="2"/>'),
    car: w('<path d="M5 17h14M6.5 17v1.5a1 1 0 0 1-1 1H4.5a1 1 0 0 1-1-1V17M20.5 17v1.5a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1V17"/><path d="M3.5 17v-4.2a2 2 0 0 1 .17-.8l1.9-4.3A2 2 0 0 1 7.4 6.5h9.2a2 2 0 0 1 1.83 1.2l1.9 4.3c.11.25.17.52.17.8V17z"/><path d="M6 13.5h2M16 13.5h2"/>'),
    receipt: w('<path d="M6 2.5h12a1 1 0 0 1 1 1V21l-2.5-1.5L14 21l-2-1.5L10 21l-2.5-1.5L5 21V3.5a1 1 0 0 1 1-1z"/><path d="M9 7.5h6M9 11h6M9 14.5h3.5"/>'),
    users: w('<path d="M16 20v-1.5a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4V20"/><circle cx="9" cy="7" r="3.2"/><path d="M22 20v-1.5a4 4 0 0 0-3-3.87"/><path d="M16.5 4.1a3.2 3.2 0 0 1 0 6.2"/>'),
    plane: w('<path d="M10.2 12.6 3 10.4V8.6l2 .5 1.6 1 3-.8-3.4-5.2 2.1-.6 5.4 4.6 4.4-1.2c1-.3 2 .3 2.3 1.3.3 1-.3 2-1.3 2.3l-4.4 1.2-1.2 6.9-2 .8-.6-6.2-3 .8-.6 1.8-1.9.5z"/>'),
    route: w('<circle cx="6" cy="19" r="2.4"/><circle cx="18" cy="5" r="2.4"/><path d="M8.4 19h6.1a3.5 3.5 0 0 0 0-7h-5a3.5 3.5 0 0 1 0-7h6.1"/>'),
    download: w('<path d="M12 3.5v11.5"/><path d="M7.5 10.5 12 15l4.5-4.5"/><path d="M4 17v2.5a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V17"/>'),
    settings: w('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .32 1.77l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.6 1.6 0 0 0-1.77-.32 1.6 1.6 0 0 0-1 1.47V21a2 2 0 1 1-4 0v-.11a1.6 1.6 0 0 0-1.05-1.46 1.6 1.6 0 0 0-1.77.32l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.6 1.6 0 0 0 4.8 15a1.6 1.6 0 0 0-1.47-1H3a2 2 0 1 1 0-4h.11A1.6 1.6 0 0 0 4.6 8.94a1.6 1.6 0 0 0-.33-1.77l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.6 1.6 0 0 0 1.77.33H9a1.6 1.6 0 0 0 1-1.47V3a2 2 0 1 1 4 0v.11a1.6 1.6 0 0 0 1 1.47 1.6 1.6 0 0 0 1.77-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.6 1.6 0 0 0-.33 1.77V9a1.6 1.6 0 0 0 1.47 1H21a2 2 0 1 1 0 4h-.11a1.6 1.6 0 0 0-1.47 1z"/>'),
    plus: w('<path d="M12 5v14M5 12h14"/>'),
    trash: w('<path d="M3.5 6h17M9 6V4.5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1V6"/><path d="M5.5 6.5 6.4 19a1.6 1.6 0 0 0 1.6 1.5h8a1.6 1.6 0 0 0 1.6-1.5l.9-12.5"/><path d="M10 10.5v6M14 10.5v6"/>'),
    edit: w('<path d="M12 20h8"/><path d="M16.5 3.9a1.9 1.9 0 0 1 2.7 2.7L7.8 18H5v-2.8z"/>'),
    camera: w('<path d="M3 8.8A1.8 1.8 0 0 1 4.8 7h2.1l1.3-2.2a1 1 0 0 1 .86-.5h5.9a1 1 0 0 1 .86.5L17.1 7h2.1A1.8 1.8 0 0 1 21 8.8v9.4a1.8 1.8 0 0 1-1.8 1.8H4.8A1.8 1.8 0 0 1 3 18.2z"/><circle cx="12" cy="13" r="3.6"/>'),
    check: w('<path d="M20 6.5 9.4 17.1 4 11.7"/>'),
    alert: w('<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.4h.01"/>'),
    x: w('<path d="M18 6 6 18M6 6l12 12"/>'),
    chevron: w('<path d="M9 5.5 15.5 12 9 18.5"/>'),
    phone: w('<rect x="6" y="2.5" width="12" height="19" rx="2.6"/><path d="M10.5 18.5h3"/>'),
    wash: w('<path d="M12 3.2s5.2 5.7 5.2 9.1A5.2 5.2 0 0 1 12 17.5a5.2 5.2 0 0 1-5.2-5.2C6.8 8.9 12 3.2 12 3.2z"/><path d="M6 20.5h12"/>'),
    search: w('<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-3.6-3.6"/>'),
    calendar: w('<rect x="3.2" y="5" width="17.6" height="16" rx="2.4"/><path d="M3.2 10h17.6M8 3v4M16 3v4"/>'),
    pin: w('<path d="M20 10.5c0 5.4-8 12-8 12s-8-6.6-8-12a8 8 0 1 1 16 0z"/><circle cx="12" cy="10.3" r="2.9"/>'),
    arrowRight: w('<path d="M4.5 12h15M13.5 6l6 6-6 6"/>'),
    building: w('<path d="M4 21V5.6a1.6 1.6 0 0 1 1.2-1.55l7-1.75A1.6 1.6 0 0 1 14.2 3.85V21"/><path d="M14.2 9.5h4.2A1.6 1.6 0 0 1 20 11.1V21"/><path d="M2.5 21h19M7.5 8h3M7.5 12h3M7.5 16h3"/>'),
    play: w('<path d="M7 4.8 19 12 7 19.2z"/>'),
    stop: w('<rect x="6" y="6" width="12" height="12" rx="2.4"/>'),
    euro: w('<path d="M18 6.5A6.6 6.6 0 0 0 13.6 5C10 5 7.4 8 7.4 12s2.6 7 6.2 7A6.6 6.6 0 0 0 18 17.5"/><path d="M4.5 10.4h8M4.5 13.9h8"/>'),
    clock: w('<circle cx="12" cy="12" r="8.8"/><path d="M12 7v5.3l3.4 2"/>'),
    bed: w('<path d="M3 19v-9M3 13.5h18V19M21 19v-3"/><path d="M6.5 10.5h4a2 2 0 0 1 2 2v1H6.5z"/>'),
    taxi: w('<path d="M4.5 16.5h15M5 16.5v1.6a1 1 0 0 1-1 1H3.6"/><path d="M3.8 16.5v-3.9a2 2 0 0 1 .16-.78l1.6-3.6A2 2 0 0 1 7.4 7h9.2a2 2 0 0 1 1.84 1.22l1.6 3.6a2 2 0 0 1 .16.79v3.89z"/><path d="M9.2 7V4.6h5.6V7"/>'),
    sim: w('<path d="M12 3.5a8.5 8.5 0 0 1 8.5 8.5"/><path d="M12 8a4 4 0 0 1 4 4"/><path d="M12 12.6a.4.4 0 1 0 .01 0"/><path d="M4.2 20.5a12 12 0 0 1 3.3-8.3"/>'),
    filter: w('<path d="M3.5 5.5h17l-6.6 7.6V20l-3.8-2.2v-5z"/>'),
    train: w('<rect x="5" y="3.5" width="14" height="12.5" rx="3"/><path d="M5 10.5h14M8.5 20 6 16.5M15.5 20l2.5-3.5"/><path d="M9 13.2h.01M15 13.2h.01"/>'),
    fuel: w('<path d="M4.5 20.5V5.2A1.7 1.7 0 0 1 6.2 3.5h5.6a1.7 1.7 0 0 1 1.7 1.7v15.3"/><path d="M3.2 20.5h11.6M6.8 9.5h4.4"/><path d="M13.5 8.5h2.6a1.9 1.9 0 0 1 1.9 1.9v5.1a1.6 1.6 0 0 0 3.2 0V9.2l-2.4-2.4"/>'),
    parking: w('<rect x="3.5" y="3.5" width="17" height="17" rx="4"/><path d="M9.5 17V7.5h3.2a2.9 2.9 0 0 1 0 5.8H9.5"/>'),
    food: w('<path d="M5 3v7.2a2.4 2.4 0 0 0 2.4 2.4h.2A2.4 2.4 0 0 0 10 10.2V3"/><path d="M7.5 12.6V21M5 3v4.5M10 3v4.5"/><path d="M16.5 3c-1.6 1.4-2.2 3.2-2.2 5.2 0 1.7.7 3 2.2 3.4V21"/>'),
    dots: w('<circle cx="5.5" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="18.5" cy="12" r="1.4" fill="currentColor" stroke="none"/>'),
    copy: w('<rect x="8.5" y="8.5" width="12" height="12" rx="2.4"/><path d="M15.5 5.5H6a2.4 2.4 0 0 0-2.4 2.4v9.6"/>'),
    inbox: w('<path d="M3.5 13.5h4l1.4 2.6h6.2l1.4-2.6h4"/><path d="M6.4 4.5h11.2a2 2 0 0 1 1.85 1.25l2.05 5.05a2 2 0 0 1 .15.75v6.95a2 2 0 0 1-2 2h-15a2 2 0 0 1-2-2V11.5a2 2 0 0 1 .15-.75l2.05-5.05A2 2 0 0 1 6.4 4.5z"/>'),
    upload: w('<path d="M12 16V4.5"/><path d="M7.5 9 12 4.5 16.5 9"/><path d="M4 17v2.5a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V17"/>'),
    sparkle: w('<path d="M12 3.2 13.9 9l5.9 1.9-5.9 1.9L12 18.6 10.1 12.8 4.2 10.9 10.1 9z"/><path d="M18.5 3.5v3M20 5h-3"/>'),
    grid: w('<rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2"/><rect x="13.5" y="13.5" width="7" height="7" rx="2"/>'),
    swap: w('<path d="M7.5 4.5 4 8l3.5 3.5"/><path d="M4 8h13a3 3 0 0 1 3 3v.5"/><path d="M16.5 19.5 20 16l-3.5-3.5"/><path d="M20 16H7a3 3 0 0 1-3-3v-.5"/>'),
  };
}());
