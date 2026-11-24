# Ascent: the snow and mountain redesign, report

Built overnight on the branch **`snow-ascent`** from the brief in `OVERNIGHT_SNOW_PROMPT.md` (left untracked).
Nothing was pushed to `main` and nothing was deployed. Calls I made on my own are marked **Decision**.
The working plan and its build log are in `design/SNOW_PLAN.md`.

## Preview it

```sh
git checkout snow-ascent
npm install
npm run build
npm run preview      # http://localhost:4173
```

Useful flags: `?static=1` (the still page), `?tier=low` (the phone tier on a desktop), `?fps=1` (frame meter).
Ctrl+K (Cmd+K on a Mac) opens the command palette; `e` copies the email anywhere outside it.

## Ship it

When you are happy with it: merge `snow-ascent` into `main` and push. The Pages workflow
(`.github/workflows/pages.yml`) runs `npm test` and the build, and deploys. Nothing else is needed: no new
secrets, no new services, and `three@0.180.0` is still the only runtime dependency.

```sh
git checkout main
git merge --no-ff snow-ascent
git push origin main
```

## What is built

**The world (phases b, d, e).** One persistent WebGL canvas fixed behind the page (`src/world/`), so the page
reads as a climb:
- A made-up range at blue hour: one long south ridge from a valley floor at base camp (0 m) to a 6,100 m
  summit 11 km north, ridged gullies and rock faces with snow chutes, a glacier with crevasses (the icefall),
  a crevasse plateau, a ring of lower peaks, and a valley of snow-loaded pines with two tents at base camp.
  The terrain is drawn on the GPU from one height function (`land.js`) that also runs in JS with the same
  integer hash, so the camera, the igloo, the pines and the seracs stand exactly on the surface the GPU draws.
  There is no mesh to download.
- Sky: gradient, hashed stars that twinkle, a moon with a halo, and an aurora that grows with altitude and with
  the night theme. Haze fades every surface into the sky's own colour. A cloud slab sits at the treeline
  (1,000 to 1,750 m), a cloud sea below the summit (4,150 m), and god-rays fall from the moon above the high camp.
- The igloo: 143 carved snow-ice blocks (dome rings, a key block, a tunnel), one InstancedMesh. Scroll places
  them; the next few fly in on a curve from where they were cut, tumble into their seats, land with a small bump
  and a puff of powder (and a clink with sound on). Hover lights a block's polygons with a white wire. At the
  summit the last block seals it and the seams glow warm from inside. It stands on its own snow knoll just ahead
  and right of the view, so it is in frame at every log, on the side the text column is not.
- GPU snow: 24,000 instanced flakes in three depth layers (6,000 on the low tier), a wind that rises with
  altitude, gust fronts sweeping across, the cursor's wind (flakes part and swirl round the pointer), and an
  avalanche of powder plus a capped shake of the canvas when the page is flung.
- Drag to look around (damped inertia, springs back), cursor parallax, an idle sway. Drag only starts on empty
  page, never on text, links, figures or controls.

**Scroll to altitude and the HUD (phase b).** Seven numbered logs, each a section with an altitude:
LOG 01 Base camp 0 m (the hero), LOG 02 Treeline 900 m (the ice field), LOG 03 Icefall 2,100 m (BTTRURSLF and
Beatcut), LOG 04 The ridge 3,400 m (Projects), LOG 05 Crevasse field 4,600 m (Work), LOG 06 High camp 5,500 m
(Record), LOG 07 Summit 6,100 m (Get in touch). Each log opens with its marker and one sentence, as yuzeli's do.
The hero's HUD (Fig. 0) and the bar's readout show altitude, temperature (falls 6.5 °C a kilometre), wind with
gusts, snowfall, blocks placed, visibility and a seed, all eased. The HUD says plainly that it is a model.

