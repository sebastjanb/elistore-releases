/* Exporting the scanned receipts as separate files.

   Accounting wants the photographs, not a column saying "yes". This collects
   every scan in a selection, names each one so it can be matched to a row
   without guessing, and packs them beside the workbook in a zip.

   The naming mirrors the Mac app's ExportService exactly — same segments, same
   order, same folding — so a claim exported from the car and one exported from
   the Mac produce the same archive. */
(function () {
  'use strict';

  const Receipts = {};
  const U = window.U;

  /* Folds anything into a name every filesystem accepts.

     A whitelist, not a blacklist: "/" would silently create folders inside the
     archive, ":" breaks Finder, and \ * ? " < > | are illegal on NTFS. Accented
     letters are transliterated rather than kept, because a zip of forty files
     gets opened on Windows, where a decomposed "c" + caron does not survive. */
  function slug(raw, limit) {
    limit = limit || 40;
    let text = String(raw == null ? '' : raw)
      .replace(/đ/g, 'd').replace(/Đ/g, 'D')
      .normalize('NFD').replace(/[̀-ͯ]/g, '');
    let out = '';
    let lastWasDash = false;
    for (const ch of text) {
      if (/[A-Za-z0-9]/.test(ch)) { out += ch; lastWasDash = false; }
      else if (!lastWasDash) { out += '-'; lastWasDash = true; }
    }
    out = out.replace(/^-+/, '').replace(/-+$/, '');
    if (out.length > limit) {
      out = out.slice(0, limit);
      const dash = out.lastIndexOf('-');
      if (dash > limit / 2) out = out.slice(0, dash);
      out = out.replace(/-+$/, '');
    }
    return out;
  }

  /* The extension has to be sniffed. A phone can hand over HEIC, and a .jpg
     that is really HEIC opens on a Mac and fails on half of Windows. */
  function extensionFor(bytes) {
    if (bytes.length < 12) return 'jpg';
    if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) return 'jpg';
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) return 'png';
    if (bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
      const brand = String.fromCharCode(bytes[8], bytes[9], bytes[10]);
      if (brand === 'hei' || brand === 'mif' || brand === 'msf') return 'heic';
    }
    if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) return 'webp';
    return 'jpg';
  }

  const money = (v) => (Math.round((Number(v) || 0) * 100) / 100).toFixed(2);
  const six = (id) => String(id || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 6).toUpperCase() || 'XXXXXX';

  async function bytesOf(receipt) {
    if (!receipt) return null;
    /* The blob is the real photograph, but it is not always there: the
       localStorage fallback never keeps one, and receipts that arrived in a
       backup or a sync from the Mac carry only the thumbnail. A smaller
       picture of the invoice still beats no picture. */
    if (receipt.blob) {
      return new Uint8Array(await receipt.blob.arrayBuffer());
    }
    if (receipt.thumb) {
      const comma = receipt.thumb.indexOf(',');
      if (comma < 0) return null;
      const binary = atob(receipt.thumb.slice(comma + 1));
      const out = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
      return out;
    }
    return null;
  }

  /* Every scan in the selection, named and ready to write. */
  Receipts.collect = async function (rows) {
    const files = [];
    const used = new Set();

    function claim(stem, ext) {
      let candidate = stem + '.' + ext;
      let n = 2;
      // Keyed on the lowercased name: macOS and Windows both fold case, so two
      // names differing only in case become one file on extract — silently.
      while (used.has(candidate.toLowerCase())) {
        candidate = stem + '-' + n + '.' + ext;
        n++;
      }
      used.add(candidate.toLowerCase());
      return candidate;
    }

    for (const entry of rows) {
      const day = entry.date;                       // already ISO
      let sequence = 0;

      async function push(receiptId, what, amount, currency, amountEur, ownerId) {
        const receipt = await window.Store.getReceipt(receiptId);
        const bytes = await bytesOf(receipt);
        if (!bytes || !bytes.length) return;
        const label = slug(what) || 'Receipt';
        const stem = day + '_' + String(sequence).padStart(2, '0') + '_' + label
          + '_' + money(amount) + currency + '_' + six(ownerId);
        files.push({
          name: claim(stem, extensionFor(bytes)),
          bytes: bytes,
          key: ownerId,
          date: entry.date,
          kind: entry.type,
          company: entry.company || '',
          detail: what,
          amount: Number(amount) || 0,
          currency: currency,
          amountEur: Number(amountEur) || 0,
        });
        sequence++;
      }

      if (entry.receiptId) {
        const what = entry.description || window.Forms.kindLabel(entry.category) || 'Receipt';
        await push(entry.receiptId, what, entry.total, 'EUR', entry.total, entry.id);
      }
      for (const item of entry.items || []) {
        if (!item.receiptId) continue;
        const what = item.description
          || window.Forms.kindLabel(item.kind)
          || entry.client || entry.city || 'Receipt';
        await push(item.receiptId, what, item.amount, item.currency || 'EUR',
                   item.amountEur, item.id);
      }
    }
    return files;
  };

  /* A manifest, so the archive still explains itself once it has been
     forwarded away from the workbook — which is what happens to attachments.
     It is also the only mapping an EPSON claim gets, since those sheets carry
     no receipt column at all. */
  function manifest(files) {
    const quote = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const lines = ['File;Date;Type;Company;Description;Amount;Currency;Amount EUR'];
    for (const f of files) {
      lines.push([f.name, U.dateLabel(f.date), f.kind, f.company, f.detail,
        U.num2(f.amount), f.currency, U.num2(f.amountEur)].map(quote).join(';'));
    }
    return '﻿' + lines.join('\r\n');
  }

  /* The workbook, the scans and the manifest in one archive. */
  Receipts.archive = async function (rows, meta) {
    const files = await Receipts.collect(rows);
    if (!files.length) return null;

    const names = {};
    for (const f of files) names[f.key] = f.name;

    const bytes = await window.Excel.workbookBytes(rows, meta, names);
    const zip = new window.Zip();
    zip.add(window.Excel.filename(meta, 'xlsx'), bytes);
    zip.add('Receipts-index.csv', new TextEncoder().encode(manifest(files)));
    for (const f of files) zip.add('receipts/' + f.name, f.bytes);
    return { blob: zip.build(), count: files.length };
  };

  Receipts.count = async function (rows) {
    return (await Receipts.collect(rows)).length;
  };

  window.Receipts = Receipts;
}());
