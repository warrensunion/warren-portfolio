# Tracks 5: BTTRURSLF Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The BTTRURSLF feature track, a tabbed plate built from captures:
- Appearance: the puzzle cards and Mereum;
- BTTRshop;
- Motivator;
- Knowledge & Sociability (Ping);
- BTTRmap;
- a Stats panel with real numbers baked at build time.

After the Appearance sequence, the visitor flips rebuilt puzzle cards by hovering them.

**Architecture:**
- A Playwright capture script drives BTTRURSLF's own dev server from outside. It records short clips per
  stage, encoded with ffmpeg (already installed) as scrub-friendly video, plus stills and card crops.
- A Node stats script counts accounts through Supabase's REST API with the service-role key, reading only
  in Node. It also counts routes and tests from the repo's files.
- The portfolio ships only media, a manifest and numbers. Not one file of BTTRURSLF source.
- The figure is a frame player (weight 0) with tabs, a DOM puzzle-card overlay and a stats panel.

**Tech Stack:** Playwright, ffmpeg (system, optional at build), sharp, Canvas/DOM, node:test.

**Spec:** `docs/superpowers/specs/2026-10-10-project-tracks-design.md` section 5.2, plus sections 1, 3 and 9.

## Global Constraints

- BTTRURSLF is at `C:\Users\Warren\Downloads\BTTRURSLF-v2`. It is **read only** and private. Never copy,
  import or vendor any of its files or code into this repo. Its art appears only inside captured pixels.
  The capture script may reference its URLs, flags, localStorage keys and CSS selectors (they are needed to
  drive it), but it ships nothing. The capture script and the stats script are the only code that touch it.
- Run its dev server with `GEMINI_API_KEY=''`, signed out, at
  `/?preloader=0&intro=0&account=0&sky=<plate>&time=day#<route>`. Seed localStorage as BTTRURSLF's own
  shoot scripts document (see the survey in the spec), and set viewport 1280x800 with
  `deviceScaleFactor: 1`.
- No AI or Gemini calls. Block every request to `/api/*/chat`, `/api/*/scan`, `/api/*/plan`,
  `/api/explain` and `generativelanguage.googleapis.com` with `page.route` (abort), and log any attempt.
- The service-role key is read from BTTRURSLF's `.env` into a local variable in `scripts/bttr-stats.mjs`
  only. It is never printed, written, bundled or committed. A test scans `src/`, `public/` and `dist/` for
  `eyJ` JWT-shaped strings and for the key's variable name next to a value.
- Media rules:
  - Clips are 960x600, 24 fps, VP9 WebM (`-c:v libvpx-vp9 -crf 36 -b:v 0 -g 4 -keyint_min 4`) plus H.264
    MP4 (`-c:v libx264 -crf 28 -g 4 -pix_fmt yuv420p -movflags +faststart`).
  - At most 4 s per stage.
  - Each tab's total size is at most 2.5 MB.
  - Stills are 1600x1000 WebP at quality 78, and each one is the last frame of its stage.
- Fake cursor: an SVG arrow (our own drawing) injected into the captured page at runtime with
  `addInitScript`. It follows `mousemove` and shows a 200 ms ring on `mousedown`, so it is burned into the
  clip in sync.
- Stage-local clip time: stage s of n has a window `a = max(0, s - 0.5)`, `b = min(n - 1, s + 0.5)`, with
  `x = p * (n - 1)`. Then `u = clamp((x - a) / (0.7 * (b - a)), 0, 1)` and `video.currentTime =
  u * duration`. This goes into `track-math.js` as `clipT(x, s, n)`.
- Stats: show only real numbers, with the date and method under each. If a number is missing, show
  `[TODO: account count]`. Never invent analytics.
- No new dependencies. ffmpeg is invoked as a binary. If it is missing, the capture script fails with a
  clear message. The build never needs ffmpeg or BTTRURSLF.

## Review Focus

1. **A visitor on Safari.** It plays MP4, not WebM, so `<video>` gets both `<source>`s in that order: WebM
   first, MP4 second. Test in Task 4: the rendered video has two sources and the MP4 file exists for every
   stage in the manifest.
2. **Scrubbing while a clip is still downloading.** Seeking before `loadedmetadata` must not throw, and the
   current still covers the video until `seeked` fires once. Test in Task 4's check: throttle the network,
   jump to stage 5, and see no page errors and the still visible until ready.
3. **Clicking a tab on a phone.** The tab row scrolls inside the plate (no page sideways scroll), and the
   tab click jumps to that tab's first stage through the stage override. Test in Task 5's check at
   390x844.
