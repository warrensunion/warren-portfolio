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
