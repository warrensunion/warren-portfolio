// Ported from BTTRURSLF-v2 src/screens/shop/hub/scramble.js, unchanged apart from this header. The
// label of an ice figure is DOM text that resolves left to right, the hub's way; the cell styles
// (solid ink block, inverted cell) live in figure.css because the page is paper, not the hub's fog.

/**
 * One line of the hub's HUD that scrambles in and out, igloo.inc's way.
 *
 * Measured from live-fast.webm at 1/30 s and frames 009/013
 * (overnight-shop/refs/task-5/NOTES.md): a line shows at full length almost
 * at once (~70 ms) as a bar of solid white cells, which become cells with a
 * dark glyph cut out, then re-rolled glyphs, and resolve left to right. Leaving runs the same way back: the text turns to
 * garbage, then to blocks, then nothing.
 *
 * It is DOM text, not WebGL: the HUD is aria-hidden (one live summary speaks
 * for it), and the cells are spans so the white blocks are exactly one
 * character cell of the real font. The span is only rewritten when the 30 ms
 * step changes, never per frame. Unrevealed cells are spaces, so a
 * right-aligned line does not slide while it types.
 */

export const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_/.-';
export const DURATION_IN = 450; // ms, first cell appears -> last cell resolved
export const DURATION_OUT = 300;
export const STEP = 30; // ms per re-roll

// The line reaches full length fast (live: ~2 frames), as a bar of solid
// cells, then cells with a dark glyph, then garbage, resolving left to right.
const APPEAR = 70; // ms, first cell -> last cell shown
const BLOCK_STEPS = 2; // solid cell
const INVERT_STEPS = 2; // cell with a dark glyph

const rnd = () => GLYPHS[(Math.random() * GLYPHS.length) | 0];

export class ScrambleLine {
  /** @param {HTMLElement} el  the line's element (white-space: pre) */
  constructor(el, text = '') {
    this.el = el;
    this.text = text;
    this.mode = 'hidden'; // hidden | in | shown | out
    this.t0 = 0;
    this.step = -1;
    el.textContent = '';
  }

  /** New final text; a shown line resolves into it without scrambling out. */
  set(text) {
    if (text === this.text) return;
    this.text = text;
    if (this.mode === 'shown') this.el.textContent = text;
  }

  /** Scramble in afresh with new text (e.g. Sound: Off -> On). */
  replay(text, now) {
    this.text = text;
    this.mode = 'hidden';
    return this.in(now);
  }

  in(now, delay = 0) {
    if (this.mode === 'in' || this.mode === 'shown') return false;
    this.mode = 'in';
    this.t0 = now + delay;
    this.step = -1;
    return true;
  }

  out(now, delay = 0) {
    if (this.mode === 'out' || this.mode === 'hidden') return false;
    this.mode = 'out';
    this.t0 = now + delay;
    this.step = -1;
    return true;
  }

  /** Shows or hides at once (reduced motion: the group fades instead). */
  snap(on) {
    this.mode = on ? 'shown' : 'hidden';
    this.el.textContent = on ? this.text : '';
  }

  /** @returns true while it is still animating */
  update(now) {
    if (this.mode === 'shown' || this.mode === 'hidden') return false;
    const t = now - this.t0;
    if (t < 0) {
      if (this.step !== -2 && this.mode === 'in') this.el.textContent = '';
      this.step = -2;
      return true;
    }
    const step = Math.floor(t / STEP);
    if (step === this.step) return true;
    this.step = step;
    const ts = step * STEP;
    const n = Math.max(1, this.text.length);
    let html = '';
    let done = true;
    for (let i = 0; i < this.text.length; i++) {
      const ch = this.text[i];
      const f = i / n;
      let kind; // ' ' nothing, 'b' block, 'i' inverted, 'r' random, 'c' final
      if (this.mode === 'in') {
        const appear = APPEAR * f;
        const resolve = 0.4 * DURATION_IN + 0.6 * DURATION_IN * f;
        if (ts < appear) kind = ' ';
        else if (ts >= resolve) kind = 'c';
        else if (ts < appear + BLOCK_STEPS * STEP) kind = 'b';
        else if (ts < appear + (BLOCK_STEPS + INVERT_STEPS) * STEP) kind = 'i';
        else kind = 'r';
        if (kind !== 'c') done = false;
      } else {
        const garble = 0.5 * DURATION_OUT * f;
        const block = 0.45 * DURATION_OUT + 0.4 * DURATION_OUT * f;
        if (ts < garble) kind = 'c';
        else if (ts < block) kind = 'r';
        else if (ts < block + STEP) kind = 'i';
        else if (ts < block + 2 * STEP) kind = 'b';
        else kind = ' ';
        if (kind !== ' ') done = false;
      }
      if (kind === 'c') html += ch === ' ' ? ' ' : esc(ch);
      else if (kind === ' ') html += ' ';
      else if (kind === 'r') html += rnd();
      else html += `<i class="${kind === 'b' ? 'is-b' : 'is-i'}">${rnd()}</i>`;
    }
    if (done) {
      this.mode = this.mode === 'in' ? 'shown' : 'hidden';
      this.el.textContent = this.mode === 'shown' ? this.text : '';
      return false;
    }
    this.el.innerHTML = html;
    return true;
  }
}

const esc = (c) => (c === '<' ? '&lt;' : c === '&' ? '&amp;' : c === '>' ? '&gt;' : c);
