# Warren Sun portfolio: design spec

Date: 2026-10-10. Status: approved in advance (Warren asked for the recommended option at every step and no
questions until done). Every unknown fact is a visible `[TODO: ...]` placeholder, never invented.

## 1. Intent

One long page that works as a résumé for recruiters, co-op employers and Waterloo peers. Structure and calm
follow yuzeli.ca (Jerry Li); words, content and figures are Warren's own. The difference: figures are live
three.js scenes ported from BTTRURSLF-v2 (read-only source), kept inside their frames on a light paper page.

Success: the page works end to end, every figure checked live, under its fallback and under reduced motion;
screenshots at 1440x900, 1920x1080, 390x844 in `design/shots/`; Lighthouse performance >= 85 desktop; README.

Design read: developer portfolio for recruiters, calm editorial language, native CSS + vanilla ES modules,
three.js only inside figures. Dials: VARIANCE 5, MOTION 4 (page) with motion living in the figures, DENSITY 3.

## 2. Reference measurements (yuzeli.ca at 1440x900, measured 2026-10-10)

Paper #f4f3ee, panel #fdfdfb, ink #141413, body 17px/1.55, lede 18px, h1 115px (-0.04em), h2 36px, h3 21px,
caption 13.5px. Column `--measure: 1180px`, gutter `clamp(20px, 4vw, 56px)`. Top bar 60px. Section padding-top
~122px. Entry = 2-column grid 456px text / 638px figure, column gap 86px, entry padding 79px vertical. Figure =
panel with a header row (Fig. N, title, live readout) and padding 18/22/20. Phone: single column, 20px gutter.

## 3. Visual system

Colour (one accent, light theme only: the brief is a print-like paper page and the figures were re-lit for it):

| token | hex | use |
|---|---|---|
| `--paper` | #f4f3ee | page (given in the brief) |
| `--plate` | #fbfbf8 | figure panels |
| `--ink` | #17191c | text (cool graphite, not espresso) |
| `--ink-2` | rgba(23,25,28,.72) | body, bio |
| `--ink-3` | rgba(23,25,28,.62) | captions, meta (>= 4.5:1 on paper) |
| `--hair` | rgba(23,25,28,.14) | rules, plate borders |
| `--accent` | #1f5f78 | links, focus ring, one ink in figures ("meltwater", from the berg's underwater) |
| `--ice` | #dfe9ee / `--deep` #2c5466 | figure-only tones |

Type: Source Serif 4 variable (roman + italic, self-hosted woff2, OFL) for all reading text and the name;
IBM Plex Mono 400/500 (self-hosted, OFL) for figure plates, Fig. numbers, dates, tags and the scramble labels.
Both are faces Warren already uses in BTTRURSLF (Minimal menu, shop HUD), which is the brand reason for a
serif. Scale (desktop): name clamp(56px, 8vw, 112px) wght 500 opsz 60 tracking -0.02em; h2 34px; h3 21px;
body 17.5px/1.6 serif; lede 19px; caption 14px serif italic; mono 12.5-13px. Sentence case everywhere on the
page (the uppercase Plex labels exist only inside the ported block figures, as in the source). No em or en
dashes in visible copy, no middle-dot chains, no arrows appended to links, no eyebrows.

Radius: plates 6px, everything else 0. Shadows: none; plates use a 1px hairline.

Layout: one left-aligned 1180px column. Hero = asymmetric split (text 5/12, Fig. 1 7/12). Entries = Jerry's
text/figure grid (approx 5fr/7fr, gap 86px). Sections separated by a hairline and h2. Phone (< 860px): single
column, figure under text, 20px gutters, no horizontal scroll.

The one bold thing: Fig. 1, the iceberg. Everything else stays quiet.

## 4. Page content (src/content.js is the single source)

- Top bar (sticky, 60px, paper with hairline on scroll): "Warren Sun" -> #top; Résumé (PDF) -> /resume.pdf
  (placeholder PDF until Warren supplies one); GitHub -> github.com/warrensunion; LinkedIn ->
  linkedin.com/in/warren-sun-b2b113323; Email button copies warren.sun9@gmail.com and shows "Copied" for
  1.6 s (aria-live). Pressing `e` anywhere (not in a field, no modifiers) copies too.
- Hero: name, 2-3 line bio with links to #work, #building, #projects; Fig. 1 iceberg with caption
  "**[TODO: stat]** *caption*".
