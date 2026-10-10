# Project tracks: design spec

Date: 2026-10-10. Status: Warren chose option A (one spec, then one plan per piece) and asked for the
recommended option at every later decision, with no further questions. This spec extends
`2026-10-10-portfolio-design.md`. Everything that spec says still holds unless a section below replaces it.

## 1. Intent

The Work, Building and Projects sections become **tracks**. A track is a tall stretch of page. Its text
column stays pinned while a figure beside it walks through stages as the visitor scrolls. After the last
stage the visitor can play with the figure. The figures are live demos of the projects themselves. They
replace the ice-block figures.

Success means all of these hold:
- All five tracks work end to end, live, under `?static=1` and under reduced motion.
- `npm run check` passes the new promises listed in section 9.
- Lighthouse stays near today's score (performance 100; FCP 0.5 s, LCP 0.6 s, TBT 30 ms, CLS 0).
- Screenshots exist at 1440x900, 1920x1080 and 390x844.
- Side-by-side comparison shots against yuzeli.ca exist at the same three sizes.

The rules carried over unchanged:
- One page. Vite and vanilla ES modules. `three@0.180.0` is the only runtime dependency.
- Figures load lazily. At most 3 WebGL contexts exist at once.
- Every figure has a poster still and a fallback.
- Every unknown fact is a visible `[TODO: ...]`.
- No em dashes in the copy.

Borrowed from yuzeli.ca: techniques and measured numbers only. No image, word or character of Jerry Li's
appears on this page.

### Constraints Warren set, and how this spec meets them without asking him

| constraint | resolution |
|---|---|
| Ask before adding a dependency | No new dependency is added. ffmpeg is already installed system-wide (WinGet, 9.0.2). Scripts that call it skip with a message if it is missing. |
| Ask before generating art | No art is generated. Terrarium and HowPolluted have no marble object yet, so they get programmatic placeholder silhouettes (section 8), listed in the README's TODO table. |
| Ask before putting BTTRURSLF code in this repo | None is put here. BTTRURSLF is shown through captures (frames and numbers). The interactive puzzle card is new code written here. The capture script is our own Playwright script. It drives BTTRURSLF's dev server from outside and never copies or imports a BTTRURSLF file. |
| Ask for Terrarium / HowPolluted marble art | Placeholders until he supplies renders. Listed as a TODO. |
| Ask for Archer Hero release status and player count | Both stay `[TODO: ...]`. |
| Deploying bcwc | Not done: it would publish under Warren's account. See section 5.1. |

## 2. Measured reference (yuzeli.ca, 2026-10-10)

These were measured with Playwright at each size and read from the site's shipped scripts.

| what | value |
|---|---|
| Entry grid | 1440x900: 456 / 638 px, gap 86.4 px, entry padding 79.2 px top and bottom. 1920x1080: 452 / 632 px, gap 96 px. 390x844: one 350 px column, gap 32 px, padding 40 px. |
| Section padding | 122.4 px top at 1440, 128 px at 1920, 64 px at 390. Side gutter 56 px, or 20 px on phones. |
| Sticky text | `.text { position: sticky; top: 96px }` inside each `.entry`. It is `static` at 390 px. |
| Text release | The text stays at top 96 until its bottom meets the bottom of the figure column. Then both move up together. In the 1440 samples, text top 96 / figure bottom 344 becomes text top 9 / figure bottom 224 with the bottoms equal. 1920 shows the same. |
| Feature entry (TopsOJ) | `.entry.feature`. The text spans the full 1180 px, with the title on the left and the body and tags in the right 638 px. Stacked full-width figures follow: a map, an analytics panel, then a pair of charts. Each figure header has a readout with a big real number ("101,950 users"). **There are no tabs today.** Tabs here are Warren's requirement, built in yuzeli's figure-plate style. |
| Pinned hero | GSAP ScrollTrigger pin. Desktop (min-width 881 px): `start: 'top 60px'`, `end: '+=85%'`, `scrub: true`. Phone: `start: 'top 70%'`, `end: 'bottom 30%'`, no pin. |
| Figure intro | Each figure's own trigger runs `start: 'top 85%'`, `end: 'center 45%'` (one figure ends at `center 40%`). Tweens: `power3.out` 1 to 1.6 s for draws; `power2.out` 0.02 to 0.34 s for hover details; staggers 0.006 to 0.04 s. |
| Lazy load | IntersectionObserver with `rootMargin: 120% 0px`, then `import()` of the figure module. |
| Running | `data-running` is set while the figure intersects with `rootMargin: -25% 0px -25% 0px`, i.e. only inside the middle 50% of the viewport. A pulsing LED in the plate header shows it (2.4 s ease-in-out). |
| Entry rule | `--rule` animates 0 to 1 with `scrub: 0.4`, from `top 92%` to `top 55%`. |
| Hero text | Characters rise with a 26 ms stagger. The lede does `fade-up` 0.9 s with a 0.45 s delay. The figure does `fade-in` 1.4 s with a 0.25 s delay. All of this is off under reduced motion. |

