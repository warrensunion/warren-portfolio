// Ported from terrarium src/sim/world.js at 7612a40 (Warren's own project). Changes: none but this header.
/**
 * The ecology. Pure and seeded (no DOM, no clock, no Math.random), so the
 * same seed replays bit for bit and the whole thing is testable in node.
 *
 * A step is sense → think → act → metabolise → die → be born → regrow, at
 * a fixed dt of 1/60 s; the renderer just asks for 1, 4 or 16 of them per
 * frame. With 600 creatures and up to 16 steps a frame the hot path must
 * not allocate: positions are snapshotted into one Float32Array, space is
 * indexed by grids in preallocated typed arrays (sense-cpu.js), brains are
 * compiled at birth, and the live list is compacted in place. Objects are
 * only created for births, deaths and every-120-step re-speciation.
 *
 * Sensing is injectable (`sensor`): the worker swaps the CPU grid for a
 * WebGPU compute pass that writes the same six inputs a few steps late.
 *
 * The population is seeded from 8 founder genomes rather than 600 unrelated
 * ones. Each founder is a weak hand-wired instinct (steer toward food,
 * walk, eat, mate when fed) plus heavy per-founder noise: random brains
 * almost never find food, and the jar starved to the floor within ten
 * seconds before selection could act. The noise makes the founders differ
 * (δ ≈ 0.7, above the 0.5 starting threshold), so the jar opens with a
 * handful of distinct species that then compete. A floor of 60 is kept by
 * asexual budding from good gatherers, so the world never dies.
 *
 * Food regrows at foodRate·6 pellets per step (360/s at 1x). The contract
 * said per second, but 1.5 energy/s feeds about ten creatures; per step
 * holds roughly 400-800 at foodRate 1, which is what the jar is for.
 *
 * Creature flags (STRIDE field 8): 1 wants to eat, 2 wants to mate,
 * 4 ate within the last 16 steps, 8 mated within the last 16 steps; the
 * window is long enough that a 16x frame still sees the event.
 */
import { createRng } from './rng.js';
import { N_IN, createTracker, createGenome, mutate, crossover, createBrain } from './neat.js';
import { speciate, adjustThreshold } from './species.js';
import { randomBodyGenes, mutateBodyGenes, crossBodyGenes, bodyFromGenes } from './genes.js';
import { senseCPU, createGrid, buildGrid, cellCoord, GRID_N } from './sense-cpu.js';

export const STRIDE = 10;
export const DT = 1 / 60;
export const FLOOR = 60;
export const MAX_CREATURES = 2000;
// births stop here: past ~1000 the main thread spends more than half a
// laptop frame animating legs, and a jar this full reads as noise anyway
export const POP_CAP = 1000;
export const FOOD_MAX = 900;
export const FOOD_PER_STEP = 6; // × foodRate
const EAT_R = 0.02;
const MATE_R = 0.03;
const MATE_MIN = 0.55;
const MATE_COST = 0.25;
const FOOD_GAIN = 0.25;
const MAX_AGE = 90;
const RESPECIATE = 120;
const FLAG_WINDOW = 16;
const FOUNDERS = 8;
const FOUNDER_NOISE = 1.5;
const START_THRESHOLD = 0.5;
// founder instinct, [from, to, w]: steer toward food, walk, eat, mate when fed
const INSTINCT = [[0, 9, 2.5], [8, 10, 0.8], [1, 10, 0.8], [8, 11, 1.5], [6, 12, 2], [8, 12, -1]];
const LINEAGE = 12;

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

function cleanParams(p) {
  return {
    foodRate: clamp(+p.foodRate, 0, 3),
    mutationRate: clamp(+p.mutationRate, 0, 1),
    temperature: clamp(+p.temperature, 0, 1),
  };
}

