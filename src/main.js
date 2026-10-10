// Entry point for the page's behaviour. The page is complete as static HTML; this module only
// adds enhancements on top (email copy and the bar hairline here, the figure host in Task 3),
// so a failure here can never blank the page.
import { content } from './content.js';
import { initCopyEmail } from './chrome/copyEmail.js';

document.documentElement.classList.add('js');

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
