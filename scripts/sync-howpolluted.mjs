// Copies the art, globe maps and fonts the HowPolluted track figure uses out of Warren's HowPolluted
// project into public/howpolluted/, keeping their sub-paths. It is the only code that reads the source
// tree, and it only reads: no dev server, no npm scripts, no writes there. The source is pinned to one
// commit so the copy can be repeated exactly; a newer HEAD is refused unless --allow-newer is given.
// Usage: npm run sync:howpolluted [-- --src=<path>] [-- --allow-newer]
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const COMMIT = '80f6d06c5cfe83c09b8ce2711e475b66ee75da91';
const DEFAULT_SRC = 'C:\\Users\\Warren\\projects\\HowPolluted';
const trash = ['a', 'b'].flatMap((k) => Array.from({ length: 12 }, (_, i) => `art/trash/${k}-${String(i + 1).padStart(2, '0')}.webp`));

// Destination paths under public/howpolluted/. Each comes from public/<same path> in the source.
export const FILES = [
  'art/manifest.json',
  'art/plates/land-1280.webp',
  'art/plates/water-1280.webp',
  'art/layers/fg-land.webp',
  'art/layers/fg-water.webp',
  'art/fx/oil.webp',
  'art/fx/chemical.webp',
  ...trash,
  'globe/earth-2k.webp',
  'globe/land-mask.png',
  'fonts/archivo-expanded-latin.woff2',
  'fonts/montserrat-latin.woff2',
  'fonts/OFL-Archivo.txt',
  'fonts/OFL-Montserrat.txt',
];

function main(argv) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const src = (argv.find((a) => a.startsWith('--src=')) || '').slice(6) || DEFAULT_SRC;
  const head = execFileSync('git', ['-C', src, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  if (head !== COMMIT) {
    console.log(`source HEAD ${head}\npinned      ${COMMIT}`);
    if (!argv.includes('--allow-newer')) {
      console.error('The source is not at the pinned commit. Re-run with --allow-newer to copy it anyway.');
      process.exit(1);
    }
  }
  const out = path.join(root, 'public/howpolluted');
  for (const f of FILES) {
    const to = path.join(out, f);
    mkdirSync(path.dirname(to), { recursive: true });
    copyFileSync(path.join(src, 'public', f), to);
  }
  writeFileSync(
    path.join(out, 'SOURCE.txt'),
    `Copied by scripts/sync-howpolluted.mjs from Warren's HowPolluted project (public/) at commit ${head}.\n` +
      'The art is Warren\'s own. The fonts are under the SIL Open Font License; see fonts/OFL-*.txt.\n',
  );
  console.log(`copied ${FILES.length} files from ${src} at ${head.slice(0, 7)} into public/howpolluted/`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main(process.argv.slice(2));
