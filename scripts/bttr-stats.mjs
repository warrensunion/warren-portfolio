// BTTRURSLF's stats panel (spec 5.2) shows only real numbers, measured here at build time and baked into
// src/data/bttr-stats.json with their date and method. BTTRURSLF is private and read only: this script
// reads its files as text and counts them (it never imports or runs them), and reads the account count
// from its Supabase project with the service-role key from its .env. The key lives in one local variable,
// is sent only to that project's own REST endpoint, and is never printed or written. No number is ever
// made up: one that cannot be measured is null, and the page shows a [TODO] instead.
//
// Usage: npm run stats [-- --repo=<path>] [-- --out=<path>]
//        --soft (prebuild): any failure keeps the existing file and exits 0, so a build on a machine
//        without BTTRURSLF still works with the last measured numbers.
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO = 'C:\\Users\\Warren\\Downloads\\BTTRURSLF-v2';
const DEFAULT_OUT = path.join(here, '../src/data/bttr-stats.json');

export const METHODS = {
  accounts: 'Rows in the profiles table of its Supabase project, one per account.',
  routes: 'Entries in the client router table in src/main.js, counting each generated shop route.',
  apiRoutes: 'Entries in the ROUTES table in server/guard.js, counting each area route it generates.',
  tests: 'test( calls across its scripts/test-*.mjs files, run with node --test.',
  screens: 'Folders in src/screens.',
};

const quoted = (s) => (s.match(/'[^']+'/g) || []).length;

// A `[ 'a', 'b' ].map((id) => [`/x/${id}`, ...])` adds one route per id; a `.flatMap((a) => [ [`/..`], ... ])`
// adds one per id per route template inside it.
function expansions(text) {
  let n = 0;
  const re = /\[((?:\s*'[^'\n]+'\s*,?)+)\]\s*\.(map|flatMap)\(\(\w+\)\s*=>\s*\[/g;
  for (let m; (m = re.exec(text)); ) {
    const ids = quoted(m[1]);
    if (m[2] === 'map') n += ids;
    else {
      const end = text.indexOf(']))', re.lastIndex);
      const block = text.slice(re.lastIndex, end === -1 ? undefined : end);
      n += ids * (block.match(/\[`\//g) || []).length;
    }
  }
  return n;
}

const literalKeys = (text, prefix) => (text.match(new RegExp(`^\\s*'${prefix}[^'\\n]*'\\s*:`, 'gm')) || []).length;

export function countRepo(repo) {
  const main = readFileSync(path.join(repo, 'src/main.js'), 'utf8');
  const guard = readFileSync(path.join(repo, 'server/guard.js'), 'utf8');
  const routesBlock = guard.slice(guard.indexOf('export const ROUTES'));
  const scriptsDir = path.join(repo, 'scripts');
  const testFiles = readdirSync(scriptsDir).filter((f) => /^test-.*\.mjs$/.test(f));
  const tests = testFiles.reduce((n, f) => n + (readFileSync(path.join(scriptsDir, f), 'utf8').match(/\btest\(/g) || []).length, 0);
  const screensDir = path.join(repo, 'src/screens');
  const screens = readdirSync(screensDir).filter((f) => statSync(path.join(screensDir, f)).isDirectory()).length;
  return {
    routes: literalKeys(main, '/') + expansions(main),
    apiRoutes: literalKeys(routesBlock.slice(0, routesBlock.indexOf('\n};')), '/api/') + expansions(routesBlock.slice(0, routesBlock.indexOf('\n};'))),
    testFiles: testFiles.length,
    tests,
    screens,
  };
}

export function parseEnv(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return out;
}

export async function countAccounts({ url, key, fetch = globalThis.fetch }) {
  try {
    const res = await fetch(url.replace(/\/$/, '') + '/rest/v1/profiles?select=id', {
      method: 'HEAD',
      headers: { apikey: key, Authorization: 'Bearer ' + key, Prefer: 'count=exact', Range: '0-0' },
    });
    if (!res.ok) return null;
    const m = String(res.headers.get('content-range') || '').match(/\/(\d+)$/);
    return m ? Number(m[1]) : null;
  } catch {
    return null;
  }
}

const today = () => new Date().toISOString().slice(0, 10);

async function main() {
  const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? true]));
  const repo = args.repo || DEFAULT_REPO;
  const out = args.out || DEFAULT_OUT;
  const soft = !!args.soft;
  if (!existsSync(path.join(repo, 'src/main.js'))) {
    const msg = `stats: BTTRURSLF not found at ${repo}`;
    if (soft) return console.log(msg + ', keeping ' + path.relative(process.cwd(), out));
    throw new Error(msg);
  }
  const counts = countRepo(repo);
  let accounts = null;
  let why = 'no .env';
  const envFile = path.join(repo, '.env');
  if (existsSync(envFile)) {
    const env = parseEnv(readFileSync(envFile, 'utf8'));
    const key = env.SUPABASE_SERVICE_ROLE_KEY;
    if (env.VITE_SUPABASE_URL && key) {
      accounts = await countAccounts({ url: env.VITE_SUPABASE_URL, key });
      why = accounts == null ? 'the request failed' : '';
    } else why = 'no Supabase URL or service-role key in .env';
  }
  // A failed account count never erases one measured earlier: keep the older number with its own date.
  let prev = {};
  try {
    prev = JSON.parse(readFileSync(out, 'utf8'));
  } catch {}
  const data = {
    accounts: accounts ?? prev.accounts ?? null,
    accountsAsOf: accounts != null ? today() : prev.accountsAsOf ?? null,
    ...counts,
    measuredAt: today(),
    methods: METHODS,
  };
  writeFileSync(out, JSON.stringify(data, null, 2) + '\n');
  console.log(
    `stats: ${counts.routes} routes, ${counts.apiRoutes} API routes, ${counts.tests} tests in ${counts.testFiles} files, ${counts.screens} screen folders; ` +
      (accounts != null ? `accounts: ${accounts}` : `accounts: unavailable (${why})${data.accounts != null ? `, keeping ${data.accounts} from ${data.accountsAsOf}` : ''}`),
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    if (process.argv.includes('--soft')) {
      console.log('stats: ' + err.message + ' (soft: keeping the last numbers)');
      process.exit(0);
    }
    console.error('stats: ' + err.message);
    process.exit(1);
  });
}
