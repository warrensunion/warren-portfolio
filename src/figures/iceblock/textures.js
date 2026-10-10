// Ported from BTTRURSLF-v2 src/screens/shop/hub/textures.js (the BTTRshop hub). What changed and why:
// only the frost maps came across. The star glints, the blurred background words and the ring stone
// are gone because the figures sit on paper fog with no glints and no text behind them. The canvas
// cache stays: a figure scrolled away is destroyed and rebuilt, and it should not redraw its noise.

/**
 * The ice's textures, drawn on canvases at start-up - no image files.
 *
 * igloo ships `frost-datatexture`, `cube*_normal`, `cube*_roughness` as files; ours are generated
 * because they are noise, cheaper to draw (~40 ms) than to download, and seeded so every visit looks
 * the same. Noise is periodic so the maps tile on the blocks' box-projected UVs without a seam.
 */

import * as THREE from 'three';
import { rng, makeNoise } from './noise.js';
import { nextTask } from '../warm.js';

export { rng };

// Every generated canvas is kept for the session (module level). The GPU textures are disposed with
// each figure; the pixels they came from are drawn once.
const canvases = new Map();
/** A canvas (or a promise of canvases) drawn once per session by `draw()` under `key`. */
export function cachedCanvas(key, draw) {
  if (!canvases.has(key)) canvases.set(key, draw());
  return canvases.get(key);
}

/** Frost height: cloudy fbm plus thin crack ridges (|noise - .5| near 0). */
async function frostField(size, seed) {
  const n1 = makeNoise(seed, 4);
  const n2 = makeNoise(seed + 7, 3);
  const h = new Float32Array(size * size);
  const crack = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    if (y && y % 64 === 0) await nextTask(); // a quarter of the field per task
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const cloud = n1(u, v, 6);
      const c = Math.abs(n2(u, v, 4) - 0.5);
      const k = Math.max(0, 1 - c / 0.022);
      h[y * size + x] = cloud;
      crack[y * size + x] = k * k;
    }
  }
  return { h, crack };
}

function canvasOf(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/**
 * Roughness (G channel, three reads green) from clear 0.05 to milky 0.6,
 * and a normal map from the same field with the cracks cut in as grooves.
 */
export async function frostMaps(seed = 11, size = 256) {
  // The cache holds the promise, so blocks built while the first is still drawing share its pixels.
  const { rc, nc, tc } = await cachedCanvas(`frost|${seed}|${size}`, () => frostCanvases(seed, size));
  const tex = (c) => {
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.NoColorSpace;
    t.anisotropy = 4;
    return t;
  };
  return { roughness: tex(rc), normal: tex(nc), thickness: tex(tc) };
}

// Drawn in three slices with a task between them (added for the page): in one piece the ~150 ms of
// noise was a long task while the hero was loading. Same pixels either way.
async function frostCanvases(seed, size) {
  const { h, crack } = await frostField(size, seed);
  await nextTask();
  const rc = canvasOf(size, size);
  const nc = canvasOf(size, size);
  const rimg = rc.getContext('2d').createImageData(size, size);
  const nimg = nc.getContext('2d').createImageData(size, size);
  const height = (x, y) => {
    const i = ((y + size) % size) * size + ((x + size) % size);
    return h[i] * 1.0 - crack[i] * 0.9;
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      // Milky where the cloud is dense, clear elsewhere; cracks are milky.
      const m = Math.min(1, Math.max(0, (h[i] - 0.45) / 0.3) + crack[i] * 0.6);
      const rough = 0.04 + m * 0.56;
      rimg.data[i * 4 + 0] = rimg.data[i * 4 + 1] = rimg.data[i * 4 + 2] = Math.round(rough * 255);
      rimg.data[i * 4 + 3] = 255;
      const dx = (height(x + 1, y) - height(x - 1, y)) * 2.2;
      const dy = (height(x, y + 1) - height(x, y - 1)) * 2.2;
      const l = Math.hypot(dx, dy, 1);
      nimg.data[i * 4 + 0] = Math.round((-dx / l * 0.5 + 0.5) * 255);
      nimg.data[i * 4 + 1] = Math.round((dy / l * 0.5 + 0.5) * 255);
      nimg.data[i * 4 + 2] = Math.round((1 / l * 0.5 + 0.5) * 255);
      nimg.data[i * 4 + 3] = 255;
    }
  }
  rc.getContext('2d').putImageData(rimg, 0, 0);
  nc.getContext('2d').putImageData(nimg, 0, 0);
  await nextTask();
  // Thickness (G): broad slow blobs, 0.25..1, so some parts of a block look
  // through a lot more ice than others - igloo's dark blue-grey patches.
  const tc = canvasOf(size, size);
  const timg = tc.getContext('2d').createImageData(size, size);
  const n3 = makeNoise(seed + 19, 2);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const v = 0.25 + 0.75 * Math.min(1, Math.max(0, (n3(x / size, y / size, 3) - 0.3) / 0.45));
      timg.data[i * 4] = timg.data[i * 4 + 1] = timg.data[i * 4 + 2] = Math.round(v * 255);
      timg.data[i * 4 + 3] = 255;
    }
  }
  tc.getContext('2d').putImageData(timg, 0, 0);
  return { rc, nc, tc };
}
