# Warren Sun Portfolio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A one-page résumé site laid out like yuzeli.ca whose figures are live three.js scenes ported from BTTRURSLF-v2.

**Architecture:** Static HTML rendered at dev/build time from `src/content.js` by a tiny Vite plugin; a figure host
lazy-loads one module per `<figure data-fig>` (three.js in its own chunk), runs it only near/in view, caps live
WebGL contexts at 3 and falls back to poster images. Effects are ported (copied and adapted), never imported
from the source project.

**Tech Stack:** Vite 7, vanilla ES modules, three 0.180, Playwright + Lighthouse + sharp (dev), @fontsource
font files (dev, copied to public/fonts).

**Spec:** `docs/superpowers/specs/2026-10-10-portfolio-design.md` (read it first). Port notes:
`docs/port-notes/{iceberg,ice-block,ring-tube}.md`.

## Global Constraints

- Source project `C:\Users\Warren\Downloads\BTTRURSLF-v2` is READ-ONLY. Copy files in; never edit, never import across.
- No framework, no TypeScript. Runtime dependency: `three@0.180.0` only. No gsap.
- File headers explain WHY (2-6 lines), not what. Ported files say what they were ported from and what changed.
- Keep the browser default cursor: no `cursor:` declarations anywhere.
- Visible copy: zero `—` and `–`; no invented facts or numbers; unknowns are literally `[TODO: ...]`.
- Colours/type tokens exactly as spec section 3. Paper `#f4f3ee`, accent `#1f5f78`, ink `#17191c`.
- prefers-reduced-motion: no scroll-linked camera, no scramble, still images or cross-fades only.
- 390 px: no horizontal scroll. Laptop 60 fps target, measured.
- Every WebGL figure: poster fallback + `console.info('[fig:<name>] fallback: <reason>')`; destroy releases
  the context via `WEBGL_lose_context`.
