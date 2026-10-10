// Stage stills (spec 3.5). Each track figure stacks one still per stage; the one for the current stage is
// shown (a 400 ms opacity cross-fade in figure.css, the only motion reduced-motion visitors get). They
// follow the stage at all times, so the first paint, a deep load, a figure waiting for its demo and every
// lasting fallback all show the right stage; a live scene simply covers them.

export function initStills(root, tracks) {
  for (const fig of root.querySelectorAll('figure.fig--track')) {
    const stills = [...fig.querySelectorAll('.fig-still[data-stage]')];
    if (!stills.length) continue;
    const show = (i) => stills.forEach((img) => img.classList.toggle('is-on', Number(img.dataset.stage) === i));
    show(tracks.stageOf(fig));
    tracks.onStage(fig, show);
  }
}