4. **The stats script on a machine without BTTRURSLF.** It keeps the committed JSON and exits 0, and
   `prebuild` never fails. Test in Task 1 (`stats: missing repo keeps old JSON`).
5. **A hover on a puzzle card on touch.** Tap flips it, and tapping again flips it back. Keyboard focus
   flips it too. Test in Task 5's check, with `hasTouch` and `tap`.

---

### Task 1: Stats script

**Files:**
- Create: `scripts/bttr-stats.mjs`, `src/data/bttr-stats.json`, `scripts/test-bttr-stats.mjs`,
  `scripts/fixtures/bttr-fake/` (a tiny fake repo tree for tests: `src/main.js` with a router table of 3
  routes, `server/guard.js` with a `ROUTES` of 2, `scripts/test-a.mjs` with 2 `test(` calls,
  `src/screens/{a,b}/`, and a `.env` with fake values)
- Modify: `package.json` (`"stats": "node scripts/bttr-stats.mjs"`, `"prebuild": "node scripts/bttr-stats.mjs --soft"`)

**Interfaces:**
- `bttr-stats.mjs [--repo=<path>] [--soft] [--out=<path>]` exports
  `countRepo(repo) -> { routes, apiRoutes, testFiles, tests, screens }`, `parseEnv(text) -> object` and
  `countAccounts({ url, key, fetch }) -> number | null`.
  - `countAccounts` sends `HEAD {url}/rest/v1/profiles?select=id` with `apikey`, `Authorization: Bearer`
    and `Prefer: count=exact`, and parses the total from `content-range` (`*/N`).
  - Main writes `{ accounts, accountsAsOf: 'YYYY-MM-DD' | null, routes, apiRoutes, testFiles, tests,
    screens, measuredAt: 'YYYY-MM-DD', methods: { ... one sentence each ... } }`.
  - With `--soft`, any failure keeps the existing file and exits 0.
- Counting rules:
  - routes: entries in the router table in `src/main.js`. Find the table by its shape: `'#/...'` or
    `'/...'` keys mapped to screens. Document the regex in `methods.routes`.
  - apiRoutes: keys of `ROUTES` in `server/guard.js`.
  - testFiles: `scripts/test-*.mjs`.
  - tests: count of `\btest\(` in those files.
  - screens: directories in `src/screens/`.

- [ ] **Step 1: Failing tests:**
  - `stats: countRepo on the fixture gives 3, 2, 1, 2, 2`.
  - `stats: parseEnv reads KEY=value and ignores comments and quotes`.
  - `stats: countAccounts parses content-range`: a fake fetch returns the header `0-0/42`, giving 42. A
    fake fetch returning 401 gives null.
  - `stats: missing repo keeps old JSON` (soft mode, temp out file).
  - `stats: no secret in shipped files`: no `eyJ[A-Za-z0-9_-]{10,}` in `src/` or `public/`, and none in
    `dist/` if it exists.
- [ ] **Step 2: Run** `node --test scripts/test-bttr-stats.mjs`. Expected: FAIL.
- [ ] **Step 3: Implement.** Then run `npm run stats` against the real repo. It prints the counts and
  `accounts: <n>` or `accounts: unavailable (<reason>)`, never the key.
- [ ] **Step 4: Run** the tests. Expected: PASS. Run `git diff src/data/bttr-stats.json` and read it.
- [ ] **Step 5: Commit** `git commit -m "Bake BTTRURSLF's account count and repo counts at build time"`.

### Task 2: Capture harness and the fake cursor

**Files:**
- Create: `scripts/capture/lib.mjs`, `scripts/capture/cursor.js` (the injected overlay, our own code),
  `docs/port-notes/captures.md`

**Interfaces:**
- `lib.mjs` exports:
  - `startDev({ cwd, port, env }) -> { url, stop }`: spawns `npm run dev` in BTTRURSLF with `PORT` and the
    env, and waits for an HTTP 200;
  - `openPage(browser, url, { seed, viewport })` returns a page with the cursor overlay, the AI route
    blocks and seeded localStorage;
  - `recordClip(page, fn, out)`: a fresh context with `recordVideo`, then run `fn`, close, and move the
    webm;
  - `encode(webm, outBase, { trimStart, duration })`: ffmpeg to 960x600 WebM and MP4 with the Global
    Constraints settings, plus a 1600x1000 WebP still of the last frame;
  - `glide(page, from, to, ms)`: eased mouse movement in 16 ms steps.
- Port-notes records:
  - every URL, flag, localStorage key and selector the captures use;
  - BTTRURSLF's commit hash at capture time;
  - the date;
  - "no BTTRURSLF code is in this repository; only recorded pixels".

