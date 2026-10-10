// Ported from BTTRURSLF-v2 src/screens/shop/hub/hubWorker.js: the ring figure's heavy pure work off
// the main thread (work.js), so growing ~48k particles per shape never stalls a scrolling page.
//   shape  one particle shape (tubeShapes.js growOne). Changed: one shape per job instead of the whole
//          list, so the four shapes grow in parallel workers.
//   stone  the ring stone's normal and roughness bytes (noise.js stoneData), unchanged.
// The arrays come back transferred.
import { growOne } from './tubeShapes.js';
import { stoneData } from './noise.js';

self.onmessage = async (e) => {
  const m = e.data;
  try {
    if (m.kind === 'shape') {
      const s = await growOne(m.item, m.n, m.index);
      self.postMessage({ result: s }, [s.pos.buffer, s.nrm.buffer, s.tone.buffer]);
    } else if (m.kind === 'stone') {
      const d = stoneData(m.seed, m.size);
      self.postMessage({ result: d }, [d.normal.buffer, d.rough.buffer]);
    } else throw new Error(`unknown job ${m.kind}`);
  } catch (err) {
    self.postMessage({ error: String(err?.message || err) });
  }
};
