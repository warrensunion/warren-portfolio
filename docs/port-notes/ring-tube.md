# Port notes: hub ring + particle tube (source: BTTRURSLF-v2/src/screens/shop/hub/, READ-ONLY)

Survey made 2026-10-10 before porting. Line refs are into the source project.

## Ring (ring.js, ringGeometry.js)
- Geometry cached module-level `GEO` (ring.js:265-299); `ringPiecesIter(opts)` (ringGeometry.js:196) yields
  segment pieces `{geometry, home, ends}` with attributes color (AO), aRim (inner wall glow), uv. OUTER 10 segs
  r 2.3-3.0, INNER 6 segs r 1.42-1.72 (ring.js:50-51). The centre "B" logo (`logoPieces`, B_PARTS) = BTTRshop
  brand: drop it for the portfolio.
- Stone: MeshStandardMaterial vertexColors + stoneMaps(5) (textures.js:230) + envMap; onBeforeCompile emissive
  `uGlowCol*uGlow*vRim^3*1.1` (:380-390).
- Assemble (:438-470, :877-906): per piece start pos, control point, q0, start s, duration d; far side first;
  t = clamp01((asm-s)/d), quadratic bezier with easeOutBack + slerp q0->identity. Dust puffs on lock (uAge[24]).
- Ignite: glow = .18*smooth(0,.3,ign) + .82*smooth(.25,.85,ign) x breathing (:833-834) feeding emissive, band
  (additive :478-491), mist sphere, geodesic lines (additive), sparkles, 4200-pt cloud + core sprite, 6 streaks;
  raises clamp uMax 1.6->5 and bloom (:842-845). ALL additive/HDR -> invisible on paper. Re-express ignite as
  NormalBlending ink/accent glow (darker band, accent-tinted rim emissive), no bloom.
- Driver is scroll px (`asm`,`ign` from timeline marks :819-820); replace with time 0..1. Drop pose()/dive/deep
  rings/pedestal.

## Tube (tube.js, tubeShapes.js)
- pointBudget 48000, or 25000 on weak GPU/coarse pointer (tube.js:306-317); uSize = .0145*sqrt(48000/n) (:571).
- Shapes are sampled from images: `pixels(src)` fetch -> createImageBitmap -> canvas RGBA (tubeShapes.js:41-56);
  `grow({w,h,data}, kind, n, seed)` (:85-270): alpha>128 mask, chamfer distance, kind 'logo' = flat bevelled slab,
  'object' = inflated; points sorted by height. Fits ~1.95 tall. `loadShapes(list,n)` (:307) in a worker
  (hubWorker.js via work.js), cached by key. fetch() accepts data: URLs, so "WS" = canvas text -> toDataURL ->
  kind 'logo'. Project objects = their cut-out PNG/webp -> kind 'object'.
- Morph: attributes aFrom/aTo (xyz+tone), aNFrom/aNTo, aCloud, aRand (:516-592). `morph(dir, to)` (:627-655)
  copies aTo->aFrom on CPU, writes new shape, morphStart=clock; PART_VERT (:81-230) does the flight (~1.1 s).
  Interrupted morph runs `_freeze(t)` (:658-705) = 48k loop: debounce hover (~120 ms).
- uAssemble (:905) cloud->figure is scroll-driven: drive by time.
- Particles are opaque round dots, alphaToCoverage (:585) -> need antialias:true. Fog mixed in frag (:242):
  set uFogColor = paper. Rest colour slate vec3(.14,.155,.195) -> (.9,.92,.96) (:217): cap light end; glow/lift
  to white (:221-223) -> darken toward accent.
- Point size uScale = dpr*h/(2*tan(fov/2)) (:910). Retune for figure height.

## Strip
ringHud.js, tubeHud.js, sound, shop data/routing (TUBE_SHAPES hrefs, leaveTo, pick, figureRect), timeline/scroll,
dissolve, ring->tube hand-off, tube pedestal/column/ceiling/wall words, bloom. Keep `uReduced` path.

## Deps
three 0.180 addons (scene.js:48-53) EffectComposer etc. (not needed if no bloom), RoomEnvironment. Stages expect a
"hub" object {scene, camera, renderer, env, stageLights, clamp, bloom, composer, dissolve, frame, compileAsync}:
provide a slim one. Worker must stay (shape growing ~3 s main thread). noise.js stoneData ~200ms/512^2.
