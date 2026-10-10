// The ice figures' pure parts: the drag orbit's clamp and spring, the readout, the arrow keys, and the
// label's leader geometry (ported from the hub HUD's place()). The WebGL itself is checked by eye.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEG,
  YAW_MAX,
  PITCH_MAX,
  dragAngle,
  springStep,
  keyNudge,
  formatYaw,
  Orbit,
} from '../src/figures/iceblock/orbit.js';
import { labelGeometry, labelPx, follow, lagFor, EDGE } from '../src/figures/iceblock/label.js';

const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

test('drag gain is 2.6 rad per max(320, width) px', () => {
  assert.ok(near(dragAngle(0, 32, 320, 10), 0.26));
  assert.ok(near(dragAngle(0, 32, 200, 10), 0.26)); // narrow stages use 320
  assert.ok(near(dragAngle(0, 60, 600, 10), 0.26));
});

test('yaw clamps at +-39 deg and pitch at +-12 deg', () => {
  assert.ok(near(dragAngle(0, 5000, 600, YAW_MAX), 39 * DEG));
  assert.ok(near(dragAngle(0, -5000, 600, YAW_MAX), -39 * DEG));
  const o = new Orbit();
  o.grab();
  o.drag(9999, -9999, 592);
  assert.ok(near(o.yaw, YAW_MAX));
  assert.ok(near(o.pitch, -PITCH_MAX));
});

test('a held orbit stays put; released it springs home in about 0.8 s without overshoot', () => {
  const o = new Orbit();
  o.grab();
  o.drag(400, 0, 592);
  const start = o.yaw;
  for (let i = 0; i < 60; i++) o.step(1 / 60);
  assert.equal(o.yaw, start);
  o.release();
  let t = 0;
  let min = Infinity;
  while (t < 0.8) {
    o.step(1 / 60);
    t += 1 / 60;
    min = Math.min(min, o.yaw);
  }
  assert.ok(Math.abs(o.yaw) < 0.06 * start, `yaw ${o.yaw} after 0.8 s`);
  assert.ok(min >= 0, 'no overshoot');
  for (let i = 0; i < 240; i++) o.step(1 / 60);
  assert.equal(o.yaw, 0);
  assert.equal(o.step(1 / 60), false);
});

test('the spring step is exact: one long step equals many short ones', () => {
  let [x, v] = [1, 0];
  for (let i = 0; i < 100; i++) [x, v] = springStep(x, v, 0.01);
  const [x1] = springStep(1, 0, 1);
  assert.ok(near(x, x1, 1e-9));
  const [xb] = springStep(1, 0, 100); // a tab coming back: no blow-up
  assert.ok(Math.abs(xb) < 1e-9);
});

test('a drag and a key held together release only when both let go', () => {
  const o = new Orbit();
  o.grab();
  o.grab();
  o.nudge(10 * DEG, 0);
  o.release();
  o.step(0.5);
  assert.ok(near(o.yaw, 10 * DEG));
  o.release();
  o.step(0.5);
  assert.ok(o.yaw < 10 * DEG);
});

test('arrow keys nudge, others do nothing', () => {
  assert.deepEqual(keyNudge('ArrowRight'), [8 * DEG, 0]);
  assert.deepEqual(keyNudge('ArrowLeft'), [-8 * DEG, 0]);
  assert.deepEqual(keyNudge('ArrowUp'), [0, -4 * DEG]);
  assert.deepEqual(keyNudge('ArrowDown'), [0, 4 * DEG]);
  assert.equal(keyNudge('a'), null);
  const o = new Orbit();
  for (let i = 0; i < 20; i++) o.nudge(8 * DEG, 0);
  assert.ok(near(o.yaw, YAW_MAX));
});

test('readout reads "yaw 12°", ASCII minus, never -0', () => {
  assert.equal(formatYaw(12 * DEG), 'yaw 12°');
  assert.equal(formatYaw(-7.4 * DEG), 'yaw -7°');
  assert.equal(formatYaw(-0.2 * DEG), 'yaw 0°');
});

test('label: level rule of at least 128 px, then a 45 deg elbow onto the anchor (desktop)', () => {
  const anchor = { x: 360, y: 150 };
  const g = labelGeometry({ anchor, w: 592, chars: 9 });
  const [[sx, sy], [ex, ey], [ax, ay]] = g.points;
  assert.equal(sy, ey);
  assert.ok(ex - sx >= 128);
  assert.ok(near(ax - ex, ay - ey), '45 deg');
  assert.deepEqual([ax, ay], [anchor.x, anchor.y]);
  assert.ok(g.y + g.px * 1.2 <= ey, 'text sits above the rule');
  assert.ok(g.textW + 8 <= ex - sx, 'rule runs under all of its words');
});

test('label: a long name lengthens the rule; the label stays inside the stage', () => {
  const g = labelGeometry({ anchor: { x: 360, y: 150 }, w: 592, chars: 19 });
  assert.ok(g.points[1][0] - g.points[0][0] >= g.textW + 8);
  assert.ok(g.x >= EDGE && g.y >= EDGE);
});

test('label: near the stage top the elbow shortens so the text stays in', () => {
  const g = labelGeometry({ anchor: { x: 400, y: 60 }, w: 592, chars: 9 });
  assert.ok(g.y >= EDGE - 1e-9);
  const [, [ex, ey], [ax, ay]] = g.points;
  assert.ok(near(ax - ex, ay - ey));
});

test('label: phone stage uses smaller type and a rule of min(128, 20 % of width), clamped to the edge', () => {
  assert.equal(labelPx(320), 11);
  assert.equal(labelPx(592), 14);
  const short = labelGeometry({ anchor: { x: 200, y: 90 }, w: 320, chars: 3 });
  assert.ok(near(short.points[1][0] - short.points[0][0], 0.2 * 320), 'short words: the rule is 20 % of the stage');
  const g = labelGeometry({ anchor: { x: 180, y: 76 }, w: 320, chars: 19 });
  assert.ok(g.x >= EDGE);
  assert.ok(g.x + g.textW <= 320 - EDGE);
  const [, [ex, ey], [ax, ay]] = g.points;
  assert.ok(near(ax - ex, ay - ey), 'elbow keeps 45 deg when the rule is clamped');
});

test('label lag follows its anchor and never trails by more than max', () => {
  const p = follow({ x: 0, y: 0 }, { x: 100, y: 0 }, 0.15, 90);
  assert.ok(near(p.x, 15));
  const q = follow({ x: 0, y: 0 }, { x: 1000, y: 0 }, 0.15, 90);
  assert.ok(near(q.x, 910));
  assert.ok(near(lagFor(1 / 60), 0.15));
  assert.ok(lagFor(1) <= 1 && lagFor(1) > 0.6);
});
