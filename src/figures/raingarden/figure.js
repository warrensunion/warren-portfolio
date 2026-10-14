// The Raingarden track figure: recorded clips of the app reading a yard, running a storm and designing the
// garden, then a before/after of the same storm without and with the garden, for the visitor to drag.
import { createClips } from '../clips.js';

export const create = (stage, ctx) =>
  createClips(stage, ctx, { base: import.meta.env.BASE_URL + 'captures/raingarden', demoStage: ctx.stages - 1, demo: () => import('./demo.js') });