What we take:
- the sticky geometry (top 96 px, release on bottom contact, static on phones);
- the 85%-of-viewport scroll length per pinned stage;
- the `top 85%` to `center 45%` intro range on phones;
- the "run only in the middle 50%" rule;
- the plate header with LED and readout;
- the full-width feature layout for BTTRURSLF.

We do not take GSAP (no dependency). Native sticky plus a progress value replaces the pin.

## 3. The track (foundation)

### 3.1 Markup (from `render.js`)

```
<article class="track" id="<slug>" style="--stages:N" data-track>
  <div class="track-text"> h3, meta, body, tags </div>
  <div class="track-rail">
    <figure class="fig fig--track" data-fig="<kind>" ...>
      <div class="fig-head"> LED, Fig. N, title, readout </div>
      <ol class="fig-stages"> one <li><button data-stage=i>label</button></li> per stage </ol>
      <div class="fig-stage"> posters: one <img class="fig-poster" data-stage=i> per stage </div>
      <figcaption> stat, caption, hint </figcaption>
    </figure>
  </div>
</article>
```

`content.js` grows a `stages: [{ label, still, alt }]` list on each track figure. `render.js` emits the stage
stills, which are lazy except stage 0, and the stage list. Fig numbers are still assigned in page order.

### 3.2 Geometry (desktop, min-width 860 px)

The site's existing breakpoint stays at 860 px. yuzeli.ca uses 881 px for its pin and leaves its sticky text
alone below that. 860 keeps one breakpoint across the site.

- `.track`: the existing entry grid, 5fr / 7fr, with the gap and padding the old `.entry` had.
- `.track-text { position: sticky; top: 96px; align-self: start }`. This is the measured value. It releases
  on its own when the track's content box ends. The text column ends level with the rail's bottom, so text
  and figure leave together, exactly as on yuzeli.ca.
- `.track-rail { padding-bottom: calc((var(--stages) - 1) * 85svh) }`. The figure inside is
  `position: sticky; top: 96px`. 85svh per stage is the measured pin length.
- The figure plate is at most `calc(100svh - 96px - 24px)` tall. Its stage keeps its aspect ratio inside
  that, so the whole plate is on screen while pinned at 1440x900 and 1920x1080.
- Feature variant (`.track--feature`, BTTRURSLF only): columns 4fr / 8fr, so the tabbed plate is wider.
  The text is still sticky beside it.
- Without JS (`html:not(.js)`): the rail padding is 0 and every stage still is laid out in flow. The page
  reads like a document.

### 3.3 Geometry (phone, max-width 859 px)

- One column with the text above the figure. Nothing is sticky and there is no rail padding.
- Progress comes from the figure's own trip through the viewport: from the figure top at 85% of the
  viewport to the figure centre at 45%. That is the measured yuzeli figure-intro range.
- The stage buttons stay. Tapping one jumps to that stage.

