/* Reusable pieces of interface: modal sheet, confirm, gauge, bar chart, the
   place autocomplete and the receipt/OCR field. */
(function () {
  'use strict';

  const U = window.U;
  const I = window.ICONS;
  const C = {};

  /* ── Modal ─────────────────────────────────────────────────────── */
  C.modal = function (opts) {
    const root = document.getElementById('modal-root');
    const back = document.createElement('div');
    back.className = 'modal-back';
    back.innerHTML =
      '<div class="modal" role="dialog" aria-modal="true">' +
        '<div class="modal-head">' +
          '<div>' +
            '<h2>' + U.esc(opts.title || '') + '</h2>' +
            (opts.sub ? '<div class="sub">' + U.esc(opts.sub) + '</div>' : '') +
          '</div>' +
          '<button class="btn btn-icon btn-ghost x" type="button" aria-label="Close">' + I.x + '</button>' +
        '</div>' +
        '<div class="modal-body"></div>' +
        (opts.footer === null ? '' : '<div class="modal-foot"></div>') +
      '</div>';

    const box = back.querySelector('.modal');
    const body = back.querySelector('.modal-body');
    const foot = back.querySelector('.modal-foot');
    if (opts.width) box.style.width = 'min(' + opts.width + ', 100%)';

    if (typeof opts.body === 'string') body.innerHTML = opts.body;
    else if (opts.body) body.appendChild(opts.body);
    if (foot && opts.footer) {
      if (typeof opts.footer === 'string') foot.innerHTML = opts.footer;
      else foot.appendChild(opts.footer);
    }

    function close(result) {
      document.removeEventListener('keydown', onKey);
      back.remove();
      if (opts.onClose) opts.onClose(result);
    }
    function onKey(e) {
      if (e.key === 'Escape') { e.stopPropagation(); close(null); }
    }

    back.querySelector('.x').addEventListener('click', () => close(null));
    back.addEventListener('mousedown', (e) => { if (e.target === back) close(null); });
    document.addEventListener('keydown', onKey);
    root.appendChild(back);

    const api = { root: back, box: box, body: body, foot: foot, close: close };
    if (opts.onMount) opts.onMount(api);
    // Focus the first real field, but not on touch — the keyboard popping up
    // over a sheet is worse than one extra tap.
    if (!U.isTouch()) {
      const f = body.querySelector('input, select, textarea');
      if (f) setTimeout(() => f.focus(), 40);
    }
    return api;
  };

  C.confirm = function (message, opts) {
    opts = opts || {};
    return new Promise((resolve) => {
      let done = false;
      const m = C.modal({
        title: opts.title || 'Are you sure?',
        width: '460px',
        body: '<p style="margin:0;color:var(--text-dim);line-height:1.55">' + U.esc(message) + '</p>',
        footer: '<div class="spacer"></div>' +
          '<button class="btn" data-act="no">' + U.esc(opts.cancelLabel || 'Cancel') + '</button>' +
          '<button class="btn ' + (opts.danger ? 'btn-danger' : 'btn-primary') + '" data-act="yes">' +
          U.esc(opts.okLabel || 'Delete') + '</button>',
        onClose: () => { if (!done) resolve(false); },
      });
      m.foot.addEventListener('click', (e) => {
        const b = e.target.closest('[data-act]');
        if (!b) return;
        done = true;
        m.close();
        resolve(b.dataset.act === 'yes');
      });
    });
  };

  /* ── Gauge ─────────────────────────────────────────────────────── */
  /* Half-circle meter: hatched track, gradient progress, value in the middle. */
  C.gauge = function (value, max, caption) {
    const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
    const R = 78, CX = 100, CY = 100;
    const len = Math.PI * R;
    const id = 'g' + Math.random().toString(36).slice(2, 8);
    const ang = Math.PI * (1 - pct);
    const knobX = CX + R * Math.cos(ang);
    const knobY = CY - R * Math.sin(ang);
    const arc = 'M ' + (CX - R) + ' ' + CY + ' A ' + R + ' ' + R + ' 0 0 1 ' + (CX + R) + ' ' + CY;

    return '' +
      '<div class="gauge-wrap"><div class="gauge">' +
        '<svg viewBox="0 0 200 118">' +
          '<defs>' +
            '<linearGradient id="' + id + '" x1="0" y1="1" x2="1" y2="0">' +
              '<stop offset="0%" stop-color="#f59e0b"/>' +
              '<stop offset="55%" stop-color="#f472b6"/>' +
              '<stop offset="100%" stop-color="#e879f9"/>' +
            '</linearGradient>' +
            '<pattern id="h' + id + '" width="7" height="7" patternTransform="rotate(-45)" patternUnits="userSpaceOnUse">' +
              '<rect width="7" height="7" fill="rgba(255,255,255,.03)"/>' +
              '<line x1="0" y1="0" x2="0" y2="7" stroke="rgba(255,255,255,.13)" stroke-width="3"/>' +
            '</pattern>' +
          '</defs>' +
          '<path d="' + arc + '" fill="none" stroke="url(#h' + id + ')" stroke-width="21" stroke-linecap="round"/>' +
          (pct > 0
            ? '<path d="' + arc + '" fill="none" stroke="url(#' + id + ')" stroke-width="21" stroke-linecap="round" ' +
              'stroke-dasharray="' + (len * pct) + ' ' + (len * 2) + '"/>'
            : '') +
          (pct > 0.02 ? '<circle cx="' + knobX.toFixed(1) + '" cy="' + knobY.toFixed(1) +
            '" r="5.5" fill="#fff" stroke="rgba(0,0,0,.35)" stroke-width="1"/>' : '') +
        '</svg>' +
        '<div class="gauge-value">' +
          '<div class="gauge-num">' + U.esc(U.num2(value)) + '</div>' +
          '<div class="gauge-cap">' + U.esc(caption || 'EUR') + '</div>' +
        '</div>' +
      '</div></div>';
  };

  /* ── Bar chart ─────────────────────────────────────────────────── */
  C.bars = function (series, opts) {
    opts = opts || {};
    const max = Math.max.apply(null, series.map((s) => s.value).concat([1]));
    const peak = series.reduce((best, s, i) => (s.value > series[best].value ? i : best), 0);
    return '<div class="bars">' + series.map((s, i) => {
      const h = Math.max(4, Math.round((s.value / max) * 100));
      const isPeak = opts.highlight === 'last' ? i === series.length - 1 : i === peak;
      return '<div class="bar-col' + (isPeak && s.value > 0 ? ' is-peak' : '') + '">' +
        '<div class="bar" style="height:' + h + '%">' +
          (s.value > 0 ? '<span class="bar-val">' + U.esc(U.num2(s.value)) + '</span>' : '') +
        '</div>' +
        '<div class="bar-cap">' + U.esc(s.label) + '</div>' +
      '</div>';
    }).join('') + '</div>';
  };

  /* ── Place autocomplete ────────────────────────────────────────── */
  /* wrap: an element containing one <input>. Calls onPick(place|null). */
  C.attachPlace = function (wrap, opts) {
    opts = opts || {};
    const input = wrap.querySelector('input');
    let list = null;
    let cursor = -1;
    let items = [];
    let picked = opts.initial || null;

    if (picked) input.value = picked.name;

    function closeList() {
      if (list) { list.remove(); list = null; }
      cursor = -1;
      items = [];
    }

    function openList(results) {
      closeList();
      if (!results.length) return;
      items = results;
      list = document.createElement('div');
      list.className = 'suggest-list';
      list.innerHTML = results.map((p, i) =>
        '<button type="button" class="suggest-item" data-i="' + i + '">' +
          '<span>' + U.esc(p.name) + '</span>' +
          '<span class="cc">' + U.esc(p.cc || '') + '</span>' +
        '</button>').join('');
      list.addEventListener('mousedown', (e) => {
        const b = e.target.closest('[data-i]');
        if (!b) return;
        e.preventDefault();
        choose(items[Number(b.dataset.i)]);
      });
      wrap.appendChild(list);
    }

    function choose(p) {
      picked = p;
      input.value = p ? p.name : '';
      closeList();
      if (opts.onPick) opts.onPick(p);
    }

    function refresh() {
      const q = input.value.trim();
      openList(window.Dist.search(q, 8));
    }

    input.addEventListener('focus', refresh);
    input.addEventListener('input', () => {
      picked = null;
      if (opts.onPick) opts.onPick(null);
      refresh();
    });
    input.addEventListener('blur', () => setTimeout(closeList, 120));
    input.addEventListener('keydown', (e) => {
      if (!list) {
        if (e.key === 'ArrowDown') refresh();
        return;
      }
      const btns = U.$$('.suggest-item', list);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        cursor = Math.max(0, Math.min(btns.length - 1, cursor + (e.key === 'ArrowDown' ? 1 : -1)));
        btns.forEach((b, i) => b.classList.toggle('is-cursor', i === cursor));
        btns[cursor].scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter') {
        if (cursor > -1) { e.preventDefault(); choose(items[cursor]); }
        else if (items.length) { e.preventDefault(); choose(items[0]); }
      } else if (e.key === 'Escape') {
        closeList();
      }
    });

    return {
      get: () => picked,
      set: (p) => choose(p),
      input: input,
    };
  };

  /* ── Receipt + OCR field ───────────────────────────────────────── */
  /* Renders a photo/file picker that runs OCR and reports what it read.
     onResult({ amount, date, vendor }) is called when the scan finishes. */
  C.receiptField = function (opts) {
    opts = opts || {};
    const wrap = document.createElement('div');
    wrap.className = 'field';
    const inputId = 'rcpt-' + U.uid();
    let receiptId = opts.receiptId || null;
    let thumb = null;

    wrap.innerHTML =
      '<label>Receipt' + (opts.label ? ' — ' + U.esc(opts.label) : '') + '</label>' +
      '<div class="receipt-box">' +
        '<img class="receipt-thumb" alt="" hidden>' +
        '<div style="flex:1;min-width:0">' +
          '<div class="rc-text small muted">No photo attached</div>' +
          '<div class="ocr-bar" hidden><i></i></div>' +
        '</div>' +
        '<div class="fab-row">' +
          '<label class="btn btn-sm" for="' + inputId + '">' + I.camera + '<span>Scan</span></label>' +
          '<button type="button" class="btn btn-sm btn-ghost rc-del" hidden aria-label="Remove receipt">' + I.trash + '</button>' +
        '</div>' +
      '</div>' +
      '<input id="' + inputId + '" type="file" accept="image/*" capture="environment" hidden>';

    const file = wrap.querySelector('input[type=file]');
    const img = wrap.querySelector('.receipt-thumb');
    const text = wrap.querySelector('.rc-text');
    const bar = wrap.querySelector('.ocr-bar');
    const barFill = wrap.querySelector('.ocr-bar i');
    const del = wrap.querySelector('.rc-del');

    function showThumb(dataUrl, caption) {
      thumb = dataUrl;
      img.src = dataUrl;
      img.hidden = false;
      del.hidden = false;
      text.textContent = caption || 'Photo attached';
      text.classList.remove('muted');
    }

    if (receiptId) {
      window.Store.getReceipt(receiptId).then((r) => {
        if (r && r.thumb) showThumb(r.thumb, 'Photo attached');
      });
    }

    del.addEventListener('click', async () => {
      if (receiptId) await window.Store.deleteReceipt(receiptId);
      receiptId = null;
      thumb = null;
      img.hidden = true;
      del.hidden = true;
      file.value = '';
      text.textContent = 'No photo attached';
      text.classList.add('muted');
      if (opts.onReceipt) opts.onReceipt(null);
    });

    file.addEventListener('change', async () => {
      const f = file.files && file.files[0];
      if (!f) return;
      let shrunk;
      try {
        shrunk = await U.shrinkImage(f, 1700, 0.85);
      } catch (e) {
        U.toast(e.message || 'Could not read that image', 'err');
        return;
      }
      showThumb(shrunk.dataUrl, 'Reading the receipt…');
      receiptId = await window.Store.putReceipt({
        id: receiptId || U.uid(),
        blob: shrunk.blob,
        thumb: shrunk.dataUrl,
        name: f.name || 'receipt.jpg',
      });
      if (opts.onReceipt) opts.onReceipt(receiptId);

      bar.hidden = false;
      barFill.style.width = '4%';
      try {
        const res = await window.OCR.scan(shrunk.dataUrl, (p, status) => {
          barFill.style.width = Math.round(Math.max(0.04, p) * 100) + '%';
          if (status && /load|initial/i.test(status)) text.textContent = 'Loading the text engine…';
        });
        bar.hidden = true;
        const bits = [];
        if (res.amount) bits.push(U.eur(res.amount));
        if (res.date) bits.push(U.dateLabel(res.date));
        if (res.vendor) bits.push(res.vendor);
        text.textContent = bits.length ? 'Read: ' + bits.join(' · ') : 'Nothing recognised — type the amount in';
        if (opts.onResult) opts.onResult(res);
      } catch (e) {
        bar.hidden = true;
        text.textContent = 'Photo attached (text could not be read)';
        console.warn('OCR failed', e);
      }
    });

    return {
      el: wrap,
      get: () => receiptId,
      thumb: () => thumb,
    };
  };

  /* Small helper for building <option> lists. */
  C.options = function (list, selected) {
    return list.map((o) => {
      const value = Array.isArray(o) ? o[0] : o.value;
      const label = Array.isArray(o) ? o[1] : o.label;
      return '<option value="' + U.attr(value) + '"' +
        (String(value) === String(selected) ? ' selected' : '') + '>' + U.esc(label) + '</option>';
    }).join('');
  };

  window.C = C;
}());
