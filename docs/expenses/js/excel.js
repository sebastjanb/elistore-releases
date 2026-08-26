/* Excel export.

   One workbook per claim period: a summary sheet plus one sheet per expense
   kind, with the travel and meeting cost lines broken out so every receipt has
   its own row. Amounts are real numbers with a euro format and dates are real
   Excel dates, so accounting can sort, filter and total them. */
(function () {
  'use strict';

  const U = window.U;
  const Excel = {};

  const HEADER_FILL = '2E1065';
  const TITLE_FILL = '4C1D95';
  const MONEY_FMT = '#,##0.00\\ "€"';
  const KM_FMT = '#,##0.0\\ "km"';
  const DATE_FMT = 'dd\\.mm\\.yyyy';

  /* Excel keeps dates as days since 1899-12-30. */
  function serial(iso) {
    const d = U.parseDate(iso);
    if (!d) return null;
    return Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(1899, 11, 30)) / 86400000);
  }

  const txt = (v) => ({ v: v === null || v === undefined ? '' : String(v), t: 's' });
  const money = (v) => ({ v: U.round2(v), t: 'n', z: MONEY_FMT });
  const km = (v) => ({ v: U.round1(v), t: 'n', z: KM_FMT });
  const rate = (v) => ({ v: U.round2(v), t: 'n', z: '0.00' });
  const date = (iso) => {
    const s = serial(iso);
    return s === null ? txt(iso || '') : { v: s, t: 'n', z: DATE_FMT };
  };

  const HEAD_STYLE = {
    font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 10 },
    fill: { patternType: 'solid', fgColor: { rgb: HEADER_FILL } },
    alignment: { vertical: 'center', horizontal: 'left', wrapText: true },
    border: {
      bottom: { style: 'thin', color: { rgb: '7C3AED' } },
    },
  };
  const TOTAL_STYLE = {
    font: { bold: true, sz: 11 },
    border: { top: { style: 'medium', color: { rgb: '7C3AED' } } },
  };

  /* Builds a worksheet from a header list and an array of cell rows. */
  function sheet(headers, rows, widths, opts) {
    opts = opts || {};
    const XLSX = window.XLSX;
    const aoa = [headers.map((h) => h)].concat(rows);
    const ws = XLSX.utils.aoa_to_sheet(aoa.map((r) => r.map((c) => (c && c.t ? c.v : c))));

    // Re-apply the typed cells (aoa_to_sheet flattens our formats away).
    aoa.forEach((row, r) => {
      row.forEach((cell, c) => {
        const addr = XLSX.utils.encode_cell({ r: r, c: c });
        if (cell && cell.t) {
          ws[addr] = Object.assign({}, cell);
        }
        if (r === 0) {
          ws[addr] = ws[addr] || { v: '', t: 's' };
          ws[addr].s = HEAD_STYLE;
        } else if (opts.totalRow && r === aoa.length - 1) {
          if (ws[addr]) ws[addr].s = Object.assign({}, ws[addr].s, TOTAL_STYLE);
        }
      });
    });

    ws['!cols'] = (widths || headers.map(() => 16)).map((w) => ({ wch: w }));
    ws['!rows'] = [{ hpt: 24 }];
    ws['!autofilter'] = {
      ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(0, aoa.length - 1), c: headers.length - 1 } }),
    };
    return ws;
  }

  const attendeeText = (list) =>
    (list || []).map((a) => a.name + (a.role ? ' (' + a.role + ')' : '')).join(', ');

  const receiptFlag = (id) => (id ? 'yes' : '');

  /* ── Sheet builders ────────────────────────────────────────────── */
  function mileageSheet(rows) {
    const head = ['Date', 'From', 'Via', 'To', 'Return', 'Kilometres', 'Rate €/km', 'Amount',
      'Company visited', 'Contact', 'Purpose', 'Distance from', 'Note', 'Company', 'Claimed by'];
    const body = rows.map((e) => [
      date(e.date),
      txt(e.from ? e.from.name : ''),
      txt((e.via || []).map((v) => v.name).join(', ')),
      txt(e.to ? e.to.name : ''),
      txt(e.roundTrip ? 'yes' : ''),
      km(e.km),
      rate(e.rate),
      money(e.total),
      txt(e.visited), txt(e.contact), txt(e.purpose),
      txt(e.kmManual !== null && e.kmManual !== undefined ? 'entered by hand'
        : e.kmSource === 'osrm' ? 'road routing' : e.kmSource === 'gps' ? 'GPS recording' : 'estimate'),
      txt(e.note), txt(e.company), txt(e.person),
    ]);
    body.push(['', '', '', '', txt('TOTAL'), km(U.sum(rows, (e) => e.km)), '', money(U.sum(rows, (e) => e.total)),
      '', '', '', '', '', '', '']);
    return sheet(head, body, [12, 18, 18, 18, 8, 12, 10, 13, 24, 20, 24, 15, 28, 10, 18], { totalRow: true });
  }

  function otherSheet(rows) {
    const head = ['Date', 'Category', 'Supplier', 'Description', 'Amount', 'Receipt', 'Note', 'Company', 'Claimed by'];
    const body = rows.map((e) => [
      date(e.date),
      txt(window.Forms.kindLabel(e.category)),
      txt(e.vendor), txt(e.description),
      money(e.total), txt(receiptFlag(e.receiptId)),
      txt(e.note), txt(e.company), txt(e.person),
    ]);
    body.push(['', '', '', txt('TOTAL'), money(U.sum(rows, (e) => e.total)), '', '', '', '']);
    return sheet(head, body, [12, 20, 24, 34, 13, 9, 28, 10, 18], { totalRow: true });
  }

  function meetingSheet(rows) {
    const head = ['Date', 'Location', 'Venue', 'Company met', 'People present', 'Purpose',
      'Amount', 'Note', 'Company', 'Claimed by'];
    const body = rows.map((e) => [
      date(e.date), txt(e.location), txt(e.venue), txt(e.client),
      txt(attendeeText(e.attendees)), txt(e.description),
      money(e.total), txt(e.note), txt(e.company), txt(e.person),
    ]);
    body.push(['', '', '', '', '', txt('TOTAL'), money(U.sum(rows, (e) => e.total)), '', '', '']);
    return sheet(head, body, [12, 18, 22, 24, 42, 28, 13, 26, 10, 18], { totalRow: true });
  }

  function meetingItemsSheet(rows) {
    const head = ['Date', 'Company met', 'Type', 'Description', 'Currency', 'Amount',
      'Rate to €', 'Amount €', 'Receipt', 'Company'];
    const body = [];
    rows.forEach((e) => {
      (e.items || []).forEach((it) => body.push([
        date(e.date), txt(e.client), txt(window.Forms.kindLabel(it.kind)), txt(it.description),
        txt(it.currency || 'EUR'), { v: U.round2(it.amount), t: 'n', z: '#,##0.00' },
        rate(it.rate || 1), money(it.amountEur), txt(receiptFlag(it.receiptId)), txt(e.company),
      ]));
    });
    body.push(['', '', '', '', '', '', txt('TOTAL'), money(U.sum(body, (r) => (r[7] ? r[7].v : 0))), '', '']);
    return sheet(head, body, [12, 24, 20, 34, 10, 13, 10, 13, 9, 10], { totalRow: true });
  }

  function travelSheet(rows) {
    const head = ['From', 'To', 'Country', 'EU', 'City', 'Company visited', 'Purpose',
      'Total', 'Note', 'Company', 'Claimed by'];
    const body = rows.map((e) => [
      date(e.date), date(e.dateTo || e.date), txt(e.countryName || e.country),
      txt(e.eu ? 'EU' : 'non-EU'), txt(e.city), txt(e.client), txt(e.purpose),
      money(e.total), txt(e.note), txt(e.company), txt(e.person),
    ]);
    body.push(['', '', '', '', '', '', txt('TOTAL'), money(U.sum(rows, (e) => e.total)), '', '', '']);
    return sheet(head, body, [12, 12, 20, 8, 18, 24, 26, 13, 26, 10, 18], { totalRow: true });
  }

  function travelItemsSheet(rows) {
    const head = ['Date', 'Country', 'City', 'Type', 'Description', 'Currency', 'Amount',
      'Rate to €', 'Amount €', 'Receipt', 'Company'];
    const body = [];
    rows.forEach((e) => {
      (e.items || []).forEach((it) => body.push([
        date(e.date), txt(e.countryName || e.country), txt(e.city),
        txt(window.Forms.kindLabel(it.kind)), txt(it.description),
        txt(it.currency || 'EUR'), { v: U.round2(it.amount), t: 'n', z: '#,##0.00' },
        rate(it.rate || 1), money(it.amountEur), txt(receiptFlag(it.receiptId)), txt(e.company),
      ]));
    });
    body.push(['', '', '', '', '', '', '', txt('TOTAL'), money(U.sum(body, (r) => (r[8] ? r[8].v : 0))), '', '']);
    return sheet(head, body, [12, 20, 18, 20, 34, 10, 13, 10, 13, 9, 10], { totalRow: true });
  }

  function summarySheet(rows, meta) {
    const XLSX = window.XLSX;
    const types = ['mileage', 'other', 'meeting', 'travel'];
    const labels = { mileage: 'Mileage', other: 'Other expenses', meeting: 'Meetings / entertainment', travel: 'Travel' };
    const aoa = [
      [{ v: 'EXPENSE CLAIM', t: 's' }, '', '', ''],
      [txt('Claimed by'), txt(window.Store.settings.name), '', ''],
      [txt('Company'), txt(meta.company), '', ''],
      [txt('Period'), txt(meta.label), '', ''],
      [txt('Prepared'), date(U.today()), '', ''],
      ['', '', '', ''],
      [txt('Category'), txt('Entries'), txt('Kilometres'), txt('Amount')],
    ];
    types.forEach((t) => {
      const sub = rows.filter((e) => e.type === t);
      if (!sub.length) return;
      aoa.push([
        txt(labels[t]),
        { v: sub.length, t: 'n' },
        t === 'mileage' ? km(U.sum(sub, (e) => e.km)) : txt(''),
        money(U.sum(sub, (e) => e.total)),
      ]);
    });
    aoa.push([txt('TOTAL'), { v: rows.length, t: 'n' }, '', money(U.sum(rows, (e) => e.total))]);

    const ws = XLSX.utils.aoa_to_sheet(aoa.map((r) => r.map((c) => (c && c.t ? c.v : c))));
    aoa.forEach((row, r) => {
      row.forEach((cell, c) => {
        const addr = XLSX.utils.encode_cell({ r: r, c: c });
        if (cell && cell.t) ws[addr] = Object.assign({}, cell);
        if (!ws[addr]) return;
        if (r === 0) {
          ws[addr].s = {
            font: { bold: true, sz: 15, color: { rgb: 'FFFFFF' } },
            fill: { patternType: 'solid', fgColor: { rgb: TITLE_FILL } },
            alignment: { vertical: 'center' },
          };
        } else if (r === 6) {
          ws[addr].s = HEAD_STYLE;
        } else if (r === aoa.length - 1) {
          ws[addr].s = TOTAL_STYLE;
        } else if (c === 0 && r < 5) {
          ws[addr].s = { font: { bold: true, color: { rgb: '6D28D9' } } };
        }
      });
    });
    ws['!cols'] = [{ wch: 28 }, { wch: 12 }, { wch: 16 }, { wch: 16 }];
    ws['!rows'] = [{ hpt: 30 }];
    ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 3 } }];
    return ws;
  }

  /* ── Public API ────────────────────────────────────────────────── */
  Excel.loadLibrary = function () {
    if (window.XLSX) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = new URL('vendor/xlsx.min.js', document.baseURI).href;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('Could not load the spreadsheet library'));
      document.head.appendChild(s);
    });
  };

  Excel.workbook = async function (rows, meta) {
    await Excel.loadLibrary();
    const XLSX = window.XLSX;
    const wb = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(wb, summarySheet(rows, meta), 'Summary');

    const mileage = rows.filter((e) => e.type === 'mileage');
    const other = rows.filter((e) => e.type === 'other');
    const meetings = rows.filter((e) => e.type === 'meeting');
    const travel = rows.filter((e) => e.type === 'travel');

    if (mileage.length) XLSX.utils.book_append_sheet(wb, mileageSheet(mileage), 'Mileage');
    if (other.length) XLSX.utils.book_append_sheet(wb, otherSheet(other), 'Other expenses');
    if (meetings.length) {
      XLSX.utils.book_append_sheet(wb, meetingSheet(meetings), 'Meetings');
      XLSX.utils.book_append_sheet(wb, meetingItemsSheet(meetings), 'Meeting costs');
    }
    if (travel.length) {
      XLSX.utils.book_append_sheet(wb, travelSheet(travel), 'Travel');
      XLSX.utils.book_append_sheet(wb, travelItemsSheet(travel), 'Travel costs');
    }

    const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    Excel.download(new Blob([out], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }), Excel.filename(meta, 'xlsx'));
  };

  Excel.csv = function (rows, meta) {
    const head = ['Date', 'Company', 'Type', 'Description', 'Detail', 'Kilometres', 'Amount EUR', 'Claimed by'];
    const lines = [head.join(';')];
    const q = (v) => '"' + String(v === null || v === undefined ? '' : v).replace(/"/g, '""') + '"';
    rows.forEach((e) => {
      let desc = '', detail = '';
      if (e.type === 'mileage') {
        desc = (e.from ? e.from.name : '') + ' -> ' + (e.to ? e.to.name : '') + (e.roundTrip ? ' (return)' : '');
        detail = [e.visited, e.purpose, e.contact].filter(Boolean).join(' | ');
      } else if (e.type === 'other') {
        desc = window.Forms.kindLabel(e.category);
        detail = [e.vendor, e.description].filter(Boolean).join(' | ');
      } else if (e.type === 'meeting') {
        desc = [e.client, e.venue].filter(Boolean).join(' - ');
        detail = [e.location, attendeeText(e.attendees), e.description].filter(Boolean).join(' | ');
      } else if (e.type === 'travel') {
        desc = [e.countryName || e.country, e.city].filter(Boolean).join(' - ');
        detail = [e.client, e.purpose, (e.items || []).map((i) =>
          window.Forms.kindLabel(i.kind) + ' ' + U.num2(i.amountEur)).join(', ')].filter(Boolean).join(' | ');
      }
      lines.push([
        U.dateLabel(e.date), e.company, window.Views.typeLabel[e.type], desc, detail,
        e.type === 'mileage' ? U.num2(e.km) : '', U.num2(e.total), e.person || window.Store.settings.name,
      ].map(q).join(';'));
    });
    // BOM so Excel opens it as UTF-8.
    Excel.download(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }),
      Excel.filename(meta, 'csv'));
  };

  Excel.filename = function (meta, ext) {
    const safe = (s) => String(s).replace(/[^\wÀ-ſ -]/g, '').replace(/\s+/g, '-');
    return 'Expenses_' + safe(meta.company) + '_' + safe(meta.label) + '.' + ext;
  };

  Excel.download = function (blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 4000);
  };

  window.Excel = Excel;
}());
