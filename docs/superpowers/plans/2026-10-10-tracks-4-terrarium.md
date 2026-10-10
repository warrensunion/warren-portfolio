# Tracks 4: Terrarium Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Terrarium track figure. A live jar of evolving creatures from a fixed seed. Scroll settles
the camera on the jar, fast-forwards generations, draws the species streamgraph, then opens a brain view.
After that the visitor turns the jar and clicks creatures.

**Architecture:**
- Terrarium's pure sim, a slimmed worker, its jar renderer (`live/`), the river streamgraph and the brain
  visualisation are ported with source headers into `src/figures/terrarium/`.
- One WebGL context (the jar). The streamgraph and brain are 2D canvases.
- The streamgraph history is precomputed in Node from the same seed, so it scrubs both ways. The live jar
  only moves forward and resets when the visitor scrolls back to stage 0.

**Tech Stack:** three@0.180.0 (same version as the source), Web Worker (Vite `?worker`), Canvas 2D,
node:test, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-10-project-tracks-design.md` section 5.3, plus sections 3 and 9.

## Global Constraints

- Source: `C:\Users\Warren\Downloads\terrarium`, commit `7612a407723c7b73737a87ca4e6f502cd5c387bb`. It is
  read only.
- Every ported file starts with
  `// Ported from terrarium <path> at 7612a40 (Warren's own project). Changes: <list>.`
- `docs/port-notes/terrarium.md` lists each file and its source path.
- Seed `20261010`. Count 300 on the high tier, 160 on the low tier. CPU sensor only: no `sense-gpu.js`, so
  the sim is deterministic.
- No `wheel` handler with `preventDefault`. The camera rig's wheel zoom is removed. The canvas uses
  `touch-action: pan-y`, not `none`. Drag orbits horizontally; vertical drags still scroll on touch.
- Keys 1, 2 and 3 (speed) and F (follow) work only while the figure is focused. The source's `window`
  keydown listener becomes a listener on the figure.
- Stage mapping, with `x = ctx.progress() * 4`:
  - Stage 0 (The jar), `x < 0.5`: speed 1x, camera settles on the jar (the source's intro orbit at
    `x` 0..1).
  - Stage 1 (Generations): speed 16x while the current max generation is below `targetGen(x)`,
    otherwise 1x. `targetGen(x) = round(G * clamp(x - 0.5, 0, 1))`, where G is the max generation in
    history.json at 3,600 steps.
  - Stage 2 (Species split): the river canvas slides up over the lower 32% of the plate. Its playhead is
    `clamp(x - 1.5, 0, 1)` across history.json, which draws in with x.
  - Stage 3 (Brains): the brain canvas opens for the featured creature (the oldest-lineage member alive)
    beside its gen-0 ancestor's genome, which is kept in history.json.
  - Stage 4 (Your turn): drag to orbit, click a creature to open its brain (the 6 px drag threshold as in
    the source), and 1, 2, 3 for speed.
- Scrolling back into stage 0 from stage 1 or later resets the worker world from the seed.
- The readout is `gen <n>, <pop> alive, <species> species`.
- One WebGL context, disposed with `forceContextLoss()`. The worker is terminated on destroy.
- Textures `moss-floor.webp` and `room-backdrop.webp` are copied to `public/terrarium/`, loaded only by
  the figure.
- No new dependencies.

## Review Focus

1. **The visitor scrolls fast to stage 4 on first load.** The world is at gen 0 and the stage-1
   fast-forward has not run. Stage 4 still works (a live gen-0 world), and the readout is honest about the
   generation. Test in Task 4's check: jump straight to stage 4, and the readout's gen matches
   `__terra.gen()`.
2. **The worker fails to start** (CSP, old browser). The figure falls back through the host's `error` path
   to the stage stills, with one log line. Test in Task 4: stub `Worker` to throw in an init script, then
   expect the `fallback: error` log and stills visible.
3. **Clicking the river or brain overlays at stage 4** must not pick a creature through the overlay. Test
   in Task 4.
4. **A long stay at 16x on a slow machine.** The worker's backlog rule (from the source) slows the sim
   instead of queueing. Keep the source's divide-by-backlog logic in the slim worker. Test in Task 2
   (`worker: backlog divides steps`).
5. **History and live world disagree on generation numbers.** Both come from the same seed and count with
   the CPU sensor. Test in Task 1: running the ported sim for 3,600 steps in Node gives the same max gen
   and species count as history.json.

---

### Task 1: Port the sim and generate history.json

**Files:**
- Create: `src/figures/terrarium/sim/{rng,genes,neat,species,sense-cpu,world}.js` (verbatim plus header),
  `scripts/terrarium-history.mjs`, `public/terrarium/history.json`, `docs/port-notes/terrarium.md`,
  `scripts/test-terrarium.mjs`
- Copy: `public/terrarium/moss-floor.webp`, `public/terrarium/room-backdrop.webp` (from the source's
  `public/art/`)

**Interfaces:**
- Produces:
  - `createWorld({ seed, count, params, sensor, idBase })` and `packFrame(world, inspectId, sinceTick)`
    (verbatim).
  - `history.json`: `{ seed, count, steps: 3600, every: 120, samples: [{ tick, maxGen, pop, species:
    [[id, count, hue], ...] }], featured: { lineageRootId, gen0Genome } }`.
- `terrarium-history.mjs` runs `createWorld({ seed: 20261010, count: 300, params: { foodRate: 1.3 } })`
  for 3,600 steps. Every 120 steps it records `world.stats` (the same shape `river.push` takes). It picks
  the featured lineage as the most numerous species at the end, and records the gen-0 genome of that
  species' oldest founder.

