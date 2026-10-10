// Ported from BTTRURSLF-v2 src/screens/shop/hub/textures.js, the ring stone part only (prepareStone and
// stoneMaps): the frost, star and blurred-text textures belong to other hub stages and are not here.
// Changed: the bytes become DataTextures directly instead of being painted onto canvases first, so the
// only DOM-free path is also the only path; the worker job runs on the figure's own pool (work.js) and a
// worker failure is reported through `onFallback` (the figure's ctx.log) before growing on the page.
import * as THREE from 'three';
import { stoneData } from './noise.js';

// Session cache of the stone's bytes (pure data, ~2 MB at 512 px): a ring made again after the page
// scrolled away and back wraps them in new textures without regrowing them.
const stones = new Map();

/** The stone's bytes for (seed, size), grown in the pool's worker once per session. */
export function prepareStone(seed = 5, size = 512, { work, onFallback = () => {} } = {}) {
  const key = `${seed}|${size}`;
  if (!stones.has(key)) {
    const job = work ? work.run({ kind: 'stone', seed, size }) : Promise.reject(new Error('no worker pool'));
    const p = job.catch((err) => {
      if (err?.aborted) throw err;
      onFallback(`stone: worker failed (${err?.message || err}), growing it on the main thread`);
      return stoneData(seed, size);
    });
    stones.set(key, p);
    p.catch(() => stones.delete(key));
  }
  return stones.get(key);
}

/** The ring's stone (grain, pits with lips, scratches; tiles) as a normal map and a roughness map. */
export function stoneMaps({ size, normal, rough }) {
  const tex = (bytes) => {
    const t = new THREE.DataTexture(bytes, size, size, THREE.RGBAFormat);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.NoColorSpace;
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true;
    t.anisotropy = 8;
    t.needsUpdate = true;
    return t;
  };
  return { normal: tex(normal), roughness: tex(rough) };
}