### 3.4 Progress (`src/figures/tracks.js`, new)

No scroll listeners and no scroll-jacking:
- One IntersectionObserver marks each track as visible or not.
- While any track is visible, one rAF loop reads `getBoundingClientRect()` once per visible track per frame
  and computes `p` from 0 to 1. This is the same technique the hero already uses.
- It writes `data-stage` on the track (the stage index is `round(p * (N - 1))`, but changes only after
  crossing the midpoint by 4% to avoid flicker), `aria-current` on the stage button, and a `--p` custom
  property.
- It exposes `progressOf(fig)` to the host. The figure reads it through `ctx.progress()`.
- Clicking a stage button calls `scrollTo` to that stage's scroll offset (smooth unless reduced motion).
  This is native scrolling. The visitor can always scroll past.

`ctx` gains `progress()` (0 to 1), `stage()`, `stages` (the count) and `onStage(fn)`. Figures pull progress
each frame. Nothing is pushed.

### 3.5 Reduced motion, `?static=1` and other lasting fallbacks

- The stage stills stack in `.fig-stage`. Only the still for the current `data-stage` is opaque, with a
  400 ms opacity cross-fade. Under reduced motion it is an instant swap with a 400 ms opacity fade, which is
  the only motion allowed.
- Progress still comes from scroll (tracks.js runs under reduced motion; it only reads positions).
- No live scene, no iframe, no game, no frame sequences.
- The drag and play hints are hidden, as today.

### 3.6 Host changes (`host.js`, `budget.js`, `env.js`)

- **Weighted budget.** `budget.acquire(id, distance, weight = 1)`. The cap is still `MAX_LIVE = 3`, now
  meaning context weight. The bcwc iframe weighs 2 (its /products page opens 2 WebGL contexts). Capture
  figures weigh 0. Eviction stays farthest-first until the weights fit. `mustWait`, `slotRetries` and
  `freeSlots` all count weight. Unit tests cover weights.
- `WEBGL_KINDS` becomes a weight table: iceberg 1, ring 1, terrarium 1, howpolluted 1, archer 1, bcwc 2
  (only while the iframe is attached), bttr 0. The bcwc figure asks the host for its weight-2 slot through
  `ctx.claim()` / `ctx.unclaim()` when it attaches or detaches the iframe. It is not counted while only
  showing frames.
- `fallbackReason` applies to every track kind, including the capture kinds. Under reduced motion even
  frame sequences become stills.
- The `iceblock` kind, its module, posters and tests are removed. `public/objects/` stays because the ring
  uses the sample silhouettes.
- The `?poster=` hook gains `stage=<i>`. `scripts/posters.mjs` shoots one still per stage for the WebGL
  figures (`<slug>-s<i>.webp`). The capture figures take their stills from their capture frames.

### 3.7 Keyboard and scroll safety (every interactive figure)

- No `wheel` listener anywhere calls `preventDefault`. Touch figures use `touch-action: pan-y`. Only an
  on-screen joystick uses `touch-action: none`, and only over its own 120 px circle.
- Keys are listened to on the figure element, not `window`. A figure only reacts to keys while it holds
  focus. `Esc` blurs it. Space and arrow keys get `preventDefault` only while a game is focused and playing.
- Focus is shown with the accent ring, as today.

## 4. Figure plates for tracks

A track plate is the existing plate plus:
- an LED in the header that pulses while running (2.4 s, after yuzeli; off under reduced motion);
- a numbered stage list under the header (mono 12.5 px; the current stage in ink, the others ink-3);
- a readout that describes the current stage (e.g. "stage 2 of 5, ground: water");
- a caption with the bold stat (a `[TODO]` unless real) and an italic sentence.

## 5. The five tracks

Page order: Work (BC Window Coverings), Building (BTTRURSLF), Projects (Terrarium, HowPolluted, Archer Hero),
Contests, Get in touch.

### 5.1 BC Window Coverings (`kind: 'bcwc'`, 5 stages)

