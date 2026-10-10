// Ported from HowPolluted src/screens/scene/card.js at 80f6d06 (Warren's own project). Changes: litter only
// (land or water); the source's Estimate tag became "Demo, not a measurement" and the number is the demo
// pile's coverage; no Explain button and no /api call; no inputs list, sources, actions or "new place"
// link; an update() that rewrites the number and grade in place as the visitor cleans up, and "All picked
// up." at zero; a line that says where the ground came from; class names prefixed hp-card.
//
// The one result card the scene ends on: the number, its grade, the tag that says what kind of number it
// is, what the grade means in a line, and whose scale the grade is on.
import { BAND_SOURCES, GRADES } from './grades.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// HowPolluted's own MEANING lines for litter, one per grade.
const MEANING = ['Litter is rare here.', 'Some litter, mostly along paths and roads.', 'Litter you notice on a walk.', 'Litter in most places you look.', 'Heavily littered ground.'];

export const TAG = 'Demo, not a measurement';

function body({ ground, coverage, grade, initialGrade, where }) {
  const g = Math.max(0, GRADES.indexOf(grade.grade));
  const n = coverage.toFixed(1);
  const what = ground === 'water' ? 'of the surface covered by the demo pile' : 'of the ground covered by the demo pile';
  const lines = [];
  if (coverage <= 0) lines.push('All picked up.');
  else if (initialGrade && initialGrade.grade !== grade.grade) lines.push(`Was ${esc(initialGrade.grade)} before you cleaned up.`);
  return `
    <p class="hp-card-kind">Litter <span class="hp-tag">${TAG}</span></p>
    <p class="hp-card-num"><span class="hp-card-n">${n}</span><span class="hp-card-unit">%</span></p>
    <p class="hp-card-what">${what}</p>
    <p class="hp-card-grade" data-g="${g}"><span class="hp-card-grade-word">${esc(grade.grade)}</span> <span class="hp-card-meaning">${esc(MEANING[g])}</span></p>
    ${lines.map((l) => `<p class="hp-card-note">${l}</p>`).join('')}
    <p class="hp-card-small">Grade scale: ${esc(BAND_SOURCES.litter)}.</p>
    ${where ? `<p class="hp-card-small hp-card-where">${esc(where)}</p>` : ''}`;
}

export function renderCard(host, state) {
  const el = document.createElement('aside');
  el.className = 'hp-card';
  el.setAttribute('aria-label', 'Demo result card');
  let last = '';
  const update = (next) => {
    state = { ...state, ...next };
    const html = body(state);
    if (html !== last) {
      el.innerHTML = html;
      last = html;
    }
  };
  update({});
  host.appendChild(el);
  return { el, update };
}
