// The contact section's project links drive the ring's particles: hovering or focusing link i shows
// object i, and leaving shows the initials again. Every event only names a target; one shared timer
// applies the last target 120 ms after things go quiet. Sweeping the pointer down the list therefore
// lands once on the link it stops on, instead of starting a morph (and the hub's 48k-point freeze)
// for every link it crosses. The debouncer is pure (timers injected) so Node can test it.

/**
 * @param {(target: number|null) => void} apply  called with the settled target, only when it changes
 * @param {number} delay  ms
 * @param {{ set: (fn, ms) => any, clear: (id) => void }} clock  defaults to setTimeout / clearTimeout
 */
export function createMorphDebounce(apply, delay = 120, clock = { set: (fn, ms) => setTimeout(fn, ms), clear: (id) => clearTimeout(id) }) {
  let timer = null;
  let wanted = null;
  let applied = null;
  return {
    request(target) {
      wanted = target;
      if (timer != null) clock.clear(timer);
      timer = clock.set(() => {
        timer = null;
        if (wanted !== applied) {
          applied = wanted;
          apply(wanted);
        }
      }, delay);
    },
    cancel() {
      if (timer != null) clock.clear(timer);
      timer = null;
    },
  };
}

/**
 * Binds every `[data-morph]` link inside `root` (the figure's own section): pointerenter / focus ask for
 * that index, pointerleave / blur ask for null. Returns an unbind function that also cancels the timer.
 */
export function bindMorphLinks(root, show, delay = 120) {
  const d = createMorphDebounce(show, delay);
  const links = root ? [...root.querySelectorAll('[data-morph]')] : [];
  const offs = [];
  for (const a of links) {
    const i = Number(a.dataset.morph);
    if (!Number.isInteger(i)) continue;
    const enter = () => d.request(i);
    const leave = () => d.request(null);
    for (const [type, fn] of [['pointerenter', enter], ['focus', enter], ['pointerleave', leave], ['blur', leave]]) {
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
