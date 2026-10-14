// The Drift track figure: recorded clips of the Drift site (the scroll story, the globe, Salish Sea mode),
// then a small flat chart of fragments the Drift model itself moved, replayed from precomputed output.
import { createClips } from '../clips.js';

export const create = (stage, ctx) =>
  createClips(stage, ctx, { base: import.meta.env.BASE_URL + 'captures/drift', demoStage: ctx.stages - 1, demo: () => import('./demo.js') });
