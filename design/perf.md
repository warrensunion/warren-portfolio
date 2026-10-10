# Figure frame rates

Measured 2026-10-10 by `npm run perf` (scripts/perf.mjs) on the built page (`vite preview`).
Each figure is scrolled into view at 1440x900 (device pixel ratio 1), goes live, warms up for 1.5 s, then its
own frame times are recorded for 5 s through `ctx.frame` into `window.__figStats`. Average fps is frames
divided by summed frame time; p95 is the 95th percentile of the individual frame times.

## Hardware

- GPU (WebGL renderer string): ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 (0x00002503) Direct3D11 vs_5_0 ps_5_0, D3D11)
- CPU: Intel(R) Core(TM) i5-9400F CPU @ 2.90GHz (6 logical cores), 16 GB RAM, win32 10.0.19045
- Browser: Playwright Chromium 156.0.8078.4, headless with --use-angle=d3d11 --enable-gpu --ignore-gpu-blocklist.

This is a desktop GPU, not the laptop the spec names, so the high tier numbers here are a ceiling. The low tier
and the 4x CPU throttle run below are the honest stand-ins for a laptop. Headless Chromium paces
requestAnimationFrame at 60 Hz, so 60 fps is the most any row can show.

## High tier (?tier=high, what a desktop with more than 4 cores gets)

| figure | frames | avg fps | p95 frame (ms) | worst frame (ms) |
|---|---|---|---|---|
| iceberg-0 | 299 | 59.6 | 16.7 | 49.9 |
| iceblock-0 | 302 | 60.0 | 16.7 | 16.8 |
| iceblock-1 | 301 | 60.0 | 16.7 | 16.8 |
| iceblock-2 | 300 | 60.0 | 16.7 | 16.8 |
| ring-0 | 301 | 60.0 | 16.8 | 16.8 |

Quality steps taken by the runtime adapt:
- none

## Low tier (?tier=low, what phones, touch screens and machines with 4 cores or fewer get)

| figure | frames | avg fps | p95 frame (ms) | worst frame (ms) |
|---|---|---|---|---|
| iceberg-0 | 301 | 60.0 | 16.7 | 16.8 |
| iceblock-0 | 301 | 60.0 | 16.8 | 16.8 |
| iceblock-1 | 301 | 60.0 | 16.8 | 16.8 |
| iceblock-2 | 300 | 60.0 | 16.8 | 16.8 |
| ring-0 | 301 | 60.0 | 16.8 | 16.8 |

Quality steps taken by the runtime adapt:
- none

## Laptop proxy: hero at high tier under a 4x CPU slowdown

| figure | frames | avg fps | p95 frame (ms) | worst frame (ms) |
|---|---|---|---|---|
| iceberg-0 | 293 | 58.4 | 16.8 | 50.0 |

Quality steps taken by the runtime adapt:
- none

The throttle slows only JavaScript and the main thread, not the GPU, so it shows whether the scene's per-frame
CPU work (water simulation, scroll read, overlay drawing) still fits a 16.7 ms frame on a slower processor.

## Verdict

Every figure averages 58 fps or more at both tiers on this machine.
The hero still averages 58.4 fps under a 4x CPU throttle.