What we found:
- bcwc sends no X-Frame-Options and no CSP, and has no frame-busting code. It **can** be iframed.
- But it **is not deployed anywhere**. `bcwc.vercel.app` returns 404, and bcwindowcoverings.com is still
  the old Wix site.
- Building it into a sub-path of this site would need `base` and router `basename` changes in bcwc, plus
  changes to its hard-coded absolute routes, and would ship about 1 MB of React and R3F inside the portfolio.

Recommended fix (recorded for Warren, not performed):
1. Deploy bcwc as it is to Vercel. It needs no header change, because nothing blocks framing.
2. Put the URL in `content.js` (`bcwc.liveUrl`).

If he later adds a CSP, it must include `frame-ancestors 'self' <portfolio origin>`. Until then `liveUrl` is
`null`. The frame's address bar shows `[TODO: deploy bcwc and add its URL]`, and the last stage shows the
final capture frame with that note.

Stages (frame sequences captured from bcwc's own `vite preview` of its `dist/`):

| stage | label | content |
|---|---|---|
| 1 | Loader | Home with `?intro` and `navigator.webdriver` masked so the loader plays. The loader runs to the blinds lifting. |
| 2 | Blind transition | A click on the Products link plays the "shading" WebGL blind transition into /products. |
| 3 | Time of day | `#ctl-time` sweeps from 6 to 21.5, so light moves across the room. |
| 4 | Blind | The blind range sweeps from 0 to 100 and back to 45. |
| 5 | Try it | The live iframe of `liveUrl + '/products'` (weight 2), fully interactive. |

- The frame is a browser-window chrome drawn in CSS: three dots, an address field and a reload button. The
  address field shows the real URL, or the TODO.
- The iframe is created only when stage 5 is within 1 viewport, the figure is near, and `liveUrl` is set.
  It gets `loading="lazy"`, `title`, and `sandbox="allow-scripts allow-same-origin allow-forms allow-popups"`.
  The capture frame stays over it until it fires `load`, then cross-fades out. It is removed when the
  figure is destroyed by the far rule.
- **Scroll trapping.** The iframe starts with `pointer-events: none`. A transparent cover button says
  "Click to use the site". So the wheel scrolls the page and drags pass to the page.
  - A click removes the cover and focuses the iframe.
  - The frame is released (cover back) on `pointerleave` of the plate, on the page's `Esc`, when the
    figure leaves the viewport, or by a "Done" button in the chrome.
- Dev and check override: `?bcwc=<url>` is accepted only for `http://localhost:*` and `http://127.0.0.1:*`.
  It lets `npm run check` test the real iframe against bcwc's local preview.
- Facts for the text come from bcwc's README and package.json:
  - Vite, React, TypeScript, three.js through R3F, GSAP and Lenis;
  - seven procedural blind types;
  - a solar model at 49.17°N;
  - a WebGL blind transition per route;
  - prerendered HTML.
- Role, dates and a result number stay `[TODO]`.

### 5.2 BTTRURSLF (`kind: 'bttr'`, feature track, 6 tabs, 15 stages)

The source is private. Nothing from `BTTRURSLF-v2` is copied into this repo. What ships here:
- WebP frame sequences and stills captured from its dev server, which show its screens the way any
  screenshot would;
- a JSON cursor path and stage timings;
- numbers.

The capture script lives in `scripts/capture/bttr.mjs`. It:
- reads BTTRURSLF through its running dev server only;
- runs with `GEMINI_API_KEY=''`, signed out, using `/?preloader=0&intro=0&account=0&sky=…&time=day#…`,
  with localStorage seeded the way BTTRURSLF's own shoot scripts document;
- uses `fake-supabase.mjs` (started from the BTTRURSLF folder as a separate process) only if a screen
  turns out to need an account. The survey found none of the five needs one.

Layout:
- The tabs form a row in the plate header (`role="tablist"`).
- Scrolling the track walks through the tabs in order. Each tab owns a contiguous run of stages.
- Clicking a tab scrolls to its first stage.
- On phones the tab row scrolls sideways inside the plate (never the page), and tapping a tab jumps to it.

| tab | stages | content |
|---|---|---|
| Appearance | 3 | (1) The dashboard's puzzle pieces wipe and unfold open (BTTRURSLF's timing is 600 ms wipe and 1200 ms unfold). (2) A scripted cursor glides to Mereum's bulb (`.mer__ask`, which is the control that makes him talk; clicking his figure itself does nothing) and clicks. (3) Talk pose, the line types out at 30 ms per letter, and the action card with "Let’s go" appears. After stage 3, a grid of rebuilt puzzle cards (new code here, using capture crops as card faces) sits over the final frame, and the visitor hovers or focuses a card to flip it. |
| BTTRshop | 4 | Ice blocks float up through fog, the stone ring assembles, the particle B forms, then the market grid. These come from `#/shop` using its documented `?at=` jumps, with frames recorded along its scroll. |
| Motivator | 3 | Hub cards, the Quotes deck, the Edits feed (muted). |
| Knowledge & Sociability | 2 | Ping's Knowledge screen (seeded chat state), then Sociability practice. |
| BTTRmap | 2 | The route draws itself across BTTRcity (from its intro, recorded), then the finished map. |
| Stats | 1 | A TopsOJ-style stats panel (see below). |

