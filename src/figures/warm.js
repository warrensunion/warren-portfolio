// A scene's first frame is where its cost lands: ANGLE (Chrome on Windows) finishes each shader for
// the GPU only when it is first drawn, so one first render() can block the page for half a second
// even after compileAsync. Figures build while the visitor is reading, so that cost is paid here in
// small slices instead: the scene is drawn with its renderable objects switched on one more at a time,
// each draw in its own task, so no single task carries more than one or two new programs.

/** Resolves on a fresh task, so the browser can paint and handle input in between. */
export const nextTask = () => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * Draws `root` repeatedly through `draw()` (or each function of an array of draws, a task apiece)
 * with its renderable objects made visible cumulatively, yielding a task between draws, then restores every object's own visibility. `isLive()` returning
 * false (the figure was destroyed meanwhile) stops it early; visibility is restored either way.
 */
export async function warmDraws(root, draw, isLive = () => true) {
  const draws = Array.isArray(draw) ? draw : [draw];
  const items = [];
  root.traverse((o) => {
    if (o.isMesh || o.isPoints || o.isLine || o.isSprite) items.push([o, o.visible]);
  });
  for (const [o] of items) o.visible = false;
  try {
    for (const [o, was] of items) {
      if (!was) continue; // hidden on purpose: its program is not needed yet
      o.visible = true;
      for (const d of draws) {
        d();
        await nextTask();
        if (!isLive()) return;
      }
    }
  } finally {
    for (const [o, was] of items) o.visible = was;
  }
}
