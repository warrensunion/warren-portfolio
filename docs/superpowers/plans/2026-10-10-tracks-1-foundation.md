# Tracks 1: Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Work, Building and Projects into scroll tracks. Each track has sticky text, a pinned figure
that walks through stages, a 0..1 progress value per track, and stage stills for reduced motion and
`?static=1`. The host gets a context budget weighted by how many WebGL contexts each figure opens. The
ice-block figures go away.

**Architecture:**
- `render.js` emits track markup from `content.js`.
- CSS does all of the pinning with native sticky.
- `tracks.js` runs one rAF loop while any track is on screen. It turns rect reads into progress, stage
  and `--p` values. Figures pull progress through `ctx.progress()`.
- `host.js` counts budget in weights.
- Until each demo lands, every track figure is a poster-only figure with placeholder stage stills.

**Tech Stack:** Vite 7, vanilla ES modules, node:test, Playwright, sharp (dev).

**Spec:** `docs/superpowers/specs/2026-10-10-project-tracks-design.md` (sections 3, 4, 6, 9)

## Global Constraints

- The only runtime dependency is `three@0.180.0`. No new packages.
- No em or en dashes and no middle-dot chains in visible copy. Unknown facts are `[TODO: ...]`.
- Desktop breakpoint is `min-width: 860px`, phone is `max-width: 859px`.
- Sticky text is `top: 96px`. The scroll length per stage is `85svh`.
- Phone progress runs from the figure top at 85% of viewport height to the figure centre at 45%.
- Stage hysteresis is 0.04. Cross-fade is 400 ms opacity only.
- `MAX_LIVE = 3` context weight.
- No scroll listeners. No `wheel` handler ever calls `preventDefault`.

## Review Focus

1. **A visitor resizes across 860 px while inside a track.** Progress must switch formula without jumping
   stages backwards more than one, and the sticky text must not stay pinned on the phone layout. Test in
   Task 6: resize 1440 to 390 to 1440 mid-track, then assert text `position` and `data-stage` sanity.
2. **Clicking a stage button under reduced motion.** It must jump instantly (no smooth scroll) and swap the
   still. Test in Task 6.
3. **A track whose text is taller than its pinned figure.** The text must still release with the rail and
   never overlap the next track. Test in Task 6 at 1920x1080, using the tallest text (BTTRURSLF).
4. **Page loads deep inside a track** (reload while scrolled, or a `#projects` link). The stage must be
   correct on the first frame, not after a scroll. Test in Task 6: `goto(url + '#howpolluted')`, then read
   `data-stage` immediately after load.
5. **Weight-2 figure while two weight-1 figures are live.** It must evict until it fits, and never exceed
   3. Unit test in Task 1.

---

### Task 1: Weighted context budget

**Files:**
- Modify: `src/figures/budget.js`, `src/figures/env.js`, `src/figures/host.js`
- Test: `scripts/test-budget.mjs`

**Interfaces:**
- Produces:
  - `createBudget(max)` returns `{ acquire(id, distanceFn, weight = 1) -> string[], release(id),
    live() -> string[], used() -> number }`.
  - `env.js` exports `WEIGHTS = { iceberg: 1, ring: 1, terrarium: 1, howpolluted: 1, archer: 1, bcwc: 0,
    bttr: 0, contests: 0 }`, `weightOf(kind) -> number`, and
    `isWebGLKind(kind) -> boolean` (true when the weight is above 0, or the kind is `bcwc`).
  - `TRACK_KINDS = new Set(['bcwc', 'bttr', 'terrarium', 'howpolluted', 'archer'])`.
- `fallbackReason` applies to every kind in `WEIGHTS` except `contests`.

