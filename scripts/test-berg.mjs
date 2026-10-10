// Ported from BTTRURSLF-v2 scripts/check-iceberg-blocks.mjs, rewritten as node:test cases so `npm test`
// guards the hero's berg. The checks are the source's, unchanged in substance: blocks never overlap
// (GJK on neighbouring hulls), a block only ever slides along its own dir, and the hover reaches the
// far side of the hollow. If berg.js is edited, this is what says the movement rules still hold.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBlocks, BergMotion, offset, rayThrough, IDLE, D_MAX } from '../src/figures/iceberg/berg.js';

const blocks = buildBlocks();
const n = blocks.length;

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const crs = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const neg = (a) => [-a[0], -a[1], -a[2]];

function far(P, o, d) {
  let best = -Infinity;
  let k = 0;
  for (let i = 0; i < P.length; i += 3) {
    const s = (P[i] + o[0]) * d[0] + (P[i + 1] + o[1]) * d[1] + (P[i + 2] + o[2]) * d[2];
    if (s > best) {
      best = s;
      k = i;
    }
  }
  return [P[k] + o[0], P[k + 1] + o[1], P[k + 2] + o[2]];
}

/* GJK: do the convex hulls of point sets A (+oa) and B (+ob) intersect? The boolean form with the
   simplex kept as named points a (newest), b, c, d and each case's winding fixed. A hull test is
   stricter than the blocks themselves, which sit inside their hulls. */
function intersects(A, oa, B, ob, ca, cb) {
  const support = (v) => sub(far(A, oa, v), far(B, ob, neg(v)));
  let dir = sub(ca, cb);
  if (dot(dir, dir) < 1e-12) dir = [1, 0, 0];
  let c = support(dir);
  dir = neg(c);
  let b = support(dir);
  if (dot(b, dir) < 0) return false;
  dir = crs(crs(sub(c, b), neg(b)), sub(c, b));
  if (dot(dir, dir) < 1e-20) {
    dir = crs(sub(c, b), [1, 0, 0]);
    if (dot(dir, dir) < 1e-20) dir = crs(sub(c, b), [0, 0, -1]);
  }
  let a;
  let d;
  let dim = 2;
  for (let it = 0; it < 64; it++) {
    a = support(dir);
    if (dot(a, dir) < 0) return false;
    dim++;
    const ao = neg(a);
    if (dim === 3) {
      const nrm = crs(sub(b, a), sub(c, a));
      dim = 2;
      if (dot(crs(sub(b, a), nrm), ao) > 0) {
        c = a;
        dir = crs(crs(sub(b, a), ao), sub(b, a));
        continue;
      }
      if (dot(crs(nrm, sub(c, a)), ao) > 0) {
        b = a;
        dir = crs(crs(sub(c, a), ao), sub(c, a));
        continue;
      }
      dim = 3;
      if (dot(nrm, ao) > 0) {
        d = c;
        c = b;
        b = a;
        dir = nrm;
      } else {
        d = b;
        b = a;
        dir = neg(nrm);
      }
      continue;
    }
    const abc = crs(sub(b, a), sub(c, a));
    const acd = crs(sub(c, a), sub(d, a));
    const adb = crs(sub(d, a), sub(b, a));
    dim = 3;
    if (dot(abc, ao) > 0) {
      d = c;
      c = b;
      b = a;
      dir = abc;
      continue;
    }
    if (dot(acd, ao) > 0) {
      b = a;
      dir = acd;
      continue;
    }
    if (dot(adb, ao) > 0) {
      c = d;
      d = b;
      b = a;
      dir = adb;
      continue;
    }
    return true;
  }
  return true; // undecided after 64 steps: count it as a hit, the safe side
}

