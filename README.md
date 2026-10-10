# Warren Sun, portfolio

A one-page portfolio. The page is static HTML rendered from `src/content.js`, so it reads completely
without JavaScript. Live figures in framed plates are an upgrade on top of that:
- the iceberg from BTTRURSLF;
- one **track** per project;
- a stone ring whose particles spell WS.

It is built with Vite and vanilla ES modules, with no framework. The only runtime dependency is
`three@0.180.0`.

A track is a tall stretch of page. Its text column sticks beside a figure that walks through stages as you
scroll, then lets you play with it:
- **BC Window Coverings:** the site itself in a browser frame.
- **BTTRURSLF:** recorded screens under tabs, plus real stats.
- **Terrarium:** a live jar of evolving creatures.
- **HowPolluted:** a globe, a litter pile and a grade, as a demo.
- **Archer Hero:** a short playable stage.

## Run it

```sh
npm install
npm run dev        # http://localhost:5173, reloads when content.js or render.js change
```

## Build it

```sh
npm run build      # writes dist/ (prebuild refreshes BTTRURSLF's stats when that repo is on this machine)
npm run preview    # serves dist/ at http://localhost:4173, which is what visitors get
```

`dist/` is a plain static site. Any static host can serve it.

## Check it

| command | what it does |
|---|---|
| `npm test` | Node unit tests (`scripts/test-*.mjs`). They cover: the rendered page and its tracks, tabs and stills; the content rules (every TODO shows, zero em dashes); the weighted context budget; the track progress maths; BTTRURSLF's stats script (including a no-secrets scan); HowPolluted's pile, grades, mask and demo model; Terrarium's seeded sim, worker and history; the Archer sim, attract mode and input. |
| `npm run check` | Builds the page and drives it in Chromium (`scripts/check-figures.mjs`), printing PASS or FAIL for each promise. Every figure goes live and draws, and stops off screen. At most 3 WebGL contexts (by weight; the bcwc iframe counts 2), including while scrolling fast. Sticky text pins at 96 px and releases with its track at 1440x900, 1920x1080, 1366x768, 1280x640 and 390x844. No sideways scroll. `?static=1`, no WebGL2, context loss and reduced motion all hold. The bcwc frame and the game never trap scrolling or keys. The HowPolluted demo cleans up and regrades. No BTTRURSLF selectors or secrets reach `dist/`. Add `-- --no-build` to skip the build, and `-- --only=tracks,archer` for some checks. |
| `npm run shoot` | Screenshots at 1440x900, 1920x1080 and 390x844 into `design/shots/`: each section, and each track at its first and last stage. Add `-- --only=390x844` for one size. |
| `npm run compare` | yuzeli.ca and this page side by side at the same sizes and positions, into `design/compare/`. These are for judging the borrowed techniques by eye; nothing from yuzeli.ca ships. |
| `npm run perf` | Average fps and p95 frame time for each WebGL figure, at both quality tiers and under a 4x CPU slowdown. Writes `design/perf.md`. |
| `npm run lighthouse` | Lighthouse desktop performance, 3 runs. Saves the median report to `design/lighthouse.json`. |
| `npm run posters` | Reshoots the hero and ring posters, and the stage stills of the live tracks, from the built page. Add `-- --only=ws-1,stills/archer-hero-s0` for some of them. |
| `npm run stills` | Writes a plain `[TODO: still]` placeholder for any stage still that is missing. It never overwrites. |
| `npm run art` | Turns the marble renders in `design/art-src/` into the ring's object textures and silhouettes. A missing render gets a plain placeholder silhouette. |
| `npm run stats` | Measures BTTRURSLF's numbers into `src/data/bttr-stats.json`: the account count from its Supabase project, plus routes and tests counted from its repo. |
| `npm run capture:bttr`, `npm run capture:bcwc` | Re-record the BTTRURSLF and BC Window Coverings clips by driving each site's own server with Playwright. Needs ffmpeg on PATH. See `docs/port-notes/captures.md`. |
| `npm run sync:howpolluted` | Re-copies HowPolluted's art and fonts at the commit its port is pinned to. See `docs/port-notes/howpolluted.md`. |

The browser scripts use Playwright's Chromium with the real GPU (ANGLE on Windows). Each starts and stops
its own `vite preview`. Set `PREVIEW_PORT` to run two at once.

## Fill in the TODOs

Every unknown fact is a visible `[TODO: ...]` on the page, so nothing invented can reach a recruiter. They
live in `src/content.js` unless the table says otherwise.

| where on the page | what Warren needs to supply |
|---|---|
| Every figure caption, in bold (`stat`) | one real number per figure |
| Every project | `role` and `dates` |
| BC Window Coverings | one result with a real number, and a link to the live site |
| BC Window Coverings, last stage | **deploy bcwc** (it is not deployed: `bcwc.vercel.app` is a 404 and bcwindowcoverings.com is still the old Wix site), then set `fig.data.liveUrl` to its origin. bcwc sends no X-Frame-Options or CSP, so it frames as is. If a CSP is added later, it needs `frame-ancestors` to allow this site. |
| Terrarium, HowPolluted | one number each (for example a launch date) |
| Archer Hero | release status, player count, and the part you built |
| Get in touch | `touch.line`: the co-op term you are looking for |
| Ring objects | marble renders `design/art-src/terrarium-jar.png` and `howpolluted-globe.png`, then `npm run art` and `npm run posters -- --only=ws-3,ws-4`. Until then they are plain placeholder silhouettes. |
| Contests and awards | each row's `name`, `year`, `result` and `percentile` |
| Résumé link | `public/resume.pdf` |

## Add a project

1. In `src/content.js`, add an entry with an `id` to a section's `entries`, and give it a figure with
   `trackFig('<slug>', '<kind>', { title, caption, alt, size, data, stages: [[label], ...] })`.
