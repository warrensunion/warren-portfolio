# Port notes: Terrarium (source: C:\Users\Warren\Downloads\terrarium, READ-ONLY)

Pinned commit: `7612a407723c7b73737a87ca4e6f502cd5c387bb`. Warren is the sole author. The source is never
written to. Every ported file starts with a header naming its source path, the commit and what changed. To
update: move the source to a new commit, diff each file below against its source path, carry the changes over
by hand, then run `node scripts/terrarium-history.mjs` and `node --test scripts/test-terrarium.mjs`.

## Ported code (`src/figures/terrarium/`)

| file | source path | what changed |
|---|---|---|
| `sim/rng.js` | `src/sim/rng.js` | nothing but the header |
| `sim/genes.js` | `src/sim/genes.js` | nothing but the header |
| `sim/neat.js` | `src/sim/neat.js` | nothing but the header |
| `sim/species.js` | `src/sim/species.js` | nothing but the header |
| `sim/sense-cpu.js` | `src/sim/sense-cpu.js` | nothing but the header |
| `sim/world.js` | `src/sim/world.js` | nothing but the header |
| `worker.js` | `src/worker/sim.worker.js` | slimmed: CPU sensor only (no `sense-gpu.js`), no simcheck, URL params, `params` or `debug-kill`; `reset` restarts the same seed; a step carries `n`; the backlog divisor is taken once per queued batch; `handle(msg, post)` exported for Node tests |
| `ease.js` | `src/core/ease.js` | nothing but the header |
| `live/stage.js` | `src/live/stage.js` | takes `{ tier }` (low: DPR 1, no MSAA); asset URLs under `/terrarium/`; canvas `touch-action: pan-y`; `resize(w, h)` takes the host's size |
| `live/jar.js` | `src/live/jar.js` | nothing but the header |
| `live/terrain.js` | `src/live/terrain.js` | nothing but the header |
| `live/creatures.js` | `src/live/creatures.js` | nothing but the header |
| `live/ik.js` | `src/live/ik.js` | nothing but the header |
| `live/lod.js` | `src/live/lod.js` | nothing but the header |
| `live/look.js` | `src/live/look.js` | nothing but the header |
| `live/food.js` | `src/live/food.js` | nothing but the header |
| `live/particles.js` | `src/live/particles.js` | nothing but the header |
| `live/grade.js` | `src/live/grade.js` | `createGrade` takes `{ samples }` (the low tier passes 0) |
| `live/camera.js` | `src/live/camera.js` | `ease.js` path; no wheel handler; a drag turns the azimuth only; new `setOrbit(phi, theta, zoom, snap)` and `azimuth` getter |
| `river.js` | `src/ui/river.js` | reduced motion as an option; `setHistory(samples)` and `setPlayhead(u)`; labels in the site's mono face with a wider gutter |
| `brain.js` | `src/ui/brain-panel.js` | only `createBrainViz` and its helpers, exported; no panel chrome; reduced motion as an option; labels in the site's mono face |

New (not ported): `figure.js` and `figure.css` (the track adapter and its overlays).

## Copied assets (`public/terrarium/`)

| file | source path |
|---|---|
| `moss-floor.webp` (484,278 bytes) | `public/art/moss-floor.webp` |
| `room-backdrop.webp` (151,888 bytes) | `public/art/room-backdrop.webp` |

Both are fetched only by the figure, after it is near the viewport. The art is Warren's own.

## History (`public/terrarium/history.json`)

Written by `node scripts/terrarium-history.mjs`: seed 20261010, count 300, `foodRate` 1.3, 3,600 steps on the
CPU sensor, a census every 120 steps (31 samples, ticks 0 to 3,600). The featured lineage is the most numerous
species at step 3,600 and its member furthest down its line (highest generation, then oldest), followed back
through its first parents to a gen-0 founder; that founder's genome at birth is `featured.gen0Genome`.

Run on 2026-10-10: 31 samples, max generation 30 (G), at tick 3,600 generation 30, 997 alive, 8 species;
featured species 1, member 3390 at generation 30, from founder 17; 7,258 bytes; 5.6 to 6.5 s on this machine
(about 1.8 ms a step once the jar nears its 1,000 cap).

The live jar on the high tier is the same world (same seed, count 300, CPU sensor), so its generations and
species match the river. The low tier's jar starts with 160 creatures, so its world differs from the river's.
