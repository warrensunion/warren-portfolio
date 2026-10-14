// Records the BTTRURSLF feature track's clips by driving BTTRURSLF's own dev server from outside with
// Playwright. BTTRURSLF is private and read only: this script never copies a file or a line of it. It runs
// an exported copy of one commit (git archive, see docs/port-notes/captures.md) and steers it with its URLs,
// flags, localStorage keys and CSS selectors, keeping only the pixels it records. Signed out, no .env, the
// Gemini key emptied, every AI, account and payment route aborted and logged in the manifest's `blocked`.
//
// Stages (tabs): 0-2 Climb, 3-5 Mereum (3 is the puzzle cards' stage), 6-8 Face scan, 9-10 BTTRmap,
// 11-12 BTTRshop, 13 Pro, 14 Stats (DOM on the portfolio; its still is kept as it is).
// Output: public/captures/bttr/<tab>/s<k>.{webm,mp4}, the stills public/stills/bttrurslf-s<i>.webp, the
// puzzle card crops public/captures/bttr/mereum/cards/ and public/captures/bttr/manifest.json.
//
// Usage: BTTRURSLF_SRC=<exported copy with node_modules> node scripts/capture/bttr.mjs [--only=climb,mereum,scan,map,shop,pro]
import { chromium } from 'playwright';
import { mkdirSync, rmSync, writeFileSync, statSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { startServer, newContext, encode, finishVideo, glide, centre, clock, root, VIEW } from './lib.mjs';
import { GPU_ARGS } from '../lib/preview.mjs';

const BT = process.env.BTTRURSLF_SRC;
if (!BT || !existsSync(path.join(BT, 'node_modules/vite/bin/vite.js'))) throw new Error('set BTTRURSLF_SRC to an exported BTTRURSLF commit with node_modules (see docs/port-notes/captures.md)');
const COMMIT = process.env.BTTRURSLF_COMMIT || 'unknown';
const PORT = Number(process.env.BTTR_PORT || 4395);
const OUT = path.join(root, 'public/captures/bttr');
const STILLS = path.join(root, 'public/stills');
const WORK = path.join(root, '.capture-work/bttr');
const TABS = ['climb', 'mereum', 'scan', 'map', 'shop', 'pro'];
const only = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
const want = (k) => !only.length || only.includes(k);

// Every route that would reach Gemini, an account, ads or a payment, and the hosts behind them.
const BLOCK = [
  '**/api/*/chat', '**/api/*/scan', '**/api/*/plan', '**/api/explain',
  '**/api/knowledge/exercise', '**/api/knowledge/check', '**/api/sociability/**',
  '**/api/pro/**', '**/api/stripe/**', '**/api/_dev/**', '**/api/ads/**', '**/api/auth/**', '**/api/_challenge*',
  '**/*stripe.com/**', '**/*stripe.network/**', '**/generativelanguage.googleapis.com/**',
];
const THUMB = sharp({ create: { width: 320, height: 180, channels: 3, background: '#d8d9e2' } }).png().toBuffer();
const FLAGS = 'preloader=0&intro=0&account=0';
const url = (hash, q = 'sky=clear&time=day') => `${srv.url}/?${FLAGS}${q ? '&' + q : ''}#${hash}`;

const iso = (d) => d.toISOString().slice(0, 10);
const dayOff = (n) => iso(new Date(Date.now() + n * 864e5));
// A guest's climb in BTTRURSLF's own storage shape: a 10-day goal, `stage` days climbed (one stage a day).
const climbAt = (stage, heard = []) => ({ climbs: { guest: { start: dayOff(1 - stage), goal: dayOff(11 - stage), days: stage, last: dayOff(0), streak: stage, missed: 0 } }, heard: { guest: heard } });
const SETTINGS = { comms: { asked: true, tags: [], note: '', declined: true } };

const manifest = { source: 'BTTRURSLF-v2', commit: COMMIT, captured: new Date().toISOString().slice(0, 10), view: VIEW, clip: { w: 960, h: 600, fps: 24 }, stages: {}, cards: [], blocked: [] };
const prev = existsSync(path.join(OUT, 'manifest.json')) ? JSON.parse(readFileSync(path.join(OUT, 'manifest.json'), 'utf8')) : null;
if (prev && only.length && prev.commit === COMMIT) {
  for (const [k, v] of Object.entries(prev.stages)) if (TABS.includes(v.tab) && !only.includes(v.tab)) manifest.stages[k] = v;
  if (!only.includes('mereum')) manifest.cards = prev.cards || [];
  manifest.blocked = prev.blocked || [];
}

mkdirSync(WORK, { recursive: true });
mkdirSync(OUT, { recursive: true });
// Clips from the earlier stage layout (appearance, motivator, ping) are no longer used.
for (const d of readdirSync(OUT)) if (!TABS.includes(d) && statSync(path.join(OUT, d)).isDirectory()) rmSync(path.join(OUT, d), { recursive: true, force: true });

// A tab being recorded starts from an empty folder, so no clip of an older layout is left in it.
const fresh = (tab) => rmSync(path.join(OUT, tab), { recursive: true, force: true });

async function cut(raw, tab, k, stage, span, opts = {}) {
  const base = path.join(OUT, tab, `s${k}`);
  const len = span[1] - span[0];
  const speed = opts.speed ?? Math.max(1, len / 4);
  const r = await encode(raw, base, { start: span[0], end: span[1], speed, stillFile: path.join(STILLS, `bttrurslf-s${stage}.webp`), ...opts });
  manifest.stages[stage] = { tab, file: `${tab}/s${k}`, duration: r.duration };
  console.log(`  s${stage} ${tab}/s${k}: ${len.toFixed(1)} s source at x${speed.toFixed(2)} -> ${r.duration.toFixed(2)} s, ${(r.bytes / 1024).toFixed(0)} kB`);
}

async function session(browser, name, opts, fn) {
  const dir = path.join(WORK, name);
  rmSync(dir, { recursive: true, force: true });
  const { context, blocked } = await newContext(browser, { video: dir, block: BLOCK, ...opts });
  // Knowledge's Picks show YouTube thumbnails (other people's pictures and faces): a plain tile stands in.
  const swapped = [];
  await context.route('**/i.ytimg.com/**', async (route) => {
    swapped.push(route.request().url());
    route.fulfill({ status: 200, contentType: 'image/png', body: await THUMB });
  });
  const page = await context.newPage();
  page.setDefaultTimeout(90000);
  page.setDefaultNavigationTimeout(240000);
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/net::ERR_FAILED|ERR_ABORTED|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text().slice(0, 200));
  });
  const t = clock();
  let marks;
  try {
    marks = await fn(page, t);
  } catch (err) {
    await page.screenshot({ path: path.join(WORK, name + '-fail.png') }).catch(() => {});
    await context.close();
    throw err;
  }
  await page.waitForTimeout(1500); // the clip's tail stays on the last screen, not the context closing
  const raw = await finishVideo(context, page, path.join(WORK, name + '.webm'));
  manifest.blocked.push(...blocked.map((u) => `${name}: ${u}`));
  if (swapped.length) console.log(`  [${name}] ${swapped.length} YouTube thumbnail(s) replaced by a plain tile`);
  if (errs.length) console.log(`  [${name}] ${errs.length} page error(s): ${[...new Set(errs)].slice(0, 4).join(' | ')}`);
  return { raw, marks };
}

