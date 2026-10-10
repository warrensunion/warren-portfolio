# Tracks 2: HowPolluted Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The HowPolluted track figure. Scroll spins the globe to a demo point, detects land or water from
the land mask, drops trash into a pile (or spreads a spill), then shows a graded result card. After that
the visitor cleans up the trash and watches the grade recover. It is plainly labelled a demo.

**Architecture:**
- HowPolluted's pure modules (`litter-sim.js`, `grades.js`) and its globe are ported with source headers.
- The time-driven litter scene is rewritten as a scroll-driven 2D canvas scene that reuses the source's
  drawing rules.
- One WebGL context (the globe) plus 2D canvases.
- `src/figures/howpolluted/figure.js` maps track progress `x = p * 4` onto the five stages.

**Tech Stack:** three@0.180.0 (already present), Canvas 2D, node:test, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-10-project-tracks-design.md` section 5.4, plus sections 3 and 9.

## Global Constraints

- Source: `C:\Users\Warren\projects\HowPolluted`, commit `80f6d06c5cfe83c09b8ce2711e475b66ee75da91`. It is
  read only. Never run its dev server and never write into it.
- Every ported file starts with
  `// Ported from HowPolluted <path> at 80f6d06 (Warren's own project). Changes: <list>.`
- No `/api` calls, no `fetch` to any host except this site's own `/howpolluted/...` assets, and no live data.
- Wherever a number or grade shows, it is labelled "Demo, not a measurement": on the card, in the readout
  (`... demo`) and in the caption (already in `content.js`).
- Demo values: land litter coverage `9` (%), water `6` (%). Grade via `gradeFor('litter', value)`, giving
  "Mildly poor" for 9 and "Moderate" for 6.
- Demo point: Richmond, BC, `{ lat: 49.17, lon: -123.14 }`. The land mask decides the ground there, and
  the readout says `ground: land, from the land mask` (or water).
- No `wheel` handler with `preventDefault`. The globe's wheel zoom is removed. Touch uses
  `touch-action: pan-y` on the stage.
- Fonts: Archivo Expanded and Montserrat (OFL, licence texts copied), loaded with `FontFace` inside
  `create()`, never in the page CSS.
- One WebGL context: the globe renderer. Destroy calls `renderer.dispose()` and `forceContextLoss()`.
- No new dependencies.

## Review Focus

1. **Scrolling back up after cleaning.** Pieces the visitor removed stay removed until the ground is
   switched or the figure is destroyed. Scrolling back into the fall stage replays the fall of the
   remaining pieces only, and the grade must match the remaining coverage. Test in Task 3
   (`model: removing then replaying keeps coverage`).
2. **A flick that throws a piece out of the scene.** The piece is clamped inside the ground band and still
   counts toward coverage. Only a click-pick removes it. Test in Task 3.
3. **Picking up every piece.** Coverage reaches 0, the grade is "Good", and the card says
   "All picked up." with no division by zero. Test in Task 3.
4. **Globe clicked on the poles or the seam (lon ±180).** The mask lookup wraps and clamps without
   throwing. Test in Task 2.
5. **A resize mid-pile.** Ground geometry changes, so items keep their relative positions (stored
   normalised 0..1) and coverage is recomputed against the new ground, staying within 0.5% of the old
   value. Test in Task 3.

---

### Task 1: Sync script, assets, fonts and the pure ports

**Files:**
- Create: `scripts/sync-howpolluted.mjs`, `src/figures/howpolluted/litter-sim.js`,
  `src/figures/howpolluted/grades.js`, `docs/port-notes/howpolluted.md`,
  `public/howpolluted/**` (copied assets), `scripts/test-howpolluted.mjs`
- Modify: `package.json` (script `sync:howpolluted`)

**Interfaces:**
- Produces:
  - `planPile(coveragePct, ground, sprites, seed) -> item[]` and `pileCoverage(items, ground) -> number`
    (verbatim).
  - `GRADES`, `BAND_SOURCES` and `gradeFor(kind, value) -> { grade, index }` (verbatim).
