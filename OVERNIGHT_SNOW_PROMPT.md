# Overnight job: "Ascent" — snow & mountain redesign of the portfolio

You are working unattended overnight on Warren Sun's portfolio. Nobody will answer questions until morning.
When something is ambiguous, pick the most reasonable option, mark it **Decision** in the report, and keep going.
Run for as long as it takes to finish every phase. Do not stop early because one part is "good enough".

## 0. Where things are (read before anything else)

- **This repo:** `C:\Users\Warren\Downloads\Projects\warren-portfolio` (Vite + vanilla ES modules + three@0.180.0).
  Read `README.md`, `PORTFOLIO_UPDATE.md`, `src/content.js`, `src/render.js`, `src/main.js`, `src/figures/host.js`,
  `src/figures/tracks.js`, `src/figures/budget.js`, and the `scripts/` folder first. Keep everything that already works:
  the content model, tracks, compact cards, stills, `?static=1`, reduced motion, the WebGL context budget, tests, `npm run check`.
- **Visual reference (techniques only):** https://www.yuzeli.ca/ — open it with Playwright at 1440x900 and 390x844, scroll it
  top to bottom, record a few screenshots into `design/ref-yuzeli/`. `npm run compare` already exists for this.
  Also study https://igloo.inc for the ice/igloo look (ice blocks, frosted glass, hover polygons, snow, cold light).
  **Copy the techniques and the feel, never their code, shaders, assets, text or names.** Everything shipped is written from scratch.
