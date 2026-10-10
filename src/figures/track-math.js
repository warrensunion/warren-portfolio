// The pure half of the scroll tracks (spec section 3): rect reads in, progress, stage and scroll offsets
// out. Desktop progress runs over the rail's pinned stretch; a phone has no pin, so progress follows the
// figure's own trip through the viewport, over yuzeli.ca's measured figure-intro range (top 85% to
// centre 45%).

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

// railTop: the rail's top in viewport px. pad: the rail's padding-bottom, the length of the pinned stretch.
export function deskProgress({ railTop, pad, top = 96 }) {
  if (!(pad > 0)) return 0;
  return clamp01((top - railTop) / pad);
}

export function phoneProgress({ figTop, figH, vh }) {
  const start = 0.85 * vh; // figure top here: 0
  const end = 0.45 * vh - figH / 2; // figure centre at 45%: 1
  return clamp01((start - figTop) / (start - end));
}

// A stage only changes once progress has crossed the midpoint between two stages by 4% of a stage, so
// a visitor resting near a boundary never sees the figure flick back and forth.
const BAND = 0.04;
export function stageFor(p, n, prev) {
  if (n <= 1) return 0;
  const x = p * (n - 1);
  const s = Math.round(x);
  if (s === prev || !Number.isInteger(prev)) return s;
  const mid = prev + (s > prev ? 0.5 : -0.5);
  return Math.abs(x - mid) < BAND && Math.abs(s - prev) === 1 ? prev : s;
}

// Px into the rail's pinned stretch where stage i sits.
export const stageOffset = (i, n, pad) => (n <= 1 ? 0 : (pad * i) / (n - 1));