Fake cursor:
- It is drawn by the portfolio (an SVG arrow), not burned into the frames.
- Its position per frame comes from `cursor.json`, recorded from the Playwright mouse path in page
  coordinates, then scaled.
- A click shows a 200 ms ring.

Frame budget:
- Each stage is at most 48 frames at 1280 px wide, WebP quality 72, about 1.5 to 3 MB per tab.
- Frames load progressively, every 8th frame first, and only for the active tab plus its neighbour.
- Frames go into `public/captures/bttr/<tab>/` with a `manifest.json` (frame count and size per stage, the
  still for each stage, and the cursor path).

Stats panel:
- **Accounts.** `scripts/bttr-stats.mjs` (`npm run stats`, also run by `prebuild`) reads BTTRURSLF's `.env`
  with a 10-line parser (no dotenv). It sends `HEAD {VITE_SUPABASE_URL}/rest/v1/profiles?select=id` with
  `Prefer: count=exact` and the service-role key as `apikey` and Bearer, and reads `content-range`. No
  supabase-js is needed.
- It writes `src/data/bttr-stats.json`: `{ accounts, accountsAsOf, routes, apiRoutes, testFiles, tests,
  screens, measuredAt }`.
- The key is held in a local variable only. It is never logged, written or bundled. A unit test asserts that
  the JSON and `dist/` contain no `eyJ`-prefixed token.
- If the request fails, `accounts` stays `null` and the panel shows `[TODO: account count]`.
- If BTTRURSLF is not on disk (another machine or CI), the script keeps the existing JSON and exits 0.
- **Repo counts.** These are computed by the same script from BTTRURSLF's files (counts only):

  | count | method | survey value |
  |---|---|---|
  | client routes | entries in the router table in `src/main.js` | 32 |
  | API routes | entries in the `ROUTES` table in `server/guard.js` | 31 |
  | test files | `scripts/test-*.mjs` | 15 |
  | test cases | `test(` calls in those files | about 502 |
  | screen modules | folders in `src/screens/` | 13 |

  Each number shows with its method in the caption. No analytics are invented.
- Shown as large figures in the plate, in the style of yuzeli's readouts: "N accounts as of <date>", and so
  on.

### 5.3 Terrarium (`kind: 'terrarium'`, 5 stages, 1 context)

The source is `C:\Users\Warren\Downloads\terrarium`, read only, at commit `7612a40`. It is ported into
`src/figures/terrarium/`, with a header on each file naming its source path and commit. Warren is the sole
author and it uses the same three.js version as this repo.

