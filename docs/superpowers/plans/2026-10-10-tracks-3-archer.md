# Tracks 3: Archer Hero Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A small, playable Archer Hero stage built in three.js for the Archer Hero track. Scroll first
shows a fly-in and an attract-mode demo in which the archer clears a wave and a boss on its own. Then the
visitor plays one short stage with WASD, mouse, Q, E or touch, and ends at a link to the full game on
Roblox.

**Architecture:**
- A pure, seeded game simulation (`sim.js`, no three, no DOM) is unit-tested in Node, together with an
  attract-mode policy that produces the same inputs a player would.
- A three.js view renders the state with original, procedurally built low-poly models.
- A DOM HUD sits over the canvas.
- Input is scoped to the focused figure.
- One WebGL context.

**Tech Stack:** three@0.180.0, DOM/SVG HUD, node:test, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-10-project-tracks-design.md` section 5.5, plus sections 3.7 and 9.

## Global Constraints

- Original models only. No Roblox assets, logos or UI art. Everything is built from three primitives with
  flat shading.
- The look follows `design/reference/archer/archer-gameplay-1.png`:
  - a pale dirt path running into the distance;
  - bright green grass;
  - teal-green blocky cliffs on both sides;
  - blocky broadleaf trees and pines;
  - wooden post-and-rail fences;
  - red-capped white-spotted mushrooms;
  - pale grey-blue faceted rocks;
  - a blue sky with white clouds;
  - a translucent red-orange attack disc around the archer;
  - a white target ring on the current enemy;
  - white bold damage numbers.
- HUD copy:
  - top centre: "Stage 1", and below it "N left";
  - top left: coins;
  - bottom centre panel: a heart, a health bar and "100/100", then "Your level" with a level diamond and
    an XP bar;
  - bottom right: a Q button "Dodge" and a larger E button (arrow rain), each with a cooldown ring.
- Numbers:
  - archer: HP 100, move 6 u/s, attack radius 7 u, fires every 0.55 s, arrow 26 u/s, 10 damage;
  - dodge (Q): 4 u dash over 0.22 s, invulnerable while dashing, 3 s cooldown;
  - arrow rain (E): 3 u radius at the current target, 6 hits of 12 damage over 1.2 s, 8 s cooldown;
  - XP: 20 per kill, 100 per level;
  - coins: 5 per kill, 50 for the boss;
  - enemies: HP 30 + 10×(level−1), 2.6 u/s, melee 8 damage every 1.0 s within 1.3 u;
  - boss: level 5, HP 300, 2.0 u/s, 18 damage every 1.4 s within 2.0 u.
- The stage: wave 1 is 3 enemies at Lv 1, wave 2 is 4 enemies at Lv 1 or 2, then the boss. "N left" counts
  every enemy left in the stage, boss included: it starts at 8.
- Input:
  - keys are listened to on the figure element, only while it is focused;
  - `preventDefault` on WASD, the arrows, Space, Q and E only while focused and playing;
  - Esc exits pointer lock (the browser's own behaviour); Esc again, or Esc when not locked, blurs the
    figure;
  - no `wheel` handler;
  - `touch-action: pan-y` on the stage, and `none` only on the 120 px stick.
- Stages: `x = ctx.progress() * 3`.
  - Stage 0 (Valley) is a camera fly-in over `x` 0..1.
  - Stage 1 (Auto-aim) is the attract mode: it plays in real time while the figure is running and starts
    from a fresh seed-7 state when stage 1 is entered.
  - Stage 2 (Boss) is the attract mode from a state with the waves cleared and the boss spawned.
  - Stage 3 (Your turn) is the "Click to play" overlay, then visitor control from a fresh state.
- Release status and player count are not shown in the figure. The Roblox link text is "Play the full game
  on Roblox", with `target="_blank" rel="noopener"`, using `ctx.data.roblox`.
- No new dependencies. One WebGL context, disposed with `forceContextLoss()`.

## Review Focus

1. **Pointer Lock refused** (headless, iframe policy, or the visitor declines). Mouse turning falls back
   to drag-to-turn and the game still plays. Test in Task 5's check: stub
   `requestPointerLock` to throw, then a drag changes yaw.
2. **The visitor scrolls away mid-game.** The figure stops (the host's `stop()`): the sim pauses, keys are
   released, and no key stays "held" when the visitor returns. Test in Task 3
   (`input: blur clears held keys`) and Task 5's check.
3. **Typing in the page's own controls while the game is focused elsewhere.** Keys are only read when the
   event target is the figure. Test in Task 5's check: focus the contact email button, press W, and the
   archer does not move.
4. **Both cooldowns used at once at the same frame as a death.** `step` handles a lethal hit and a dodge in
   the same tick by applying dodge first when it was pressed that tick. Test in Task 1.
5. **Losing.** HP reaches 0, the sim reports `lost`, and the end panel offers "Play again" and the Roblox
   link. Test in Task 1 (sim) and Task 5 (check that the panel appears via `?debug=1`'s `__archer.kill()`).

---

### Task 1: Game simulation (pure)

**Files:**
- Create: `src/figures/archer/sim.js`, `src/figures/archer/rng.js`
- Test: `scripts/test-archer.mjs`

**Interfaces:**
- Produces:
  - `createGame({ seed }) -> state`. The state holds `{ t, archer, enemies, arrows, rains, hits, wave,
    left, coins, xp, level, status: 'playing'|'won'|'lost' }`.
  - `archer` is `{ x, z, yaw, hp, maxHp, dodgeCd, rainCd, dashT, target }`.
  - Each enemy is `{ id, x, z, hp, maxHp, level, boss, atkCd }`.
  - `step(state, input, dt) -> state` (mutates and returns). `input` is `{ mx, mz, yaw, dodge, rain }`;
    `mx` and `mz` are in −1..1 in camera space, rotated by `yaw`.
  - `hits` is a list of `{ x, y, z, amount, age }` for damage numbers, dropped after 0.9 s.
  - `nearestInRange(state) -> enemy | null`.
  - `spawnBoss(state)` clears the waves and spawns the boss. The attract stage 2 uses it.
- The world is a path running along +z from 0 to 120, 10 u wide, with the archer clamped to |x| ≤ 6.
  Waves spawn ahead of the archer (z + 18..26).
- `rng.js` exports `mulberry32(seed) -> () => number`.

- [ ] **Step 1: Failing tests:**
  - `sim: archer auto-aims the nearest enemy in range`: with enemies at distance 5 and 3, the target is
    the one at 3. With one at 9, the target is null.
  - `sim: arrows deal 10 and kills give 20 XP and 5 coins`: step until the first kill. XP is 20, coins 5,
    and `left` is 7.
  - `sim: dodge is invulnerable and has a 3 s cooldown`: an enemy in melee range and dodge pressed, so the
    hp is unchanged during the 0.22 s dash. `dodgeCd` is about 3 after the press, and pressing again at
    1 s does nothing.
  - `sim: dodge pressed on the lethal tick saves the archer`: hp 5, an enemy attack due this tick and
    dodge pressed, so after the step hp is 5 and status is 'playing'.
  - `sim: arrow rain hits everything within 3 u of the target 6 times`: three enemies inside and one
    outside. The inside ones lose 72 each (or die), the outside one is unchanged, and `rainCd` is about 8.
  - `sim: level up at 100 XP`: 5 kills give level 2 and xp 0.
  - `sim: killing the boss wins; hp 0 loses`.
  - `sim: same seed, same run`: 600 steps with the same inputs give deepEqual states.
- [ ] **Step 2: Run** `node --test scripts/test-archer.mjs`. Expected: FAIL.
- [ ] **Step 3: Implement** `sim.js` with the Global Constraints numbers.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "Archer: a seeded game simulation with auto-aim, dodge and arrow rain"`.

