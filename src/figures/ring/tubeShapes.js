// Ported from BTTRURSLF-v2 src/screens/shop/hub/tubeShapes.js: the particle shapes, each grown out of a
// picture's silhouette (alpha is coverage, RGB the art's own shading), with a front, a back, a side and
// a tone per point, every shape the same point count and sorted loosely by height so point i of one shape
// flies to point i of the next and the new shape fills in from the base up.
// Kept as it was: grow(), the chamfer distance, the hub logo's cut-line trick (now run on the initials),
// the plain-disc fallback and the session cache. Changed, and why:
//  - grow() is exported and nothing here touches the DOM at load time, so Node tests can import it.
//  - objects are sampled at 256 px, not 128, and thin art (under 12% coverage, the bow) is thickened by
//    a pixel first: at 128 px the bowstring was under a pixel wide and vanished from the point cloud.
//  - one shape per worker job (growOne), so the four shapes grow in parallel; a worker failure falls
//    back to the same code on the main thread and says so through `onFallback` (the figure's ctx.log).
//  - fitInCircle(): the figure stands inside the ring, so each shape is centred and scaled into a circle
//    instead of standing on a pedestal at y = 0.

// The logo (the initials) and objects fit inside HEIGHT x WIDTH (hub values, kept: fitInCircle rescales).
const HEIGHT = 1.95;
const WIDTH = 1.85;
const OBJECT_SIDE = 256;
const LOGO_SIDE = 640;
const THIN_COVERAGE = 0.12;

/** Seeded random (mulberry32). */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function pixels(src, maxSide) {
  const res = await fetch(src);
  if (!res.ok) throw new Error(`${src}: ${res.status}`);
  const bmp = await createImageBitmap(await res.blob());
  const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * k));
  const h = Math.max(1, Math.round(bmp.height * k));
  // An OffscreenCanvas where there is one: the shapes grow in a worker (hubWorker.js).
  const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : document.createElement('canvas');
  c.width = w;
  c.height = h;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  return { w, h, data: x.getImageData(0, 0, w, h).data };
}

/** Share of the picture that is solidly covered (alpha > 128). */
export function coverage({ w, h, data }) {
  let on = 0;
  for (let i = 0; i < w * h; i++) if (data[i * 4 + 3] > 128) on++;
  return on / (w * h);
}

/**
 * A max filter on alpha (radius px, square), carrying each grown pixel's colour from the most opaque
 * neighbour. Thin strokes (a bowstring) become wide enough to keep their points; a new array is returned.
 */
export function thicken({ w, h, data }, radius = 1) {
  const out = new Uint8ClampedArray(data.length);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let best = (y * w + x) * 4;
      for (let dy = -radius; dy <= radius; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -radius; dx <= radius; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          const j = (yy * w + xx) * 4;
          if (data[j + 3] > data[best + 3]) best = j;
        }
      }
      const i = (y * w + x) * 4;
      out[i] = data[best];
      out[i + 1] = data[best + 1];
      out[i + 2] = data[best + 2];
      out[i + 3] = data[best + 3];
    }
  return { w, h, data: out };
}

/** Chamfer distance (px) from every inside pixel to the nearest outside one. */
function distance(mask, w, h) {
  const INF = 1e9;
  const d = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) d[i] = mask[i] ? INF : 0;
  const D1 = 1;
  const D2 = Math.SQRT2;
  const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : d[y * w + x]);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!d[i]) continue;
      d[i] = Math.min(d[i], at(x - 1, y) + D1, at(x, y - 1) + D1, at(x - 1, y - 1) + D2, at(x + 1, y - 1) + D2);
    }
  for (let y = h - 1; y >= 0; y--)
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      if (!d[i]) continue;
      d[i] = Math.min(d[i], at(x + 1, y) + D1, at(x, y + 1) + D1, at(x + 1, y + 1) + D2, at(x - 1, y + 1) + D2);
    }
  return d;
}

/**
 * One shape -> { pos (n*3), nrm (n*3), tone (n), box: { min, max } }.
 * kind 'logo' | 'object'.
 */
