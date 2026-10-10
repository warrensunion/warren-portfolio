// Archer Hero's rules as a pure, seeded simulation: no three.js and no DOM, so the attract mode, the
// playable stage and the Node tests all run the very same code. The world is a path along +z (0..120,
// the archer kept within |x| <= 6); the archer aims on its own at the nearest enemy inside its attack
// disc and fires on a fixed beat, while the player (or the attract policy) moves, dodges and rains
// arrows. step() mutates the state and returns it; the view only reads it.
//
// Stage: wave 1 is 3 enemies at Lv 1, wave 2 is 4 at Lv 1 or 2, then the boss. `left` counts every
// enemy still to beat in the stage, boss included, so it starts at 8.
import { next32 } from './rng.js';

export const PATH_END = 120;
export const ARCHER = { hp: 100, speed: 6, radius: 7, fireEvery: 0.55, arrowSpeed: 26, damage: 10, maxX: 6 };
export const DODGE = { dist: 4, time: 0.22, cooldown: 3 };
export const RAIN = { radius: 3, hits: 6, damage: 12, time: 1.2, cooldown: 8 };
export const XP = { perKill: 20, perLevel: 100 };
export const COINS = { perKill: 5, boss: 50 };
// Enemy HP is 30 + 10 x (level - 1); the boss has its own numbers.
export const ENEMY = { hp: 30, hpPerLevel: 10, speed: 2.6, damage: 8, period: 1.0, reach: 1.3 };
export const BOSS = { level: 5, hp: 300, speed: 2.0, damage: 18, period: 1.4, reach: 2.0 };
export const WAVES = [3, 4]; // then the boss
export const HIT_LIFE = 0.9; // s a damage number stays up

const WINDUP = 0.35; // s from an enemy reaching the archer to its first blow
const ARROW_LIFE = 1.2;
const SPAWN_AHEAD = [18, 26];

const rand = (s) => {
  const [r, a] = next32(s.rng);
  s.rng = a;
  return r;
};
const statsOf = (e) => (e.boss ? BOSS : ENEMY);
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

export function createGame({ seed = 1 } = {}) {
  const s = {
    seed,
    rng: seed >>> 0,
    t: 0,
    archer: {
      x: 0,
      z: 2,
      yaw: 0,
      face: 0, // the way the body points: at the target, else the way it walks
      moving: 0, // 0..1 of full speed, for the walk cycle
      hp: ARCHER.hp,
      maxHp: ARCHER.hp,
      dodgeCd: 0,
      rainCd: 0,
      fireCd: 0,
      dashT: 0,
      dashX: 0,
      dashZ: 0,
      shotT: -1, // when the last arrow left the bow
      hurtT: -1, // when the archer was last hit
      target: null, // the id of the enemy being aimed at
    },
    enemies: [],
    arrows: [],
    rains: [],
    hits: [],
    wave: 0,
    left: WAVES.reduce((a, b) => a + b, 0) + 1,
    coins: 0,
    xp: 0,
    level: 1,
    nextId: 1,
    status: 'playing',
  };
  spawnWave(s, 1);
  return s;
}

/** Adds one enemy (the waves use this; so do the tests). Returns it. */
export function addEnemy(s, { x, z, level = 1, boss = false }) {
  const hp = boss ? BOSS.hp : ENEMY.hp + ENEMY.hpPerLevel * (level - 1);
  const e = { id: s.nextId++, x, z, hp, maxHp: hp, level: boss ? BOSS.level : level, boss, atkCd: WINDUP, face: Math.PI, hitT: -1 };
  s.enemies.push(e);
  return e;
}

function spawnWave(s, n) {
  s.wave = n;
  const count = WAVES[n - 1];
  for (let i = 0; i < count; i++) {
    const x = -4 + 8 * rand(s);
    const z = Math.min(PATH_END - 2, s.archer.z + SPAWN_AHEAD[0] + (SPAWN_AHEAD[1] - SPAWN_AHEAD[0]) * rand(s));
    const level = n === 1 ? 1 : rand(s) < 0.5 ? 1 : 2;
    addEnemy(s, { x, z, level });
  }
}