export function createWorld({ seed = 1, count = 600, params = {}, sensor = senseCPU, idBase = 0 } = {}) {
  const rng = createRng(seed);
  const tracker = createTracker();
  let nextId = idBase + 1;
  let nextSpecies = 1;
  let threshold = START_THRESHOLD;
  count = clamp(Math.floor(count), FLOOR, MAX_CREATURES);

  const snap = new Float32Array(MAX_CREATURES * 3);
  const food = new Float32Array(FOOD_MAX * 3);
  const freeFood = new Int32Array(FOOD_MAX);
  let freeTop = 0;
  let foodAcc = 0;
  const creatureGrid = createGrid(MAX_CREATURES);
  const foodGrid = createGrid(FOOD_MAX);
  const born = [];
  const pt = { x: 0, y: 0 };
  const parentOf = new Map();

  // three fixed food patches, so there is somewhere worth going
  const patches = [];
  const a0 = rng.next() * Math.PI * 2;
  for (let k = 0; k < 3; k++) {
    const a = a0 + (k * Math.PI * 2) / 3 + rng.range(-0.4, 0.4);
    const r = rng.range(0.35, 0.65);
    patches.push([Math.cos(a) * r, Math.sin(a) * r]);
  }

  const world = {
    tick: 0,
    creatures: [],
    food,
    species: [],
    generation: 0,
    params: cleanParams({ foodRate: 1, mutationRate: 0.3, temperature: 0.5, ...params }),
    sensor,
    snap,
    creatureGrid,
    foodGrid,
    births: [], // { tick, id, body, genes, species, generation, parents }, drained by packFrame
    deaths: [], // { tick, id }
    parentOf,
    step,
    indexSpace,
    setParams(p) {
      world.params = cleanParams({ ...world.params, ...p });
    },
    /**
     * Test hook: the creature dies at the next step through the normal
     * death path. Age is set too, because eating could refill the energy.
     */
    kill(id) {
      const c = world.creatures.find((q) => q.id === id);
      if (!c) return false;
      c.energy = 0;
      c.age = MAX_AGE;
      return true;
    },
    /** Newest id handed out; a reset world starts after it (idBase). */
    get lastId() {
      return nextId - 1;
    },
  };

  // founders: a few distinct lineages
  const founders = [];
  for (let k = 0; k < FOUNDERS; k++) {
    const g = createGenome(rng, tracker);
    for (const c of g.conns) {
      const inst = INSTINCT.find(([from, to]) => from === c.from && to === c.to);
      c.w = (inst ? inst[2] : 0) + rng.normal() * FOUNDER_NOISE;
    }
    founders.push({ genome: g, genes: randomBodyGenes(rng) });
  }

  for (let i = 0; i < count; i++) {
    const f = founders[i % FOUNDERS];
    const rate = world.params.mutationRate;
    const { x, y } = discPoint(0.9);
    const c = makeCreature(mutate(f.genome, rng, tracker, rate), mutateBodyGenes(f.genes, rng, rate), x, y, 0, [], 0);
    c.energy = rng.range(0.5, 1);
    c.age = rng.range(0, MAX_AGE / 2); // staggered, so old age doesn't come in one wave
    world.creatures.push(c);
    born.push(c);
  }
  for (let i = 0; i < (FOOD_MAX * 2) / 3; i++) spawnFood(i);
  for (let i = FOOD_MAX - 1; i >= (FOOD_MAX * 2) / 3; i--) freeFood[freeTop++] = i;
  respeciate(0);
  logBirths(0);
  world.generation = 0;

  /** Uniform point in the disc, left in pt (food regrowth calls this every step). */
  function discPoint(rmax) {
    const r = Math.sqrt(rng.next()) * rmax;
    const a = rng.next() * Math.PI * 2;
    pt.x = Math.cos(a) * r;
    pt.y = Math.sin(a) * r;
    return pt;
  }

  function spawnFood(slot) {
    let x, y;
    if (rng.next() < 0.65) {
      const p = patches[rng.int(3)];
      x = p[0] + rng.normal() * 0.16;
      y = p[1] + rng.normal() * 0.16;
      const r = Math.hypot(x, y);
      if (r > 0.96) { x *= 0.96 / r; y *= 0.96 / r; }
    } else {
      ({ x, y } = discPoint(0.96));
    }
    food[slot * 3] = x;
    food[slot * 3 + 1] = y;
    food[slot * 3 + 2] = 1;
  }

  function makeCreature(genome, genes, x, y, generation, parents, species) {
    const body = bodyFromGenes(genes);
    const inputs = new Float32Array(N_IN);
    inputs[2] = 1; // nothing sensed yet
    inputs[5] = 1;
    const c = {
      id: nextId++, x, y, heading: rng.range(-Math.PI, Math.PI), speed: 0, energy: 0.5, age: 0,
      genome, body: genes, brain: createBrain(genome), species, generation, parents, gathered: 0, flags: 0,
      // derived and scratch, kept on the object so the step allocates nothing
      radius: body.radius, segments: body.segments, sizeGene: genes.size, derived: body, inputs,
      turn: 0, thrust: 0, wantEat: 0, wantMate: 0, ateAt: -1e9, matedAt: -1e9,
    };
    if (parents.length) parentOf.set(c.id, parents[0]);
    return c;
  }

  function logBirths(t) {
    for (const c of born) {
      world.births.push({ tick: t, id: c.id, body: c.derived, genes: c.body, species: c.species, generation: c.generation, parents: c.parents });
    }
    born.length = 0;
  }

  /** Snapshot positions and rebuild both grids; sensors read these. */
  function indexSpace() {
    const cs = world.creatures;
    for (let i = 0; i < cs.length; i++) {
      const c = cs[i];
      snap[i * 3] = c.x;
      snap[i * 3 + 1] = c.y;
      snap[i * 3 + 2] = c.heading;
    }
    buildGrid(creatureGrid, snap, cs.length, false);
    buildGrid(foodGrid, food, FOOD_MAX, true);
  }

  function respeciate(t) {
    const cs = world.creatures;
    const pop = cs.map((c) => ({ id: c.id, genome: c.genome }));
    world.species = speciate(pop, world.species, threshold, rng, () => nextSpecies++, t);
    const sid = new Map();
    for (const s of world.species) for (const id of s.members) sid.set(id, s.id);
    for (const c of cs) c.species = sid.get(c.id);
    threshold = adjustThreshold(threshold, world.species.length);
  }

  function step() {
    const t = world.tick + 1;
    const cs = world.creatures;
    const n = cs.length;
    const { foodRate, mutationRate, temperature } = world.params;
    const tempCost = 0.0006 * Math.abs(temperature - 0.5);

    indexSpace();
    if (world.sensor) world.sensor(world);

    // think
    for (let i = 0; i < n; i++) {
      const c = cs[i];
      const inp = c.inputs;
      inp[6] = c.energy;
      inp[7] = 1 - Math.sqrt(c.x * c.x + c.y * c.y);
      const o = c.brain.activate(inp);
      c.turn = o[0];
      c.thrust = o[1];
      c.wantEat = o[2];
      c.wantMate = o[3];
    }

    // act
    for (let i = 0; i < n; i++) {
      const c = cs[i];
      let h = c.heading + c.turn * 3.0 * DT;
      if (h > Math.PI) h -= 2 * Math.PI;
      else if (h < -Math.PI) h += 2 * Math.PI;
      c.heading = h;
      c.speed = (c.thrust > 0 ? c.thrust : 0) * 0.25;
      let x = c.x + Math.cos(h) * c.speed * DT;
      let y = c.y + Math.sin(h) * c.speed * DT;
      const r = Math.sqrt(x * x + y * y);
      const rmax = 1 - c.radius;
      if (r > rmax) { x *= rmax / r; y *= rmax / r; }
      c.x = x;
      c.y = y;
      if (c.wantEat > 0) eat(c, t);
      if (c.wantMate > 0 && c.energy > MATE_MIN && c.matedAt !== t) mate(c, i, t, mutationRate);
    }

    // metabolise, age, die; compact the live list in place
    let w = 0;
    let gen = 0;
    for (let i = 0; i < n; i++) {
      const c = cs[i];
      const cost = (0.0009 * (1 + c.radius / 0.02) * (0.3 + c.speed / 0.25) + 0.00015 * c.segments + tempCost) * (1 + c.sizeGene);
      c.energy = c.energy - cost > 0 ? c.energy - cost : 0;
      c.age += DT;
      if (c.energy <= 0 || c.age > MAX_AGE) {
        world.deaths.push({ tick: t, id: c.id });
        continue;
      }
      c.flags = (c.wantEat > 0 ? 1 : 0) | (c.wantMate > 0 ? 2 : 0) | (t - c.ateAt < FLAG_WINDOW ? 4 : 0) | (t - c.matedAt < FLAG_WINDOW ? 8 : 0);
      if (c.generation > gen) gen = c.generation;
      cs[w++] = c;
    }
    cs.length = w;
    for (const c of born) {
      cs.push(c);
      if (c.generation > gen) gen = c.generation;
    }

    // budding floor
    let fresh = false;
    while (cs.length < FLOOR) {
      const c = cs.length ? bud(cs, mutationRate) : spawnFresh(mutationRate);
      if (!c.parents.length) fresh = true;
      cs.push(c);
      born.push(c);
      if (c.generation > gen) gen = c.generation;
    }
    world.generation = gen;

    // regrow food
    foodAcc += foodRate * FOOD_PER_STEP;
    while (foodAcc >= 1 && freeTop > 0) {
      spawnFood(freeFood[--freeTop]);
      foodAcc -= 1;
    }
    if (freeTop === 0 && foodAcc > 1) foodAcc = 1;

    world.tick = t;
    if (t % RESPECIATE === 0 || fresh) respeciate(t);
    logBirths(t);
    if (world.births.length > 20000) world.births.splice(0, world.births.length - 20000);
    if (world.deaths.length > 20000) world.deaths.splice(0, world.deaths.length - 20000);
    if (parentOf.size > 100000) {
      let drop = 20000;
      for (const id of parentOf.keys()) { parentOf.delete(id); if (--drop === 0) break; }
    }
  }

  function eat(c, t) {
    const { start, items } = foodGrid;
    const cx = cellCoord(c.x), cy = cellCoord(c.y);
    let best = -1, bestD2 = EAT_R * EAT_R;
    for (let gy = cy - 1; gy <= cy + 1; gy++) {
      if (gy < 0 || gy >= GRID_N) continue;
      for (let gx = cx - 1; gx <= cx + 1; gx++) {
        if (gx < 0 || gx >= GRID_N) continue;
        const k = gy * GRID_N + gx;
        for (let s = start[k], e = start[k + 1]; s < e; s++) {
          const j = items[s];
          if (!(food[j * 3 + 2] > 0)) continue; // already eaten this step
          const dx = food[j * 3] - c.x, dy = food[j * 3 + 1] - c.y;
          const d2 = dx * dx + dy * dy;
          if (d2 <= bestD2) { bestD2 = d2; best = j; }
        }
      }
    }
    if (best < 0) return;
    food[best * 3 + 2] = 0;
    freeFood[freeTop++] = best;
    c.energy = Math.min(1, c.energy + FOOD_GAIN);
    c.gathered += FOOD_GAIN;
    c.ateAt = t;
  }

  function mate(c, i, t, rate) {
    if (world.creatures.length + born.length >= POP_CAP) return;
    const cs = world.creatures;
    const { start, items } = creatureGrid;
    const x = snap[i * 3], y = snap[i * 3 + 1];
    const cx = cellCoord(x), cy = cellCoord(y);
    for (let gy = cy - 1; gy <= cy + 1; gy++) {
      if (gy < 0 || gy >= GRID_N) continue;
      for (let gx = cx - 1; gx <= cx + 1; gx++) {
        if (gx < 0 || gx >= GRID_N) continue;
        const k = gy * GRID_N + gx;
        for (let s = start[k], e = start[k + 1]; s < e; s++) {
          const j = items[s];
          if (j === i) continue;
          const p = cs[j];
          if (p.species !== c.species || p.wantMate <= 0 || p.energy <= MATE_MIN || p.matedAt === t) continue;
          const dx = snap[j * 3] - x, dy = snap[j * 3 + 1] - y;
          if (dx * dx + dy * dy > MATE_R * MATE_R) continue;
          c.energy -= MATE_COST;
          p.energy -= MATE_COST;
          c.matedAt = p.matedAt = t;
          const [fit, other] = p.gathered > c.gathered ? [p, c] : [c, p];
          const genome = mutate(crossover(fit.genome, other.genome, rng), rng, tracker, rate);
          const genes = mutateBodyGenes(crossBodyGenes(fit.body, other.body, rng), rng, rate);
          const child = makeCreature(genome, genes, (c.x + p.x) / 2 + rng.normal() * 0.004, (c.y + p.y) / 2 + rng.normal() * 0.004,
            Math.max(fit.generation, other.generation) + 1, [fit.id, other.id], c.species);
          child.energy = 2 * MATE_COST;
          inDisc(child);
          born.push(child);
          return;
        }
      }
    }
  }

  function inDisc(c) {
    const r = Math.sqrt(c.x * c.x + c.y * c.y), rmax = 1 - c.radius;
    if (r > rmax) { c.x *= rmax / r; c.y *= rmax / r; }
  }

  /** Asexual rescue: copy the best gatherer of three random picks. */
  function bud(cs, rate) {
    let parent = cs[rng.int(cs.length)];
    for (let k = 0; k < 2; k++) {
      const q = cs[rng.int(cs.length)];
      if (q.gathered > parent.gathered) parent = q;
    }
    const child = makeCreature(mutate(parent.genome, rng, tracker, rate), mutateBodyGenes(parent.body, rng, rate),
      parent.x + rng.normal() * 0.01, parent.y + rng.normal() * 0.01, parent.generation + 1, [parent.id], parent.species);
    child.energy = 0.6;
    inDisc(child);
    return child;
  }

  /** Only if everyone died at once: start a founder line again. */
  function spawnFresh(rate) {
    const f = founders[rng.int(FOUNDERS)];
    const { x, y } = discPoint(0.9);
    const c = makeCreature(mutate(f.genome, rng, tracker, rate), mutateBodyGenes(f.genes, rng, rate), x, y, 0, [], 0);
    c.energy = 0.6;
    return c;
  }

  return world;
}