- `sync-howpolluted.mjs [--src=<path>]`:
  - checks that `git -C <src> rev-parse HEAD` equals the pinned commit, or prints both and requires
    `--allow-newer`;
  - copies this exact list into `public/howpolluted/`, keeping the sub-paths:
    - `art/manifest.json`
    - `art/plates/land-1280.webp`, `art/plates/water-1280.webp`
    - `art/layers/fg-land.webp`, `art/layers/fg-water.webp`
    - `art/fx/oil.webp`, `art/fx/chemical.webp`
    - `art/trash/*.webp` (all 24)
    - `globe/earth-2k.webp`, `globe/land-mask.png`
    - `fonts/archivo-expanded-latin.woff2`, `fonts/montserrat-latin.woff2`
    - `fonts/OFL-Archivo.txt`, `fonts/OFL-Montserrat.txt` (find their actual paths in the source and
      record them in port-notes)
  - writes `public/howpolluted/SOURCE.txt` with the commit.
  - It is the only code that reads the source tree.

- [ ] **Step 1: Write the failing tests** in `scripts/test-howpolluted.mjs`:
  - `litter-sim: a pile covers its target within 3%`: `planPile(9, {w:1000, top:300, bottom:700}, sprites, 7)`
    with three fake sprites `{w:100,h:80,fill:0.6,anchor:[50,70]}`, so `pileCoverage` is within 9 ± 0.27.
  - `litter-sim: same seed, same pile`: two calls are deepEqual (compare x, y, scale).
  - `grades: litter edges are exclusive`: `gradeFor('litter', 1).grade === 'Pretty good'`,
    `gradeFor('litter', 0.99).grade === 'Good'`, `gradeFor('litter', 9).grade === 'Mildly poor'`,
    `gradeFor('litter', 15).grade === 'Poor'`, `gradeFor('litter', 6).grade === 'Moderate'`.
  - `assets: every copied file exists and SOURCE.txt names 80f6d06`.
- [ ] **Step 2: Run** `node --test scripts/test-howpolluted.mjs`. Expected: FAIL (modules missing).
- [ ] **Step 3: Write** the sync script, run `npm run sync:howpolluted`, and port the two modules verbatim
  plus the header. Port-notes lists each ported or copied file with its source path and what changed.
- [ ] **Step 4: Run** the tests. Expected: PASS. Run `du -sh public/howpolluted` and record the size in
  port-notes. Expected: under 3 MB.
- [ ] **Step 5: Commit** `git commit -m "Port HowPolluted's pile sim, grades and art at 80f6d06"`.

### Task 2: Land-mask lookup

**Files:**
- Create: `src/figures/howpolluted/mask.js`
- Test: `scripts/test-howpolluted.mjs`

**Interfaces:**
- Produces:
  - `groundAt(mask, lat, lon) -> 'land' | 'water'`. `mask` is `{ width, height, data }` (RGBA, as from
    `getImageData`), equirectangular, x=0 at lon −180 and y=0 at lat +90. It reads one pixel and returns
    land when red > 127.
  - `loadMask(url) -> Promise<mask>` (browser only; draws into an OffscreenCanvas or a canvas and reads
    it once).
  - Lon wraps (`((lon + 180) % 360 + 360) % 360`). Lat clamps to ±89.999.

- [ ] **Step 1: Failing tests:**
  - `mask: equirectangular lookup`: a 4x2 mask with only pixel (1,0) white. Then
    `groundAt(m, 45, -45) === 'land'` and `groundAt(m, -45, -45) === 'water'`.
  - `mask: wraps longitude and clamps the poles`: `groundAt(m, 45, 315)` equals `groundAt(m, 45, -45)`,
    and `groundAt(m, 95, 0)` does not throw.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** `groundAt` (pure) and `loadMask`.
- [ ] **Step 4: Run.** Expected: PASS. Then
  `node -e` with sharp: load `public/howpolluted/globe/land-mask.png` as raw RGBA and print
  `groundAt(m, 49.17, -123.14)`. Record the result in port-notes. That is the honest demo ground.
- [ ] **Step 5: Commit** `git commit -m "Look up land or water from HowPolluted's land mask"`.

### Task 3: Demo model (pure): pile state, picking, flicking and regrading

**Files:**
- Create: `src/figures/howpolluted/model.js`
- Test: `scripts/test-howpolluted.mjs`

