// Art pipeline: turns the generated marble renders in design/art-src into the three.js ice-block
// textures (webp, alpha), the 256px silhouettes the particle grower samples (alpha = coverage,
// RGB = shading), neutral placeholder posters and a placeholder résumé PDF. One script so the
// public/ art is always reproducible from design/art-src; Task 9 swaps the posters for real stills.
import sharp from 'sharp';
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = (f) => path.join(root, 'design/art-src', f);
const pub = (f) => path.join(root, 'public', f);
const SLUGS = ['summit-flag', 'drift-bottle', 'stress-gauge', 'raingarden-plant', 'ghostline-ghost', 'terrarium-jar', 'window-blind', 'howpolluted-globe', 'archer-bow'];
// Plain silhouettes for objects whose marble render Warren has not supplied yet (README, Fill in the
// TODOs). Drawn in code, not generated art; a real design/art-src/<slug>.png replaces them on the next run.
const PLACEHOLDER = {
  'terrarium-jar':
    '<rect x="300" y="250" width="424" height="560" rx="90" fill="#9aa3a8"/><rect x="390" y="170" width="244" height="110" rx="24" fill="#9aa3a8"/>',
  'howpolluted-globe':
    '<circle cx="512" cy="512" r="330" fill="#9aa3a8"/><ellipse cx="512" cy="512" rx="140" ry="330" fill="none" stroke="#6f787d" stroke-width="18"/><line x1="182" y1="512" x2="842" y2="512" stroke="#6f787d" stroke-width="18"/>',
};
async function placeholder(slug) {
  if (existsSync(pub(`objects/${slug}.webp`))) return console.log(`${slug}: placeholder kept`);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${MAX}" height="${MAX}">${PLACEHOLDER[slug]}</svg>`;
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  await sharp(png).webp({ quality: 86, alphaQuality: 100 }).toFile(pub(`objects/${slug}.webp`));
  await sharp(png).resize(SAMPLE, SAMPLE).png().toFile(pub(`objects/${slug}-sample.png`));
  console.log(`${slug}: placeholder silhouette written (no design/art-src/${slug}.png yet)`);
}
const PLATE = '#fbfbf8';
const MAX = 1024;
const SAMPLE = 256;
// A bow is mostly empty space (string, arrow, two limbs), so it cannot reach the 15% the solid objects do.
const MIN_COVER = { 'archer-bow': 5 };

// sRGB -> CIE Lab, for the ΔE background test.
function lab([r, g, b]) {
  const lin = (v) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const [R, G, B] = [lin(r), lin(g), lin(b)];
  const X = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047;
  const Y = 0.2126 * R + 0.7152 * G + 0.0722 * B;
  const Z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}
const dE = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

// Flood-fill from the borders over pixels close to the corner colour, then feather the matte.
async function keyBackground(rgba, w, h) {
  const px = (x, y) => (y * w + x) * 4;
  const bg = lab([rgba[0], rgba[1], rgba[2]]);
  const seen = new Uint8Array(w * h);
  const stack = [];
  const push = (x, y) => {
    const i = y * w + x;
    if (seen[i]) return;
    const p = px(x, y);
    if (dE(lab([rgba[p], rgba[p + 1], rgba[p + 2]]), bg) >= 12) return;
    seen[i] = 1;
    stack.push(x, y);
  };
  for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
  for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
  while (stack.length) {
    const y = stack.pop(), x = stack.pop();
    if (x > 0) push(x - 1, y);
    if (x < w - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y < h - 1) push(x, y + 1);
  }
  const matte = Buffer.alloc(w * h);
  for (let i = 0; i < w * h; i++) matte[i] = seen[i] ? 0 : 255;
  const soft = await sharp(matte, { raw: { width: w, height: h, channels: 1 } }).blur(1.5).raw().toBuffer();
  const out = Buffer.from(rgba);
  for (let i = 0; i < w * h; i++) out[i * 4 + 3] = Math.min(out[i * 4 + 3], soft[i]);
  return out;
}

