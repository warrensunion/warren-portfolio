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

- Source: BTTRURSLF-v2 (private, read only) at commit `4c01485f691741e6853240e922f9bf7c43ecedc4`, the
  local `main` (the branch Railway is set to deploy, per its `docs/deploy.md`), captured 2026-10-14.
  GitHub has no `main` branch yet and `https://bttrurslf.com` still answers with Porkbun's parking page
  (a 302 to `bttrurslf-com.l.ink`), so nothing was captured from a live deploy.
- The working tree (branch `overnight-female`, uncommitted changes) is not used. The commit is exported
  untouched with `git -C <repo> archive <commit> | tar -x -C <scratch>`, then `npm ci` there; its
  `public/mediapipe/` (gitignored, 0.10.35) is copied from the repo's own and verified with
  `node scripts/fetch-mediapipe.mjs --check`. Run with
  `BTTRURSLF_SRC=<scratch> BTTRURSLF_COMMIT=<sha> node scripts/capture/bttr.mjs [--only=climb,mereum,scan,map,shop,pro]`.
- Its own Vite dev server on port 4395, no `.env` (accounts offline), `GEMINI_API_KEY=''`, signed out,
  at `/?preloader=0&intro=0&account=0&sky=clear&time=day#<route>` and a 1440x900 viewport.
- Aborted, and logged in the manifest's `blocked`: `/api/*/chat`, `/api/*/scan`, `/api/*/plan`,
  `/api/explain`, `/api/knowledge/exercise`, `/api/knowledge/check`, `/api/sociability/**`, `/api/pro/**`,
  `/api/stripe/**`, `/api/_dev/**`, `/api/ads/**`, `/api/auth/**`, `/api/_challenge`, `*stripe.com`,
  `*stripe.network` and `generativelanguage.googleapis.com`. The run logged three: the face scan's proof
  of work (twice) and its read (`/api/face/scan`), so the analysis shows its own measurements and "No
  words this time". Nothing touches Stripe: Pro is shown signed out, where it offers "Sign in to go Pro",
  and nothing on it is clicked.
- Knowledge's Picks load YouTube thumbnails (other people's pictures): `i.ytimg.com` is answered with a
  plain grey tile.
- The face scan's camera is a fake written in the capture script: `getUserMedia` returns a canvas stream
  of BTTRURSLF's own grey clay head render (`public/appearance/fit-front.webp`, app art, not a person),
  turned by a sphere remap when the camera's arrow asks for a turn. No photo of a person is used. Chromium
  also runs with `--use-fake-ui-for-media-stream --use-fake-device-for-media-stream`.
