/*
 * The page reads the same apps.json the phone reads, so the list here can never
 * disagree with the list in SideStore — there is one source of truth and this
 * is a view of it.
 */

(() => {
  'use strict';

  /* Relative to the page, not to the origin: GitHub Pages serves this site
   * under /<repo>/, so a root-absolute path would look outside it. */
  const BASE = new URL('.', location.href);
  const SOURCE_URL = new URL('apps.json', BASE).href;

  /* Icon URLs in the JSON are absolute and point at the deployed site, because
   * that is what a phone reading the source needs. When this page is being
   * served from somewhere else — tools/serve.mjs, a deploy preview — those
   * point at a site that may not exist yet, so pull /assets/ back to this
   * origin. Only off the real host, so production keeps using its own URLs. */
  const PREVIEW = /^(localhost|127\.|0\.0\.0\.0$|\[?::1\]?$|192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/
    .test(location.hostname);

  const localise = (url) => {
    if (!url) return url;
    try {
      const parsed = new URL(url, location.href);
      if (PREVIEW && parsed.origin !== location.origin && parsed.pathname.startsWith('/assets/')) {
        return new URL(`assets/${parsed.pathname.split('/assets/')[1]}`, BASE).href;
      }
      return parsed.href;
    } catch {
      return url;
    }
  };

  /* ------------------------------------------------------------- helpers */

  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  };

  const formatSize = (bytes) => {
    if (!bytes) return null;
    const mb = bytes / 1e6;
    return mb >= 1000 ? `${(mb / 1000).toFixed(2)} GB` : `${mb.toFixed(1)} MB`;
  };

  const formatDate = (value) => {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.valueOf())
      ? value
      : date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  };

  const CATEGORY_NAMES = {
    developer: 'Developer',
    entertainment: 'Entertainment',
    games: 'Games',
    lifestyle: 'Lifestyle',
    other: 'Other',
    'photo-video': 'Photo & Video',
    social: 'Social',
    utilities: 'Utilities',
  };

  let toastTimer;
  const toast = (message) => {
    const node = document.getElementById('toast');
    node.textContent = message;
    node.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => node.classList.remove('show'), 2400);
  };

  /* ------------------------------------------------- source URL and links */

  const input = document.getElementById('url');
  input.value = SOURCE_URL;

  for (const link of document.querySelectorAll('[data-scheme]')) {
    link.href = `${link.dataset.scheme}://source?url=${encodeURIComponent(SOURCE_URL)}`;
  }

  document.getElementById('copy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(SOURCE_URL);
    } catch {
      /* Safari refuses the async clipboard outside some gestures; the old way still works. */
      input.select();
      document.execCommand('copy');
    }
    toast('Source URL copied');
  });

  input.addEventListener('focus', () => input.select());

  /* A custom scheme on a device without the app installed just does nothing
   * visible, which reads as a broken button. Say something instead. */
  const isPhone = /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  for (const link of document.querySelectorAll('[data-scheme]')) {
    link.addEventListener('click', (event) => {
      if (!isPhone) {
        event.preventDefault();
        toast('Open this page on your iPhone — or copy the URL below');
        return;
      }
      const app = link.dataset.scheme === 'sidestore' ? 'SideStore' : 'AltStore';
      setTimeout(() => {
        if (!document.hidden) toast(`Nothing opened — is ${app} installed?`);
      }, 1600);
    });
  }

  /* ------------------------------------------------------------- the list */

  function renderApp(app) {
    const card = el('article', 'app');

    const icon = el('img', 'app-icon');
    icon.src = localise(app.iconURL) ?? new URL('assets/elistore-icon.png', BASE).href;
    icon.alt = '';
    icon.width = 68;
    icon.height = 68;
    icon.loading = 'lazy';
    /* A missing icon should look like a plain tile, not a broken image. */
    icon.addEventListener('error', () => { icon.src = new URL('assets/elistore-icon.png', BASE).href; }, { once: true });
    card.append(icon);

    const body = el('div');

    const head = el('div', 'app-head');
    head.append(el('h3', 'app-name', app.name));
    if (app.developerName) head.append(el('span', 'app-dev', app.developerName));
    body.append(head);

    if (app.subtitle) body.append(el('p', 'app-sub', app.subtitle));

    const latest = (app.versions ?? [])[0];

    const meta = el('div', 'meta');
    const chip = (text, warn) => {
      if (!text) return;
      meta.append(el('span', warn ? 'chip chip-warn' : 'chip', text));
    };
    if (latest?.version) chip(`v${latest.version}`);
    chip(formatSize(latest?.size));
    chip(formatDate(latest?.date));
    if (latest?.minOSVersion) chip(`iOS ${latest.minOSVersion}+`);
    if (app.category) chip(CATEGORY_NAMES[app.category] ?? app.category);
    if (!latest?.size) chip('not uploaded yet', true);
    if (meta.children.length) body.append(meta);

    if (app.localizedDescription) {
      const full = app.localizedDescription.trim();
      const short = full.split('\n\n')[0];

      const description = el('p', 'app-desc', short);
      body.append(description);

      if (full.length > short.length) {
        const more = el('button', 'app-more', 'Read more');
        more.type = 'button';
        let expanded = false;
        more.addEventListener('click', () => {
          expanded = !expanded;
          description.textContent = expanded ? full : short;
          more.textContent = expanded ? 'Show less' : 'Read more';
        });
        body.append(more);
      }
    }

    const links = el('div', 'app-links');
    if (latest?.downloadURL && latest.size) {
      const download = el('a', null, 'Download .ipa');
      download.href = latest.downloadURL;
      download.rel = 'noopener';
      links.append(download);
    }
    if (links.children.length) body.append(links);

    card.append(body);
    return card;
  }

  fetch(`${SOURCE_URL}?t=${Date.now()}`, { cache: 'no-store' })
    .then((response) => {
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return response.json();
    })
    .then((source) => {
      const container = document.getElementById('apps');
      container.textContent = '';

      const apps = source.apps ?? [];
      if (apps.length === 0) {
        container.append(el('p', 'loading', 'The source is empty at the moment.'));
        return;
      }

      /* Featured first, in the order store.json lists them. */
      const featured = source.featuredApps ?? [];
      const rank = (app) => {
        const index = featured.indexOf(app.bundleIdentifier);
        return index === -1 ? featured.length : index;
      };
      [...apps].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name))
        .forEach((app) => container.append(renderApp(app)));

      if (source.name) document.title = `${source.name} — a source for AltStore and SideStore`;
    })
    .catch((error) => {
      const container = document.getElementById('apps');
      container.textContent = '';
      container.append(el('p', 'error', `Could not load apps.json — ${error.message}`));
    });
})();
