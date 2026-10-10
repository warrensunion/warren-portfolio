# Port notes: HowPolluted (source: C:\Users\Warren\projects\HowPolluted, READ-ONLY)

Pinned commit: `80f6d06c5cfe83c09b8ce2711e475b66ee75da91`. The source's dev server and npm scripts are
never run. Assets come over only through `npm run sync:howpolluted` (`scripts/sync-howpolluted.mjs`), which
checks the commit, copies a fixed list and writes `public/howpolluted/SOURCE.txt`. To update: move the
source to a new commit, run the sync with `--allow-newer`, then diff each ported module below against its
source path and carry the changes over by hand.

## Ported code (`src/figures/howpolluted/`)

| file | source path | what changed |
|---|---|---|
| `litter-sim.js` | `src/screens/scene/litter-sim.js` | nothing but the header |
| `grades.js` | `src/core/grades.js` | nothing but the header |

## Copied assets (`public/howpolluted/`, same sub-path as the source's `public/`)

| file | source path |
|---|---|
| `art/manifest.json` | `public/art/manifest.json` |
| `art/plates/land-1280.webp`, `art/plates/water-1280.webp` | `public/art/plates/` |
| `art/layers/fg-land.webp`, `art/layers/fg-water.webp` | `public/art/layers/` |
| `art/fx/oil.webp`, `art/fx/chemical.webp` | `public/art/fx/` |
| `art/trash/a-01..a-12.webp`, `art/trash/b-01..b-12.webp` (24) | `public/art/trash/` |
| `globe/earth-2k.webp`, `globe/land-mask.png` | `public/globe/` |
| `fonts/archivo-expanded-latin.woff2`, `fonts/montserrat-latin.woff2` | `public/fonts/` |
| `fonts/OFL-Archivo.txt`, `fonts/OFL-Montserrat.txt` (the OFL licence texts) | `public/fonts/` |

Size: 2,738,130 bytes (2.6 MiB; `du -sh` says 2.8M with block rounding), under the 3 MB budget. All of it
is fetched only by the figure, after it is near the viewport. The art is Warren's own; the fonts are OFL.

## Land mask lookup (`src/figures/howpolluted/mask.js`, new)

`groundAt(mask, lat, lon)` reads one pixel of `globe/land-mask.png` (1024x512, about 0.35° per pixel) and
says land when red > 127. At the demo point, Richmond BC (49.17, -123.14), it reads pixel (161, 116), which
is **water**: at this resolution the mask's coastline puts the point in the Strait of Georgia (the land
pixels are one or two to the east and south). Checked on 2026-10-10 with sharp:

```
node --input-type=module -e "import sharp from 'sharp'; import { groundAt } from './src/figures/howpolluted/mask.js'; const { data, info } = await sharp('public/howpolluted/globe/land-mask.png').ensureAlpha().raw().toBuffer({ resolveWithObject: true }); console.log(groundAt({ width: info.width, height: info.height, data }, 49.17, -123.14))"
-> water
```

So the demo's honest ground is water, and the figure shows the water scene (6% demo slick, "Moderate")
and says `ground: water, from the land mask`. The figure takes whatever the mask says at run time; it never
hard-codes the ground.
