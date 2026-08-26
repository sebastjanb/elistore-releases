/* Receipt OCR.

   Tesseract and its language data are bundled in web/vendor, so this works with
   no network once the app is installed. The engine is loaded lazily — the first
   scan pays for it, later scans are fast. Whatever is recognised is only ever a
   suggestion: every field it fills stays editable. */
(function () {
  'use strict';

  const U = window.U;
  const OCR = { worker: null, loading: null, lang: null };

  const base = () => new URL('vendor/tesseract/', document.baseURI).href;

  OCR.available = function () {
    return typeof window.Tesseract !== 'undefined' || true; // script is loaded on demand
  };

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (window.Tesseract) return resolve();
      const s = document.createElement('script');
      s.src = src;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('Could not load the OCR engine'));
      document.head.appendChild(s);
    });
  }

  OCR.warm = function (onProgress) {
    const lang = (window.Store.settings && window.Store.settings.ocrLang) || 'eng';
    if (OCR.worker && OCR.lang === lang) return Promise.resolve(OCR.worker);
    if (OCR.loading && OCR.lang === lang) return OCR.loading;

    OCR.lang = lang;
    OCR.loading = (async function () {
      await loadScript(base() + 'tesseract.min.js');
      if (OCR.worker) { try { await OCR.worker.terminate(); } catch (e) { /* ignore */ } OCR.worker = null; }
      const worker = await window.Tesseract.createWorker(lang, 1, {
        workerPath: base() + 'worker.min.js',
        corePath: base() + 'core',
        langPath: base() + 'lang',
        gzip: true,
        logger: (m) => {
          if (onProgress && m && typeof m.progress === 'number') onProgress(m.progress, m.status);
        },
      });
      OCR.worker = worker;
      return worker;
    }());
    OCR.loading.catch(() => { OCR.loading = null; });
    return OCR.loading;
  };

  /* Grayscale + contrast stretch. Phone photos of thermal receipts are low
     contrast and Tesseract does noticeably better after this. */
  function preprocess(dataUrl) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = function () {
        const c = document.createElement('canvas');
        c.width = img.width; c.height = img.height;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0);
        try {
          const d = ctx.getImageData(0, 0, c.width, c.height);
          const px = d.data;
          let min = 255, max = 0;
          for (let i = 0; i < px.length; i += 4) {
            const g = (px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114) | 0;
            px[i] = px[i + 1] = px[i + 2] = g;
            if (g < min) min = g;
            if (g > max) max = g;
          }
          const span = Math.max(1, max - min);
          if (span < 235) {
            for (let i = 0; i < px.length; i += 4) {
              const v = Math.max(0, Math.min(255, ((px[i] - min) * 255) / span));
              px[i] = px[i + 1] = px[i + 2] = v;
            }
          }
          ctx.putImageData(d, 0, 0);
        } catch (e) { /* tainted canvas cannot happen here, but never block OCR */ }
        resolve(c.toDataURL('image/png'));
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
  }

  /* Runs OCR and returns { text, amount, date, vendor, confidence }. */
  OCR.scan = async function (dataUrl, onProgress) {
    const worker = await OCR.warm(onProgress);
    const prepared = await preprocess(dataUrl);
    const res = await worker.recognize(prepared);
    const text = (res && res.data && res.data.text) || '';
    const parsed = OCR.parse(text);
    parsed.text = text;
    parsed.confidence = (res && res.data && res.data.confidence) || 0;
    return parsed;
  };

  /* ── Text -> fields ────────────────────────────────────────────── */

  // Words that sit next to the grand total on Slovenian, Croatian, German,
  // Italian and English receipts.
  const TOTAL_WORDS = /(za\s*pla(c|ć|č)ilo|skupaj|skupno|ukupno|sveukupno|za\s*naplatu|iznos|total|totale|gesamt|summe|zu\s*zahlen|amount\s*due|grand\s*total|to\s*pay|suma)/i;
  const AVOID_WORDS = /(ddv|pdv|vat|mwst|osnova|davek|porez|osnovica|popust|rabat|sconto|tax|change|vra(c|ć|č)eno|povratek|gotovina\s*prejeto)/i;

  // 12,34 / 1.234,56 / 1,234.56 / 12.34 — with an optional currency marker.
  const MONEY = /(?:€|eur|kn|hrk)?\s*(\d{1,3}(?:[ .]\d{3})*(?:[.,]\d{2})|\d+[.,]\d{2}|\d+)\s*(?:€|eur|kn|hrk)?/gi;

  function numbersIn(line) {
    const out = [];
    let m;
    MONEY.lastIndex = 0;
    while ((m = MONEY.exec(line)) !== null) {
      const raw = m[1];
      if (!/[.,]\d{2}$/.test(raw) && !/€|eur/i.test(m[0])) continue; // needs cents or a currency mark
      const v = U.num(raw);
      if (v > 0 && v < 1000000) out.push(v);
    }
    return out;
  }

  OCR.parse = function (text) {
    const lines = String(text || '')
      .split(/\r?\n/)
      .map((l) => l.replace(/\s+/g, ' ').trim())
      .filter(Boolean);

    /* Amount: prefer a line that names the total. */
    let amount = 0, amountFrom = '';
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!TOTAL_WORDS.test(line) || AVOID_WORDS.test(line)) continue;
      let nums = numbersIn(line);
      if (!nums.length && lines[i + 1]) nums = numbersIn(lines[i + 1]);
      if (nums.length) {
        const v = nums[nums.length - 1];
        if (v > amount) { amount = v; amountFrom = line; }
      }
    }

    /* Otherwise: the largest properly formatted amount on the receipt. */
    if (!amount) {
      let best = 0, bestLine = '';
      lines.forEach((line) => {
        if (AVOID_WORDS.test(line)) return;
        numbersIn(line).forEach((v) => {
          if (v > best && /[.,]\d{2}/.test(line)) { best = v; bestLine = line; }
        });
      });
      amount = best;
      amountFrom = bestLine;
    }

    /* Date: dd.mm.yyyy, dd/mm/yy, yyyy-mm-dd. */
    let date = '';
    const dmy = /(\b[0-3]?\d)[.\/-]\s?([01]?\d)[.\/-]\s?((?:19|20)?\d{2})\b/;
    const ymd = /\b((?:19|20)\d{2})-([01]\d)-([0-3]\d)\b/;
    for (const line of lines) {
      const a = ymd.exec(line);
      if (a) { date = a[1] + '-' + a[2] + '-' + a[3]; break; }
      const b = dmy.exec(line);
      if (b) {
        let y = b[3];
        if (y.length === 2) y = (Number(y) > 70 ? '19' : '20') + y;
        const d = Number(b[1]), mo = Number(b[2]);
        if (d >= 1 && d <= 31 && mo >= 1 && mo <= 12) {
          date = y + '-' + String(mo).padStart(2, '0') + '-' + String(d).padStart(2, '0');
          break;
        }
      }
    }

    /* Vendor: the first line near the top that reads like a name. */
    let vendor = '';
    for (const line of lines.slice(0, 6)) {
      const letters = (line.match(/[A-Za-zČĆŠŽĐčćšžđ]/g) || []).length;
      if (letters >= 4 && letters / line.length > 0.55 && !/racun|račun|invoice|blagajn/i.test(line)) {
        vendor = line.replace(/[^\wÀ-ž .,&'-]/g, '').trim().slice(0, 60);
        break;
      }
    }

    return { amount: U.round2(amount), date: date, vendor: vendor, amountFrom: amountFrom };
  };

  OCR.dispose = async function () {
    if (OCR.worker) { try { await OCR.worker.terminate(); } catch (e) { /* ignore */ } }
    OCR.worker = null;
    OCR.loading = null;
  };

  window.OCR = OCR;
}());