const box = async (page, sel) => {
  const b = await page.locator(sel).first().boundingBox();
  if (!b) throw new Error('no box for ' + sel);
  return b;
};
const mid = (b, fx = 0.5, fy = 0.5) => ({ x: b.x + b.width * fx, y: b.y + b.height * fy });

// The puzzle pieces of a hub screen: kind and rect of each `.pz` (BTTRURSLF's own jigsaw).
const pieces = (page) =>
  page.$$eval('.pz', (els) =>
    els.map((e) => {
      const r = e.getBoundingClientRect();
      const kind = [...e.classList].find((c) => c.startsWith('pz--') && c !== 'pz--face')?.slice(4) || 'card';
      return { kind, rect: [r.x, r.y, r.width, r.height] };
    }),
  );
async function openPieces(page, from, ms = 320) {
  let at = from;
  for (const p of await pieces(page)) {
    const to = { x: p.rect[0] + p.rect[2] * 0.5, y: Math.min(VIEW.height - 40, p.rect[1] + p.rect[3] * 0.4) };
    await glide(page, at, to, ms);
    at = to;
  }
  return at;
}

/* A fake camera written for this capture: getUserMedia answers with a 640x480 canvas stream that shows
 * BTTRURSLF's own grey clay head render (public/appearance/fit-front.webp, app art, not a person), turned
 * by a sphere remap when the capture sets window.__capCam.yaw / .pitch (degrees). */
