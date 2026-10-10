# Port notes: BTTRshop hub ice block (source: BTTRURSLF-v2/src/screens/shop/hub/, READ-ONLY)

Survey made 2026-10-10 before porting. Line refs are into the source project.

## How one block is built
- `new IceBlock({ id, index, accent, objectTexture, shared, dpr })` (block.js:325). `id` = key of `SHAPES`
  (shapes.js) = hull shape. `index` seeds randomness. `shared = sharedMaterials({maps, env, star})` (block.js:259).
  Methods: `update({u,time,pointer,hot,dt,motion})` (:681), `screenAnchors(camera,w,h)` (:731), `setDpr` (:673),
  `dispose()` (:787). Add `block.root` to scene. Drive with fixed `u=0` (no passage motion).
- The frozen object is a textured PlaneGeometry, MeshBasicMaterial({map, color:(2.5,2.52,2.56), alphaTest .35,
  DoubleSide}) (:350-360), art = transparent webp cut-outs (`/shop/objects/<id>.webp`). Faint ghost copy over the
  ice (:375-385). `_fitObject` (:449) shrinks the quad to fit inside the hull for turns of +-39 deg.
- Layers (renderOrder): object; ice hull MeshPhysicalMaterial (transmission 1, ior 1.31, thickness 2 x map,
  roughness map, normal .75, dispersion 1.2, iridescence, clearcoat, attenuationColor #5f6573 dist 1.2,
  envMapIntensity .7, flatShading, depthWrite false; `windowed()` :239 clears a window over the object);
  frost shell (custom shader :71, uMilk #eef2f8, uDeep #2a2e38); additive rim (:130,:416); white EdgesGeometry
  .3 (:429); geodesic wire (:485); lines into fog (:563); shards (:607); additive glints (:628).
- shapes.js SHAPES (:136-233): face, physique, hygiene (extrude), hair, fashion, sociability, knowledge.
  `H = 4.3`, `buildShape(area, seed)` (:326).
- textures.js: `frostMaps(11)` (:58) 256^2 canvases from noise.js makeNoise; `starTexture()` (:117);
  `blurTextTexture` (:148) background words. Skip stone*.

## Scene (scene.js HubScene)
- Renderer antialias, NoToneMapping, exposure 1, DPR cap 1.5. Camera fov 30 at z=12. Fog('#b9bdc7', 11.5, 34).
- Env: RoomEnvironment -> PMREM; materials tinted #c3c8d3 (:117-133).
- Lights (:136-143): dir #ffffff 1.6 (-5,6,6); rim #eef3ff 3.0 (3,4,-8); rim2 #dfe6f5 1.4 (-4,-2,-7);
  Hemisphere #dfe3ec/#6f7686 .55.
- Post: composer HalfFloat 4 samples: Render -> Clamp(1.6) -> Bloom(.3,.35,1.0) -> Output. Bloom greys a light page:
  drop it (or keep clamp only).
- background.js `createBackground({textTexture, colors})` (:76): opaque full-frustum quad (must be opaque so
  transmission refracts it); radial gradient + bands + additive-white text/bokeh/dots. Recolour to paper.

## Label: scramble.js + leader line (hud.js)
- `new ScrambleLine(el, text)`; `.in(now, delay)`, `.out`, `.set`, `.snap(on)`, `.update(now)` -> true while
  animating. 450ms in / 300 out / 30ms step; cells `<i class="is-b">`/`<i class="is-i">` (hud.css:112-121).
  Needs `white-space: pre`.
- Leader: SVG polyline pathLength=1, dasharray 1 1, offset = 1 - easeOut(p), p=(t-30)/380 (hud.js:480-485);
  geometry `place()` hud.js:353-418: horizontal rule >=128px then 45 deg elbow 82px onto
  `screenAnchors().topLeft`. Plex Mono 500, uppercase, .08em.

## Recolour list (dark/white assumptions)
backdrop #c6c9d1/#9fa4ae/#8e94a1 (scene.js:59); fog #b9bdc7; env tint #c3c8d3; white edges/lines/wire/dots and
additive rim/glints vanish on paper -> use ink with normal blending. Ice reads darker than its fog by design: keep.

## Orbit
No orbit code. Rotate `block.pivot` by drag (tube.js:742-754 pattern: dx/max(320,w)*2.6, clamp). Keep within
+-39 deg yaw or the art pokes out of the hull (`_fitObject`).

## Dispose
IceBlock.dispose frees geo/materials (not shared shard/textures). HubScene.dispose (scene.js:463) disposes all
then forces WEBGL_lose_context. No listeners outside index.js.
