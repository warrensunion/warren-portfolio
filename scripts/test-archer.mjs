// The Archer Hero track figure plays a short stage of the game. Its rules (auto-aim, dodge, arrow rain,
// waves, XP and coins), the attract-mode player and the pure parts of the input are pinned here without
// a browser, so the playable figure and its scripted demo can be trusted before any pixel is drawn.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, step, nearestInRange, spawnBoss, addEnemy } from '../src/figures/archer/sim.js';

const DT = 1 / 60;
const IDLE = { mx: 0, mz: 0, yaw: 0, dodge: false, rain: false };
const near = (a, b, eps, what = '') => assert.ok(Math.abs(a - b) <= eps, `${what} ${a} is not within ${eps} of ${b}`);

// A game with no enemies and no waves to come, the archer at (0, 10) facing +z: each test places its own.
function empty(seed = 1) {
  const g = createGame({ seed });
  g.enemies = [];
  g.wave = 3; // past the waves, so clearing the field spawns nothing
  g.left = 0;
  g.archer.x = 0;
  g.archer.z = 10;
  return g;
}

test('sim: archer auto-aims the nearest enemy in range', () => {
  const g = empty();
  const far = addEnemy(g, { x: 0, z: 15 }); // 5 u away
  const close = addEnemy(g, { x: 3, z: 10 }); // 3 u away
  assert.equal(nearestInRange(g), close);
  step(g, IDLE, DT);
  assert.equal(g.archer.target, close.id);
  assert.notEqual(g.archer.target, far.id);

  const h = empty();
  addEnemy(h, { x: 0, z: 19 }); // 9 u away, outside the 7 u disc
  assert.equal(nearestInRange(h), null);
  step(h, IDLE, DT);
  assert.equal(h.archer.target, null);
});

test('sim: arrows deal 10 and kills give 20 XP and 5 coins', () => {
  const g = createGame({ seed: 7 });
  assert.equal(g.left, 8);
  let sawTen = false;
  for (let i = 0; i < 60 * 30 && g.left === 8; i++) {
    step(g, { ...IDLE, mz: nearestInRange(g) ? 0 : 1 }, DT);
    if (g.hits.some((h) => h.amount === 10)) sawTen = true;
  }
  assert.ok(sawTen, 'an arrow hit shows a 10');
  assert.equal(g.xp, 20);
  assert.equal(g.coins, 5);
  assert.equal(g.left, 7);
});

test('sim: dodge is invulnerable and has a 3 s cooldown', () => {
  const g = empty();
  const e = addEnemy(g, { x: 0, z: 11 }); // 1 u away: in melee range
  e.atkCd = 0; // its attack is due now
  step(g, { ...IDLE, dodge: true }, DT);
  near(g.archer.dodgeCd, 3, 0.05, 'dodgeCd after the press');
  for (let t = DT; t < 0.22; t += DT) {
    assert.equal(g.archer.hp, 100, 'no damage while dashing');
    step(g, IDLE, DT);
  }
  while (g.t < 1) step(g, IDLE, DT);
  const cd = g.archer.dodgeCd;
  near(cd, 2, 0.05, 'dodgeCd at 1 s');
  step(g, { ...IDLE, dodge: true }, DT);
  assert.equal(g.archer.dashT, 0, 'a second press during the cooldown does not dash');
  near(g.archer.dodgeCd, cd - DT, 1e-9, 'and does not reset the cooldown');
});

test('sim: dodge pressed on the lethal tick saves the archer', () => {
  const g = empty();
  g.archer.hp = 5;
  const e = addEnemy(g, { x: 0, z: 11 });
  e.atkCd = 0;
  step(g, { ...IDLE, dodge: true }, DT);
  assert.equal(g.archer.hp, 5);
  assert.equal(g.status, 'playing');
  // Without the dodge the same tick is lethal.
  const h = empty();
  h.archer.hp = 5;
  addEnemy(h, { x: 0, z: 11 }).atkCd = 0;
  step(h, IDLE, DT);
  assert.equal(h.status, 'lost');
});

