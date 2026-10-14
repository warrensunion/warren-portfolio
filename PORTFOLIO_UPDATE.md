# Portfolio update, 2026-10-14

Done while you were away. Calls I made on my own are marked **Decision**.

## Live URLs

| what | live | repo |
|---|---|---|
| Portfolio | https://warrensunion.github.io/warren-portfolio/ | https://github.com/warrensunion/warren-portfolio |
| Drift | https://warrensunion.github.io/drift/ | https://github.com/warrensunion/drift |
| Stress Test | https://warrensunion.github.io/stress-test/ | https://github.com/warrensunion/stress-test |
| Raingarden | https://warrensunion.github.io/raingarden/ | https://github.com/warrensunion/raingarden |
| Ghostline | https://warrensunion.github.io/ghostline/ | https://github.com/warrensunion/ghostline (default branch `master`) |

All five return HTTP 200. Each new demo was opened in Chromium with Playwright and used end to end, with no
page errors, console errors or failed requests (see "Checks" for the benign noise).

## What changed on the page

**Decision: the order.**
1. **Building:** BTTRURSLF, still the biggest track, first.
2. **Projects:** Drift, Stress Test, Raingarden, Ghostline, Terrarium, then HowPolluted and Archer Hero as
   compact cards.
3. **Work:** BC Window Coverings.

Why this order:
- Drift leads Projects. It has the most to show (a trained model, ONNX in a worker, WebGPU), its validation
  numbers are honest, and it ties to your OceanWise-funded research.
- Stress Test comes second. Systems design is what software engineering co-op reviewers look for, and its
  simulator is checked against M/M/1 theory.
- Raingarden is third: on-device ML, a hydrology sim and an optimizer, plus the Traction Initiative tie-in.
- Ghostline is fourth. It is the third ML project, so it goes after the systems project rather than next to
  Drift.
- BC Window Coverings moved below Projects. It isn't deployed, so its last stage can't be live yet. Move it
  back up once it is.

**Decision: full tracks or compact cards.**
- Nine full tracks would have been about 50 stages, more than 40 screens of scroll.
- Seven keep full tracks: BTTRURSLF, the four new projects, Terrarium and BC Window Coverings. That is 41
  stages, close to the old 34.
- HowPolluted and Archer Hero became compact cards: the same text-beside-plate entry layout, with no rail.
  Each card's plate is the track figure's own live demo, pinned at its last, playable stage. You can still
  clean up the litter pile and play the archer stage, and they cost no scroll. Without JS, and under reduced
  motion, each card shows that stage's still.

**New tracks.** Each has three recorded clips scrubbed by scroll and a fourth stage:
- **Drift:** fragments on a flat world chart, replayed from your model's own output (`public/drift/tracks.json`).
  - Exported offline by running Drift's `ensemble.js` with the shipped ONNX model in Node.
  - Four drop sites, 40 simulated copies each, ten years. Pick a site with the buttons.
  - The chart is labelled as model output, and the caption says it is a simulation, not observations or a
    forecast.
- **Stress Test:** the "Deliberately bad design" preset as tiles, from the real simulator's results at seed 42
  over 15 load levels.
  - It ramps on its own; dragging the slider takes over.
  - The database turns red and pulses as it saturates at 860 req/s.
  - The readout shows offered load, p99 and the drop rate.
- **Raingarden:** the app's own before/after frames of the same storm, with a drag handle (or arrow keys) and
  2D rain. The readout is the app's "2,524 of 2,722 L caught".
- **Ghostline:** four clips and no demo. The game is one click away on its live link.

**Updated tracks:**
- **BTTRURSLF:** recaptured, with seven tabs: Climb, Mereum, Face scan, BTTRmap, BTTRshop, Pro and Stats.
  - New copy covers the climb menu, Mereum's hub, the face scan, BTTRmap's A*, Stripe Pro, and one line on the
    female version.
  - The Appearance puzzle cards still work; they moved to stage 4.
  - The Motivator tab was dropped to stay at 15 stages.
  - No repo link and no source code from it, as before.
