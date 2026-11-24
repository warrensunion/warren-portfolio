// The ice field's HUD: igloo.inc's white mono labels hanging off each block on hairline leaders, in the
// manner of the BTTRshop hub's hud.js (Warren's own code), simplified for this page. Per block: the code
// and name top left on a rule that bends onto the block, its first two tags on a short leader to the
// right, and the date (when known) over CLICK TO OPEN bottom right on a long rule back onto the block.
// The text lags its anchor (frame-rate independent), the leader's end never does. Lines scramble in when
// the block's centre rises past 80 % of the screen and out above 20 %. Everything here is aria-hidden:
// the ordered list of project links beside it is the keyboard and screen-reader path.
import { ScrambleLine } from './scramble.js';

const SVG = 'http://www.w3.org/2000/svg';
const LAG = 0.15;
const BAND = [0.2, 0.8];
const svgEl = (name, attrs) => {
  const e = document.createElementNS(SVG, name);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  return e;
};

export function createLabels(stage, blocks, { onOpen, reduced }) {
  stage.textContent = '';
  const svg = svgEl('svg', { class: 'ice-lines', width: '100%', height: '100%' });
  stage.append(svg);
  const items = blocks.map((b, i) => {
    const g = svgEl('g', { class: 'ice-g' });
    const l1 = svgEl('polyline', { class: 'ice-ln', points: '' });
    const l2 = svgEl('polyline', { class: 'ice-ln', points: '' });
    const l3 = svgEl('polyline', { class: 'ice-ln', points: '' });
    const d1 = svgEl('circle', { class: 'ice-dot', r: 2 });
    const d2 = svgEl('circle', { class: 'ice-dot', r: 2 });
    g.append(l1, l2, l3, d1, d2);
    svg.append(g);
    const wrap = document.createElement('div');
    wrap.className = 'ice-block';
    const label = document.createElement('div');
    label.className = 'ice-label';
    const read = document.createElement('div');
    read.className = 'ice-read';
    const enter = document.createElement('button');
    enter.type = 'button';
    enter.className = 'ice-enter';
    enter.tabIndex = -1; // the list's link is the keyboard path
    enter.addEventListener('click', () => onOpen(i));
    const line = (parent, text) => {
      const s = document.createElement('span');
      parent.append(s);
      return new ScrambleLine(s, text);
    };
    const lines = [
      line(label, b.code),
      line(label, b.name),
      line(read, b.meta),
      ...(b.date ? [line(enter, `D ${b.date}`)] : []),
      line(enter, 'CLICK TO OPEN'),
    ];
    wrap.append(label, read, enter);
    stage.append(wrap);
    return { g, l1, l2, l3, d1, d2, wrap, label, read, enter, lines, on: false, pos: null };
  });

  const lerp = (a, b, k) => a + (b - a) * k;
  return {
    /** anchors: { [index]: { centre, topLeft, right, bottomRight, rect } } in CSS px of the stage. */
    update(anchors, { now, dt, w, h, hot }) {
      const k = reduced ? 1 : 1 - Math.pow(1 - LAG, (dt * 1000) / 16.7);
      items.forEach((it, i) => {
        const a = anchors[i];
        const vis = !!a && a.centre.y > h * BAND[0] && a.centre.y < h * BAND[1];
        if (vis && !it.on) {
          it.on = true;
          it.wrap.classList.add('is-on');
          it.g.classList.add('is-on');
          it.lines.forEach((l, j) => (reduced ? l.snap(true) : l.in(now, j * 40)));
        } else if (!vis && it.on) {
          it.on = false;
          it.g.classList.remove('is-on');
          it.lines.forEach((l, j) => (reduced || !a ? l.snap(false) : l.out(now, j * 30)));
          if (!a) it.wrap.classList.remove('is-on');
        }
        let busy = false;
        for (const l of it.lines) busy = l.update(now) || busy;
        if (!it.on && !busy) it.wrap.classList.remove('is-on');
        if (!a) return;
        // targets: the label up and left of the block's top-left facet, the readout right, enter low right
        const tl = { x: a.topLeft.x - Math.min(160, w * 0.12), y: a.topLeft.y - 54 };
        const rd = { x: a.right.x + 46, y: a.right.y - 10 };
        const en = { x: a.bottomRight.x + 30, y: a.bottomRight.y + 18 };
        if (!it.pos) it.pos = { tl: { ...tl }, rd: { ...rd }, en: { ...en } };
        const p = it.pos;
        for (const [key, t] of [['tl', tl], ['rd', rd], ['en', en]]) {
          p[key].x = lerp(p[key].x, t.x, k);
          p[key].y = lerp(p[key].y, t.y, k);
        }
        const edge = 12;
        const clampX = (x, wd) => Math.max(edge, Math.min(w - edge - wd, x));
        const lw = it.label.offsetWidth || 120;
        const ew = it.enter.offsetWidth || 120;
        const lx = clampX(p.tl.x, lw);
        const rx = clampX(p.rd.x, it.read.offsetWidth || 100);
        const ex = clampX(p.en.x - ew, ew);
        it.label.style.transform = `translate3d(${lx.toFixed(1)}px, ${p.tl.y.toFixed(1)}px, 0)`;
        it.read.style.transform = `translate3d(${rx.toFixed(1)}px, ${p.rd.y.toFixed(1)}px, 0)`;
        it.enter.style.transform = `translate3d(${ex.toFixed(1)}px, ${p.en.y.toFixed(1)}px, 0)`;
        it.enter.classList.toggle('is-hot', hot === i);
        // the leaders: under the label, then 45 degrees down onto the facet; the readout's short tick;
        // the long rule under CLICK TO OPEN back onto the block
        const ly = p.tl.y + 44;
        it.l1.setAttribute('points', `${lx},${ly} ${lx + lw + 8},${ly} ${a.topLeft.x},${a.topLeft.y}`);
        it.l2.setAttribute('points', `${a.right.x},${a.right.y} ${rx - 6},${p.rd.y + 9}`);
        const ey = p.en.y + 40;
        it.l3.setAttribute('points', `${ex + ew},${ey} ${ex - 18},${ey} ${a.bottomRight.x},${a.bottomRight.y}`);
        it.d1.setAttribute('cx', a.topLeft.x);
        it.d1.setAttribute('cy', a.topLeft.y);
        it.d2.setAttribute('cx', a.right.x);
        it.d2.setAttribute('cy', a.right.y);
      });
    },
    dispose() {
      stage.textContent = '';
    },
  };
}
