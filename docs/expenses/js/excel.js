/* Excel export.

   One workbook per claim period: a summary sheet plus one sheet per expense
   kind, with the travel and meeting cost lines broken out so every receipt has
   its own row. Amounts are real numbers with a euro format and dates are real
   Excel dates, so accounting can sort, filter and total them. */
(function () {
  'use strict';

  const U = window.U;
  const Excel = {};

  /* Accent per company, as in the Mac app: EPSON claims come out in Epson
     blue (Pantone 286 C), everything else in the house violet. */
  const ACCENTS = {
    violet: { header: '2E1065', title: '4C1D95', rule: '7C3AED', label: '6D28D9' },
    epson: { header: '0033A0', title: '002678', rule: '2563EB', label: '1D4ED8' },
  };
  let ACCENT = ACCENTS.violet;
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

  const headStyle = () => ({
    font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 10 },
    fill: { patternType: 'solid', fgColor: { rgb: ACCENT.header } },
    alignment: { vertical: 'center', horizontal: 'left', wrapText: true },
    border: { bottom: { style: 'thin', color: { rgb: ACCENT.rule } } },
  });
  const totalStyle = () => ({
    font: { bold: true, sz: 11 },
    border: { top: { style: 'medium', color: { rgb: ACCENT.rule } } },
  });

  /* What a workbook shows depends on who it is for, exactly as in the Mac app:
     EPSON's forms do not ask for receipt copies, and the company only needs
     naming when both are in the same file. */
  function layoutFor(meta) {
    const label = (meta && meta.company) || '';
    const both = label.indexOf('+') !== -1;
    return {
      both: both,
      hidesReceipts: !both && label === 'EPSON',
      namesTheCompany: both,
    };
  }

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
          ws[addr].s = headStyle();
        } else if (opts.totalRow && r === aoa.length - 1) {
          if (ws[addr]) ws[addr].s = Object.assign({}, ws[addr].s, totalStyle());
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

  /* "Ljubljana – Zagreb – Ljubljana" when the car came home again, which is
     what the removed From / Via / To / Return columns used to say less
     plainly. Matches the Mac app's Journey column. */
  function journey(e) {
    const nameOf = (p) => {
      if (!p) return '';
      return p.address ? p.name + ', ' + p.address : (p.name || '');
    };
    const legs = [nameOf(e.from)]
      .concat((e.via || []).map(nameOf))
      .concat([nameOf(e.to)]);
    if (e.roundTrip && nameOf(e.from)) legs.push(nameOf(e.from));
    return legs.filter(Boolean).join(' – ');
  }

  function mileageSheet(rows, L) {
    const head = ['Date', 'Journey', 'Kilometres', 'Rate €/km', 'Amount',
      'Company visited', 'Purpose'];
    const widths = [12, 46, 13, 11, 14, 26, 28];
    if (L.namesTheCompany) { head.push('Claimed for'); widths.push(13); }

    const body = rows.map((e) => {
      const row = [
        date(e.date), txt(journey(e)), km(e.km), rate(e.rate), money(e.total),
        txt(e.visited), txt(e.purpose),
      ];
      if (L.namesTheCompany) row.push(txt(e.company));
      return row;
    });

    const total = ['', txt('TOTAL'), km(U.sum(rows, (e) => e.km)), '',
      money(U.sum(rows, (e) => e.total)), '', ''];
    if (L.namesTheCompany) total.push('');
    body.push(total);
    return sheet(head, body, widths, { totalRow: true });
  }

  function otherSheet(rows, L, N) {
    N = N || {};
    const head = ['Date', 'Category', 'Description', 'Amount'];
    const widths = [12, 22, 38, 14];
    if (!L.hidesReceipts) { head.push('Receipt'); widths.push(46); }
    if (L.namesTheCompany) { head.push('Claimed for'); widths.push(13); }

    const body = rows.map((e) => {
      const row = [date(e.date), txt(window.Forms.kindLabel(e.category)),
        txt(e.description), money(e.total)];
      if (!L.hidesReceipts) row.push(txt(N[e.id] || receiptFlag(e.receiptId)));
      if (L.namesTheCompany) row.push(txt(e.company));
      return row;
    });

    const total = new Array(head.length).fill('');
    const amountAt = head.indexOf('Amount');
    total[amountAt - 1] = txt('TOTAL');
    total[amountAt] = money(U.sum(rows, (e) => e.total));
    body.push(total);
    return sheet(head, body, widths, { totalRow: true });
  }

  /* Meetings and their costs on one sheet: a row per cost line carrying the
     meeting it belongs to. Two sheets meant cross-referencing by date to
     answer "what was this dinner for". */
  function meetingSheet(rows, L, N) {
    N = N || {};
    const head = ['Date', 'Location', 'Company', 'What it was about', 'Type',
      'Currency', 'Amount', 'Rate to €', 'Amount €'];
    const widths = [12, 20, 26, 30, 20, 10, 14, 11, 14];
    if (!L.hidesReceipts) { head.push('Receipt'); widths.push(46); }
    if (L.namesTheCompany) { head.push('Claimed for'); widths.push(13); }

    const body = [];
    let sum = 0;
    rows.forEach((e) => {
      (e.items || []).forEach((it) => {
        sum += it.amountEur || 0;
        const row = [
          date(e.date), txt(e.location), txt(e.client), txt(e.description),
          txt(window.Forms.kindLabel(it.kind)), txt(it.currency || 'EUR'),
          { v: U.round2(it.amount), t: 'n', z: '#,##0.00' },
          rate(it.rate || 1), money(it.amountEur),
        ];
        if (!L.hidesReceipts) row.push(txt(N[it.id] || receiptFlag(it.receiptId)));
        if (L.namesTheCompany) row.push(txt(e.company));
        body.push(row);
      });
    });

    const total = new Array(head.length).fill('');
    const euroAt = head.indexOf('Amount €');
    total[euroAt - 1] = txt('TOTAL');
    total[euroAt] = money(sum);
    body.push(total);
    return sheet(head, body, widths, { totalRow: true });
  }

  function travelSheet(rows, L, N) {
    N = N || {};
    const head = ['Date', 'Country', 'City', 'Purpose', 'Type', 'Description',
      'Currency', 'Amount', 'Rate to €', 'Amount €'];
    const widths = [12, 20, 20, 28, 20, 32, 10, 14, 11, 14];
    if (!L.hidesReceipts) { head.push('Receipt'); widths.push(46); }
    if (L.namesTheCompany) { head.push('Claimed for'); widths.push(13); }

    const body = [];
    let sum = 0;
    rows.forEach((e) => {
      (e.items || []).forEach((it) => {
        sum += it.amountEur || 0;
        const row = [
          date(e.date), txt(e.countryName || e.country), txt(e.city), txt(e.purpose),
          txt(window.Forms.kindLabel(it.kind)), txt(it.description),
          txt(it.currency || 'EUR'),
          { v: U.round2(it.amount), t: 'n', z: '#,##0.00' },
          rate(it.rate || 1), money(it.amountEur),
        ];
        if (!L.hidesReceipts) row.push(txt(N[it.id] || receiptFlag(it.receiptId)));
        if (L.namesTheCompany) row.push(txt(e.company));
        body.push(row);
      });
    });

    const total = new Array(head.length).fill('');
    const euroAt = head.indexOf('Amount €');
    total[euroAt - 1] = txt('TOTAL');
    total[euroAt] = money(sum);
    body.push(total);
    return sheet(head, body, widths, { totalRow: true });
  }

  function summarySheet(rows, meta) {
    const XLSX = window.XLSX;
    const types = ['mileage', 'other', 'meeting', 'travel'];
    const labels = { mileage: 'Mileage', other: 'Other expenses', meeting: 'Meetings / entertainment', travel: 'Travel' };
    const aoa = [
      [{ v: 'EXPENSE CLAIM', t: 's' }, '', '', ''],
      [txt('Prepared by'), txt(window.Store.settings.name), '', ''],
      [txt('Company'), txt(meta.company), '', ''],
      [txt('Period'), txt(meta.label), '', ''],
      [txt('Prepared on'), date(U.today()), '', ''],
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
            fill: { patternType: 'solid', fgColor: { rgb: ACCENT.title } },
            alignment: { vertical: 'center' },
          };
        } else if (r === 6) {
          ws[addr].s = headStyle();
        } else if (r === aoa.length - 1) {
          ws[addr].s = totalStyle();
        } else if (c === 0 && r < 5) {
          ws[addr].s = { font: { bold: true, color: { rgb: ACCENT.label } } };
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

  /* The bytes, without delivering them — so the same workbook can go into a
     zip beside the receipt scans instead of straight to the browser. */
  Excel.workbookBytes = async function (rows, meta, receiptNames) {
    await Excel.loadLibrary();
    const XLSX = window.XLSX;
    const N = receiptNames || {};
    const wb = XLSX.utils.book_new();
    const L = layoutFor(meta);
    ACCENT = L.hidesReceipts ? ACCENTS.epson : ACCENTS.violet;

    XLSX.utils.book_append_sheet(wb, summarySheet(rows, meta), 'Summary');

    const mileage = rows.filter((e) => e.type === 'mileage');
    const other = rows.filter((e) => e.type === 'other');
    const meetings = rows.filter((e) => e.type === 'meeting');
    const travel = rows.filter((e) => e.type === 'travel');

    if (mileage.length) XLSX.utils.book_append_sheet(wb, mileageSheet(mileage, L), 'Mileage');
    if (other.length) XLSX.utils.book_append_sheet(wb, otherSheet(other, L, N), 'Other expenses');
    if (meetings.length) XLSX.utils.book_append_sheet(wb, meetingSheet(meetings, L, N), 'Meetings');
    if (travel.length) XLSX.utils.book_append_sheet(wb, travelSheet(travel, L, N), 'Travel');

    return new Uint8Array(XLSX.write(wb, { bookType: 'xlsx', type: 'array' }));
  };

  Excel.workbook = async function (rows, meta) {
    const bytes = await Excel.workbookBytes(rows, meta);
    Excel.download(new Blob([bytes], {
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
    // Same rule as the Mac app's ExportService.filename, so a claim exported
    // from the car and one exported from the Mac land under the same name:
    // strip, then collapse whatever gaps the strip left rather than turning
    // each one into its own dash.
    const safe = (s) => String(s)
      .replace(/[^\wÀ-ſ -]/g, '')
      .replace(/[ -]+/g, '-')
      .replace(/^-+|-+$/g, '');
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
