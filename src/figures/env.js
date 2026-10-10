// Decides, once per page, what the visitor's device can afford: a live scene or a poster, and how
// expensive a scene may be. The rules are pure functions over plain values (Node-tested); the small
// probes at the bottom are the only parts that touch the browser.

// WebGL contexts each figure kind holds once live. bcwc holds none while it shows captured frames and
// claims 2 at runtime when its iframe (whose /products page opens two contexts) attaches; bttr is a frame
// player. The contests chart is plain SVG.
export const WEIGHTS = { iceberg: 1, ring: 1, terrarium: 1, howpolluted: 1, archer: 1, bcwc: 0, bttr: 0, contests: 0 };
export const TRACK_KINDS = new Set(['bcwc', 'bttr', 'terrarium', 'howpolluted', 'archer']);

export const weightOf = (kind) => WEIGHTS[kind] || 0;
// Kinds the budget tracks: anything that holds a context now, or may claim one later.
export const isWebGLKind = (kind) => weightOf(kind) > 0 || kind === 'bcwc';

// Order matters: an explicit ?static=1 wins, then hard capability, then the visitor's data and motion
// preferences. The contests chart is plain SVG, so none of these apply to it. A frame player (weight 0)
// needs no WebGL, but still stills under reduced motion, save-data and ?static=1.
export function fallbackReason({ webgl2, reduced, saveData, forced, kind }) {
  if (!(kind in WEIGHTS) || kind === 'contests') return null;
  if (forced) return 'forced';
  if (!webgl2 && (weightOf(kind) > 0 || kind === 'bcwc')) return 'no-webgl2';
  if (saveData) return 'save-data';
  if (reduced) return 'reduced-motion';
  return null;
}

export function tierFor({ width, coarse, cores, override }) {
  if (override === 'low' || override === 'high') return override;
  if (width < 860 || coarse || (typeof cores === 'number' && cores <= 4)) return 'low';
  return 'high';
}

export function readFlags(search) {
  const q = new URLSearchParams(search || '');
  const tier = q.get('tier');
  return {
    forced: q.get('static') === '1',
    fps: q.get('fps') === '1',
    tier: tier === 'low' || tier === 'high' ? tier : null,
  };
}

// ?poster=<kind> (scripts/posters.mjs only): the one figure to shoot and the still state its create()
// gets as ctx.data.posterState. i = index within the kind (default 0); iceberg takes depth=0|1; ring
// takes shape=0..4 (absent: the initials); a track figure takes stage=<i> (default 0).
export function readPoster(search) {
  const q = new URLSearchParams(search || '');
  const kind = q.get('poster');
  if (!kind) return null;
  const i = Number(q.get('i') || 0);
  const num = (k) => (q.get(k) != null && q.get(k) !== '' && Number.isFinite(Number(q.get(k))) ? Number(q.get(k)) : null);
  let state = true;
  if (kind === 'iceberg') state = { depth: q.get('depth') === '1' ? 1 : 0 };
  else if (kind === 'ring') state = { shape: num('shape') };
  else if (TRACK_KINDS.has(kind)) state = { stage: Number.isInteger(num('stage')) && num('stage') >= 0 ? num('stage') : 0 };
  return { kind, index: Number.isInteger(i) && i >= 0 ? i : 0, state };
}

// Reduced-motion poster swap: IntersectionObserver only reports edge crossings, so the swap state is
// read from where the sentinel sits relative to the line at the moment of the crossing.
export const pastLine = (entry, lineY) => entry.boundingClientRect.top < lineY;

/* Browser probes (not imported by Node tests' code paths). */

export function detectTier() {
  return tierFor({
    width: innerWidth,
    coarse: matchMedia('(pointer: coarse)').matches,
    cores: navigator.hardwareConcurrency,
    override: readFlags(location.search).tier,
  });
}

// One throwaway context answers "can this browser do WebGL2"; it is released at once so it never
// counts against the page's context budget.
export function hasWebGL2() {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return false;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  }
}

export function readEnv() {
  const flags = readFlags(location.search);
  return {
    ...flags,
    reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
    saveData: Boolean(navigator.connection && navigator.connection.saveData),
    tier: detectTier(),
    // Probing creates a context, so skip it when the page is forced static anyway.
    webgl2: flags.forced ? false : hasWebGL2(),
  };
}
