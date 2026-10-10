// Scrubs recorded clips by scroll for the capture figures (BTTRURSLF, BC Window Coverings; spec 5.1,
// 5.2). Each stage is one short muted clip (WebM first, MP4 for Safari). show(stage, u) seeks that clip to
// u of its length; the stage's still stays on top until the clip has really seeked once, so a slow
// download shows the right picture rather than a black box. Only the stage on show and its neighbours
// hold a video; ones further away are unloaded so a long track never holds a dozen decoders.
import './player.css';

export function createPlayer(host, { base, stages }) {
  // stages: [{ file: 'tab/s0', duration }] indexed by stage; a missing entry means "no clip" (still only).
  const layer = document.createElement('div');
  layer.className = 'fp';
  host.append(layer);
  const vids = new Map(); // stage -> { el, ready, want }
  let current = -1;
  let destroyed = false;

  function make(i) {
    if (vids.has(i) || !stages[i]) return vids.get(i);
    const el = document.createElement('video');
    el.className = 'fp-video';
    el.muted = true;
    el.playsInline = true;
    el.preload = 'auto';
    el.disablePictureInPicture = true;
    el.setAttribute('aria-hidden', 'true');
    el.setAttribute('muted', '');
    el.setAttribute('playsinline', '');
    for (const [ext, type] of [['webm', 'video/webm'], ['mp4', 'video/mp4']]) {
      const s = document.createElement('source');
      s.src = `${base}/${stages[i].file}.${ext}`;
      s.type = type;
      el.append(s);
    }
    const v = { el, ready: false, want: 0, seeking: false };
    el.addEventListener('loadedmetadata', () => seek(v));
    el.addEventListener('seeked', () => {
      v.seeking = false;
      if (!v.ready) {
        v.ready = true;
        el.classList.add('is-ready');
      }
      if (Math.abs(el.currentTime - target(v)) > 0.5 / 24) seek(v);
    });
    el.addEventListener('error', () => el.remove(), { once: true });
    layer.append(el);
    vids.set(i, v);
    return v;
  }

  const target = (v) => v.want * (Number.isFinite(v.el.duration) ? Math.max(0, v.el.duration - 0.04) : 0);

  // One seek in flight at a time; the newest wish wins when it lands. Before metadata there is nothing
  // to seek, and loadedmetadata calls back here.
  function seek(v) {
    if (destroyed || v.seeking || v.el.readyState < 1) return;
    const t = target(v);
    if (Math.abs(v.el.currentTime - t) < 0.5 / 24 && v.ready) return;
    v.seeking = true;
    try {
      v.el.currentTime = t;
    } catch {
      v.seeking = false;
    }
  }

  function unload(i) {
    const v = vids.get(i);
    if (!v) return;
    v.el.removeAttribute('src');
    for (const s of v.el.querySelectorAll('source')) s.remove();
    try {
      v.el.load();
    } catch {}
    v.el.remove();
    vids.delete(i);
  }

  return {
    show(i, u) {
      if (destroyed) return;
      if (i !== current) {
        current = i;
        for (const k of [...vids.keys()]) if (Math.abs(k - i) > 2) unload(k);
        for (const k of [i - 1, i + 1]) if (k >= 0 && k < stages.length) make(k);
      }
      for (const [k, v] of vids) v.el.classList.toggle('is-on', k === i);
      const v = make(i);
      if (!v) return;
      v.want = Math.min(1, Math.max(0, u));
      seek(v);
    },
    // True once the clip for stage i has drawn a frame (the figure may then fade its still).
    ready: (i) => !!vids.get(i)?.ready,
    destroy() {
      destroyed = true;
      for (const k of [...vids.keys()]) unload(k);
      layer.remove();
    },
  };
}
