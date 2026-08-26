/* Live trip recording.

   Tap "Start driving" before you pull away and the phone accumulates real GPS
   distance; tap stop and the app offers a mileage entry with the kilometres,
   the start and end towns and the times already filled in.

   Note on phones: a browser only receives location while the app is on screen,
   so the trip screen keeps the display awake with a Wake Lock. If iOS suspends
   the page anyway, the recorded distance is a straight line across the gap —
   which is why the kilometres remain editable afterwards. */
(function () {
  'use strict';

  const U = window.U;

  const Trip = {
    trip: null,
    watchId: null,
    wakeLock: null,
    listeners: [],
    lastSaved: 0,
    lastError: '',
  };

  const MAX_ACCURACY = 100;   // metres — ignore fixes worse than this
  const MIN_STEP = 12;        // metres — below this it is GPS jitter
  const MAX_SPEED = 70;       // m/s — reject teleports (~250 km/h)

  Trip.onChange = function (fn) {
    Trip.listeners.push(fn);
    return () => { Trip.listeners = Trip.listeners.filter((f) => f !== fn); };
  };
  function emit() { Trip.listeners.forEach((f) => { try { f(Trip.trip); } catch (e) { console.error(e); } }); }

  Trip.active = () => Trip.trip;

  /* Picks up a trip that was still running when the app was last closed. */
  Trip.resume = async function () {
    const t = window.Store.activeTrip();
    if (!t) return null;
    Trip.trip = t;
    await startWatch();
    emit();
    return t;
  };

  Trip.start = async function (company) {
    if (Trip.trip) return Trip.trip;
    if (!navigator.geolocation) throw new Error('This device has no location service');

    // Ask for a first fix up front: it surfaces the permission prompt straight
    // away instead of leaving the user staring at 0.0 km.
    const first = await window.Dist.currentPosition({ timeout: 20000 });

    Trip.trip = {
      id: U.uid(),
      status: 'active',
      company: company || window.Store.settings.company,
      startedAt: Date.now(),
      endedAt: null,
      km: 0,
      points: [{ lat: first.lat, lon: first.lon, t: Date.now(), acc: first.accuracy }],
      startPlace: placeName(first.lat, first.lon),
      endPlace: null,
    };
    await window.Store.saveTrip(Trip.trip);
    await startWatch();
    emit();
    return Trip.trip;
  };

  function placeName(lat, lon) {
    const p = window.Dist.nearest(lat, lon, 25);
    return p ? { name: p.name, cc: p.cc, lat: p.lat, lon: p.lon } : null;
  }

  async function startWatch() {
    if (Trip.watchId !== null) return;
    Trip.watchId = navigator.geolocation.watchPosition(onFix, onErr, {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 30000,
    });
    await acquireWakeLock();
    document.addEventListener('visibilitychange', onVisible);
  }

  function stopWatch() {
    if (Trip.watchId !== null) {
      navigator.geolocation.clearWatch(Trip.watchId);
      Trip.watchId = null;
    }
    releaseWakeLock();
    document.removeEventListener('visibilitychange', onVisible);
  }

  function onVisible() {
    if (document.visibilityState === 'visible' && Trip.trip) acquireWakeLock();
  }

  async function acquireWakeLock() {
    try {
      if ('wakeLock' in navigator && document.visibilityState === 'visible') {
        Trip.wakeLock = await navigator.wakeLock.request('screen');
      }
    } catch (e) { /* not fatal — the trip still records while the screen is on */ }
  }

  function releaseWakeLock() {
    if (Trip.wakeLock) { try { Trip.wakeLock.release(); } catch (e) { /* ignore */ } }
    Trip.wakeLock = null;
  }

  function onErr(err) {
    Trip.lastError = window.Dist.geoMessage(err);
    emit();
  }

  function onFix(pos) {
    if (!Trip.trip) return;
    const c = pos.coords;
    if (c.accuracy > MAX_ACCURACY) return;

    const pts = Trip.trip.points;
    const prev = pts[pts.length - 1];
    const now = pos.timestamp || Date.now();

    if (prev) {
      const km = window.Dist.haversine(prev.lat, prev.lon, c.latitude, c.longitude);
      const metres = km * 1000;
      const seconds = Math.max(0.5, (now - prev.t) / 1000);
      if (metres < Math.max(MIN_STEP, c.accuracy * 0.6)) return;
      if (metres / seconds > MAX_SPEED) return;
      /* Accumulate at full precision. Rounding the running total to a tenth
         of a kilometre after every fix destroys the distance: a real GPS step
         is 12-25 m, or 0.012-0.025 km, which rounds straight back to zero, so
         a whole drive adds up to nothing. (A 50 m step would round up to 0.1
         each time, doubling it instead.) The total is rounded once, in stop().
         This is the same fault that made the iPhone app record 0,0 km — do not
         reintroduce it here. */
      Trip.trip.km = Trip.trip.km + km;
    }

    pts.push({ lat: c.latitude, lon: c.longitude, t: now, acc: Math.round(c.accuracy) });
    Trip.lastError = '';

    // Trim the track so a long day does not grow without bound; the distance
    // total is already accumulated, the points are only for the map/summary.
    if (pts.length > 4000) pts.splice(1, 1000);

    if (Date.now() - Trip.lastSaved > 15000) {
      Trip.lastSaved = Date.now();
      window.Store.saveTrip(Trip.trip);
    }
    emit();
  }

  Trip.stop = async function () {
    if (!Trip.trip) return null;
    const t = Trip.trip;
    stopWatch();
    t.status = 'done';
    t.endedAt = Date.now();
    /* One rounding, on the finished total, rather than on every fix. This is
       the only place the distance may be rounded. */
    t.km = U.round1(t.km);
    const last = t.points[t.points.length - 1];
    if (last) t.endPlace = placeName(last.lat, last.lon);
    if (!t.startPlace && t.points[0]) t.startPlace = placeName(t.points[0].lat, t.points[0].lon);
    await window.Store.saveTrip(t);
    Trip.trip = null;
    emit();
    return t;
  };

  Trip.cancel = async function () {
    if (!Trip.trip) return;
    const id = Trip.trip.id;
    stopWatch();
    Trip.trip = null;
    await window.Store.deleteTrip(id);
    emit();
  };

  /* Recorded trips that have not been turned into a mileage entry yet. */
  Trip.unlogged = function () {
    return window.Store.trips
      .filter((t) => t.status === 'done' && !t.entryId)
      .sort((a, b) => b.startedAt - a.startedAt);
  };

  window.Trip = Trip;
}());
