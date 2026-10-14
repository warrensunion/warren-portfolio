// The Ghostline track figure: recorded clips only (a round of play, the ghost training, the duel and its
// saliency heat). The game itself is one click away on its live demo.
import { createClips } from '../clips.js';

export const create = (stage, ctx) => createClips(stage, ctx, { base: import.meta.env.BASE_URL + 'captures/ghostline' });
