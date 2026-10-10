// Shared by posters.mjs and check-figures.mjs: both must look at the built page exactly as visitors get
// it (vite preview over dist/), never the dev server, and must not leave a server running when they end.
// The GPU flags give headless Chromium the real GPU through ANGLE/D3D11 on Windows; without one it falls
// back to SwiftShader, which works but is several times slower.
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const vite = path.join(root, 'node_modules/vite/bin/vite.js');

export const GPU_ARGS = ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'];

export function build() {
  const r = spawnSync(process.execPath, [vite, 'build', '--logLevel', 'warn'], { cwd: root, stdio: 'inherit' });
  if (r.status !== 0) throw new Error('vite build failed');
}

/** Starts `vite preview` on `port` and resolves { url, stop() } once it answers. */
export async function startPreview(port) {
  const child = spawn(process.execPath, [vite, 'preview', '--port', String(port), '--strictPort'], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = '';
  child.stdout.on('data', (d) => (out += d));
  child.stderr.on('data', (d) => (out += d));
  const url = `http://localhost:${port}/`;
  const stop = () => {
    if (child.exitCode == null) child.kill();
  };
  process.once('exit', stop);
  for (let i = 0; i < 100; i++) {
    if (child.exitCode != null) throw new Error('vite preview exited:\n' + out);
    try {
      const res = await fetch(url);
      if (res.ok) return { url, stop };
    } catch {}
    await new Promise((r) => setTimeout(r, 150));
  }
  stop();
  throw new Error('vite preview did not start:\n' + out);
}