### Task 2: Attract-mode policy

**Files:**
- Create: `src/figures/archer/attract.js`
- Test: `scripts/test-archer.mjs`

**Interfaces:**
- Produces `attractInput(state) -> input`:
  - walk +z when no enemy is in range;
  - strafe away (back and sideways) when the nearest enemy is within 2.5 u;
  - press E when 3 or more enemies are within 3 u of the target, or when the target is the boss;
  - press Q when an enemy attack lands within 0.15 s and dodge is ready.

- [ ] **Step 1: Failing test** `attract: clears the stage alone within 90 simulated seconds`: from
  `createGame({ seed: 7 })`, step at 1/60 with `attractInput`. The status is 'won' within 5,400 steps
  and hp > 0.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** If the test fails on balance, tune only the policy (not the Global
  Constraints numbers) and ledger it.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "Archer: attract mode clears the stage on its own"`.

### Task 3: Input

**Files:**
- Create: `src/figures/archer/input.js`
- Test: `scripts/test-archer.mjs` (the pure parts)

**Interfaces:**
- Produces:
  - `keyMap(code) -> 'up'|'down'|'left'|'right'|'dodge'|'rain'|null`. KeyW and ArrowUp give up; KeyS and
    ArrowDown down; KeyA and ArrowLeft left; KeyD and ArrowRight right; KeyQ dodge; KeyE rain.
  - `createInput(el, { onEsc }) -> { read() -> input, playing(bool), clear(), destroy() }`. It listens on
    `el` for keydown and keyup (only when `e.target === el`), pointer lock mouse moves, drag-to-turn as the
    fallback, and the touch stick plus the right-half drag. `clear()` releases all keys. `blur` and
    `visibilitychange` call `clear()`.
  - Mouse sensitivity is 0.0025 rad/px.

- [ ] **Step 1: Failing tests:** `input: keyMap covers WASD, arrows, Q, E and nothing else` (KeyF gives
  null), and `input: blur clears held keys`. For the second, use a minimal fake element with
  `addEventListener` and `dispatch` in Node: dispatch keydown KeyW, then blur, and `read().mz` is 0.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "Archer: focus-scoped keyboard, mouse and touch input"`.

