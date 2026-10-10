// Injected into a captured page with addInitScript (spec 5.2): our own arrow cursor that follows the
// Playwright mouse and rings on press, so the "fake cursor" is burned into each clip in sync with what it
// clicks. Headless Chromium draws no cursor of its own. This is portfolio code; it runs inside the
// captured page only while recording and is never shipped.
(() => {
  const SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="30" viewBox="0 0 22 30">' +
    '<path d="M2 2 L2 24 L8 18.5 L12.5 28 L16 26.4 L11.6 17.2 L19.5 17.2 Z" fill="#17191c" stroke="#fbfbf8" stroke-width="2" stroke-linejoin="round"/></svg>';
  const mount = () => {
    if (document.getElementById('__cap-cursor')) return;
    const c = document.createElement('div');
    c.id = '__cap-cursor';
    c.innerHTML = SVG;
    c.style.cssText =
      'position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;transform:translate(-100px,-100px);will-change:transform';
    const ring = document.createElement('div');
    ring.style.cssText =
      'position:fixed;left:0;top:0;z-index:2147483646;pointer-events:none;width:34px;height:34px;margin:-17px 0 0 -17px;' +
      'border:2px solid rgba(23,25,28,.7);border-radius:50%;opacity:0;transform:translate(-100px,-100px) scale(.4)';
    document.documentElement.append(ring, c);
    let x = -100;
    let y = -100;
    addEventListener('mousemove', (e) => {
      x = e.clientX;
      y = e.clientY;
      c.style.transform = `translate(${x - 2}px,${y - 2}px)`;
    }, true);
    addEventListener('mousedown', () => {
      ring.animate(
        [
          { opacity: 0.9, transform: `translate(${x}px,${y}px) scale(.4)` },
          { opacity: 0, transform: `translate(${x}px,${y}px) scale(1)` },
        ],
        { duration: 200, easing: 'ease-out' },
      );
    }, true);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