const CAMERA = () => {
  const W = 640;
  const H = 480;
  const cam = (window.__capCam = { yaw: 0, pitch: 0, src: '/appearance/fit-front.webp', cx: 0.49, cy: 0.5, scale: 0.42 });
  let base = null;
  let key = '';
  let frame = null;
  const draw = async (canvas) => {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!base) {
      const img = await createImageBitmap(await (await fetch(cam.src)).blob());
      const c = new OffscreenCanvas(W, H);
      const g = c.getContext('2d');
      g.fillStyle = '#121418';
      g.fillRect(0, 0, W, H);
      const w = img.width * cam.scale;
      const h = img.height * cam.scale;
      g.drawImage(img, W / 2 - cam.cx * w, H / 2 - cam.cy * h, w, h);
      base = g.getImageData(0, 0, W, H);
    }
    const k = `${cam.yaw}|${cam.pitch}`;
    if (k !== key) {
      key = k;
      const out = new ImageData(new Uint8ClampedArray(base.data), W, H);
      const R = H * 0.36;
      const cx = W / 2;
      const cy = H / 2 - H * 0.02;
      const a = (cam.yaw * Math.PI) / 180;
      const b = (cam.pitch * Math.PI) / 180;
      const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b);
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const u = (x - cx) / R;
          const v = (y - cy) / R;
          const q = 1 - u * u - v * v;
          if (q <= 0) continue;
          const z = Math.sqrt(q);
          // undo the head's turn: rotate the visible point back about x (pitch), then y (yaw)
          const v1 = v * cb + z * sb;
          const z1 = -v * sb + z * cb;
          const u2 = u * ca - z1 * sa;
          const z2 = u * sa + z1 * ca;
          if (z2 <= 0) continue;
          const sx = Math.round(cx + u2 * R);
          const sy = Math.round(cy + v1 * R);
          if (sx < 0 || sy < 0 || sx >= W || sy >= H) continue;
          const i = (y * W + x) * 4;
          const j = (sy * W + sx) * 4;
          out.data[i] = base.data[j];
          out.data[i + 1] = base.data[j + 1];
          out.data[i + 2] = base.data[j + 2];
        }
      }
      frame = out;
    }
    ctx.putImageData(frame, 0, 0);
  };
  const md = navigator.mediaDevices || (navigator.mediaDevices = {});
  md.enumerateDevices = async () => [{ kind: 'videoinput', deviceId: 'capture-cam', groupId: 'capture', label: 'Capture camera' }];
  md.getUserMedia = async () => {
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    await draw(canvas);
    const tick = async () => {
      await draw(canvas);
      setTimeout(tick, 33);
    };
    tick();
    return canvas.captureStream(30);
  };
};

