// Placeholder until Task 8 draws the SVG dot plot. It mounts through the host like the real chart will
// (no WebGL, never falls back) but draws nothing, so the static poster stays in place.
export async function create() {
  return { start() {}, stop() {}, resize() {}, destroy() {} };
}