- [ ] **Step 1: Write failing tests** in `scripts/test-budget.mjs`:
  - `budget: a weight-2 acquire evicts farthest weight-1 figures until used() <= 3`: acquire a(d=5), b(d=1),
    c(d=3) at weight 1, then `acquire('x', ()=>0, 2)`. It returns `['a','c']` and `used()` is 1+2=3.
  - `budget: weight-0 acquires never evict`: three weight-1 acquires, then `acquire('z', ()=>0, 0)`. It
    returns `[]`.
  - `budget: re-acquire with a new weight replaces the old weight`: acquire a at 2, then at 1. `used()` is 1.
  - `env: weightOf` returns 2 for nothing at load time: `weightOf('bcwc') === 0` (the iframe claims 2 at
    runtime), `weightOf('archer') === 1`, `weightOf('unknown') === 0`.
  - `env: fallbackReason covers track kinds`: `fallbackReason({kind:'bttr', reduced:true, webgl2:true})` is
    `'reduced-motion'`. With `kind:'contests'` it is `null`.
  - Update the existing `iceblock` mentions to `archer`.
- [ ] **Step 2: Run** `node --test scripts/test-budget.mjs`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement.** Budget entries become `{ distance, weight }`. Eviction sorts the other
  entries farthest first and drops them until `used() <= max`. In `env.js`, `fallbackReason` gates on
  `kind in WEIGHTS && kind !== 'contests'`, so a capture kind (weight 0) falls back too. A weight-0 kind
  skips the `no-webgl2` rule, because a frame player does not need WebGL. In `host.js`:
  - `budget.acquire(s.id, dist, weightOf(s.kind))`.
  - `freeSlots()` becomes `MAX_LIVE - budget.used()`.
  - `mustWait` and `slotRetries` stay id-based but are only consulted for weight > 0.
  - Add `window.__figWeight = () => budget.used()` for the checks.
  - Add `ctx.claim(weight)`, which calls `budget.acquire(s.id, dist, weight)` and destroys the evictees,
    and `ctx.unclaim()`, which re-acquires at `weightOf(kind)`.
- [ ] **Step 4: Run** `node --test scripts/test-budget.mjs`. Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "Weight the context budget by contexts per figure"`.

### Task 2: Track progress maths (pure)

**Files:**
- Create: `src/figures/track-math.js`
- Test: `scripts/test-tracks.mjs`

**Interfaces:**
- Produces:
  - `deskProgress({ railTop, pad, top = 96 }) -> number`: `clamp01((top - railTop) / pad)`, and 0 when
    `pad <= 0`.
  - `phoneProgress({ figTop, figH, vh }) -> number`: start where `figTop === 0.85*vh`, end where
    `figTop + figH/2 === 0.45*vh`, clamped.
  - `stageFor(p, n, prev) -> number`: `round(p*(n-1))`, except that it keeps `prev` while
    `|p*(n-1) - (prev ± 0.5)| < 0.04*(n-1)`. With `n === 1` it always returns 0.
  - `stageOffset(i, n, pad) -> number`: px into the rail where stage i is centred, `pad * i/(n-1)`.

- [ ] **Step 1: Write failing tests:**
  - `deskProgress is 0 before the rail pins, 1 at the end, linear between`: `railTop=96, pad=850` gives 0;
    `railTop=96-425` gives 0.5; `railTop=-2000` gives 1; `pad=0` gives 0.
  - `phoneProgress spans top 85% to centre 45%`: `vh=844, figH=400`, so `figTop=717.4` gives 0, and
    `figTop=179.8` (centre at 379.8) gives 1.
  - `stageFor hysteresis`: n=5, prev=1. `p=0.37` (1.48) stays 1, `p=0.39` (1.56) goes to 2, `p=0.13` (0.52)
    stays 1, `p=0.1` goes to 0. `stageFor(0.7, 1, 0) === 0`.
  - `stageOffset`: `stageOffset(2, 5, 3400) === 1700`, and with `n=1` it is 0.
- [ ] **Step 2: Run** `node --test scripts/test-tracks.mjs`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** the four exports.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "Add the pure track progress and stage maths"`.

### Task 3: Content, render and placeholder stage stills

**Files:**
- Modify: `src/content.js`, `src/render.js`, `scripts/prepare-art.mjs`, `package.json` (script `stills`)
- Create: `scripts/stills.mjs`
- Test: `scripts/test-render.mjs`

