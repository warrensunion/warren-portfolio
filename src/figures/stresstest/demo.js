// Stress Test's last stage: the tool's "Deliberately bad design" preset under rising load, drawn from the
// simulator's own results (public/stress-test/sample.json: simulate() and findSaturation() from the
// stress-test repo, run offline at a fixed seed). Nothing is simulated here. Each tile shows how busy that
// component is at the chosen load; requests drift along the edges at a rate that follows the measured
// arrivals; the first bottleneck lights up as it saturates. The load ramps on its own until the visitor
// takes the slider.
const DATA = import.meta.env.BASE_URL + 'stress-test/sample.json';
const STEP_MS = 1300;

const fmt = (n) => Math.round(n).toLocaleString('en-US');

export async function create(layer, ctx) {
  const res = await fetch(DATA);
  if (!res.ok) throw new Error('sample ' + res.status);
  const data = await res.json();
  const sweep = data.sweep || [];
  const nodes = data.nodes || [];
  if (!sweep.length || !nodes.length) throw new Error('empty sample');
  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const sat = data.saturation || {};
  const bottleneck = sat.bottleneckNodeId;

  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  layer.append(canvas);
  const g = canvas.getContext('2d');

  const ui = document.createElement('div');
  ui.className = 'cl-ui';
  const label = document.createElement('label');
  label.style.cssText = 'display:flex;align-items:center;gap:10px;flex:1 1 220px';
  const span = document.createElement('span');
  span.className = 'cl-tag';
  span.textContent = 'Load';
  const range = document.createElement('input');
  range.type = 'range';
  range.min = '0';
  range.max = String(sweep.length - 1);
  range.step = '1';
  range.value = '0';
  range.setAttribute('aria-label', 'Offered load');
  range.style.flex = '1';
  label.append(span, range);
  const tag = document.createElement('span');
  tag.className = 'cl-tag';
  tag.textContent = `Simulator output, seed ${data.meta?.seed ?? 42}`;
  ui.append(label, tag);
  layer.append(ui);

  let level = 0;
  let auto = !ctx.reduced;
  let since = 0;
  const setLevel = (i) => {
    level = Math.max(0, Math.min(sweep.length - 1, i));
    range.value = String(level);
    range.setAttribute('aria-valuetext', `${fmt(sweep[level].offeredRps)} requests per second`);
  };
  // The visitor's own choice stops the ramp for good.
  range.addEventListener('input', () => {
    auto = false;
    setLevel(Number(range.value));
  });
  setLevel(ctx.reduced ? sweep.findIndex((s) => s.offeredRps >= (sat.rps || 0)) : 0);

  // Layout: the preset's own canvas positions, fitted into the plate above the controls.
  const xs = nodes.map((n) => n.position.x);
  const ys = nodes.map((n) => n.position.y);
  const box = { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
  let w = 0;
  let h = 0;
  let dpr = 1;
  let tile = { w: 100, h: 46, font: 12 };
  const at = (n) => {
    const padX = tile.w / 2 + 16;
    const top = 26 + tile.h / 2;
    const bottom = h - 64 - tile.h / 2;
    const x = padX + ((n.position.x - box.x0) / Math.max(1, box.x1 - box.x0)) * (w - 2 * padX);
    const y = top + ((n.position.y - box.y0) / Math.max(1, box.y1 - box.y0)) * Math.max(0, bottom - top);
    return [x, y];
  };

  // Requests in flight on each edge: a phase per dot, advanced by the edge's measured arrival rate.
  const edges = (data.edges || []).filter((e) => byId[e.source] && byId[e.target]);
  const dots = edges.map(() => Array.from({ length: 6 }, (_, i) => i / 6));
  const rateOf = (e, s) => {
    const n = s.nodes[e.target];
    return n ? n.arrivalRps : s.throughputRps;
  };

  // A label cut to the room it has, with an ellipsis.
  const fit = (t, room) => {
    if (g.measureText(t).width <= room) return t;
    let k = t.length;
    while (k > 1 && g.measureText(t.slice(0, k) + '…').width > room) k--;
    return t.slice(0, k) + '…';
  };
  // Words on at most two lines; the second is cut to fit.
  const wrap = (t, room) => {
    const words = t.split(' ');
    let one = '';
    let i = 0;
    while (i < words.length && g.measureText(one ? one + ' ' + words[i] : words[i]).width <= room) one = one ? one + ' ' + words[i++] : words[i++];
    if (!one) return [fit(t, room)];
    return i < words.length ? [one, fit(words.slice(i).join(' '), room)] : [one];
  };
  const colour = (u) => (u == null ? '#9aa3a8' : u >= 0.97 ? '#c4502c' : u >= 0.8 ? '#d08a2c' : '#1f5f78');

  function draw(dt, now) {
    if (!w || !h) return;
    const s = sweep[level];
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#f2f1ec';
    g.fillRect(0, 0, w, h);
    // Edges and the requests on them.
    g.lineWidth = 1;
    edges.forEach((e, k) => {
      const [ax, ay] = at(byId[e.source]);
      const [bx, by] = at(byId[e.target]);
      g.strokeStyle = 'rgba(23, 25, 28, 0.22)';
      g.beginPath();
      g.moveTo(ax, ay);
      g.lineTo(bx, by);
      g.stroke();
      const v = Math.min(1.2, rateOf(e, s) / 700); // dots per second along the edge, eased for the eye
      g.fillStyle = 'rgba(31, 95, 120, 0.8)';
      dots[k] = dots[k].map((p) => (p + (v * dt) / 1000) % 1);
      if (rateOf(e, s) < 1) return;
      for (const p of dots[k]) {
        g.beginPath();
        g.arc(ax + (bx - ax) * p, ay + (by - ay) * p, 2.4, 0, Math.PI * 2);
        g.fill();
      }
    });
    // Tiles.
    g.font = `500 ${tile.font}px "IBM Plex Mono", monospace`;
    g.textBaseline = 'middle';
    for (const n of nodes) {
      const [x, y] = at(n);
      const m = s.nodes[n.id];
      const u = n.kind === 'client' ? null : m ? m.util : null;
      const hot = n.id === bottleneck && u != null && u >= 0.97;
      const pulse = hot ? 0.5 + 0.5 * Math.sin(now / 180) : 0;
      g.fillStyle = '#fbfbf8';
      g.strokeStyle = hot ? `rgba(196, 80, 44, ${0.6 + 0.4 * pulse})` : 'rgba(23, 25, 28, 0.28)';
      g.lineWidth = hot ? 2.5 : 1;
      g.beginPath();
      g.rect(x - tile.w / 2, y - tile.h / 2, tile.w, tile.h);
      g.fill();
      g.stroke();
      // The component's name on up to two lines, then its busy bar and percentage (or a note).
      g.fillStyle = '#17191c';
      g.textAlign = 'left';
      const lh = tile.font * 1.3;
      const left = x - tile.w / 2 + 7;
      wrap(n.label, tile.w - 14).forEach((line, i) => g.fillText(line, left, y - tile.h / 2 + 4 + lh * (i + 0.5)));
      const by = y + tile.h / 2 - 11;
      g.fillStyle = '#5b6066';
      if (n.kind === 'client') {
        g.fillText(fit(`${fmt(s.offeredRps)}/s`, tile.w - 14), left, by + 3);
      } else if (u == null) {
        // No consumers in this preset (the tool leaves it out of bottleneck detection): show its backlog.
        g.fillText(fit(m ? `${fmt(m.avgQueue)} queued` : 'queue', tile.w - 14), left, by + 3);
      } else {
        g.textAlign = 'right';
        g.fillStyle = '#17191c';
        const pct = `${Math.round(u * 100)}%`;
        g.fillText(pct, x + tile.w / 2 - 7, by + 3);
        const bw = tile.w - 14 - g.measureText('100%').width - 6;
        g.fillStyle = 'rgba(23, 25, 28, 0.1)';
        g.fillRect(left, by, bw, 6);
        g.fillStyle = colour(u);
        g.fillRect(left, by, bw * Math.min(1, u), 6);
      }
    }
  }

  let raf = 0;
  let last = 0;
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = last ? Math.min(64, now - last) : 16;
    last = now;
    if (auto) {
      since += dt;
      if (since > STEP_MS) {
        since = 0;
        setLevel(level + 1 < sweep.length ? level + 1 : 0);
      }
    }
    draw(ctx.reduced ? 0 : dt, now);
  }

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
      // Six columns of tiles across the plate, never overlapping at phone width.
      const tw = Math.max(50, Math.min(112, (w - 24) / 6.6));
      const font = tw < 80 ? 9.5 : 12;
      tile = { w: tw, h: Math.round(font * 1.3 * 2 + 24), font };
      dpr = Math.min(window.devicePixelRatio || 1, ctx.tier === 'low' ? 1 : 1.5);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      draw(0, performance.now());
    },
    readout() {
      const s = sweep[level];
      const err = s.errorRate > 0 ? `, ${(s.errorRate * 100).toFixed(1)}% dropped` : '';
      return `${fmt(s.offeredRps)} req/s, p99 ${fmt(s.latencyMs.p99)} ms${err}`;
    },
    destroy() {
      cancelAnimationFrame(raf);
      layer.replaceChildren();
    },
  };
}
