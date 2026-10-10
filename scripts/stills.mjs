// Every track stage has a still (spec 3.5): the first paint, the reduced-motion and ?static=1 view, and
// the no-JS document. Until a figure's own stills exist (shot by scripts/posters.mjs from a live demo, or
// taken from a capture), this writes a plain placeholder plate that says which stage it stands for and that
// it is a TODO, so a missing still is visible rather than blank. It never overwrites an existing file.
// Usage: npm run stills
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { root } from './lib/preview.mjs';
import { content } from '../src/content.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

async function writeStills() {
  await mkdir(path.join(root, 'public/stills'), { recursive: true });
  let wrote = 0;
  for (const sec of content.sections) {
    for (const e of sec.entries || []) {
      if (!e.fig || !e.fig.stages) continue;
      const [w, h] = e.fig.size;
      for (const [i, st] of e.fig.stages.entries()) {
        const file = path.join(root, 'public', st.still);
        if (existsSync(file)) continue;
        const fs = Math.round(w / 40);
        const svg =
          `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">` +
          `<rect width="${w}" height="${h}" fill="#eef0f1"/>` +
          `<g font-family="IBM Plex Mono, Consolas, monospace" fill="rgba(23,25,28,0.62)" text-anchor="middle">` +
          `<text x="${w / 2}" y="${h / 2 - fs * 0.6}" font-size="${fs}">${esc(e.title)}, stage ${i + 1}: ${esc(st.label)}</text>` +
          `<text x="${w / 2}" y="${h / 2 + fs * 1.2}" font-size="${Math.round(fs * 0.8)}">[TODO: still]</text></g></svg>`;
        await sharp(Buffer.from(svg)).webp({ quality: 70 }).toFile(file);
        wrote++;
      }
    }
  }
  console.log(`stills: ${wrote} placeholder${wrote === 1 ? '' : 's'} written`);
}
await writeStills();
