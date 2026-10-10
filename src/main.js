// Entry point for the page's behaviour. The page is complete as static HTML; this module only
// adds enhancements on top (email copy, the bar hairline and the figure host),
// so a failure here can never blank the page.
import { content } from './content.js';
import { initCopyEmail } from './chrome/copyEmail.js';
import { initFigures } from './figures/host.js';
import { initTracks } from './figures/tracks.js';
import { initStills } from './figures/stills.js';

// <html class="js"> is set by an inline script in index.html, before first paint, so CSS that depends
// on it (the drag hint) never shifts the layout when this module arrives.

initCopyEmail(document, content.email);

// The bar gets a hairline only once the page has left the top. A zero-height sentinel at the
// top of the page plus an IntersectionObserver avoids a scroll listener entirely.
const bar = document.querySelector('.bar');
if (bar && 'IntersectionObserver' in window) {
  const sentinel = document.createElement('div');
  sentinel.setAttribute('aria-hidden', 'true');
  sentinel.style.cssText = 'position:absolute;top:0;left:0;width:1px;height:1px;pointer-events:none';
  document.body.prepend(sentinel);
  new IntersectionObserver(([entry]) => {
    bar.classList.toggle('is-scrolled', !entry.isIntersecting);
  }).observe(sentinel);
}

// Each figure is its own lazy chunk (three.js only loads once a WebGL figure is near the viewport).
// A host failure is caught so the posters, which are already on the page, simply stay.
const loaders = {
  iceberg: () => import('./figures/iceberg/figure.js'),
  ring: () => import('./figures/ring/figure.js'),
  contests: () => import('./figures/contests/figure.js'),
  bttr: () => import('./figures/bttr/figure.js'),
  bcwc: () => import('./figures/bcwc/figure.js'),
  howpolluted: () => import('./figures/howpolluted/figure.js'),
  archer: () => import('./figures/archer/figure.js'),
  terrarium: () => import('./figures/terrarium/figure.js'),
};
// Tracks first: they set each track's stage from where the page is, so stills and figures start right.
// Their stage buttons and stills work even if the figure host fails.
let tracks = null;
try {
  tracks = initTracks(document, { reduced: matchMedia('(prefers-reduced-motion: reduce)').matches });
  initStills(document, tracks);
} catch (err) {
  console.warn('[tracks] failed to start', err);
}
try {
  initFigures(document, { loaders, tracks });
} catch (err) {
  console.warn('[fig] host failed to start', err);
}
