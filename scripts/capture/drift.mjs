// Drift track (github.com/warrensunion/drift). Two jobs, both read-only towards the drift folder:
//
//   node scripts/capture/drift.mjs --tracks   Runs Drift's own simulation (src/sim/ensemble.js with the shipped
//       public/model/drift.onnx in onnxruntime-web, from drift's node_modules) in Node, exactly as its Web Worker
//       sets it up, for a few drop sites, and writes public/drift/tracks.json (monthly [lon, lat] of sampled
//       simulated copies over 10 years) and public/drift/land.png (Drift's Natural Earth land mask, downsized).
//   node scripts/capture/drift.mjs           Records the clips and stills from the live deploy (DRIFT_URL to
//       override): public/captures/drift/s<k>.{webm,mp4}, manifest.json and public/stills/drift-s<i>.webp.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { chromium } from 'playwright';
import { newContext, encode, finishVideo, probe, glide, centre, clock, gitHead, root, VIEW, STILL } from './lib.mjs';
import { GPU_ARGS } from '../lib/preview.mjs';

const D = process.env.DRIFT_DIR || 'C:/Users/Warren/Downloads/drift';
const LIVE = process.env.DRIFT_URL || 'https://warrensunion.github.io/drift/';
if (!existsSync(path.join(D, 'src/sim/ensemble.js'))) throw new Error(`no Drift checkout at ${D}`);

if (process.argv.includes('--tracks')) await tracks();
else await capture();

