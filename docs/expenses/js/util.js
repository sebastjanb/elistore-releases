/* Small helpers shared by every module. Classic script — no ES modules, so the
   same files load from file://, from a web server and from Electron. */
(function () {
  'use strict';

  const U = {};

  U.$ = (sel, root) => (root || document).querySelector(sel);
  U.$$ = (sel, root) => Array.prototype.slice.call((root || document).querySelectorAll(sel));

  /* A real UUID, because the Mac and the phone parse every id with
     UUID(uuidString:) and silently skip the row when that fails — no error,
     no warning, just an entry that never arrives. The old short id was fine
     while this app only talked to itself. */
  U.uid = function () {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID().toUpperCase();
    // Older WebViews have getRandomValues but not randomUUID.
    const b = new Uint8Array(16);
    (window.crypto || {}).getRandomValues
      ? crypto.getRandomValues(b)
      : b.forEach((_, i) => { b[i] = Math.floor(Math.random() * 256); });
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('').toUpperCase();
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16)
      + '-' + h.slice(16, 20) + '-' + h.slice(20);
  };

  /* HTML escaping. Every piece of user text goes through this before it is
     dropped into a template string. */
  U.esc = function (s) {
    if (s === null || s === undefined) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  U.attr = function (s) { return U.esc(s); };

  /* ── Money ─────────────────────────────────────────────────────── */
  const eurFmt = new Intl.NumberFormat('sl-SI', {
    style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
  const numFmt = new Intl.NumberFormat('sl-SI', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  U.eur = (n) => eurFmt.format(U.num(n));
  U.num2 = (n) => numFmt.format(U.num(n));
  U.km = (n) => numFmt.format(U.num(n)) + ' km';

  U.num = function (v) {
    if (typeof v === 'number') return isFinite(v) ? v : 0;
    if (v === null || v === undefined || v === '') return 0;

    /* Separator resolution for a sl-SI/hr-HR app reading Slovenian and
       Croatian receipts, where 1.250,00 means one thousand two hundred fifty.

       The rules, in order:
         both separators  → whichever comes LAST is the decimal point
         one kind, twice+ → grouping ("1.234.567", "1,234,567")
         a lone dot before exactly three digits → grouping ("1.250" = 1250)
         a lone comma     → always the decimal point ("12,50" = 12.5)

       The old version replaced only the FIRST comma and never considered
       repeated separators, so "1.250" parsed as 1.25 and "1.234.567" as
       1.234 — a silent 1000x error on any amount written the local way.

       Trade-off, stated plainly: US-style "1,250" meaning one-thousand-
       two-fifty reads as 1.25 here. That case is genuinely unresolvable
       without knowing the writer's locale, and this app formats with
       Intl 'sl-SI' throughout, so it resolves toward the local convention. */
    let s = String(v).trim().replace(/[\s'’]/g, '').replace(/[^\d.,-]/g, '');
    if (!s) return 0;

    const commas = (s.match(/,/g) || []).length;
    const dots = (s.match(/\./g) || []).length;

    if (commas && dots) {
      const decimalIsComma = s.lastIndexOf(',') > s.lastIndexOf('.');
      s = s.replace(decimalIsComma ? /\./g : /,/g, '');
    } else if (commas > 1 || dots > 1) {
      s = s.replace(/[.,]/g, '');
    } else if (dots === 1 && s.length - s.lastIndexOf('.') - 1 === 3) {
      s = s.replace('.', '');
    }
    s = s.replace(',', '.');

    const n = parseFloat(s);
    return isFinite(n) ? n : 0;
  };

  U.round2 = (n) => Math.round((U.num(n) + Number.EPSILON) * 100) / 100;
  U.round1 = (n) => Math.round((U.num(n) + Number.EPSILON) * 10) / 10;

  /* ── Dates ─────────────────────────────────────────────────────── */
  U.today = function () {
    const d = new Date();
    return U.isoDate(d);
  };

  U.isoDate = function (d) {
    const p = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  };

  U.parseDate = function (iso) {
    if (!iso) return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    if (!m) return null;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  };

  /* 23. 08. 2026 — the way dates are written in SI and HR. */
  U.dateLabel = function (iso) {
    const d = U.parseDate(iso);
    if (!d) return '—';
    const p = (n) => String(n).padStart(2, '0');
    return p(d.getDate()) + '. ' + p(d.getMonth() + 1) + '. ' + d.getFullYear();
  };

  U.monthKey = (iso) => (iso || '').slice(0, 7);

  U.monthLabel = function (key) {
    const m = /^(\d{4})-(\d{2})$/.exec(key || '');
    if (!m) return key || '';
    const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return names[Number(m[2]) - 1] + ' ' + m[1];
  };

  U.monthRange = function (key) {
    const m = /^(\d{4})-(\d{2})$/.exec(key || '');
    if (!m) return null;
    const y = Number(m[1]), mo = Number(m[2]);
    const last = new Date(y, mo, 0).getDate();
    return { from: key + '-01', to: key + '-' + String(last).padStart(2, '0') };
  };

  /* The last `n` month keys ending with the current month. */
  U.lastMonths = function (n) {
    const out = [];
    const d = new Date();
    d.setDate(1);
    for (let i = n - 1; i >= 0; i--) {
      const x = new Date(d.getFullYear(), d.getMonth() - i, 1);
      out.push(x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0'));
    }
    return out;
  };

  U.timeLabel = function (ts) {
    const d = new Date(ts);
    const p = (n) => String(n).padStart(2, '0');
    return p(d.getHours()) + ':' + p(d.getMinutes());
  };

  U.duration = function (ms) {
    const min = Math.max(0, Math.round(ms / 60000));
    if (min < 60) return min + ' min';
    return Math.floor(min / 60) + ' h ' + String(min % 60).padStart(2, '0') + ' min';
  };

  /* ── Misc ──────────────────────────────────────────────────────── */
  U.debounce = function (fn, ms) {
    let t;
    return function () {
      const args = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(() => fn.apply(self, args), ms || 200);
    };
  };

  U.sum = (arr, pick) => arr.reduce((a, x) => a + U.num(pick ? pick(x) : x), 0);

  U.sortBy = function (arr, pick, dir) {
    const d = dir === 'asc' ? 1 : -1;
    return arr.slice().sort((a, b) => {
      const x = pick(a), y = pick(b);
      return x < y ? -d : x > y ? d : 0;
    });
  };

  U.groupBy = function (arr, pick) {
    const map = new Map();
    arr.forEach((x) => {
      const k = pick(x);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(x);
    });
    return map;
  };

  /* Toast notifications. */
  U.toast = function (msg, kind) {
    const root = document.getElementById('toast-root');
    if (!root) return;
    const el = document.createElement('div');
    el.className = 'toast ' + (kind || 'ok');
    el.innerHTML = (kind === 'err' ? window.ICONS.alert : window.ICONS.check) +
      '<span>' + U.esc(msg) + '</span>';
    root.appendChild(el);
    setTimeout(() => {
      el.style.transition = 'opacity .25s, transform .25s';
      el.style.opacity = '0';
      el.style.transform = 'translateY(8px)';
      setTimeout(() => el.remove(), 260);
    }, kind === 'err' ? 5200 : 2600);
  };

  U.isMobile = () => window.matchMedia('(max-width: 860px)').matches;
  U.isTouch = () => 'ontouchstart' in window || navigator.maxTouchPoints > 0;

  /* File → data URL, used for receipt thumbnails. */
  U.fileToDataURL = function (file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(r.error || new Error('Could not read the file'));
      r.readAsDataURL(file);
    });
  };

  /* Downscales a photo so receipts do not bloat the database, and gives OCR a
     sensibly sized image to work with. Returns { blob, dataUrl, width, height }. */
  U.shrinkImage = function (file, maxSide, quality) {
    maxSide = maxSide || 1600;
    return U.fileToDataURL(file).then((url) => new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = function () {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        c.toBlob((blob) => {
          resolve({
            blob: blob || file,
            dataUrl: c.toDataURL('image/jpeg', 0.62),
            width: w,
            height: h,
          });
        }, 'image/jpeg', quality || 0.82);
      };
      img.onerror = () => reject(new Error('That file is not an image'));
      img.src = url;
    }));
  };

  window.U = U;
}());