### Task 4: World, actors and HUD (three.js and DOM)

**Files:**
- Create: `src/figures/archer/world.js`, `src/figures/archer/actors.js`, `src/figures/archer/hud.js`,
  `src/figures/archer/figure.css`

**Interfaces:**
- `world.js`: `buildWorld(scene, { tier, seed }) -> { update(t) }`.
  - The ground is a plane with vertex-coloured grass.
  - The path is a ribbon mesh 9 u wide with jittered edges in a pale sand colour.
  - Cliffs: extruded box stacks at x = ±(18..40), teal greens.
  - Trees: about 60 instanced broadleaf (trunk plus 3 to 5 boxy leaf clumps) and pines (stacked cones).
  - Fences: posts and two rails, along x = ±7 for z 0..60, broken in places.
  - About 20 mushrooms (cylinder stem plus a hemisphere cap in red with white dots), about 30 rocks
    (icosahedron with detail 0, scaled flat), and about 200 instanced grass tufts.
  - A sky gradient dome and about 6 flat cloud clusters. Fog matches the sky horizon.
  - The low tier halves the instance counts.
- `actors.js`: `createActors(scene) -> { sync(state, alpha), destroy() }`.
  - The archer is low-poly: box torso and limbs in red tones (original palette), a rounded head, and a bow
    as a torus arc plus a string line. The bow arm aims at the target and there is a walk-cycle limb swing.
  - Enemy: a squat four-legged beast with ears, in a rust colour, built from boxes. The boss is the same
    shape at 2.4x scale in a darker colour with spikes.
  - Arrows are thin cylinders plus a cone tip.
  - Attack disc: a ring geometry of radius 7 at opacity 0.28, in an orange-red, with `depthWrite` false.
  - Target ring: a white ring plus 4 ticks around the target, rotating.
  - Arrow rain: falling arrow instances over the AoE circle.
