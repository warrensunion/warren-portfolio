// Raingarden's last stage: the same yard in the same storm without and with the garden the app designed,
// two frames exported from the app (public/raingarden/), split by a handle the visitor drags. Drag or click
// to move it; when the plate has focus, the arrow keys move it too. Rain streaks drift over both halves in
// 2D. Nothing here is computed: the numbers in meta.json are the app's own for that run.
const BASE = import.meta.env.BASE_URL + 'raingarden/';

const load = (src) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image ' + src));
    img.src = src;
  });

export async function create(layer, ctx) {
  const [before, after, meta] = await Promise.all([
    load(BASE + 'before.webp'),
    load(BASE + 'after.webp'),
    fetch(BASE + 'meta.json').then((r) => (r.ok ? r.json() : {})).catch(() => ({})),
  ]);
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  layer.append(canvas);
  const g = canvas.getContext('2d');
  const ui = document.createElement('div');
  ui.className = 'cl-ui rg-ui';
  ui.innerHTML = `<span class="cl-tag">${meta.beforeLabel || 'Without the garden'}</span><span class="cl-tag" style="margin-left:auto">${meta.afterLabel || 'With the garden'}</span>`;
  layer.append(ui);

  let w = 0;
  let h = 0;
  let dpr = 1;
  let split = 0.5;
  let raf = 0;
  let last = 0;
  // A fixed set of streaks, reused every frame: position in 0..1, speed and length in plate heights.
  const drops = Array.from({ length: ctx.tier === 'low' ? 60 : 120 }, (_, i) => ({
    x: (i * 0.6180339) % 1,
    y: (i * 0.3819660) % 1,
    v: 0.55 + ((i * 7) % 10) / 20,
    l: 0.02 + ((i * 3) % 5) / 250,
  }));

  // object-fit: cover, like the stills under it, so the two line up exactly.
  function cover(img) {
    const s = Math.max(w / img.width, h / img.height);
    const dw = img.width * s;
    const dh = img.height * s;
    return [(w - dw) / 2, (h - dh) / 2, dw, dh];
  }

  function draw(dt) {
    if (!w || !h) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cut = Math.round(split * w);
    g.drawImage(before, ...cover(before));
    g.save();
    g.beginPath();
    g.rect(cut, 0, w - cut, h);
    g.clip();
    g.drawImage(after, ...cover(after));
    g.restore();
    // Rain.
    g.strokeStyle = 'rgba(235, 242, 248, 0.55)';
    g.lineWidth = 1;
    g.beginPath();
    for (const d of drops) {
      d.y += (d.v * dt) / 1000;
      if (d.y > 1.05) d.y -= 1.1;
      const x = d.x * w;
      const y = d.y * h;
      g.moveTo(x, y);
      g.lineTo(x - d.l * h * 0.25, y + d.l * h);
    }
    g.stroke();
    // The handle.
    g.fillStyle = '#fbfbf8';
    g.fillRect(cut - 1, 0, 2, h);
    g.beginPath();
    g.arc(cut, h / 2, 14, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#17191c';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(cut - 5, h / 2 - 5);
    g.lineTo(cut - 9, h / 2);
    g.lineTo(cut - 5, h / 2 + 5);
    g.moveTo(cut + 5, h / 2 - 5);
    g.lineTo(cut + 9, h / 2);
    g.lineTo(cut + 5, h / 2 + 5);
    g.stroke();
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = last ? Math.min(64, now - last) : 16;
    last = now;
    draw(ctx.reduced ? 0 : dt);
  }

  // Pointer: press and drag anywhere on the plate. Never the wheel, so the page always scrolls.
  let dragging = false;
  const at = (e) => {
    const r = canvas.getBoundingClientRect();
    split = Math.min(0.98, Math.max(0.02, (e.clientX - r.left) / r.width));
  };
  const down = (e) => {
    if (e.button > 0) return;
    dragging = true;
    canvas.setPointerCapture?.(e.pointerId);
    at(e);
  };
  const move = (e) => dragging && at(e);
  const up = () => (dragging = false);
  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.style.touchAction = 'pan-y';
  canvas.style.cursor = 'ew-resize';
  // Keys only while the figure itself has focus (the host makes it a tab stop once live).
  const fig = layer.closest('figure');
  const key = (e) => {
    if (e.target !== fig || !layer.classList.contains('is-on')) return;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      split = Math.min(0.98, Math.max(0.02, split + (e.key === 'ArrowLeft' ? -0.05 : 0.05)));
      e.preventDefault();
    }
  };
  fig?.addEventListener('keydown', key);

  return {
    start() {
      if (!raf) {
        last = 0;
        raf = requestAnimationFrame(frame);
      }
    },
    stop() {
      cancelAnimationFrame(raf);
      raf = 0;
    },
    resize(cw, ch) {
      w = cw;
      h = ch;
      dpr = Math.min(window.devicePixelRatio || 1, ctx.tier === 'low' ? 1 : 1.5);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      draw(0);
    },
    // The app's own numbers for this run (meta.json says where each one appears in the app).
    readout: () => (meta.after ? `${meta.after.capturedL.toLocaleString('en-US')} of ${meta.after.leavesYardBeforeL.toLocaleString('en-US')} L caught` : 'Drag to compare'),
    destroy() {
      cancelAnimationFrame(raf);
      fig?.removeEventListener('keydown', key);
      layer.replaceChildren();
    },
  };
}