- Work: BC Window Coverings (website work for a Richmond, BC business). Role/dates/metrics TODO. Fig: ice block.
- Building: BTTRURSLF (self-improvement web game). Facts from its CLAUDE.md (Vite, vanilla ES modules, three.js,
  Supabase accounts, Gemini behind a server layer, on-device MediaPipe scans, bot protection with proof of work
  and rate limits, Playwright visual checks). Metrics TODO. Fig: ice block.
- Projects: Archer Hero (Roblox combat game, Lua, Roblox Studio). Metrics TODO. Fig: ice block.
- Contests and awards: Fig. chart (dataviz) from `contests` data; empty-state while data is TODO; list below.
- Get in touch: short line, the email (click to copy, or press e), links, and Fig. ring + particles ("WS"
  morphing into each project's object while hovering/focusing that project's link).
- Footer: links again, "Last updated October 2026" (generated from build date).

Each entry: linked h3 title, meta line (role, dates in mono), 1-2 short paragraphs with real metrics
(TODO markers until supplied), tags line (mono, comma separated), figure plate "Fig. N  Title  readout" +
caption with one bold stat and an italic sentence. Fig numbers are assigned in DOM order at render time.

## 5. Architecture

Vite 7 + vanilla ES modules. Runtime deps: three (0.180, same as source). No gsap (no timeline needs it).
Fonts via local woff2 copied from @fontsource packages at build-free time (devDependency only).
Dev deps: vite, playwright, lighthouse (all three already used in BTTRURSLF), @fontsource-variable/source-serif-4,
@fontsource/ibm-plex-mono.

```
index.html            shell; content is rendered into it by the content plugin (static HTML, works without JS)
vite.config.js        content plugin: imports src/content.js + src/render.js, fills <!--content--> at dev and build
src/content.js        all words, links, entries, TODO markers, figure specs
src/render.js         pure functions content -> HTML strings (Node-safe, no DOM)
src/main.js           boot: chrome (copy email, e key, bar), figure host
src/styles/*.css      tokens, base, layout, figures
src/chrome/copyEmail.js
src/figures/host.js   lifecycle: IntersectionObserver near/visible/far, context budget, fallbacks, reduced motion,
                      quality tier, fps meter (?fps=1)
src/figures/iceberg/  port of icebergScene.js, berg.js, water.js, terrain.js, overlay.js (+ adapter.js)
src/figures/iceblock/ port of block.js, shapes.js, textures.js, background.js, scramble.js, noise.js (+ figure.js)
src/figures/ring/     port of ring.js, ringGeometry.js, tube.js, tubeShapes.js, hubWorker.js, work.js (+ figure.js)
src/figures/contests/ SVG chart (no WebGL)
public/fonts, public/objects/*.webp (+ -sample.png silhouettes), public/posters/*.webp, public/resume.pdf
scripts/              shoot.mjs (Playwright screenshots), perf.mjs (fps), posters.mjs (fallback stills),
                      check-figures.mjs (live/fallback/reduced checks), lighthouse.mjs, test-*.mjs (node --test)
design/shots/         screenshots
```

### Figure contract
Every figure module exports `async function create(el, ctx)` returning `{ start(), stop(), resize(w,h),
setProgress?(p), destroy() }`. `ctx` = `{ tier: 'high'|'low', reduced: bool, log }`. The host:
- marks each `<figure data-fig="iceberg|iceblock|ring|contests">` with a static poster `<img>` in the markup
  (also the LCP-safe first paint);
- dynamic-imports the module (three.js is a separate lazy chunk) when the figure is within 1 viewport;
- `start()` when intersecting, `stop()` when not (rAF off); `destroy()` when more than 2.5 viewports away;
- caps live WebGL contexts at 3 (LRU: destroys the live figure farthest from the viewport first);
- destroy disposes everything and calls `WEBGL_lose_context`;
- fallback: no WebGL2, context lost, creation error, `prefers-reduced-motion` (for the iceberg/ring stills),
  Save-Data, or `?static=1` -> keep poster and `console.info('[fig:<name>] fallback: <reason>')`;
- the canvas fades in over the poster only after its first rendered frame.
One renderer per live figure rather than one shared renderer: the iceberg owns multi-pass render targets and
its water sim, and the source stages assume their own renderer; the budget keeps contexts at <= 3 instead.