**The ice field (phase c).** Log 02 is the BTTRshop hub ported (`src/world/field/`, from Warren's own
`src/screens/shop/hub/`): the procedural ice hulls, the frost maps, transmission ice with its clear window,
frost shell, cracks, bubbles, rim, facet edges, the geodesic wire-mesh, leader lines, loose shards, glints,
the blurred mono text in the fog, and the dissolve (glitch strips, colour fringe, frost front). Each of the 11
projects is a block with its 3D symbol frozen inside, real geometry in a frosted white: Warren's B with the
mountain in its bowl (traced from `public/shop/logo-mark.png`), a clapperboard whose beat bars pulse, a
crushed bottle shedding fragments, a server rack whose load needle hunts, a raindrop over a sprout, a bow with
a flickering ghost arrow, a jar with a creature, a globe on a litter pile, a target with a quivering arrow, a
window whose blind slats tilt, and a gliding goose. BTTRURSLF's block is first and biggest, Beatcut second.
Labels scramble in on hairline leaders (`PROJECT_01` / `BTTRURSLF`, its first two tags, `CLICK TO OPEN`), the
side index fills the square of the block in view, and the dissolve takes the screen at both edges of the field.

**Chrome (phase f).** The bar keeps Résumé, GitHub, LinkedIn and copy-email, with a live readout and three
tools: theme (blue hour or deep night, the world re-lights), Sound: Off/On, and Ctrl+K. The altimeter on the
right edge replaces the scrollbar's look: a gauge with the seven logs as numbered links, a needle on the eased
altitude, and drag or click to scroll. The command palette lists every log, every project, the links, copy
email and the settings; arrows, Enter and Esc work, and `e` still copies the email outside it.

**BTTRURSLF (phase g).** It leads the page: a lead row with its pitch, its measured numbers from
`src/data/bttr-stats.json` (34 screens, 38 server routes, 640 tests, counted 2026-10-14) and the live iceberg
from its start screen, re-keyed from paper to blue hour (sky, fog, water, its overlay and its snow), then the
tabbed track of recorded screens as before, and a **Live site** link to bttrurslf.com, which answers now.

**Beatcut (phase h).** A new track after BTTRURSLF. Its figure plays three of Beatcut's own renders (spotlight
stage, line explainer, glitch popup), muted, in a phone frame, beside a beat grid built from each render's real
data: one cell per beat and a tick per cut, lit from the video's own clock, so the grid pulses with the clip's
cuts. The readout under it is the render's self-check (13 of 13, 9 of 9, 23 of 23 planned cuts on screen). The
fourth stage is the pipeline. The web encodes are 0.2 to 0.6 MB each (`public/beatcut/`), H.264 and WebM.

**The rest of the effect list (phase i).** Snow drifts on the plates, the log headings, the bar and the lead
numbers while you idle, blown off by a fast scroll; frost creeping in from the screen's corners as it gets
colder, melting in a warm circle round the cursor; breath fog where the cursor rests; icicles under the bar
with the odd drip; a crack racing across the screen at each log boundary; headings carved in with a glint
sweeping across; snow-globe plates (drag the BTTRURSLF, Beatcut or Ghostline plate); footprints laid along the
base-camp snow as you scroll through log 01; and sound (wind, crunching snow, ice clinks), off by default.

**Phones, reduced motion, static, no JS (phase j).** Phones and machines with 4 cores or fewer get the low
tier (DPR 1, 6,000 flakes, no bloom, no god-rays, a cheaper cloud sea, half-resolution transmission in the
field). Reduced motion, `?static=1`, save-data and no WebGL2 skip the world entirely: the backdrop is a still of
the climb per log (`public/posters/world-<n>.webp`), swapped at the logs, and the ice field is its list of
project links. Without JavaScript the page is the same document as before, over the base-camp still.

## Decisions

1. **The ice field is its own log (02, Treeline)**, between the hero and the tracks, as the brief places it. The
   climb enters the cloud at the treeline, the blocks float up through that fog, and the camera comes out at the
   icefall, which stays BTTRURSLF's.
2. **Clicking a block scrolls to that project's entry** (under the dissolve's full fog), instead of opening a
   full-screen panel. One copy of every project's words, the back button and `#hash` links work, keyboard and
   screen-reader users land on the project's heading (it takes focus), and there is no modal to trap focus.
3. **The igloo travels with the climber.** It stands on its own snow knoll ahead and right of the view at
   every altitude (like yuzeli's swarm, it is the thing being built on the journey), and at the summit it is
   sealed on the top. Its block count is what the geometry gives: 143.
4. **The page is dark now.** A night page reads over a blue-hour scene; the old paper palette would not. The
   iceberg, the ring and the contests chart were re-keyed for it, and their posters reshot.
5. **The world takes one of the page's three WebGL contexts.** The figure host now gets two (`reserve` in
   `initFigures`), and while a WebGL figure runs the world gives way (DPR 1, half the snow, no bloom).