export function grow({ w, h, data }, kind, n, seed) {
  const rand = rng(seed);
  const N = w * h;
  const mask = new Uint8Array(N);
  const lum = new Float32Array(N);
  const cov = new Float32Array(N);
  let x0 = w;
  let x1 = 0;
  let y0 = h;
  let y1 = 0;
  for (let i = 0; i < N; i++) {
    const a = data[i * 4 + 3];
    if (a < 16) continue;
    cov[i] = a / 255;
    lum[i] = (0.2126 * data[i * 4] + 0.7152 * data[i * 4 + 1] + 0.0722 * data[i * 4 + 2]) / 255;
    if (a > 128) {
      mask[i] = 1;
      const x = i % w;
      const y = (i / w) | 0;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  const dist = distance(mask, w, h);
  // The logo's thin cuts: transparent pixels a closing of the mask fills in
  // (in the hub, channels cut through its B; in the initials, narrow gaps such
  // as where two serifs nearly meet), not the outside, not a wide counter.
  // cutDist is each pixel's distance to the nearest of them.
  let cutDist = null;
  if (kind === 'logo') {
    const R = Math.max(3, Math.round(h * 0.012));
    const out = new Uint8Array(N);
    for (let i = 0; i < N; i++) out[i] = mask[i] ? 0 : 1;
    const dOut = distance(out, w, h); // transparent -> nearest opaque
    const dil = new Uint8Array(N);
    for (let i = 0; i < N; i++) dil[i] = mask[i] || dOut[i] <= R ? 1 : 0;
    const dDil = distance(dil, w, h); // dilated -> nearest outside it
    const notCut = new Uint8Array(N);
    for (let i = 0; i < N; i++) notCut[i] = !mask[i] && dDil[i] > R ? 0 : 1;
    cutDist = distance(notCut, w, h);
  }
  let dMax = 1;
  for (let i = 0; i < N; i++) if (dist[i] > dMax) dMax = dist[i];
  const bw = x1 - x0 + 1;
  const bh = y1 - y0 + 1;

  // The art's light range (objects): stretch the 5th-95th percentile to 0..1.
  let lo = 0;
  let hi = 1;
  if (kind === 'object') {
    const ls = [];
    for (let i = 0; i < N; i++) if (mask[i]) ls.push(lum[i]);
    ls.sort((a, b) => a - b);
    lo = ls[Math.floor(ls.length * 0.05)] ?? 0;
    hi = ls[Math.floor(ls.length * 0.95)] ?? 1;
    if (hi - lo < 0.05) hi = lo + 0.05;
  }

  // Front surface height (px) per pixel.
  const zf = new Float32Array(N);
  const slab = 0.085 * bh; // the logo's half-thickness
  const edgeW = 0.011 * bh; // the dark line beside a cut (~4 px of the hub's 615 px mark)
  const bevel = 0.035 * bh;
  for (let i = 0; i < N; i++) {
    if (!cov[i]) continue;
    const d = dist[i] + cov[i] * 0.5;
    if (kind === 'logo') {
      const edge = Math.min(1, d / bevel);
      const round = Math.sqrt(1 - (1 - edge) * (1 - edge));
      // white stands forward, anything greyer sits back (the initials are
      // all white, so they come out a flat slab)
      const white = smooth(0.42, 0.75, lum[i]);
      // a hair of relief only: more and the white letters' points hid the
      // gaps between them whenever the logo turned (hub review r1)
      zf[i] = slab * round + (white - 0.5) * 0.008 * bh * round;
    } else {
      const t = Math.min(d, dMax) / dMax;
      zf[i] = dMax * 0.82 * Math.sqrt(1 - (1 - t) * (1 - t)) + 0.6;
    }
  }
  const Z = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : zf[y * w + x]);
  const DD = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : dist[y * w + x]);

  // Where points land: inside pixels, the soft fringe at a fraction.
  const cdf = new Float32Array(N);
  let acc = 0;
  for (let i = 0; i < N; i++) {
    // The soft fringe only for objects: on the logo it fills its thin gaps.
    acc += mask[i] ? 1 : kind === 'logo' ? 0 : cov[i] * 0.35;
    cdf[i] = acc;
  }
  const pick = () => {
    const r = rand() * acc;
    let a = 0;
    let b = N - 1;
    while (a < b) {
      const m = (a + b) >> 1;
      if (cdf[m] < r) a = m + 1;
      else b = m;
    }
    return a;
  };

  const s = kind === 'logo' ? HEIGHT / bh : Math.min(HEIGHT / bh, WIDTH / bw);
  const cx = x0 + bw / 2;
  const pts = new Array(n);
  for (let k = 0; k < n; k++) {
    const i = pick();
    const px = i % w;
    const py = (i / w) | 0;
    const fx = px + rand();
    const fy = py + rand();
    const z = Z(px, py);
    const gx = (Z(px + 1, py) - Z(px - 1, py)) * 0.5;
    const gy = (Z(px, py + 1) - Z(px, py - 1)) * 0.5;
    const L = lum[i];
    let tone;
    // The logo's tones kept ~2.7x apart (the hub's mark: white ~F0 vs grey ~48;
    // the all-white initials sit at the top of this range).
    if (kind === 'logo') {
      tone = 0.16 + 0.98 * smooth(0.35, 0.75, L);
      // The logo's thin cut channels are narrower than a dot, so points
      // cannot leave them open: the dots beside every cut go dark instead,
      // drawing the channel as a line.
      const dd = cutDist[i];
      if (dd < edgeW) tone *= 0.34 + 0.66 * smooth(edgeW * 0.35, edgeW, dd);
    }
    else tone = 0.24 + 0.46 * Math.min(1.1, Math.max(0, (L - lo) / (hi - lo)));
    // Layer: front 46 %, back 34 %, side/inside 20 %; the logo 80 / 12 / 8, so
    // its face is dense enough that the back never speckles through.
    const r = rand();
    const F = kind === 'logo' ? 0.8 : 0.46;
    const B = kind === 'logo' ? 0.92 : 0.8;
    let pz;
    let nx;
    let ny;
    let nz;
    if (r < F) {
      pz = z;
      [nx, ny, nz] = norm(-gx, gy, 1);
    } else if (r < B) {
      pz = kind === 'logo' ? -slab * Math.min(1, z / Math.max(1e-3, slab)) : -z;
      [nx, ny, nz] = norm(kind === 'logo' ? 0 : gx, kind === 'logo' ? 0 : -gy, -1);
      if (kind === 'logo') tone *= 0.85;
    } else {
      pz = (rand() * 2 - 1) * z * 0.9;
      const ex = (DD(px + 1, py) - DD(px - 1, py)) * 0.5;
      const ey = (DD(px, py + 1) - DD(px, py - 1)) * 0.5;
      [nx, ny, nz] = norm(-ex, ey, (pz / Math.max(1e-3, z)) * 0.6);
      tone *= 0.92;
    }
    pts[k] = {
      x: (fx - cx) * s,
      y: (y1 + 1 - fy) * s,
      z: pz * s,
      nx,
      ny,
      nz,
      tone,
      key: (y1 + 1 - fy) * s + (rand() - 0.5) * 0.7,
    };
  }
  pts.sort((a, b) => a.key - b.key);
  const pos = new Float32Array(n * 3);
  const nrm = new Float32Array(n * 3);
  const tone = new Float32Array(n);
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  pts.forEach((p, k) => {
    pos[k * 3] = p.x;
    pos[k * 3 + 1] = p.y;
    pos[k * 3 + 2] = p.z;
    nrm[k * 3] = p.nx;
    nrm[k * 3 + 1] = p.ny;
    nrm[k * 3 + 2] = p.nz;
    // objects carry +4 on their tone: the shader shades them with less
    // ambient (igloo's relief) and the logo with its tones kept apart
    tone[k] = p.tone + (kind === 'object' ? 4 : 0);
    min[0] = Math.min(min[0], p.x);
    min[1] = Math.min(min[1], p.y);
    min[2] = Math.min(min[2], p.z);
    max[0] = Math.max(max[0], p.x);
    max[1] = Math.max(max[1], p.y);
    max[2] = Math.max(max[2], p.z);
  });
  return { pos, nrm, tone, box: { min, max } };
}

