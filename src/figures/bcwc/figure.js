// The BC Window Coverings figure (spec 5.1): the site in a browser-window frame. The first four stages
// are recorded clips of it (loader, blind transition, time of day, blind), scrubbed by the track. The
// last stage is the live site in an iframe, which costs two WebGL contexts (its /products page opens two),
// so the frame claims a budget weight of 2 before attaching it and gives it back on leaving.
//
// The iframe must never trap the page: it starts with pointer-events off under a "Click to use the site"
// cover, so the wheel and drags go to the page. A click hands it the pointer; leaving the plate, Escape,
// the Done button or the figure leaving the screen hands it back. Until Warren deploys bcwc there is no
// URL to frame (content.js liveUrl is null) and the last stage says so as a visible TODO.
import { createPlayer } from '../player.js';
import { clipT } from '../track-math.js';
import './figure.css';

const BASE = '/captures/bcwc';
const LIVE = 4;
const LOAD_MS = 10000;

// ?bcwc=<url> points the frame at a local preview, for development and the checks only.
function localOverride() {
  try {
    const v = new URLSearchParams(location.search).get('bcwc');
    if (!v) return null;
    const u = new URL(v);
    return u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1') ? u.origin : null;
  } catch {
    return null;
  }
}

const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
};

export async function create(stage, ctx) {
  const res = await fetch(`${BASE}/manifest.json`);
  if (!res.ok) throw new Error('capture manifest ' + res.status);
  const manifest = await res.json();
  const n = ctx.stages;
  const clips = Array.from({ length: n }, (_, i) => manifest.stages[i] || null);
  const liveUrl = localOverride() || ctx.data.liveUrl || null;
  const fig = stage.closest('figure');
  const stills = [...stage.querySelectorAll('.fig-still')].map((img) => img.getAttribute('src'));

  const root = el('div', 'bw');
  const bar = el(
    'div',
    'bw-bar',
    '<span class="bw-dots" aria-hidden="true"><i></i><i></i><i></i></span>' +
      '<span class="bw-url"></span>' +
      '<button type="button" class="bw-done" hidden>Done</button>',
  );
  const view = el('div', 'bw-view');
  const still = el('img', 'bw-still');
  still.alt = '';
  view.append(still);
  root.append(bar, view);
  stage.append(root);
  const urlEl = bar.querySelector('.bw-url');
  const done = bar.querySelector('.bw-done');
  urlEl.textContent = liveUrl ? liveUrl.replace(/^https?:\/\//, '') + '/products' : ctx.data.liveNote || '[TODO: deploy bcwc and add its URL]';
  if (!liveUrl) urlEl.classList.add('is-todo');

  const player = createPlayer(view, { base: BASE, stages: clips });
  const note = el('p', 'bw-note');
  note.hidden = true;
  view.append(note);

  /* The live stage */

  let frame = null; // { iframe, cover, timer, loaded }
  let engaged = false;
  let claimSeq = 0;

  function engage(on) {
    if (!frame || engaged === on) return;
    engaged = on;
    frame.iframe.style.pointerEvents = on ? 'auto' : 'none';
    frame.cover.hidden = on;
    done.hidden = !on;
    if (on) frame.iframe.focus();
  }

  async function attach() {
    if (frame || !liveUrl) return;
    const seq = ++claimSeq;
    // An unreachable site would still fire the iframe's load (with the browser's error page), so ask
    // first: an opaque no-cors answer means it is up; a network error means it is not.
    const up = await fetch(liveUrl + '/products', { mode: 'no-cors', cache: 'no-store' }).then(() => true, () => false);
    if (seq !== claimSeq) return;
    if (!up) return fail('The live site did not load.');
    const ok = await ctx.claim(2);
    if (!ok || seq !== claimSeq || ctx.stage() !== LIVE) {
      if (ok) ctx.unclaim();
      return;
    }
    const iframe = document.createElement('iframe');
    iframe.className = 'bw-frame';
    iframe.title = 'BC Window Coverings website, live';
    iframe.loading = 'lazy';
    iframe.referrerPolicy = 'no-referrer';
    iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-popups');
    iframe.style.pointerEvents = 'none';
    const cover = el('button', 'bw-cover', '<span>Click to use the site</span>');
    cover.type = 'button';
    cover.addEventListener('click', () => engage(true));
    frame = { iframe, cover, loaded: false, timer: 0 };
    frame.timer = setTimeout(() => {
      if (frame && !frame.loaded) fail('The live site did not load.');
    }, LOAD_MS);
    iframe.addEventListener('load', () => {
      if (!frame) return;
      frame.loaded = true;
      clearTimeout(frame.timer);
      iframe.classList.add('is-loaded');
    });
    iframe.src = liveUrl + '/products';
    view.append(iframe, cover);
    // An interactive page inside: the stage is no longer just a picture for assistive tech.
    stage.removeAttribute('role');
  }

  function detach() {
    claimSeq++;
    if (!frame) return;
    engage(false);
    clearTimeout(frame.timer);
    frame.iframe.remove();
    frame.cover.remove();
    frame = null;
    stage.setAttribute('role', 'img');
    ctx.unclaim();
  }

  function fail(msg) {
    detach();
    note.textContent = msg;
    note.hidden = false;
  }

  const onLeave = () => engage(false);
  const onKey = (e) => {
    if (e.key === 'Escape') engage(false);
  };
  fig?.addEventListener('pointerleave', onLeave);
  document.addEventListener('keydown', onKey);
  done.addEventListener('click', () => engage(false));

  /* Scrubbing */

  let raf = 0;
  let last = 0;
  let shownStage = -1;
  let readyFired = false;

  function tick(now) {
    raf = requestAnimationFrame(tick);
    if (last) ctx.frame(now - last);
    last = now;
    const s = ctx.stage();
    const x = ctx.progress() * (n - 1);
    if (s !== shownStage) {
      shownStage = s;
      still.src = stills[s] || '';
      if (s === LIVE) {
        if (liveUrl) {
          note.hidden = true;
          attach();
        } else {
          note.textContent = 'The live site goes here once it is deployed. [TODO: deploy bcwc and add its URL]';
          note.hidden = false;
        }
      } else {
        note.hidden = true;
        detach();
      }
    }
    if (clips[s]) player.show(s, clipT(x, s, n));
    else player.show(s, 0);
    if (!readyFired) {
      readyFired = true;
      stage.dispatchEvent(new Event('fig:ready'));
    }
  }

  return {
    start() {
      if (!raf) {
        last = 0;
        raf = requestAnimationFrame(tick);
      }
    },
    stop() {
      cancelAnimationFrame(raf);
      raf = 0;
      engage(false); // off screen: never keep the pointer inside the frame
    },
    resize() {},
    readout() {
      const s = ctx.stage();
      return `stage ${s + 1} of ${n}` + (frame && frame.loaded ? ', live' : '');
    },
    destroy() {
      cancelAnimationFrame(raf);
      detach();
      fig?.removeEventListener('pointerleave', onLeave);
      document.removeEventListener('keydown', onKey);
      player.destroy();
      root.remove();
    },
  };
}