6. **Beatcut's clips are Beatcut's own renders**, from `C:\Users\Warren\projects\beatcut\outputs` (the app's
   repo), muted with the audio removed. The `claude-videos-build/output-beat` videos the brief points to were
   made by a different pipeline (a separate overnight job driving Playwright, ffmpeg and canvas), not by Beatcut,
   so they are not shown as Beatcut output. Five of Beatcut's six demo renders use third-party songs, which is
   one more reason the page ships the video only.
7. **WATERLOODLE is in, as an honest card.** It is a real six-person SE 101 project (Fall 2026) but it is not
   finished and has no public link (it lives on the university's GitLab). The card says it is in progress and
   names only Warren's own work: the size game's five questions with sources and SVG art, the trivia game's
   Flask routes, templates and front end, and a layout, navigation and home page redesign that is waiting to be
   merged. The brief's "owns the frontend layout, nav and home page" is true only of that unmerged redesign, so
   the card does not claim it. Its plate is a screenshot of the redesign's home page from the team repo.
8. **bttrurslf.com is linked** (Live site), now that it answers with the app (title "BttrUrslf"); the private
   repo still is not.
9. **No reel slot.** Nothing filmed is about Warren yet, and the Beatcut track already autoplays clips.
10. **Third-party reference shots stay local.** `design/ref-yuzeli/` and `design/ref-igloo/` are gitignored;
    `design/ref-bttrshop/` (Warren's own app) is committed.
11. **BTTRURSLF keeps its recorded tabs** (Climb, Mereum, Face scan, BTTRmap, BTTRshop, Pro, Stats). The fresh
    screenshots in `output-beat/site/` are stills, and the track's player scrubs recorded clips; new tabs for
    Lodge and Mobile want new captures (`npm run capture:bttr`), which drive the app and were out of scope.
12. **The HUD is a model.** Altitude, temperature, wind, snowfall and visibility describe the made-up mountain,
    and the HUD's caption says so; none of it is presented as a measurement.

## Honesty

- Every number on the page is either measured with its source or a visible `[TODO: ...]`. New numbers:
  BTTRURSLF's three lead stats (its own stats file, dated), Beatcut's tempo, cut counts and mean cut-to-beat
  offsets (its own analysis, plan and self-check files, exported to `public/beatcut/<clip>.json`).
- Beatcut's commits are all co-authored by Claude Code (the app's own history), and the page does not say who
  wrote what: its role line is a `[TODO: role]` for you to fill in as you see fit.
- The world's HUD is labelled as a model of a made-up mountain.
- Zero em dashes, the bio is unchanged, and nothing links to the private BTTRURSLF or bcwc repositories.
- No BTTRURSLF source, keys, selectors or app data came over: the ported field code is the hub's rendering only
  (shapes, materials, dissolve, labels), and the `nosource` check still scans `dist/`.

## TODOs left for you

All of the earlier ones still stand (roles, dates, one stat per figure caption, the co-op term, contests and
awards, a real résumé PDF, deploying bcwc). New or changed:
1. **Beatcut:** its `role` and `dates`, and whether you want the page to say how it was built (its commits
   are co-authored by Claude Code). No public link: the repo has no remote. If you publish it, add a "Code" link.
2. **WATERLOODLE:** check the wording once your merge requests (#45, #46, #47) land, then change "waiting to
   be merged" and, if you like, the role line. The plate is the redesign's home page; reshoot it once it is live.
3. **BTTRURSLF tabs for Lodge and Mobile:** they need new captures (`npm run capture:bttr`), which drive the
   app; the fresh screenshots in `claude-videos-build/output-beat/site/` are stills only.
4. **A reel**, if you ever film one: the brief's "film slot" was left out (Decision 9).
5. **Look at the world on a laptop GPU** (see the perf notes below: this machine was saturated by other work
   all night, so its numbers are pessimistic for the CPU and optimistic for the GPU).

## Where each effect runs

| effect | file | notes |
|---|---|---|
| the range, sky, aurora, haze, cloud seas, god-rays | `src/world/{land,terrain,sky,shared,features,world}.js` | one canvas, weight 1 |
| igloo build, puffs, hover polygons, warm seams | `src/world/igloo.js` | 143 instances, CPU work only for blocks in the air |
| GPU snow, wind, gusts, cursor wind, avalanche | `src/world/snow.js` | vertex shader only |
| footprints | `src/world/terrain.js` | in the near terrain's fragment shader |
| camera, drag to look, parallax | `src/world/rig.js` | |
| scroll to altitude, HUD, the page's one loop | `src/world/boot.js`, `climb.js` | no scroll listeners |
| the ice field, symbols, labels, dissolve | `src/world/field/` | its own scene on the world's renderer |
| altimeter | `src/chrome/altimeter.js` | desktop (1024 px and up) |
| command palette | `src/chrome/palette.js` | a native `<dialog>` |
| sound | `src/chrome/sound.js` | WebAudio, off by default, no files |
| drifts, frost, breath, icicles, cracks, carved text, snow globes | `src/chrome/effects.js`, `src/styles/chrome.css` | CSS where it can be |

Flags: `?static=1` (stills), `?world=0` (the page without its world, for comparisons), `?tier=low|high`,
`?fps=1`. Ctrl+K anywhere; `e` copies the email.

## Checks

- `npm test`: 133 tests, all passing. New: `scripts/test-climb.mjs` (scroll to altitude, the weather model, the
  HUD's text, the ridge's height function) and new render tests (seven logs with rising altitudes, the ice field
  lists every project as a link with a symbol, one world still per log, the HUD labelled as a model,
  BTTRURSLF's lead numbers or TODOs). Existing tests were updated where the page's shape changed (section ids,
  the hero without a plate, the new track and card), never loosened.
- `npm run check`: a new `world` group (the world goes live and draws, the HUD climbs with the scroll and the
  igloo gains blocks, log 02 switches to the field with labels on the block in view, Enter on a block's link
  dollies in and lands on that project with its heading focused, Ctrl+K filters and goes, the altimeter marks
  all seven logs and follows the page, at most 3 WebGL contexts top to bottom with the world in them, and the
  reduced-motion and `?static=1` fallbacks). The budget, races, context-loss and Terrarium checks now count the
  world's own context.
- The first full run on this build found real problems, all fixed:
  - **Three WebGL figures on screen at once** (the end of Terrarium's track, HowPolluted, Archer Hero) with
    only two slots left by the world, so the centred card never went live. WATERLOODLE's card (no WebGL) now
    sits between the two WebGL cards.
  - **The iceberg's under-water still** kept a stale state when a jump carried it past its line unseen; its
    observer's root now reaches from far above the page to the middle line.
  - **Clips seeking slowly** while the world rendered at full rate behind the plates: the world now drops to
    half rate at DPR 1 while a figure runs mid-screen.
  - Checks that assumed the iceberg sits at the page top, or one context per live figure, were updated.

## Screenshots

- `design/shots/` (`npm run shoot`), at 1440x900, 1920x1080 and 390x844: `top` (base camp and the HUD),
  `field-0` and `field-1` (the first two blocks), each log (`index`, `building`, `projects`, `work`,
  `contests`, `contact`, plus `-fig` when its figure is cut), every track at its first and last stage
  (`bttrurslf`, `beatcut`, `drift`, `stress-test`, `raingarden`, `ghostline`, `terrarium`, `bcwc`), `bottom`,
  `full`, and the still page (`static-top`, `static-index`, `static-contact-fig`).
- `design/compare/` (`npm run compare`): yuzeli.ca beside this page at the same sizes and positions.
- `design/compare/blocks-*.png` (`npm run compare:blocks`, new): the BTTRshop hub's blocks
  (`design/ref-bttrshop/`) beside this page's first three blocks, at 1440x900 and 390x844.
- `design/ref-bttrshop/`: the hub, shot from BTTRURSLF-v2's dev server (its dev server was stopped after).
  `design/ref-yuzeli/` and `design/ref-igloo/` are local only.
- `public/posters/world-0..6.webp`: the world's still per log, which is also what reduced motion shows.

## Performance, before and after

**Read this first:** this machine was saturated all day (other sessions' builds, browsers and dev servers kept
the CPU at 100%), so every number below is pessimistic for the CPU. The October numbers in
`design/baseline/perf-before.md` were taken on an idle machine. Compare like with like: the "without the world"
row was measured in the same minutes as the "with" row.

**Lighthouse** (desktop preset, 3 runs, median; `design/baseline/lighthouse-before.json` vs `design/lighthouse.json`):

| | before (main, this morning, same busy machine) | after (`snow-ascent`) |
|---|---|---|
| Performance | 95 (runs 95, 99, 49) | **98** (runs 99, 95, 98) |
| Accessibility | 100 | 100 |
| Best practices | 100 | 100 |
| SEO | 92 (no robots.txt, as before) | 92 |

It took two fixes to get there. The first build scored 55 with 9 to 11 s of total blocking time: the world
built itself during the page load. Now it starts on the visitor's first input (the base-camp still is the same
picture until then), links its shaders off the main thread, and a page nobody has touched stays still (the HUD's
gusts and the icicles' drips wait for that first input too), so the load carries none of it.

**Frame rates** (`npm run perf`, 1440x900, RTX 3060, `design/perf.md`; 5 s per row after a warm-up):

| | high tier, with the world | high tier, without (`?world=0`) | low tier |
|---|---|---|---|
| iceberg | 57.2 fps | 55.6 | 58.4 |
| ring | 58.1 | 54.3 | 54.4 |
| HowPolluted | 55.6 | 51.8 | 52.6 |
| Archer Hero | 56.2 | 58.4 | 56.5 |
| Terrarium | 43.5 | 54.9 | 57.0 |

| the world itself | high tier | low tier | 4x CPU slowdown |
|---|---|---|---|
| base camp | 57.2 fps | 60.0 | 33.8 |
| inside the ice field | 58.8 | 57.2 | 25.1 |
| beside a running figure (Terrarium) | 29.7 (half rate by design) | 24.2 | 20.3 |
| summit | 58.0 | 60.0 | 37.2 |

- The figures run at about the same rate with and without the world, within this machine's noise, except
  Terrarium (43.5 against 54.9): its simulation and the world compete for the same starved CPU. While a
  figure runs mid-screen the world draws every other frame at DPR 1, which is the "beside Terrarium" row.
- Under a 4x CPU slowdown the world falls to 20 to 37 fps and the iceberg to 12.5 (60 in October, idle). That
  slowdown on top of a saturated CPU is far below a normal laptop; check on a real laptop before shipping.
- The world adapts on its own: after 2 s over 22 ms a frame it drops to DPR 1, half the snow and no bloom
  ("lowered quality" in the console), and it always pauses when the tab is hidden.

## Checks on the final code

- `npm test`: 133 of 133.
- `npm run check`, in groups (a full run takes over 35 minutes on this machine, so the final build was checked
  group by group): `world`, `budget`, `live`, `phone` 25 of 25; `world`, `clips`, `static`, `reduced` 28 of 29.
- Under the machine's load these checks failed in at least one run and passed in another, always as a timeout
  or a timing read, never as a wrong result: the races settle (a figure still building after 7 s), context loss,
  the ring's reduced-motion cross-fade (0.996 instead of 1 after 900 ms), three Archer Hero input checks, three
  Terrarium checks, Drift's site button and two clip stages. Terrarium was traced: at its stage it goes live
  after about 4 s here and stays live; the check read it after 300 ms (it now waits for the jar).
  **Run `npm run check` once on an idle machine before merging.**
- `npm run compare` could not run at the end: the machine lost its internet connection
  (`ERR_INTERNET_DISCONNECTED` for yuzeli.ca), and earlier yuzeli.ca would not finish loading within 90 s.
  `design/compare/*.png` (other than `blocks-*`) are still October's. The block comparison ran.

## How the blocks compare with the BTTRshop hub

Side by side at the same sizes (`design/compare/blocks-*.png`) the blocks match the hub's look: the same smoky
transmission ice with its frost shell, cracks and glints, the white geodesic wire, the leader lines and
scrambling labels, the side index. One thing is clearly below the reference and worth raising: **the frozen
objects.** The hub's are photographic white renders with soft occlusion and texture; this page's symbols are
real geometry in a simple frosted shader, so they read flatter (the B is clear, the clapperboard reads less
well on a phone). Baking an ambient-occlusion pass into the symbols, or rendering them once and freezing the
render like the hub, would close that gap.

## Known limits

- The world is drawn behind the plates even where a plate covers it; it eases off while a figure runs, but a
  page that hid it entirely behind opaque plates would save more.
- The igloo's knoll is a separate mesh that melts into the slope; at a few camera angles its edge still shows.
- On phones the theme toggle is hidden below 440 px wide (the bar keeps one line), and there is no altimeter
  or palette (they need a keyboard or room).
- `?world=0` turns the world off for comparisons; it is not linked from the page.
