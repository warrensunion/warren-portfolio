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

## Copied assets (`public/terrarium/`)

| file | source path |
|---|---|
| `moss-floor.webp` (484,278 bytes) | `public/art/moss-floor.webp` |
| `room-backdrop.webp` (151,888 bytes) | `public/art/room-backdrop.webp` |

Both are fetched only by the figure, after it is near the viewport. The art is Warren's own.

## History (`public/terrarium/history.json`)

Written by `node scripts/terrarium-history.mjs`: seed 20261010, count 300, `foodRate` 1.3, 3,600 steps on the
CPU sensor, a census every 120 steps (31 samples, ticks 0 to 3,600). The featured lineage is the oldest living
member of the most numerous species at step 3,600, followed back through its first parents to a gen-0
founder; that founder's genome at birth is `featured.gen0Genome`.

Run on 2026-10-10: 31 samples, max generation 30 (G), at tick 3,600 generation 30, 997 alive, 8 species;
featured species 1 from founder 201; 7,260 bytes; 6.5 s on this machine (about 1.8 ms a step once the jar
nears its 1,000 cap).
