# Tracks 6: BC Window Coverings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The BC Window Coverings track. A browser-window frame shows captured clips of the site:
- its loader;
- the blind-opening transition;
- the time-of-day slider;
- the blind slider.

Then it becomes the live site in an iframe that never traps page scrolling. Until Warren deploys bcwc, the
live stage shows a visible TODO.

**Architecture:**
- The capture script drives bcwc's own `vite preview` of its `dist/` (bcwc is Warren's site and public
  once deployed; captures are pixels only).
- `player.js` from plan 5 scrubs the clips.
- A CSS browser chrome wraps the stage.
- The iframe (weight 2 through `ctx.claim(2)`) is created lazily at stage 4 when `liveUrl` is set, behind
  a click-to-use cover.

**Tech Stack:** Playwright, ffmpeg (system), sharp, DOM.

**Spec:** `docs/superpowers/specs/2026-10-10-project-tracks-design.md` section 5.1, plus sections 3.6, 3.7
and 9.

## Global Constraints

- bcwc is at `C:\Users\Warren\Downloads\Projects\bcwc`. **Do not modify it.** Capture runs
  `node <bcwc>/node_modules/vite/bin/vite.js preview --port 4380 --strictPort` with `cwd` bcwc. If its
  `dist/` is missing, stop with a message.
- `content.js` gets `fig.data.liveUrl: null` and `fig.data.liveNote: '[TODO: deploy bcwc and add its URL]'`.
- Dev and check override: `?bcwc=<url>` is honoured only when the URL's host is `localhost` or
  `127.0.0.1`.
- The iframe:
  - is `src = liveUrl + '/products'`;
  - has `title="BC Window Coverings website, live"`, `loading="lazy"`,
    `sandbox="allow-scripts allow-same-origin allow-forms allow-popups"` and `referrerpolicy="no-referrer"`;
  - is created when the stage index is 4 and the figure is visible;
  - calls `ctx.claim(2)` before it is attached, and `ctx.unclaim()` after it is removed.
- Scroll safety:
  - `.bw-cover` is a `<button>` over the iframe saying "Click to use the site". The iframe has
    `pointer-events: none` until the cover is clicked.
  - Release (cover back, `pointer-events: none`) happens on `pointerleave` of the plate, on page `Escape`,
    when the figure leaves the viewport, and on the "Done" button in the chrome.
- Captures are 960x600 for the 1280x800 page viewport, with the same encode settings as plan 5. At most
  4 s per stage, and the total is at most 3 MB.
- The loader plays only when `navigator.webdriver` is false and the session has not seen it. The capture
  masks `navigator.webdriver` with `addInitScript` and uses a fresh context with `?intro`.
- No new dependencies.

## Review Focus

1. **liveUrl is null (today).** Stage 4 shows the last capture frame with the TODO note in the address bar
   and a line over the frame. No iframe and no claim. Test in Task 3's check.
2. **The iframe fails to load** (offline, or the deploy is down). After 10 s without `load`, it shows the
   last frame and "The live site did not load." Then it unclaims. Test in Task 3 with a `?bcwc=` URL to a
   closed port.
3. **The visitor clicks in, then scrolls the wheel inside the frame.** That is intended: the frame
   scrolls. After `pointerleave`, the wheel scrolls the page again. Test in Task 3.
4. **The budget while the iframe is live.** With the hero and ring far away, live weight is at most 3
   (iframe 2 plus at most one other). Scrolling fast from Work to Projects evicts or waits correctly. Test
   in Task 3 (sample `__figWeight`).
5. **Phone.** The iframe at 390 px shows the mobile site inside the frame, and the cover still guards
   scrolling. Test in Task 3 at 390x844.

---

### Task 1: Capture bcwc

**Files:**
- Create: `scripts/capture/bcwc.mjs` (`npm run capture:bcwc`), `public/captures/bcwc/manifest.json`,
  `public/captures/bcwc/s<k>.{webm,mp4}`, `public/stills/bcwc-s<i>.webp`
- Modify: `docs/port-notes/captures.md` (add the bcwc section with bcwc's HEAD hash)

Stages:
- **s0, Loader:** `/?intro` with webdriver masked. Record from navigation until the loader's lift-and-stack
  outro ends (wait for the loader overlay to be removed, at most 6 s, then compress to 4 s if needed).
- **s1, Blind transition:** on `/`, first move the pointer (the WebGL overlay loads after the first input),
  then click the Products link (a `TLink` to `/products`). Record the shading blind transition, about 3 s.
- **s2, Time of day:** on `/products` at step 4 (`?type=<first productId>`, read from the page), sweep
  `#ctl-time` from 6 to 21.5 by `fill`ing values in 0.25 steps every 40 ms.
- **s3, Blind:** sweep the blind range (`[aria-labelledby="ctl-blind-label"]`) 0 to 100 to 45 the same way.
- **s4, Try it:** the still is the `/products` page at rest.

- [ ] **Step 1: Implement** with `scripts/capture/lib.mjs` from plan 5. Run it.
- [ ] **Step 2: Verify** the sizes and Read the five stills.
- [ ] **Step 3: Commit** `git commit -m "Capture the BC Window Coverings site as scrubbable clips"`.

### Task 2: Browser frame and the bcwc figure

**Files:**
- Create: `src/figures/bcwc/figure.js`, `src/figures/bcwc/figure.css`
- Modify: `src/main.js` (loader `bcwc`), `src/content.js` (`liveUrl`, `liveNote`)

**Interfaces:**
- `create(stage, ctx)` returns `{ start, stop, resize, destroy, readout }`.
  - It wraps the stage content in `.bw` (chrome: three dots, the address field showing `liveUrl` or
    `liveNote`, a reload button, a "Done" button visible while engaged), and uses `createPlayer` for
    s0 to s3 with `clipT`.
  - At stage 4 it attaches the iframe, or shows the TODO when `liveUrl` is null.
  - The readout is `stage <i> of 5` (plus `, live` when the iframe has loaded).
- Escape listener: on `document` (keydown, `Escape` only, never `preventDefault`). It releases only.

- [ ] **Step 1: Implement.**
- [ ] **Step 2: Build and verify by eye** with `scripts/_peek.mjs` at 1440, scrolled to stage 2 and stage 4.
- [ ] **Step 3: Commit** `git commit -m "BC Window Coverings track: the site in a browser frame"`.

### Task 3: Checks

**Files:**
- Modify: `scripts/check-figures.mjs` (`checkBcwc`)

- [ ] **Step 1: Write the checks.**
  - Start bcwc's preview on 4380 as in Task 1 (SKIP every iframe line, with a reason, if bcwc's `dist/` is
    absent), and open `url + '?bcwc=http://127.0.0.1:4380'`.
  - At stage 2, scrolling changes the clip's `currentTime`.
  - At stage 4, the iframe exists and `__figWeight() <= 3`.
  - A wheel over the frame (cover on) changes `scrollY`.
  - Click the cover, and the iframe gets pointer events.
  - Move the pointer out, and a wheel over the frame changes `scrollY` again.
  - Escape after clicking in brings the cover back.
  - At 390x844 the same cover check passes.
  - Without the override (liveUrl null): no iframe, and the TODO is visible.
  - With `?bcwc=http://127.0.0.1:9` (closed): "The live site did not load." within 12 s, and
    `__figWeight()` drops.
  - Fast scroll from #work to #projects and back: weight is at most 3 at every sample.
- [ ] **Step 2: Run** `npm run check`. Expected: all PASS.
- [ ] **Step 3: Commit** `git commit -m "Check the bcwc frame never traps scrolling and keeps the budget"`.
