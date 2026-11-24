# Ascent: the snow and mountain redesign, report

Built overnight on the branch **`snow-ascent`** from the brief in `OVERNIGHT_SNOW_PROMPT.md` (left untracked).
Nothing was pushed to `main` and nothing was deployed. Calls I made on my own are marked **Decision**.
The working plan and its build log are in `design/SNOW_PLAN.md`.

## Preview it

```sh
git checkout snow-ascent
npm install
npm run build
npm run preview      # http://localhost:4173
```

Useful flags: `?static=1` (the still page), `?tier=low` (the phone tier on a desktop), `?fps=1` (frame meter).
Ctrl+K (Cmd+K on a Mac) opens the command palette; `e` copies the email anywhere outside it.

## Ship it

When you are happy with it: merge `snow-ascent` into `main` and push. The Pages workflow
(`.github/workflows/pages.yml`) runs `npm test` and the build, and deploys. Nothing else is needed: no new
secrets, no new services, and `three@0.180.0` is still the only runtime dependency.

```sh
git checkout main
git merge --no-ff snow-ascent
git push origin main
```

## What is built

**The world (phases b, d, e).** One persistent WebGL canvas fixed behind the page (`src/world/`), so the page
reads as a climb:
- A made-up range at blue hour: one long south ridge from a valley floor at base camp (0 m) to a 6,100 m
  summit 11 km north, ridged gullies and rock faces with snow chutes, a glacier with crevasses (the icefall),
  a crevasse plateau, a ring of lower peaks, and a valley of snow-loaded pines with two tents at base camp.
  The terrain is drawn on the GPU from one height function (`land.js`) that also runs in JS with the same
  integer hash, so the camera, the igloo, the pines and the seracs stand exactly on the surface the GPU draws.
  There is no mesh to download.
- Sky: gradient, hashed stars that twinkle, a moon with a halo, and an aurora that grows with altitude and with
  the night theme. Haze fades every surface into the sky's own colour. A cloud slab sits at the treeline
  (1,000 to 1,750 m), a cloud sea below the summit (4,150 m), and god-rays fall from the moon above the high camp.
- The igloo: 143 carved snow-ice blocks (dome rings, a key block, a tunnel), one InstancedMesh. Scroll places
  them; the next few fly in on a curve from where they were cut, tumble into their seats, land with a small bump
  and a puff of powder (and a clink with sound on). Hover lights a block's polygons with a white wire. At the
  summit the last block seals it and the seams glow warm from inside. It stands on its own snow knoll just ahead
  and right of the view, so it is in frame at every log, on the side the text column is not.
- GPU snow: 24,000 instanced flakes in three depth layers (6,000 on the low tier), a wind that rises with
  altitude, gust fronts sweeping across, the cursor's wind (flakes part and swirl round the pointer), and an
  avalanche of powder plus a capped shake of the canvas when the page is flung.
- Drag to look around (damped inertia, springs back), cursor parallax, an idle sway. Drag only starts on empty
  page, never on text, links, figures or controls.

**Scroll to altitude and the HUD (phase b).** Seven numbered logs, each a section with an altitude:
LOG 01 Base camp 0 m (the hero), LOG 02 Treeline 900 m (the ice field), LOG 03 Icefall 2,100 m (BTTRURSLF and
Beatcut), LOG 04 The ridge 3,400 m (Projects), LOG 05 Crevasse field 4,600 m (Work), LOG 06 High camp 5,500 m
(Record), LOG 07 Summit 6,100 m (Get in touch). Each log opens with its marker and one sentence, as yuzeli's do.
The hero's HUD (Fig. 0) and the bar's readout show altitude, temperature (falls 6.5 °C a kilometre), wind with
gusts, snowfall, blocks placed, visibility and a seed, all eased. The HUD says plainly that it is a model.

