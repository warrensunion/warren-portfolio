# Tracks 7: Ring, README, Perf, Lighthouse, Shots and Comparison Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the redesign:
- the Get in touch ring lists all five projects with their particle shapes and reduced-motion stills;
- the README documents tracks;
- perf and Lighthouse are re-measured and stay near the baseline;
- the shots are retaken;
- side-by-side comparison shots against yuzeli.ca are made at the three sizes.

**Architecture:** Mostly scripts and docs. The ring already derives its links from the entries, and its
objects and posterMorph lists were extended in plan 1.

**Tech Stack:** Playwright, sharp, Lighthouse (already devDependencies).

**Spec:** `docs/superpowers/specs/2026-10-10-project-tracks-design.md` sections 7, 9 and 10.

## Global Constraints

- The Lighthouse baseline (`design/lighthouse.json`, before this work) is performance 100, FCP 0.5 s,
  LCP 0.6 s, TBT 30 ms and CLS 0. The target is a median performance of at least 95, with CLS ≤ 0.02 and
  TBT ≤ 150 ms. If the target is missed, find the cause (e.g. an eager still or a font) and fix it. Do not
  relax the target.
- Comparison shots use the same viewport, `deviceScaleFactor: 1` and the same named positions on both
  sites. They show yuzeli.ca only in `design/compare/` for Warren's review. Nothing from it ships.
- No new dependencies.

## Review Focus

1. **Ring morph to a placeholder object.** The particles grow from the placeholder silhouettes, and the
   reduced-motion stills ws-3 and ws-4 exist and are not blank. Test in Task 1.
2. **README "Add a project" steps still true for tracks.** A dry run of the steps (in a scratch branch)
   with a fake sixth track renders, checks and shoots. Covered by Task 2's review.
3. **Lighthouse on a phone layout.** Run one mobile Lighthouse pass too, and record the score in perf.md
   for information (no gate).
4. **Comparison at 390.** yuzeli.ca uses a different breakpoint (881 vs 860), so the 390 shots compare
   single-column layouts. Note that in `design/compare/README.md`.
5. **Fonts from HowPolluted.** They load only with that figure. A Lighthouse network check: the
   first-load requests contain no `archivo` or `montserrat`. Test in Task 3.

---

### Task 1: Ring posters and check

- [ ] **Step 1:** `npm run posters -- --only=ws,ws-0,ws-1,ws-2,ws-3,ws-4`. Read ws-3 and ws-4.
- [ ] **Step 2:** check-figures: in the reduced-motion check, hovering each of the 5 contact links
  cross-fades to its still (extend the existing morph check from 3 to 5 links).
- [ ] **Step 3:** `npm run check`. Expected: PASS.
- [ ] **Step 4: Commit** `git commit -m "Ring: five projects, five particle shapes and stills"`.

### Task 2: README

- [ ] **Step 1:** Update README:
  - the intro (tracks instead of ice blocks);
  - the Check table (the new checks, the stats, capture and sync scripts);
  - the TODO table: Terrarium and HowPolluted role, dates and numbers; the marble art for terrarium-jar
    and howpolluted-globe; the bcwc deploy URL; Archer release status and player count;
  - "Add a project" (track entries, stage stills, ring order, posters and stills);
  - "How the figures behave" (tracks, weights, data-running, stage stills);
  - Files.
  - Keep the voice: plain, no em dashes.
- [ ] **Step 2: Commit** `git commit -m "README: tracks, captures, stats and the new TODOs"`.

### Task 3: Perf and Lighthouse

- [ ] **Step 1:** `npm run perf`. Every live figure is in the table. Read design/perf.md.
- [ ] **Step 2:** `npm run lighthouse`. Expected: median at least 95, CLS ≤ 0.02, TBT ≤ 150 ms. Also scan
  the saved report's network requests for `archivo|montserrat|captures/|terrarium/|howpolluted/`. Expected:
  none on first load.
- [ ] **Step 3: Commit** `git commit -m "Re-measure frame rates and Lighthouse after the tracks"`.

### Task 4: Shots and the yuzeli.ca comparison

**Files:**
- Create: `scripts/compare.mjs` (`npm run compare`), `design/compare/README.md`

**Interfaces:**
- Positions on both sites:
  - `top`;
  - `work` (the first entry's text top at 96);
  - `feature` (the TopsOJ heading, and our BTTRURSLF heading);
  - `project` (Cardboard Cockpit, and our Terrarium at stage 0);
  - `project-mid` (the same, scrolled half a viewport);
  - `contact`.
- Output: `design/compare/<w>x<h>-<pos>.png`, with yuzeli on the left and ours on the right, a 16 px
  paper-coloured gutter between them, and a 24 px label strip on top ("yuzeli.ca" / "this site", Plex Mono).

- [ ] **Step 1:** `npm run shoot`. Read the 1440 shots of every track's first and last stages.
- [ ] **Step 2:** Implement compare.mjs and run it. Read every comparison image. Note in
  `design/compare/README.md` what matches (sticky top, release, grid) and what differs on purpose.
- [ ] **Step 3: Commit** `git commit -m "Shots and side-by-side comparison with yuzeli.ca"`.