/** Clears whatever wave is on and brings on the boss (the stage's end; attract stage 2 starts here). */
export function spawnBoss(s) {
  s.enemies = [];
  s.arrows = [];
  s.rains = [];
  s.wave = WAVES.length + 1;
  s.left = 1;
  addEnemy(s, { x: 0, z: Math.min(PATH_END - 2, s.archer.z + 16), boss: true });
  return s;
}

/** The enemy the archer aims at: the nearest one inside the attack disc, or null. */
export function nearestInRange(s) {
  let best = null;
  let bd = ARCHER.radius;
  for (const e of s.enemies) {
    const d = dist(s.archer, e);
    if (d <= bd) {
      best = e;
      bd = d;
    }
  }
  return best;
}

const byId = (s, id) => s.enemies.find((e) => e.id === id) || null;

function hurt(s, e, amount) {
  e.hp -= amount;
  e.hitT = s.t;
  s.hits.push({ x: e.x, y: e.boss ? 3.6 : 1.7, z: e.z, amount, age: 0 });
}

export function step(s, input, dt) {
  if (s.status !== 'playing' || !(dt > 0)) return s;
  const a = s.archer;
  s.t += dt;
  if (Number.isFinite(input.yaw)) a.yaw = input.yaw;
  a.dodgeCd = Math.max(0, a.dodgeCd - dt);
  a.rainCd = Math.max(0, a.rainCd - dt);
  a.fireCd = Math.max(0, a.fireCd - dt);

  // Move intent in world space: mx, mz are camera right and forward, turned by the camera's yaw.
  let mx = clamp(input.mx || 0, -1, 1);
  let mz = clamp(input.mz || 0, -1, 1);
  const m = Math.hypot(mx, mz);
  if (m > 1) {
    mx /= m;
    mz /= m;
  }
  const sy = Math.sin(a.yaw);
  const cy = Math.cos(a.yaw);
  const wx = -mx * cy + mz * sy;
  const wz = mx * sy + mz * cy;

  // The dodge comes first, so a dodge pressed on the tick an enemy's blow lands avoids it.
  if (input.dodge && a.dodgeCd <= 0 && a.dashT <= 0) {
    const l = Math.hypot(wx, wz);
    // Along the move if there is one, else a step back from where the camera looks.
    a.dashX = l > 0.05 ? wx / l : -sy;
    a.dashZ = l > 0.05 ? wz / l : -cy;
    a.dashT = DODGE.time;
    a.dodgeCd = DODGE.cooldown;
  }
  const invulnerable = a.dashT > 0;
  if (a.dashT > 0) {
    const d = (DODGE.dist / DODGE.time) * Math.min(dt, a.dashT);
    a.x += a.dashX * d;
    a.z += a.dashZ * d;
    a.dashT = Math.max(0, a.dashT - dt);
    a.moving = 1;
  } else {
    a.x += wx * ARCHER.speed * dt;
    a.z += wz * ARCHER.speed * dt;
    a.moving = Math.min(1, Math.hypot(wx, wz));
  }
  a.x = clamp(a.x, -ARCHER.maxX, ARCHER.maxX);
  a.z = clamp(a.z, 0, PATH_END);

  // Auto-aim, the rain and the bow's beat.
  const target = nearestInRange(s);
  a.target = target ? target.id : null;
  if (target) a.face = Math.atan2(target.x - a.x, target.z - a.z);
  else if (a.moving > 0.05) a.face = Math.atan2(wx, wz);
  if (input.rain && a.rainCd <= 0 && target) {
    s.rains.push({ x: target.x, z: target.z, age: 0, done: 0 });
    a.rainCd = RAIN.cooldown;
  }
  if (target && a.fireCd <= 0) {
    const d = dist(a, target) || 1;
    s.arrows.push({ x: a.x, z: a.z, vx: ((target.x - a.x) / d) * ARCHER.arrowSpeed, vz: ((target.z - a.z) / d) * ARCHER.arrowSpeed, target: target.id, life: ARROW_LIFE });
    a.fireCd = ARCHER.fireEvery;
    a.shotT = s.t;
  }

  // Arrows home on their target while it lives and strike when this step would reach it.
  for (const r of s.arrows) {
    const e = r.target != null ? byId(s, r.target) : null;
    if (e && e.hp > 0) {
      const d = dist(r, e);
      const reach = ARCHER.arrowSpeed * dt + (e.boss ? 1.2 : 0.6);
      if (d <= reach) {
        hurt(s, e, ARCHER.damage);
        r.life = 0;
        continue;
      }
      r.vx = ((e.x - r.x) / d) * ARCHER.arrowSpeed;
      r.vz = ((e.z - r.z) / d) * ARCHER.arrowSpeed;
    } else {
      r.target = null;
    }
    r.x += r.vx * dt;
    r.z += r.vz * dt;
    r.life -= dt;
  }
  s.arrows = s.arrows.filter((r) => r.life > 0);

  // Arrow rain: 6 volleys spread over 1.2 s on the circle where it was cast.
  for (const rain of s.rains) {
    rain.age += dt;
    const due = Math.min(RAIN.hits, Math.floor((rain.age / RAIN.time) * RAIN.hits + 1e-9));
    for (; rain.done < due; rain.done++) {
      for (const e of s.enemies) if (e.hp > 0 && dist(rain, e) <= RAIN.radius) hurt(s, e, RAIN.damage);
    }
  }
  s.rains = s.rains.filter((r) => r.done < RAIN.hits);

  collectDead(s);

  // Enemies close in, keep apart, and strike when their blow is due.
  for (const e of s.enemies) {
    const st = statsOf(e);
    const d = dist(a, e);
    e.face = Math.atan2(a.x - e.x, a.z - e.z);
    const stopAt = st.reach * 0.8;
    if (d > stopAt) {
      const k = Math.min(st.speed * dt, d - stopAt) / d;
      e.x += (a.x - e.x) * k;
      e.z += (a.z - e.z) * k;
    }
    e.atkCd = Math.max(0, e.atkCd - dt);
    if (dist(a, e) <= st.reach) {
      if (e.atkCd <= 0) {
        e.atkCd = st.period;
        if (!invulnerable) {
          a.hp = Math.max(0, a.hp - st.damage);
          a.hurtT = s.t;
        }
      }
    } else {
      e.atkCd = Math.max(e.atkCd, WINDUP);
    }
  }
  for (let i = 0; i < s.enemies.length; i++) {
    for (let j = i + 1; j < s.enemies.length; j++) {
      const p = s.enemies[i];
      const q = s.enemies[j];
      const min = p.boss || q.boss ? 2.2 : 1.1;
      const d = dist(p, q);
      if (d < min && d > 1e-6) {
        const push = (min - d) / 2 / d;
        const dx = (q.x - p.x) * push;
        const dz = (q.z - p.z) * push;
        p.x -= dx;
        p.z -= dz;
        q.x += dx;
        q.z += dz;
      }
    }
  }

  for (const h of s.hits) h.age += dt;
  s.hits = s.hits.filter((h) => h.age < HIT_LIFE);

  if (a.hp <= 0) s.status = 'lost';
  return s;
}

function collectDead(s) {
  const dead = s.enemies.filter((e) => e.hp <= 0);
  if (!dead.length) return;
  s.enemies = s.enemies.filter((e) => e.hp > 0);
  for (const e of dead) {
    s.xp += XP.perKill;
    s.coins += e.boss ? COINS.boss : COINS.perKill;
    s.left = Math.max(0, s.left - 1);
    while (s.xp >= XP.perLevel) {
      s.xp -= XP.perLevel;
      s.level += 1;
    }
    if (e.boss) s.status = 'won';
  }
  if (s.archer.target != null && !byId(s, s.archer.target)) s.archer.target = null;
  if (s.status === 'playing' && !s.enemies.length) {
    if (s.wave < WAVES.length) spawnWave(s, s.wave + 1);
    else if (s.wave === WAVES.length) spawnBoss(s);
  }
}
