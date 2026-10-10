// The BTTRURSLF stats panel shows only real numbers, counted from its repo and its Supabase project at
// build time. These pin the counting rules on a fake repo, the content-range parse, the soft mode that
// keeps the last numbers on machines without BTTRURSLF, and that no secret ever reaches shipped files.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { countRepo, parseEnv, countAccounts } from './bttr-stats.mjs';

const fixture = new URL('./fixtures/bttr-fake/', import.meta.url);
const fx = path.normalize(decodeURIComponent(fixture.pathname).replace(/^\/([A-Za-z]:)/, '$1'));

test('stats: countRepo counts routes (with .map expansions), api routes, test files, tests and screens', () => {
  assert.deepEqual(countRepo(fx), { routes: 5, apiRoutes: 5, testFiles: 1, tests: 2, screens: 2 });
});

test('stats: parseEnv reads KEY=value and ignores comments and quotes', () => {
  const e = parseEnv(readFileSync(path.join(fx, '.env'), 'utf8'));
  assert.equal(e.VITE_SUPABASE_URL, 'https://fake.supabase.co');
  assert.equal(e.SUPABASE_SERVICE_ROLE_KEY, 'not-a-real-key');
  assert.equal(e.GEMINI_API_KEY, '');
  assert.ok(!('# fixture env, fake values only' in e));
});

test('stats: countAccounts parses content-range, and gives null on failure', async () => {
  const seen = [];
  const ok = async (url, init) => {
    seen.push({ url, init });
    return { ok: true, status: 200, headers: new Map([['content-range', '0-0/42']]) };
  };
  assert.equal(await countAccounts({ url: 'https://x.supabase.co', key: 'k', fetch: ok }), 42);
  assert.equal(seen[0].url, 'https://x.supabase.co/rest/v1/profiles?select=id');
  assert.equal(seen[0].init.method, 'HEAD');
  assert.equal(seen[0].init.headers.Prefer, 'count=exact');
  const no = async () => ({ ok: false, status: 401, headers: new Map() });
  assert.equal(await countAccounts({ url: 'https://x.supabase.co', key: 'k', fetch: no }), null);
  const boom = async () => { throw new Error('offline'); };
  assert.equal(await countAccounts({ url: 'https://x.supabase.co', key: 'k', fetch: boom }), null);
});

test('stats: missing repo keeps old JSON in soft mode and exits 0', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'bttr-stats-'));
  const out = path.join(dir, 'stats.json');
  writeFileSync(out, '{"accounts":7}\n');
  const r = spawnSync(process.execPath, ['scripts/bttr-stats.mjs', '--soft', '--repo=' + path.join(dir, 'nope'), '--out=' + out], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(readFileSync(out, 'utf8'), '{"accounts":7}\n');
});

function* files(dir) {
  if (!existsSync(dir)) return;
  for (const f of readdirSync(dir)) {
    const p = path.join(dir, f);
    if (statSync(p).isDirectory()) yield* files(p);
    else if (/\.(js|mjs|json|html|css|txt|svg|md)$/.test(f)) yield p;
  }
}

test('stats: no JWT-shaped secret in src, public or dist', () => {
  const bad = [];
  for (const d of ['src', 'public', 'dist']) {
    for (const f of files(d)) if (/eyJ[A-Za-z0-9_-]{10,}/.test(readFileSync(f, 'utf8'))) bad.push(f);
  }
  assert.deepEqual(bad, []);
});

test('stats: a count whose anchor is missing is null, never 0', async () => {
  const { mkdtempSync, mkdirSync, writeFileSync } = await import('node:fs');
  const dir = mkdtempSync(path.join(tmpdir(), 'bttr-repo-'));
  for (const d of ['src/screens/a', 'server', 'scripts']) mkdirSync(path.join(dir, d), { recursive: true });
  writeFileSync(path.join(dir, 'src/main.js'), 'const nothing = {};\n');
  writeFileSync(path.join(dir, 'server/guard.js'), 'export const RENAMED = {};\n');
  writeFileSync(path.join(dir, 'scripts/test-a.mjs'), "test('x', () => {});\n");
  const r = countRepo(dir);
  assert.equal(r.routes, null);
  assert.equal(r.apiRoutes, null);
  assert.equal(r.tests, 1);
});

test('stats panel: any missing number shows as a visible TODO, never a 0', async () => {
  const { statRows } = await import('../src/figures/bttr/stats.js');
  const rows = statRows({ accounts: null, routes: null, apiRoutes: 31, tests: null, testFiles: 15, methods: { accounts: 'a', routes: 'r', apiRoutes: 'p', tests: 't' } });
  assert.match(rows[0].n, /\[TODO/);
  assert.match(rows[1].n, /\[TODO/);
  assert.equal(rows[2].n, '31');
  assert.match(rows[3].n, /\[TODO/);
  assert.ok(rows.every((r) => r.n !== '0'));
});
