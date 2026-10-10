// Ported from terrarium src/sim/species.js at 7612a40 (Warren's own project). Changes: none but this header.
/**
 * Species are what the river and the colours show, so they must be stable
 * from one re-speciation to the next: previous species are tried first and
 * in order, keep their id, hue and birth tick, and only then do new ones
 * appear. A continuing species takes a random current member as its next
 * representative so it can drift with its members instead of being pinned
 * to a long-dead ancestor.
 *
 * New hues step by the golden angle from the newest species, which keeps
 * any handful of live species visually far apart without a palette table.
 */
import { distance } from './neat.js';

const GOLDEN = 137.5;
const FIRST_HUE = 160;

export function speciate(pop, prev, threshold, rng, nextId, tick = 0) {
  const all = prev.map((s) => ({ id: s.id, rep: s.rep, members: [], genomes: [], hue: s.hue, born: s.born }));
  let lastHue = prev.length ? prev[prev.length - 1].hue : null;

  for (const p of pop) {
    let home = null;
    for (const s of all) {
      if (distance(p.genome, s.rep) < threshold) {
        home = s;
        break;
      }
    }
    if (!home) {
      const hue = lastHue === null ? FIRST_HUE : (lastHue + GOLDEN) % 360;
      lastHue = hue;
      home = { id: nextId(), rep: p.genome, members: [], genomes: [], hue, born: tick, fresh: true };
      all.push(home);
    }
    home.members.push(p.id);
    home.genomes.push(p.genome);
  }

  const out = [];
  for (const s of all) {
    if (!s.members.length) continue;
    const rep = s.fresh ? s.rep : s.genomes[rng.int(s.genomes.length)];
    out.push({ id: s.id, rep, members: s.members, hue: s.hue, born: s.born });
  }
  return out;
}

/**
 * Steers the species count into [lo, hi]. A higher threshold merges, so too
 * many species raise it and too few lower it. (The shared contract wrote the
 * factors the other way round; that is a positive feedback loop that ends
 * with one species, so the direction here is the stabilising one.)
 */
export function adjustThreshold(t, count, lo = 6, hi = 14) {
  if (count > hi) t *= 1.1;
  else if (count < lo) t *= 0.9;
  return Math.min(12, Math.max(0.5, t));
}