2. Run `npm run stills` to get placeholder stage stills.
3. A live figure is `src/figures/<kind>/figure.js`, exporting `create(stage, ctx)`. It returns
   `{ start, stop, resize, destroy, readout? }`.
   - It reads `ctx.progress()` (0 to 1 over the track) and `ctx.stage()` each frame.
   - It calls `ctx.frame(dt)` once per frame.
   - It dispatches `fig:ready` on the stage after its first frame.
4. Add the figure to `src/main.js`'s loaders and give its kind a weight in `src/figures/env.js`
   (`WEIGHTS`: the WebGL contexts it holds).
5. Shoot its stage stills: add `stills/<slug>-s<i>` entries to `TRACK_STILLS` in `scripts/posters.mjs`.
6. Ring order: the contact section lists every entry in page order, and link `i` morphs the particles into
   object `i`. Keep `touch.fig.data.objects` and `touch.fig.posterMorph` in the same order. Add the
   object's art (step "Ring objects" above) and a `ws-<i>` poster.
7. Run `npm test`, `npm run check` and `npm run shoot`, and look at the shots.

## How the figures behave

- **Tracks.** On desktop (860 px and up):
  - The text column is `position: sticky` at 96 px, or higher when the text is taller than the screen
    allows.
  - The figure is sticky at 96 px inside a rail. The rail adds 85svh of scroll per stage, measured on
    yuzeli.ca.
  - When the rail ends, text and figure leave together.
  - `src/figures/tracks.js` turns rail positions into progress with one rAF loop while a track is on screen.
    There are no scroll listeners and no scroll-jacking.
  - On phones the text sits above the figure, nothing sticks, and progress follows the figure through the
    viewport.
  - Stage buttons (and BTTRURSLF's tabs) scroll natively to their stage.
- **Stills.** Each stage has a still. It shows at first paint, under reduced motion and `?static=1` (a
  400 ms opacity cross-fade per stage), and without JavaScript (all stills in a column).
- **Lifetime.**
  - A figure loads only when near the viewport, runs only while on screen, and is destroyed more than 2.5
    screens away.
  - The LED in a plate's head pulses while the figure runs in the middle half of the viewport.
  - The host keeps the WebGL contexts at most 3 by weight. The bcwc iframe claims 2 when it attaches and
    waits if only in-flight builds could make room.
- **Fallbacks** keep the stills and log one line, `[fig:<name>] fallback: <reason>`. The reasons are
  `forced`, `no-webgl2`, `save-data`, `reduced-motion`, `error` and `context-lost`.
- **Input safety.**
  - No figure ever cancels the wheel.
  - Games and jars read keys only while focused, and Esc lets go.
  - The bcwc frame sits under a "Click to use the site" cover until clicked. Leaving the plate, Esc, Done or
    scrolling away hands the pointer back.
- **Honesty.**
  - HowPolluted's numbers are fixed demo values, labelled "Demo, not a measurement" wherever a number or
    grade shows. Land or water comes from its real land mask, and it makes no `/api` calls.
  - BTTRURSLF's stats are measured at build time with their date and method, or a visible TODO.
- **Quality.** Phones, touch screens and machines with 4 cores or fewer get the low tier. `?tier=low` or
  `?tier=high` forces a tier, and `?fps=1` shows a frame-rate meter.

## Where the figures come from

| figure | source | how |
|---|---|---|
| Iceberg, ring | BTTRURSLF-v2 (Warren's, private) | Ported scene code from the earlier build (`docs/port-notes/`). |
| BTTRURSLF | BTTRURSLF-v2 (private) | Recorded clips only. No BTTRURSLF code is in this repository. The puzzle cards are new code over captured pixels. |
| BC Window Coverings | `Projects/bcwc` (Warren's) | Recorded clips, then the deployed site in an iframe. |
| Terrarium | `Downloads/terrarium` at 7612a40 | Ported sim, worker, jar, river and brain (`docs/port-notes/terrarium.md`). |
| HowPolluted | `projects/HowPolluted` at 80f6d06 | Ported globe, pile sim, grades, art and fonts (`docs/port-notes/howpolluted.md`). |
| Archer Hero | the Roblox game | New three.js code with original low-poly models, after `design/reference/archer/`. |

## Files

```
index.html                 shell; the content plugin fills <!--content--> at dev and build time
vite.config.js             the content plugin, and three.js as its own lazy chunk
src/content.js             every word, link, TODO, track and figure spec (edit this one)
src/render.js              content -> HTML strings (pure, also used by the tests)
src/main.js                boot: email copy, bar hairline, tracks, figure host
src/data/bttr-stats.json   BTTRURSLF's measured numbers (npm run stats)
src/figures/host.js        figure lifetime, the weighted context budget, fallbacks, posters, readouts
src/figures/tracks.js      track progress, stages, tabs and the sticky text top
src/figures/track-math.js  the pure progress, stage and clip maths
src/figures/stills.js      stage stills follow the stage
src/figures/player.js      scrubs recorded clips by scroll (bttr, bcwc)
src/figures/env.js         device and flag rules, kind weights
src/figures/<kind>/        iceberg, ring, contests, bcwc, bttr, terrarium, howpolluted, archer
public/stills/             one still per track stage
public/captures/           recorded clips and manifests for bttr and bcwc
public/terrarium/, public/howpolluted/   ported art, fonts and history
scripts/                   checks, shots, compare, perf, Lighthouse, posters, stills, art, stats, captures, tests
docs/superpowers/          the design specs and the implementation plans
docs/port-notes/           where every ported or captured thing came from
design/                    shots, comparison shots, perf.md, lighthouse.json, reference art
```