**Interfaces:**
- Produces this content shape for a track entry:

  ```
  { id: '<slug>', title, href, role, dates, body: [...], tags: [...], feature?: true,
    fig: { kind, title, stat, caption, alt, size: [w,h], data: {...},
           stages: [{ label, still: '/stills/<slug>-s<i>.webp', alt }] } }
  ```

  The entry ids are `bcwc`, `bttrurslf`, `terrarium`, `howpolluted` and `archer-hero`.
- `render.js`:
  - `track(e, next)` emits the markup from spec section 3.1.
  - `<article class="track[ track--feature]" id="<id>" data-track style="--stages:N">`.
  - The stage list is `<ol class="fig-stages">` with `<button type="button" data-stage="i"
    aria-controls="<id>-stage">` (`aria-current="step"` on 0).
  - Stills are `<img class="fig-poster fig-still" data-stage="i" ...>`. The one with i=0 has
    `class="... is-on"` and `loading` follows the hero rule. The others are lazy.
  - The figure gets `class="fig fig--track"`, and `data-stages` holds the labels as JSON.
  - The header gets `<span class="fig-led" aria-hidden="true"></span>`.
  - `entry()` stays for any non-track entry.
- `scripts/stills.mjs` (`npm run stills`) writes a placeholder webp for each stage still missing in
  `public/stills/`, at the figure's `size`. It is an SVG rendered by sharp: a plate background `#eef0f1`,
  mono text "<title>, stage i: <label>" and "[TODO: still]" in ink-3. It never overwrites an existing file.

- [ ] **Step 1: Write failing tests** in `test-render.mjs`:
  - `tracks render in page order`: the article ids are `['bcwc','bttrurslf','terrarium','howpolluted',
    'archer-hero']`. Sections are unchanged.
  - `each track has --stages equal to its stage buttons and stills`: for each article, the count of
    `data-stage` buttons equals the count of `fig-still` imgs, which equals `--stages`. The stage counts are
    bcwc 5, bttrurslf 15, terrarium 5, howpolluted 5, archer-hero 4.
  - `BTTRURSLF is the only feature track`.
  - `no iceblock figure remains`: `!/data-fig="iceblock"/.test(html)`.
  - `track copy keeps TODOs and has no em dashes`: the role and dates of each entry match `/\[TODO/`, unless
    the content sets them. The page contains no `—` or `–`.
  - Update the old test `every figure has a poster` to match `fig-poster` on track stills too.
- [ ] **Step 2: Run** `node --test scripts/test-render.mjs`. Expected: FAIL.
- [ ] **Step 3: Implement the content.**
  - Write Terrarium's and HowPolluted's bodies from their surveys, as stated in spec section 6:
    - Terrarium: a seeded, pure evolution sim with NEAT brains, run in a Web Worker, and a three.js glass
      jar. Tags: JavaScript, three.js, Web Workers, NEAT.
    - HowPolluted: pick a spot on a globe; ground type from ESA WorldCover; litter and spill scenes graded
      Good, Pretty good, Moderate, Mildly poor or Poor; every number tagged Measured, Modelled or Estimate.
      Tags: JavaScript, three.js, Canvas 2D, ESA WorldCover.
  - BC Window Coverings' body uses the bcwc facts in spec section 5.1. Its result and link stay TODO.
  - Archer Hero's body adds "50 stages, bosses, relics and collectibles", plus `[TODO: release status]` and
    `[TODO: player count]`.
  - Use the stage labels from the spec tables.
  - Remove `objectFig`.
  - The ring's `objects` list and `posterMorph` gain `terrarium-jar` and `howpolluted-globe` in page order
    (spec section 7). `prepare-art.mjs` writes placeholder samples for slugs whose art source is missing:
    an SVG silhouette (the jar is a rounded rect with a neck, the globe a circle with two meridian
    ellipses).
- [ ] **Step 4: Implement** `track()` and `scripts/stills.mjs`. Run `npm run art && npm run stills`.
- [ ] **Step 5: Run** `npm test`. Expected: PASS. (`test-iceblock.mjs` is deleted in Task 5. If it still
  imports anything removed here, delete it now.)
