// The attract mode's player: a few plain rules that produce the same input a visitor would (move, dodge,
// rain), so the demo runs through the real simulation and proves the stage can be cleared. It walks up
// the path while nothing is in range, stands and lets the auto-aim work once something is, backs off
// sideways from anything that gets close, rains arrows on a crowd or the boss, and dodges a blow that is
// about to land.
import { nearestInRange, RAIN, BOSS, ENEMY } from './sim.js';

const KITE = 2.5; // u: closer than this, back off
const DODGE_LEAD = 0.15; // s: dodge a blow due this soon
const CROWD = 3; // enemies within the rain's radius of the target that are worth a rain

export function attractInput(s) {
  const a = s.archer;
  const out = { mx: 0, mz: 0, yaw: a.yaw, dodge: false, rain: false };
  const target = nearestInRange(s);

  let near = null;
  let nd = Infinity;
  for (const e of s.enemies) {
    const d = Math.hypot(e.x - a.x, e.z - a.z);
    if (d < nd) [near, nd] = [e, d];
  }

  // Where to go, in world space.
  let wx = 0;
  let wz = 0;
  if (!target) {
    wz = 1;
    wx = Math.max(-0.5, Math.min(0.5, -a.x * 0.4)); // drift back to the middle of the path
  } else if (near && nd < KITE + (near.boss ? BOSS.reach - ENEMY.reach : 0)) {
    const ax = (a.x - near.x) / (nd || 1);
    const az = (a.z - near.z) / (nd || 1);
    // Sideways: whichever perpendicular heads toward the middle of the path, so the archer circles
    // instead of backing into the path's edge or its start.
    let px = -az;
    let pz = ax;
    if (px * -a.x + pz * (a.z < 6 ? 1 : 0) < 0) [px, pz] = [-px, -pz];
    wx = ax * 0.6 + px * 0.8;
    wz = az * 0.6 + pz * 0.8;
  }
  // World direction to camera-space input: the inverse of sim.js's turn (the matrix is its own inverse).
  const sy = Math.sin(a.yaw);
  const cy = Math.cos(a.yaw);
  out.mx = -wx * cy + wz * sy;
  out.mz = wx * sy + wz * cy;

  if (target && a.rainCd <= 0) {
    const crowd = s.enemies.filter((e) => Math.hypot(e.x - target.x, e.z - target.z) <= RAIN.radius).length;
    out.rain = target.boss || crowd >= CROWD;
  }

  if (a.dodgeCd <= 0 && a.dashT <= 0) {
    for (const e of s.enemies) {
      const reach = e.boss ? BOSS.reach : ENEMY.reach;
      if (Math.hypot(e.x - a.x, e.z - a.z) <= reach && e.atkCd <= DODGE_LEAD) out.dodge = true;
    }
  }
  return out;
}
