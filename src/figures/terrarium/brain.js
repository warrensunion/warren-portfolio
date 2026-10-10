// Ported from terrarium src/ui/brain-panel.js at 7612a40 (Warren's own project). Changes: only createBrainViz and its helpers (sprite, hiddenDepths, the palette), without the panel chrome (header, stats, lineage, close button, CSS); reduced motion comes in as an option instead of env.js; createBrainViz is exported; labels in the site's mono face.
/**
 * The brain inspector: a specimen plate for one creature's mind. The point of
 * the whole project is that you can watch a NEAT network think, so the
 * network is drawn live: every frame each edge glows with the signal it is
 * carrying (|source activation x weight|), nodes glow with their activation,
 * and strong signals send a spore-cyan pulse down the wire. Cyan appears only
 * when something fires; at rest the brain is beetle violet on moss.
 *
 * Layout is columnar (inputs, hidden by longest path, outputs) and *stable*:
 * a hidden node gets a sort key the first time it is seen, from where its
 * neighbours were, and keeps it, so when the genome grows the new neuron
 * slides in between its parents and nothing else jumps. Every value the eye
 * tracks (position, opacity, glow) is eased, so there is no flicker.
 *
 * The worker sends values per node in genome.nodes order; ids 0..7 are the
 * senses, 8 bias, 9..12 the actions, hidden from 13.
 */

const IN_LABELS = ['food ←→', 'food ahead', 'food near', 'others ←→', 'others ahead', 'others near', 'energy', 'wall near', 'bias'];
const OUT_LABELS = ['turn', 'thrust', 'eat', 'mate'];
const LABEL_FONT = '500 11px "IBM Plex Mono", ui-monospace, monospace';

