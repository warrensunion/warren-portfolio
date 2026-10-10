// The contests dot plot. Pure SVG, no WebGL, so it never falls back: the host reveals it exactly like a
// canvas by tagging it fig-canvas (fade-in over the poster). buildContestsSvg is pure so the tests can
// pin the marks. With no results the plate shows an intentional empty state, never invented data.
import { content } from '../../content.js';

const EMPTY = 'Contest results go here. Add them to contests in src/content.js.';
const INK = '#17191c';
const ACCENT = '#1f5f78';
const PLATE = '#fbfbf8';
const HAIR = 'rgba(23,25,28,0.22)';
const MONO = "'IBM Plex Mono', ui-monospace, monospace";
const SERIF = "'Source Serif 4', Georgia, serif";

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const num = (n) => String(Math.round(n * 10) / 10);

function frame(width, height, body, label) {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" ` +
    `role="img" aria-label="${esc(label)}"><title>${esc(label)}</title>` +
    `<rect width="${width}" height="${height}" fill="${PLATE}"/>${body}</svg>`
  );
}

function emptyState(width, height) {
  const l = Math.max(24, width * 0.08);
  const r = width - l;
  const b = height * 0.82;
  const t = height * 0.14;
  const fs = Math.max(14, Math.min(22, width / 34));
  const cx = width / 2;
  const cy = (t + b) / 2;
  const [a, rest] = EMPTY.split('. ');
  return frame(
    width,
    height,
    `<g stroke="${HAIR}" stroke-width="1" fill="none"><line x1="${l}" y1="${b}" x2="${r}" y2="${b}"/>` +
      `<line x1="${l}" y1="${t}" x2="${l}" y2="${b}"/></g>` +
      `<text text-anchor="middle" font-family="${SERIF}" font-style="italic" font-size="${fs}" fill="${INK}" fill-opacity="0.62">` +
      `<tspan x="${cx}" y="${cy - fs * 0.3}">${esc(a)}.</tspan><tspan x="${cx}" y="${cy + fs * 1.1}">${esc(rest)}</tspan></text>`,
    EMPTY,
  );
}

export function buildContestsSvg(rows, { width = 1280, height = 800 } = {}) {
  const pts = (rows || []).filter((r) => r && !r.placeholder && Number.isFinite(Number(r.percentile)) && r.percentile !== null && r.percentile !== '');
  if (!pts.length) return emptyState(width, height);

  const m = { l: 52, r: 28, t: 44, b: 44 };
  const x0 = m.l;
  const x1 = width - m.r;
  const y0 = height - m.b;
  const y1 = m.t;
  const years = pts.map((p) => Number(p.year));
  const lo = Math.min(...years);
  const hi = Math.max(...years);
  const dMin = lo - 0.5;
  const dMax = hi + 0.5;
  const X = (y) => x0 + ((y - dMin) / (dMax - dMin)) * (x1 - x0);
  const Y = (p) => y0 - (Number(p) / 100) * (y0 - y1);
  const tickYears = hi - lo <= 8 ? Array.from({ length: hi - lo + 1 }, (_, i) => lo + i) : [...new Set(years)].sort((a, b) => a - b);

  let g = `<g stroke="${HAIR}" stroke-width="1" fill="none"><line x1="${x0}" y1="${y0}" x2="${x1}" y2="${y0}"/><line x1="${x0}" y1="${y1}" x2="${x0}" y2="${y0}"/></g>`;
  g += `<g font-family="${MONO}" font-size="11" fill="${INK}" fill-opacity="0.62">`;
  for (const v of [0, 50, 100]) g += `<text x="${x0 - 8}" y="${Y(v) + 4}" text-anchor="end">${v}</text>`;
  for (const y of tickYears) {
    g += `<line x1="${X(y)}" y1="${y0}" x2="${X(y)}" y2="${y0 + 5}" stroke="${HAIR}"/>`;
    g += `<text x="${X(y)}" y="${y0 + 22}" text-anchor="middle">${y}</text>`;
  }
  g += `<text x="${x0}" y="${y1 - 24}" text-anchor="start">percentile</text></g>`;

  const label = pts.length <= 6;
  g += pts
    .map((p) => {
      const cx = X(Number(p.year));
      const cy = Y(p.percentile);
      const top = num(100 - Number(p.percentile));
      const tip = `${p.name}, ${p.year}: top ${top}%`;
      const anchor = cx > x1 - 80 ? 'end' : cx < x0 + 80 ? 'start' : 'middle';
      return (
        `<g><title>${esc(tip)}</title><circle cx="${cx}" cy="${cy}" r="7" fill="${ACCENT}" stroke="${PLATE}" stroke-width="2"/>` +
        (label ? `<text x="${cx}" y="${cy - 14}" text-anchor="${anchor}" font-family="${MONO}" font-size="11" fill="${INK}">${esc(p.name)}</text>` : '') +
        `</g>`
      );
    })
    .join('');

  return frame(width, height, g, `Dot plot of contest placement percentile by year, ${pts.length} result${pts.length === 1 ? '' : 's'}.`);
}

export async function create(el, ctx = {}) {
  const rows = Array.isArray(ctx.data?.rows) ? ctx.data.rows : content.contests;
  const wrap = document.createElement('div');
  wrap.className = 'fig-canvas'; // the host's reveal CSS targets this class; it only auto-tags canvases
  wrap.setAttribute('aria-hidden', 'true');
  el.appendChild(wrap);
  let w = el.clientWidth || 1280;
  let h = el.clientHeight || 800;
  const draw = () => {
    wrap.innerHTML = buildContestsSvg(rows, { width: Math.round(w), height: Math.round(h) });
    const svg = wrap.firstChild;
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
  };
  draw();
  requestAnimationFrame(() => el.dispatchEvent(new Event('fig:ready')));
  return {
    start() {},
    stop() {},
    resize(nw, nh) {
      if (!nw || !nh) return;
      w = nw;
      h = nh;
      draw();
    },
    destroy() {
      wrap.remove();
    },
  };
}
