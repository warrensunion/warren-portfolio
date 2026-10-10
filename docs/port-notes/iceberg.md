# Port notes: Ascent iceberg (source: BTTRURSLF-v2/src/screens/intro/, READ-ONLY)

Survey made 2026-10-10 before porting. Line refs are into the source project.

## API (icebergScene.js)
- `new IcebergScene(canvas, { dpr = min(devicePixelRatio, 1.75) })` (:1109). Owns its WebGLRenderer
  (antialias, high-performance). Throws if no WebGL2 (:1112). Colours/poses/fog are module constants.
- `resize(w,h)` (:1334) sets size, composer, aspect, RTs; `portrait = max(1, h/w*1.2)` pulls camera back.
- `setDpr(dpr)` (:1353), `setBloom(on)` (:1365) = quality steps.
- `setPointer([ndcX, ndcY] | null)` (:1373): hover ray + mouse parallax.
- `setState({star, wire, wireFade, lattice, latticeFade, fill, cool, spread, far, cam, weather, hover, motion})`
  (:1381): load-in timeline 0..1. End state = what Ascent.js applies at clock = T.end (3.9 s, table T :41-55,
  `_apply` :169-189). motion=0 = reduced motion.
- `render(timeSeconds, dt)` (:1561): camera, hover, weather, water sim, reflection + refraction passes, composer.
- `diagram()` (:1494), `project(id)` (:1515): overlay points in CSS px (uses this.size).
- `dispose()` (:1604): disposes geo/mat, 4 DataTextures, RTs, sim, composer, bloom, renderer, loseContext().
  RenderPass/OutputPass not explicitly disposed.
- No rAF / listeners inside. Ascent.js owns the loop (`_frame` :191, dt cap .1 s), calls `render(0,0)` once to
  compile (:130), pointer -> NDC vs canvas rect (:249-256), pointerleave -> setPointer(null).
- 6.25 s pulse lives in berg.js (`IDLE.period` :371, BergMotion.step :417); scene fades idle in after cursor
  still 2 s (:1469-1476). Wind locked to same period (:1524-1533).

## Deps
three 0.180 + postprocessing EffectComposer/RenderPass/UnrealBloomPass/OutputPass (bloom only; can be replaced by
renderer.render). terrain.js (pure: simplex, height, glacierTop/Face, FRONT_Z=14, GLACIER_Z=-60, FAR_Z=-330,
HALF_W=360), berg.js (pure, 91 blocks, 35 above water, 12,270 tris), water.js (three, 128^2 HalfFloat sim),
overlay.js (2D canvas). All shaders inline (icebergScene.js:111-768, water.js:24-69). No assets except
`/fonts/ibm-plex-mono-500.woff2` (overlay numbers). Mandatory: berg, simplex+constants, water, COMMON chunk, berg,
water, sky meshes. Terrain/glacier optional (seen in reflection). Edge/shafts/mists/snow/drift/motes/wire/
lattice/star/bloom optional decoration.

## Camera / underwater
- `_placeCamera` (:1399-1433): spherical rig. CAM_TO {target [0,-1.37,0], r 40.08, phi 1.5079, theta 0, fov 35},
  CAM_FROM {...} (:87-88). Mouse parallax MOUSE (:92). Camera y clamped by CAM_MIN_Y = 0.7 (:94, :1420).
- No height/underwater param: ADD one (offset camera y and target y, relax the clamp).
- Cross-section is a cut plane at z = FRONT_Z = 14 in shaders, camera at z~40 in front. `waterPath()` (:180-188)
  already handles ro.y <= 0 (aquarium glass). `underwater()` (:190) tints WATER_TOP -> WATER_DEEP over 0..-22.
  Sky sphere below-horizon branch paints deep water (:598-608). `buildEdge` (:905) additive waterline strip.
- Gotchas going under: water surface mesh FrontSide only (culled from below) (:819); reflection camera mirrors y
  (:1577); reflection/refraction passes only when spread > 1 (:1585). Since the camera stays in front of the cut
  (z~40 > 14), going below y=0 shows the cross-section through the "glass": keep camera z in front of FRONT_Z.
- Layers: 0 main, 1 refraction (berg, sky), 2 reflection (berg, terrain, glacier, sky).

## Colours (icebergScene.js:56-73)
SKY_TOP #8f98a8, SKY_HORIZON #b0b7c3, FOG #aab2c0, LOADER #a3a6b4, ROCK #3b424d, ROCK_LIGHT #7e8793,
SNOW #e4e9ef, ICE_WHITE #e9f0f7, ICE_PALE #a9c6e2, ICE_SHADE #7fa5d6, ICE_CYAN #56c8ea, ICE_BLUE #1b4fb0,
WATER_TOP #17457a, WATER_DEEP #040c1f, GLACIER #c6d7ea, GLACIER_DARK #3e5f8c, CORE #ffffff, CORE_WATER #bff3ff.
uFogDensity .0062, uSun (-.6,.62,.5), CORE_I 3.4. GLSL: hemi() (.22,.25,.32)->(.74,.8,.9) (:148); edge strip,
shafts, caustics, motes white-cyan; snow/streak/wire/lattice/star white (additive -> vanish on paper).
No scene.background; sky sphere r=800 covers all. WaterSim ctor sets clear colour black alpha 0 (water.js:105-110).
Overlay: white strokes/text (:117,:132-133), dark halos (:110,:148,:153) -> flip to ink.
Plan: re-key SKY/FOG/LOADER toward paper, warm hemi, lighten deep water a little, overlay ink dark, additive
whites -> normal blending ink.

## Hover
NDC -> Raycaster -> `rayThrough` (berg.js:520) analytic march vs outerR -> `hoverLift` (berg.js:471) lift
HOVER_LIFT .8*dMax within HOVER_FLAT fading to 0 at 2.6*3.2; far side 45%. Springs 15/6.6 open, 5.76/4.8 close.
d written into RGBA float DataTexture; vertex shader adds dir*d (:258-275). Gated by state.hover.

## Overlay (overlay.js)
`BergDiagram` 2D canvas stacked over GL canvas (inset 0, pointer-events none). `resize(w,h,dpr)`,
`draw(want, pointFn, now)` each frame, `clear()` (:188). Plex Mono 500.

## Performance
DPR min(dpr,1.75); refl/refr RTs at .5 (or .35 lowRefl) of w*h*dpr; water 128^2 sim up to 3 passes + drop;
bloom ~10 passes. Meshes: water ~21k verts, terrain ~26k, glacier ~16k. ~35-40 draws/passes per frame.
Existing tiers (Ascent `_adapt` :210-225): >24 ms avg over 60 frames -> setDpr(min(1,dpr)) then setBloom(false)
+ lowRefl. frustumCulled=false everywhere (:1181). For a figure frame: drop terrain-far detail, mists, drift,
composer/bloom.

## Strip
Ascent HUD (wordmark, tagline, Start/Skip, _leave, _key, done/play handshake, html.as-covering, fixed z 9000,
intro-mountain.jpg fallback, .as-hint), `?bergcam`/uCut dev code, window.__ascent.
`scripts/check-iceberg-blocks.mjs` proves blocks never overlap / slide only along dir: port it as a test.