- `hud.js`: `createHud(el) -> { sync(state, camera, size), showPrompt(text), showEnd(status, robloxUrl,
  onAgain), hidePrompt(), destroy() }`.
  - It builds DOM in a `.ah-hud` layer.
  - Each enemy gets a projected "Lv. N" tag plus a health bar.
  - Damage numbers are projected and rise 30 px while fading over 0.9 s.
  - Cooldown rings are SVG circles with `stroke-dashoffset`.
  - Everything is `pointer-events: none` except the Q and E buttons (tappable), the prompt and the end
    panel.
  - Fonts use the page's own (`--mono` for numbers, the serif for labels). No copied UI art.

- [ ] **Step 1: Implement** the three modules and the CSS.
- [ ] **Step 2: Verify** with a scratch harness (not committed): a page that builds the world and actors
  from `createGame({seed:7})`, served by `vite` and screenshotted with Playwright at 1280x800. Compare it
  side by side with `design/reference/archer/archer-gameplay-1.png` (Read both images) for palette, the
  path, the props and the HUD placement. Adjust colours and sizes until they read the same way.
- [ ] **Step 3: Commit** `git commit -m "Archer: low-poly valley, archer, enemies and HUD"`.

### Task 5: Figure, stages and checks

**Files:**
- Create: `src/figures/archer/figure.js`
- Modify: `src/main.js` (loader `archer`), `scripts/check-figures.mjs`, `scripts/posters.mjs`, `scripts/perf.mjs`

**Interfaces:**
- `create(stage, ctx)` returns `{ start, stop, resize, destroy, readout }`.
- One renderer at DPR `min(dpr, tier high ? 1.5 : 1)`, antialias on the high tier, and a third-person
  camera 7 u behind and 4.5 u above the archer, looking 6 u ahead, following yaw.
- Stage logic as in Global Constraints. The fly-in camera runs from (0, 30, −30) looking down the valley
  to the follow pose.
- The figure element gets `tabindex="0"` from the host once live (the hint span `.fig-hint` is added by
  figure.js into the caption: "Click to play. WASD or arrows move, mouse turns, Q dodges, E rains arrows.
  Esc lets go.").
- "Click to play" sets `playing(true)`, focuses the figure, requests pointer lock (catching failure), and
  starts a fresh game.
- `stop()` pauses the sim and calls `input.clear()`.
- The readout is `Stage 1, <left> left, Lv <n>`.
- `?debug=1` exposes `window.__archer = { state, kill() }`.

- [ ] **Step 1: Write the failing checks** in check-figures.mjs:
  - append `'archer-0'` to `WEBGL_IDS`;
  - add `checkArcher(browser, url)`:
    1. At stage 1 the attract mode moves the archer: `__archer.state.archer.z` increases over 2 s.
    2. Stage 3 shows the prompt.
    3. Without clicking, ArrowDown and Space scroll the page (`scrollY` changes).
    4. Click to play. Holding KeyW for 500 ms moves the archer, and ArrowDown does not change `scrollY`.
    5. A wheel over the canvas changes `scrollY`.
    6. Escape (after pointer-lock refusal is stubbed in an init script by making `requestPointerLock`
       reject) blurs the figure (`document.activeElement !== figure`).
    7. Focus the contact email button and press W: the archer z is unchanged.
    8. `__archer.kill()` shows the end panel, with a link whose href is the Roblox URL.
    9. Scrolling away and back leaves no held key (z is unchanged for 500 ms after returning, without
       input).
- [ ] **Step 2: Run** `npm run check -- --no-build` after a build and confirm the new lines FAIL.
- [ ] **Step 3: Implement** figure.js and the loader.
- [ ] **Step 4: Run** `npm run check`. Expected: all PASS.
- [ ] **Step 5:** posters.mjs: `stills/archer-hero-s<i>` for i in 0..3 (poster mode renders stage i: 0
  is the fly-in end pose, 1 is mid-wave at t=6 s of attract, 2 is the boss at t=4 s, 3 is the prompt).
  perf.mjs: add `archer-0` and confirm avg fps ≥ 55 on the high tier. Run `npm run posters -- --only=...`
  for the four stills and look at each.
- [ ] **Step 6: Commit** `git commit -m "Archer Hero track: attract mode, then a stage to play"`.