// Neighbours: pairs whose bounding spheres could meet at any displacement.
const sphere = blocks.map((b) => {
  let r = 0;
  for (let i = 0; i < b.pos.length; i += 3) r = Math.max(r, Math.hypot(b.pos[i] - b.rest[0], b.pos[i + 1] - b.rest[1], b.pos[i + 2] - b.rest[2]));
  return r;
});
const pairs = [];
for (let i = 0; i < n; i++)
  for (let j = i + 1; j < n; j++) {
    const dist = Math.hypot(...sub(blocks[i].rest, blocks[j].rest));
    if (dist < sphere[i] + sphere[j] + blocks[i].dMax + blocks[j].dMax) pairs.push([i, j]);
  }

function overlaps(ds) {
  const hits = [];
  for (const [i, j] of pairs) {
    const oi = offset(blocks[i], ds[i]);
    const oj = offset(blocks[j], ds[j]);
    const ci = [blocks[i].rest[0] + oi[0], blocks[i].rest[1] + oi[1], blocks[i].rest[2] + oi[2]];
    const cj = [blocks[j].rest[0] + oj[0], blocks[j].rest[1] + oj[1], blocks[j].rest[2] + oj[2]];
    if (Math.hypot(...sub(ci, cj)) > sphere[i] + sphere[j]) continue;
    if (intersects(blocks[i].pos, oi, blocks[j].pos, oj, ci, cj)) hits.push([i, j]);
  }
  return hits;
}

test('berg: 91 blocks, 35 above the waterline (the shape the scene and overlay assume)', () => {
  assert.equal(n, 91);
  assert.equal(blocks.filter((b) => b.above).length, 35);
});

test('berg: every vertex sits inside its own cone and on its own side of the waterline', () => {
  const problems = [];
  for (const b of blocks) {
    const c = b.cone;
    const planes = c.map((v, k) => {
      const w = c[(k + 1) % c.length];
      const p = [v[1] * w[2] - v[2] * w[1], v[2] * w[0] - v[0] * w[2], v[0] * w[1] - v[1] * w[0]];
      const s = p[0] * b.dir[0] + p[1] * b.dir[1] + p[2] * b.dir[2] >= 0 ? 1 : -1;
      return p.map((x) => x * s);
    });
    for (let i = 0; i < b.pos.length; i += 3) {
      const v = [b.pos[i], b.pos[i + 1], b.pos[i + 2]];
      for (const p of planes) if (p[0] * v[0] + p[1] * v[1] + p[2] * v[2] < -1e-6) problems.push(`block ${b.id} vertex outside its cone`);
    }
    if (b.above !== b.dir[1] > 0) problems.push(`block ${b.id} dir on the wrong side of the waterline`);
    for (let i = 1; i < b.pos.length; i += 3)
      if ((b.pos[i] > 1e-6) !== b.above && Math.abs(b.pos[i]) > 1e-6) problems.push(`block ${b.id} crosses the waterline`);
  }
  assert.deepEqual(problems.slice(0, 10), []);
});

test('berg: the overlap test is not blind (nudged copies and inward pushes are seen)', () => {
  let seen = 0;
  for (const b of blocks) if (intersects(b.pos, [0.3, 0.1, 0], b.pos, [0, 0, 0], b.rest, b.rest)) seen++;
  let inward = 0;
  for (const [i, j] of pairs) {
    const oi = offset(blocks[i], -1.2);
    const oj = offset(blocks[j], -1.2);
    const ci = blocks[i].rest.map((v, k) => v + oi[k]);
    const cj = blocks[j].rest.map((v, k) => v + oj[k]);
    if (intersects(blocks[i].pos, oi, blocks[j].pos, oj, ci, cj)) inward++;
  }
  assert.equal(seen, n);
  assert.ok(inward > 0, 'pushing every block 1.2 inward should overlap some pair');
});

test('berg (a): no two neighbours overlap at rest, all at dMax, or in 2,000 random sets', () => {
  assert.deepEqual(overlaps(new Float32Array(n)), [], 'at rest');
  assert.deepEqual(overlaps(Float32Array.from(blocks, (b) => b.dMax)), [], 'all at dMax');
  let s = 77;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let k = 0; k < 2000; k++) {
    // Half fully random, half hover-shaped (most shut, a few out).
    const sparse = k % 2 === 1;
    const ds = Float32Array.from(blocks, (b) => (sparse && rnd() < 0.7 ? 0 : rnd() * b.dMax));
    const hits = overlaps(ds);
    assert.deepEqual(hits, [], `random set ${k}`);
  }
});