- **BC Window Coverings:** recaptured from the latest commit (`light-green-refresh` at `065f36e`): loader,
  gallery, time of day, faux wood blind, configurator.
  - The copy now has a real number: desktop Lighthouse performance on the configurator went from 47 to 98,
    from bcwc's `docs/PERF.md` with its conditions.
  - "Blind transition" was dropped because it rendered as a flat green panel in headless Chromium.

**Other changes:**
- **Bio:** "I study Software Engineering at the University of Waterloo, after MacNeill Secondary in Richmond,
  BC. I'm building BTTRURSLF, and I make ML and simulation projects and websites." The meta description was
  updated to match.
- **Project links:** each project has "Live demo" and "Code" links under its tags where public. Terrarium and
  HowPolluted got "Code", Archer Hero "Play on Roblox". There are no links to the private BTTRURSLF or bcwc
  repos, and a test enforces that.
- **Ring:** nine objects in page order. The four new ones are generated marble renders matching the existing
  set: a bottle, a pressure gauge, a rain garden and a ghost archer. All nine reduced-motion posters were
  reshot.
- **Hosting:**
  - The portfolio wasn't hosted anywhere (no Pages, no other deploy), so it now deploys to GitHub Pages from
    `main` through `.github/workflows/pages.yml`, which runs `npm test` and then the build.
  - Content paths are relative and figures use `import.meta.env.BASE_URL`, so the same code works at `/`
    locally and at `/warren-portfolio/`.
- **BTTRURSLF stats:** the prebuild refreshed them from your BTTRURSLF repo (2 accounts, 34 routes, 640
  tests, measured 2026-10-14).
  - It counts the repo's working tree, which right now includes the uncommitted female-version work.

**Stack rules kept:**
- Vite and vanilla ES modules, three.js the only runtime dependency.
- The new demos are 2D canvases (weight 0 in the context budget). Each one is fetched only when its stage
  first comes up.
- The page reads fully without JS, every TODO shows, and there are zero em dashes (tested).

## The four new repos

For each repo:
- **Secrets:** scanned (working tree and full history) for keys, tokens, `.env` files and private keys. All
  four were clean.
- **Large files:** no tracked file over 10 MB.
- **`.gitignore`:** extended (env files, test output, caches).
- **README:** written or improved, with a live demo link.
- **Deploy:** a Pages workflow added. Only deploy config changed, and no history was rewritten.

| repo | deploy changes |
|---|---|
| drift | `base` for Pages only. Every path already used `BASE_URL`. |
| stress-test | `base` for Pages only. |
| raingarden | `base` for Pages, plus root-absolute asset paths in 11 files moved onto `BASE_URL`. The workflow runs `npm run fetch-models`, so the depth model ships: Depth Anything V2 Small, Apache-2.0, about 110 MB, none of it over 50 MB. The site is 146 MB, under Pages' 1 GB limit. |
| ghostline | Nothing in the app: it already used `base: './'`. The workflow adds `.nojekyll`. |

Test runs:
- drift: 104 of 104 pass.
- stress-test: 69 of 69 pass.
- raingarden: 174 of 174 pass.
- **ghostline: 82 of 83 pass at HEAD.** The failure is in `test/train.test.js:59`, the clone test's "ghost
  shoots back" threshold: the ghost fired 14 against the 14.5 needed. My changes there were README,
  .gitignore and the workflow only, so they cannot cause it; app code was out of scope, so it isn't fixed.

## Left out, and why

- **No link to bttrurslf.com.**
  - The domain redirects to a Porkbun parking page, so the Railway deploy isn't reachable there.
  - GitHub has no `main` branch for Railway to deploy: the default branch is `settings-cleanup`.
  - The BTTRURSLF clips were recorded from a `git archive` export of local `main` (`4c01485`), with every AI,
    auth and payment route blocked. Nothing on Stripe was touched.
- **No live frame for BC Window Coverings.** It isn't deployed:
  - `bcwc.vercel.app` and its variants are 404.
  - bcwindowcoverings.com is still the old Wix site.
  - The last stage stays a still, and the "link to the live site" TODO stays visible.
- **The uncommitted bcwc work isn't in the clips** (off-white background, solid logo, new photos). Commit it
  and run `npm run capture:bcwc` if that is the version you want shown.
