// The climb's pure maths (src/world/climb.js and land.js): scroll to altitude, the weather model, and the
// terrain function the GPU also draws.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { altitudeAt, logAt, tempAt, windAt, snowAt, visibilityAt, hudText, ease, climbOf } from '../src/world/climb.js';
import { H, crestH, crestX, sOfAlt, L, SUMMIT_H } from '../src/world/land.js';

const anchors = [
  { y: 0, alt: 0 },
  { y: 1000, alt: 900 },
  { y: 3000, alt: 2100 },
  { y: 9000, alt: 6100 },
];

test('altitude is the log altitude at each anchor and rises between them', () => {
  for (const a of anchors) assert.equal(Math.round(altitudeAt(a.y, anchors)), a.alt);
  let prev = -1;
  for (let y = -200; y < 9500; y += 37) {
    const alt = altitudeAt(y, anchors);
    assert.ok(alt >= prev - 1e-9, `falls at ${y}`);
    prev = alt;
  }
  assert.equal(altitudeAt(-50, anchors), 0);
  assert.equal(altitudeAt(99999, anchors), 6100);
});

test('the log at a scroll position, and how far through it', () => {
  assert.deepEqual(logAt(0, anchors), { index: 0, t: 0 });
  assert.equal(logAt(1500, anchors).index, 1);
  assert.equal(logAt(1500, anchors).t, 0.25);
  assert.equal(logAt(9000, anchors).index, 3);
});

test('the weather model: colder and windier with height, a cloud at the treeline', () => {
  assert.equal(tempAt(0), -4);
  assert.ok(Math.abs(tempAt(1000) - -10.5) < 1e-9);
  assert.ok(windAt(5000, 3) > windAt(0, 3) - 30);
  assert.ok(visibilityAt(1300) < 1, 'inside the cloud');
  assert.ok(visibilityAt(6000) > 20, 'above it');
  assert.ok(snowAt(1300) > snowAt(6000));
  assert.equal(climbOf(6100), 1);
});

test('HUD text: grouped numbers, a real minus sign, no em dashes', () => {
  const t = hudText({ alt: 2140.4, temp: -17.9, wind: 41.2, snow: 1.26, vis: 0.42, placed: 61, total: 143, seed: 's' });
  assert.equal(t.alt, '2,140 m');
  assert.equal(t.temp, '−17.9 °C');
  assert.equal(t.vis, '420 m');
  assert.equal(t.blocks, '61 / 143');
  for (const v of Object.values(t)) assert.doesNotMatch(String(v), /[–—]/);
});

test('ease converges and never overshoots', () => {
  let v = 0;
  for (let i = 0; i < 200; i++) v = ease(v, 10, 1 / 60, 4);
  assert.ok(v > 9.9 && v <= 10);
});

test('the ridge: the crest climbs from the valley floor to the summit', () => {
  assert.ok(Math.abs(H(crestX(0), 0)) < 40, 'base camp near 0 m');
  assert.equal(Math.round(crestH(1)), SUMMIT_H);
  assert.ok(Math.abs(sOfAlt(SUMMIT_H) - 1) < 1e-9);
  // the crest is the high ground across the ridge, all the way up
  for (const s of [0.2, 0.5, 0.8]) {
    const z = -s * L;
    const top = H(crestX(s), z);
    assert.ok(top > H(crestX(s) + 400, z) && top > H(crestX(s) - 400, z), `crest at s=${s}`);
    assert.ok(Math.abs(top - crestH(s)) < 120, `crest height at s=${s}`);
  }
});