- No `window.addEventListener('scroll')`; read rects inside the active figure's rAF only.
- Commit after each task with message ending `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Clipboard denied/unavailable (http, iframe, permissions): "Copy" must still give the user the address (select fallback + "Press Ctrl+C to copy").
2. Pressing `e` while typing in a field, with Ctrl/Cmd/Alt, or on a repeat must NOT copy.
3. Rapid scrolling past several figures: never more than 3 live contexts, no figure left running off-screen, no console errors on destroy/re-create.
4. WebGL context loss mid-session (GPU reset): poster returns, reason logged, no exceptions loop.
5. Window resize / phone rotation: canvases resize to their frame, overlay/labels stay aligned, no horizontal scroll at 390 px.

Each is pinned by a test in Tasks 2, 3 and 9.

---

## File map

```
package.json, vite.config.js, index.html, README.md
src/content.js            data only (words, links, entries, contests, figure specs)
src/render.js             renderPage(content, {updated}) -> HTML string; pure, Node-safe
src/main.js               boot chrome + host
src/chrome/copyEmail.js   initCopyEmail(root, email); shouldCopyOnKey(event) (pure)
src/styles/{tokens,base,layout,figure}.css
src/figures/host.js       initFigures(root, {loaders}); pure helpers in src/figures/budget.js
src/figures/budget.js     createBudget(max) -> {acquire(id, distanceFn), release(id), live()}
src/figures/env.js        detectTier(), reducedMotion(), webgl2Available(), fallbackReason()
src/figures/iceberg/*     ported scene + figure.js (create)
src/figures/iceblock/*    ported block + figure.js
src/figures/ring/*        ported ring/tube/worker + figure.js
src/figures/contests/figure.js
public/fonts/*, public/objects/*, public/posters/*, public/resume.pdf
scripts/test-*.mjs, scripts/{prepare-art,posters,check-figures,shoot,perf,lighthouse}.mjs
```

Figure module contract (all figures): `export async function create(el, ctx)` where `el` is the
`.fig-stage` element inside the figure and `ctx = { tier: 'high'|'low', reduced: boolean, log: (msg) => void,
data: object }` (data = the figure's `data-*` JSON). Returns `{ start(), stop(), resize(w, h), destroy(),
readout?: () => string }`. `create` throws on failure (host falls back). The host owns rAF? NO: each figure owns
its own rAF between start() and stop() (simplest to port); host only calls start/stop/destroy/resize.

---

### Task 1: Scaffold, content model, static page

**Files:** Create `package.json`, `vite.config.js`, `index.html`, `src/content.js`, `src/render.js`,
`src/main.js` (stub), `src/styles/{tokens,base,layout,figure}.css`, `public/fonts/*`, `scripts/test-render.mjs`.

**Interfaces:**
- Produces: `renderPage(content, { updated: Date }) -> string` (the `<body>` inner HTML: skip link, header bar,
  main with hero + sections, footer). `content` shape:
  `{ name, email, links: {resume, github, linkedin}, bio: [html strings], hero: {fig}, sections: [{id, title,
  entries: [{title, href?, role, dates, body: [html], tags: [str], fig: {kind, title, stat, caption, poster,
  data}}]}], contests: [{name, year, result, percentile?, placeholder?}], touch: {line, fig} }`.
- Figure markup produced for every fig:
  `<figure class="fig" data-fig="{kind}" data-fig-data='{json}' aria-label="...">` + header
  `<div class="fig-head"><span class="fig-n">Fig. N</span><span class="fig-t">{title}</span><span class="fig-readout" aria-hidden="true"></span></div>`
  + `<div class="fig-stage"><img class="fig-poster" src="{poster}" alt="" width height loading=lazy (eager for hero) decoding=async></div>`
  + `<figcaption><strong>{stat}</strong> <em>{caption}</em></figcaption>`. N assigned in document order.
- Section ids: `work`, `building`, `projects`, `contests`, `contact`. Hero bio links to `#work`, `#building`, `#projects`.

- [ ] **Step 1:** `npm init`-equivalent package.json (`"type":"module"`, scripts `dev`, `build`, `preview`,
  `test: node --test scripts/`), install `three@0.180.0`, dev: `vite@^7.1.5 playwright@^1.63.0 lighthouse@^12.8.2
  sharp@^0.34.5 @fontsource-variable/source-serif-4 @fontsource/ibm-plex-mono`. Copy latin woff2 files
  (Source Serif 4 variable roman + italic, Plex Mono 400 + 500) into `public/fonts/` with their OFL texts.
- [ ] **Step 2: Write failing test** `scripts/test-render.mjs` (node:test):
  - `renderPage(content)` contains exactly one `<h1`, sections with ids work/building/projects/contests/contact in that order;
  - every `<figure class="fig"` has a `.fig-poster` img and `Fig. 1`..`Fig. N` appear in order with no gaps;
  - every entry renders title, `.tags`, a figure; links github/linkedin/resume present in header AND footer;
  - output contains no `—` or `–`; contains `Last updated October 2026` for `updated: new Date('2026-10-10')`;
  - output contains `[TODO:` (placeholders are visible, not hidden).
- [ ] **Step 3:** Run `node --test scripts/test-render.mjs` → FAIL (module missing).
- [ ] **Step 4:** Write `src/content.js` with spec section 4 content. Copy rules: bio ≤ 3 lines, plain verbs, no
  invented numbers. BTTRURSLF facts only from its CLAUDE.md/showcase README (Vite + vanilla ES modules, three.js,
  Supabase accounts, Gemini behind a server layer with keys server-side, on-device MediaPipe face/body
  measurement, bot protection: same-origin gate, per-route rate limits, honeypot, proof of work; Playwright
  visual checks). Every metric/role/date Warren hasn't given = `[TODO: ...]`. Figure stats = `[TODO: stat]`.
  Figure specs: hero `{kind:'iceberg', title:'Ascent', poster:'/posters/iceberg.webp'}`; entries
  `{kind:'iceblock', data:{object:'/objects/<slug>.webp', shape:'knowledge'|'physique'|'face', label:'<NAME>', accent}}`
  with slugs `window-blind` (BC Window Coverings), `summit-flag` (BTTRURSLF), `archer-bow` (Archer Hero);
  contests `{kind:'contests'}`; touch `{kind:'ring', data:{initials:'WS', objects:[slug...]}}`.
- [ ] **Step 5:** Write `src/render.js` and the Vite plugin in `vite.config.js` (`transformIndexHtml` replaces
  `<!--content-->`; imports content via `server.ssrLoadModule` in dev so edits hot-reload, plain import at
  build). `index.html`: lang en, meta description, theme-color #f4f3ee, preload Source Serif roman woff2,
  `<link rel="icon">` (simple inline SVG "W" data URI is fine).
- [ ] **Step 6:** CSS per spec section 3 (tokens, layout 1180 column, hero 5/12 + 7/12, entry grid 5fr/7fr gap
  86px, < 860px single column with 20px gutters, plate with 6px radius and hairline). Hero track: `.hero` is
  `min-height: 160svh` on ≥ 860px with `.hero-fig { position: sticky; top: 76px }`.
- [ ] **Step 7:** `node --test scripts/test-render.mjs` → PASS; `npx vite build` succeeds; `dist/index.html`
  contains the rendered sections.
- [ ] **Step 8:** Commit "Scaffold page, content model and static render".

### Task 2: Top bar and email copy

**Files:** Create `src/chrome/copyEmail.js`, `scripts/test-chrome.mjs`. Modify `src/main.js`, `src/styles/layout.css`.

**Interfaces:** Produces `shouldCopyOnKey(e) -> boolean` (pure: true only for key `e`/`E`, no ctrl/meta/alt,
not `repeat`, target not input/textarea/select/contenteditable) and `initCopyEmail(root, email) -> () => void`
(binds every `[data-copy-email]` button and the key; returns cleanup). Status text node `[data-copy-status]` with
`aria-live="polite"`.

- [ ] **Step 1: Failing tests** (node:test with plain objects as events): `shouldCopyOnKey({key:'e'})` true;
  `{key:'E'}` true; `{key:'e', ctrlKey:true}` false; `{key:'e', metaKey:true}` false; `{key:'e', altKey:true}` false;
  `{key:'e', repeat:true}` false; `{key:'e', target:{tagName:'INPUT'}}` false; `{key:'e', target:{isContentEditable:true}}` false.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. Copy via `navigator.clipboard.writeText`; on rejection or
  absence, select the email text node and show "Press Ctrl+C to copy" (Cmd on Mac). Success shows "Copied" 1.6 s.
  The button label is the email address itself (as Jerry's), with hint text in Get in touch: "Click to copy, or press e anywhere."
- [ ] **Step 4:** Bar gets `.is-scrolled` hairline via an IntersectionObserver sentinel at the top (no scroll listener).
- [ ] **Step 5:** Run tests → PASS. Manual: `npm run dev`, press e, click button. **Step 6:** Commit.

### Task 3: Figure host, budget, fallbacks

**Files:** Create `src/figures/budget.js`, `src/figures/env.js`, `src/figures/host.js`, `scripts/test-budget.mjs`.
Modify `src/main.js`.

**Interfaces:**
- `createBudget(max) -> { acquire(id, distance: () => number): string[] /* ids to evict */, release(id), live(): string[] }`.
  When acquiring beyond `max`, returns the ids with the largest current distance (excluding the acquirer).
- `fallbackReason({ webgl2, reduced, saveData, forced, kind }) -> string|null` — returns `'forced'` (?static=1),
  `'no-webgl2'`, `'save-data'`, `'reduced-motion'` (for kinds iceberg, iceblock, ring), else null. Contests never falls back.
- `detectTier() -> 'high'|'low'`: low if `innerWidth < 860` or `(pointer: coarse)` or `hardwareConcurrency <= 4`; `?tier=low|high` overrides.
- `initFigures(root, { loaders: { iceberg, iceblock, ring, contests } })` where each loader is `() => import(...)`.
  Lifecycle per figure: IO near (rootMargin `100% 0px`) → create (if budget allows; evictees destroyed);
  IO visible (threshold 0) → start, not visible → stop; IO far (rootMargin `250% 0px`) leaving → destroy.
  `resize` via ResizeObserver on `.fig-stage`. On `webglcontextlost` from any canvas inside: destroy, restore
  poster, log `'context-lost'`, do not recreate for 5 s. Canvas added with class `fig-canvas`, fades in (opacity
  .4 s) only after the figure calls `el.dispatchEvent(new Event('fig:ready'))` on its first frame; poster then
  `aria-hidden`. Readout: if instance has `readout()`, host writes it into `.fig-readout` at most 4×/s while running.
  `?fps=1`: small fixed meter showing fps of running figures (dev aid used by perf script via `window.__figStats`
  = `{ [id]: { frames, dtSum, dtMax } }`, always collected, cheap).
- Every fallback: `console.info('[fig:' + kind + '] fallback: ' + reason)` exactly once per figure.

- [ ] **Step 1: Failing tests** `scripts/test-budget.mjs`: with max 3, acquiring a,b,c returns `[]`; acquiring d
  with distances a=5,b=1,c=3,d=0 returns `['a']`; `release('b')` then acquiring e returns `[]`; `live()` never
  exceeds 3 after evictions are released. `fallbackReason` table: forced beats everything; reduced → `'reduced-motion'`
  for iceberg/iceblock/ring, null for contests; no webgl2 → `'no-webgl2'`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement budget.js/env.js/host.js. **Step 4:** Tests PASS.
- [ ] **Step 5:** Manual check in dev: the contests stub mounts through the host and `?static=1` logs nothing for it (contests never falls back). **Step 6:** Commit.

### Task 4: Art pipeline (objects, silhouettes, placeholder posters, résumé placeholder)

**Files:** Create `scripts/prepare-art.mjs`, outputs `public/objects/{window-blind,summit-flag,archer-bow}.webp`
(≤ 1024 px, alpha), `public/objects/*-sample.png` (256 px silhouette: alpha = coverage, RGB = shading, same format
as source `*-sample.png`), `public/resume.pdf` (one page "Résumé [TODO: replace with Warren's résumé PDF]").

- [ ] **Step 1:** prepare-art reads `design/art-src/*.png`. If the image has no real alpha (corner pixels opaque),
  key the background: flood-fill from the borders over pixels within ΔE < 12 of the corner colour, feather 1.5 px.
  Trim to content + 4 % margin, square-pad, write webp (q 86) and the 256 px sample PNG.
- [ ] **Step 2:** Verify: each webp has transparent corners and a non-empty opaque centre (script asserts and
  prints coverage %, expect 15-70 %). View the three outputs.
- [ ] **Step 3:** Placeholder posters: write a neutral plate-coloured `public/posters/{iceberg,iceberg-under,ws,
  window-blind,summit-flag,archer-bow}.webp` (real stills replace them in Task 9). Résumé PDF via Playwright
  `page.pdf`. **Step 4:** Commit.

### Task 5: Fig. 1 iceberg

**Files:** Copy+adapt from source `src/screens/intro/` → `src/figures/iceberg/{icebergScene.js,berg.js,water.js,
terrain.js,overlay.js}`; create `src/figures/iceberg/figure.js`, `scripts/test-berg.mjs` (port of
`scripts/check-iceberg-blocks.mjs`).

**Interfaces:** Consumes host contract. `IcebergScene` gains `setDepth(d: number /*0..1*/)` and constructor
option `{ dpr, tier }`; `figure.js` `create(el, ctx)` returns `{start, stop, resize, destroy, readout}` where
`readout()` returns camera height vs waterline in scene units formatted `+2.4 m` or `-6.1 m` (ASCII hyphen-minus, never U+2212).

- [ ] **Step 1:** Port berg invariant test; run → PASS against copied berg.js (unchanged geometry).
- [ ] **Step 2:** Copy scene files; strip per port notes "Strip" list; replace composer with direct
  `renderer.render` (bloom off); end state applied once (Ascent `T.end` values); keep hover, pulse, wind.
- [ ] **Step 3:** Depth: `setDepth(d)` eases (critically damped, ~0.25 s) camera y and target y from the
  current pose (d=0) to y ≈ -9 / target ≈ -7 (d=1); CAM_MIN_Y relaxed to -12; camera z stays ≥ FRONT_Z + 8.
  Fix the going-under gotchas: water surface `side: DoubleSide` (or skip it when camera is under), reflection
  pass skipped when camera y < 0.
- [ ] **Step 4:** Recolour per spec 5 "Fig. 1": sky/fog/loader toward `#e9ecee`..`#f4f3ee`, overlay ink
  `#17191c` with no dark halos (paper halo instead), additive white decorations → NormalBlending ink at low
  alpha or removed. Check the frame edge blends into the plate (#fbfbf8) without a hard seam.
- [ ] **Step 5:** `figure.js`: canvas + overlay canvas inside `el`; pointer NDC from the canvas rect,
  `pointerleave` → null; depth progress each frame: desktop from `.hero` rect (`p = clamp(-top / (height - innerHeight))`),
  phone from the figure rect (`p = clamp((0.7*innerHeight - top) / (0.7*innerHeight))`); tier low → dpr 1, lowRefl,
  decorations off; adapt step-down at > 22 ms avg over 60 frames. Dispatch `fig:ready` after first frame.
- [ ] **Step 6:** Reduced motion is handled by host fallback (poster). Add the cross-fade: when reduced, host
  shows `iceberg.webp` and swaps to `iceberg-under.webp` with a 400 ms opacity cross-fade when the hero progress
  passes 0.5 (IntersectionObserver on a sentinel at 50 % of the hero track). Implement in figure host as a
  `poster2` option from content (`fig.posterUnder`).
- [ ] **Step 7:** Verify live in the browser at 1440x900 and 390x844: hover opens blocks, scrolling sinks the
  camera through the waterline into the cross-section, readout changes sign; no console errors. Commit.

### Task 6: Ice-block figures

**Files:** Copy+adapt from source hub → `src/figures/iceblock/{block.js,shapes.js,textures.js,noise.js,
background.js,scramble.js}`; create `src/figures/iceblock/{figure.js,label.js,figure.css}`.

**Interfaces:** `create(el, ctx)` with `ctx.data = { object, shape, label, accent }`; `readout()` → `yaw 12°`.
`label.js`: `createLabel(el, text) -> { place(anchor: {x,y}, w, h), in(now), update(now): boolean, destroy() }`
(SVG leader polyline + ScrambleLine, geometry from hud.js place(): rule ≥ 128 px (min(128, w*0.2) on phone) then
45° elbow onto the anchor).

- [ ] **Step 1:** Port files; strip per notes; slim scene: renderer (antialias, alpha false, NoToneMapping,
  dpr ≤ 1.5 high / 1 low), camera fov 30 z 12, RoomEnvironment PMREM, the 4 lights, no composer/bloom.
- [ ] **Step 2:** Recolour: background quad gradient paper-fog `#eef0f1` centre → `#e3e6e8` edge, no text/dots;
  fog `#e6e9eb`; edges/wire/lines ink `#17191c` normal blending α .18-.3; glints removed; rim kept subtle;
  attenuation/deep patches kept (ice reads darker than its fog by design).
- [ ] **Step 3:** Drag orbit: pointerdown (capture) → yaw += dx/max(320,w)*2.6 clamped ±39°, pitch ±12°,
  release → spring back over ~0.8 s; keyboard ← → ↑ ↓ when the figure is focused (figure gets `tabindex=0`
  and caption hint "Drag or use arrow keys to turn it."). Cursor lean kept. `touch-action: pan-y` on the stage so
  vertical page scroll still works on phones.
- [ ] **Step 4:** Label scrambles in on first `start()` (not reduced). Readout live.
- [ ] **Step 5:** Verify each of the three figures live (object visible inside ice, drag works, label lands on
  the block's top-left anchor), resize realigns label. Commit.

### Task 7: Get in touch ring + particles

**Files:** Copy+adapt → `src/figures/ring/{ring.js,ringGeometry.js,tube.js,tubeShapes.js,hubWorker.js,work.js,
textures.js(stone part),noise.js}`; create `src/figures/ring/figure.js`, `scripts/test-ws-shape.mjs`.

**Interfaces:** `create(el, ctx)` with `ctx.data = { initials: 'WS', objects: [{slug, sample}] }`. Instance adds
`show(index: number|null)` (null → initials). `figure.js` binds `[data-morph]` links in the contact section
(`data-morph="0..2"`) on pointerenter/focus → `show(i)`, pointerleave/blur → `show(null)`, debounced 120 ms.
`initialsDataUrl(text, size=512) -> string` exported from figure.js (canvas text, white fill, transparent bg,
bold serif).

- [ ] **Step 1: Failing test** `test-ws-shape.mjs`: `grow()` (pure, from tubeShapes.js) on a synthetic RGBA
  "W"-like mask (two rectangles) with n=2000 returns 2000 points all with |x| ≤ 2.5 and 0 ≤ y ≤ 2.0, sorted by y.
  Run → FAIL until ported; then PASS.
- [ ] **Step 2:** Port ring: OUTER + INNER only, no B logo, no dive/deep rings/pedestal; time-driven
  `asm` 0→1 over 1.6 s then `ign` 0→1 over 1.2 s after first start; ignite for paper: rim emissive in accent
  `#1f5f78`, band/lines/sparkles NormalBlending ink/accent, no bloom/clamp.
- [ ] **Step 3:** Port tube particles only (no pedestal/column/ceiling/words): n = 48000 high / 20000 low,
  uFogColor = plate colour, rest colour slate → cap light end at (.55,.58,.62), glow/lift toward accent. Shapes:
  initials (kind 'logo') + three objects (kind 'object', `/objects/<slug>-sample.png`) grown in the worker;
  worker failure → main-thread grow with a log line. Uses `antialias: true` (alphaToCoverage).
- [ ] **Step 4:** Composition: ring centred, particles inside the ring, camera framed for the ~1000×520 stage
  (phone: square-ish 390×360). Pointer trail optional (keep if cheap).
- [ ] **Step 5:** Verify live: ring assembles + ignites once, WS forms, hovering/focusing each project link
  morphs to its object and back. Commit.

### Task 8: Contests chart

**Files:** Create `src/figures/contests/figure.js`, `scripts/test-contests.mjs`. Uses the **dataviz** skill
(load it before writing chart code).

**Interfaces:** `buildContestsSvg(rows, { width, height }) -> string` (pure). Rows with `placeholder: true` or
missing `percentile` are excluded from marks. Empty → returns the empty-state markup with text
"Contest results go here. Add them to contests in src/content.js."

- [ ] **Step 1: Failing tests:** empty rows → contains the empty-state text and no `<circle`; rows
  `[{name:'A', year:2024, percentile:92.5}, {name:'B', year:2025, percentile:71}]` → 2 circles, an x axis with
  2024 and 2025, `<title>` per mark "A, 2024: top 7.5%"; placeholder rows ignored.
- [ ] **Step 2:** FAIL → implement (dot plot, accent dots, hairline axes, mono tick labels, no background
  tracks) → PASS. `create(el)` renders it responsively (re-render on resize). Commit.

### Task 9: Real posters, verification scripts, perf, Lighthouse, README, guidelines review

**Files:** Create `scripts/posters.mjs`, `scripts/check-figures.mjs`, `scripts/shoot.mjs`, `scripts/perf.mjs`,
`scripts/lighthouse.mjs`, `README.md`, `design/perf.md`, `design/shots/*`.

- [ ] **Step 1:** `posters.mjs`: start `vite preview`, headed Chromium (GPU) per figure with `?poster=<kind>`
  hook (host: renders that figure at a fixed state, sets `window.__posterReady`), screenshot the stage → webp
  into public/posters (iceberg above + under, each block, ring "WS" + each object). Rebuild.
- [ ] **Step 2:** `check-figures.mjs` (Playwright, against `vite preview`), asserts and prints PASS/FAIL per line:
  - live: each figure scrolled into view gets a `.fig-canvas` with non-uniform pixels (readPixels via
    `canvas.toDataURL` sampled in page), and `__figStats[id].frames > 30`;
  - budget: scroll top→bottom in 200 px steps; at every step count of live canvases ≤ 3; no page errors;
  - off-screen figures stop (frames do not increase while out of view for 1 s);
  - fallback: `?static=1` → no canvases, posters visible, one `fallback: forced` log per WebGL figure;
    launch with `--disable-gpu --disable-webgl`... (use `--disable-webgl2`) → `fallback: no-webgl2` logs;
  - context loss: call `WEBGL_lose_context.loseContext()` on the hero canvas → poster back, `context-lost` logged;
  - reduced motion (`reducedMotion: 'reduce'`): no canvases for iceberg/iceblock/ring, labels not scrambled,
    iceberg poster cross-fades to under-water poster after scrolling half the hero;
  - email: click copies (grant clipboard permissions) and status says "Copied"; `e` in body copies; deny
    permission → "Press Ctrl+C to copy";
  - 390×844: `document.documentElement.scrollWidth <= 390` at top, mid, bottom; resize 390→844 wide keeps labels aligned (label anchor within 8 px of block anchor).
- [ ] **Step 3:** `shoot.mjs`: 1440x900, 1920x1080, 390x844: top of page, each section, full page →
  `design/shots/<w>x<h>-<name>.png`. Read every shot and fix what looks wrong.
- [ ] **Step 4:** `perf.mjs`: headed Chromium with GPU at 1440x900, for each figure in view 5 s, report avg fps
  and p95 frame time from `__figStats` → `design/perf.md`. Target ≥ 58 avg on this laptop; if below, step
  quality and re-measure.
- [ ] **Step 5:** `lighthouse.mjs` desktop preset on `vite preview` → performance score printed and saved to
  `design/lighthouse.json`. Target ≥ 85. If below: delay hero WebGL creation until `load` + idle (2 s timeout)
  and/or first interaction.
- [ ] **Step 6:** Web Interface Guidelines review (`web-design-guidelines` skill: fetch rules, review
  `index.html`, `src/**/*.css`, `src/**/*.js`), fix findings. Taste pre-flight (no em dashes, eyebrow count,
  contrast).
- [ ] **Step 7:** README: run (`npm install`, `npm run dev`), build (`npm run build`, `npm run preview`),
  checks (`npm test`, `node scripts/check-figures.mjs`, shoot/perf/lighthouse/posters), how to add a project
  entry (edit content.js, add art to design/art-src, run prepare-art and posters), where TODOs live. Commit.
