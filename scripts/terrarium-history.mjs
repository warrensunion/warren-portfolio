// The Terrarium track's streamgraph has to scrub both ways with scroll, but the live jar only runs
// forward. So the history is recorded here, in Node, from the same seed, count and CPU sensor the jar's
// worker uses (the sim is deterministic on the CPU, scripts/test-terrarium.mjs pins it): a census every
// 120 steps for 3,600 steps, in the shape the river takes. It also picks the lineage the brain stage
// features: the most numerous species at the end and its member furthest down its line (highest
// generation, then oldest), followed back through its first parents to a gen-0 founder, whose genome at
// birth is kept so the figure can show the brain the line started with beside the one it has now.
// Usage: node scripts/terrarium-history.mjs   (writes public/terrarium/history.json)
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createWorld, packFrame } from '../src/figures/terrarium/sim/world.js';

export const HISTORY_CONFIG = { seed: 20261010, count: 300, params: { foodRate: 1.3 }, steps: 3600, every: 120 };

const census = (stats) => ({
  tick: stats.tick,
  maxGen: stats.generation,
  pop: stats.population,
  species: stats.species.map(([id, count, hue]) => [id, count, Math.round(hue * 10) / 10]),
});

export function recordHistory({ seed, count, params, steps, every } = HISTORY_CONFIG) {
  const w = createWorld({ seed, count, params });
  // Genomes are copied on every mutation and never edited in place, so holding the founders' is enough.
  const founders = new Map(w.creatures.map((c) => [c.id, c.genome]));
  const samples = [census(packFrame(w, null, -1).stats)];
  for (let t = 1; t <= steps; t++) {
    w.step();
    if (t % every === 0) samples.push(census(packFrame(w, null, -1).stats));
  }
  const end = samples[samples.length - 1];
  const top = [...end.species].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];
  const members = w.creatures.filter((c) => c.species === top[0]);
  // the member furthest down its line: the highest generation, then the oldest
  const member = members.sort((a, b) => b.generation - a.generation || b.age - a.age || a.id - b.id)[0];
  let root = member.id;
  for (let p = w.parentOf.get(root); p !== undefined; p = w.parentOf.get(p)) root = p;
  if (!founders.has(root)) throw new Error(`lineage of ${member.id} ends at ${root}, not a gen-0 founder`);
  return {
    seed,
    count,
    params,
    steps,
    every,
    maxGen: Math.max(...samples.map((s) => s.maxGen)),
    samples,
    featured: {
      speciesId: top[0],
      hue: top[2],
      memberId: member.id,
      memberGen: member.generation,
      lineageRootId: root,
      gen0Genome: founders.get(root),
    },
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const t0 = performance.now();
  const h = recordHistory();
  const ms = performance.now() - t0;
  const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public/terrarium/history.json');
  const json = JSON.stringify(h);
  writeFileSync(out, json + '\n');
  const last = h.samples[h.samples.length - 1];
  console.log(
    `history: ${h.samples.length} samples, max gen ${h.maxGen}, at ${last.tick}: gen ${last.maxGen}, ${last.pop} alive, ` +
      `${last.species.length} species; featured species ${h.featured.speciesId} from founder ${h.featured.lineageRootId}; ` +
      `${json.length} bytes in ${(ms / 1000).toFixed(1)} s`,
  );
}
