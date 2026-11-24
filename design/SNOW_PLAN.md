# Ascent: the snow and mountain redesign, plan

Branch `snow-ascent`. Brief: `OVERNIGHT_SNOW_PROMPT.md`. This file is the working plan and the build log
(bottom). Calls made without Warren are marked **Decision** here and repeated in `SNOW_REPORT.md`.

## 1. What changes, in one paragraph

The page stays one static HTML page rendered from `src/content.js`, so it still reads without JavaScript.
Behind it, one persistent WebGL canvas (the **world**) draws a snowy range at blue hour. Scrolling climbs
the camera from base camp to the summit while an igloo assembles block by block, and between the hero and
the tracks the climb enters the cloud, where every project floats past as a block of ice (the BTTRshop hub's
technique, ported). Sections become numbered log entries with altitudes. Everything that already works
stays: tracks, compact cards, stills, `?static=1`, reduced motion, the context budget, the tests and
`npm run check`.

## 2. Section map (scroll to altitude)

| log | altitude | name | section id | content |
|---|---|---|---|---|
| 01 | 0 m | Base camp | `top` | name, bio, Fig. 1 HUD (live numbers), "Scroll to build it. Drag to look around." |
| 02 | 900 m | Treeline | `index` | the ice-block field: one block per project, click to open |
| 03 | 2,100 m | Icefall | `building` | BTTRURSLF (lead entry: iceberg + stats, then the tabbed track), Beatcut (track) |
| 04 | 3,400 m | The ridge | `projects` | Drift, Stress Test, Raingarden, Ghostline, Terrarium (tracks); HowPolluted, Archer Hero, WATERLOODLE (cards) |
| 05 | 4,600 m | Crevasse field | `work` | BC Window Coverings (track) |
| 06 | 5,500 m | High camp | `record` (was `contests`) | contests and awards, toolkit (from the projects' own tags) |
| 07 | 6,100 m | Summit | `contact` | the ring (stone ring + particle initials) as the break, then contact |

**Decision: the field is its own log (02, Treeline).** The climb enters the cloud at the treeline, the
blocks float up through that fog, and the camera leaves the cloud at the icefall. That keeps the most
dramatic scenery (the icefall) for BTTRURSLF, as the brief asks, and gives the scene change a reason.

Altitude is piecewise linear in scroll between log anchors: each `<section data-alt>` is an anchor at the
moment its top reaches 40 % of the viewport. `src/world/climb.js` exports the pure mapping
(`altitudeAt(scrollY, anchors)`), unit-tested in Node. The HUD, the altimeter, the camera path, the
temperature and wind models all read that one altitude.

Derived values (pure, `src/world/climb.js`, tested): temperature `-4 - 6.5 * alt / 1000` (the standard
lapse rate) eased; wind base `12 + 0.011 * alt` km/h plus gusts from a seeded noise of time; snowfall
heavy low, lighter high (cm/h, from a curve); visibility falls in the cloud (log 02) and opens above it;
blocks placed = round(build * total), where build is scroll progress from log 01 to log 07.

## 3. The world (one WebGL context, weight 1 in the budget)

`src/world/` (new), lazy chunk after first paint. Boot order: static poster background (CSS) -> world
module after load and idle -> first frame -> canvas fades in over the poster.

Scene graph (mountain act):
- **Sky** (`sky.js`): an inverted sphere, one shader: blue-hour gradient (or deep night), hashed stars with
  twinkle, a cold moon disc with halo, and the **aurora** (curtains of fbm bands, intensity rises with
  altitude; stronger in the night theme).
- **Ranges** (`terrain.js`): five ridgeline layers (procedural ridged-fbm height strips, 160x48 grids),
  near to far, each lighter and bluer with distance (atmospheric perspective in the shader), snow on
  gentle slopes and dark rock on steep faces (slope from the analytic normal), soft moonlight.
  One **near massif** with a **glacier** tongue (a bluish smooth band carved into a valley) and the summit
  pyramid the climb ends on.
- **Pines** (`pines.js`): one InstancedMesh of snow-loaded stacked cones, scattered by noise below the
  treeline altitude band on the near slopes.
- **Base camp snow plane** with the **footprints** trail (a shader on the plane: boot prints along a
  curve, revealed up to the scroll's progress through log 01).
- **Igloo** (`igloo.js`): ~200 carved blocks in rings on a dome plus an entrance tunnel, one InstancedMesh,
  ice shader (fresnel rim, crack noise, internal glow when sealed). Build progress places blocks in order;
  each flies in on a curve, lands with a small bump and a powder puff (pooled sprites) and a clink (sound).
  Hover: raycast the instanced mesh, the hovered block's edges glow (igloo.inc's hover polygons).
  The igloo sits on a snow ledge in front of the camera rig and travels with it (**Decision**: like
  yuzeli's swarm, it is the thing being built on the journey, so it stays in view at every log).
- **Snow** (`snow.js`): GPU snow, instanced camera-facing quads in three depth layers (near big and soft,
  mid, far fine). Wind field from altitude, gust fronts sweeping across, and **cursor wind** (the pointer's
  ray pushes flakes away). All motion in the vertex shader from time; nothing per flake on the CPU.
  High tier 24k flakes, low tier 6k.
- **Fog** (`fog.js`): three large soft fog sheets the camera passes through (noise-scrolled), a cloud deck
  below the summit with **god-rays** (additive shafts) near the top; scene fog for depth.
- **Summit**: cloud sea below, cairn and flag, the sealed igloo glowing warm.

Ice act (the field, log 02): the same renderer, a second scene: the hub's fog backdrop, the blocks
(transmission ice), and the dissolve pass between acts. Only one act renders a frame (the dissolve hides
the swap at its peak).

Camera rig (`rig.js`): a path of keyframes by altitude (position, target), Catmull-Rom; drag to look
(yaw/pitch offsets, damped inertia, springs back slowly), cursor parallax when not dragging, a small idle
sway. "Drag" starts only on empty page areas (not text, links, figures or controls).

Post: render -> clamp (HDR cap) -> dissolve (only when active) -> bloom (high tier) -> output.

### Budget and lifetime
- The world holds 1 context. `initFigures(..., { reserve })` lowers the figure cap to 3 - reserve, so the
  page total stays at 3 (checked by `npm run check` budget). Without the world (static, reduced motion,
  no WebGL2, save-data) the reserve is 0.
- While any WebGL figure runs, the world drops to DPR 1, halves the snow and skips bloom.
- It pauses when the tab is hidden, and destroys itself on context loss and falls back to the posters.

### Fallbacks
`[world] fallback: <reason>` once, with the same reasons as figures. The fallback is a fixed background of
per-log stills (`public/posters/world-<n>.webp`, shot from the world by `npm run posters`) that cross-fade
at log boundaries (400 ms opacity, none under reduced motion: a plain swap). Without JS: the base-camp
still under a scrim. Every effect below is decoration over a page that reads without it.

## 4. The project ice blocks (log 02)

Ported from BTTRURSLF-v2 `src/screens/shop/hub/` (Warren's own code), rewritten for this repo:
`src/world/field/` = `shapes.js` (procedural ice hulls, seeded), `textures.js` (frost maps, star, blurred
text), `block.js` (transmission ice + frost shell + rim + edges + wire-mesh + lines + shards + glints),
`backdrop.js` (fog backdrop with blurred mono text, bokeh, dots), `dissolve.js` (glitch + fringe + frost
pass), `labels.js` + `scramble.js` (DOM HUD labels on leader lines, scrambling in).

Changes from the hub:
- Each block's frozen object is a **3D symbol**, real geometry (`symbols.js`), in a frosted white material
  (lambert-ish + fresnel + frost noise, pushed over 1 so it reads through the ice like the hub's objects):
  BTTRURSLF the B with a mountain in its bowl, Beatcut a clapperboard with pulsing beat bars, Drift a
  crushed bottle shedding fragments, Stress Test a server rack with a gauge, Raingarden a raindrop over a
  sprout, Ghostline a bow with a ghost arrow, Terrarium a jar with a creature, HowPolluted a globe on a
  litter pile, Archer Hero a target with an arrow, BC Window Coverings a window with half-drawn blinds,
  WATERLOODLE a goose. They turn slowly.
- Labels: `PROJECT_01 · BTTRURSLF`, dates (or `[TODO]` when unknown, never invented), `CLICK TO OPEN`.
- BTTRURSLF's block is first and 1.25x, Beatcut second.
- The section is a tall sticky stage: its own scroll (one pitch per block) drives the blocks' passage.
  The page scrolls natively; no wheel capture.
- **Decision: clicking a block** dollies into it, the ice flashes and cracks (the dissolve's strips), and
  under the full fog the page jumps to that project's track or card, then the fog clears there. One copy of
  every project's content, the back button and the hash work, and no modal to trap focus.
- Keyboard: the blocks are real links (`PROJECT_01 · BTTRURSLF`, to `#bttrurslf`) in an ordered list.
  Focusing one glides the stage to its block; Enter plays the same move. `?static=1`, reduced motion and
  no JS: the list is a plain list of project links.
- After the last block the dissolve fades back into the mountain act at the icefall.

## 5. Effects, where they run, and what they may cost

| # | effect | where | budget at 1440x900 |
|---|---|---|---|
| 1 | GPU snow, wind, gusts, cursor wind | world vertex shader | <= 1.5 ms GPU |
| 2 | snow drifts on cards, nav, headings | CSS (one `--drift` var), `chrome/drift.js` | no per-frame JS |
| 3 | frosted glass panels, corner frost, warm breath hole | CSS backdrop-filter + a fixed frost layer masked by `--frost`, `--mx/--my` | 1 composited layer |
| 4 | ice-crack transitions at log boundaries | `chrome/cracks.js`, one SVG overlay, IntersectionObserver | only while it plays |
| 5 | carved-ice text reveals with a specular sweep | CSS on `.log-h`, triggered by an observer | CSS only |
| 6 | volumetric fog sheets, god-rays near the top | world | <= 1 ms |
| 7 | aurora, theme toggle blue hour / deep night | sky shader, `chrome/theme.js` | in the sky pass |
| 8 | footprints trail on the base-camp snow | world plane shader | in the plane pass |
| 9 | avalanche on fast scroll (powder wave, capped shake of the canvas only) | world + scroll speed | event only |
| 10 | breath fog at a resting cursor, icicles on the bar that drip | `chrome/breath.js`, CSS/SVG | CSS only |
| 11 | altimeter scroll bar with log markers | `chrome/altimeter.js` | one transform per frame |
| 12 | snow-globe plates (drag to shake) | `chrome/globe.js`, 2D canvas on the clip plates | only while shaken |
| 13 | sound, off by default (wind, crunch, clinks) | `chrome/sound.js`, WebAudio synthesis, no files | idle when off |
| 14 | command palette Ctrl+K / Cmd+K | `chrome/palette.js` | none |

Frame budget for the whole page at 1440x900 on the high tier: world <= 6 ms GPU, page JS <= 2 ms per
frame. Low tier (phones, touch, <= 4 cores): DPR 1, 6k flakes, no fog sheets, no bloom, no god-rays,
fewer pines.

## 6. Look

Dark cold page: blue-hour navy `#0d1826` to deep night `#060a12`, ink `#e9eef4`, frost white, glacier
cyan accent `#9fd3e6`, warm igloo amber `#ffb46b` used once. Text sits on frosted scrims. Serif stays for
reading text, IBM Plex Mono for every number, label and log line (as now).

## 7. Order of work (one commit or more per phase)

a. references + baselines (done) b. world, climb, HUD c. ice-block field, symbols, click-to-open
d. igloo e. snow, wind, fog, aurora f. logs restyle and chrome (bar, palette, altimeter, theme)
g. BTTRURSLF lead entry and iceberg upgrade h. Beatcut i. the rest of the effects
j. phone, reduced motion, static, no JS k. perf tuning, then the full check, compare and the report.

## Build log

- Phase a: references in `design/ref-bttrshop/` (committed), `design/ref-yuzeli/` and
  `design/ref-igloo/` (local only). Baselines: `design/baseline/` (perf 60 fps all, Lighthouse
  performance median 95 on 2026-11-24 (runs 95, 99, 49), accessibility 100).
- Beatcut facts: the app is `C:\Users\Warren\projects\beatcut` (Next.js + Remotion + Python worker +
  Claude). **Decision:** the clips shown are Beatcut's own preset renders with the audio removed. The
  `claude-videos-build/output-beat` videos were made by a different pipeline, not by Beatcut, so they are
  not presented as Beatcut output.
- WATERLOODLE: an in-progress SE 101 team project (six students, Fall 2026), no public link.
  **Decision:** added as a compact card that says it is in progress and names only Warren's own work.
