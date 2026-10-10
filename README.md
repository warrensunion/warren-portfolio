# Warren Sun, portfolio

A one-page portfolio. It is one long sheet of paper with live three.js figures in framed plates: the
iceberg from BTTRURSLF, one ice block per project, and a stone ring whose particles spell WS. The page is
static HTML rendered from `src/content.js`, so it reads completely without JavaScript. The scenes are an
upgrade on top of that. Vite and vanilla ES modules, with no framework. The only runtime dependency is
`three@0.180.0`.

## Run it

```sh
npm install
npm run dev        # http://localhost:5173, reloads when content.js or render.js change
```

## Build it

```sh
npm run build      # writes dist/
npm run preview    # serves dist/ at http://localhost:4173, which is what visitors get
```

`dist/` is a plain static site. Any static host can serve it.

## Check it

| command | what it does |
|---|---|
| `npm test` | Node unit tests (`scripts/test-*.mjs`): the rendered page, the content rules (every TODO shows, zero em dashes), the figure host's budget logic, the berg's block invariants and the chart. |
| `npm run check` | Builds the page and drives it in Chromium (`scripts/check-figures.mjs`). It prints PASS or FAIL for each of these: every figure goes live and draws, off-screen figures stop, at most 3 WebGL contexts, fast scrolling races, `?static=1`, no WebGL2, context loss and recovery, reduced motion, email copy, and no sideways scroll at 390 px. Add `-- --no-build` to skip the build. |
| `npm run shoot` | Screenshots at 1440x900, 1920x1080 and 390x844 into `design/shots/` (`<w>x<h>-<name>.png`): the top, half way down the hero, each section, the full page and the poster views. Add `-- --only=390x844` for one size. |
| `npm run perf` | Average fps and p95 frame time for each WebGL figure, at both quality tiers and under a 4x CPU slowdown. Writes `design/perf.md`, including the GPU it ran on. |
| `npm run lighthouse` | Lighthouse desktop performance, 3 runs (`-- --runs=5` for more). Prints every score and the median, and saves the median report to `design/lighthouse.json`. |
| `npm run posters` | Reshoots every figure's poster still from the built page into `public/posters/`, then rebuilds. Add `-- --only=ws-1,iceberg` for some of them. |
| `npm run art` | Turns the marble renders in `design/art-src/` into the ice block textures and particle silhouettes in `public/objects/`. Where a poster or the résumé is missing, it writes a placeholder. It never overwrites a real one. |

All the browser scripts use Playwright's Chromium with the real GPU (ANGLE on Windows). Each one starts and
stops its own `vite preview`.

## Fill in the TODOs

Every unknown fact is a visible `[TODO: ...]` on the page, so nothing invented can reach a recruiter. They
all live in `src/content.js`, apart from the résumé. The built page currently shows these:

| where on the page | in `src/content.js` | what Warren needs to supply |
|---|---|---|
| Every figure caption, in bold | `stat: '[TODO: stat]'` (hero, each project, contests, ring) | one real number per figure |
| BC Window Coverings | `role`, `dates`, `body`, `tags` | your role, the dates, what you built, the tools, one result with a real number, the stack, and a link to the live site |
| BTTRURSLF | `role`, `dates`, the end of the second `body` paragraph | your role, the dates, and one number (users or launch date) |
| Archer Hero | `role`, `dates`, `body` | your role, the dates, what players do, the part you built, one number (visits or players), and a link to the game |
| Contests and awards | `contests` | each contest or award: `name`, `year` (a number), `result`, and `percentile` (0 to 100, how far up the field you finished) for the chart. Delete `placeholder: true` from a row once it is real. |
| Get in touch | `touch.line` | the co-op term you are looking for |
| Résumé link | `public/resume.pdf` | your résumé PDF. Replace the file; the placeholder only says to replace it. |

An entry with a real URL gets `href: 'https://...'`, and its title becomes a link. The chart draws itself
from `contests` once a row has a numeric year and percentile. Until then it shows its empty state.

## Add a project

1. Put the object's marble render in `design/art-src/<slug>.png` (a single object on a plain background),
   add the slug to `SLUGS` in `scripts/prepare-art.mjs`, and run `npm run art`. That writes
   `public/objects/<slug>.webp` and `<slug>-sample.png`.
