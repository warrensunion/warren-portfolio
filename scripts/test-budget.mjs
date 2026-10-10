// The context budget and the fallback rules decide whether a visitor gets a live scene, a poster, or a
// crashed tab, so they are pure functions tested here without a browser. The DOM half of the host is
// checked in Playwright instead.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBudget } from '../src/figures/budget.js';
import { fallbackReason, tierFor, readFlags, pastLine, readPoster, weightOf, isWebGLKind } from '../src/figures/env.js';

const dist = (map) => (id) => () => map[id];

test('budget: the first three acquire without evictions', () => {
  const b = createBudget(3);
  const d = dist({ a: 5, b: 1, c: 3, d: 0 });
  assert.deepEqual(b.acquire('a', d('a')), []);
  assert.deepEqual(b.acquire('b', d('b')), []);
  assert.deepEqual(b.acquire('c', d('c')), []);
  assert.deepEqual(b.live().sort(), ['a', 'b', 'c']);
});

test('budget: a fourth evicts the farthest other figure, never the acquirer', () => {
  const b = createBudget(3);
  const d = dist({ a: 5, b: 1, c: 3, d: 0 });
  for (const id of 'abc') b.acquire(id, d(id));
  assert.deepEqual(b.acquire('d', d('d')), ['a']);
  assert.ok(b.live().length <= 3);
  // The acquirer is excluded even when it is the farthest.
  const b2 = createBudget(3);
  const d2 = dist({ a: 1, b: 2, c: 3, z: 99 });
  for (const id of 'abc') b2.acquire(id, d2(id));
  assert.deepEqual(b2.acquire('z', d2('z')), ['c']);
});

test('budget: distances are read at acquire time, not when registered', () => {
  const b = createBudget(2);
  const m = { a: 0, b: 0 };
  b.acquire('a', () => m.a);
  b.acquire('b', () => m.b);
  m.a = 10;
  assert.deepEqual(b.acquire('c', () => 0), ['a']);
});

test('budget: release frees a slot; live() never exceeds max after evictions are released', () => {
  const b = createBudget(3);
  const d = dist({ a: 5, b: 1, c: 3, d: 0, e: 2 });
  for (const id of 'abc') b.acquire(id, d(id));
  for (const ev of b.acquire('d', d('d'))) b.release(ev);
  assert.ok(b.live().length <= 3);
  b.release('b');
  assert.deepEqual(b.acquire('e', d('e')), []);
  assert.ok(b.live().length <= 3);
  assert.deepEqual(b.live().sort(), ['c', 'd', 'e']);
});

test('budget: re-acquiring a live id and releasing twice are harmless', () => {
  const b = createBudget(1);
  assert.deepEqual(b.acquire('a', () => 0), []);
  assert.deepEqual(b.acquire('a', () => 0), []);
  b.release('a');
  b.release('a');
  assert.deepEqual(b.live(), []);
});

const base = { webgl2: true, reduced: false, saveData: false, forced: false };

test('fallbackReason: forced beats everything', () => {
  for (const kind of ['iceberg', 'archer', 'ring']) {
    assert.equal(fallbackReason({ webgl2: false, reduced: true, saveData: true, forced: true, kind }), 'forced');
  }
});

test('fallbackReason: reduced motion stills the WebGL kinds only', () => {
  for (const kind of ['iceberg', 'archer', 'ring']) {
    assert.equal(fallbackReason({ ...base, reduced: true, kind }), 'reduced-motion');
  }
  assert.equal(fallbackReason({ ...base, reduced: true, kind: 'contests' }), null);
});

test('fallbackReason: no webgl2 and save-data', () => {
  assert.equal(fallbackReason({ ...base, webgl2: false, kind: 'ring' }), 'no-webgl2');
  assert.equal(fallbackReason({ ...base, saveData: true, kind: 'archer' }), 'save-data');
  assert.equal(fallbackReason({ ...base, webgl2: false, saveData: true, reduced: true, kind: 'ring' }), 'no-webgl2');
  assert.equal(fallbackReason({ ...base, saveData: true, reduced: true, kind: 'ring' }), 'save-data');
});

test('fallbackReason: live when nothing applies; contests never falls back', () => {
  assert.equal(fallbackReason({ ...base, kind: 'iceberg' }), null);
  assert.equal(
    fallbackReason({ webgl2: false, reduced: true, saveData: true, forced: true, kind: 'contests' }),
    null,
  );
});