- [ ] **Step 6: Commit** `git commit -m "Render the five projects as tracks with placeholder stage stills"`.

### Task 4: Track CSS

**Files:**
- Modify: `src/styles/layout.css`, `src/styles/figure.css`
- Create: none (iceblock CSS goes in Task 5)

Values (spec 3.2 to 3.5, 4):

```
@media (min-width: 860px)
  .track            grid 5fr/7fr, column-gap var(--col-gap), padding 56px 0 79px, align-items start
  .track--feature   grid-template-columns 4fr 8fr
  .track-text       position sticky; top 96px
  .js .track-rail   padding-bottom calc((var(--stages) - 1) * 85svh)
  .js .track-rail > .fig   position sticky; top 96px
  .fig--track .fig-stage   max-height calc(100svh - 96px - 24px - var(--plate-chrome)); aspect from size
@media (max-width: 859px)
  .track            one column; .track-text static; rail padding 0; figure margin-top 40px
.fig-stages         flex wrap, gap 4px 14px, mono var(--fs-mono), color ink-3; [aria-current] ink
.fig-led            6px circle ink-3; .fig[data-running] .fig-led accent + 2.4s pulse (none when reduced)
.fig-still          absolute inset 0, opacity 0, transition opacity .4s; .is-on opacity 1
html:not(.js) .fig-still   static, opacity 1, each in flow (document reading)
```

`--plate-chrome` is the measured height of the header plus the stage list plus the caption. Set it in CSS
as `120px` on desktop. The checks in Task 6 assert that the plate fits the viewport.

- [ ] **Step 1: Implement** the rules above. Remove `.entry` rules only where they no longer apply. The
  contests block still uses `.entry--contests`.
- [ ] **Step 2: Verify by eye.** Run `npm run build && npm run preview`, open 1440x900 in the browser pane
  at http://localhost:4173/#projects, and confirm that the text pins and the plate fits. Take a screenshot.
- [ ] **Step 3: Commit** `git commit -m "Lay out tracks with sticky text and pinned figures"`.

### Task 5: tracks.js, stills.js, host wiring and the iceblock removal

**Files:**
- Create: `src/figures/tracks.js`, `src/figures/stills.js`
- Modify: `src/figures/host.js`, `src/main.js`, `src/figures/env.js` (`readPoster` gains `stage`)
- Delete: `src/figures/iceblock/`, `scripts/test-iceblock.mjs`, `public/posters/{window-blind,summit-flag,archer-bow}.webp`
- Modify: `scripts/posters.mjs` (drop the iceblock shots; add `ws-3` and `ws-4`), `scripts/perf.mjs` (drop iceblock ids)

**Interfaces:**
- Produces:
  - `initTracks(root, { reduced }) -> { progressOf(figEl) -> number, stageOf(figEl) -> number,
    onStage(figEl, fn) -> unsubscribe }`.
  - In the host, `ctx` gains `progress()`, `stage()`, `stages` (count), `onStage(fn)`, `claim(w)` and
    `unclaim()`.
  - `initStills(root, tracks)` is called by the host's `fallback()` for track figures. It toggles `.is-on`
    on the still matching the stage.
  - `readPoster` returns `state.stage` (an integer or null) for every kind.
- Behaviour:
  - tracks.js uses one IntersectionObserver over `[data-track]`. A rAF loop runs only while at least one
    track intersects.
  - Each frame and for each visible track it reads `rail.getBoundingClientRect()` and the figure rect, and
    chooses `deskProgress` or `phoneProgress` by `matchMedia('(min-width: 860px)')`. The pad comes from
    the rail's computed `padding-bottom`.
  - It sets `data-stage`, `--p` and `aria-current`, and notifies `onStage` subscribers on change.
  - On init it computes once synchronously, so a deep load starts on the right stage.
  - A stage button click calls `scrollTo({ top: railDocTop - 96 + stageOffset(i, n, pad), behavior:
    reduced ? 'instant' : 'smooth' })` on desktop. On a phone it sets a manual stage override for that
    figure (progress is pinned to `i/(n-1)` until the visitor scrolls the figure past 10% of its range).
  - The host sets `data-running` on the figure while it intersects the middle 50% of the viewport. This is
    a new IntersectionObserver with `rootMargin: '-25% 0px -25% 0px'`, as measured on yuzeli.ca.
  - main.js creates the tracks before `initFigures` and passes `{ tracks }`.
  - Track kinds without a loader stay on stills. That means all five kinds for now: no loader entries, and
    `fallback(s, 'pending')` must not log. They simply show stills through `initStills`.

