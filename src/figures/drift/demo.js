// Drift's last stage: fragments on a flat world chart, replayed from the Drift model's own output
// (public/drift/tracks.json, exported offline from the drift site's model; see docs/port-notes/drift.md).
// Nothing is simulated here: each fragment's positions are the model's, and the chart only interpolates
// between its saved steps. Pick a drop site with the buttons; the years run on a loop.
const BASE = import.meta.env.BASE_URL + 'drift/';
const LOOP_MS = 14000;

const loadImg = (src) =>
  new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null); // the chart still reads without its land layer
    img.src = src;
  });

export async function create(layer, ctx) {
  const res = await fetch(BASE + 'tracks.json');
  if (!res.ok) throw new Error('tracks ' + res.status);
  const data = await res.json();
  const sites = data.sites || [];
  if (!sites.length) throw new Error('no drop sites');
  const land = await loadImg(BASE + 'land.png');
  const samples = data.samples || [];
  const years = Math.round((samples[samples.length - 1] || 3650) / 365);
  // Short names for the buttons; the file's own names are long.
  const SHORT = { bc: 'British Columbia', npac: 'North Pacific', natl: 'North Atlantic', ind: 'Indian Ocean' };
  // Each path holds its last position once it stops (a sunk copy never moves again: tracks.json units).
  for (const st of sites) {
    st.frags = (st.paths || []).map((q) => ({ p: q.p, s: q.s || '' }));
    st.short = SHORT[st.id] || st.name;
    [st.lon, st.lat] = st.drop;
  }

  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  layer.append(canvas);
  const g = canvas.getContext('2d');
  const ui = document.createElement('div');
  ui.className = 'cl-ui';
  layer.append(ui);
  let site = 0;
  const buttons = sites.map((s, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = s.short;
    b.title = s.name;
    b.setAttribute('aria-pressed', String(i === 0));
    b.addEventListener('click', () => pick(i));
    ui.append(b);
    return b;
  });
  const tag = document.createElement('span');
  tag.className = 'cl-tag';
  tag.textContent = 'Model output, replayed';
  tag.style.marginLeft = 'auto';
  ui.append(tag);

  let w = 0;
  let h = 0;
  let dpr = 1;
  let raf = 0;
  let t0 = 0;
  let u = 0; // 0..1 through the ten years
  function pick(i) {
    site = i;
    buttons.forEach((b, k) => b.setAttribute('aria-pressed', String(k === i)));
    t0 = 0;
  }

  // Equirectangular chart, cropped to 75N..60S where nearly all ocean drift happens.
  const LAT_TOP = 75;
  const LAT_BOT = -60;
  const px = (lon, lat) => [((lon + 180) / 360) * w, ((LAT_TOP - lat) / (LAT_TOP - LAT_BOT)) * h];

  function draw() {
    if (!w || !h) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#c9d6dc';
    g.fillRect(0, 0, w, h);
    if (land) {
      // The land image spans 90N..90S; draw it so its rows line up with the cropped chart.
      const full = (180 / (LAT_TOP - LAT_BOT)) * h;
      g.globalAlpha = 1;
      g.drawImage(land, 0, -((90 - LAT_TOP) / 180) * full, w, full);
      g.globalAlpha = 1;
    }
    const s = sites[site];
    const frags = s.frags.map((f) => f.p);
    const steps = Math.max(1, samples.length - 1);
    const x = u * steps;
    const k = Math.floor(x);
    const f = x - k;
    // Trails: the last few saved steps of each fragment.
    g.lineWidth = 1;
    g.strokeStyle = 'rgba(31, 95, 120, 0.22)';
    for (const tr of frags) {
      g.beginPath();
      let prev = null;
      for (let j = Math.max(0, k - 8); j <= Math.min(k, tr.length - 1); j++) {
        const p = tr[j];
        if (!p) continue;
        const q = px(p[0], p[1]);
        // A step that crosses the date line wraps rather than drawing across the chart.
        if (!prev || Math.abs(q[0] - prev[0]) > w / 2) g.moveTo(q[0], q[1]);
        else g.lineTo(q[0], q[1]);
        prev = q;
      }
      g.stroke();
    }
    for (const [i, tr] of frags.entries()) {
      const state = s.frags[i].s[Math.min(k, s.frags[i].s.length - 1)] || 's';
      g.fillStyle = k >= tr.length - 1 && tr.length < samples.length ? '#7d868b' : state === 'b' ? '#d08a2c' : '#c4502c';
      const a = tr[Math.min(k, tr.length - 1)];
      const b = tr[Math.min(k + 1, tr.length - 1)];
      if (!a) continue;
      let lon = a[0];
      let dl = b ? b[0] - a[0] : 0;
      if (dl > 180) dl -= 360;
      if (dl < -180) dl += 360;
      lon += dl * f;
      if (lon > 180) lon -= 360;
      if (lon < -180) lon += 360;
      const lat = b ? a[1] + (b[1] - a[1]) * f : a[1];
      const [cx, cy] = px(lon, lat);
      g.beginPath();
      g.arc(cx, cy, 2.2, 0, Math.PI * 2);
      g.fill();
    }
    // The drop site.
    const [sx, sy] = px(s.lon, s.lat);
    g.strokeStyle = '#17191c';
    g.lineWidth = 1.5;
    g.beginPath();
    g.arc(sx, sy, 6, 0, Math.PI * 2);
    g.stroke();
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (!t0) t0 = now - u * LOOP_MS;
    u = ctx.reduced ? 1 : ((now - t0) % LOOP_MS) / LOOP_MS;
    draw();
  }

  return {
    start() {
      if (!raf) {
        t0 = 0;
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
      draw();
    },
    readout: () => `Year ${(u * years).toFixed(1)} of ${years}, ${sites[site].short}`,
    destroy() {
      cancelAnimationFrame(raf);
      layer.replaceChildren();
    },
  };
}