test('sim: arrow rain hits everything within 3 u of the target 6 times', () => {
  const g = empty();
  // Three in melee range around the archer (they stand still there), one far away.
  const inside = [addEnemy(g, { x: 0, z: 11.1 }), addEnemy(g, { x: 1.1, z: 10.3 }), addEnemy(g, { x: -1.1, z: 10.3 })];
  for (const e of inside) e.hp = e.maxHp = 500;
  const outside = addEnemy(g, { x: 0, z: 60 });
  step(g, { ...IDLE, rain: true }, DT);
  near(g.archer.rainCd, 8, 0.05, 'rainCd after the cast');
  while (g.t < 1.5) step(g, IDLE, DT);
  const targetId = g.archer.target;
  for (const e of inside) {
    const lost = e.maxHp - e.hp;
    if (e.id === targetId) assert.ok(lost >= 72, `the target lost ${lost}`);
    else assert.ok(lost >= 72 && (lost - 72) % 10 === 0, `an enemy beside it lost ${lost}`);
  }
  assert.equal(outside.hp, outside.maxHp);
  assert.ok(inside.filter((e) => e.id !== targetId).some((e) => e.maxHp - e.hp === 72), 'one beside the target took exactly the rain');
});

test('sim: level up at 100 XP', () => {
  const g = empty();
  for (let k = 0; k < 5; k++) {
    const e = addEnemy(g, { x: 0, z: 13 });
    e.hp = 1;
    for (let i = 0; i < 120 && g.enemies.includes(e); i++) step(g, IDLE, DT);
    assert.ok(!g.enemies.includes(e), `kill ${k + 1}`);
  }
  assert.equal(g.level, 2);
  assert.equal(g.xp, 0);
  assert.equal(g.coins, 25);
});

test('sim: killing the boss wins; hp 0 loses', () => {
  const g = createGame({ seed: 3 });
  spawnBoss(g);
  assert.equal(g.left, 1);
  const boss = g.enemies[0];
  assert.ok(boss.boss && boss.level === 5 && boss.maxHp === 300);
  boss.hp = 5;
  boss.x = g.archer.x;
  boss.z = g.archer.z + 4;
  const coins = g.coins;
  for (let i = 0; i < 180 && g.status === 'playing'; i++) step(g, IDLE, DT);
  assert.equal(g.status, 'won');
  assert.equal(g.coins, coins + 50);
  assert.equal(g.left, 0);

  const h = empty();
  h.archer.hp = 8;
  addEnemy(h, { x: 0, z: 11 }).atkCd = 0;
  step(h, IDLE, DT);
  assert.equal(h.archer.hp, 0);
  assert.equal(h.status, 'lost');
  const t = h.t;
  step(h, { ...IDLE, mz: 1 }, DT);
  assert.equal(h.t, t, 'a finished game no longer advances');
});

test('sim: same seed, same run', () => {
  const run = () => {
    const g = createGame({ seed: 11 });
    for (let i = 0; i < 600; i++) {
      const k = Math.floor(i / 40);
      step(g, { mx: Math.sin(k) * 0.6, mz: k % 3 === 0 ? 1 : 0.2, yaw: Math.sin(i / 90) * 0.4, dodge: i % 97 === 0, rain: i % 151 === 0 }, DT);
    }
    return g;
  };
  assert.deepEqual(run(), run());
});

test('attract: clears the stage alone within 90 simulated seconds', async () => {
  const { attractInput } = await import('../src/figures/archer/attract.js');
  const g = createGame({ seed: 7 });
  let i = 0;
  for (; i < 5400 && g.status === 'playing'; i++) step(g, attractInput(g), DT);
  assert.equal(g.status, 'won', `status ${g.status} after ${i} steps, hp ${g.archer.hp}, left ${g.left}`);
  assert.ok(g.archer.hp > 0);
});