function smooth(e0, e1, x) {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}
function norm(x, y, z) {
  const l = Math.hypot(x, y, z) || 1;
  return [x / l, y / l, z / l];
}

/** A plain disc when a picture is missing, so the morph still has somewhere to go. */
function disc(n, seed) {
  const rand = rng(seed);
  const data = new Uint8ClampedArray(64 * 64 * 4);
  for (let y = 0; y < 64; y++)
    for (let x = 0; x < 64; x++) {
      const i = (y * 64 + x) * 4;
      const on = Math.hypot(x - 31.5, y - 31.5) < 28;
      data[i] = data[i + 1] = data[i + 2] = 200;
      data[i + 3] = on ? 255 : 0;
    }
  return grow({ w: 64, h: 64, data }, 'object', n, Math.floor(rand() * 1e6));
}

/**
 * The shape centred on the origin and scaled (uniformly, z too) so its xy box fits a circle of `radius`.
 * Returns new arrays (the session cache keeps the grown originals) plus the `scale` used.
 */
export function fitInCircle(shape, radius) {
  const { min, max } = shape.box;
  const cx = (min[0] + max[0]) / 2;
  const cy = (min[1] + max[1]) / 2;
  const half = Math.hypot((max[0] - min[0]) / 2, (max[1] - min[1]) / 2) || 1;
  const scale = radius / half;
  const n = shape.pos.length / 3;
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = (shape.pos[i * 3] - cx) * scale;
    pos[i * 3 + 1] = (shape.pos[i * 3 + 1] - cy) * scale;
    pos[i * 3 + 2] = shape.pos[i * 3 + 2] * scale;
  }
  return {
    ...shape,
    pos,
    scale,
    box: {
      min: [(min[0] - cx) * scale, (min[1] - cy) * scale, min[2] * scale],
      max: [(max[0] - cx) * scale, (max[1] - cy) * scale, max[2] * scale],
    },
  };
}