// colours as rgb triples so alpha can be eased per frame
const WARM = [214, 195, 90]; // lichen: excitatory
const COOL = [146, 124, 214]; // lifted beetle violet: inhibitory
const VIOLET = [140, 114, 200];
const CYAN = [95, 227, 216];
const FOG = [201, 216, 210];
const INK = 'rgb(20,36,31)';
const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a < 0 ? 0 : a > 1 ? 1 : a})`;
const damp = (a, b, lambda, dt) => a + (b - a) * (1 - Math.exp(-lambda * dt));


/* ------------------------------------------------------------------ canvas */

function sprite(c, size = 64) {
  const s = document.createElement('canvas');
  s.width = s.height = size;
  const g = s.getContext('2d');
  const r = size / 2;
  const grad = g.createRadialGradient(r, r, 0, r, r, r);
  grad.addColorStop(0, rgba([255, 255, 255], 0.95));
  grad.addColorStop(0.12, rgba(c, 0.9));
  grad.addColorStop(0.4, rgba(c, 0.32));
  grad.addColorStop(1, rgba(c, 0));
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return s;
}

/** longest-path depth of each hidden node; recurrent (back) edges are ignored */
function hiddenDepths(g) {
  const hidden = new Set(g.nodes.filter((n) => n.type === 'hidden').map((n) => n.id));
  const succ = new Map([...hidden].map((h) => [h, []]));
  for (const c of g.conns) if (hidden.has(c.from) && hidden.has(c.to) && c.from !== c.to) succ.get(c.from).push(c.to);
  // DFS colouring finds back edges so cycles cannot stretch the layout
  const state = new Map();
  const back = new Set();
  for (const h of [...hidden].sort((a, b) => a - b)) {
    if (state.has(h)) continue;
    const stack = [[h, 0]];
    state.set(h, 1);
    while (stack.length) {
      const top = stack[stack.length - 1];
      const out = succ.get(top[0]);
      if (top[1] < out.length) {
        const t = out[top[1]++];
        const st = state.get(t);
        if (st === 1) back.add(`${top[0]}>${t}`);
        else if (!st) { state.set(t, 1); stack.push([t, 0]); }
      } else { state.set(top[0], 2); stack.pop(); }
    }
  }
  const indeg = new Map([...hidden].map((h) => [h, 0]));
  for (const [f, outs] of succ) for (const t of outs) if (!back.has(`${f}>${t}`)) indeg.set(t, indeg.get(t) + 1);
  const depth = new Map([...hidden].map((h) => [h, 1]));
  const queue = [...hidden].filter((h) => indeg.get(h) === 0);
  while (queue.length) {
    const f = queue.shift();
    for (const t of succ.get(f)) {
      if (back.has(`${f}>${t}`)) continue;
      depth.set(t, Math.max(depth.get(t), depth.get(f) + 1));
      indeg.set(t, indeg.get(t) - 1);
      if (!indeg.get(t)) queue.push(t);
    }
  }
  return depth;
}

export function createBrainViz(canvas, { reducedMotion = false } = {}) {
  const ctx = canvas.getContext('2d');
  const reduced = reducedMotion;
  const cyan = sprite(CYAN);
  const violet = sprite(VIOLET);
  /** @type {Map<number, any>} */
  const nodes = new Map();
  /** @type {Map<number, any>} */
  const edges = new Map();
  const keys = new Map(); // stable vertical sort key per hidden node
  let idx = new Map(); // node id -> index into values
  let ncols = 2;
  let W = 0, H = 0, dpr = 1, padL = 84, padR = 48;
  let raf = 0, lastT = 0, life = 1, tLife = 1, stopAt = 0, frameNo = 0, glowK = 1, pulseK = 1;
  const base = document.createElement('canvas'); // cached resting wiring
  const bctx = base.getContext('2d');
  const glow = document.createElement('canvas'); // low-res additive signal layer
  const gctx = glow.getContext('2d');
  let baseDirty = true;


  function measure() {
    const r = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.max(1, Math.round(r.width));
    H = Math.max(1, Math.round(r.height));
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    base.width = canvas.width;
    base.height = canvas.height;
    glow.width = W;
    glow.height = H;
    baseDirty = true;
    ctx.font = LABEL_FONT;
    padL = Math.ceil(Math.max(...IN_LABELS.map((s) => ctx.measureText(s).width))) + 20;
    padR = Math.ceil(Math.max(...OUT_LABELS.map((s) => ctx.measureText(s).width))) + 20;
    if (!raf) frame(performance.now(), true);
  }

  function setGenome(g, fresh) {
    if (fresh) { nodes.clear(); edges.clear(); keys.clear(); life = tLife = 1; }
    baseDirty = true;
    idx = new Map(g.nodes.map((n, i) => [n.id, i]));
    const depth = hiddenDepths(g);
    let maxD = 0;
    for (const d of depth.values()) maxD = Math.max(maxD, d);
    ncols = maxD + 2;
    const colOf = (n) => (n.type === 'in' || n.type === 'bias' ? 0 : n.type === 'out' ? ncols - 1 : depth.get(n.id));
    // hidden columns keep clear of the sense and action columns, so a first-layer
    // neuron never sits on top of an input when the brain gets deep
    const xOf = (n) => {
      const c = colOf(n);
      if (c === 0) return 0;
      if (c === ncols - 1) return 1;
      return maxD === 1 ? 0.5 : 0.17 + (0.66 * (c - 1)) / (maxD - 1);
    };

    // target ys for fixed columns first, so new hidden nodes can key off them
    const ty = new Map();
    const ins = g.nodes.filter((n) => n.type === 'in').sort((a, b) => a.id - b.id);
    const bias = g.nodes.filter((n) => n.type === 'bias');
    const outs = g.nodes.filter((n) => n.type === 'out').sort((a, b) => a.id - b.id);
    const slots = ins.length + bias.length + 0.5; // a half-step gap sets bias apart
    ins.forEach((n, i) => ty.set(n.id, i / slots));
    bias.forEach((n) => ty.set(n.id, 1));
    const oSpan = Math.min(1, 0.26 * (outs.length - 1));
    outs.forEach((n, i) => ty.set(n.id, outs.length > 1 ? 0.5 - oSpan / 2 + (i / (outs.length - 1)) * oSpan : 0.5));

    // stable keys: a new hidden node is keyed by where its neighbours are
    const nbr = new Map();
    for (const c of g.conns) {
      if (!nbr.has(c.to)) nbr.set(c.to, []);
      if (!nbr.has(c.from)) nbr.set(c.from, []);
      nbr.get(c.to).push(c.from);
      nbr.get(c.from).push(c.to);
    }
    const hidden = g.nodes.filter((n) => n.type === 'hidden').sort((a, b) => depth.get(a.id) - depth.get(b.id) || a.id - b.id);
    const known = (nid) => (keys.has(nid) ? keys.get(nid) : ty.has(nid) ? ty.get(nid) : nodes.get(nid)?.ty);
    for (const h of hidden) {
      if (keys.has(h.id)) continue;
      const ys = (nbr.get(h.id) || []).map(known).filter((v) => v != null);
      keys.set(h.id, ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : 0.5);
    }
    const cols = new Map();
    for (const h of hidden) {
      const c = depth.get(h.id);
      if (!cols.has(c)) cols.set(c, []);
      cols.get(c).push(h);
    }
    for (const list of cols.values()) {
      list.sort((a, b) => keys.get(a.id) - keys.get(b.id) || a.id - b.id);
      const n = list.length;
      const step = n > 1 ? Math.min(1 / (n - 1), 0.17) : 0;
      // centre the column on its members' average key so it sits near its wiring
      const centre = Math.min(1 - (step * (n - 1)) / 2, Math.max((step * (n - 1)) / 2, list.reduce((a, h) => a + keys.get(h.id), 0) / n));
      list.forEach((h, i) => ty.set(h.id, centre - (step * (n - 1)) / 2 + i * step));
    }

    const live = new Set();
    for (const n of g.nodes) {
      live.add(n.id);
      const tx = xOf(n);
      let s = nodes.get(n.id);
      if (!s) {
        // a newborn neuron grows out of the wiring it splits; on a fresh brain
        // everything fades in where it belongs, column by column
        let x = tx, y = ty.get(n.id);
        if (!fresh) {
          const ps = (nbr.get(n.id) || []).map((m) => nodes.get(m)).filter(Boolean);
          if (ps.length) { x = ps.reduce((a, p) => a + p.x, 0) / ps.length; y = ps.reduce((a, p) => a + p.y, 0) / ps.length; }
        }
        s = { id: n.id, x, y, a: 0, v: 0, tv: 0, delay: fresh ? colOf(n) * 0.07 : 0 };
        nodes.set(n.id, s);
      }
      s.type = n.type;
      s.tx = tx;
      s.ty = ty.get(n.id);
      s.ta = 1;
      s.label = n.type === 'in' || n.type === 'bias' ? IN_LABELS[n.id] ?? `in ${n.id}` : n.type === 'out' ? OUT_LABELS[n.id - 9] ?? `out ${n.id}` : '';
    }
    for (const [nid, s] of nodes) if (!live.has(nid)) s.ta = 0;
    const liveE = new Set();
    for (const c of g.conns) {
      liveE.add(c.inn);
      let e = edges.get(c.inn);
      if (!e) { e = { inn: c.inn, a: 0, s: 0, ts: 0, phase: (c.inn * 0.6180339887) % 1 }; edges.set(c.inn, e); }
      e.from = c.from; e.to = c.to; e.w = c.w; e.on = c.on; e.ta = 1;
    }
    for (const [inn, e] of edges) if (!liveE.has(inn)) e.ta = 0;
    // additive light piles up: a dense brain gets a dimmer lamp per wire, so
    // 150 connections read as a network, not a white blob
    const on = g.conns.filter((c) => c.on).length;
    glowK = Math.min(1, Math.sqrt(36 / Math.max(1, on)));
    pulseK = Math.sqrt(glowK);
  }

  function setValues(values) {
    if (!values) return;
    for (const s of nodes.values()) {
      const i = idx.get(s.id);
      if (i != null) s.tv = Number.isFinite(values[i]) ? values[i] : 0;
    }
    for (const e of edges.values()) {
      const i = idx.get(e.from);
      const v = i != null ? values[i] : 0;
      e.ts = e.on && Number.isFinite(v) ? Math.tanh(Math.abs(v * e.w) * 1.1) : 0;
    }
  }

  // cubic from a to b; forward edges are horizontal S-curves, recurrent ones arch over
  function curve(a, b, out) {
    const ax = X(a.x), ay = Y(a.y), bx = X(b.x), by = Y(b.y);
    if (a === b) {
      out[0] = ax; out[1] = ay; out[2] = ax + 26; out[3] = ay - 30; out[4] = ax - 26; out[5] = ay - 30; out[6] = ax; out[7] = ay;
      return out;
    }
    const dx = bx - ax;
    if (dx > 4) {
      const k = dx * 0.5;
      out[2] = ax + k; out[3] = ay; out[4] = bx - k; out[5] = by;
    } else {
      const lift = -(28 + Math.abs(dx) * 0.25 + Math.abs(by - ay) * 0.15);
      out[2] = ax + 34; out[3] = ay + lift; out[4] = bx - 34; out[5] = by + lift;
    }
    out[0] = ax; out[1] = ay; out[6] = bx; out[7] = by;
    return out;
  }
  const bez = (p, t, o) => {
    const u = 1 - t, a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
    o[0] = a * p[0] + b * p[2] + c * p[4] + d * p[6];
    o[1] = a * p[1] + b * p[3] + c * p[5] + d * p[7];
    return o;
  };
  const X = (x) => padL + x * Math.max(10, W - padL - padR);
  const Y = (y) => 16 + y * Math.max(10, H - 32);
  const P = new Float64Array(8);
  const Q = new Float64Array(2);
  const q = (v, n) => Math.round(v * n) / n;

  // Stroking is what costs on the GPU (one draw per path), so curves are
  // batched: one path per (colour, alpha, width) bucket instead of per edge.
  const buckets = new Map();
  function queue(style, width, dash, p) {
    const key = `${style}|${width}|${dash}`;
    let b = buckets.get(key);
    if (!b) buckets.set(key, (b = { style, width, dash, pts: [] }));
    b.pts.push(p[0], p[1], p[2], p[3], p[4], p[5], p[6], p[7]);
  }
  function flush(c) {
    c.lineCap = 'round';
    for (const b of buckets.values()) {
      c.setLineDash(b.dash ? [2, 4] : []);
      c.lineWidth = b.width;
      c.strokeStyle = b.style;
      c.beginPath();
      const p = b.pts;
      for (let i = 0; i < p.length; i += 8) {
        c.moveTo(p[i], p[i + 1]);
        c.bezierCurveTo(p[i + 2], p[i + 3], p[i + 4], p[i + 5], p[i + 6], p[i + 7]);
      }
      c.stroke();
    }
    c.setLineDash([]);
    buckets.clear();
  }

  function frame(now, still = false) {
    const dt = lastT ? Math.min(0.05, (now - lastT) / 1000) : 1 / 60;
    lastT = now;

    // ease everything the eye follows; note whether the wiring layer must redraw
    let moving = false;
    life = damp(life, tLife, 2.2, dt);
    for (const [nid, s] of nodes) {
      if (s.delay > 0) { s.delay -= dt; moving = true; continue; }
      s.x = damp(s.x, s.tx, 6, dt);
      s.y = damp(s.y, s.ty, 6, dt);
      s.a = damp(s.a, s.ta, 5, dt);
      s.v = damp(s.v, s.tv * (tLife ? 1 : 0), tLife ? 16 : 1.6, dt);
      if (!s.ta && s.a < 0.01) { nodes.delete(nid); moving = true; continue; }
      if (Math.abs(s.x - s.tx) > 2e-4 || Math.abs(s.y - s.ty) > 2e-4 || Math.abs(s.a - s.ta) > 0.003) moving = true;
    }
    for (const [inn, e] of edges) {
      const f = nodes.get(e.from), t = nodes.get(e.to);
      const ready = f && t && f.a > 0.05 && t.a > 0.05;
      const ta = ready ? e.ta : 0;
      e.a = damp(e.a, ta, 4, dt);
      e.s = damp(e.s, e.ts * life, 12, dt);
      if (!e.ta && e.a < 0.01) { edges.delete(inn); moving = true; continue; }
      if (Math.abs(e.a - ta) > 0.003) moving = true;
    }

    if (moving || Math.abs(life - tLife) > 0.003) baseDirty = true;

    const dim = 0.55 + 0.45 * life;
    const span = (H - 32) / 9.5;
    const rScale = Math.max(0.6, Math.min(1, span / 24));

    // 1. the wiring at rest (sign as warm or cool, weight as width) lives in
    // its own layer and is only redrawn while something is moving
    if (baseDirty) {
      baseDirty = false;
      bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      bctx.clearRect(0, 0, W, H);
      for (const e of edges.values()) {
        if (e.a < 0.01) continue;
        const f = nodes.get(e.from), t = nodes.get(e.to);
        if (!f || !t) continue;
        curve(f, t, P);
        const mag = Math.min(Math.abs(e.w), 3) / 3;
        if (e.on) queue(rgba(e.w >= 0 ? WARM : COOL, q((0.16 + 0.3 * mag) * e.a * dim, 40)), q(0.6 + 2.2 * mag, 4), false, P);
        else queue(rgba(FOG, q(0.16 * e.a, 40)), 0.9, true, P);
      }
      flush(bctx);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(base, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // 2. signal: additive glow per edge, and pulses that travel the wire
    ctx.globalCompositeOperation = 'lighter';
    // a big brain refreshes its (eased, low-res) glow layer at 30 Hz to stay
    // inside the frame budget; pulses and neurons still move at 60
    frameNo++;
    const glowNow = still || edges.size <= 90 || frameNo % 2 === 0 || moving;
    for (const e of edges.values()) {
      const s = e.s * e.a;
      if (!e.on || s < 0.02) continue;
      const f = nodes.get(e.from), t = nodes.get(e.to);
      if (!f || !t) continue;
      curve(f, t, P);
      const mag = Math.min(Math.abs(e.w), 3) / 3;
      const c = e.w >= 0 ? WARM : COOL;
      // the halo is invisible on weak signals; skipping it there halves the strokes
      if (glowNow && s > 0.25) queue(rgba(c, q(0.1 * s * glowK, 80)), Math.round(2 + 2.2 * mag + 5 * s), false, P);
      if (glowNow) queue(rgba(c, q(0.55 * s * glowK, 12)), q(0.6 + 1.6 * mag, 2), false, P);
      if (!reduced && s > 0.14 && f.type !== 'bias') {
        // one or two pulses, faster for stronger signal; they fade at the ends
        // phase is integrated, not time * speed, so a changing signal never makes a pulse jump
        if (!still) e.phase = (e.phase + dt * (0.35 + 1.1 * s)) % 1;
        const count = s > 0.6 ? 2 : 1;
        for (let k = 0; k < count; k++) {
          const tt = (e.phase + k / count) % 1;
          bez(P, tt, Q);
          const edgeFade = Math.sin(Math.PI * tt);
          const r = (4 + 6 * s) * rScale;
          ctx.globalAlpha = Math.min(1, s * 1.2) * edgeFade * pulseK;
          ctx.drawImage(cyan, Q[0] - r, Q[1] - r, r * 2, r * 2);
        }
        ctx.globalAlpha = 1;
      }
    }
    // the glow strokes are soft by nature, so they render at css-pixel resolution
    // (a quarter of the fill cost at 2x) and are scaled up additively
    if (glowNow) {
      gctx.setTransform(1, 0, 0, 1, 0, 0);
      gctx.clearRect(0, 0, glow.width, glow.height);
      gctx.setTransform(glow.width / W, 0, 0, glow.height / H, 0, 0);
      gctx.globalCompositeOperation = 'lighter';
      flush(gctx);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(glow, 0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = 'source-over';

    // 3. neurons: ink body, violet ring, glow with |activation|
    // glows first, all additive, so the blend mode switches once
    ctx.globalCompositeOperation = 'lighter';
    const drawn = [];
    for (const s of nodes.values()) {
      if (s.a < 0.01) continue;
      const x = X(s.x), y = Y(s.y);
      const r = (s.type !== 'hidden' ? 4.6 : 3.6) * rScale;
      const act = Math.min(1, Math.abs(s.v));
      // cyan only once a neuron is really firing; below that a violet breath
      const fire = s.type === 'bias' ? 0 : Math.max(0, (act - 0.18) / 0.82) * life;
      drawn.push({ s, x, y, r, act, fire });
      if (s.type !== 'bias') {
        const vr = r * (2.4 + 2.5 * act);
        ctx.globalAlpha = s.a * (0.18 + 0.35 * act) * dim;
        ctx.drawImage(violet, x - vr, y - vr, vr * 2, vr * 2);
      }
      if (fire > 0.01) {
        const cr = r * (2 + 4.5 * fire);
        ctx.globalAlpha = s.a * fire * 0.95;
        ctx.drawImage(cyan, x - cr, y - cr, cr * 2, cr * 2);
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    // bodies, batched by look: ink disc with a violet (or, for bias, fog) ring
    const bodies = new Map();
    for (const d of drawn) {
      const key = `${q(d.s.a, 20)}|${d.s.type === 'bias' ? 'b' : d.s.type === 'hidden' ? 'h' : 'io'}`;
      if (!bodies.has(key)) bodies.set(key, []);
      bodies.get(key).push(d);
    }
    for (const [key, list] of bodies) {
      const [a, kind] = key.split('|');
      ctx.globalAlpha = Number(a);
      ctx.beginPath();
      for (const d of list) { ctx.moveTo(d.x + d.r, d.y); ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2); }
      ctx.fillStyle = INK;
      ctx.fill();
      ctx.lineWidth = kind === 'h' ? 1.1 : 1.4;
      ctx.strokeStyle = kind === 'b' ? rgba(FOG, 0.5) : rgba(VIOLET, q(0.95 * dim, 20));
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // lit cores
    for (const d of drawn) {
      if (d.fire <= 0.01) continue;
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r * 0.55, 0, Math.PI * 2);
      ctx.fillStyle = rgba(CYAN, d.fire * d.s.a);
      ctx.fill();
    }
    // plain-word labels for senses and actions, brightening as they fire
    ctx.font = LABEL_FONT;
    ctx.textBaseline = 'middle';
    for (const d of drawn) {
      if (!d.s.label) continue;
      const left = d.s.type === 'in' || d.s.type === 'bias';
      ctx.textAlign = left ? 'right' : 'left';
      ctx.fillStyle = rgba(FOG, (0.5 + 0.5 * d.act * life) * d.s.a);
      ctx.fillText(d.s.label, left ? d.x - d.r - 7 : d.x + d.r + 7, d.y + 0.5);
    }
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    if (still) return;
    if (stopAt && now > stopAt) { raf = 0; stopAt = 0; lastT = 0; return; }
    raf = requestAnimationFrame(frame);
  }

  // start observing only once every helper above exists (measure draws a frame)
  const ro = new ResizeObserver(measure);
  ro.observe(canvas);
  measure();
  document.fonts?.ready.then(measure);

  return {
    start() {
      stopAt = 0;
      if (!raf) { lastT = 0; raf = requestAnimationFrame(frame); }
    },
    /** keep drawing through the close transition, then rest */
    stopSoon() { stopAt = performance.now() + 600; },
    setGenome,
    setValues,
    die() { tLife = 0; },
    revive() { tLife = 1; },
    depth: () => Math.max(0, ncols - 2),
    destroy() {
      cancelAnimationFrame(raf);
      raf = 0;
      ro.disconnect();
    },
  };
}