test('tierFor: low on narrow, coarse pointer or <= 4 cores; query overrides', () => {
  const hi = { width: 1440, coarse: false, cores: 8, override: null };
  assert.equal(tierFor(hi), 'high');
  assert.equal(tierFor({ ...hi, width: 859 }), 'low');
  assert.equal(tierFor({ ...hi, width: 860 }), 'high');
  assert.equal(tierFor({ ...hi, coarse: true }), 'low');
  assert.equal(tierFor({ ...hi, cores: 4 }), 'low');
  assert.equal(tierFor({ ...hi, cores: undefined }), 'high');
  assert.equal(tierFor({ ...hi, width: 390, override: 'high' }), 'high');
  assert.equal(tierFor({ ...hi, override: 'low' }), 'low');
  assert.equal(tierFor({ ...hi, width: 390, override: 'bogus' }), 'low');
});

test('readFlags: parses the dev query flags', () => {
  assert.deepEqual(readFlags(''), { forced: false, fps: false, tier: null });
  assert.deepEqual(readFlags('?static=1&fps=1&tier=low'), { forced: true, fps: true, tier: 'low' });
  assert.deepEqual(readFlags('?static=0&tier=ultra'), { forced: false, fps: false, tier: null });
});

test('pastLine: a sentinel is past the line once its top is above it', () => {
  assert.equal(pastLine({ boundingClientRect: { top: -1 } }, 0), true);
  assert.equal(pastLine({ boundingClientRect: { top: 900 } }, 0), false);
  assert.equal(pastLine({ boundingClientRect: { top: 300 } }, 422), true);
  assert.equal(pastLine({ boundingClientRect: { top: 500 } }, 422), false);
});

// Fix round 1: figure-owned frame counting and refilling a freed slot are pure decisions too.
const hostHelpers = await import('../src/figures/host.js');
const { recordFrame, slotRetries } = hostHelpers;

test('recordFrame: accumulates real frame times, ignores junk', () => {
  const st = { frames: 0, dtSum: 0, dtMax: 0 };
  recordFrame(st, 16);
  recordFrame(st, 20);
  for (const bad of [0, -5, NaN, Infinity, undefined]) recordFrame(st, bad);
  assert.deepEqual(st, { frames: 2, dtSum: 36, dtMax: 20 });
});

test('recordFrame: logs each frame only when an opt-in dts array is present', () => {
  const st = { frames: 0, dtSum: 0, dtMax: 0, dts: [] };
  recordFrame(st, 16);
  recordFrame(st, NaN);
  recordFrame(st, 33);
  assert.deepEqual(st.dts, [16, 33]);
});

test('slotRetries: refills free slots with visible, unbuilt, unblocked WebGL figures only', () => {
  const f = (id, o = {}) => ({ id, kind: 'archer', visible: true, instance: null, build: null, failed: false, blockedUntil: 0, ...o });
  const cands = [
    f('a'),
    f('b', { visible: false }),
    f('c', { instance: {} }),
    f('d', { build: {} }),
    f('e', { failed: true }),
    f('g', { blockedUntil: 2000 }),
    f('h', { kind: 'contests' }),
    f('i'),
  ];
  assert.deepEqual(slotRetries(cands, 2, 1000), ['a', 'i']);
  assert.deepEqual(slotRetries(cands, 1, 1000), ['a']);
  assert.deepEqual(slotRetries(cands, 0, 1000), []);
  assert.deepEqual(slotRetries(cands, 3, 3000), ['a', 'g', 'i']);
});

test('mustWait: a full budget held only by in-flight builds makes the acquirer wait', () => {
  const { mustWait } = hostHelpers;
  const e = (id, building, weight = 1) => ({ id, building, weight });
  assert.equal(mustWait([e('a', true), e('b', true), e('c', true)], 'z', 3, 1), true);
  assert.equal(mustWait([e('a', true), e('b', true), e('x', false)], 'z', 3, 1), false); // x is installed: evict it
  assert.equal(mustWait([e('a', true), e('b', true)], 'z', 3, 1), false); // a free slot
  assert.equal(mustWait([e('a', true), e('b', true), e('z', false)], 'z', 3, 1), false); // already holds a slot
});

test('mustWait counts weight: a weight-2 claim waits while two weight-1 builds are in flight', () => {
  const { mustWait } = hostHelpers;
  const e = (id, building, weight = 1) => ({ id, building, weight });
  assert.equal(mustWait([e('a', true), e('b', true), e('w', false, 0)], 'w', 3, 2), true);
  assert.equal(mustWait([e('a', true), e('b', false), e('w', false, 0)], 'w', 3, 2), false); // b can go
  assert.equal(mustWait([e('a', false), e('b', false)], 'w', 3, 2), false);
  // A weight-0 entry (bcwc showing clips) never holds a slot against anyone.
  assert.equal(mustWait([e('a', true), e('b', true), e('w', true, 0)], 'z', 3, 1), false);
});