### Fig. 1 iceberg
- Port the scene at its end state (no build-in): setState at T.end values once. Hover pushes blocks out
  (existing ray + hoverLift). Pulse every 6.25 s and wind kept.
- New `depth` param 0..1: lowers camera y and target y from above the waterline (y~+3) to below it (y~-9),
  relaxing CAM_MIN_Y, keeping the camera in front of the FRONT_Z cut so the "aquarium" cross-section shows.
  Desktop (>= 860px): hero track is 160svh; Fig. 1 is `position: sticky` (top 76px) while the text scrolls,
  depth = progress through the track. Phone: depth from the figure's position in the viewport.
  Progress is read once per rendered frame from getBoundingClientRect (no scroll listeners).
- Re-colour: sky/fog/loader re-keyed toward paper (#e9ecee..#f4f3ee), hemi warmed, water deep #2c5466 ->
  #13324a range, overlay ink #17191c on paper, additive whites -> normal blending ink/accent. Bloom off.
- Tiers: high = dpr min(dpr,1.5), refl .5; low (phone/coarse pointer/<= 4 cores) = dpr 1, lowRefl, terrain far
  detail and decorations off. Runtime adapt: > 22 ms average over 60 frames -> step down.
- Readout: live camera height relative to the waterline, e.g. "+2.4 m" / "-6.1 m" (derived from the scene).
- Reduced motion: no WebGL; poster above water, cross-fade to underwater poster when the hero is half scrolled.

### Ice-block figures (one per project)
- One IceBlock (hull shape from SHAPES) with the project's object art (generated marble cut-out webp) frozen
  inside, background recoloured to soft paper fog, no bloom, ink edges/wire with normal blending.
- Label: Plex Mono uppercase project label scrambles in with an SVG leader line when the figure first becomes
  visible (ported ScrambleLine + hud place()). Drag (pointer events, capture) orbits yaw +-39 deg and pitch
  +-12 deg with spring back; keyboard: arrow keys when focused. Cursor lean kept.
- Readout: "yaw 12°".
- Reduced motion: no scramble (label appears), no idle wobble, poster still image instead of WebGL.

### Get in touch: ring + particle tube
- Stone ring (OUTER + INNER segments, no B logo) assembles over 1.6 s when first visible, then ignites over
  1.2 s (time-driven, not scroll). Ignite re-expressed for paper: accent rim emissive with normal blending,
  a darker band and ink sparkles, no bloom.
- Particles (48k high tier / 20k low) grow from "WS" (canvas text -> data URL -> grow kind 'logo') and morph to
  each project's object silhouette (kind 'object') on hover/focus of that project's link; back to "WS" on leave
  (debounced 120 ms). Shape growing runs in the ported worker.
- Reduced motion: poster of "WS"; hovering a project link cross-fades to that project's still poster.

### Contests chart
SVG built from `content.contests` (name, year, result, field size). Encodes placement percentile per contest
over time (dot plot). With no data, renders an empty state: "Contest results go here. Add them in
src/content.js." No WebGL.

## 6. Error handling and logging
All fallbacks log once with a reason. Clipboard API missing -> select-text fallback + "Press Ctrl+C". Worker
failure -> main-thread grow. Font load failure -> system serif/mono stacks.

## 7. Accessibility
Landmarks, skip link, one h1, ordered headings, focus-visible ring in accent, figures have `role="img"` +
aria-label describing the scene, canvases `aria-hidden`, drag figures focusable with arrow keys and a visible
hint in the caption, link hover morph also on focus, colour contrast AA, `e` shortcut documented in the email
hint and ignored in inputs or with modifiers.

## 8. Testing and verification
- `node --test scripts/test-*.mjs`: content render (every entry has title/tags/figure, TODO markers present,
  zero em dashes), berg block invariant (ported check-iceberg-blocks), host budget logic.
- `scripts/check-figures.mjs`: Playwright, each figure live (canvas painted, non-blank pixels), forced fallback
  (`?static=1` and WebGL disabled) and reduced motion; asserts console fallback logs; no horizontal scroll at
  390px.
- `scripts/shoot.mjs`: 1440x900, 1920x1080, 390x844 into design/shots/.
- `scripts/perf.mjs`: headed Chromium with GPU, frame times per figure, writes design/perf.md.
- Lighthouse desktop performance >= 85 (`scripts/lighthouse.mjs`).
- Web Interface Guidelines review (web-design-guidelines skill) before completion.
