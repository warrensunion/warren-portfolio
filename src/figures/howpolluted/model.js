// The demo pile the visitor cleans up (spec 5.4, stage 5). Pure: no DOM, so it is Node-tested.
//
// The pile is HowPolluted's own planPile at a fixed demo value (seed 4917), planned once on the first
// layout. Every piece then keeps its place as fractions of the ground band (nx, ny in 0..1) and its size
// as a fraction of the square root of the band's area, so a resize moves and scales the pile with the
// plate and the coverage, which is area over area, does not change. Dragging or flicking a piece moves it
// inside the band and it keeps counting; only pickAt() takes one away, and the coverage and the grade
// follow pileCoverage and gradeFor exactly as HowPolluted computes them.
import { planPile, pileCoverage } from './litter-sim.js';
import { gradeFor } from './grades.js';

export const SEED = 4917;
const FRICTION = 4; // 1/s: speed falls by e^-4 each second
const RESTITUTION = 0.4;
const REST_SPEED = 5; // px/s

// The drawn sprite box in the piece's own frame (scene.js draws it at translate(x, y), rotate(rot),
// scale(flip ? -1 : 1, 1), then drawImage at -anchor * scale): undo rotation and flip, then test the box.
function contains(it, px, py) {
  const dx = px - it.x;
  const dy = py - it.y;
  const c = Math.cos(-it.rot);
  const s = Math.sin(-it.rot);
  let lx = dx * c - dy * s;
  const ly = dx * s + dy * c;
  if (it.flip) lx = -lx;
  const { w, h, anchor } = it.sprite;
  const k = it.scale;
  return lx >= -anchor[0] * k && lx <= (w - anchor[0]) * k && ly >= -anchor[1] * k && ly <= (h - anchor[1]) * k;
}

// The centre of the drawn box, in scene px (where a click lands squarely on the piece).
function centreOf(it) {
  const { w, h, anchor } = it.sprite;
  let lx = (w / 2 - anchor[0]) * it.scale;
  const ly = (h / 2 - anchor[1]) * it.scale;
  if (it.flip) lx = -lx;
  const c = Math.cos(it.rot);
  const s = Math.sin(it.rot);
  return [it.x + lx * c - ly * s, it.y + lx * s + ly * c];
}

export function createModel({ ground, sprites, value }) {
  let rect = null;
  let plan = null; // [{ id, sprite, nx, ny, ns, rot, flip, t }], the pile as planned
  let live = []; // the same pieces' current state: { id, sprite, nx, ny, ns, rot, flip, t, vx, vy }
  const removed = new Set();
  const grabs = new Map(); // id -> grab offset in px

  const span = () => rect.bottom - rect.top;
  const root = () => Math.sqrt(rect.w * span());
  const px = (p) => ({
    id: p.id,
    sprite: p.sprite,
    x: p.nx * rect.w,
    y: rect.top + p.ny * span(),
    scale: p.ns * root(),
    rot: p.rot,
    flip: p.flip,
    t: p.t,
  });
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const byId = (id) => live.find((p) => p.id === id && !removed.has(id));

  function restore() {
    live = plan.map((p) => ({ ...p, vx: 0, vy: 0 }));
    removed.clear();
    grabs.clear();
  }

  // Front-most first: the largest y is drawn last, so it is the one a click lands on.
  function topmostAt(x, y) {
    const list = api.items();
    for (let i = list.length - 1; i >= 0; i--) if (contains(list[i], x, y)) return list[i].id;
    return null;
  }

  function place(p, x, y) {
    p.nx = clamp(x, 0, rect.w) / rect.w;
    p.ny = (clamp(y, rect.top, rect.bottom) - rect.top) / span();
  }

  const api = {
    ground,
    value,
    layout(r) {
      if (!(r && r.w > 0 && r.bottom > r.top)) return;
      rect = { w: r.w, top: r.top, bottom: r.bottom };
      if (plan) return;
      const k = root();
      plan = planPile(value, { w: rect.w, top: rect.top, bottom: rect.bottom }, sprites, SEED).map((it, id) => ({
        id,
        sprite: it.sprite,
        nx: it.x / rect.w,
        ny: (it.y - rect.top) / span(),
        ns: it.scale / k,
        rot: it.rot,
        flip: it.flip,
        t: it.t,
      }));
      restore();
    },
    rect: () => (rect ? { ...rect } : null),
    // Live pieces in scene px, back to front, each with the centre of its drawn box (cx, cy).
    items() {
      if (!rect) return [];
      return live
        .filter((p) => !removed.has(p.id))
        .map((p) => {
          const it = px(p);
          [it.cx, it.cy] = centreOf(it);
          return it;
        })
        .sort((a, b) => a.y - b.y || a.id - b.id);
    },
    count: () => live.length - removed.size,
    total: () => live.length,
    coverage() {
      if (!rect) return 0;
      const items = api.items();
      return items.length ? pileCoverage(items, rect) : 0;
    },
    grade: () => gradeFor('litter', api.coverage()),
    pickAt(x, y) {
      const id = topmostAt(x, y);
      if (id == null) return false;
      removed.add(id);
      grabs.delete(id);
      return true;
    },
    grabAt(x, y) {
      const id = topmostAt(x, y);
      if (id == null) return null;
      const p = byId(id);
      const it = px(p);
      p.vx = p.vy = 0;
      grabs.set(id, [x - it.x, y - it.y]);
      return id;
    },
    drag(id, x, y) {
      const p = byId(id);
      if (!p) return;
      const [ox, oy] = grabs.get(id) || [0, 0];
      place(p, x - ox, y - oy);
    },
    release(id, vx = 0, vy = 0) {
      const p = byId(id);
      grabs.delete(id);
      if (!p) return;
      p.vx = Number.isFinite(vx) ? vx : 0;
      p.vy = Number.isFinite(vy) ? vy : 0;
      if (Math.hypot(p.vx, p.vy) < REST_SPEED) p.vx = p.vy = 0;
    },
    moving: () => live.some((p) => !removed.has(p.id) && (p.vx || p.vy)),
    // Flicked pieces slide with friction and bounce off the band's edges, then rest.
    step(dt) {
      if (!rect || !(dt > 0)) return;
      const decay = Math.exp(-FRICTION * dt);
      for (const p of live) {
        if (removed.has(p.id) || grabs.has(p.id) || !(p.vx || p.vy)) continue;
        let x = p.nx * rect.w + p.vx * dt;
        let y = rect.top + p.ny * span() + p.vy * dt;
        if (x < 0 || x > rect.w) {
          x = x < 0 ? -x * RESTITUTION : rect.w - (x - rect.w) * RESTITUTION;
          p.vx = -p.vx * RESTITUTION;
        }
        if (y < rect.top || y > rect.bottom) {
          y = y < rect.top ? rect.top + (rect.top - y) * RESTITUTION : rect.bottom - (y - rect.bottom) * RESTITUTION;
          p.vy = -p.vy * RESTITUTION;
        }
        place(p, x, y);
        p.vx *= decay;
        p.vy *= decay;
        if (Math.hypot(p.vx, p.vy) < REST_SPEED) p.vx = p.vy = 0;
      }
    },
    reset() {
      if (plan) restore();
    },
  };
  return api;
}