- **Drift's BC drop site is off Juan de Fuca Strait, not in Richmond.** On the model's 1-degree current grid,
  the Strait of Georgia is land. The Salish Sea clip covers the Fraser River mouth.
- **Ghostline's recorded ghost learned from a mix of data:** 993 frames of scripted play plus 3,864 frames of
  the app's own bot.
  - A ghost trained only on scripted play never shot back.
  - The caption says this, and the copy doesn't claim it learned from a person.

## Checks

- `npm test`: all pass (including new tests).
  - Cards and pinned stages.
  - Live-demo and code links on every new project.
  - No private repo links.
  - The new section, track and ring order.
- `npm run build`: passes.
- `npm run check`: Playwright in Chromium with the real GPU, now with a `clips` group for the new tracks
  (clips play, demos draw from their data, the slider, site buttons, the wheel).
  - Also run at 1440x900, 1920x1080, 1366x768, 1280x640 and 390x844.
  - Covered: sticky tracks, no sideways scroll, no JS, `?static=1`, reduced motion, no WebGL2, context loss,
    the budget, fast scrolling and the BTTRURSLF tabs.
  - The final run's result is below.
- Benign noise on the live demos:
  - Drift: "WebGPU is not available" in headless Chromium; it falls back to WebGL2 as designed.
  - Raingarden: three story preloads cancelled when the page jumps into the designer.

Final run on 2026-10-14, before committing:
- `npm test`: 122 passed, 0 failed.
- `npm run build`: passed.
- `npm run check`: 167 passed, 0 failed.
- Every external link on the page answered HTTP 200, except LinkedIn, which answers its usual 999 to scripts.

Live site, after deploying (run e2ff716):
- Checked in Chromium at 1440x900 and at 390x844 as a phone, then under reduced motion and with JS off.
- No console or page errors, no 4xx or 5xx responses, and no sideways scroll (scrollWidth 1440 and 390).
- The Drift, Stress Test and Raingarden demos drew from their data on the live page.
- The first deploy turned up one bug the local checks could not see: the ring's object samples are fetched
  in a worker, so their relative paths 404ed under . Fixed in e2ff716 and redeployed.
- To build for the subpath on this Windows machine, set  in Git Bash. Otherwise
  Git Bash rewrites  into a Windows path. CI on Linux is unaffected.

## TODOs for you

1. **Role and dates** for every project, one real **stat** per figure caption, the **co-op term**, contests
   and awards, and a real résumé PDF: still visible `[TODO]`s, as before.
2. **BTTRURSLF:**
   - Push `main` to GitHub and point bttrurslf.com's DNS at Railway.
   - Then consider a live link (the site, not the repo).
3. **BC Window Coverings:**
   - Deploy it.
   - Set `fig.data.liveUrl` in `src/content.js` and check that its headers allow framing.
   - The public repo `warrensunion/bc-window-coverings` is empty; publish to it or delete it.
   - One side effect of my agent's `git lfs` check: an empty `[lfs]` section in `bcwc/.git/config`. Remove it
     with `git -C Projects/bcwc config --local --remove-section lfs`.
4. **Third-party screenshots in public history:**
   - raingarden: 110 files under `design-reference/makemepulse/`.
   - ghostline: 20 files under `design-reference/makemepulse/stills/`.
   - These are screenshots of 2019.makemepulse.com. Remove them in a new commit (they stay in history), or
     rewrite history if that matters to you.
5. **No LICENSE** in drift, ghostline, raingarden or stress-test. Add one if you want others to reuse the code.
6. **Em dashes inside the apps' own UI copy:**
   - stress-test: the applied log.
   - ghostline: the "Record at least 1,500 frames" hint.
   - I didn't touch app code.
7. **Ghostline:** fix or loosen the failing clone test, `test/train.test.js:59`.
8. **Drift:** a longer model-load timeout for slow phones. On a busy machine the app gave up on the model
   after 20 s and fell back to plain advection.
9. **Terrarium and HowPolluted** have public repos but no live demo link. Deploy them the same way if you like.
10. **Marble renders** for the Terrarium jar and HowPolluted globe in the ring are still placeholder
    silhouettes. See the README.
