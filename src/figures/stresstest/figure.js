// The Stress Test track figure: recorded clips of the tool (sketch, simulate, chaos and advice), then a small
// live view of one example architecture under rising load, from the simulator's own exported results.
import { createClips } from '../clips.js';

export const create = (stage, ctx) =>
  createClips(stage, ctx, { base: import.meta.env.BASE_URL + 'captures/stress-test', demoStage: ctx.stages - 1, demo: () => import('./demo.js') });