What is ported:
- the pure seeded sim (`sim/`, about 1,000 lines);
- a slim worker (init, step, speed, inspect, reset; CPU sensor only, so it is deterministic);
- the jar renderer (`live/`: stage, jar, terrain, creatures, ik, lod, look, food, particles, grade, camera);
- the river streamgraph and the brain visualisation (2D canvas).

Seed `20261010`, count 300 on the high tier and 160 on the low tier.

| stage | label | content |
|---|---|---|
| 1 | The jar | The camera settles on the glass jar, moss and creatures at 1x. |
| 2 | Generations | The sim fast-forwards at 16x while the readout counts generations. Its target generation rises with p: up to the generation that seed reaches at 3,600 steps. |
| 3 | Species split | The river streamgraph slides up over the lower third of the plate and draws in with p. |
| 4 | Brains | The brain view opens for one featured creature. Its genome at generation 0 sits beside the same lineage's current genome. |
| 5 | Your turn | Drag to turn the jar (orbit, damped). Click a creature to open its brain. Keys 1, 2 and 3 set the speed while the figure is focused. |

- **Scrubbing.** The streamgraph is precomputed in Node from the same seed and count by
  `scripts/terrarium-history.mjs` and saved as `public/terrarium/history.json`. It scrubs exactly with p in
  both directions.
- The live jar only moves forward. Scrolling back to stage 1 resets the world from the seed, which is cheap.
- **Budget.** One WebGL context. The 2D canvases do not count.
- Low tier: no MSAA target, smaller DPR, fewer creatures.
- Textures: `moss-floor.webp` and `room-backdrop.webp`, about 640 KB, loaded lazily.

### 5.4 HowPolluted (`kind: 'howpolluted'`, 5 stages, 1 context)

The source is `C:\Users\Warren\projects\HowPolluted` at commit `80f6d06`, read only, and its dev server is
never run. It is ported into `src/figures/howpolluted/`, with headers naming the source and commit, and with
`docs/port-notes/howpolluted.md` listing every ported file and its source path so it can be updated later.

What is ported:
- `globe.js` (adapted to three 0.180);
- `litter-sim.js`, `grades.js`, `terrain.js` and `types.js` (pure);
- `litter.js` (2D canvas, adapted: no router, no hint, no global skip; drag, flick and pick-up hit-testing
  added);
- `card.js` (no Explain button);
- `parallax.js`;
- the needed CSS and tokens.