- [ ] **Step 1: Implement.** As a smoke test, capture one 2 s clip of `#/appearance` into a temp dir,
  encode it, and check that `ffprobe` reports 960x600 at 24 fps with a keyframe interval of 4
  (`ffprobe -show_frames -select_streams v -show_entries frame=key_frame | grep -c key_frame=1` is at
  least 12 for 48 frames).
- [ ] **Step 2: Commit** `git commit -m "Capture harness: drive BTTRURSLF from outside, encode scrubbable clips"`.

### Task 3: Capture the six tabs

**Files:**
- Create: `scripts/capture/bttr.mjs` (`npm run capture:bttr`),
  `public/captures/bttr/manifest.json`, `public/captures/bttr/<tab>/s<k>.{webm,mp4}`,
  `public/stills/bttrurslf-s<i>.webp` (it overwrites the placeholders on purpose),
  `public/captures/bttr/appearance/cards/*.webp`

The stages, matching content.js:
1. **Appearance s0:** `#/appearance` with a fresh context (pieces closed). The cursor glides across the
   pieces so each wipes (600 ms) and unfolds (1200 ms), in a recording of about 3.5 s. Before opening,
   crop each closed `.pz__piece` (PNG, its rect) to `cards/<kind>-closed.webp`.
2. **Appearance s1:** the cursor glides to `button.mer__ask` (eased, 900 ms) and clicks.
3. **Appearance s2:** wait for `.mer__figure[data-pose="talk"]` and the typed line (30 ms per letter),
   then `li.mer__act` with "Let’s go". Record until `data-pose === 'idle'`, at most 4 s. After that, crop
   each open card (`.pz.is-revealed` rects) to `cards/<kind>-open.webp`, and write each card's rect,
   normalised to the 1280x800 frame, into the manifest.
4. **BTTRshop s3 to s6:** `#/shop`, wait for `.shop-hub.is-ready` and `window.__shopHub.ring &&
   __shopHub.tube?.points`. Step `__shopHub.scroll.jump(px)` across each part: blocks from 0 to
   `marks.asm1`, then the ring from asm1 to lit, then B from `tubeMarks.from` to `rest`, then
   `#/shop/market`, with a slow glide over `.shm-grid`. Recording is real time while jumping in 16 ms
   steps. If `!window.__shopHub.scene` (no WebGL headless), relaunch with the GPU args from
   `scripts/lib/preview.mjs`.
5. **Motivator s7 to s9:** `#/motivator` (skip the intro with `.mh-intro__skip`), `#/motivator/quotes`,
   then `#/motivator/edits?tab=daily` (muted), each with gentle cursor motion and one wheel step in edits.
6. **Ping s10 and s11:** `#/knowledge?s=math&tab=picks` with the chat state seeded under
   `bttrurslf:knowledge:v1` (as `scripts/shoot-ping.mjs` does), then `#/sociability?view=practice` seeded
   under `bttrurslf:sociability:v1`.
7. **BTTRmap s12 and s13:** `#/map` with `bttrurslf:map-intro:v1` unset, recording the route drawing on
   `canvas.bmi-canvas`. It runs about 24 s, so record it and time-compress with ffmpeg
   `setpts=PTS/6`, down to 4 s. Then the finished map with the route seeded in `bttrurslf:map-route:v1`.
8. **Stats s14:** no clip. The still is rendered from the portfolio's own stats panel in Task 5.

- [ ] **Step 1: Implement** and run `npm run capture:bttr`. Record BTTRURSLF's HEAD hash in port-notes.
- [ ] **Step 2: Verify**:
  - every manifest entry has its webm, mp4 and still;
  - `du -sh public/captures/bttr/*` shows each tab at most 2.5 MB;
  - the capture log shows zero blocked AI requests attempted (or lists them);
  - Read the 14 stills and check each one shows what its stage label says.
- [ ] **Step 3: Commit** `git commit -m "Capture BTTRURSLF's screens as scrubbable clips"`.

### Task 4: clipT and the frame player

**Files:**
- Modify: `src/figures/track-math.js` (add `clipT`), `scripts/test-tracks.mjs`
- Create: `src/figures/player.js` (shared with bcwc)

**Interfaces:**
- `clipT(x, s, n) -> number` as in Global Constraints.
- `createPlayer(host, { manifest, base, poster }) -> { show(stageIndex, u), preload(stageIndex),
  destroy() }`:
  - one `<video muted playsinline preload="auto">` per stage on demand, each with WebM and MP4 sources;
  - `show` sets `currentTime` (throttled to once per animation frame, and skipped when the change is under
    half a frame);
  - the video is hidden behind the still until its first `seeked`;
  - stages s−1 and s+1 are preloaded, and videos more than 2 stages away are unloaded
    (`removeAttribute('src')` and `load()`).