- [ ] **Step 1: Failing tests:**
  - `sim: same seed, same history hash`: run 600 steps twice and compare the sha1 of `packFrame` floats.
  - `history: matches a fresh run`: run 3,600 steps and compare max gen and species count at the end with
    the last sample of history.json.
  - `history: is under 200 kB`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Port** the sim, write the history script, and run it.
- [ ] **Step 4: Run.** Expected: PASS. Record the run time in port-notes.
- [ ] **Step 5: Commit** `git commit -m "Port Terrarium's seeded sim at 7612a40 and record its history"`.

### Task 2: Slim worker

**Files:**
- Create: `src/figures/terrarium/worker.js`
- Test: `scripts/test-terrarium.mjs`

**Interfaces:**
- Messages in: `{type:'init', seed, count, params}`, `{type:'step', n}`, `{type:'inspect', id}`,
  `{type:'reset'}`.
- Messages out: `{type:'frame', ...packFrame}` (with transfer), and `{type:'error', message, request}`.
- Kept from the source: one promise chain and the backlog division.
- Dropped: GPU sensing, simcheck, URL params.
- `handle(msg, post)` is exported for Node tests. The worker's `onmessage` calls it.

- [ ] **Step 1: Failing tests:** `worker: init then step returns a frame with pop > 0`, and
  `worker: backlog divides steps` (queue 4 step requests of n=16, and each runs 4 steps).
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "Terrarium: a deterministic worker for the jar"`.

### Task 3: Port the jar renderer, river and brain view

**Files:**
- Create: `src/figures/terrarium/live/{stage,jar,terrain,creatures,ik,lod,look,food,particles,grade,camera}.js`,
  `src/figures/terrarium/river.js`, `src/figures/terrarium/brain.js`, `src/figures/terrarium/ease.js`
- Changes (all listed in the headers):
  - asset URLs go to `/terrarium/...`;
  - `camera.js`: no wheel handler, `touch-action: pan-y`, and a new `setOrbit(phi, theta, dist)` so the
    figure can drive the intro orbit by scroll;
  - `stage.js`: takes `{ tier }`. The low tier uses DPR 1 and no MSAA target (it renders straight to the
    screen and skips `grade.js`'s pass);
  - `brain.js`: just `createBrainViz` from `brain-panel.js` plus its helpers. No panel chrome, and
    `prefersReducedMotion` comes in as an option;
  - `river.js`: `prefersReducedMotion` comes in as an option, and it gets `setPlayhead(u)`, which draws
    the history up to u.

- [ ] **Step 1: Port** the files.
- [ ] **Step 2: Verify** `npm run build` with no warnings.
- [ ] **Step 3: Commit** `git commit -m "Port Terrarium's jar renderer, streamgraph and brain view"`.

### Task 4: Figure and checks

**Files:**
- Create: `src/figures/terrarium/figure.js`, `src/figures/terrarium/figure.css`
- Modify: `src/main.js` (loader `terrarium`), `scripts/check-figures.mjs`, `scripts/posters.mjs`, `scripts/perf.mjs`

**Interfaces:**
- `create(stage, ctx)` returns `{ start, stop, resize, destroy, readout }`. It implements the stage mapping
  in Global Constraints.
- It asks the worker for `n = speed` steps per rAF (the source's 1x is 1 step per frame).
- The overlays are `.tr-river` and `.tr-brain` absolutely positioned in the stage. When open, they catch
  their own pointer events with `stopPropagation`.
- `?debug=1` exposes `window.__terra = { gen(), pop(), species(), pickFirst() }`.
- Fires `fig:ready` after the first rendered frame and calls `ctx.frame(dt)` each frame.

- [ ] **Step 1: Write the failing checks** (`WEBGL_IDS += 'terrarium-0'`) in `checkTerrarium`:
  1. At stage 1, gen rises above 5 within 6 s.
  2. At stage 2, `.tr-river` is visible and its canvas is non-blank.
  3. At stage 3, `.tr-brain` is visible.
  4. At stage 4, a drag changes the camera azimuth (`__terra.azimuth()`), and a click on a projected
     creature (`__terra.pickFirst()` gives screen coordinates) opens the brain.
  5. A click on the river overlay opens nothing new.
  6. A wheel over the canvas changes `scrollY`.
  7. Scrolling back to stage 0 resets gen to 0 or 1.
  8. Jumping straight to stage 4 on a fresh load gives a readout gen equal to `__terra.gen()`.
  9. With `Worker` stubbed to throw, there is one `[fig:terrarium] fallback: error` line and the stills
     show.
- [ ] **Step 2: Run** the checks and confirm they FAIL.
- [ ] **Step 3: Implement** figure.js, figure.css and the loader.
- [ ] **Step 4: Run** `npm run check`. Expected: all PASS, including the budget while scrolling fast past
  all three project tracks.
- [ ] **Step 5:** Stills (`stills/terrarium-s<i>`; poster mode runs the sim headless to the stage's
  representative tick before rendering: s0 tick 0, s1 tick 1800, s2 and s3 tick 3600 with the overlay
  open, s4 tick 3600 with the brain closed). Perf: add `terrarium-0`, avg fps ≥ 50 on the high tier.
  Look at every still.
- [ ] **Step 6: Commit** `git commit -m "Terrarium track: the jar, generations, species and brains"`.
