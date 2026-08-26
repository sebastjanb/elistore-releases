/* Places and driving distance.

   Distance comes from OSRM (real road routing) whenever the machine is online;
   every answer is cached so the same pair is never looked up twice. Offline it
   falls back to great-circle distance inflated by a road factor, which is
   clearly labelled in the UI — and the kilometres are always editable by hand. */
(function () {
  'use strict';

  const U = window.U;
  const ROAD_FACTOR = 1.28;          // straight line -> realistic road distance
  const OSRM = 'https://router.project-osrm.org/route/v1/driving/';

  const Dist = { customPlaces: [] };

  function normalise(s) {
    return String(s || '')
      .toLocaleLowerCase('sl')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\u0111/g, 'd');
  }

  /* The bundled GeoNames list, decorated once at boot. */
  let INDEX = [];
  Dist.init = async function () {
    INDEX = (window.PLACES || []).map((p) => ({
      name: p[0], cc: p[1], lat: p[2], lon: p[3], pop: p[4],
      key: normalise(p[0]),
    }));
    Dist.customPlaces = (await window.Store.kvGet('customPlaces')) || [];
    INDEX = INDEX.concat(Dist.customPlaces.map((p) => Object.assign({ key: normalise(p.name) }, p)));
  };

  Dist.addCustomPlace = async function (place) {
    place.custom = true;
    Dist.customPlaces.push(place);
    INDEX.push(Object.assign({ key: normalise(place.name) }, place));
    await window.Store.kvSet('customPlaces', Dist.customPlaces);
    return place;
  };

  Dist.allPlaces = () => INDEX;

  /* Prefix matches first, then substring, then by population. */
  Dist.search = function (q, limit) {
    limit = limit || 8;
    const n = normalise(q).trim();
    if (!n) {
      return INDEX.slice().sort((a, b) => b.pop - a.pop).slice(0, limit);
    }
    const starts = [], has = [];
    for (const p of INDEX) {
      if (p.key.startsWith(n)) starts.push(p);
      else if (p.key.includes(n)) has.push(p);
      if (starts.length > 60) break;
    }
    const rank = (a, b) => (b.pop || 0) - (a.pop || 0);
    return starts.sort(rank).concat(has.sort(rank)).slice(0, limit);
  };

  Dist.find = function (name, cc) {
    const n = normalise(name);
    const hits = INDEX.filter((p) => p.key === n && (!cc || p.cc === cc));
    if (!hits.length) return null;
    return hits.sort((a, b) => b.pop - a.pop)[0];
  };

  /* ── Geometry ──────────────────────────────────────────────────── */
  Dist.haversine = function (aLat, aLon, bLat, bLon) {
    const R = 6371.0088;
    const toRad = Math.PI / 180;
    const dLat = (bLat - aLat) * toRad;
    const dLon = (bLon - aLon) * toRad;
    const s = Math.sin(dLat / 2) ** 2 +
      Math.cos(aLat * toRad) * Math.cos(bLat * toRad) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
  };

  Dist.nearest = function (lat, lon, maxKm) {
    let best = null, bestD = Infinity;
    for (const p of INDEX) {
      const d = Dist.haversine(lat, lon, p.lat, p.lon);
      if (d < bestD) { bestD = d; best = p; }
    }
    if (maxKm && bestD > maxKm) return null;
    return best ? Object.assign({ distanceKm: bestD }, best) : null;
  };

  /* ── Routing ───────────────────────────────────────────────────── */
  const round4 = (n) => Math.round(n * 1e4) / 1e4;

  function cacheKey(points) {
    return 'route:' + points.map((p) => round4(p.lat) + ',' + round4(p.lon)).join(';');
  }

  /* points: [{lat,lon}, ...] in visit order (2 or more).
     Returns { km, source: 'osrm' | 'estimate', minutes? } */
  Dist.route = async function (points) {
    const pts = (points || []).filter((p) => p && isFinite(p.lat) && isFinite(p.lon));
    if (pts.length < 2) return { km: 0, source: 'estimate' };

    const key = cacheKey(pts);
    const cached = await window.Store.kvGet(key);
    if (cached && cached.km > 0) return Object.assign({ cached: true }, cached);

    const estimate = () => {
      let km = 0;
      for (let i = 1; i < pts.length; i++) {
        km += Dist.haversine(pts[i - 1].lat, pts[i - 1].lon, pts[i].lat, pts[i].lon);
      }
      return { km: U.round1(km * ROAD_FACTOR), source: 'estimate' };
    };

    if (!navigator.onLine || window.Store.settings.autoRouteLookup === false) return estimate();

    try {
      const coords = pts.map((p) => round4(p.lon) + ',' + round4(p.lat)).join(';');
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 9000);
      const res = await fetch(OSRM + coords + '?overview=false', { signal: ctrl.signal });
      clearTimeout(timer);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      if (data.code !== 'Ok' || !data.routes || !data.routes.length) throw new Error(data.code || 'no route');
      const out = {
        km: U.round1(data.routes[0].distance / 1000),
        minutes: Math.round(data.routes[0].duration / 60),
        source: 'osrm',
      };
      await window.Store.kvSet(key, out);
      return out;
    } catch (e) {
      return estimate();
    }
  };

  /* Look a free-text place up online, so somewhere not in the bundled list
     (a customer's industrial estate, say) can still be used. */
  Dist.geocode = async function (query) {
    const url = 'https://nominatim.openstreetmap.org/search?format=json&limit=5&accept-language=en&q=' +
      encodeURIComponent(query);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 9000);
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    clearTimeout(timer);
    if (!res.ok) throw new Error('Search failed (HTTP ' + res.status + ')');
    const rows = await res.json();
    return rows.map((r) => ({
      name: String(r.display_name).split(',')[0].trim(),
      label: r.display_name,
      cc: (r.address && r.address.country_code ? r.address.country_code : '').toUpperCase() ||
          guessCC(r.display_name),
      lat: Number(r.lat),
      lon: Number(r.lon),
      pop: 0,
    }));
  };

  function guessCC(label) {
    if (/Slovenij|Slovenia/i.test(label)) return 'SI';
    if (/Hrvatsk|Croatia/i.test(label)) return 'HR';
    const m = /,\s*([^,]+)$/.exec(label || '');
    return m ? m[1].trim().slice(0, 2).toUpperCase() : '';
  }

  Dist.currentPosition = function (opts) {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error('This device has no location service'));
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        }),
        (err) => reject(new Error(geoMessage(err))),
        Object.assign({ enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }, opts || {})
      );
    });
  };

  function geoMessage(err) {
    if (!err) return 'Location unavailable';
    if (err.code === 1) return 'Location permission denied — allow it in Settings to use GPS';
    if (err.code === 2) return 'Location unavailable right now';
    if (err.code === 3) return 'Location timed out';
    return err.message || 'Location unavailable';
  }
  Dist.geoMessage = geoMessage;
  Dist.ROAD_FACTOR = ROAD_FACTOR;

  window.Dist = Dist;
}());
