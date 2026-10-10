// Records the BTTRURSLF feature track's clips (spec 5.2, plan 5 task 3) by driving BTTRURSLF's own dev
// server from outside with Playwright. BTTRURSLF is private and read only: this script uses its URLs, flags,
// localStorage keys and CSS selectors to steer it, and keeps only the pixels it records. Signed out, Gemini
// key emptied, every AI route aborted. Output: public/captures/bttr/<tab>/s<k>.{webm,mp4}, the stage stills
// public/stills/bttrurslf-s<i>.webp, the puzzle card crops and public/captures/bttr/manifest.json.
// Usage: npm run capture:bttr [-- --only=appearance,shop,motivator,ping,map]
import { chromium } from 'playwright';
import { mkdirSync, rmSync, writeFileSync, statSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { startServer, newContext, encode, finishVideo, glide, centre, clock, gitHead, root, VIEW } from './lib.mjs';
import { GPU_ARGS } from '../lib/preview.mjs';

const BT = process.env.BTTRURSLF_DIR || 'C:/Users/Warren/Downloads/BTTRURSLF-v2';
const OUT = path.join(root, 'public/captures/bttr');
const STILLS = path.join(root, 'public/stills');
const WORK = path.join(root, '.capture-work/bttr');
const only = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
const want = (k) => !only.length || only.includes(k);
const BLOCK = ['**/api/*/chat', '**/api/*/scan', '**/api/*/plan', '**/api/explain', '**/api/knowledge/exercise', '**/api/knowledge/check', '**/api/sociability/feedback', '**/generativelanguage.googleapis.com/**'];
const Q = '/?preloader=0&intro=0&account=0&sky=clear&time=day#';
const day = (() => {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
})();
// Seeds in BTTRURSLF's own storage schema; the words are ours (layout fixtures, not real answers).
const COMMS_DONE = { 'bttrurslf:settings:v1': { comms: { asked: true, tags: [], note: '', declined: true } } };
const now = Date.now();
const SEED_KNOWLEDGE = {
  ...COMMS_DONE,
  'bttrurslf:knowledge:v1': {
    subject: 'math',
    tab: 'picks',
    chats: {
      math: [
        { role: 'user', text: 'Why does the derivative of x^2 come out as 2x?', at: now - 70000 },
        { role: 'ping', at: now - 60000, text: 'Try it yourself first: take $(x+h)^2 - x^2$, divide by $h$, and let $h$ shrink. What is left?' },
        { role: 'user', text: '2x + h, and h goes to 0, so 2x.', at: now - 40000 },
        { role: 'ping', at: now - 30000, text: 'Exactly. That limit **is** the derivative. Want to try $x^3$ the same way?' },
      ],
    },
  },
};
const SEED_PRACTICE = {
  ...COMMS_DONE,
  'bttrurslf:sociability:v1': {
    talk: [],
    mode: 'chat',
    review: false,
    practice: {
      scenario: 'party',
      custom: '',
      feedback: null,
      messages: [
        { role: 'other', text: 'Hi! I don’t think we’ve met. How do you know everyone here?' },
        { role: 'user', text: 'I’m in the robotics club with half of them. You?' },
        { role: 'other', text: 'My sister dragged me along. Robotics, though, what are you building?' },
        { role: 'user', text: 'A little rover that maps a room. It mostly maps the couch so far.' },
      ],
    },
  },
};

const manifest = { source: 'BTTRURSLF-v2', commit: gitHead(BT), captured: new Date().toISOString().slice(0, 10), view: VIEW, clip: { w: 960, h: 600, fps: 24 }, stages: {}, cards: [], blocked: [] };
const prev = existsSync(path.join(OUT, 'manifest.json')) ? JSON.parse(readFileSync(path.join(OUT, 'manifest.json'), 'utf8')) : null;
if (prev && only.length) Object.assign(manifest.stages, prev.stages), (manifest.cards = prev.cards || []);

mkdirSync(WORK, { recursive: true });
mkdirSync(OUT, { recursive: true });

async function cut(raw, tab, k, stage, span, opts = {}) {
  const base = path.join(OUT, tab, `s${k}`);
  const r = await encode(raw, base, { start: span[0], end: span[1], stillFile: path.join(STILLS, `bttrurslf-s${stage}.webp`), ...opts });
  manifest.stages[stage] = { tab, file: `${tab}/s${k}`, duration: r.duration };
  console.log(`  s${stage} ${tab}/s${k}: ${r.duration.toFixed(2)} s, ${(r.bytes / 1024).toFixed(0)} kB`);
}

async function session(browser, name, opts, fn) {
  const dir = path.join(WORK, name);
  rmSync(dir, { recursive: true, force: true });
  const { context, blocked } = await newContext(browser, { video: dir, block: BLOCK, ...opts });
  const page = await context.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  const t = clock();
  const marks = await fn(page, t);
  const raw = await finishVideo(context, page, path.join(WORK, name + '.webm'));
  manifest.blocked.push(...blocked);
  if (errs.length) console.log(`  [${name}] page errors: ${errs.slice(0, 3).join(' | ')}`);
  return { raw, marks };
}

const srv = await startServer({ cwd: BT, args: [BT + '/node_modules/vite/bin/vite.js', '--port', '5393', '--strictPort'], port: 5393, env: { GEMINI_API_KEY: '', NODE_ENV: 'development' } });
const browser = await chromium.launch({ args: GPU_ARGS });
try {
  if (want('appearance')) {
    console.log('appearance');
    const cardsDir = path.join(OUT, 'appearance/cards');
    mkdirSync(cardsDir, { recursive: true });
    const { raw, marks } = await session(browser, 'appearance', { seed: COMMS_DONE }, async (page, t) => {
      await page.goto(srv.url + Q + '/appearance');
      await page.waitForSelector('.pz__piece');
      await page.mouse.move(VIEW.width - 20, 30);
      await page.waitForTimeout(1500);
      // Closed faces, cropped before anything opens.
      const pieces = await page.$$eval('.pz', (els) =>
        els.map((e) => {
          const r = e.getBoundingClientRect();
          return { kind: [...e.classList].find((c) => c.startsWith('pz--') && !/face|physique|hygiene|hair|fashion/.test(c)).slice(4), rect: [r.x, r.y, r.width, r.height] };
        }),
      );
      for (const p of pieces) {
        const [x, y, w, h] = p.rect.map(Math.round);
        const buf = await page.screenshot({ clip: { x, y, width: w, height: Math.min(h, VIEW.height - y) } });
        await sharp(buf).webp({ quality: 80 }).toFile(path.join(cardsDir, `${p.kind}-closed.webp`));
      }
      const m = { s0: t() };
      let at = { x: VIEW.width - 20, y: 30 };
      for (const p of pieces) {
        const to = { x: p.rect[0] + p.rect[2] * 0.5, y: Math.min(VIEW.height - 40, p.rect[1] + p.rect[3] * 0.4) };
        await glide(page, at, to, 320);
        at = to;
      }
      await page.waitForTimeout(1500); // the last unfold (1200 ms) finishes
      m.s1 = t();
      const ask = page.locator('.mer__ask');
      await ask.waitFor({ state: 'visible' });
      const target = await centre(ask);
      await glide(page, at, target, 900);
      await page.mouse.down();
      await page.mouse.up();
      m.s2 = t();
      await page.waitForSelector('.mer__figure[data-pose="talk"]', { timeout: 8000 }).catch(() => console.log('  no talk pose'));
      await page.waitForSelector('li.mer__act', { timeout: 15000 }).catch(() => console.log('  no action card'));
      await page.waitForFunction(() => document.querySelector('.mer__figure')?.dataset.pose === 'idle', null, { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(600);
      m.end = t();
      // Open faces and where each card sits, normalised to the frame.
      const open = await page.$$eval('.pz', (els) =>
        els.map((e) => {
          const r = e.getBoundingClientRect();
          return { kind: [...e.classList].find((c) => c.startsWith('pz--') && !/face|physique|hygiene|hair|fashion/.test(c)).slice(4), rect: [r.x, r.y, r.width, r.height] };
        }),
      );
      manifest.cards = [];
      for (const p of open) {
        const [x, y, w, h] = p.rect.map(Math.round);
        const hh = Math.min(h, VIEW.height - y);
        const buf = await page.screenshot({ clip: { x, y, width: w, height: hh } });
        await sharp(buf).webp({ quality: 80 }).toFile(path.join(cardsDir, `${p.kind}-open.webp`));
        manifest.cards.push({ kind: p.kind, rect: [x / VIEW.width, y / VIEW.height, w / VIEW.width, hh / VIEW.height], closed: `appearance/cards/${p.kind}-closed.webp`, open: `appearance/cards/${p.kind}-open.webp` });
      }
      return m;
    });
    await cut(raw, 'appearance', 0, 0, [marks.s0, marks.s1]);
    await cut(raw, 'appearance', 1, 1, [marks.s1, marks.s2]);
    await cut(raw, 'appearance', 2, 2, [marks.s2, marks.end], { speed: Math.max(1, (marks.end - marks.s2) / 4) });
  }

  if (want('shop')) {
    console.log('shop');
    const { raw, marks } = await session(browser, 'shop', { seed: COMMS_DONE }, async (page, t) => {
      await page.goto(srv.url + Q + '/shop');
      await page.waitForSelector('.shop-hub.is-ready', { timeout: 60000 });
      await page.waitForFunction(() => window.__shopHub && window.__shopHub.scene, null, { timeout: 30000 }).catch(() => console.log('  no __shopHub.scene (no WebGL?)'));
      const info = await page.evaluate(() => {
        const h = window.__shopHub;
        return { marks: h?.marks, tubeMarks: h?.tubeMarks, keys: h ? Object.keys(h) : [] };
      });
      console.log('  hub', JSON.stringify(info));
      const jump = async (a, b, ms) => {
        const n = Math.max(2, Math.round(ms / 16));
        for (let i = 0; i <= n; i++) {
          await page.evaluate((px) => window.__shopHub.scroll.jump(px), a + ((b - a) * i) / n);
          await page.waitForTimeout(16);
        }
      };
      // The ring and the tube are built lazily as the visitor scrolls towards them.
      const ready = (sel) => page.waitForFunction(sel, null, { timeout: 30000 }).catch(() => console.log('  not ready: ' + sel));
      const mk = info.marks || {};
      const m = { s3: t() };
      await jump(0, mk.asm1 ?? 1200, 3000);
      await ready('window.__shopHub.ring');
      m.s4 = t();
      const m2 = await page.evaluate(() => window.__shopHub.marks);
      await jump(m2.asm1, m2.lit, 3000);
      await page.waitForTimeout(400);
      await jump(m2.lit, m2.dive1 ?? m2.lit, 600);
      await ready('window.__shopHub.tube && window.__shopHub.tube.points');
      const tm = await page.evaluate(() => window.__shopHub.tubeMarks);
      m.s5 = t();
      await jump(tm.from, tm.rest, 3000);
      await page.waitForTimeout(700);
      m.s6 = t();
      await page.evaluate(() => (location.hash = '#/shop/market'));
      await page.waitForSelector('.shm-grid', { timeout: 30000 });
      await page.waitForTimeout(500);
      const g = await page.locator('.shm-grid').boundingBox();
      await glide(page, { x: g.x + 40, y: g.y + 40 }, { x: g.x + g.width * 0.7, y: Math.min(VIEW.height - 60, g.y + 300) }, 2400);
      m.end = t();
      return m;
    });
    // Fog and particles are noise to an encoder, so the hub clips take a coarser quality to fit 2.5 MB.
    await cut(raw, 'shop', 0, 3, [marks.s3, marks.s4], { crf: [46, 35] });
    await cut(raw, 'shop', 1, 4, [marks.s4, marks.s5], { speed: Math.max(1, (marks.s5 - marks.s4) / 4), crf: [46, 35] });
    await cut(raw, 'shop', 2, 5, [marks.s5, marks.s6], { crf: [50, 39] });
    await cut(raw, 'shop', 3, 6, [marks.s6, marks.end], { crf: [51, 41] });
  }

  if (want('motivator')) {
    console.log('motivator');
    const { raw, marks } = await session(browser, 'motivator', { seed: COMMS_DONE }, async (page, t) => {
      await page.goto(srv.url + Q + '/motivator');
      await page.waitForSelector('.mv, .mh', { timeout: 60000 });
      const skip = page.locator('.mh-intro__skip');
      if (await skip.isVisible().catch(() => false)) await skip.click();
      await page.waitForSelector('.mh-cards .mh-card', { timeout: 20000 });
      await page.waitForTimeout(600);
      const m = { s7: t() };
      await glide(page, { x: 300, y: 300 }, { x: 1000, y: 500 }, 2600);
      m.s8 = t();
      await page.evaluate(() => (location.hash = '#/motivator/quotes'));
      await page.waitForSelector('.mq-deck .mq-card', { timeout: 20000 });
      await glide(page, { x: 1000, y: 500 }, { x: 600, y: 420 }, 2600);
      m.s9 = t();
      await page.evaluate(() => (location.hash = '#/motivator/edits?tab=daily'));
      await page.waitForSelector('.me-slide', { timeout: 20000 });
      await page.waitForTimeout(1200);
      await page.mouse.move(720, 450);
      await page.mouse.wheel(0, 100);
      await page.waitForTimeout(1600);
      m.end = t();
      return m;
    });
    await cut(raw, 'motivator', 0, 7, [marks.s7, marks.s8]);
    await cut(raw, 'motivator', 1, 8, [marks.s8, marks.s9]);
    await cut(raw, 'motivator', 2, 9, [marks.s9, marks.end]);
  }

  if (want('ping')) {
    console.log('ping');
    for (const [stage, k, seed, hash, act] of [
      [10, 0, SEED_KNOWLEDGE, '/knowledge?s=math&tab=picks', async (p) => p.click('#kn-q').catch(() => {})],
      [11, 1, SEED_PRACTICE, '/sociability?view=practice', null],
    ]) {
      const { raw, marks } = await session(browser, 'ping' + k, { seed }, async (page, t) => {
        await page.goto(srv.url + Q + hash);
        await page.waitForTimeout(3000);
        const m = { a: t() };
        if (act) await act(page);
        await glide(page, { x: 1200, y: 200 }, { x: 760, y: 520 }, 2200);
        await page.waitForTimeout(900);
        m.b = t();
        return m;
      });
      await cut(raw, 'ping', k, stage, [marks.a, marks.b]);
    }
  }

  if (want('map')) {
    console.log('map');
    const route = { 'bttrurslf:map-route:v1': { day, dest: 'six-pack', picks: {}, cancelled: [] } };
    const { raw, marks } = await session(browser, 'map', { seed: { ...COMMS_DONE, ...route } }, async (page, t) => {
      await page.goto(srv.url + Q + '/map');
      // The intro marks the map .is-intro while it draws the route (about 24 s), then drops the class.
      await page.waitForSelector('.bm.is-intro', { timeout: 60000 }).catch(() => console.log('  intro did not start'));
      const m = { s12: t() };
      await page.waitForFunction(() => !document.querySelector('.bm.is-intro'), null, { timeout: 90000 }).catch(() => console.log('  intro did not end'));
      m.s13 = t();
      await page.waitForTimeout(400);
      await glide(page, { x: 400, y: 300 }, { x: 900, y: 520 }, 2400);
      m.end = t();
      return m;
    });
    // The finished map is a large painted city: a coarser quality keeps the tab under 2.5 MB.
    await cut(raw, 'map', 0, 12, [marks.s12, marks.s13], { speed: Math.max(1, (marks.s13 - marks.s12) / 4), crf: [46, 36] });
    await cut(raw, 'map', 1, 13, [marks.s13, marks.end], { crf: [50, 40] });
  }
} finally {
  await browser.close();
  srv.stop();
}

writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
const size = (dir) => {
  let n = 0;
  for (const f of readdirSafe(dir)) n += statSync(f).size;
  return n;
};
function readdirSafe(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const f of readdirSync(dir)) {
    const p = path.join(dir, f);
    if (statSync(p).isDirectory()) out.push(...readdirSafe(p));
    else out.push(p);
  }
  return out;
}
for (const tab of ['appearance', 'shop', 'motivator', 'ping', 'map']) console.log(`${tab}: ${(size(path.join(OUT, tab)) / 1048576).toFixed(2)} MB`);
console.log(`blocked AI requests: ${manifest.blocked.length}`);