- [ ] **Step 1: Failing tests:** `clipT: stage 0 plays over x 0..0.35`, `clipT: middle stage plays from
  s-0.5 over 0.7 of its window`, `clipT: last stage ends at 0.7 of its half window`. For example,
  `clipT(0.175, 0, 15) ≈ 0.5`, `clipT(3, 3, 15) ≈ 0.714`, `clipT(14, 14, 15) === 1`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** clipT and player.js.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "A scrubbing clip player for capture figures"`.

### Task 5: The bttr figure: tabs, puzzle cards and stats panel

**Files:**
- Create: `src/figures/bttr/figure.js`, `src/figures/bttr/puzzle.js`, `src/figures/bttr/stats.js`,
  `src/figures/bttr/figure.css`
- Modify: `src/main.js` (loader `bttr`), `src/render.js` (tabs markup for a figure with `data.tabs`: a
  `role="tablist"` row in the head, each `role="tab"` button carrying `data-first-stage`), `src/content.js`
  (tab to first-stage map: Appearance 0, BTTRshop 3, Motivator 7, K&S 10, BTTRmap 12, Stats 14),
  `scripts/check-figures.mjs`, `scripts/shoot.mjs`

**Interfaces:**
- The tab buttons are static markup, so they work without the figure loaded. tracks.js already handles
  `[data-stage]` buttons, so a tab carries `data-stage=<first stage>` and gets `aria-selected` when its
  range contains the current stage. A tracks.js `onStage` subscription in stills.js updates the tabs.
- Once a tab row exists, the stage list shows only the current tab's stages (CSS: stage `<li>`s get
  `data-tab` and `hidden` unless they are in the current tab).
- `puzzle.js`: `createPuzzle(host, { cards: [{ kind, rect:[x,y,w,h] (0..1), closed, open }] }) ->
  { show(bool), destroy() }`.
  - Each card is a `<button class="bp-card" aria-pressed>` over its rect, with CSS 3D: a 600 ms
    `rotateY`, and `transform` plus `opacity` only.
  - Hover, focus or tap toggles the flip.
  - It is shown only at stage 2 once `clipT` reaches 1.
  - Under reduced motion it never loads (stills only).
- `stats.js`: `renderStats(host, stats)` shows big numbers in Plex Mono 44 px with captions in serif,
  modelled on yuzeli's readout style:
  - "<accounts> accounts", with "as of <date>, counted in Supabase" (or `[TODO: account count]`);
  - "<routes> screens you can open", with the method;
  - "<apiRoutes> server routes";
  - "<tests> automated tests in <testFiles> files".
  - The stats tab is DOM, so it also renders in the static and no-JS markup: render.js emits the panel
    from `src/data/bttr-stats.json` as the stage-14 content in place of a still image.
- `figure.js`: weight 0. It uses `createPlayer` for stages 0 to 13 with `clipT`, shows the puzzle at stage
  2, and the stats DOM at stage 14. The readout is `<tab name>, <i> of <n>`.
- Stats still: `npm run posters` shoots the stats panel to `public/stills/bttrurslf-s14.webp`.

- [ ] **Step 1: Write the failing checks** in `checkBttr`:
  1. Clicking each tab moves `data-stage` to its first stage, and the matching tab gets `aria-selected`.
  2. At stage 4, scrolling 20% of a stage changes the visible video's `currentTime`.
  3. At stage 2's end, hovering a `.bp-card` gives `aria-pressed="true"` and a computed transform
     containing a rotation.
  4. The stats tab shows either a number or `[TODO: account count]`, and the dated method lines.
  5. At 390x844 the tab row scrolls inside the plate and the page has no sideways scroll.
  6. No network request goes to any `localhost:5173` or to any host other than the preview's.
  7. With throttled network, a jump to stage 5 gives no page errors and shows the still until `seeked`.
  8. A dist scan finds none of these strings: `mer__ask`, `shop-hub`, `bttrurslf:settings` (they belong to
     the capture script, not the site).
- [ ] **Step 2: Run** and confirm they FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test && npm run check`. Expected: all PASS.
- [ ] **Step 5:** Run `npm run shoot` for the building section and look at the 1440, 1920 and 390 shots.
- [ ] **Step 6: Commit** `git commit -m "BTTRURSLF track: tabs, scrubbed captures, puzzle cards and stats"`.
