// The context budget and the fallback rules decide whether a visitor gets a live scene, a poster, or a
// crashed tab, so they are pure functions tested here without a browser. The DOM half of the host is
// checked in Playwright instead.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBudget } from '../src/figures/budget.js';
import { fallbackReason, tierFor, readFlags, pastLine } from '../src/figures/env.js';

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
  for (const kind of ['iceberg', 'iceblock', 'ring']) {
    assert.equal(fallbackReason({ webgl2: false, reduced: true, saveData: true, forced: true, kind }), 'forced');
  }
});

test('fallbackReason: reduced motion stills the WebGL kinds only', () => {
  for (const kind of ['iceberg', 'iceblock', 'ring']) {
    assert.equal(fallbackReason({ ...base, reduced: true, kind }), 'reduced-motion');
  }
  assert.equal(fallbackReason({ ...base, reduced: true, kind: 'contests' }), null);
});

test('fallbackReason: no webgl2 and save-data', () => {
  assert.equal(fallbackReason({ ...base, webgl2: false, kind: 'ring' }), 'no-webgl2');
  assert.equal(fallbackReason({ ...base, saveData: true, kind: 'iceblock' }), 'save-data');
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