- localStorage is seeded with BTTRURSLF's own keys: `bttrurslf:settings:v1` (the comms question
  answered; `puzzle: false` for the scan session so the cards are open), `bttrurslf:climb:v1` (a guest's
  10-day climb on day 2 or day 10, and the summit's line marked heard) and `bttr.shop.instant` = `'0'`.
- The machine was shared with other captures, so steps ran slower than real time; each clip is the
  marked span time-compressed to 4 s (`speed` = span / 4), except stage 2, which is 4 s in real time.

| stage | route | what drives it |
|---|---|---|
| 0 | `#/` (no climb) | Scene 1: the cursor glides to `.clm-s1__go` (BEGIN JOURNEY) and clicks; `.clm-goal__date` is filled 30 days out; `.clm-goal__yes`; waits for `.clm-pass` to leave and every `.menu img` to decode on The Trailhead. |
| 1 | `#/`, climb on day 2 | The Lake by day; its first-arrival line types out; the cursor hovers Mereum, then Onix (`.thing`), for the sticker outline and name. |
| 2 | `#/` with `time=night&code=73`, day 10 | The Summit's night plate and night-lit guides (`.thing.has-night`) in snow; the cursor rests on the BTTRmap link. |
| 3 | `#/appearance` | The closed `.pz` pieces are cropped, the cursor glides over each to unfold it, then clicks `.mer__ask`; waits for `li.mer__act`. The open cards are cropped with their rects (`manifest.cards`, `mereum/cards/`). |
| 4 | `#/sociability` | The cursor unfolds Interview prep, Speaking and Active listening, then clicks "A grieving friend" (nothing is started). |
| 5 | `#/knowledge?s=math&tab=picks` | The cursor unfolds Exercise, Resources and Picks and rests on "Ask Mereum anything". |
| 6 to 8 | `#/appearance` (puzzle off) | Front scan card, the consent box and Agree, `.scan__cam`; the loop follows `.scan-cam` `data-phase` and the arrow's `data-icon`, turning the fake head; after 20 s stuck it presses `.scan-cam__anyway`. 6 ends as the ring phase (`fill`) starts, 7 ends on the analysis (`.fa`), 8 drags the 3D mask and opens a row. |
| 9 | `#/map` | BTTRtasks: `.bm-scope[data-scope="everywhere"]`; the route draws along the streets. |
| 10 | `#/map` | BTTRday: the first goal chip matching 6-pack, Build muscle or Run a 5K in `.bm-panel--day`, then Generate; the day's route draws. |
| 11 | `#/shop?at=face` | `window.__shopHub.scroll.jump(px)` from the Face block to `marks.asm1`, then `marks.lit` (the ring). |
| 12 | `#/shop`, then `#/shop/market` | Jumps through the dive to `tubeMarks.rest` (the B in particles), then the market; the cursor glides over `.shm-grid`. |
| 13 | `#/settings/pro` | The cursor glides over the Free and Pro plans (`.lgpro-plans`). Nothing is clicked. |
| 14 | n/a | Stats are DOM on the portfolio, from `src/data/bttr-stats.json`; its still is kept from 2026-10-10. |

## BC Window Coverings (`npm run capture:bcwc`)

- bcwc is not deployed (checked 2026-10-14: no GitHub deployments or environments, `bcwc.vercel.app` and
  `bc-window-coverings.vercel.app` answer `DEPLOYMENT_NOT_FOUND`, and `bcwindowcoverings.com` is still the
  family's old Wix site). The clips come from a local build.
- Source: `C:\Users\Warren\Downloads\Projects\bcwc`, not modified. Captured state: commit
  `065f36e7c08c4c168e29672af5b87d212566b43a`, the head of branch `light-green-refresh` (2026-10-11), the
  latest commit on the most recent branch. The folder's working tree has a further uncommitted pass (off-white background, solid logo, new photos, performance; its
  `CHANGES.md`) that is not in these clips.
- That commit was exported with `git archive` into a scratch folder outside both repositories, built there
  with `npm ci && npm run build:static`, and served by its own `vite preview` on port 4380
  (`BCWC_DIR=<folder> BCWC_COMMIT=<sha> npm run capture:bcwc`), at a 1440x900 viewport.
- bcwc skips its cinematic loader when `navigator.webdriver` is true, so the capture masks that flag to
  show the loader. The loader plays only on the high GPU tier; Chromium with `GPU_ARGS` reports the RTX 3060,
  which qualifies.
- Route changes cover the page with the overlay's blind. In the headless capture it draws as a flat
  deep-green panel with no slats, so the old "blind transition" stage was dropped and each clip starts
  after its route has arrived.
- The recording drops frames when the CPU is saturated, and the short loader can then vanish from the
  video. The script measures the recording's brightness and stops without writing clips when the loader's
  lit room is missing; run it again.
- Captured 2026-10-14: four clips, 2.47 MB together (WebM and MP4), plus five stills. Coarser CRFs than
  the base keep them under 2.5 MB.

| stage | what drives it |
|---|---|
| 0 | `/?intro`. Starts about 1 s before the loader's counter leaves 000, runs through the blind lifting to the home hero, time-compressed to at most 4 s. CRF 45/34. |
| 1 | A click on the Our work nav link. On `/work`, a click on the Blackout filter chip, a few wheel steps, then the first open/closed pair's second button (`.pair-toggle button:nth-of-type(2)`). CRF 47/36 (photos). |
| 2 | A click on the Products nav link. `#ctl-time` sweeps 5 to 21 and back to 16 in 0.25 steps. CRF 46/35. |
| 3 | A click on the Faux wood blinds tile, then its tilt-then-raise range (`[aria-labelledby="ctl-blind-label"]`) sweeps 0 to 100 to 40. CRF 46/35. |
| 4 | A still of `/products` at rest with faux wood selected. The live stage is the iframe once bcwc is deployed. |

## Drift, Stress Test, Raingarden, Ghostline

Recorded on 2026-10-14 from each project's live GitHub Pages demo with the same encoder. Each track has three
clips and a fourth stage that is a still, covered by a small 2D demo once it is live (Ghostline: four clips,
no demo). Coarser per-clip CRFs keep each project's clips at or under 2.5 MB.

| track | source | script | last-stage data |
|---|---|---|---|
| Drift | https://warrensunion.github.io/drift/ at `111ebc5` | `npm run capture:drift` (`-- --tracks` rebuilds the data) | `public/drift/tracks.json`: Drift's own `src/sim/ensemble.js` with the shipped `drift.onnx` in onnxruntime-web, run in Node; 4 drop sites, 40 of 48 lineages each, monthly over 10 years. `public/drift/land.png`: Drift's Natural Earth 1:50m land mask (public domain), 720x360. |
| Stress Test | https://warrensunion.github.io/stress-test/ at `6799412` | `npm run capture:stress-test` | `public/stress-test/sample.json`: `simulate()` and `findSaturation()` from the stress-test source, bundled with esbuild and run in Node, on the "Deliberately bad design" preset at seed 42, 15 load levels from 100 to 1,400 req/s. |
| Raingarden | https://warrensunion.github.io/raingarden/ at `7e1ae70` | `npm run capture:raingarden` | `public/raingarden/before.webp`, `after.webp`: the app's own step 9 at the same storm time, divider pushed to each side. `meta.json`: every number with where it appears in the app. The storm is the heaviest day of the last 30 days, so a later capture picks a different storm. |
| Ghostline | https://warrensunion.github.io/ghostline/ at `23ee029` | `npm run capture:ghostline` | none. The ghost in the clips trained on 993 frames of scripted Playwright play plus 3,864 frames of the app's own `?autoplay=bot` mode, because a ghost trained on scripted play alone never shot back. The caption says so. |

Nothing from these repositories is copied here except the exported data files above and recorded pixels.