test('berg (b): over a scripted hover and two idle pulses a block only slides along dir, d in [0, dMax], with still stretches', () => {
  const motion = new BergMotion(blocks);
  const dt = 1 / 60;
  let worstCross = 0;
  let outOfRange = 0;
  const record = () => {
    for (let i = 0; i < n; i++) {
      const b = blocks[i];
      const d = motion.d[i];
      if (!(d >= 0 && d <= b.dMax + 1e-6)) outOfRange++;
      const c = crs(offset(b, d), b.dir);
      worstCross = Math.max(worstCross, Math.hypot(...c));
    }
  };
  const cam = [0, 1.15, 40];
  const aimAt = (x, y) => {
    const v = sub([x, y, 0], cam);
    const l = Math.hypot(...v);
    return rayThrough(cam, v.map((q) => q / l));
  };
  let time = 0;
  let hits = 0;
  let maxDuringHover = 0;
  const path = [];
  for (let k = 0; k <= 180; k++) path.push([-5 + (10 * k) / 180, 6 - 3 * Math.sin((k / 180) * Math.PI)]);
  for (let k = 0; k <= 180; k++) path.push([2 - (4 * k) / 180, -2 - (8 * k) / 180]);
  for (const [x, y] of path) {
    const ray = aimAt(x, y);
    if (ray) hits++;
    motion.step(dt, time, { ray, hoverOn: 1, idle: 0 });
    time += dt;
    record();
    maxDuringHover = Math.max(maxDuringHover, ...motion.d);
  }
  const stillByPeriod = [];
  const idleStart = Math.ceil(time / IDLE.period) * IDLE.period;
  const idleEnd = idleStart + IDLE.period * 2 - 1e-6;
  while (time < idleEnd) {
    const hold = time < idleStart;
    motion.step(dt, time, { ray: null, hoverOn: 1, idle: hold ? 0 : 1 });
    time += dt;
    record();
    if (time >= idleStart) {
      const p = Math.min(1, Math.floor((time - idleStart) / IDLE.period));
      stillByPeriod[p] ??= { run: 0, best: 0 };
      const r = stillByPeriod[p];
      r.run = motion.d.every((d) => d === 0) ? r.run + dt : 0;
      r.best = Math.max(r.best, r.run);
    }
  }
  assert.ok(worstCross < 1e-9, `a displacement off its line: |cross| ${worstCross}`);
  assert.equal(outOfRange, 0);
  assert.ok(stillByPeriod.every((r) => r.best >= 1.5), `idle stillness ${stillByPeriod.map((r) => r.best.toFixed(2))}`);
  assert.ok(hits >= path.length * 0.8, `hover hit the berg ${hits}/${path.length}`);
  assert.ok(maxDuringHover >= D_MAX * 0.5, `hover barely moved anything: ${maxDuringHover}`);
});

test('berg (c): a hover held on the tip opens blocks on the far side of the hollow too', () => {
  const cam = [0, 1.15, 40];
  const v = sub([0.6, 5.5, 0], cam);
  const l = Math.hypot(...v);
  const ray = rayThrough(cam, v.map((q) => q / l));
  const m = new BergMotion(blocks);
  const dt = 1 / 60;
  for (let k = 0; k < 240; k++) m.step(dt, k * dt, { ray, hoverOn: 1, idle: 0 });
  let farOut = 0;
  for (let i = 0; i < n; i++) {
    const b = blocks[i];
    if (m.d[i] <= 0.3 * b.dMax) continue;
    if (dot(sub(cam, b.anchor), b.dir) < 0) farOut++;
  }
  assert.ok(farOut >= 3, `only ${farOut} far-side blocks opened`);
});
