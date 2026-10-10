// Ported from terrarium src/ui/river.js at 7612a40 (Warren's own project). Changes: reduced motion comes in as an option (no env.js); setHistory(samples) loads a whole recorded history and setPlayhead(u) draws it up to u (0..1), with the labels read at the playhead; labels in the site's mono face, with a wider gutter for it.
/**
 * The species river: the whole history of speciation in one glance. A
 * streamgraph reads as a river of lineages that branch, swell and run dry,
 * which is exactly the story NEAT speciation tells, and it needs no axis.
 *
 * Layers keep a fixed order for life (new species alternate onto the outer
 * banks, "inside-out"), so the picture never reshuffles when the window
 * scrolls. The wiggle offset (Byron & Wattenberg) is de-drifted with a moving
 * average so 300 samples of it still fit the strip, and the vertical scale is
 * eased so a population boom swells the river instead of snapping it.
 */
const SAMPLE_EVERY = 120; // ticks
const KEEP = 300; // samples
const GUTTER = 128; // css px on the right for the three labels (the mono face is wider)
const FONT = '500 11px "IBM Plex Mono", ui-monospace, monospace';

/** @param {HTMLCanvasElement} canvas @param {{ reducedMotion?:boolean }} [opts] */
export function createRiver(canvas, { reducedMotion = false } = {}) {
  const ctx = canvas.getContext('2d');
  const reduced = reducedMotion;
  let playhead = 1; // how much of the history is drawn, 0..1 (setPlayhead)
  /** @type {{ tick:number, counts: Map<number, number> }[]} */
  let samples = [];
  const hues = new Map();
  let order = []; // species ids, bottom bank to top bank
  let flip = false;
  let lastBucket = -1, lastTick = -1;
  let W = 0, H = 0, dpr = 1;
  let dirty = true, scale = 0, tScale = 0, lastT = 0;
  let geom = null; // cached layer geometry, rebuilt when samples change

  const ro = new ResizeObserver(() => { measure(); dirty = true; });
  ro.observe(canvas);
  measure();

  function measure() {
    const r = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.max(1, Math.round(r.width));
    H = Math.max(1, Math.round(r.height));
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    geom = null;
  }

  function clear() {
    samples = [];
    order = [];
    hues.clear();
    lastBucket = -1;
    geom = null;
    dirty = true;
  }

  function push(stats) {
    if (!stats) return;
    if (stats.tick < lastTick) clear(); // the world was reset
    lastTick = stats.tick;
    const bucket = Math.floor(stats.tick / SAMPLE_EVERY);
    if (bucket === lastBucket) return;
    lastBucket = bucket;
    const counts = new Map();
    for (const [id, count, hue] of stats.species || []) {
      if (count <= 0) continue;
      counts.set(id, count);
      hues.set(id, hue);
      if (!order.includes(id)) {
        // inside-out: the oldest flow in the middle, newcomers on alternating banks
        if (flip) order.unshift(id); else order.push(id);
        flip = !flip;
      }
    }
    samples.push({ tick: stats.tick, counts });
    if (samples.length > KEEP) samples.splice(0, samples.length - KEEP);
    geom = null;
    dirty = true;
  }

  /** stacked layers with a de-drifted wiggle baseline, in data units */
  function build() {
    const m = samples.length;
    const live = new Set();
    for (const s of samples) for (const id of s.counts.keys()) live.add(id);
    order = order.filter((id) => live.has(id)); // drop species that left the window
    const ids = order;
    const n = ids.length;
    // a light [1 2 1] blur per lineage: census noise reads as grit, not water
    const v = ids.map((id) => {
      const raw = samples.map((s) => s.counts.get(id) || 0);
      return raw.map((c, j) => (j === 0 || j === m - 1 ? c : (raw[j - 1] + 2 * c + raw[j + 1]) / 4));
    });
    const base = new Float64Array(m);
    // wiggle: minimise the weighted slope of every layer (d3.stackOffsetWiggle)
    let y = 0;
    for (let j = 1; j < m; j++) {
      let s1 = 0, s2 = 0;
      for (let i = 0; i < n; i++) {
        const a = v[i][j], d = a - v[i][j - 1];
        let s3 = d / 2;
        for (let k = 0; k < i; k++) s3 += v[k][j] - v[k][j - 1];
        s1 += a;
        s2 += s3 * a;
      }
      if (s1) y -= s2 / s1;
      base[j] = y;
    }
    // de-drift: centre each column on a moving average of the river's middle
    const tot = new Float64Array(m);
    for (let j = 0; j < m; j++) for (let i = 0; i < n; i++) tot[j] += v[i][j];
    const mid = new Float64Array(m);
    for (let j = 0; j < m; j++) mid[j] = base[j] + tot[j] / 2;
    const R = 24;
    let lo0 = Infinity, hi0 = -Infinity;
    for (let j = 0; j < m; j++) {
      let acc = 0, c = 0;
      for (let k = Math.max(0, j - R); k <= Math.min(m - 1, j + R); k++) { acc += mid[k]; c++; }
      base[j] -= acc / c;
      lo0 = Math.min(lo0, base[j]);
      hi0 = Math.max(hi0, base[j] + tot[j]);
    }
    // centre the whole river in the strip so its banks use the full height
    const shift = (lo0 + hi0) / 2;
    for (let j = 0; j < m; j++) base[j] -= shift;
    const ext = Math.max(1, (hi0 - lo0) / 2);
    const layers = [];
    const lo = Float64Array.from(base);
    for (let i = 0; i < n; i++) {
      const bot = Float64Array.from(lo);
      const top = new Float64Array(m);
      for (let j = 0; j < m; j++) { top[j] = lo[j] + v[i][j]; lo[j] = top[j]; }
      layers.push({ id: ids[i], bot, top, last: samples[m - 1].counts.get(ids[i]) || 0, raw: samples.map((s) => s.counts.get(ids[i]) || 0) });
    }
    return { layers, ext, m };
  }

  function draw() {
    const now = performance.now();
    const dt = lastT ? Math.min(0.1, (now - lastT) / 1000) : 0.016;
    lastT = now;
    if (!geom && samples.length) geom = build();
    if (geom) tScale = (H / 2 - 6) / geom.ext;
    // ease the scale; snap on the first frame or with reduced motion
    if (!scale || reduced) scale = tScale;
    else if (Math.abs(scale - tScale) > tScale * 0.002) { scale += (tScale - scale) * (1 - Math.exp(-4 * dt)); dirty = true; }
    else if (scale !== tScale) { scale = tScale; dirty = true; }
    if (!dirty) return;
    dirty = false;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const plotW = Math.max(40, W - GUTTER);
    const cy = H / 2;
    ctx.font = FONT;

    if (!geom || geom.m < 2) {
      ctx.strokeStyle = 'rgba(201,216,210,0.22)';
      ctx.setLineDash([2, 4]);
      ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(plotW, cy); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(201,216,210,0.55)';
      ctx.fillText('Waiting for the first census', 2, cy - 8);
      return;
    }

    const { layers, m } = geom;
    const X = (j) => (j / (m - 1)) * plotW;
    const Y = (u) => cy - u * scale;
    // the playhead: everything right of it is not drawn yet; labels read the column under it
    const xp = Math.max(0, Math.min(1, playhead)) * plotW;
    const jp = Math.round(Math.max(0, Math.min(1, playhead)) * (m - 1));
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, xp, H);
    ctx.clip();

    // smooth each bank with midpoint quadratics so 300 samples read as water
    const bank = (arr, forward) => {
      if (forward) {
        ctx.moveTo(X(0), Y(arr[0]));
        for (let j = 1; j < m - 1; j++) ctx.quadraticCurveTo(X(j), Y(arr[j]), (X(j) + X(j + 1)) / 2, Y((arr[j] + arr[j + 1]) / 2));
        ctx.lineTo(X(m - 1), Y(arr[m - 1]));
      } else {
        ctx.lineTo(X(m - 1), Y(arr[m - 1]));
        for (let j = m - 2; j > 0; j--) ctx.quadraticCurveTo(X(j), Y(arr[j]), (X(j) + X(j - 1)) / 2, Y((arr[j] + arr[j - 1]) / 2));
        ctx.lineTo(X(0), Y(arr[0]));
      }
    };
    for (const L of layers) {
      ctx.beginPath();
      bank(L.top, true);
      bank(L.bot, false);
      ctx.closePath();
      ctx.fillStyle = `hsl(${hues.get(L.id) ?? 0}, 55%, 55%)`;
      ctx.globalAlpha = 0.9;
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    // hairline seams between lineages, in the panel's ink
    ctx.strokeStyle = 'rgba(20,36,31,0.45)';
    ctx.lineWidth = 0.75;
    for (let i = 0; i < layers.length - 1; i++) { ctx.beginPath(); bank(layers[i].top, true); ctx.stroke(); }

    // the past dissolves into fog on the left
    ctx.globalCompositeOperation = 'destination-out';
    const g = ctx.createLinearGradient(0, 0, 36, 0);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 36, H);
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();
    if (xp < 1) return;

    // labels for the three biggest living species, spread so they never touch
    const big = layers.filter((L) => L.raw[jp] > 0).sort((a, b) => b.raw[jp] - a.raw[jp]).slice(0, 3);
    const tags = big.map((L) => ({ L, y0: Y((L.top[jp] + L.bot[jp]) / 2) })).sort((a, b) => a.y0 - b.y0);
    const gap = 14;
    for (let k = 0; k < tags.length; k++) tags[k].y = Math.max(tags[k].y0, k ? tags[k - 1].y + gap : 7);
    for (let k = tags.length - 1; k >= 0; k--) tags[k].y = Math.min(tags[k].y, k < tags.length - 1 ? tags[k + 1].y - gap : H - 6);
    ctx.textBaseline = 'middle';
    for (const t of tags) {
      const hue = hues.get(t.L.id) ?? 0;
      ctx.strokeStyle = `hsla(${hue}, 55%, 55%, 0.7)`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(xp + 1, t.y0);
      ctx.bezierCurveTo(xp + 6 + (plotW - xp) * 0.5, t.y0, plotW + 4, t.y, plotW + 10, t.y);
      ctx.stroke();
      ctx.fillStyle = 'rgba(201,216,210,0.92)';
      const name = `Species ${t.L.id}`;
      ctx.fillText(name, plotW + 13, t.y);
      ctx.fillStyle = 'rgba(201,216,210,0.5)';
      ctx.fillText(String(t.L.raw[jp]), plotW + 17 + ctx.measureText(name).width, t.y);
    }
    ctx.textBaseline = 'alphabetic';
  }

  return {
    push,
    draw,
    /** load a whole recorded history (census objects shaped like the worker's stats) at once */
    setHistory(list) {
      clear();
      lastTick = -1;
      for (const st of list) push(st);
    },
    /** draw the history up to u (0..1 of its length); 1 draws it all */
    setPlayhead(u) {
      u = Math.max(0, Math.min(1, u));
      if (u !== playhead) { playhead = u; dirty = true; }
    },
    /** forget the history (also happens on its own when ticks go backwards) */
    clear,
    destroy() {
      ro.disconnect();
      clear();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    },
  };
}