- **BTTRURSLF (the main focus):** live at https://bttrurslf.com. Source: `C:\Users\Warren\Downloads\BTTRURSLF-v2`
  (read its `CLAUDE.md` and the `BUILD_*.md` files for what the product does). Fresh screenshots of the current app are in
  `C:\Users\Warren\claude-videos-build\output-beat\site\` (desktop-*.png and phone-*.png). Real stats come from
  `src/data/bttr-stats.json` / `npm run stats`. The iceberg figure in `src/figures/iceberg` is BTTRURSLF's — reuse and upgrade it.
  Never copy BTTRURSLF source, API keys, selectors or secrets into this repo (the existing no-secrets check must still pass).
- **THE MOST IMPORTANT REFERENCE — BTTRURSLF's shop hub.** Warren's own igloo.inc-style scroll of ice blocks lives in
  `C:\Users\Warren\Downloads\BTTRURSLF-v2\src\screens\shop\hub\` (scene, ice material, fog, scroll, labels, dolly-in,
  glitch/fog dissolve, the stone ring and the 48k-particle B). Read `docs/history/bttrshop.md`, `design-reference/shop/TEARDOWN.md`
  and `design-reference/shop/igloo/`, and `art-src/tools/shop-art.mjs` (how the frosted hero objects and ice shapes were made).
  **Run it and look at it before writing any code:** in BTTRURSLF-v2 run `npm install` if needed, then `npm run dev`, and open
  `http://localhost:5173/?preloader=0&intro=0&account=0#/shop?at=face` with Playwright at 1440x900 and at 390x844. Scroll slowly
  through all seven blocks, past the ring and into the tube, saving a screenshot every few scroll steps into
  `design/ref-bttrshop/` (and a short video if Playwright recording works). Then open https://www.igloo.inc and do the same into
  `design/ref-igloo/`. These two are the quality bar for everything below. Stop the dev server when you're done.
  This is Warren's own code, so port the hub's techniques and shader/material code into this repo freely (as new modules under
  `src/figures/`, rewritten to fit this repo's host/budget system). Don't copy app-only things: no accounts, Supabase, API calls,
  secrets, app selectors or shop data.
- **NEW project to add — Beatcut** (Warren's Claude-wrapper web app that auto-generates beat-synced short-form motion-graphics
  videos: you give it an audio clip, an optional reference video, a description and a style, and it cuts stick-figure snap edits
  on every beat). Source: `C:\Users\Warren\claude-videos-build` (read whatever code and READMEs are there to describe it accurately).
  Outputs: `C:\Users\Warren\claude-videos-build\output-beat\` — `0N-*-post.mp4` (finished videos), `thumbs/`, `refs/beat-0N`.
  The mp4s are 2–30 MB each: re-encode short web versions with ffmpeg (H.264, `-preset veryfast`, CRF ~28, max 720 px tall,
  under ~3 MB each, plus a webm/poster) into `public/`. Don't commit the originals.
- Other projects already on the page stay: Drift, Stress Test, Raingarden, Ghostline, Terrarium, HowPolluted, Archer Hero,
  BC Window Coverings. If you find a clear, finished project folder in `C:\Users\Warren\Downloads\Projects` that isn't on the
  page yet (e.g. `project-team-25` / WATERLOODLE, Warren's UW SE team project where he owns the frontend layout, nav and home page),
  add it as a compact card with honest text; if it's unclear, leave a `[TODO: ...]` and note it in the report.

## 1. The concept: "Ascent log"

yuzeli.ca is a scroll-driven space flight: a live 3D scene in the background, a HUD with live stats, and numbered "Log" sections
whose distance climbs (1 AU → 140 AU) while a megastructure gets built as you scroll. Do the same thing, but the journey is a
**climb up a snowy mountain** and the thing being built is an **igloo, block by block**.

- **Background scene (one persistent WebGL canvas, fixed behind the page):** a realistic, moody snowy mountain range at blue hour
  — layered ridgelines with atmospheric fog, a glacier, snow-loaded pines lower down, rock showing through on steep faces, a cold
  moon/sun, stars. The camera climbs as you scroll: base camp → treeline → icefall → ridge → summit. Drag to look around
  ("Drag to look around"), with damped inertia; cursor adds slight parallax when not dragging.
- **The build:** an igloo near the camera assembles from carved ice blocks as you scroll ("Scroll to build it"), each block
  flying in on a curve, settling with a small bump and a puff of powder. Blocks get igloo.inc-style hover polygons/edge glow and
  subsurface-ish ice shading (fresnel, refraction-look, internal cracks). It closes completely at the last section.
- **HUD (top or bottom corner, monospace, like yuzeli's):** live numbers tied to scroll and time — Altitude (m), Temp (°C,
  falls as you climb), Wind (km/h, gusts animate), Snowfall, Blocks placed (e.g. 412 / 640), Visibility, and a seed.
  Values ease, never jump.
- **Sections become log entries** with altitude markers, numbered like yuzeli (01/07 …): e.g.
  `LOG 01 · 0 m · Base camp` (hero), `LOG 02 · 800 m · Treeline` (about), `LOG 03 · 2,100 m · Icefall` (Building: BTTRURSLF),
  `LOG 04 · 3,400 m · The ridge` (Projects), `LOG 05 · 4,600 m · Crevasse field` (Work), `LOG 06 · 5,500 m` (Record/skills),
  `LOG 07 · Summit` (contact). Pick names that fit; keep the content model in `content.js`.
- **Finale at the summit:** clouds below, aurora overhead, the igloo sealed and glowing warm from inside, a flag/cairn, and the
  contact block.

## 1b. The project ice blocks (the centrepiece of the scroll)

Between the hero and the detailed project tracks, the climb passes through an **ice-block field built exactly like the BTTRshop
hub**: same detail, same motion, same feel. Blocks float up through the fog on the scroll, each a hand-shaped chunk of clear ice
with refraction, frost, internal cracks, trapped bubbles and powder, igloo-style white wireframe leader lines and IBM Plex Mono
labels that scramble in (`PROJECT_01 · BTTRURSLF`, a date, `CLICK TO OPEN`), the side progress dots, idle drift and the
cursor-reactive tilt. Match the shop's look in the screenshots (frosted white object inside smoky ice, geodesic wire overlay).

**Each block has a 3D symbol frozen inside it** that says what the project is, made as real 3D geometry in three.js (procedural
or a small optimized glTF you model in code), shaded with the same frosted-white material as the shop's hero objects:
- BTTRURSLF: the B monogram with a mountain in its bowl (Warren's logo; `public/shop/logo-mark.*` in BTTRURSLF-v2)
- Beatcut: a clapperboard with a waveform / beat pulses running through it
- Drift: a crushed plastic bottle shedding fragments
- Stress Test: a small server rack with a load gauge
- Raingarden: a raindrop over a sprouting plant
- Ghostline: a bow with a ghostly second arrow
- Terrarium: a glass jar with a tiny creature
- HowPolluted: a globe with a litter pile
- Archer Hero: a target with an arrow in it
- BC Window Coverings: a window with half-drawn blinds
- WATERLOODLE (only if you add it): a goose
Symbols rotate slowly and catch light; they should read clearly from across the screen.

**Clicking a block** dollies the camera into the ice exactly like the shop does, the ice cracks open, and the visitor lands on
that project: either scrolled to its track/card further down the page, or a full-screen project panel (title, one-line pitch,
stack, 2–3 clips/stills, live link, GitHub link, close with Esc / back button). Pick whichever feels better and say so in the
report. BTTRURSLF's block comes first and is the biggest; Beatcut second. Blocks must be keyboard reachable (Tab/Enter) with
real link names, and the page still reads with `?static=1` (blocks become a plain list of project links).

After the last block, reuse the shop's dissolve (glitch + fog) into the next log section instead of a hard cut, and consider an
equivalent of the shop's stone ring + particle B as a section break before Contact.

## 2. Spam the cool things (all of these, tuned so it still feels premium, not cluttered)

1. **GPU snow** — tens of thousands of instanced flakes with depth layers (near flakes big and blurred, far ones fine), wind
   field that changes with altitude, gusts that sweep across, and **cursor wind**: flakes swirl away from the mouse.
2. **Snow accumulating on UI** — a thin drift of snow builds on the top edge of cards, the nav and headings while you idle;
   it blows off when you scroll fast.
3. **Frost / frosted glass** — panels are frosted ice glass (backdrop blur + frost noise); frost creeps in from the screen
   corners as you climb higher and colder, and melts where the cursor hovers (a warm "breath" circle).
4. **Ice-crack section transitions** — at each log boundary a crack races across the screen and the next section shatters in.
5. **Text reveals carved from ice** — headings appear like they're chiselled/frozen in, with glinting specular sweeps.
6. **Volumetric fog layers** that the camera passes through, plus god-rays through the cloud deck near the summit.
7. **Aurora** shader in the night sky that intensifies near the top; a theme toggle swaps blue hour ↔ deep night.
8. **Footprints trail** — a faint line of boot prints follows your scroll path across the hero snow plane.
9. **Avalanche on fast scroll** — flinging the page quickly kicks up a powder wave and screen shake (subtle, capped).
10. **Breath fog** on the cursor when it's still for a moment; **icicles** hanging from the sticky nav that drip.
11. **Altimeter scroll bar** — a vertical altitude gauge replaces the scrollbar look, with the log markers on it.
12. **Snow-globe moments** — project plates can be "shaken" (drag) to swirl snow inside their frame.
13. **Sound (off by default)** — wind, crunching snow on scroll, ice clinks when blocks land; toggle in the top bar.
14. Anything else you think fits and looks great. More is fine as long as the budget below holds.

Keep yuzeli's useful chrome: top bar with Résumé / GitHub / LinkedIn / copy-email, sticky numbered section menu,
**⌘K / Ctrl+K command palette** (arrows, Enter, Esc; `e` copies email), a short film/reel slot if it fits (could be a
Beatcut-made reel).

## 3. Content priorities

- **BTTRURSLF is the hero project** — the biggest, first and most polished track, presented like yuzeli's lead work entry:
  tabs (e.g. Onboarding / Scans & plans / BTTRmap / Lodge / Shop / Mobile), real stats from `bttr-stats.json`,
  recorded screens and the upgraded live iceberg, link to bttrurslf.com. Its stretch of the climb gets the most dramatic
  scenery (the icefall). Describe it from its real docs; no invented numbers.
- **Beatcut** — new track or large card right after BTTRURSLF: autoplaying muted clips of its outputs inside a frame,
  a little "beat grid" visual that pulses in sync with the clip's cuts, and a plain explanation of how it works.
- Everything else keeps its current track/card, re-skinned into the snow world (frosted plates, cold palette, ice frames).
- Follow the existing content rules: no invented facts, unknowns as visible `[TODO: ...]`, zero em dashes, bio stays short.

## 4. Quality and performance bar (non-negotiable)

- 60 fps on a normal laptop at 1440x900; the existing quality tiers, `npm run perf` and the WebGL context budget
  (≤3 by weight) must still pass. The background scene counts toward the budget: pause/downgrade project figures accordingly.
- Mobile (390x844) gets a lighter tier: fewer flakes, no volumetrics, same layout quality. No sideways scroll.
- `prefers-reduced-motion` and `?static=1` give a calm, still, fully readable page. Page reads without JS.
- Lighthouse performance and accessibility do not get worse than the current build by more than a few points.
- Text contrast stays readable over the scene (use scrims under text columns).

## 5. How to work

1. **Plan first:** write `design/SNOW_PLAN.md` — the scene graph, shaders, scroll→altitude mapping, section map, effect list
   with where each one runs, and the perf budget per effect. Then build in this order, committing after each phase:
   (a) study + screenshot the BTTRshop hub and igloo.inc, (b) persistent background scene + camera climb + HUD, (c) the project
   ice-block field with all symbols and the click-to-open, (d) igloo build, (e) snow + wind + fog + aurora,
   (f) section/log restyle + chrome (nav, palette, altimeter), (g) BTTRURSLF track upgrade, (h) Beatcut,
   (i) the rest of the effect list, (j) mobile/reduced-motion/static passes, (k) perf tuning.
2. **Check each phase once, efficiently:** `npm test`, `npm run check -- --only=<relevant>`, and `npm run shoot` screenshots
   that you actually look at. Fix what's broken, then move on. Do not loop on cosmetic re-reviews of the same thing; one
   look-and-fix pass per phase, plus one full pass at the end.
3. Use `npm run compare` at the end to put yuzeli.ca and the new page side by side, and put your ice blocks next to the
   `design/ref-bttrshop/` shots at the same sizes; the blocks must look at least as good as the shop's, and raise anything that looks clearly
   lower quality than the reference.
4. Work on a new git branch `snow-ascent`. Commit often with clear messages. **Do not push to `main` and do not deploy** —
   the live site deploys from `main`, and Warren will review first. Pushing the `snow-ascent` branch to origin is fine.
5. Never delete Warren's files outside this repo. Don't change anything in the BTTRURSLF-v2 or claude-videos-build folders (running BTTRURSLF-v2's dev server to look at it is fine;
   don't commit, build into, or edit files there).

## 6. When you're done

Write `SNOW_REPORT.md` in the repo root: what's built, every **Decision**, screenshots list (`design/shots/`), perf numbers
before/after, anything left as `[TODO]`, and exactly how to preview it:
`git checkout snow-ascent && npm install && npm run build && npm run preview`, and how to ship it (merge to `main`).