/** One shape from its picture: item = { id, src, kind }, index seeds it as the hub did (101 + i * 17). */
export async function growOne(item, n, index) {
  let px = await pixels(item.src, item.kind === 'logo' ? LOGO_SIDE : OBJECT_SIDE);
  if (item.kind === 'object' && coverage(px) < THIN_COVERAGE) px = thicken(px, 1);
  return { id: item.id, ...grow(px, item.kind, n, 101 + index * 17) };
}

/** Main-thread fallback for one shape: the same code, or a plain disc if its picture will not load. */
async function growHere(item, n, index) {
  try {
    return await growOne(item, n, index);
  } catch (err) {
    return { id: item.id, fallback: String(err?.message || err), ...disc(n, 7 + index) };
  }
}

// Grown once per session (module level) by n and picture: a ring destroyed and made again as the page
// scrolls reuses them. A plain-disc fallback or an aborted job is not kept, so the next mount retries.
const grown = new Map();

/**
 * Loads and grows every shape. `list` = [{ id, src, kind, key? }] in morph order; `key` names a shape
 * for the cache when its src is not stable (a canvas data URL can differ by a few bytes between draws).
 * `work` is a work.js pool; `onFallback(msg)` hears about main-thread fallbacks.
 * Resolves to [{ id, pos, nrm, tone, box, fallback? }]; rejects { aborted: true } if the pool aborts.
 */
export function loadShapes(list, n, { work, onFallback = () => {} } = {}) {
  return Promise.all(
    list.map((item, index) => {
      const key = `${n}|${index}|${item.kind}|${item.key ?? item.src}`;
      if (!grown.has(key)) {
        const job = work
          ? work.run({ kind: 'shape', item: { id: item.id, src: item.src, kind: item.kind }, n, index })
          : Promise.reject(new Error('no worker pool'));
        const p = job.catch((err) => {
          if (err?.aborted) throw err; // the figure went: no main-thread fallback
          onFallback(`shape ${item.id}: worker failed (${err?.message || err}), growing it on the main thread`);
          return growHere(item, n, index);
        });
        grown.set(key, p);
        p.then(
          (s) => {
            if (s.fallback) {
              grown.delete(key);
              onFallback(`shape ${item.id} did not load (${s.fallback}), showing a plain disc`);
            }
          },
          () => grown.delete(key),
        );
      }
      return grown.get(key);
    }),
  );
}
