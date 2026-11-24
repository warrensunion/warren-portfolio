// The climb's pure half: scroll in, altitude and weather out. No DOM and no three.js, so the HUD, the
// altimeter, the camera path and the Node tests all read the same numbers. Every value here is a model
// of a made-up mountain, labelled as such on the page (the HUD caption); none of it is a measurement.

export const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (x) => x * x * (3 - 2 * x);

// The logs, in page order. alt is metres above base camp; the summit is the last log.
export const SUMMIT = 6100;

/**
 * Altitude at a scroll position. anchors: [{ y, alt }] in page order, y the scroll position at which that
 * log's top crosses the trigger line. Before the first anchor it is the first altitude, past the last the
 * last; between two it is linear, eased a little at each anchor so the HUD settles on the log's number.
 */
export function altitudeAt(y, anchors) {
  if (!anchors || !anchors.length) return 0;
  if (y <= anchors[0].y) return anchors[0].alt;
  for (let i = 1; i < anchors.length; i++) {
    const a = anchors[i - 1];
    const b = anchors[i];
    if (y <= b.y) {
      const span = b.y - a.y;
      const t = span > 0 ? (y - a.y) / span : 1;
      // 80 % linear, 20 % eased: honest progress, but the needle rests on round numbers at the logs.
      const k = 0.8 * t + 0.2 * smooth(t);
      return a.alt + (b.alt - a.alt) * k;
    }
  }
  return anchors[anchors.length - 1].alt;
}

/** Which log the page is in: the last anchor at or above y (0-based), and how far through it (0..1). */
export function logAt(y, anchors) {
  if (!anchors || !anchors.length) return { index: 0, t: 0 };
  let i = 0;
  while (i + 1 < anchors.length && y >= anchors[i + 1].y) i++;
  const next = anchors[i + 1];
  const t = next ? clamp01((y - anchors[i].y) / Math.max(1, next.y - anchors[i].y)) : 1;
  return { index: i, t };
}

/** Climb progress 0..1 from base camp to the summit: drives the igloo build and the sky. */
export const climbOf = (alt) => clamp01(alt / SUMMIT);

/** Air temperature (deg C) at an altitude: -4 at base camp, the standard lapse rate of 6.5 per km. */
export const tempAt = (alt) => -4 - (6.5 * alt) / 1000;

// A seeded smooth noise of time for the gusts (no Math.random: the same seed gives the same weather).
function hash(n) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function vnoise(t) {
  const i = Math.floor(t);
  const f = t - i;
  return hash(i) + (hash(i + 1) - hash(i)) * smooth(f);
}

/** Wind speed (km/h) at an altitude and a time (s): a base that rises with height plus gust fronts. */
export function windAt(alt, time, seed = 7) {
  const base = 12 + 0.011 * alt;
  const g = vnoise(time * 0.23 + seed) * 0.65 + vnoise(time * 0.71 + seed * 3.1) * 0.35;
  const gust = Math.max(0, g - 0.45) * 2 * (18 + 0.006 * alt);
  return base + gust;
}

/** Gust strength 0..1 at a time, for the snow's wind field (the same noise as windAt). */
export function gustAt(time, seed = 7) {
  const g = vnoise(time * 0.23 + seed) * 0.65 + vnoise(time * 0.71 + seed * 3.1) * 0.35;
  return clamp01((g - 0.45) * 2);
}

/** Snowfall (cm/h): heaviest around the treeline cloud, thin above it, a dusting at the summit. */
export function snowAt(alt) {
  const cloud = Math.exp(-(((alt - 1300) / 900) ** 2));
  return 0.4 + 2.6 * cloud + 0.8 * clamp01(1 - alt / 4000);
}

/** Visibility (km): low inside the cloud (log 02), long above it. */
export function visibilityAt(alt) {
  const cloud = Math.exp(-(((alt - 1300) / 700) ** 2));
  const open = 4 + 46 * clamp01((alt - 1800) / 4000);
  return Math.max(0.1, open * (1 - 0.97 * cloud));
}

/** Ease a shown value toward its target, frame-rate independent (rate per second). */
export const ease = (cur, target, dt, rate = 4) => cur + (target - cur) * (1 - Math.exp(-dt * rate));

/** HUD strings for one set of values. Numbers are grouped in thousands with commas, as the page's copy is. */
export function hudText({ alt, temp, wind, snow, vis, placed, total, seed }) {
  const g = (n) => Math.round(n).toLocaleString('en-US');
  const t = Math.round(temp * 10) / 10;
  return {
    alt: `${g(alt)} m`,
    temp: `${t < 0 ? '−' : ''}${Math.abs(t).toFixed(1)} °C`,
    wind: `${g(wind)} km/h`,
    snow: `${snow.toFixed(1)} cm/h`,
    vis: vis < 1 ? `${Math.round(vis * 1000)} m` : `${vis.toFixed(vis < 10 ? 1 : 0)} km`,
    blocks: `${g(placed)} / ${g(total)}`,
    seed,
  };
}