**The ice field (phase c).** Log 02 is the BTTRshop hub ported (`src/world/field/`, from Warren's own
`src/screens/shop/hub/`): the procedural ice hulls, the frost maps, transmission ice with its clear window,
frost shell, cracks, bubbles, rim, facet edges, the geodesic wire-mesh, leader lines, loose shards, glints,
the blurred mono text in the fog, and the dissolve (glitch strips, colour fringe, frost front). Each of the 11
projects is a block with its 3D symbol frozen inside, real geometry in a frosted white: Warren's B with the
mountain in its bowl (traced from `public/shop/logo-mark.png`), a clapperboard whose beat bars pulse, a
crushed bottle shedding fragments, a server rack whose load needle hunts, a raindrop over a sprout, a bow with
a flickering ghost arrow, a jar with a creature, a globe on a litter pile, a target with a quivering arrow, a
window whose blind slats tilt, and a gliding goose. BTTRURSLF's block is first and biggest, Beatcut second.
Labels scramble in on hairline leaders (`PROJECT_01` / `BTTRURSLF`, its first two tags, `CLICK TO OPEN`), the
side index fills the square of the block in view, and the dissolve takes the screen at both edges of the field.

**Chrome (phase f).** The bar keeps Résumé, GitHub, LinkedIn and copy-email, with a live readout and three
tools: theme (blue hour or deep night, the world re-lights), Sound: Off/On, and Ctrl+K. The altimeter on the
right edge replaces the scrollbar's look: a gauge with the seven logs as numbered links, a needle on the eased
altitude, and drag or click to scroll. The command palette lists every log, every project, the links, copy
email and the settings; arrows, Enter and Esc work, and `e` still copies the email outside it.

**BTTRURSLF (phase g).** It leads the page: a lead row with its pitch, its measured numbers from
`src/data/bttr-stats.json` (34 screens, 38 server routes, 640 tests, counted 2026-10-14) and the live iceberg
from its start screen, re-keyed from paper to blue hour (sky, fog, water, its overlay and its snow), then the
tabbed track of recorded screens as before, and a **Live site** link to bttrurslf.com, which answers now.

**Beatcut (phase h).** A new track after BTTRURSLF. Its figure plays three of Beatcut's own renders (spotlight
stage, line explainer, glitch popup), muted, in a phone frame, beside a beat grid built from each render's real
data: one cell per beat and a tick per cut, lit from the video's own clock, so the grid pulses with the clip's
cuts. The readout under it is the render's self-check (13 of 13, 9 of 9, 23 of 23 planned cuts on screen). The
fourth stage is the pipeline. The web encodes are 0.2 to 0.6 MB each (`public/beatcut/`), H.264 and WebM.

**The rest of the effect list (phase i).** Snow drifts on the plates, the log headings, the bar and the lead
numbers while you idle, blown off by a fast scroll; frost creeping in from the screen's corners as it gets
colder, melting in a warm circle round the cursor; breath fog where the cursor rests; icicles under the bar
with the odd drip; a crack racing across the screen at each log boundary; headings carved in with a glint
sweeping across; snow-globe plates (drag the BTTRURSLF, Beatcut or Ghostline plate); footprints laid along the
base-camp snow as you scroll through log 01; and sound (wind, crunching snow, ice clinks), off by default.

**Phones, reduced motion, static, no JS (phase j).** Phones and machines with 4 cores or fewer get the low
tier (DPR 1, 6,000 flakes, no bloom, no god-rays, a cheaper cloud sea, half-resolution transmission in the
field). Reduced motion, `?static=1`, save-data and no WebGL2 skip the world entirely: the backdrop is a still of
the climb per log (`public/posters/world-<n>.webp`), swapped at the logs, and the ice field is its list of
project links. Without JavaScript the page is the same document as before, over the base-camp still.

## Decisions

1. **The ice field is its own log (02, Treeline)**, between the hero and the tracks, as the brief places it. The
   climb enters the cloud at the treeline, the blocks float up through that fog, and the camera comes out at the
   icefall, which stays BTTRURSLF's.
