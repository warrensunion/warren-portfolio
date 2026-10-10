// The ring figure's particle shapes are grown from pictures by pure code (tubeShapes.js), and its
// morph links are bound through a pure debouncer (morphLinks.js). Both run here without a browser;
// the WebGL itself is checked by eye.
import test from 'node:test';
import assert from 'node:assert/strict';
import { grow, fitInCircle, thicken } from '../src/figures/ring/tubeShapes.js';
import { createMorphDebounce } from '../src/figures/ring/morphLinks.js';

/** A "W"-like RGBA mask: two opaque white rectangles side by side on transparent, about as wide for its
 *  height (16:7) as the real "WS" in a bold serif. */
function twoRects(w = 200, h = 80) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const on = y >= 5 && y < 75 && ((x >= 20 && x < 95) || (x >= 105 && x < 180));
      const i = (y * w + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = 255;
      data[i + 3] = on ? 255 : 0;
    }
  return { w, h, data };
}

test('grow() on a W-like mask returns n points inside |x| <= 2.5, 0 <= y <= 2.0', () => {
  const s = grow(twoRects(), 'logo', 2000, 1);
  assert.equal(s.pos.length, 2000 * 3);
  assert.equal(s.nrm.length, 2000 * 3);
  assert.equal(s.tone.length, 2000);
  for (let i = 0; i < 2000; i++) {
    const x = s.pos[i * 3];
    const y = s.pos[i * 3 + 1];
    assert.ok(Math.abs(x) <= 2.5, `x ${x}`);
    assert.ok(y >= 0 && y <= 2.0, `y ${y}`);
  }
});

test('grow() points are sorted by y (the port keeps the hub sort key: y plus jitter of at most 0.35)', () => {
  const s = grow(twoRects(), 'logo', 2000, 1);
  // Exact consequence of sorting on y + u, |u| <= 0.35: no earlier point is more than 0.7 above a later one.
  let maxY = -Infinity;
  for (let i = 0; i < 2000; i++) {
    const y = s.pos[i * 3 + 1];
    assert.ok(maxY - y <= 0.7 + 1e-9, `point ${i} is ${maxY - y} below an earlier one`);
    maxY = Math.max(maxY, y);
  }
  // And the order is by height overall: every tenth of the list sits higher than the one before.
  const means = [];
  for (let d = 0; d < 10; d++) {
    let sum = 0;
    for (let i = d * 200; i < (d + 1) * 200; i++) sum += s.pos[i * 3 + 1];
    means.push(sum / 200);
  }
  for (let d = 1; d < 10; d++) assert.ok(means[d] > means[d - 1], `decile ${d}: ${means[d]} <= ${means[d - 1]}`);
});

test('grow() is deterministic for a seed', () => {
  const a = grow(twoRects(), 'logo', 500, 7);
  const b = grow(twoRects(), 'logo', 500, 7);
  assert.deepEqual(Array.from(a.pos), Array.from(b.pos));
});

test('fitInCircle centres a shape and keeps its xy box inside the radius, without touching the input', () => {
  const s = grow(twoRects(), 'logo', 1000, 3);
  const before = Float32Array.from(s.pos);
  const f = fitInCircle(s, 1.2);
  assert.deepEqual(Array.from(s.pos), Array.from(before));
  const [x0, y0] = f.box.min;
  const [x1, y1] = f.box.max;
  assert.ok(Math.abs(x0 + x1) < 1e-4 && Math.abs(y0 + y1) < 1e-4, 'centred');
  assert.ok(Math.hypot(x1, y1) <= 1.2 + 1e-4, `half diagonal ${Math.hypot(x1, y1)}`);
  assert.ok(f.scale > 0 && f.scale < 1);
});

test('thicken() grows a 1 px line so thin art keeps its strokes when sampled', () => {
  const w = 40;
  const h = 40;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 5; y < 35; y++) data[(y * w + 20) * 4 + 3] = 255; // a 1 px vertical string
  const t = thicken({ w, h, data }, 1);
  let on = 0;
  for (let i = 0; i < w * h; i++) if (t.data[i * 4 + 3] > 128) on++;
  assert.ok(on >= 30 * 3, `only ${on} px after thickening`);
  assert.equal(data[(20 * w + 21) * 4 + 3], 0, 'input untouched');
});

test('morph links: rapid enter/leave across links settles once, 120 ms after the last event', () => {
  let now = 0;
  const timers = [];
  const clock = {
    set: (fn, ms) => timers.push({ fn, at: now + ms, live: true }) - 1,
    clear: (id) => id != null && timers[id] && (timers[id].live = false),
  };
  const advance = (ms) => {
    now += ms;
    for (const t of timers) if (t.live && t.at <= now) (t.live = false), t.fn();
  };
  const shown = [];
  const d = createMorphDebounce((i) => shown.push(i), 120, clock);
  d.request(0);
  advance(50);
  d.request(null);
  advance(30);
  d.request(1);
  advance(119);
  assert.deepEqual(shown, []);
  advance(1);
  assert.deepEqual(shown, [1]);
  d.request(1); // same target again: nothing new
  advance(200);
  assert.deepEqual(shown, [1]);
  d.request(null);
  advance(120);
  assert.deepEqual(shown, [1, null]);
  d.request(2);
  d.cancel();
  advance(500);
  assert.deepEqual(shown, [1, null]);
});