- [ ] **Step 1:** Add a test to `test-budget.mjs`: `readPoster gives stage`. `readPoster('?poster=archer&stage=2')`
  gives `{ kind: 'archer', index: 0, state: { stage: 2 } }`. Run it and see it FAIL.
- [ ] **Step 2: Implement** tracks.js, stills.js, the host changes, the main.js wiring, and the deletions.
- [ ] **Step 3: Run** `npm test && npm run build`. Expected: PASS, and the build has no warnings about
  missing imports.
- [ ] **Step 4: Commit** `git commit -m "Drive track stages from scroll progress and drop the ice blocks"`.

### Task 6: Checks for sticky release, sideways scroll, stills, budget weights and shots

**Files:**
- Modify: `scripts/check-figures.mjs`, `scripts/shoot.mjs`

Changes to check-figures:
- Drop every iceblock and label check (`labelGeometry` import, label states, ice block tab stops,
  `checkRaces`' label assertions). Keep canvas-fit and sideways-scroll parts of `checkRaces` over the
  remaining live figures.
- `WEBGL_IDS` becomes `['iceberg-0', 'ring-0']` for now. Later plans append their kinds.
- `checkBudget` also samples `window.__figWeight()` and asserts `<= 3`.

New `checkTracks(browser, url)` at 1440x900, 1920x1080 and 390x844. For each track:
- **desktop:** step through the track in 40 px increments from rail top minus 1 viewport to rail bottom
  plus 1 viewport, and record:
  - `textTop`, the figure rect, the rail bottom and the next track's text top;
  - PASS when every sample where the figure intersects the viewport and the text has not yet met the rail
    bottom has `|textTop - 96| <= 1`;
  - and every sample after release has `|textBottom - contentBottom| <= 1`, where `contentBottom` is the
    track content box bottom;
  - and the text never overlaps the next track's text.
- **phone:** `getComputedStyle(text).position === 'static'` and the figure is below the text.
- No horizontal scroll at each size: sample top, middle and bottom, and require `scrollWidth <= innerWidth`.
- **Stage stills follow scroll:** in a fresh `?static=1` page, jump to each track's `stageOffset(i)` for
  every i. Exactly one `.fig-still.is-on` must exist, with `data-stage == i`.
- **Reduced motion:** the same, plus a stage button click gives `data-stage` equal to that button within
  one frame, and `scrollY` has changed without smooth scrolling (two reads 50 ms apart are equal).
- **Deep load:** `goto(url + '#howpolluted')` at 1440, then `data-stage` is set before the first scroll
  event (read right after `load`).
- **Resize across 860 mid-track:** at 1440, scroll halfway into the terrarium track, resize to 390, then
  back to 1440. The text is `static` at 390 and sticky again at 1440, and `data-stage` is within 1 of where
  it was.
- **Plate fits:** at 1440x900 and 1920x1080, the pinned track figure's bottom is `<= innerHeight`.

shoot.mjs: for each track, shoot `<size>-<id>-first.png` at stage 0 and `<size>-<id>-last.png` at the last
stage, after `settle()`.

- [ ] **Step 1: Implement** the changes. `checkTracks` and the deep-load check go in `run`.
- [ ] **Step 2: Run** `npm run check`. Expected: every line PASS. Fix the code (not the checks) until it
  does.
- [ ] **Step 3: Run** `npm run shoot -- --no-build`. Look at the 1440, 1920 and 390 shots for the projects
  section.
- [ ] **Step 4: Commit** `git commit -m "Check sticky release, stage stills and weighted budget at three sizes"`.
