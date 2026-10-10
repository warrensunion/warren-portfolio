// Shared by the capture scripts (bttr.mjs, bcwc.mjs). They drive another project's own server from the
// outside with Playwright, record short clips, and encode them for scrubbing: VP9 WebM and H.264 MP4 at
// 960x600, 24 fps, a keyframe every 4 frames so a seek lands fast, plus a 1600x1000 WebP still of the last
// frame. Only pixels leave the captured project; no file of it is copied here. ffmpeg is the system binary
// (no npm dependency); without it the capture stops with a clear message, and the site's build never needs it.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const here = path.dirname(fileURLToPath(import.meta.url));
export const root = path.resolve(here, '../..');
const CURSOR = readFileSync(path.join(here, 'cursor.js'), 'utf8');

export const CLIP = { w: 960, h: 600, fps: 24 };
export const STILL = { w: 1600, h: 1000 };
export const VIEW = { width: 1440, height: 900 };

export function ffmpeg(args) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { encoding: 'utf8' });
  if (r.error && r.error.code === 'ENOENT') throw new Error('ffmpeg is not on PATH; install it (winget install Gyan.FFmpeg) to capture');
  if (r.status !== 0) throw new Error('ffmpeg failed: ' + (r.stderr || '').trim().split('\n').slice(-3).join(' | '));
}

export function probe(file) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,r_frame_rate,nb_frames:format=duration', '-of', 'json', file], { encoding: 'utf8' });
  return JSON.parse(r.stdout || '{}');
}

/** Starts a dev or preview server with `cmd args` in `cwd` and resolves { url, stop } once it answers 200. */
export async function startServer({ cwd, cmd = process.execPath, args, port, env = {}, path: probePath = '/' }) {
  const child = spawn(cmd, args, { cwd, env: { ...process.env, ...env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'], shell: false });
  let out = '';
  child.stdout.on('data', (d) => (out += d));
  child.stderr.on('data', (d) => (out += d));
  const url = `http://localhost:${port}`;
  const stop = () => {
    if (child.exitCode == null) {
      if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f']);
      else child.kill();
    }
  };
  process.once('exit', stop);
  for (let i = 0; i < 300; i++) {
    if (child.exitCode != null) throw new Error('server exited:\n' + out.slice(-2000));
    try {
      const res = await fetch(url + probePath);
      if (res.ok) return { url, stop };
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  stop();
  throw new Error('server did not start:\n' + out.slice(-2000));
}

/**
 * A fresh context that records video (when `video` is a directory), has our cursor overlay, seeded
 * localStorage, and aborts every request matching `block` (logged into `blocked`).
 */
export async function newContext(browser, { video, seed = {}, block = [], viewport = VIEW, init = [] } = {}) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    ...(video ? { recordVideo: { dir: video, size: viewport } } : {}),
  });
  await context.addInitScript(CURSOR);
  if (Object.keys(seed).length) {
    await context.addInitScript((s) => {
      try {
        for (const [k, v] of Object.entries(s)) if (localStorage.getItem(k) == null) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
      } catch {}
    }, seed);
  }
  for (const s of init) await context.addInitScript(s);
  const blocked = [];
  for (const pattern of block) {
    await context.route(pattern, (route) => {
      blocked.push(route.request().url());
      route.abort();
    });
  }
  return { context, blocked };
}

/** Eased mouse glide from `from` to `to` over `ms`, in 16 ms steps (the cursor overlay follows it). */
export async function glide(page, from, to, ms = 900) {
  const steps = Math.max(2, Math.round(ms / 16));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const e = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
    await page.mouse.move(from.x + (to.x - from.x) * e, from.y + (to.y - from.y) * e);
    await page.waitForTimeout(16);
  }
}

export const centre = async (locator) => {
  const b = await locator.boundingBox();
  if (!b) throw new Error('no box for locator');
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};

/** Seconds since the context's video started; call right after newContext()'s first page is created. */
export function clock() {
  const t0 = Date.now();
  return () => (Date.now() - t0) / 1000;
}

/**
 * Encodes the [start, end] seconds of a recorded webm into `<outBase>.webm` and `.mp4` (CLIP size, fps,
 * keyframe every 4 frames) and the last frame into `stillFile` (STILL size webp). `speed` > 1 time-
 * compresses (setpts) so a long animation fits; `maxSec` caps the output length.
 */
export async function encode(src, outBase, { start = 0, end, speed = 1, maxSec = 4, stillFile, crf = [42, 32] } = {}) {
  mkdirSync(path.dirname(outBase), { recursive: true });
  const dur = end != null ? Math.max(0.1, end - start) : undefined;
  const vf = [`setpts=PTS/${speed}`, `fps=${CLIP.fps}`, `scale=${CLIP.w}:${CLIP.h}:flags=lanczos`].join(',');
  const cut = ['-ss', String(start), ...(dur ? ['-t', String(dur)] : []), '-i', src, '-an', '-vf', vf, '-t', String(maxSec)];
  ffmpeg([...cut, '-c:v', 'libvpx-vp9', '-crf', String(crf[0]), '-b:v', '0', '-g', '6', '-keyint_min', '6', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '2', outBase + '.webm']);
  ffmpeg([...cut, '-c:v', 'libx264', '-crf', String(crf[1]), '-preset', 'slow', '-g', '6', '-keyint_min', '6', '-sc_threshold', '0', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', outBase + '.mp4']);
  if (stillFile) {
    // The still is the clip's own last frame, taken from the source at full resolution.
    const png = outBase + '.last.png';
    ffmpeg(['-sseof', '-0.2', '-i', outBase + '.mp4', '-frames:v', '1', '-update', '1', png]);
    const tmp = outBase + '.src-last.png';
    const lastAt = (dur != null ? start + Math.min(dur, maxSec * speed) : start) - 0.05;
    try {
      ffmpeg(['-ss', String(Math.max(0, lastAt)), '-i', src, '-frames:v', '1', '-update', '1', tmp]);
    } catch {}
    const from = existsSync(tmp) ? tmp : png;
    mkdirSync(path.dirname(stillFile), { recursive: true });
    await sharp(from).resize(STILL.w, STILL.h, { fit: 'cover' }).webp({ quality: 78 }).toFile(stillFile);
    rmSync(png, { force: true });
    rmSync(tmp, { force: true });
  }
  const p = probe(outBase + '.mp4');
  return { duration: Number(p.format?.duration || 0), bytes: statSync(outBase + '.webm').size + statSync(outBase + '.mp4').size };
}

/** Closes a recording context and moves its single video file to `dest`. */
export async function finishVideo(context, page, dest) {
  const v = page.video();
  await context.close();
  const file = await v.path();
  mkdirSync(path.dirname(dest), { recursive: true });
  renameSync(file, dest);
  return dest;
}

export function gitHead(repo) {
  const r = spawnSync('git', ['-C', repo, 'rev-parse', 'HEAD'], { encoding: 'utf8' });
  return (r.stdout || '').trim() || 'unknown';
}
