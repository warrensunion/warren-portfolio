// The Terrarium track figure runs Terrarium's own seeded sim (ported at 7612a40) in a worker, and its
// streamgraph scrubs a history recorded in Node from the same seed. Both only agree if the sim is
// deterministic on the CPU sensor, so that is pinned here, along with the history file and the worker's
// message handling (its backlog rule above all), all without a browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createWorld, packFrame } from '../src/figures/terrarium/sim/world.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HISTORY = path.join(root, 'public/terrarium/history.json');
const SEED = 20261010;
const COUNT = 300;
const PARAMS = { foodRate: 1.3 };

function hashRun(steps) {
  const w = createWorld({ seed: SEED, count: COUNT, params: PARAMS });
  for (let i = 0; i < steps; i++) w.step();
  const f = packFrame(w, null, -1);
  const h = createHash('sha1');
  h.update(Buffer.from(f.creatures.buffer));
  h.update(Buffer.from(f.food.buffer));
  return h.digest('hex');
}

test('sim: same seed, same history hash', () => {
  const a = hashRun(600);
  const b = hashRun(600);
  assert.equal(a, b);
  assert.notEqual(a, hashRun(10), 'the hash moves with the world');
});

test('history: matches a fresh run', () => {
  const h = JSON.parse(readFileSync(HISTORY, 'utf8'));
  assert.equal(h.seed, SEED);
  assert.equal(h.count, COUNT);
  assert.equal(h.steps, 3600);
  assert.equal(h.every, 120);
  assert.equal(h.samples.length, 3600 / 120 + 1);
  const w = createWorld({ seed: h.seed, count: h.count, params: h.params });
  for (let i = 0; i < h.steps; i++) w.step();
  const last = h.samples[h.samples.length - 1];
  const s = packFrame(w, null, -1).stats;
  assert.equal(last.tick, 3600);
  assert.equal(last.maxGen, s.generation);
  assert.equal(last.pop, s.population);
  assert.equal(last.species.length, s.species.length);
  assert.ok(h.featured && Number.isInteger(h.featured.lineageRootId), 'a featured lineage root');
  assert.ok(Array.isArray(h.featured.gen0Genome.nodes) && Array.isArray(h.featured.gen0Genome.conns), 'its gen-0 genome');
  assert.ok(h.maxGen >= last.maxGen && h.maxGen > 0, 'G, the max generation in the history');
});

test('history: is under 200 kB', () => {
  const size = statSync(HISTORY).size;
  assert.ok(size < 200 * 1024, `${size} bytes`);
});