/**
 * The worker → main frame. Births and deaths after `sinceTick` are included
 * and then dropped from the world's log (the caller has them now). `dead`
 * is the inspected id whenever that creature is not alive; the caller stops
 * inspecting it, so the UI hears about the death once.
 */
export function packFrame(world, inspectId, sinceTick) {
  const cs = world.creatures;
  const creatures = new Float32Array(cs.length * STRIDE);
  const count = new Map();
  for (let i = 0; i < cs.length; i++) {
    const c = cs[i];
    const o = i * STRIDE;
    creatures[o] = c.id;
    creatures[o + 1] = c.x;
    creatures[o + 2] = c.y;
    creatures[o + 3] = c.heading;
    creatures[o + 4] = c.speed;
    creatures[o + 5] = c.energy;
    creatures[o + 6] = c.species;
    creatures[o + 7] = c.age;
    creatures[o + 8] = c.flags;
    creatures[o + 9] = c.generation;
    count.set(c.species, (count.get(c.species) || 0) + 1);
  }
  const births = [];
  for (const b of world.births) {
    if (b.tick > sinceTick) births.push({ id: b.id, body: b.body, genes: b.genes, species: b.species, generation: b.generation, parents: b.parents });
  }
  const deaths = [];
  let dead = null;
  for (const d of world.deaths) {
    if (d.tick <= sinceTick) continue;
    deaths.push(d.id);
    if (d.id === inspectId) dead = inspectId;
  }
  world.births = world.births.filter((b) => b.tick > sinceTick);
  world.deaths = world.deaths.filter((d) => d.tick > sinceTick);

  let inspect = null;
  if (inspectId != null && dead === null) {
    const c = cs.find((q) => q.id === inspectId);
    if (c) {
      const lineage = [];
      let p = world.parentOf.get(c.id);
      while (p !== undefined && lineage.length < LINEAGE) {
        lineage.push(p);
        p = world.parentOf.get(p);
      }
      inspect = {
        id: c.id, values: c.brain.values.slice(), genome: c.genome, age: c.age, energy: c.energy,
        generation: c.generation, parents: c.parents, lineage, species: c.species, gathered: c.gathered,
      };
    } else {
      dead = inspectId; // gone before this frame (e.g. died before the inspect request arrived)
    }
  }

  return {
    type: 'frame',
    tick: world.tick,
    creatures,
    food: world.food.slice(),
    births,
    deaths,
    stats: {
      tick: world.tick,
      population: cs.length,
      generation: world.generation,
      species: world.species.filter((s) => count.has(s.id)).map((s) => [s.id, count.get(s.id), s.hue]),
    },
    inspect,
    dead,
  };
}
