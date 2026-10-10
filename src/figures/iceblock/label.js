// The ice figure's label: the project's name in Plex Mono on a hairline leader that runs level, then
// drops at 45 deg onto the block's top-left anchor. The geometry is the hub HUD's place()
// (BTTRURSLF-v2 src/screens/shop/hub/hud.js:353-418) cut down to the label alone and kept inside a
// figure's stage instead of a whole screen: the elbow shortens when the block sits near the stage's
// top, and on a narrow stage the rule shortens to its words. Pure geometry is exported for tests.

import { ScrambleLine } from './scramble.js';

/** px a label keeps clear of the stage's sides and top. */
export const EDGE = 12;
const NARROW = 480; // stage px under which the label and its rule shrink (a phone column)
const ADV = 0.68; // Plex Mono's advance (0.6 em) plus the 0.08 em letter-spacing
const LH = 1.2;
const LAG = 0.15; // per 60 Hz frame: how fast the label follows its anchor (hud.js)
const MAX_LAG = 90; // px at 17 px type: the most the text may trail its anchor

/** Label type size (px) for a stage width. */
export const labelPx = (w) => (w < NARROW ? 11 : 14);

/** The follow factor for a frame of dt seconds (LAG per 60 Hz frame, frame-rate independent). */
export const lagFor = (dt) => 1 - Math.pow(1 - LAG, Math.min(6, Math.max(0, dt) * 60));

const easeOut = (x) => 1 - Math.pow(1 - x, 3);

/**
 * Where the label and its leader go for an anchor (stage px). `chars` is the label's length.
 * Returns { x, y } of the text's top-left, its width, and the leader's three points.
 */
export function labelGeometry({ anchor, w, chars, px = labelPx(w) }) {
  const s = px / 17;
  const narrow = w < NARROW;
  const lh = px * LH;
  const textW = chars * px * ADV;
  const gap = 4 + 4 * s; // the rule to the text's box
  // The elbow: 82 px at the hub's 17 px type, shortened so the text above it stays in the stage.
  const room = anchor.y - EDGE - gap - lh;
  let d = Math.max(8, Math.min(82 * s, room));
  let ex = anchor.x - d;
  let ey = anchor.y - d;
  const ruleMin = narrow ? Math.min(128, w * 0.2) : 128;
  const rule = Math.max(ruleMin, textW + 8);
  let sx = ex - rule;
  if (sx < EDGE) {
    // Not enough room on the left: the rule starts at the edge and stays under its words, and the
    // elbow keeps its 45 deg by dropping less (as long as the anchor is right of the words).
    sx = EDGE;
    const minEx = sx + textW + 8;
    if (ex < minEx) {
      ex = minEx;
      if (anchor.x - ex >= 8) {
        d = anchor.x - ex;
        ey = anchor.y - d;
      }
    }
  }
  return {
    x: sx,
    y: ey - gap - lh,
    textW,
    px,
    points: [
      [sx, ey],
      [ex, ey],
      [anchor.x, anchor.y],
    ],
  };
}

/** Lag `a` toward `b` by k, never trailing it by more than max px (hud.js follow). */
export function follow(a, b, k, max) {
  let x = a.x + (b.x - a.x) * k;
  let y = a.y + (b.y - a.y) * k;
  const dx = x - b.x;
  const dy = y - b.y;
  const dist = Math.hypot(dx, dy);
  if (dist > max) {
    x = b.x + (dx / dist) * max;
    y = b.y + (dy / dist) * max;
  }
  return { x, y };
}

const SVG = 'http://www.w3.org/2000/svg';

/**
 * The label's DOM in `el` (the stage): an aria-hidden layer with an SVG leader and a text line.
 * place() lays it out (call every frame with the live anchor; pass k = 1 to snap); in() scrambles it
 * in; snap() shows it at once; update() advances the scramble and the leader's draw-in and returns
 * true while either is animating.
 */
export function createLabel(el, text) {
  const hud = document.createElement('div');
  hud.className = 'ib-hud';
  hud.setAttribute('aria-hidden', 'true');
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('class', 'ib-lines');
  const line = document.createElementNS(SVG, 'polyline');
  line.setAttribute('class', 'ib-ln');
  line.setAttribute('pathLength', '1');
  svg.append(line);
  const span = document.createElement('span');
  span.className = 'ib-label';
  hud.append(svg, span);
  el.append(hud);
  const scramble = new ScrambleLine(span, text);

  let size = [0, 0];
  let sm = null; // the lagging anchor the text and elbow follow
  let pointsAttr = '';
  let tr = '';
  let px = 0;
  let t0 = null; // leader draw-in start; null: hidden; -1: shown
  let off = '';

  const setOffset = (v) => {
    const s = v.toFixed(3);
    if (s !== off) {
      off = s;
      line.style.strokeDashoffset = s;
    }
  };
  setOffset(1);

  return {
    el: hud,
    place(anchor, w, h, k = LAG) {
      if (!anchor || !w || !h) return;
      if (w !== size[0] || h !== size[1]) {
        size = [w, h];
        svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
        svg.setAttribute('width', w);
        svg.setAttribute('height', h);
        sm = null;
      }
      const g0 = labelGeometry({ anchor, w, chars: text.length });
      if (g0.px !== px) {
        px = g0.px;
        span.style.fontSize = `${px}px`;
      }
      sm = sm && k < 1 ? follow(sm, anchor, k, MAX_LAG * (px / 17)) : { ...anchor };
      const g = labelGeometry({ anchor: sm, w, chars: text.length });
      // The leader's last point is the live anchor; the text and the elbow lag behind it.
      const pts = [g.points[0], g.points[1], [anchor.x, anchor.y]];
      const p = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
      if (p !== pointsAttr) {
        pointsAttr = p;
        line.setAttribute('points', p);
      }
      const t = `translate(${Math.round(g.x)}px, ${Math.round(g.y)}px)`;
      if (t !== tr) {
        tr = t;
        span.style.transform = t;
      }
      hud.classList.add('is-placed');
    },
    in(now) {
      if (t0 !== null) return;
      t0 = now;
      scramble.in(now);
    },
    snap() {
      t0 = -1;
      scramble.snap(true);
      setOffset(0);
    },
    update(now) {
      if (t0 === null || t0 === -1) return false;
      const busy = scramble.update(now);
      // The leader starts one scramble step late, so it never shows before its first cell.
      const p = Math.min(1, Math.max(0, now - t0 - 30) / 380);
      setOffset(1 - easeOut(p));
      if (p >= 1 && !busy) {
        t0 = -1;
        return false;
      }
      return true;
    },
    destroy() {
      hud.remove();
    },
  };
}
