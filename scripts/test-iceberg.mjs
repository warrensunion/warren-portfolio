// The hero's readout and its scroll-to-depth mapping are the two pieces of Fig. 1 a reader can check
// with their own eyes (the sign flips at the waterline, the camera is under by the end of the track),
// so their pure halves are pinned here. The scene itself is checked live in the browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatHeight, heroProgress } from '../src/figures/iceberg/figure.js';

test('readout: signed metres to one decimal, ASCII hyphen-minus, never U+2212', () => {
  assert.equal(formatHeight(2.44), '+2.4 m');
  assert.equal(formatHeight(-6.06), '-6.1 m');
  assert.equal(formatHeight(0), '+0.0 m');
  assert.equal(formatHeight(-0.04), '+0.0 m'); // rounds to zero: no "-0.0"
  for (const y of [-9, -0.5, 0.5, 1.15]) assert.ok(!formatHeight(y).includes('−'));
});

test('depth: desktop progress runs 0..1 across the hero track minus one viewport', () => {
  const base = { desktop: true, heroHeight: 1440, innerHeight: 900, figTop: 0 };
  assert.equal(heroProgress({ ...base, heroTop: 0 }), 0);
  assert.equal(heroProgress({ ...base, heroTop: 100 }), 0); // below the top: clamped
  assert.equal(heroProgress({ ...base, heroTop: -270 }), 0.5);
  assert.equal(heroProgress({ ...base, heroTop: -540 }), 1);
  assert.equal(heroProgress({ ...base, heroTop: -2000 }), 1);
  assert.equal(heroProgress({ ...base, heroHeight: 800, heroTop: -50 }), 0); // no track: stays above
});

test('depth: phone progress runs from the figure top at 70% of the viewport to the top edge', () => {
  const base = { desktop: false, heroTop: 0, heroHeight: 0, innerHeight: 1000 };
  assert.equal(heroProgress({ ...base, figTop: 900 }), 0);
  assert.equal(heroProgress({ ...base, figTop: 700 }), 0);
  assert.equal(heroProgress({ ...base, figTop: 350 }), 0.5);
  assert.equal(heroProgress({ ...base, figTop: 0 }), 1);
  assert.equal(heroProgress({ ...base, figTop: -400 }), 1);
});

test('depth: a phone whose figure already starts above the 70% line still opens above water', () => {
  // 390x844: the figure's top sits at ~340 px before any scrolling.
  const base = { desktop: false, heroTop: 0, heroHeight: 0, innerHeight: 844, figDocTop: 340 };
  assert.equal(heroProgress({ ...base, figTop: 340 }), 0);
  assert.equal(heroProgress({ ...base, figTop: 170 }), 0.5);
  assert.equal(heroProgress({ ...base, figTop: 0 }), 1);
  // A figure far down the page keeps the 70% line.
  assert.equal(heroProgress({ ...base, figDocTop: 2000, figTop: 0.7 * 844 }), 0);
});
