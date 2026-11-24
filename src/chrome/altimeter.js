// The altimeter: a vertical altitude gauge on the right edge that stands in for the scrollbar's look
// (the native bar is hidden while it is up). Each log is a numbered marker at its altitude, and a link to
// it, so it is also the page's sticky numbered section menu; the needle follows the eased altitude.
// Dragging the gauge, or clicking on it, scrolls the page. Desktop only (it would crowd a phone).
import { subscribe, state } from '../world/boot.js';
import { SUMMIT } from '../world/climb.js';

export function initAltimeter(root, { reduced }) {
  const logs = [...root.querySelectorAll('[data-alt]')];
  if (logs.length < 2) return null;
  const nav = document.createElement('nav');
  nav.className = 'alti';
  nav.setAttribute('aria-label', 'Climb');
  const names = logs.map((el) => el.querySelector('.log-name')?.textContent || '');
  const pos = (alt) => 100 - (alt / SUMMIT) * 100; // % from the top: the summit at the top
  nav.innerHTML =
    `<div class="alti-track"><span class="alti-fill"></span><span class="alti-needle"><span class="alti-read"></span></span></div>` +
    `<ol>${logs
      .map((el, i) => {
        const id = el.id;
        const alt = Number(el.dataset.alt);
        return `<li style="top:${pos(alt).toFixed(2)}%"><a href="#${id}" data-i="${i}"><span class="alti-n">${String(i + 1).padStart(2, '0')}</span><span class="alti-name">${names[i]}</span></a></li>`;
      })
      .join('')}</ol>`;
  document.body.append(nav);
  document.documentElement.classList.add('has-alti');
  const needle = nav.querySelector('.alti-needle');
  const fill = nav.querySelector('.alti-fill');
  const read = nav.querySelector('.alti-read');
  const links = [...nav.querySelectorAll('a')];
  const track = nav.querySelector('.alti-track');

  // Drag or click the track: scroll to the altitude under the pointer (by the logs' own positions).
  const scrollToAlt = (alt) => {
    const tops = logs.map((el) => ({ y: el.getBoundingClientRect().top + scrollY - innerHeight * 0.4, alt: Number(el.dataset.alt) }));
    tops[0].y = 0;
    let y = 0;
    for (let i = 1; i < tops.length; i++) {
      if (alt <= tops[i].alt) {
        const a = tops[i - 1];
        const b = tops[i];
        y = a.y + ((alt - a.alt) / Math.max(1, b.alt - a.alt)) * (b.y - a.y);
        break;
      }
      y = tops[i].y;
    }
    window.scrollTo({ top: Math.max(0, y), behavior: 'instant' });
  };
  const altAt = (clientY) => {
    const r = track.getBoundingClientRect();
    const t = Math.max(0, Math.min(1, (clientY - r.top) / r.height));
    return (1 - t) * SUMMIT;
  };
  let dragging = false;
  track.addEventListener('pointerdown', (e) => {
    dragging = true;
    track.setPointerCapture(e.pointerId);
    scrollToAlt(altAt(e.clientY));
  });
  track.addEventListener('pointermove', (e) => dragging && scrollToAlt(altAt(e.clientY)));
  track.addEventListener('pointerup', () => (dragging = false));
  track.addEventListener('pointercancel', () => (dragging = false));

  let lastLog = -1;
  let lastText = '';
  let acc = 0;
  subscribe((st, dt) => {
    const p = pos(st.shownAlt || 0);
    needle.style.transform = `translate3d(0, ${((p / 100) * track.clientHeight).toFixed(1)}px, 0)`;
    fill.style.transform = `scaleY(${(1 - p / 100).toFixed(4)})`;
    if (st.log !== lastLog) {
      lastLog = st.log;
      links.forEach((a, i) => (i === st.log ? a.setAttribute('aria-current', 'location') : a.removeAttribute('aria-current')));
    }
    acc += dt;
    if (acc > 0.1) {
      acc = 0;
      const t = `${Math.round(st.shownAlt || 0).toLocaleString('en-US')} m`;
      if (t !== lastText) read.textContent = lastText = t;
    }
  });
  void reduced;
  void state;
  return nav;
}