test('waiterRetries: after an install, only figures mustWait turned away get another chance', () => {
  const { waiterRetries } = hostHelpers;
  const f = (id, o = {}) => ({ id, kind: 'ring', visible: true, waiting: true, instance: null, build: null, failed: false, blockedUntil: 0, ...o });
  const cands = [
    f('w'),
    f('evicted', { waiting: false }), // evicted figures wait for a free slot, or they would evict back
    f('gone', { visible: false }),
    f('built', { instance: {} }),
    f('busy', { build: {} }),
    f('bad', { failed: true }),
    f('cool', { blockedUntil: 5000 }),
    f('svg', { kind: 'contests' }),
    f('w2'),
  ];
  assert.deepEqual(waiterRetries(cands, 1000), ['w', 'w2']);
  assert.deepEqual(waiterRetries(cands, 6000), ['w', 'cool', 'w2']);
});

test('readPoster: no param, no poster mode; otherwise one figure and its still state', () => {
  assert.equal(readPoster(''), null);
  assert.equal(readPoster('?static=1&tier=low'), null);
  assert.deepEqual(readPoster('?poster=iceberg'), { kind: 'iceberg', index: 0, state: { depth: 0 } });
  assert.deepEqual(readPoster('?poster=iceberg&depth=1'), { kind: 'iceberg', index: 0, state: { depth: 1 } });
  assert.deepEqual(readPoster('?poster=ring'), { kind: 'ring', index: 0, state: { shape: null } });
  assert.deepEqual(readPoster('?poster=ring&shape=2'), { kind: 'ring', index: 0, state: { shape: 2 } });
  assert.equal(readPoster('?poster=archer&i=-1').index, 0);
  assert.equal(readPoster('?poster=archer&i=x').index, 0);
});

test('budget: a weight-2 acquire evicts farthest weight-1 figures until used() <= 3', () => {
  const b = createBudget(3);
  const d = dist({ a: 5, b: 1, c: 3 });
  for (const id of 'abc') b.acquire(id, d(id), 1);
  assert.deepEqual(b.acquire('x', () => 0, 2), ['a', 'c']);
  assert.equal(b.used(), 3);
  assert.deepEqual(b.live().sort(), ['b', 'x']);
});

test('budget: weight-0 acquires never evict', () => {
  const b = createBudget(3);
  for (const id of 'abc') b.acquire(id, () => 1, 1);
  assert.deepEqual(b.acquire('z', () => 0, 0), []);
  assert.equal(b.used(), 3);
});

test('budget: re-acquire with a new weight replaces the old weight', () => {
  const b = createBudget(3);
  b.acquire('a', () => 0, 2);
  b.acquire('a', () => 0, 1);
  assert.equal(b.used(), 1);
});

test('env: weightOf gives contexts per kind at load time', () => {
  assert.equal(weightOf('bcwc'), 0); // the iframe claims 2 at runtime
  assert.equal(weightOf('archer'), 1);
  assert.equal(weightOf('terrarium'), 1);
  assert.equal(weightOf('bttr'), 0);
  assert.equal(weightOf('unknown'), 0);
  assert.equal(isWebGLKind('bcwc'), true);
  assert.equal(isWebGLKind('bttr'), false);
});

test('env: fallbackReason covers track kinds; frame players do not need WebGL2', () => {
  assert.equal(fallbackReason({ kind: 'bttr', reduced: true, webgl2: true }), 'reduced-motion');
  assert.equal(fallbackReason({ kind: 'bttr', webgl2: false }), null);
  assert.equal(fallbackReason({ kind: 'bttr', forced: true, webgl2: true }), 'forced');
  assert.equal(fallbackReason({ kind: 'archer', webgl2: false }), 'no-webgl2');
  assert.equal(fallbackReason({ kind: 'contests', reduced: true, webgl2: true }), null);
});

test('readPoster gives a track figure its stage', () => {
  assert.deepEqual(readPoster('?poster=archer&stage=2'), { kind: 'archer', index: 0, state: { stage: 2 } });
  assert.deepEqual(readPoster('?poster=terrarium'), { kind: 'terrarium', index: 0, state: { stage: 0 } });
  assert.deepEqual(readPoster('?poster=bttr&stage=x'), { kind: 'bttr', index: 0, state: { stage: 0 } });
});
