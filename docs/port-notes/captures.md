# Captures

The BTTRURSLF and BC Window Coverings figures show those sites through recorded clips. The clips are made
by driving each site's own server from outside with Playwright (`scripts/capture/`). No file or line of
code from either project is in this repository, only recorded pixels, a manifest, and the numbers in
`src/data/bttr-stats.json`.

## Encoding

`scripts/capture/lib.mjs` encodes each stage as:
- VP9 WebM and H.264 MP4, 960x600 at 24 fps, with a keyframe every 6 frames so a scroll seek lands
  quickly, and at most 4 s per stage;
- a 1600x1000 WebP still of the stage's last frame, written to `public/stills/`.

Base quality is CRF 42 for VP9 and 32 for H.264. Clips with heavy fog, particles or painted art use a
coarser per-clip CRF so that each tab stays at or under 2.5 MB. ffmpeg is the system binary (WinGet
Gyan.FFmpeg 9.0.2). The site's build never needs it.

The fake cursor is our own SVG arrow (`scripts/capture/cursor.js`). It is injected into the captured page
while recording, so it is burned into the clip in sync with what it clicks.

## BTTRURSLF (`npm run capture:bttr`)

- Source: `C:\Users\Warren\Downloads\BTTRURSLF-v2`, read only, at commit `7bdc26f050892a9f40fea3152ebd7e8951528c54` (captured 2026-10-10).
- It is run with its own Vite dev server and `GEMINI_API_KEY=''`, signed out, at
  `/?preloader=0&intro=0&account=0&sky=clear&time=day#<route>` and a 1440x900 viewport.
- Every AI route is aborted: `/api/*/chat`, `/api/*/scan`, `/api/*/plan`, `/api/explain`,
  `/api/knowledge/exercise`, `/api/knowledge/check`, `/api/sociability/feedback` and
  `generativelanguage.googleapis.com`. The manifest's `blocked` list records any attempt; it was empty.
- localStorage is seeded with BTTRURSLF's own keys, using our own sample words:
  - `bttrurslf:settings:v1` (the comms question already answered);
  - `bttrurslf:knowledge:v1` (a short calculus chat);
  - `bttrurslf:sociability:v1` (a party practice chat);
  - `bttrurslf:map-route:v1` (today's route to six-pack).

| stage | route | what drives it |
|---|---|---|
| 0 | `#/appearance` | The cursor glides over each `.pz` piece, so it wipes and unfolds. The closed pieces are cropped first. |
| 1 | `#/appearance` | The cursor glides to `.mer__ask` (Mereum's bulb; his figure has no click handler) and clicks. |
| 2 | `#/appearance` | Waits for `.mer__figure[data-pose="talk"]`, then `li.mer__act` ("Let’s go"), then the idle pose. The open cards are cropped with their rects. |
| 3 to 5 | `#/shop` | `window.__shopHub.scroll.jump(px)` across `marks.asm1`, `marks.lit` and `tubeMarks.from..rest`. |
| 6 | `#/shop/market` | The cursor glides over `.shm-grid`. |
| 7 to 9 | `#/motivator`, `/quotes`, `/edits?tab=daily` | Intro skipped with `.mh-intro__skip`. One wheel step in the edits feed (muted). |
| 10 | `#/knowledge?s=math&tab=picks` | Seeded chat, then `#kn-q` is focused. |
| 11 | `#/sociability?view=practice` | Seeded practice chat. |
| 12 | `#/map` | The route-drawing intro (`.bm.is-intro`, about 24 s), time-compressed to 4 s. |
| 13 | `#/map` | The finished map. |
| 14 | n/a | Stats are DOM on the portfolio, from `src/data/bttr-stats.json`. |
