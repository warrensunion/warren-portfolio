// The contact section's project links drive the ring's particles: hovering or focusing link i shows
// object i, and leaving shows the initials again. Every event only names a target; one shared timer
// applies the last target 120 ms after things go quiet. Sweeping the pointer down the list therefore
// lands once on the link it stops on, instead of starting a morph (and the hub's 48k-point freeze)
// for every link it crosses. The debouncer is pure (timers injected) so Node can test it.
//
// The target is resolved from both inputs at once (morphTarget): a hovered link wins, else the link
// with keyboard focus, else the initials. So the pointer leaving a link while another one keeps focus
// shows the focused one, not the initials. The debouncer compares against what is actually shown
// (`current()`), never a private copy, so a direct show(i) from elsewhere (the poster script) cannot
// leave it comparing against a stale value.

/** The shape the links ask for: hovered index, else focused index, else null (the initials). */
export const morphTarget = ({ hovered = null, focused = null }) => (hovered != null ? hovered : focused != null ? focused : null);

/**
 * @param {(target: number|null) => void} apply  called with the settled target, only when it differs
 *   from what `current()` says is shown
 * @param {number} delay  ms
 * @param {{ set: (fn, ms) => any, clear: (id) => void }} clock  defaults to setTimeout / clearTimeout
 * @param {() => number|null} current  what is shown now (null = the initials)
 */
export function createMorphDebounce(apply, delay = 120, clock = { set: (fn, ms) => setTimeout(fn, ms), clear: (id) => clearTimeout(id) }, current = () => null) {
  let timer = null;
  let wanted = null;
  return {
    request(target) {
      wanted = target;
      if (timer != null) clock.clear(timer);
      timer = clock.set(() => {
        timer = null;
        if (wanted !== current()) apply(wanted);
      }, delay);
    },
    cancel() {
      if (timer != null) clock.clear(timer);
      timer = null;
    },
  };
}

/**
 * Binds every `[data-morph]` link inside `root` (the figure's own section). Pointer and focus state are
 * tracked separately and each event requests morphTarget() of both. `current()` reports what is shown.
 * Returns { count, unbind() }; unbind also cancels the timer.
 */
export function bindMorphLinks(root, show, delay = 120, current = () => null) {
  const d = createMorphDebounce(show, delay, undefined, current);
  const links = root ? [...root.querySelectorAll('[data-morph]')] : [];
  const state = { hovered: null, focused: null };
  const offs = [];
  const ask = () => d.request(morphTarget(state));
  for (const a of links) {
    const i = Number(a.dataset.morph);
    if (!Number.isInteger(i)) continue;
    const handlers = [
      ['pointerenter', () => ((state.hovered = i), ask())],
      ['pointerleave', () => (state.hovered === i && (state.hovered = null), ask())],
      ['focus', () => ((state.focused = i), ask())],
      ['blur', () => (state.focused === i && (state.focused = null), ask())],
    ];
    for (const [type, fn] of handlers) {
      a.addEventListener(type, fn);
      offs.push(() => a.removeEventListener(type, fn));
    }
  }
  return {
    count: links.length,
    unbind() {
      d.cancel();
      offs.forEach((off) => off());
    },
  };
}