Art and fonts (Warren's own, OFL fonts with their licence texts):
- plates: land-1280, water-1280;
- fg-land, fg-water, oil, chemical, the 24 trash sprites, manifest.json;
- earth-2k, land-mask.png;
- Archivo Expanded and Montserrat, loaded through `FontFace` only when the figure loads, so first paint is
  untouched.

Honesty:
- No `/api` calls and no live data.
- Land or water comes from sampling `land-mask.png` at the point. That is a real lookup of the mask, so the
  readout says "from the land mask".
- The litter value is a fixed demo value: 9% coverage on land and 6% slick on water. It is labelled
  everywhere a number or grade shows: on the card, in the readout and in the caption, as "Demo, not a
  measurement".
- Grades use HowPolluted's own `gradeFor('litter', value)` with its five labels.

| stage | label | content |
|---|---|---|
| 1 | Globe | The globe spins and flies to a fixed demo point (Richmond, BC, 49.17°N, 123.14°W), and the pin drops. |
| 2 | Ground | The mask sample is taken. The readout shows "ground: land" or "ground: water", and the scene's plate fades in. |
| 3 | Trash falls | Pieces fall and pile up to the demo coverage (`planPile`, seeded). On water, the slick spreads and pieces bob. |
| 4 | Grade | The result card slides in with the grade, labelled as a demo. |
| 5 | Clean it up | Drag or flick pieces (with simple velocity and friction, inside the plate). Click a piece to pick it up. Coverage recomputes with `pileCoverage` and the grade updates live. A land/water switch, and a "Globe" button that brings the globe back so the visitor can spin it and click anywhere: the mask decides land or water there. |

The globe and the scene share one plate. The globe's single renderer stays alive, hidden, while the scene
shows. That is one context.

### 5.5 Archer Hero (`kind: 'archer'`, 4 stages, 1 context)

All new code in three.js. It matches the look of `design/reference/archer/archer-gameplay-1.png`, the only
image in that folder. There are no Roblox assets, logos or UI art. Every model is built procedurally from
flat-shaded low-poly primitives.

The world and the characters:
- A third-person camera behind the archer, with a dirt path through a green valley: cliffs, low-poly trees
  (blocky broadleaf and pines), fences, red-capped mushrooms, grey rocks and grass tufts, under a sky
  gradient with clouds.
- Enemies are low-poly beasts. Each has a "Lv. N" tag and a health bar (sprites or a DOM overlay projected
  each frame).
- The archer auto-aims at the nearest enemy inside the attack radius. The radius is a translucent red disc
  on the ground. The current target gets a white ring, arrows are projectiles, and floating damage numbers
  rise and fade.

The HUD, in DOM over the canvas (original styling in the same spirit, no copied UI art):
- "Stage 1" with "N left" at the top;
- coins at the top left;
- a bottom panel with health "100/100" and a "Your level" XP bar;
- a Q Dodge button and an E Arrow rain button with cooldown rings (SVG stroke-dashoffset).

Controls:
- WASD or the arrow keys move.
- The mouse turns the camera through Pointer Lock after "Click to play". `Esc` releases the lock (the
  browser's own behaviour), and a second Esc blurs the figure.
- Touch: a left on-screen stick, dragging the right half to turn, and tappable Q and E.

Stages:

| stage | label | content |
|---|---|---|
| 1 | Valley | A camera fly-in along the path, with the HUD fading in. |
| 2 | Auto-aim | Attract mode: a scripted AI walks and clears wave 1. The sim is driven by real time while visible, with a deterministic seed. |
| 3 | Boss | Attract mode reaches the boss. Arrow rain (E) fires once. |
| 4 | Your turn | "Click to play" restarts a fresh short stage: 2 waves and a boss. A win or loss shows a small panel with "Play again" and a link, "Play the full game on Roblox" (the given URL, opening in a new tab). |

- The text body says the full game has 50 stages, bosses, relics and collectibles.
- Release status and player count stay `[TODO]`.
- Performance: one renderer, instanced vegetation, at most about 150 draw calls; DPR 1 on the low tier.

## 6. Content changes (`content.js`)

- Work holds BC Window Coverings (`track`, kind bcwc).
- Building holds BTTRURSLF (`track`, `feature: true`, kind bttr).
- Projects holds Terrarium, then HowPolluted, then Archer Hero (`track`, each with its own kind).
- New bodies are written from each project's own docs:
  - Terrarium from its `CLAUDE.md` and spec: NEAT brains, a seeded pure sim, worker-run, three.js jar.
  - HowPolluted from its `CLAUDE.md` and spec: globe, ESA WorldCover ground detection, litter and spill
    scenes, five grades, the honesty rules.
- Role and dates stay `[TODO]` wherever no source states them.
- The bio stays. It still holds true.

## 7. Get in touch ring

- `touch.fig.data.objects` lists five objects in page order: window-blind, summit-flag, terrarium-jar,
  howpolluted-globe, archer-bow.
- `posterMorph` lists ws-0 through ws-4. The contact list renders all five titles, because it already
  derives them from the entries.
- `scripts/prepare-art.mjs` gains placeholder generation for a missing object. It draws a plain silhouette
  with sharp from SVG (a jar outline, a globe circle), marked as a placeholder. A real render in
  `design/art-src/<slug>.png` replaces it on the next `npm run art`.
- `scripts/posters.mjs` shoots ws-3 and ws-4.

## 8. Files

```
src/figures/tracks.js          progress per track, stage state, stage buttons (no scroll listeners)
src/figures/stills.js          reduced-motion and static stage stills cross-fade
src/figures/frames.js          shared frame-sequence player (progressive load, canvas draw, cursor overlay)
src/figures/bcwc/figure.js     window chrome, frames, lazy iframe, scroll-trap cover
src/figures/bttr/              figure.js (tabs, frames), puzzle.js (new flippable cards), stats.js
src/figures/terrarium/         ported sim/, worker.js, live/, river.js, brain.js, figure.js
src/figures/howpolluted/       ported globe.js, litter*.js, grades.js, terrain.js, card.js, figure.js, *.css
src/figures/archer/            world.js, archer.js, enemies.js, combat.js, hud.js, input.js, attract.js, figure.js
src/data/bttr-stats.json       baked numbers (no secrets)
public/captures/bcwc/, public/captures/bttr/<tab>/   frames, stills, manifest.json
public/terrarium/, public/howpolluted/               ported art, history.json, fonts
scripts/capture/bcwc.mjs, scripts/capture/bttr.mjs   Playwright captures (ffmpeg optional, sharp for webp)
scripts/bttr-stats.mjs, scripts/terrarium-history.mjs, scripts/compare.mjs
docs/port-notes/terrarium.md, docs/port-notes/howpolluted.md, docs/port-notes/captures.md
```

## 9. Checks

`npm test` (Node) adds:
- the weighted budget;
- the track progress maths (pure);
- stage index hysteresis;
- the stats JSON shape and the no-secret scan;
- `gradeFor` and `pileCoverage` (ported tests);
- the sim determinism (the same seed gives the same history hash);
- rendering of tracks (stage lists, stills, `--stages`, TODOs, no em dashes).

`npm run check` adds these, each printing PASS or FAIL:
1. Every new figure goes live (its canvas is painted, or its frames draw) and stops off screen.
   (`__figStats` frame count frozen.)
2. The budget holds: scrolling fast top to bottom and back through all five tracks, the sampled context
   weight (WebGL canvases plus the iframe weight) never exceeds 3.
3. Sticky release at 1440x900, 1920x1080 and 390x844:
   - while a track's figure is on screen, its text top equals 96 ± 1 (desktop);
   - after the rail ends, the text bottom tracks the rail bottom ± 1 and leaves with it;
   - the next track's text takes over;
   - at 390 the text is `static`.
4. No horizontal scroll at the three sizes.
5. The iframe does not trap scrolling. With the bcwc override pointed at bcwc's local preview, which the
   check starts (or SKIP if bcwc is absent): a wheel over the frame before any click scrolls the page.
   After click and release, it scrolls the page again.
6. The game does not trap keys or scrolling:
   - wheel over the game scrolls the page;
   - ArrowDown and Space with the game unfocused scroll the page;
   - focused and playing, they move the archer and the page stays put;
   - Esc releases.
7. `?static=1` and reduced motion: there are no WebGL canvases and no iframe. The stage stills swap as the
   tracks are scrolled, and each fallback logs once.
8. The existing checks keep passing: races, no WebGL2, context loss, email, resize.

Also:
- `npm run perf` adds terrarium, howpolluted and archer to `design/perf.md`.
- `npm run lighthouse` must stay within a few points of today's score.
- `npm run shoot` adds each track at its first and last stage.
- `scripts/compare.mjs` (`npm run compare`) shoots yuzeli.ca and this page at the same three sizes and the
  same section positions (top, first entry, feature entry, a projects entry, contact). It joins each pair
  side by side with sharp into `design/compare/`.

## 10. Build order (one plan per piece)

1. Foundation: tracks, stills, host weights, render, content skeleton, checks for sticky, scroll and budget.
2. HowPolluted.
3. Archer Hero.
4. Terrarium.
5. BTTRURSLF: capture, stats, tabs, puzzle cards.
6. BC Window Coverings: capture and iframe.
7. Ring, posters, README, perf, Lighthouse, shoot, compare.

Each piece ends with `npm test` and `npm run check` green before the next starts.
