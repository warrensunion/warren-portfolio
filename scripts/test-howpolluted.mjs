// The HowPolluted track figure is a demo built from HowPolluted's own pure modules (ported at 80f6d06):
// the pile plan and its coverage, the grade scale, the land-mask lookup and the demo model the visitor
// cleans up. All of it is pure, so it is pinned here without a browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { planPile, pileCoverage } from '../src/figures/howpolluted/litter-sim.js';
import { gradeFor } from '../src/figures/howpolluted/grades.js';
import { FILES } from './sync-howpolluted.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SPRITES = [0, 1, 2].map(() => ({ w: 100, h: 80, fill: 0.6, anchor: [50, 70] }));
const GROUND = { w: 1000, top: 300, bottom: 700 };

test('litter-sim: a pile covers its target within 3%', () => {
  const got = pileCoverage(planPile(9, GROUND, SPRITES, 7), GROUND);
  assert.ok(Math.abs(got - 9) <= 0.27, `asked 9, got ${got.toFixed(3)}`);
});

test('litter-sim: same seed, same pile', () => {
  const pick = (items) => items.map(({ x, y, scale }) => ({ x, y, scale }));
  assert.deepEqual(pick(planPile(9, GROUND, SPRITES, 7)), pick(planPile(9, GROUND, SPRITES, 7)));
});

test('grades: litter edges are exclusive', () => {
  assert.equal(gradeFor('litter', 1).grade, 'Pretty good');
  assert.equal(gradeFor('litter', 0.99).grade, 'Good');
  assert.equal(gradeFor('litter', 9).grade, 'Mildly poor');
  assert.equal(gradeFor('litter', 15).grade, 'Poor');
  assert.equal(gradeFor('litter', 6).grade, 'Moderate');
});

test('assets: every copied file exists and SOURCE.txt names 80f6d06', () => {
  const missing = FILES.filter((f) => !existsSync(path.join(root, 'public/howpolluted', f)));
  assert.deepEqual(missing, []);
  assert.equal(FILES.filter((f) => f.startsWith('art/trash/')).length, 24);
  assert.match(readFileSync(path.join(root, 'public/howpolluted/SOURCE.txt'), 'utf8'), /80f6d06/);
});

// A 4x2 equirectangular mask: x = 0 at lon -180, y = 0 at lat +90; only pixel (1, 0) is land (white).
const { groundAt } = await import('../src/figures/howpolluted/mask.js');
const MASK = (() => {
  const data = new Uint8ClampedArray(4 * 2 * 4);
  for (let i = 3; i < data.length; i += 4) data[i] = 255;
  data.set([255, 255, 255, 255], (0 * 4 + 1) * 4);
  return { width: 4, height: 2, data };
})();

test('mask: equirectangular lookup', () => {
  assert.equal(groundAt(MASK, 45, -45), 'land');
  assert.equal(groundAt(MASK, -45, -45), 'water');
});

test('mask: wraps longitude and clamps the poles', () => {
  assert.equal(groundAt(MASK, 45, 315), groundAt(MASK, 45, -45));
  assert.doesNotThrow(() => groundAt(MASK, 95, 0));
  assert.doesNotThrow(() => groundAt(MASK, -90, 180));
  assert.equal(groundAt(MASK, 45, -225), groundAt(MASK, 45, 135));
});

// The demo model: the pile the visitor cleans up. Real manifest sprites, so sizes are the art's own.
const { createModel } = await import('../src/figures/howpolluted/model.js');
const manifest = JSON.parse(readFileSync(path.join(root, 'public/howpolluted/art/manifest.json'), 'utf8'));
const ART = Object.entries(manifest)
  .filter(([k]) => k.startsWith('trash/'))
  .map(([file, m]) => ({ file, ...m }));
const RECT = { w: 1000, top: 300, bottom: 700 };
const landModel = () => {
  const m = createModel({ ground: 'land', sprites: ART, value: 9 });
  m.layout(RECT);
  return m;
};

test('model: the planned pile starts within 3% of the demo value', () => {
  const m = landModel();
  assert.ok(Math.abs(m.coverage() - 9) <= 0.27, `got ${m.coverage()}`);
  assert.equal(m.grade().grade, 'Mildly poor');
});

test('model: picking lowers coverage and can improve the grade', () => {
  const m = landModel();
  let guard = 0;
  while (m.coverage() >= 8 && guard++ < 500) {
    const it = m.items().at(-1);
    assert.ok(m.pickAt(it.cx, it.cy), `nothing picked at ${it.cx},${it.cy}`);
  }
  assert.ok(m.coverage() < 8);
  assert.equal(m.grade().grade, 'Moderate');
});

test('model: removing every piece gives Good and coverage 0', () => {
  const m = landModel();
  let guard = 0;
  while (m.items().length && guard++ < 2000) {
    const it = m.items()[0];
    m.pickAt(it.cx, it.cy);
  }
  assert.equal(m.items().length, 0);
  assert.equal(m.coverage(), 0);
  assert.equal(m.grade().grade, 'Good');
  assert.equal(m.pickAt(500, 500), false);
});

test('model: a flick stays inside the ground band and still counts', () => {
  const m = landModel();
  const before = m.coverage();
  const it = m.items()[3];
  const id = m.grabAt(it.cx, it.cy);
  assert.notEqual(id, null);
  m.drag(id, it.cx + 10, it.cy - 5);
  m.release(id, 5000, -3000);
  for (let i = 0; i < 300; i++) m.step(1 / 60);
  const moved = m.items().find((x) => x.id === id);
  assert.ok(moved.x >= 0 && moved.x <= RECT.w && moved.y >= RECT.top && moved.y <= RECT.bottom, `at ${moved.x},${moved.y}`);
  assert.equal(m.coverage(), before);
  assert.equal(m.moving(), false);
});

test('model: removing then replaying keeps coverage', () => {
  const m = landModel();
  for (let k = 0; k < 5; k++) {
    const it = m.items().at(-1);
    m.pickAt(it.cx, it.cy);
  }
  const n = m.items().length;
  const c = m.coverage();
  m.layout(RECT);
  assert.equal(m.items().length, n);
  assert.ok(Math.abs(m.coverage() - c) < 1e-9);
  m.reset();
  assert.ok(m.items().length > n);
});

test('model: a resize keeps relative places and coverage within 0.5%', () => {
  const m = landModel();
  const c0 = m.coverage();
  const a = m.items().map((it) => [it.id, it.x / 1000, (it.y - 300) / 400]);
  m.layout({ w: 800, top: 240, bottom: 560 });
  assert.ok(Math.abs(m.coverage() - c0) <= 0.5, `${c0} -> ${m.coverage()}`);
  const b = new Map(m.items().map((it) => [it.id, [it.x / 800, (it.y - 240) / 320]]));
  for (const [id, nx, ny] of a) {
    assert.ok(Math.abs(b.get(id)[0] - nx) < 1e-9 && Math.abs(b.get(id)[1] - ny) < 1e-9);
  }
});
