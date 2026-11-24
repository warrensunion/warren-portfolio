// The page's chrome over the climb: the bar's controls (theme, sound, the palette), the altimeter that
// stands in for the scrollbar, the command palette, sound, and the snow effects. All of it is added by
// script over a page that is complete without it; each part starts on its own, so one failing never
// stops the others, and each reads the world's one shared state (src/world/boot.js) instead of polling.
import { subscribe, state } from '../world/boot.js';
import { initAltimeter } from './altimeter.js';
import { initPalette } from './palette.js';
import { initSound } from './sound.js';
import { initEffects } from './effects.js';

const part = (name, fn) => {
  try {
    return fn();
  } catch (err) {
    console.warn('[chrome] ' + name, err);
    return null;
  }
};

export function initChrome(root, { world, env, content }) {
  const reduced = !!(env.reduced || env.forced);
  const nav = root.querySelector('.bar-nav');
  const tools = document.createElement('div');
  tools.className = 'bar-tools';
  nav?.prepend(tools);

  // Theme: blue hour or deep night (the world re-lights, the page's tokens follow).
  part('theme', () => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'bar-tool bar-theme';
    const sync = () => {
      const night = state.theme === 'night';
      b.setAttribute('aria-pressed', String(night));
      b.setAttribute('aria-label', night ? 'Switch to blue hour' : 'Switch to deep night');
      b.title = night ? 'Blue hour' : 'Deep night';
    };
    b.innerHTML = '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M8 1.8a6.2 6.2 0 0 1 0 12.4z" fill="currentColor"/></svg>';
    b.addEventListener('click', () => {
      world.setTheme(state.theme === 'night' ? 'dusk' : 'night');
      sync();
    });
    sync();
    tools.append(b);
  });

  const sound = part('sound', () => initSound({ tools, reduced }));
  if (sound) state.onLand = (n) => sound.clink(n);

  // The rest waits for an idle moment after load, so none of it competes with the first paint.
  const later = () => {
    part('palette', () => initPalette(root, { tools, content, world, sound }));
    part('altimeter', () => initAltimeter(root, { reduced }));
    part('effects', () => initEffects(root, { reduced, subscribe }));
  };
  const idle = () => ('requestIdleCallback' in window ? requestIdleCallback(later, { timeout: 2500 }) : setTimeout(later, 800));
  if (document.readyState === 'complete') idle();
  else addEventListener('load', idle, { once: true });
}
