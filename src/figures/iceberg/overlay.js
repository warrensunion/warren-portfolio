// Ported from BTTRURSLF-v2 src/screens/intro/overlay.js. Changed: white strokes and numbers with a dark
// halo became ink (#17191c) with a paper halo, because the figure sits on a light plate where white
// vanished; the font is the page's own Plex Mono 500 (tokens.css), loaded before the first draw.

/**
 * The polygon diagram igloo.inc draws over its open blocks, measured in
 * design-reference/iceberg/NOTES.md §3 and copied here:
 *
 *   - one vertex per lifted block, 4-5 at a time, on the most-lifted blocks
 *     facing the camera; it rides with its block every frame;
 *   - joined as a closed ring round them plus one diagonal, so it reads as
 *     two or three triangles and a quad; 1 px lines at ~65 % (ink here, white in the source);
 *   - a 9 px + at each vertex and a two-digit number above it, to the upper
 *     left (upper right for the right-most vertex), 8 px off: the block's
 *     lift as a percentage of how far it can go, ticking as it moves;
 *   - vertices arrive one at a time, 65 ms apart: the + pops in as a dot then
 *     a cross, a line draws out to it from the vertex before, and its number
 *     scrambles in the way igloo's HUD text does; when the blocks close the
 *     numbers go first and the lines and crosses are gone in 0.35 s.
 *
 * A 2D canvas over the WebGL one, redrawn every frame from points the scene
 * projects - crisp at any pixel ratio, and the lines never sit in the 3D
 * depth buffer. The numbers use IBM Plex Mono 500, igloo's HUD face, which
 * the page already ships (public/fonts). Copied in style from the shop hub's
 * HUD (src/screens/shop/hub/scramble.js), not imported: screens never import
 * each other.
 */

const FONT = '500 10.5px "IBM Plex Mono", ui-monospace, Consolas, monospace';
const STAGGER = 65; // ms between vertices arriving
const GROW = 160; // ms for a line to draw out
const LEAVE = 350; // ms to be gone
const CROSS = 4.5; // half the + (9 px)
const LABEL = [8, 5]; // px from the + to the text's near edge, and up to its baseline
const LINE_ALPHA = 0.72;
const SCRAMBLE = [60, 120, 300]; // ms: nothing, '-', random digits, then the number
const STEP = 30; // ms per re-roll

const digit = () => String((Math.random() * 10) | 0);

export class BergDiagram {
  constructor(canvas, { reduced = false } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.reduced = reduced;
    this.live = new Map(); // id -> { born, gone, x, y, n, roll, rollAt }
    this.lastBorn = -Infinity;
    this.w = 0;
    this.h = 0;
    this.dpr = 1;
  }

  resize(w, h, dpr) {
    this.w = w;
    this.h = h;
    this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
  }

