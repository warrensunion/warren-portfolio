# Figure frame rates

Measured 2026-11-24 by `npm run perf` (scripts/perf.mjs) on the built page (`vite preview`).
Each figure is scrolled into view at 1440x900 (device pixel ratio 1), goes live, warms up for 1.5 s, then its
own frame times are recorded for 5 s through `ctx.frame` into `window.__figStats`. Average fps is frames
divided by summed frame time; p95 is the 95th percentile of the individual frame times.

## Hardware

- GPU (WebGL renderer string): ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 (0x00002503) Direct3D11 vs_5_0 ps_5_0, D3D11)
- CPU: Intel(R) Core(TM) i5-9400F CPU @ 2.90GHz (6 logical cores), 32 GB RAM, win32 10.0.19045
- Browser: Playwright Chromium 156.0.8078.4, headless with --use-angle=d3d11 --enable-gpu --ignore-gpu-blocklist.

This is a desktop GPU, not the laptop the spec names, so the high tier numbers here are a ceiling. The low tier
and the 4x CPU throttle run below are the honest stand-ins for a laptop. Headless Chromium paces
requestAnimationFrame at 60 Hz, so 60 fps is the most any row can show.

## High tier (?tier=high, what a desktop with more than 4 cores gets)

| figure | frames | avg fps | p95 frame (ms) | worst frame (ms) |
|---|---|---|---|---|
| iceberg-0 | 290 | 57.2 | 16.8 | 66.7 |
| ring-0 | 303 | 58.1 | 16.8 | 50.0 |
| howpolluted-0 | 281 | 55.6 | 33.3 | 33.4 |
| archer-0 | 296 | 56.2 | 33.3 | 66.7 |
| terrarium-0 | 221 | 43.5 | 33.4 | 783.4 |

Quality steps taken by the runtime adapt:
- none

## High tier without the world (?tier=high&world=0), for comparison

| figure | frames | avg fps | p95 frame (ms) | worst frame (ms) |
|---|---|---|---|---|
| iceberg-0 | 290 | 55.6 | 33.3 | 66.6 |
| ring-0 | 316 | 54.3 | 33.3 | 116.7 |
| howpolluted-0 | 267 | 51.8 | 33.4 | 50.0 |
| archer-0 | 297 | 58.4 | 16.8 | 50.0 |
| terrarium-0 | 278 | 54.9 | 33.3 | 50.0 |

The same figures, the same machine and the same minutes, with the world behind the page switched off: the
difference from the table above is the world's own cost to the figures.

## Low tier (?tier=low, what phones, touch screens and machines with 4 cores or fewer get)

| figure | frames | avg fps | p95 frame (ms) | worst frame (ms) |
|---|---|---|---|---|
| iceberg-0 | 297 | 58.4 | 16.8 | 33.4 |
| ring-0 | 282 | 54.4 | 33.3 | 66.7 |
| howpolluted-0 | 270 | 52.6 | 33.4 | 50.1 |
| archer-0 | 288 | 56.5 | 33.2 | 50.0 |
| terrarium-0 | 289 | 57.0 | 33.3 | 33.4 |

Quality steps taken by the runtime adapt:
- none

## The world behind the page (src/world/), high tier

| figure | frames | avg fps | p95 frame (ms) | worst frame (ms) |
|---|---|---|---|---|
| world: base camp (mountain, dpr 1) | 291 | 57.2 | 16.8 | 50.0 |
| world: ice field (field, dpr 1) | 296 | 58.8 | 16.8 | 33.4 |
| world: beside Terrarium (mountain, dpr 1) | 158 | 29.7 | 33.4 | 50.0 |
| world: summit (mountain, dpr 1) | 291 | 58.0 | 16.8 | 50.0 |

Quality steps taken by the world's own adapt:
- [world] lowered quality

## The world, low tier

| figure | frames | avg fps | p95 frame (ms) | worst frame (ms) |
|---|---|---|---|---|
| world: base camp (mountain, dpr 1) | 301 | 60.0 | 16.7 | 16.8 |
| world: ice field (field, dpr 1) | 287 | 57.2 | 16.8 | 50.0 |
| world: beside Terrarium (mountain, dpr 1) | 110 | 24.2 | 50.0 | 50.0 |
| world: summit (mountain, dpr 1) | 301 | 60.0 | 16.8 | 16.8 |

## The world under a 4x CPU slowdown (high tier)

| figure | frames | avg fps | p95 frame (ms) | worst frame (ms) |
|---|---|---|---|---|
| world: base camp (mountain, dpr 1) | 143 | 33.8 | 50.0 | 50.0 |
| world: ice field (field, dpr 1) | 100 | 25.1 | 50.0 | 50.0 |
| world: beside Terrarium (mountain, dpr 1) | 50 | 20.3 | 50.0 | 50.0 |
| world: summit (mountain, dpr 1) | 111 | 37.2 | 50.0 | 50.0 |

Quality steps taken by the world's own adapt:
- [world] lowered quality

## Laptop proxy: the iceberg at high tier under a 4x CPU slowdown

| figure | frames | avg fps | p95 frame (ms) | worst frame (ms) |
|---|---|---|---|---|
| iceberg-0 | 67 | 12.5 | 250.0 | 633.3 |

Quality steps taken by the runtime adapt:
- none

The throttle slows only JavaScript and the main thread, not the GPU, so it shows whether the scene's per-frame
CPU work (water simulation, scroll read, overlay drawing) still fits a 16.7 ms frame on a slower processor.

## Verdict

Below the 58 fps target: iceberg-0 57.2 fps, howpolluted-0 55.6 fps, archer-0 56.2 fps, terrarium-0 43.5 fps, ring-0 54.4 fps, howpolluted-0 52.6 fps, archer-0 56.5 fps, terrarium-0 57.0 fps, world: base camp (mountain, dpr 1) 57.2 fps, world: beside Terrarium (mountain, dpr 1) 29.7 fps, world: ice field (field, dpr 1) 57.2 fps, world: beside Terrarium (mountain, dpr 1) 24.2 fps.
The hero under a 4x CPU throttle averages 12.5 fps.
