// A track's stage is a pure function of where its rail sits in the viewport, so the maths that turns
// rect reads into progress, stage and scroll offsets is pinned here without a browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deskProgress, phoneProgress, stageFor, stageOffset } from '../src/figures/track-math.js';

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test('deskProgress is 0 before the rail pins, 1 at the end, linear between', () => {
  assert.equal(deskProgress({ railTop: 96, pad: 850 }), 0);
  assert.equal(deskProgress({ railTop: 400, pad: 850 }), 0);
  near(deskProgress({ railTop: 96 - 425, pad: 850 }), 0.5);
  assert.equal(deskProgress({ railTop: -2000, pad: 850 }), 1);
  assert.equal(deskProgress({ railTop: -50, pad: 0 }), 0);
});

test('phoneProgress spans figure top at 85% to figure centre at 45%', () => {
  near(phoneProgress({ figTop: 717.4, figH: 400, vh: 844 }), 0);
  near(phoneProgress({ figTop: 179.8, figH: 400, vh: 844 }), 1);
  assert.equal(phoneProgress({ figTop: 2000, figH: 400, vh: 844 }), 0);
  assert.equal(phoneProgress({ figTop: -900, figH: 400, vh: 844 }), 1);
});

test('stageFor rounds with 4% hysteresis around the midpoint', () => {
  assert.equal(stageFor(0.37, 5, 1), 1); // 1.48: inside the band above 1.5
  assert.equal(stageFor(0.39, 5, 1), 2); // 1.56: past it
  assert.equal(stageFor(0.13, 5, 1), 1); // 0.52
  assert.equal(stageFor(0.1, 5, 1), 0); // 0.40
  assert.equal(stageFor(0.7, 1, 0), 0);
  assert.equal(stageFor(1, 5, 0), 4); // a jump far past the band lands on the rounded stage
});

test('stageOffset centres stage i in the rail', () => {
  assert.equal(stageOffset(2, 5, 3400), 1700);
  assert.equal(stageOffset(0, 1, 3400), 0);
  assert.equal(stageOffset(4, 5, 3400), 3400);
});