2. **Clicking a block scrolls to that project's entry** (under the dissolve's full fog), instead of opening a
   full-screen panel. One copy of every project's words, the back button and `#hash` links work, keyboard and
   screen-reader users land on the project's heading (it takes focus), and there is no modal to trap focus.
3. **The igloo travels with the climber.** It stands on its own snow knoll ahead and right of the view at
   every altitude (like yuzeli's swarm, it is the thing being built on the journey), and at the summit it is
   sealed on the top. Its block count is what the geometry gives: 143.
4. **The page is dark now.** A night page reads over a blue-hour scene; the old paper palette would not. The
   iceberg, the ring and the contests chart were re-keyed for it, and their posters reshot.
5. **The world takes one of the page's three WebGL contexts.** The figure host now gets two (`reserve` in
   `initFigures`), and while a WebGL figure runs the world gives way (DPR 1, half the snow, no bloom).
6. **Beatcut's clips are Beatcut's own renders**, from `C:\Users\Warren\projects\beatcut\outputs` (the app's
   repo), muted with the audio removed. The `claude-videos-build/output-beat` videos the brief points to were
   made by a different pipeline (a separate overnight job driving Playwright, ffmpeg and canvas), not by Beatcut,
   so they are not shown as Beatcut output. Five of Beatcut's six demo renders use third-party songs, which is
   one more reason the page ships the video only.
7. **WATERLOODLE is in, as an honest card.** It is a real six-person SE 101 project (Fall 2026) but it is not
   finished and has no public link (it lives on the university's GitLab). The card says it is in progress and
   names only Warren's own work: the size game's five questions with sources and SVG art, the trivia game's
   Flask routes, templates and front end, and a layout, navigation and home page redesign that is waiting to be
   merged. The brief's "owns the frontend layout, nav and home page" is true only of that unmerged redesign, so
   the card does not claim it. Its plate is a screenshot of the redesign's home page from the team repo.
8. **bttrurslf.com is linked** (Live site), now that it answers with the app (title "BttrUrslf"); the private
   repo still is not.
9. **No reel slot.** Nothing filmed is about Warren yet, and the Beatcut track already autoplays clips.
10. **Third-party reference shots stay local.** `design/ref-yuzeli/` and `design/ref-igloo/` are gitignored;
    `design/ref-bttrshop/` (Warren's own app) is committed.
11. **BTTRURSLF keeps its recorded tabs** (Climb, Mereum, Face scan, BTTRmap, BTTRshop, Pro, Stats). The fresh
    screenshots in `output-beat/site/` are stills, and the track's player scrubs recorded clips; new tabs for
    Lodge and Mobile want new captures (`npm run capture:bttr`), which drive the app and were out of scope.
12. **The HUD is a model.** Altitude, temperature, wind, snowfall and visibility describe the made-up mountain,
    and the HUD's caption says so; none of it is presented as a measurement.

## Honesty

- Every number on the page is either measured with its source or a visible `[TODO: ...]`. New numbers:
  BTTRURSLF's three lead stats (its own stats file, dated), Beatcut's tempo, cut counts and mean cut-to-beat
  offsets (its own analysis, plan and self-check files, exported to `public/beatcut/<clip>.json`).
- Beatcut's commits are all co-authored by Claude Code (the app's own history), and the page does not say who
  wrote what: its role line is a `[TODO: role]` for you to fill in as you see fit.
- The world's HUD is labelled as a model of a made-up mountain.
- Zero em dashes, the bio is unchanged, and nothing links to the private BTTRURSLF or bcwc repositories.
- No BTTRURSLF source, keys, selectors or app data came over: the ported field code is the hub's rendering only
  (shapes, materials, dissolve, labels), and the `nosource` check still scans `dist/`.

<!-- REPORT-NUMBERS -->