  /** @param want  the blocks that should carry a vertex now, most lifted
                   first: [{ id, x, y, n }] in CSS px
      @param point (id) -> { x, y, n } | null, for vertices on their way out */
  draw(want, point, now) {
    const L = this.live;
    const ids = new Set(want.map((v) => v.id));
    // Leaving: no longer wanted.
    for (const [id, v] of L) {
      if (!ids.has(id) && v.gone == null) v.gone = now;
      if (ids.has(id) && v.gone != null && now - v.gone < LEAVE * 0.5) v.gone = null;
      if (v.gone != null && now - v.gone > LEAVE) L.delete(id);
    }
    // Arriving: one at a time.
    for (const v of want) {
      if (L.has(v.id)) continue;
      if (now - this.lastBorn < STAGGER) break;
      L.set(v.id, { born: now, gone: null, x: v.x, y: v.y, n: v.n, roll: '', rollAt: 0 });
      this.lastBorn = now;
    }
    // Where they are this frame.
    for (const [id, v] of L) {
      const p = want.find((w) => w.id === id) || point(id);
      if (p) {
        v.x = p.x;
        v.y = p.y;
        v.n = p.n;
      }
    }

    const g = this.ctx;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.clearRect(0, 0, this.w, this.h);
    if (!L.size) return;

    const verts = [...L.entries()].map(([id, v]) => ({ id, ...v, a: this._alpha(v, now) }));
    // The ring: in order round the centroid.
    const cx = verts.reduce((s, v) => s + v.x, 0) / verts.length;
    const cy = verts.reduce((s, v) => s + v.y, 0) / verts.length;
    const ring = [...verts].sort((p, q) => Math.atan2(p.y - cy, p.x - cx) - Math.atan2(q.y - cy, q.x - cx));
    const edges = [];
    if (ring.length === 2) edges.push([ring[0], ring[1]]);
    if (ring.length >= 3) for (let i = 0; i < ring.length; i++) edges.push([ring[i], ring[(i + 1) % ring.length]]);
    if (ring.length >= 4) {
      // One diagonal, from the most-lifted vertex across the figure.
      const top = ring.reduce((b, v, i) => (v.n > ring[b].n ? i : b), 0);
      edges.push([ring[top], ring[(top + Math.floor(ring.length / 2)) % ring.length]]);
    }

    const crisp = (v) => Math.round(v * this.dpr) / this.dpr + 0.5 / this.dpr;
    g.lineWidth = 1;
    g.lineCap = 'butt';
    // A soft paper halo under everything, so ink lines and numbers read on
    // the deep water as well as on the pale ice.
    g.shadowColor = 'rgba(244, 243, 238, 0.9)';
    g.shadowBlur = 3;
    for (const [p, q] of edges) {
      const [from, to] = p.born <= q.born ? [p, q] : [q, p];
      const grow = this.reduced ? 1 : Math.min(1, (now - to.born) / GROW);
      const a = Math.min(p.a, q.a) * LINE_ALPHA;
      if (a <= 0.01 || grow <= 0) continue;
      g.strokeStyle = `rgba(23, 25, 28, ${a})`;
      g.beginPath();
      g.moveTo(crisp(from.x), crisp(from.y));
      g.lineTo(crisp(from.x + (to.x - from.x) * grow), crisp(from.y + (to.y - from.y) * grow));
      g.stroke();
    }

    const right = verts.reduce((b, v) => (v.x > b.x ? v : b), verts[0]);
    g.font = FONT;
    if ('letterSpacing' in g) g.letterSpacing = '0.08em';
    g.textBaseline = 'alphabetic';
    for (const v of verts) {
      if (v.a <= 0.01) continue;
      const x = crisp(v.x);
      const y = crisp(v.y);
      g.strokeStyle = `rgba(23, 25, 28, ${v.a})`;
      g.fillStyle = `rgba(23, 25, 28, ${v.a})`;
      const age = now - v.born;
      if (!this.reduced && age < 60) {
        g.fillRect(x - 1, y - 1, 2, 2); // pops in as a dot
      } else {
        g.beginPath();
        g.moveTo(x - CROSS, y);
        g.lineTo(x + CROSS, y);
        g.moveTo(x, y - CROSS);
        g.lineTo(x, y + CROSS);
        g.stroke();
      }
      const text = this._label(v, now);
      if (!text) continue;
      g.shadowBlur = 6;
      g.shadowColor = 'rgba(244, 243, 238, 0.95)';
      const onRight = v === right && verts.length > 1;
      g.textAlign = onRight ? 'left' : 'right';
      g.fillText(text, onRight ? x + LABEL[0] : x - LABEL[0], y - LABEL[1]);
      g.shadowBlur = 3;
      g.shadowColor = 'rgba(244, 243, 238, 0.85)';
    }
  }

  _alpha(v, now) {
    const inA = this.reduced ? Math.min(1, (now - v.born) / 150) : Math.min(1, (now - v.born) / 90);
    const outA = v.gone == null ? 1 : Math.max(0, 1 - (now - v.gone) / LEAVE);
    return inA * outA;
  }

  /** The number, scrambling in igloo's way: nothing, '-', re-rolled digits,
      then the value; on the way out, one roll of garbage, then nothing. */
  _label(v, now) {
    const num = String(Math.max(1, Math.min(99, Math.round(v.n)))).padStart(2, '0');
    if (this.reduced) return num;
    if (v.gone != null) {
      const t = now - v.gone;
      if (t > 80) return '';
      return this._roll(v, now);
    }
    const t = now - v.born;
    if (t < SCRAMBLE[0]) return '';
    if (t < SCRAMBLE[1]) return '-';
    if (t < SCRAMBLE[2]) return this._roll(v, now);
    return num;
  }

  _roll(v, now) {
    if (now - v.rollAt >= STEP) {
      v.roll = digit() + digit();
      v.rollAt = now;
    }
    return v.roll;
  }

  clear() {
    this.live.clear();
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }
}