2. In `src/content.js`, add an entry to a section's `entries` (or add a section). Its figure is
   `objectFig('<slug>', { title, shape, label, alt, caption })`. `shape` is the ice hull, one of `face`,
   `physique` or `knowledge`. `label` is the uppercase name drawn on the block.
3. Ring order: the contact section lists every entry's title in page order, and link `i` morphs the
   particles into object `i`. Keep `touch.fig.data.objects` (and `touch.fig.posterMorph`, the reduced-motion
   stills) in the same order as the entries on the page.
4. Posters: add the new stills to `SHOTS` in `scripts/posters.mjs` (`{ file: '<slug>', q: 'poster=iceblock&i=<n>' }`,
   where n is the block's index on the page, and a `ws-<i>` ring still), then run `npm run posters`.
5. Figure numbers ("Fig. N") are assigned in page order when the page renders, so nothing needs renumbering.
6. Run `npm test`, `npm run check` and `npm run shoot`, and look at the shots.

## How the figures behave

- Each figure first shows its poster, which is a still of the scene itself. The scene fades in over the
  poster after its first frame. A scene loads only when its figure is near the viewport, and it stops when
  off screen. It is destroyed more than 2.5 screens away. At most 3 WebGL scenes exist at once.
- A figure on screen builds at once. A figure that is only near waits until the page has loaded and gone
  idle, and the visitor has moved, tapped, scrolled the wheel or pressed a key. Even then, only one scene
  builds at a time. Each build is split into short tasks, so the page keeps answering while it builds.
- Fallbacks keep the poster and log one line to the console, `[fig:<name>] fallback: <reason>`. The reasons
  are `forced` (`?static=1`), `no-webgl2`, `save-data`, `reduced-motion`, `error` and `context-lost` (the
  scene retries after 5 s). Under a lasting fallback, an ice block's drag hint and tab stop go away.
- Reduced motion: no WebGL figures and no scrambled labels. The page never scrolls smoothly. The hero
  cross-fades to its under-water still at half the hero. Hovering or focusing a project link in Get in touch
  cross-fades the ring to that project's still. Opacity fades are the only motion.
- Quality: phones, touch screens and machines with 4 cores or fewer get the low tier (1x pixels, coarse
  reflections, no decoration). The iceberg steps itself down if its frames run slow. `?tier=low` or
  `?tier=high` forces a tier. `?fps=1` shows a frame-rate meter.

## Files

```
index.html                 shell; the content plugin fills <!--content--> at dev and build time
vite.config.js             the content plugin, and three.js as its own lazy chunk
src/content.js             every word, link, TODO and figure spec (edit this one)
src/render.js              content -> HTML strings (pure, also used by the tests)
src/main.js                boot: email copy, bar hairline, figure host
src/chrome/copyEmail.js    copy button, the e shortcut, and the manual-copy fallback
src/styles/                tokens.css (colours, type), base.css, layout.css, figure.css
src/figures/host.js        figure lifetime, the 3-context budget, fallbacks, posters, readouts, ?fps=1
src/figures/env.js         device and flag rules (tier, fallback reason, ?poster= hook)
src/figures/budget.js      the context budget (pure)
src/figures/warm.js        splits a scene's first draws into one task each
src/figures/iceberg/       Fig. 1, ported from BTTRURSLF-v2's intro iceberg
src/figures/iceblock/      the project figures, ported from the BTTRshop hub's ice blocks
src/figures/ring/          the Get in touch ring and particles, ported from the hub ring
src/figures/contests/      the contests dot plot (SVG)
public/posters/            figure stills (npm run posters)
public/objects/            object textures and silhouettes (npm run art)
public/fonts/              Source Serif 4 and IBM Plex Mono (OFL), self-hosted
public/resume.pdf          placeholder until the real one goes in
design/art-src/            marble renders the objects come from
design/shots/              screenshots (npm run shoot)
design/perf.md             frame rates (npm run perf)
design/lighthouse.json     median Lighthouse report (npm run lighthouse)
design/guidelines-review.md  Web Interface Guidelines review and contrast table
scripts/                   the check, shoot, perf, lighthouse, posters and art scripts, and the tests
docs/superpowers/          the design spec and the implementation plan
```