// ---------------------------------------------------------------------------------------------------------
// Tracks: the model's own output, run offline.
// ---------------------------------------------------------------------------------------------------------
async function tracks() {
  const imp = (p) => import(pathToFileURL(path.join(D, p)).href);
  const { createSim, STATE } = await imp('src/sim/ensemble.js');
  const { decodeTile, sample } = await imp('src/sim/field.js');
  const { features } = await imp('src/sim/features.js');
  const { makeRng } = await imp('src/sim/fragment.js');
  // The same build the worker imports ('onnxruntime-web/wasm', default condition).
  const ort = await imp('node_modules/onnxruntime-web/dist/ort.wasm.bundle.min.mjs');
  const ortVersion = JSON.parse(readFileSync(path.join(D, 'node_modules/onnxruntime-web/package.json'), 'utf8')).version;
  const meta = JSON.parse(readFileSync(path.join(D, 'public/model/drift.meta.json'), 'utf8'));

  const buf = (p) => { const b = readFileSync(path.join(D, p)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
  const fields = {
    current: Array.from({ length: 12 }, (_, i) => decodeTile(buf(`public/data/currents/clim-${String(i + 1).padStart(2, '0')}.bin`))),
    wind: decodeTile(buf('public/data/wind/clim.bin')),
  };
  // Exactly worker.js loadModel().
  ort.env.wasm.numThreads = 1;
  const session = await ort.InferenceSession.create(new Uint8Array(buf('public/model/drift.onnx')), { executionProviders: ['wasm'] });
  const predict = async (x, n) => {
    const r = await session.run({ x: new ort.Tensor('float32', x, [n, 10]) });
    return { mu: r.mu.data, logSigma: r.log_sigma.data };
  };

  const ITEM = 'bottle'; // the app's default item
  const START_DOY = 1; // dropped on 1 January
  const PER_SITE = 40;
  const DAYS = 3650;
  const sampleDays = Array.from({ length: 121 }, (_, k) => Math.round((k * DAYS) / 120)); // monthly, 0..3650
  const SITES = [
    // Richmond's waterways drain through the Fraser into the Strait of Georgia, which the 1 deg global current
    // grid treats as land; the nearest open-ocean drop is off the mouth of Juan de Fuca Strait.
    { id: 'bc', name: 'Off Juan de Fuca Strait, British Columbia', lon: -126.5, lat: 48.3 },
    { id: 'npac', name: 'North Pacific, east of Japan', lon: 150.5, lat: 34.5 },
    { id: 'natl', name: 'North Atlantic, off Cape Hatteras', lon: -72.5, lat: 34.5 },
    { id: 'ind', name: 'Indian Ocean, south of Sri Lanka', lon: 80.5, lat: 2.5 },
  ];
  const round1 = (v) => Math.round(v * 10) / 10;
  const out = [];
  for (const site of SITES) {
    const month = 0;
    if (sample(fields.current[month], site.lon, site.lat, 0) === null) throw new Error(`${site.id}: drop point has no current (land on the 1 deg grid)`);
    // One path per dropped copy: each drop starts as 24 copies; where a copy split, one of its branches is
    // drawn at random (fixed seed), so a piece's whole lineage counts once, not once per fragment.
    const rng = makeRng(7);
    const leaves = [];
    let simulated = 0;
    let seed = 20261014;
    const seedsUsed = [];
    while (leaves.length < PER_SITE) {
      const s = seed++;
      seedsUsed.push(s);
      const got = await runDrop(site, s);
      simulated += got.length;
      const byRoot = new Map();
      for (const p of got) { if (!byRoot.has(p.root)) byRoot.set(p.root, []); byRoot.get(p.root).push(p); }
      for (const list of byRoot.values()) leaves.push(list[Math.floor(rng() * list.length)]);
    }
    // Then PER_SITE of those, drawn uniformly with the same fixed-seed stream (no picking of nice-looking ones).
    const pool = leaves.slice();
    const picked = [];
    while (picked.length < PER_SITE) picked.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
    const fates = { floating: 0, beached: 0, sunk: 0 };
    for (const p of picked) fates[p.state[p.state.length - 1] === 's' ? 'sunk' : p.state[p.state.length - 1] === 'b' ? 'beached' : 'floating']++;
    out.push({
      id: site.id, name: site.name, drop: [site.lon, site.lat], seeds: seedsUsed, copiesAtEnd: simulated, lineages: leaves.length,
      endFates: fates,
      paths: picked.map((p) => { const end = p.state.indexOf('s'); const pos = end < 0 ? p.pos : p.pos.slice(0, end + 1); return { p: pos.map(([lo, la]) => [round1(lo), round1(la)]), s: p.state.join('') }; }),
    });
    console.log(`  ${site.id}: ${simulated} copies, ${leaves.length} lineages from ${seedsUsed.length} drop(s), kept ${PER_SITE}; end ${JSON.stringify(fates)}`);
  }

  // One drop in its own sim (as the worker does: createSim with fields, the model and features; default 24
  // members, budget 20,000), stepped day by day to 3650. Every member's position is recorded on the sample
  // days. A split clones a fragment's members into 4 children; the first child continues each member's path,
  // the others branch from it (sharing its history), so every simulated copy alive at the end has a whole path.
  async function runDrop(site, seed) {
    const sim = createSim({ fields, predict, featuresFn: features });
    const dropId = sim.drop(ITEM, site.lon, site.lat, START_DOY, seed);
    const m = sim.members;
    const paths = []; // {pos: [[lon,lat]...], state: [...]} per path id
    let pid = []; // member index -> path id
    for (let i = 0; i < m.count; i++) { pid.push(paths.length); paths.push({ root: i, pos: [], state: [] }); }
    const record = () => {
      for (let i = 0; i < m.count; i++) {
        const p = paths[pid[i]];
        p.pos.push([m.lon[i], m.lat[i]]);
        p.state.push(m.state[i] === STATE.sunk ? 's' : m.state[i] === STATE.beached ? 'b' : 'f');
      }
    };
    record();
    let si = 1;
    for (let day = 1; day <= DAYS; day++) {
      const prevFrag = Array.from(m.fragmentId.subarray(0, m.count));
      const prevIds = new Set(prevFrag);
      await sim.stepDrop(dropId);
      const curFrag = Array.from(m.fragmentId.subarray(0, m.count));
      const curIds = new Set(curFrag);
      const changed = curFrag.length !== prevFrag.length || [...curIds].some((id) => !prevIds.has(id));
      if (changed) {
        // compact() is stable: members of fragments that did not split keep their order, and children are
        // appended after them, parent by parent, child by child, cloning the parent's members in order.
        const removed = new Set([...prevIds].filter((id) => !curIds.has(id)));
        const survivorsPrev = [];
        const parentMembers = new Map();
        prevFrag.forEach((f, i) => {
          if (removed.has(f)) { if (!parentMembers.has(f)) parentMembers.set(f, []); parentMembers.get(f).push(pid[i]); }
          else survivorsPrev.push(pid[i]);
        });
        const next = [];
        let s = 0;
        const firstKid = new Set();
        let i = 0;
        while (i < curFrag.length) {
          const f = curFrag[i];
          if (prevIds.has(f)) { next.push(survivorsPrev[s++]); i++; continue; }
          const frag = sim.fragments.get(f);
          const parent = parentMembers.get(frag.parentId);
          if (!parent) throw new Error('split child without a known parent');
          let k = 0;
          const continues = !firstKid.has(frag.parentId);
          firstKid.add(frag.parentId);
          while (i < curFrag.length && curFrag[i] === f) {
            const src = parent[k++];
            if (continues) next.push(src);
            else {
              next.push(paths.length);
              paths.push({ root: paths[src].root, pos: paths[src].pos.slice(), state: paths[src].state.slice() });
            }
            i++;
          }
          if (k !== parent.length) throw new Error(`child got ${k} of ${parent.length} members (budget-limited split)`);
        }
        if (s !== survivorsPrev.length) throw new Error('survivor count mismatch');
        pid = next;
      }
      if (day === sampleDays[si]) { record(); si++; }
    }
    if (sim.usingFallback) throw new Error('the model was not used');
    const alive = new Set(pid);
    return [...alive].map((id) => paths[id]).filter((p) => p.pos.length === sampleDays.length);
  }

  const outDir = path.join(root, 'public/drift');
  mkdirSync(outDir, { recursive: true });
  const doc = {
    about: 'Simulated copies of a plastic bottle dropped at sea, moved by Drift\'s own drift model. Model output (a simulation with uncertainty), not observations and not a forecast.',
    source: { repo: 'https://github.com/warrensunion/drift', commit: gitHead(D), live: LIVE },
    model: {
      name: 'Drift MLP drift model (public/model/drift.onnx)',
      version: meta.version,
      architecture: meta.architecture,
      trainedOn: meta.trainedOn,
      rmseKmPerDay: { model: 21.05, advection: 21.78, note: 'held-out test drifters, MODEL.md' },
      runtime: `onnxruntime-web ${ortVersion} (wasm, 1 thread) in Node ${process.version}`,
    },
    method: `Drift's src/sim/ensemble.js run offline with the shipped ONNX model, as its Web Worker runs it: item "${ITEM}", dropped on day of year ${START_DOY}, 24 members per drop, one day per step for ${DAYS} days; each day a floating member moves by mu + sigma * z on the monthly OSCAR current and QuikSCAT wind climatology; beaching, resuspension, sinking and fragmentation follow src/sim/constants.js. A split clones a fragment's members, so branching copies share history. Per site, ${PER_SITE} of the copies alive at day ${DAYS} were drawn uniformly with a fixed seed.`,
    generated: new Date().toISOString().slice(0, 10),
    units: { position: '[lon, lat] in degrees, rounded to 0.1, lon in -180..180 (paths may wrap at the antimeridian)', time: 'samples[k] is the day since the drop (about one month apart)', state: 'one letter per sample: f floating, b beached, s sunk', trimming: 'p stops at the first sunk sample; a sunk copy never moves again, so hold its last position for the remaining samples' },
    samples: sampleDays,
    sites: out,
  };
  const json = JSON.stringify(doc);
  writeFileSync(path.join(outDir, 'tracks.json'), json + '\n');
  console.log(`tracks.json: ${(json.length / 1024).toFixed(0)} kB`);

  // Land: Drift's public/data/landmask.png (Natural Earth 1:50m land, public domain; 2048x1024 equirect, row 0 =
  // 90 N, column 0 = 180 W, 255 = land) downsized to 720x360, land white on transparent.
  const { data } = await sharp(path.join(D, 'public/data/landmask.png')).greyscale().resize(720, 360, { kernel: 'lanczos3' }).raw().toBuffer({ resolveWithObject: true });
  const rgba = Buffer.alloc(720 * 360 * 4);
  for (let i = 0; i < 720 * 360; i++) { rgba[4 * i] = rgba[4 * i + 1] = rgba[4 * i + 2] = 255; rgba[4 * i + 3] = data[i]; }
  await sharp(rgba, { raw: { width: 720, height: 360, channels: 4 } }).png({ compressionLevel: 9, palette: true, colours: 16 }).toFile(path.join(outDir, 'land.png'));
  console.log('land.png written');
}

// ---------------------------------------------------------------------------------------------------------
// Capture: one recording of the live site, cut into stages.
//   s0 the scroll story, chapter 1 (a bottle on a river bank) down to chapter 5 (the deep), time-compressed
//   s1 the globe: stop its spin, drop a bottle on open water, play at 365x (a year per second) to 10 years
//   s2 the Salish Sea chart: drop at the Fraser River mouth and play the tide at 30 hours per second
//   s3 still: the Salish chart at the end of its 30 days, with the panel's fates for that drop
// ---------------------------------------------------------------------------------------------------------
async function capture() {
  const OUT = path.join(root, 'public/captures/drift');
  const STILLS = path.join(root, 'public/stills');
  const WORK = path.join(root, '.capture-work/drift/video');
  mkdirSync(OUT, { recursive: true });
  rmSync(WORK, { recursive: true, force: true });
  mkdirSync(WORK, { recursive: true });
  const url = LIVE.endsWith('/') ? LIVE : LIVE + '/';
  const manifest = { source: 'drift', url, commit: gitHead(D), captured: new Date().toISOString().slice(0, 10), view: VIEW, clip: { w: 960, h: 600, fps: 24 }, stages: {} };

  const browser = await chromium.launch({ args: GPU_ARGS });
  const errs = [];
  const notes = [];
  try {
    const { context } = await newContext(browser, { video: WORK });
    const page = await context.newPage();
    page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 200));
      else if (/\[drift\]|model|wasm/i.test(m.text())) {
        notes.push(m.text());
        if (process.env.DRIFT_DEBUG) console.log(`  ${t ? t().toFixed(1) : '-'} ${m.text().slice(0, 160)}`);
      }
    });
    page.on('response', (r) => { if (r.status() >= 400) errs.push(`${r.status()} ${r.url()}`); });
    const t = clock();
    const m = {};
    // The model must be loaded before anything is filmed: the app gives up after 20 s and says it is showing
    // plain advection (honest, but not the model). So first visit the globe section, wait for the model (reload
    // and retry if a busy machine made it time out), then go back to the top of the story; the worker stays.
    for (let attempt = 1; ; attempt++) {
      const verdict = page.waitForEvent('console', { predicate: (c) => /\[drift\] (model ready|model unavailable)/.test(c.text()), timeout: 240000 });
      if (attempt === 1) await page.goto(url, { waitUntil: 'load' });
      else await page.reload({ waitUntil: 'load' });
      // The preloader fills a painted stroke from the real bytes of chapter 1's art, then lifts.
      await page.waitForFunction(() => { const p = document.getElementById('preloader'); return !p || p.classList.contains('is-out') || getComputedStyle(p).display === 'none'; }, null, { timeout: 90000 });
      await page.waitForTimeout(1000);
      await page.evaluate(() => document.getElementById('globe').scrollIntoView());
      const v = await verdict;
      if (/model ready/.test(v.text())) break;
      if (attempt >= 4) throw new Error('the drift model did not load in 4 tries: ' + v.text());
      console.log('  model timed out, retrying');
    }
    await page.waitForTimeout(1500);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(4000);
    let at = { x: 1100, y: 620 };
    await page.mouse.move(at.x, at.y);
    await page.waitForTimeout(800);
    m.s0 = t();
    await page.waitForTimeout(1500); // open on chapter 1 at rest
    // Four chapter crossings (one bottle -> it breaks -> currents -> gyres -> the deep); each fires the 1.75 s
    // painted sweep. The scroll itself runs in the page (smooth, independent of how busy the machine is).
    const chapterPx = await page.evaluate(() => document.getElementById('story').offsetHeight / 6);
    for (let c = 1; c <= 4; c++) {
      await page.evaluate((px) => new Promise((done) => {
        const y0 = scrollY, t0 = performance.now();
        const f = () => { const k = Math.min(1, (performance.now() - t0) / 700); scrollTo(0, y0 + px * (1 - (1 - k) ** 3)); if (k < 1) requestAnimationFrame(f); else done(); };
        f();
      }), chapterPx);
      await page.waitForTimeout(2400);
    }
    m.s0end = t();
    await page.waitForTimeout(1500); // the recording lags the clock; keep chapter 5 on screen past the cut
    // The globe section: jump to it (as the page's own "The globe" link does).
    await page.evaluate(() => document.getElementById('globe').scrollIntoView());
    await page.waitForTimeout(2000);
    // A short drag turns the globe and stops its idle spin, so drop points stay put.
    const g = { x: 930, y: 450 };
    await glide(page, at, g, 300);
    await page.mouse.down();
    await glide(page, g, { x: g.x + 120, y: g.y + 40 }, 400);
    await page.mouse.up();
    at = { x: g.x + 120, y: g.y + 40 };
    await page.waitForTimeout(1200);
    // Drop on open water: the ocean is dark teal, land is light chart paper. Score candidate points inside the
    // disc by their distance to the nearest light pixel (in a screenshot) and take the most open one.
    const shot = await sharp(await page.screenshot()).greyscale().raw().toBuffer({ resolveWithObject: true });
    const lum = (x, y) => shot.data[y * shot.info.width + x];
    const openness = (x, y) => {
      for (let r = 4; r <= 120; r += 4) for (let a = 0; a < 16; a++) {
        const px = Math.round(x + r * Math.cos((a / 16) * 2 * Math.PI)), py = Math.round(y + r * Math.sin((a / 16) * 2 * Math.PI));
        if (px < 0 || py < 0 || px >= shot.info.width || py >= shot.info.height || lum(px, py) > 150) return r;
      }
      return 124;
    };
    let best = null;
    for (let y = 250; y <= 650; y += 20) for (let x = 700; x <= 1160; x += 20) {
      if (Math.hypot(x - g.x, y - g.y) > 280 || lum(x, y) > 110) continue;
      const s = openness(x, y);
      if (!best || s > best.s) best = { x, y, s };
    }
    if (!best) throw new Error('no open water found on the globe');
    m.s1 = t();
    await glide(page, at, best, 500);
    await page.mouse.click(best.x, best.y); // the default item: a bottle
    await page.waitForTimeout(300);
    const fast = page.locator('.globe-speed', { hasText: '365' });
    const p3 = await centre(fast);
    await glide(page, best, p3, 500);
    await page.mouse.click(p3.x, p3.y);
    at = { x: 1390, y: 560 };
    await glide(page, p3, at, 400);
    // Play at a year per second until the timeline reaches 10 years (it waits for the worker if it lags).
    const scrub = page.locator('.globe-scrub__input');
    const t1 = Date.now();
    while (Date.now() - t1 < 90000) {
      const [v, max] = await scrub.evaluate((e) => [Number(e.value), Number(e.max)]);
      if (v >= max - 1e-6) break;
      await page.waitForTimeout(250);
    }
    m.s1end = t();
    notes.push('globe timeline at end of s1: ' + JSON.stringify(await scrub.evaluate((e) => [e.value, e.max, e.getAttribute('aria-valuetext')])));
    await page.waitForTimeout(1500);
    // Salish Sea.
    const sw = page.locator('.globe__switch [data-mode="salish"]');
    const p4 = await centre(sw);
    await glide(page, at, p4, 500);
    await page.mouse.click(p4.x, p4.y);
    await page.locator('.globe-primary').waitFor({ state: 'visible', timeout: 60000 });
    await page.waitForTimeout(3000);
    // s2 starts on the settled chart (switching can take a while on a busy machine).
    m.s2 = t();
    const p5 = await centre(page.locator('.globe-primary'));
    await glide(page, p4, p5, 500);
    await page.mouse.click(p5.x, p5.y);
    at = { x: 1390, y: 640 };
    await glide(page, p5, at, 400);
    await page.waitForTimeout(9000);
    m.s2end = t();
    await page.waitForTimeout(1500); // the recording lags the clock; keep a still tail
    // The s3 still: the Salish chart at the end of its 30 days, with the panel's fates for the drop.
    const fastS = page.locator('.globe-speed', { hasText: '365' });
    await fastS.click();
    await page.mouse.move(at.x, at.y);
    const t2 = Date.now();
    while (Date.now() - t2 < 90000) {
      const [v, max] = await scrub.evaluate((e) => [Number(e.value), Number(e.max)]);
      if (v >= max - 1e-6) break;
      await page.waitForTimeout(250);
    }
    await page.waitForTimeout(2500);
    notes.push('salish timeline at s3: ' + JSON.stringify(await scrub.evaluate((e) => [e.value, e.max, e.getAttribute('aria-valuetext')])));
    const rest = await page.screenshot();
    await sharp(rest).resize(STILL.w, STILL.h, { fit: 'cover' }).webp({ quality: 78 }).toFile(path.join(STILLS, 'drift-s3.webp'));
    const tEnd = t();
    const raw = await finishVideo(context, page, path.join(WORK, 'drift.webm'));
    // The recording starts a little after the page is created (more on a busy machine), so its timeline runs
    // behind our clock by about (clock at close - video length). Shift the marks by that.
    const vidDur = Number(probe(raw).format?.duration || 0);
    const lag = vidDur > 0 ? Math.max(0, tEnd - vidDur) : 0;
    for (const k of Object.keys(m)) m[k] = Math.max(0, m[k] - lag);
    console.log(`  video ${vidDur.toFixed(1)} s, clock ${tEnd.toFixed(1)} s, lag ${lag.toFixed(2)} s; marks ${JSON.stringify(m)}`);
    const cut = async (k, span, opts = {}) => {
      const r = await encode(raw, path.join(OUT, `s${k}`), { start: span[0], end: span[1], stillFile: path.join(STILLS, `drift-s${k}.webp`), ...opts });
      manifest.stages[k] = { file: `s${k}`, duration: r.duration };
      console.log(`  s${k}: ${r.duration.toFixed(2)} s, ${(r.bytes / 1024).toFixed(0)} kB`);
      return r.bytes;
    };
    // The painted story changes every pixel every frame; it gets a coarser CRF than the globe and the chart.
    const crf0 = (process.env.DRIFT_CRF0 || '55,44').split(',').map(Number);
    const crf = (process.env.DRIFT_CRF || '48,38').split(',').map(Number);
    let bytes = 0;
    bytes += await cut(0, [m.s0, m.s0end], { speed: Math.max(1, (m.s0end - m.s0) / 4), crf: crf0 });
    bytes += await cut(1, [m.s1, m.s1end + 0.6], { speed: Math.max(1, (m.s1end + 0.6 - m.s1) / 4), crf });
    bytes += await cut(2, [m.s2, m.s2end + 0.6], { speed: Math.max(1, (m.s2end + 0.6 - m.s2) / 4), crf });
    manifest.stages[3] = { still: 'drift-s3.webp' };
    console.log(`drift: ${(bytes / 1048576).toFixed(2)} MB`);
  } finally {
    await browser.close();
  }
  console.log('  notes: ' + [...new Set(notes)].join(' | '));
  if (errs.length) console.log('  errors: ' + errs.slice(0, 8).join(' | '));
  writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
}