**Interfaces:**
- Produces:
  - `createModel({ ground: 'land'|'water', sprites, value }) -> model`:
    - `layout(groundRect)` stores `groundRect = { w, top, bottom }` and plans the pile once per ground
      with seed 4917. Items keep normalised `nx` and `ny` in 0..1 within the ground band, so a re-layout
      keeps their places.
    - `items()` returns live items with px positions.
    - `coverage()` is `pileCoverage(remaining, ground)`.
    - `grade()` returns `{ grade, index }` from `gradeFor('litter', coverage())`.
    - `pickAt(x, y) -> boolean` removes the topmost item whose rotated sprite box contains the point
      (front-most is the largest y first).
    - `grabAt(x, y) -> id | null`, `drag(id, x, y)`, and `release(id, vx, vy)` give a flick velocity.
    - `step(dt)` integrates flicked items with friction 4/s, bounces off the ground-band edges with 0.4
      restitution, and stops below 5 px/s.
    - `reset()` restores the full pile.
  - A piece moved by drag or flick keeps counting. Only `pickAt` removes one.
  - `value` is the demo coverage. The planned pile covers it, and the initial `coverage()` is within 3%
    of `value`.

- [ ] **Step 1: Failing tests:**
  - `model: picking lowers coverage and can improve the grade`: from land at 9, remove pieces by `pickAt`
    on each item's centre until coverage < 8. Then the grade is "Moderate".
  - `model: removing every piece gives Good and coverage 0`.
  - `model: a flick stays inside the ground band and still counts`: release with a velocity of 5000 px/s,
    `step(1/60)` 300 times. The item stays within `[0,w] x [top,bottom]` and coverage is unchanged.
  - `model: removing then replaying keeps coverage`: pick 5, then `layout()` again with the same rect.
    Coverage is unchanged and the removed pieces stay removed.
  - `model: a resize keeps relative places and coverage within 0.5%`: layout at 1000x(300..700), then at
    800x(240..560). The coverage difference is ≤ 0.5.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** `model.js`. Hit-testing uses the sprite rect `[-anchor, w-anchor] x
  [-anchor, h-anchor]` scaled, after undoing rotation and flip.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "Model the demo pile: pick, flick and regrade"`.

### Task 4: Globe port

**Files:**
- Create: `src/figures/howpolluted/globe.js` (from `src/screens/globe/globe.js`)

**Interfaces:**
- Produces `createGlobe(canvas, { texture, tier, onPick }) -> { aim(point, t), setPin(point, s),
  setVisible(bool), render(dtMs), resize(w,h), pointer: { down(e), move(e), up(e) }, interactive(bool),
  destroy() }`.
- Changes from the source:
  - no wheel or pinch zoom (removed);
  - no own rAF (the figure drives `render`);
  - `aim(point, t)` sets yaw, pitch and distance by easing (ease-out cubic, the source's curve) from the
    idle spin pose at t=0 to facing `point` at zoom 2.6 at t=1, deterministically;
  - `setPin(point, s)` scales the pin with the source's back-out curve at s;
  - drag-to-spin with inertia only while `interactive(true)`;
  - click picking unchanged;
  - DPR `min(devicePixelRatio, tier==='high' ? 2 : 1)`;
  - three 0.180 API: if anything from 0.186 is missing, replace it with its 0.180 equivalent and list it
    in the header.

- [ ] **Step 1:** Port with the header and the changes above.
- [ ] **Step 2: Verify** `npm run build` passes with no warnings about three exports.
- [ ] **Step 3: Commit** `git commit -m "Port HowPolluted's globe to three 0.180 without wheel zoom"`.

### Task 5: Scene, card and figure

**Files:**
- Create: `src/figures/howpolluted/scene.js` (from litter.js), `src/figures/howpolluted/card.js` (from
  card.js), `src/figures/howpolluted/figure.js`, `src/figures/howpolluted/figure.css`
- Modify: `src/main.js` (loader `howpolluted`)

**Interfaces:**
- `scene.js`: `createScene(host, { manifest, images, model, ground }) -> { draw({ fall, spill, t }),
  resize(w,h), destroy() }`.
  - It uses the source's plate, fg, slick and shadow drawing.
  - `fall` in 0..1 maps to the source timeline: each piece starts at `it.t * 0.8` and falls over 0.2.
  - `spill` 0..1 is the slick radius factor.
  - `t` is in seconds, for bobbing.
  - It never adds window listeners.
- `card.js`: `renderCard(host, { ground, coverage, grade, initialGrade }) -> { update(...), el }`.
  - Kind line: "Litter" with a tag reading "Demo, not a measurement".
  - Big number `coverage.toFixed(1)` and `%`. The grade word and its MEANING line come from the source.
  - "Grade scale: HowPolluted’s own coverage steps (no standard exists)."
  - When coverage is 0: "All picked up."
  - No Explain button and no inputs list.
- `figure.js`: `create(stage, ctx)` returns `{ start, stop, resize, destroy, readout }`.
  - `x = ctx.progress() * 4`.
  - Globe `aim(point, clamp(x,0,1))`, pin at `clamp(x-1, 0, 0.4)/0.4`.
  - The globe fades to the scene over `x` 1.6 to 2.0.
  - `fall = clamp(x-2,0,1)`, `spill = fall`.
  - The card is visible from `x >= 2.85`, sliding in over 0.15.
  - Interaction is on only at `ctx.stage() === 4`:
    - pointerdown on a piece grabs it;
    - a move over 6 px drags it;
    - release flicks it with the velocity of the last 80 ms;
    - a click (under 6 px, under 250 ms) picks it up.
  - The controls appear at stage 4 as buttons over the plate: `Land`, `Water`, `Globe`.
    - Land and Water switch the model's ground (and reset).
    - Globe shows the globe, interactive. A click picks a point, `groundAt` decides, and the scene comes
      back on that ground.
  - Readout: `stage N of 5, ground: <land|water>, <coverage>% demo`.
  - Fires `fig:ready` on the stage after the first globe frame.
  - Calls `ctx.frame(dt)` each frame.
  - Fonts are loaded via `FontFace` on `/howpolluted/fonts/...`, and failure is ignored (system fallback).
  - Everything lives under `.hp` in figure.css. The card's colours are HowPolluted's tokens, copied as CSS
    custom properties scoped to `.hp`.
- Under reduced motion the host never loads this module (stage stills). No change is needed here.

- [ ] **Step 1: Write the failing check** in `scripts/check-figures.mjs`:
  - append `'howpolluted-0'` to `WEBGL_IDS`;
  - add `checkHowPolluted(browser, url)`:
    1. jump to stage 4, wait live, and read the card's number N0;
    2. click the centre of 6 pieces (read their positions from `window.__hp.items()`, exposed only when
       `?debug=1`);
    3. the number is now below N0, and the grade text matches `gradeFor('litter', N)`;
    4. the card and readout contain "demo";
    5. `page.on('request')` saw no URL containing `/api`;
    6. a wheel over the stage at stage 4 changes `scrollY`.
- [ ] **Step 2: Run** `npm run check -- ` and confirm the new lines FAIL (no loader yet).
- [ ] **Step 3: Implement** scene.js, card.js, figure.js, figure.css and the loader.
- [ ] **Step 4: Run** `npm run check`. Expected: every line PASS, including `live: howpolluted-0` and the
  budget.
- [ ] **Step 5: Commit** `git commit -m "HowPolluted track: globe, ground, pile, grade and cleanup"`.

### Task 6: Stage stills, perf and shots

**Files:**
- Modify: `scripts/posters.mjs` (stage stills), `scripts/perf.mjs` (`howpolluted-0`)

- [ ] **Step 1:** posters.mjs gains `TRACK_STILLS`, one shot per stage `{ file: 'stills/howpolluted-s<i>',
  q: 'poster=howpolluted&stage=<i>' }`. They are written to `public/stills/howpolluted-s<i>.webp` at 1440
  layout, 1x, quality 78. In poster mode, figure.js renders stage i at its end state (`x = i`, with the
  card shown at i ≥ 3).
- [ ] **Step 2: Run** `npm run posters -- --only=stills/howpolluted-s0,stills/howpolluted-s1,stills/howpolluted-s2,stills/howpolluted-s3,stills/howpolluted-s4`.
  Open each still with Read and check it shows its stage.
- [ ] **Step 3:** Add `howpolluted-0` to perf.mjs FIGS. Run `npm run perf` and confirm avg fps ≥ 55 on
  the high tier.
- [ ] **Step 4: Run** `npm test && npm run check`. Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "Shoot HowPolluted's stage stills and measure its frame rate"`.