async function cutout(slug) {
  const { data, info } = await sharp(src(`${slug}.png`)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const corners = [0, (w - 1) * 4, (h - 1) * w * 4, ((h - 1) * w + w - 1) * 4];
  const hasAlpha = corners.every((c) => data[c + 3] < 8);
  const rgba = hasAlpha ? data : await keyBackground(data, w, h);
  console.log(`${slug}: ${hasAlpha ? 'real alpha' : 'keyed background'}`);

  // Trim to content (alpha > 8) with a 4% margin, then square-pad.
  let [x0, y0, x1, y1] = [w, h, -1, -1];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (rgba[(y * w + x) * 4 + 3] > 8) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  }
  const side = Math.round(Math.max(x1 - x0 + 1, y1 - y0 + 1) * 1.08);
  const cx = (x0 + x1 + 1) / 2, cy = (y0 + y1 + 1) / 2;
  const left = Math.round(cx - side / 2), top = Math.round(cy - side / 2);
  // sharp runs extract before extend inside one pipeline, so pad into a buffer first.
  const padded = await sharp(rgba, { raw: { width: w, height: h, channels: 4 } })
    .extend({ top: side, bottom: side, left: side, right: side, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png().toBuffer();
  const full = await sharp(padded)
    .extract({ left: left + side, top: top + side, width: side, height: side })
    .resize(MAX, MAX, { fit: 'inside', withoutEnlargement: true })
    .png().toBuffer();

  await sharp(full).webp({ quality: 86, alphaQuality: 100 }).toFile(pub(`objects/${slug}.webp`));
  await sharp(full).resize(SAMPLE, SAMPLE, { fit: 'inside' }).png().toFile(pub(`objects/${slug}-sample.png`));

  // Assert transparent corners, opaque centre, plausible coverage.
  const chk = await sharp(pub(`objects/${slug}.webp`)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const cw = chk.info.width, ch = chk.info.height, d = chk.data;
  const a = (x, y) => d[(y * cw + x) * 4 + 3];
  if (![a(0, 0), a(cw - 1, 0), a(0, ch - 1), a(cw - 1, ch - 1)].every((v) => v === 0)) throw new Error(`${slug}: corners not transparent`);
  let opaque = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i] > 128) opaque++;
  const cov = (100 * opaque) / (cw * ch);
  if (!(cov >= (MIN_COVER[slug] ?? 15) && cov <= 70)) throw new Error(`${slug}: coverage ${cov.toFixed(1)}% outside ${MIN_COVER[slug] ?? 15}-70`);
  const mid = (await sharp(pub(`objects/${slug}-sample.png`)).ensureAlpha().raw().toBuffer({ resolveWithObject: true }));
  if (mid.data.slice(0).filter((_, i) => i % 4 === 3 && _ > 128).length === 0) throw new Error(`${slug}: empty sample`);
  console.log(`${slug}: ${cw}x${ch} webp, sample ${mid.info.width}x${mid.info.height}, coverage ${cov.toFixed(1)}%`);
}

// Plate-coloured placeholders at each stage's aspect ratio (see src/styles/figure.css), only where a
// poster is missing: scripts/posters.mjs writes the real stills, and re-running art must not wipe them.
async function posters() {
  await mkdir(pub('posters'), { recursive: true });
  const sizes = {
    iceberg: [1200, 1200], 'iceberg-under': [1200, 1200], ws: [2000, 1040],
    ...Object.fromEntries([0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => [`ws-${i}`, [2000, 1040]])),
  };
  for (const [name, [width, height]] of Object.entries(sizes)) {
    if (existsSync(pub(`posters/${name}.webp`))) continue;
    await sharp({ create: { width, height, channels: 3, background: PLATE } })
      .webp({ quality: 80 }).toFile(pub(`posters/${name}.webp`));
  }
  if (!existsSync(pub('posters/contests.svg'))) {
    await writeFile(pub('posters/contests.svg'),
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 800" width="1280" height="800"><rect width="1280" height="800" fill="${PLATE}"/></svg>\n`);
  }
  console.log('posters: written');
}

// A placeholder only while there is no résumé: once Warren drops his own PDF in, re-running art keeps it.
async function resume() {
  if (existsSync(pub('resume.pdf'))) return console.log('resume.pdf: kept');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(`<!doctype html><meta charset="utf-8"><body style="font-family:Georgia,serif;color:#17191c;margin:0;padding:64px">
<h1 style="font-weight:600">Résumé</h1><p>[TODO: replace with Warren's résumé PDF]</p></body>`);
    await page.pdf({ path: pub('resume.pdf'), format: 'Letter' });
  } finally { await browser.close(); }
  console.log('resume.pdf: written');
}

await mkdir(pub('objects'), { recursive: true });
// --only=slug,slug cuts just those objects.
const only = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
for (const s of SLUGS.filter((x) => !only.length || only.includes(x))) await (existsSync(src(`${s}.png`)) || !PLACEHOLDER[s] ? cutout(s) : placeholder(s));
await posters();
await resume();