const srv = await startServer({ cwd: BT, args: [BT + '/node_modules/vite/bin/vite.js', '--port', String(PORT), '--strictPort'], port: PORT, env: { GEMINI_API_KEY: '', NODE_ENV: 'development' } });
const browser = await chromium.launch({ args: [...GPU_ARGS, '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
try {
  /* ── Climb: Scene 1 to the first stage, The Lake by day, The Summit at night in snow ────────────── */
  if (want('climb')) {
    console.log('climb');
    fresh('climb');
    const a = await session(browser, 'climb0', { seed: { 'bttrurslf:settings:v1': SETTINGS } }, async (page, t) => {
      await page.goto(url('/'));
      await page.waitForSelector('.clm-s1', { timeout: 90000 });
      await page.waitForTimeout(2600); // Scene 1 dims and invites
      const m = { a: t() };
      const go = await box(page, '.clm-s1__go');
      await glide(page, { x: 1100, y: 250 }, { x: 760, y: 330 }, 900);
      await glide(page, { x: 760, y: 330 }, mid(go), 900);
      await page.mouse.down();
      await page.mouse.up();
      await page.waitForSelector('.clm-goal__date');
      await page.waitForTimeout(500);
      await page.locator('.clm-goal__date').fill(dayOff(30));
      await page.waitForTimeout(700);
      const yes = await box(page, '.clm-goal__yes');
      await glide(page, mid(go), mid(yes), 700);
      await page.mouse.down();
      await page.mouse.up();
      await page.waitForSelector('.thing', { timeout: 30000 });
      // the cloud pass (.clm-pass) leaves once the clouds have parted on stage 1
      await page.waitForFunction(() => !document.querySelector('.clm-pass'), null, { timeout: 60000 }).catch(() => console.log('  clouds still up'));
      // under load the stage's photo can still be decoding: wait for every picture on the menu
      await page.waitForFunction(() => [...document.querySelectorAll('.menu img')].filter((i) => i.getBoundingClientRect().width > 0).every((i) => i.complete && i.naturalWidth > 0), null, { timeout: 90000 }).catch(() => console.log('  stage pictures not loaded'));
      await page.waitForTimeout(4500); // the clouds part, the stage settles and its first line types out
      m.b = t();
      return m;
    });
    await cut(a.raw, 'climb', 0, 0, [a.marks.a, a.marks.b], { crf: [46, 36] });

    const b = await session(browser, 'climb1', { seed: { 'bttrurslf:settings:v1': SETTINGS, 'bttrurslf:climb:v1': climbAt(2) } }, async (page, t) => {
      await page.goto(url('/'));
      await page.waitForSelector('.thing', { timeout: 90000 });
      await page.waitForTimeout(1200);
      const m = { a: t() };
      const things = await page.$$eval('.thing', (els) => els.map((e) => ({ cls: e.className, r: e.getBoundingClientRect().toJSON() })));
      const mer = things.find((x) => /mereum/.test(x.cls)) || things[0];
      const onx = things.find((x) => /onix/.test(x.cls)) || things[1];
      await glide(page, { x: 700, y: 700 }, { x: mer.r.x + mer.r.width * 0.5, y: mer.r.y + mer.r.height * 0.45 }, 1100);
      await page.waitForTimeout(900);
      await glide(page, { x: mer.r.x + mer.r.width * 0.5, y: mer.r.y + mer.r.height * 0.45 }, { x: onx.r.x + onx.r.width * 0.5, y: onx.r.y + onx.r.height * 0.4 }, 900);
      await page.waitForTimeout(900);
      m.b = t();
      return m;
    });
    await cut(b.raw, 'climb', 1, 1, [b.marks.a, b.marks.b], { crf: [46, 36] });

    const c = await session(browser, 'climb2', { seed: { 'bttrurslf:settings:v1': SETTINGS, 'bttrurslf:climb:v1': climbAt(10, [10]) } }, async (page, t) => {
      await page.goto(url('/', 'time=night&code=73'));
      await page.waitForSelector('.thing.has-night', { timeout: 90000 }).catch(() => console.log('  no night guides'));
      // The night scene with snow is heavy to draw: the cursor is placed on the BTTRmap link first and
      // the clip is the next 4 s in real time, so the snow falls at its own speed.
      const link = page.locator('.menu a').filter({ hasText: 'BTTRmap' }).first();
      const p = (await link.boundingBox()) || { x: 200, y: 300, width: 10, height: 10 };
      await glide(page, { x: 900, y: 650 }, mid(p), 900);
      await page.waitForTimeout(1500);
      const m = { a: t() };
      await page.waitForTimeout(4200);
      m.b = t();
      return m;
    });
    await cut(c.raw, 'climb', 2, 2, [c.marks.a, c.marks.b], { speed: 1, crf: [48, 38] });
  }

  /* ── Mereum's hub: Appearance (the puzzle cards), Sociability, Knowledge ─────────────────────────── */
  if (want('mereum')) {
    console.log('mereum');
    fresh('mereum');
    const cardsDir = path.join(OUT, 'mereum/cards');
    rmSync(cardsDir, { recursive: true, force: true });
    mkdirSync(cardsDir, { recursive: true });
    const crop = async (page, list, face) => {
      const out = [];
      for (const p of list) {
        const [x, y, w, h] = p.rect.map(Math.round);
        const hh = Math.min(h, VIEW.height - y);
        const buf = await page.screenshot({ clip: { x, y, width: w, height: hh } });
        await sharp(buf).webp({ quality: 80 }).toFile(path.join(cardsDir, `${p.kind}-${face}.webp`));
        out.push({ kind: p.kind, rect: [x / VIEW.width, y / VIEW.height, w / VIEW.width, hh / VIEW.height] });
      }
      return out;
    };
    const a = await session(browser, 'mereum0', { seed: { 'bttrurslf:settings:v1': SETTINGS } }, async (page, t) => {
      await page.goto(url('/appearance'));
      await page.waitForSelector('.pz', { timeout: 90000 });
      await page.mouse.move(VIEW.width - 20, 30);
      await page.waitForTimeout(1800);
      await crop(page, await pieces(page), 'closed');
      const m = { a: t() };
      let at = await openPieces(page, { x: VIEW.width - 20, y: 30 }, 300);
      await page.waitForTimeout(1400); // the last unfold finishes
      const ask = page.locator('.mer__ask');
      await ask.waitFor({ state: 'visible' });
      const target = await centre(ask);
      await glide(page, at, target, 800);
      await page.mouse.down();
      await page.mouse.up();
      await page.waitForSelector('li.mer__act', { timeout: 8000 }).catch(() => console.log('  no action card'));
      await page.waitForTimeout(1800);
      m.b = t();
      await page.waitForTimeout(1500); // the recording lags the clock: the tail is the finished board
      manifest.cards = (await crop(page, await pieces(page), 'open')).map((c) => ({ ...c, closed: `mereum/cards/${c.kind}-closed.webp`, open: `mereum/cards/${c.kind}-open.webp` }));
      return m;
    });
    await cut(a.raw, 'mereum', 0, 3, [a.marks.a, a.marks.b], { crf: [47, 37] });

    const b = await session(browser, 'mereum1', { seed: { 'bttrurslf:settings:v1': SETTINGS } }, async (page, t) => {
      await page.goto(url('/sociability'));
      await page.waitForSelector('.pz', { timeout: 90000 });
      await page.mouse.move(VIEW.width - 20, 300);
      await page.waitForTimeout(1500);
      const m = { a: t() };
      let at = await openPieces(page, { x: VIEW.width - 20, y: 300 }, 420);
      await page.waitForTimeout(1200);
      const who = page.locator('button', { hasText: 'A grieving friend' }).first();
      if (await who.isVisible().catch(() => false)) {
        const to = await centre(who);
        await glide(page, at, to, 800);
        await page.mouse.down();
        await page.mouse.up();
        at = to;
      }
      await page.waitForTimeout(900);
      m.b = t();
      return m;
    });
    await cut(b.raw, 'mereum', 1, 4, [b.marks.a, b.marks.b], { crf: [48, 38] });

    const c = await session(browser, 'mereum2', { seed: { 'bttrurslf:settings:v1': SETTINGS } }, async (page, t) => {
      await page.goto(url('/knowledge?s=math&tab=picks'));
      await page.waitForSelector('.pz', { timeout: 90000 });
      await page.mouse.move(VIEW.width - 20, 300);
      await page.waitForTimeout(1500);
      const m = { a: t() };
      const at = await openPieces(page, { x: VIEW.width - 20, y: 300 }, 420);
      await page.waitForTimeout(1200);
      const ask = page.locator('input[placeholder*="Ask Mereum"], textarea[placeholder*="Ask Mereum"]').first();
      if (await ask.isVisible().catch(() => false)) await glide(page, at, await centre(ask), 900);
      await page.waitForTimeout(900);
      m.b = t();
      return m;
    });
    await cut(c.raw, 'mereum', 2, 5, [c.marks.a, c.marks.b], { crf: [48, 38] });
  }

  /* ── Face scan: the live guided front scan on the fake camera, to the analysis ──────────────────── */
  if (want('scan')) {
    console.log('scan');
    fresh('scan');
    const s = await session(browser, 'scan', { seed: { 'bttrurslf:settings:v1': { ...SETTINGS, puzzle: false } }, init: [CAMERA] }, async (page, t) => {
      page.setDefaultTimeout(240000);
      await page.goto(url('/appearance'));
      await page.waitForSelector('.card--face[data-view="front"] .face', { timeout: 90000 });
      await page.waitForTimeout(1500);
      const m = { a: t() };
      const card = await box(page, '.card--face[data-view="front"] .face');
      await glide(page, { x: 1200, y: 700 }, mid(card), 900);
      await page.mouse.down();
      await page.mouse.up();
      await page.waitForSelector('.scan.is-open');
      await page.waitForTimeout(600);
      if (await page.locator('.scan-consent__box').count()) {
        await page.click('.scan-consent__box');
        await page.waitForTimeout(400);
        await page.click('.scan-consent__go');
      }
      await page.waitForSelector('.scan__cam');
      await page.waitForTimeout(500);
      await page.click('.scan__cam');
      await page.waitForSelector('.scan-cam');
      // Follow the camera's own arrows; learn which way the fake head has to turn on each axis.
      const sign = { yaw: 1, pitch: 1 };
      const DIR = { left: [1, 0], right: [-1, 0], up: [0, 1], down: [0, -1], upLeft: [1, 1], upRight: [-1, 1], downLeft: [1, -1], downRight: [-1, -1] };
      let lastIcon = '';
      let since = Date.now();
      let litAt = 0;
      const t0 = Date.now();
      while (Date.now() - t0 < 200000) {
        const st = await page.evaluate(() => {
          const c = document.querySelector('.scan-cam');
          return { phase: c?.dataset.phase || null, icon: c?.querySelector('.scan-cam__icon')?.dataset.icon || null, lit: c ? c.querySelectorAll('.scan-cam__seg.is-lit').length : 0, stuck: c ? !c.querySelector('.scan-cam__stuck')?.hidden : false, wait: !!document.querySelector('.fa-wait'), fa: !!document.querySelector('.fa') };
        });
        if (st.phase && !m[st.phase]) m[st.phase] = t();
        if (st.wait && !m.wait) m.wait = t();
        if (st.fa) {
          m.fa = t();
          break;
        }
        if (st.stuck) {
          console.log('  stuck: Scan anyway');
          await page.click('.scan-cam__anyway');
          await page.waitForTimeout(500);
          continue;
        }
        if (st.phase === 'fill') {
          if (st.lit > litAt) {
            litAt = st.lit;
            since = Date.now();
          } else if (Date.now() - since > 4000 && st.icon === lastIcon) {
            const [dy, dp] = DIR[st.icon] || [0, 0];
            if (dy) sign.yaw *= -1;
            if (dp) sign.pitch *= -1;
            since = Date.now();
            lastIcon = '';
          }
          if (st.icon !== lastIcon) {
            lastIcon = st.icon;
            const [dy, dp] = DIR[st.icon] || [0, 0];
            await page.evaluate(([y, p]) => Object.assign(window.__capCam, { yaw: y, pitch: p }), [dy * sign.yaw * 28, dp * sign.pitch * 14]);
          }
        }
        await page.waitForTimeout(250);
      }
      if (!m.fa) throw new Error('no analysis');
      console.log('  scan marks', JSON.stringify(Object.fromEntries(Object.entries(m).map(([k, v]) => [k, +v.toFixed(1)]))));
      await page.waitForTimeout(1600);
      m.fa1 = t();
      // the analysis: turn the mask, then open a row so it glows on the mask
      const stage = await box(page, '.fa__stage');
      const c0 = mid(stage);
      await glide(page, { x: c0.x + 200, y: c0.y + 150 }, c0, 600);
      await page.mouse.down();
      await glide(page, c0, { x: c0.x + 160, y: c0.y + 10 }, 900);
      await glide(page, { x: c0.x + 160, y: c0.y + 10 }, { x: c0.x - 60, y: c0.y }, 900);
      await page.mouse.up();
      const row = page.locator('.fa__row').nth(1);
      if (await row.isVisible().catch(() => false)) {
        await glide(page, { x: c0.x - 60, y: c0.y }, await centre(row), 800);
        await page.mouse.down();
        await page.mouse.up();
      }
      await page.waitForTimeout(1500);
      m.b = t();
      return m;
    });
    const k = s.marks;
    const fill = k.fill ?? k.go ?? k.hold;
    await cut(s.raw, 'scan', 0, 6, [k.a, fill], { crf: [44, 34] });
    await cut(s.raw, 'scan', 1, 7, [fill, k.fa1], { crf: [44, 34] });
    await cut(s.raw, 'scan', 2, 8, [k.fa1, k.b], { crf: [44, 34] });
  }

  /* ── BTTRmap: BTTRtasks routes the day; BTTRday to a destination ─────────────────────────────────── */
  if (want('map')) {
    console.log('map');
    fresh('map');
    const s = await session(browser, 'map', { seed: { 'bttrurslf:settings:v1': SETTINGS } }, async (page, t) => {
      await page.goto(url('/map'));
      await page.waitForSelector('.bm-scope', { timeout: 90000 });
      await page.waitForTimeout(1500);
      const m = { a: t() };
      const every = await box(page, '.bm-scope[data-scope="everywhere"]');
      await glide(page, { x: 700, y: 450 }, mid(every), 900);
      await page.mouse.down();
      await page.mouse.up();
      await page.waitForSelector('.bm-task', { timeout: 15000 });
      await page.waitForTimeout(3200); // the route snakes from Home and the pins pop in
      m.b = t();
      const day = page.locator('.bm-panel--day button', { hasText: /6-pack|Build muscle|Run a 5K/ }).first();
      let at = mid(every);
      if (await day.isVisible().catch(() => false)) {
        const to = await centre(day);
        await glide(page, at, to, 900);
        await page.mouse.down();
        await page.mouse.up();
        at = to;
        await page.waitForTimeout(500);
      }
      const gen = page.locator('.bm-panel--day button', { hasText: /Generate/ }).first();
      if (await gen.isVisible().catch(() => false)) {
        const to = await centre(gen);
        await glide(page, at, to, 700);
        await page.mouse.down();
        await page.mouse.up();
      }
      await page.waitForTimeout(3600);
      m.c = t();
      return m;
    });
    await cut(s.raw, 'map', 0, 9, [s.marks.a, s.marks.b], { crf: [46, 36] });
    await cut(s.raw, 'map', 1, 10, [s.marks.b, s.marks.c], { crf: [46, 36] });
  }

  /* ── BTTRshop: the ice blocks to the lit ring, the dive to the B and the market ───────────────── */
  if (want('shop')) {
    console.log('shop');
    fresh('shop');
    const s = await session(browser, 'shop', { seed: { 'bttrurslf:settings:v1': SETTINGS, 'bttr.shop.instant': '0' } }, async (page, t) => {
      await page.goto(url('/shop?at=face'));
      await page.waitForSelector('.shop-hub.is-ready', { timeout: 90000 });
      await page.waitForFunction(() => window.__shopHub && window.__shopHub.scene, null, { timeout: 30000 }).catch(() => console.log('  no __shopHub.scene (no WebGL?)'));
      await page.waitForTimeout(1500);
      const jump = async (a, b, ms) => {
        const n = Math.max(2, Math.round(ms / 16));
        for (let i = 0; i <= n; i++) {
          await page.evaluate((px) => window.__shopHub.scroll.jump(px), a + ((b - a) * i) / n);
          await page.waitForTimeout(16);
        }
      };
      const ready = (sel) => page.waitForFunction(sel, null, { timeout: 30000 }).catch(() => console.log('  not ready: ' + sel));
      const mk = await page.evaluate(() => window.__shopHub.marks);
      const from = await page.evaluate(() => window.__shopHub.scroll.target ?? window.__shopHub.scroll.y ?? 0);
      const m = { a: t() };
      await jump(from || 0, mk.asm1, 4200);
      await ready('window.__shopHub.ring');
      await jump(mk.asm1, mk.lit, 2400);
      await page.waitForTimeout(700);
      m.b = t();
      await jump(mk.lit, mk.dive1, 1600);
      await ready('window.__shopHub.tube && window.__shopHub.tube.points');
      const tm = await page.evaluate(() => window.__shopHub.tubeMarks);
      await jump(tm.from, tm.rest, 2200);
      await page.waitForTimeout(600);
      await page.evaluate(() => (location.hash = '#/shop/market'));
      await page.waitForSelector('.shm-grid', { timeout: 30000 });
      await page.waitForTimeout(700);
      const g = await box(page, '.shm-grid');
      await glide(page, { x: g.x + 40, y: g.y + 40 }, { x: g.x + g.width * 0.7, y: Math.min(VIEW.height - 60, g.y + 300) }, 1400);
      m.c = t();
      return m;
    });
    // Fog and particles are noise to an encoder: coarser quality keeps the tab under 2.5 MB.
    await cut(s.raw, 'shop', 0, 11, [s.marks.a, s.marks.b], { crf: [48, 37] });
    await cut(s.raw, 'shop', 1, 12, [s.marks.b, s.marks.c], { crf: [48, 37] });
  }

  /* ── Pro: the Go Pro screen only (signed out it offers "Sign in to go Pro"; nothing is clicked) ── */
  if (want('pro')) {
    console.log('pro');
    fresh('pro');
    const s = await session(browser, 'pro', { seed: { 'bttrurslf:settings:v1': SETTINGS } }, async (page, t) => {
      await page.goto(url('/settings/pro'));
      await page.waitForSelector('.lgpro-plans', { timeout: 90000 });
      await page.waitForTimeout(1500);
      const m = { a: t() };
      const plans = await box(page, '.lgpro-plans');
      await glide(page, { x: 300, y: 450 }, mid(plans, 0.25, 0.5), 1200);
      await page.waitForTimeout(500);
      await glide(page, mid(plans, 0.25, 0.5), mid(plans, 0.75, 0.5), 1100);
      await page.waitForTimeout(500);
      await glide(page, mid(plans, 0.75, 0.5), { x: 520, y: 520 }, 1200);
      await page.waitForTimeout(500);
      m.b = t();
      return m;
    });
    await cut(s.raw, 'pro', 0, 13, [s.marks.a, s.marks.b]);
  }
} finally {
  await browser.close();
  srv.stop();
}

writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
function files(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const f of readdirSync(dir)) {
    const p = path.join(dir, f);
    if (statSync(p).isDirectory()) out.push(...files(p));
    else out.push(p);
  }
  return out;
}
let total = 0;
for (const tab of TABS) {
  const n = files(path.join(OUT, tab)).reduce((s, f) => s + statSync(f).size, 0);
  total += n;
  console.log(`${tab}: ${(n / 1048576).toFixed(2)} MB`);
}
console.log(`total: ${(total / 1048576).toFixed(2)} MB; blocked requests: ${manifest.blocked.length}`);
