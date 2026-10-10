// Ported from HowPolluted src/screens/scene/litter-sim.js at 80f6d06 (Warren's own project). Changes: none (this header only).
// Where each piece of litter lands, so the pile covers exactly the share of
// the ground the estimate gives (the picture must not contradict the card).
// Pure and seeded: same estimate, same pile. Perspective is the only rule of
// placement - pieces nearer the horizon are drawn smaller - and coverage is
// measured the same way: a sprite's opaque area (w * h * fill, `fill` measured
// by art-src/tools/cutout.mjs) at its drawn scale, over the ground's area.
//
// ground: { x0?, w, top, bottom } in the scene's pixels (the band below the
// horizon); sprites: manifest entries { w, h, fill, anchor }.
const BUDGET = 1200;
const NEAR_LONG_SIDE = 0.075; // a piece's long side at the front edge, as a share of the width
const FAR_SCALE = 0.32; // ... and how much smaller it is at the horizon

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const depth = (y, g) => (y - g.top) / (g.bottom - g.top);
const areaOf = (s, scale) => s.w * s.h * (s.fill ?? 0.6) * scale * scale;

export function pileCoverage(items, ground) {
  const groundArea = ground.w * (ground.bottom - ground.top);
  return (items.reduce((sum, it) => sum + areaOf(it.sprite, it.scale), 0) / groundArea) * 100;
}

export function planPile(coveragePct, ground, sprites, seed = 1) {
  if (!(coveragePct > 0) || !sprites.length) return [];
  const rnd = mulberry32(seed);
  const groundArea = ground.w * (ground.bottom - ground.top);
  const target = (Math.min(coveragePct, 100) / 100) * groundArea;
  let sizeK = 1;
  for (;;) {
    const items = [];
    let covered = 0;
    while (covered < target && items.length < BUDGET) {
      const sprite = sprites[Math.floor(rnd() * sprites.length)];
      const y = ground.top + rnd() * (ground.bottom - ground.top);
      const near = (NEAR_LONG_SIDE * ground.w * sizeK) / Math.max(sprite.w, sprite.h);
      let scale = near * (FAR_SCALE + (1 - FAR_SCALE) * depth(y, ground));
      const a = areaOf(sprite, scale);
      // The last piece is sized to land the total exactly on the target.
      if (covered + a > target) scale *= Math.sqrt(Math.max(0.15, (target - covered) / a));
      covered += areaOf(sprite, scale);
      items.push({
        sprite,
        x: (ground.x0 || 0) + rnd() * ground.w,
        y,
        scale,
        rot: (rnd() - 0.5) * 1.1,
        flip: rnd() < 0.5,
        t: rnd(),
      });
    }
    if (covered >= target * 0.97 || sizeK > 8) return items.sort((p, q) => p.y - q.y);
    sizeK *= 1.5; // out of budget: bigger pieces, same coverage rule
  }
}
