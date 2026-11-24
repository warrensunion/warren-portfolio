// The world: the one persistent WebGL canvas behind the page. One renderer, one composer, two acts that
// never render in the same frame: the mountain (sky, range, pines, seracs, clouds, the igloo, snow) and
// the ice field (the project blocks in fog, field/field.js), swapped at the peak of the dissolve.
// boot.js owns the DOM: it reads the scroll into a state object that read() hands over each frame, and
// decides when this may run at all. Everything here is a pure function of that state and the clock.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { createShared, blendTheme } from './shared.js';
import { createSky } from './sky.js';
import { createTerrain } from './terrain.js';
import { createPines } from './pines.js';
import { createFeatures } from './features.js';
import { createIgloo } from './igloo.js';
import { createSnow } from './snow.js';
import { createRig } from './rig.js';
import { tempAt, snowAt, gustAt } from './climb.js';

const ClampShader = {
  uniforms: { tDiffuse: { value: null }, uMax: { value: 2.2 } },
  vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `uniform sampler2D tDiffuse; uniform float uMax; varying vec2 vUv;
    void main() { vec4 c = texture2D(tDiffuse, vUv); gl_FragColor = vec4(min(c.rgb, vec3(uMax)), c.a); }`,
};

// God-rays: the bright sky round the moon smeared toward it, so shafts fall through the gaps in the cloud
// deck near the summit. Off (and skipped) below the high camp.
const RaysShader = {
  uniforms: { tDiffuse: { value: null }, uLight: { value: new THREE.Vector2(0.5, 0.8) }, uAmount: { value: 0 }, uTint: { value: new THREE.Color('#cfdcff') } },
  vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform vec2 uLight; uniform float uAmount; uniform vec3 uTint; varying vec2 vUv;
    void main() {
      vec3 base = texture2D(tDiffuse, vUv).rgb;
      vec2 d = (uLight - vUv) / 26.0;
      vec2 uv = vUv;
      float acc = 0.0, w = 1.0;
      float j = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
      uv += d * j;
      for (int i = 0; i < 26; i++) {
        vec3 s = texture2D(tDiffuse, uv).rgb;
        float l = max(dot(s, vec3(0.299, 0.587, 0.114)) - 0.42, 0.0);
        acc += l * w;
        w *= 0.95;
        uv += d;
      }
      gl_FragColor = vec4(base + uTint * acc * 0.06 * uAmount, 1.0);
    }`,
};

export async function createWorld(canvas, { tier = 'high', theme = 'dusk', reduced = false, read, onFrame, field = null }) {
  const low = tier === 'low';
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', alpha: false, stencil: false });
  renderer.toneMapping = THREE.NoToneMapping;
  let dpr = Math.min(window.devicePixelRatio || 1, low ? 1 : 1.5);
  renderer.setPixelRatio(dpr);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.8, 90000);
  scene.add(camera);
  const shared = createShared();
  let themeNow = theme;
  let themeK = theme === 'night' ? 1 : 0;
  let themeTo = themeK;
  blendTheme(shared, 'dusk', 'night', themeK);

  const sky = createSky(shared);
  const terrain = createTerrain(shared, { tier });
  const pines = createPines(shared, { tier });
  const features = createFeatures(shared, { tier });
  const igloo = createIgloo(shared, { dpr });
  const snow = createSnow({ tier });
  scene.add(sky.mesh, terrain.group, pines.mesh, features.group, igloo.group, snow.mesh);
  const hemi = new THREE.HemisphereLight('#9fb2d6', '#2a3348', 0.9);
  const moon = new THREE.DirectionalLight('#dfe6ff', 1.1);
  moon.position.copy(shared.uMoonDir.value).multiplyScalar(100);
  scene.add(hemi, moon);
  const rig = createRig();
  if (/dbg=igloo/.test(location.search)) igloo.group.traverse((o) => o.material && (o.material.depthTest = false, o.renderOrder = 99));

  // Post: render -> clamp -> [dissolve slot] -> rays -> bloom -> output.
  const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: low ? 0 : 4 });
  const composer = new EffectComposer(renderer, target);
  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);
  const clamp = new ShaderPass(ClampShader);
  composer.addPass(clamp);
  const rays = new ShaderPass(RaysShader);
  rays.enabled = false;
  composer.addPass(rays);
  const bloom = low ? null : new UnrealBloomPass(new THREE.Vector2(256, 256), 0.32, 0.45, 0.82);
  if (bloom) composer.addPass(bloom);
  composer.addPass(new OutputPass());

  // The ice field (log 02) is its own scene on this renderer; field.js adds its dissolve pass before rays.
  let fieldAct = null;
  if (field) {
    fieldAct = await field({ renderer, composer, insertBefore: rays, dpr, tier, reduced });
  }

  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const moonScreen = new THREE.Vector3();
  let w = 1;
  let h = 1;
  let raf = 0;
  let running = false;
  let last = 0;
  let time = 0;
  let firstFrame = true;
  let load = 0; // live figures on the page: 0 none
  let slow = 0; // adaptive quality: seconds over budget
  let lowered = false;
  let frameMs = 16.7;
  let cursorK = 0;
  let lastPointer = null;
  let hoverIdx = -1;
  let pickTick = 0;
  let disposed = false;
  let lost = false;

  function resize(cw, ch) {
    w = Math.max(1, cw);
    h = Math.max(1, ch);
    renderer.setSize(w, h, false);
    composer.setPixelRatio(dpr);
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    fieldAct?.resize(w, h);
    if (bloom) bloom.resolution.set(w / 2, h / 2);
  }

  function lowerQuality() {
    if (lowered) return;
    lowered = true;
    dpr = 1;
    renderer.setPixelRatio(1);
    snow.setLoad(0.5);
    if (bloom) bloom.enabled = false;
    igloo.setDpr(1);
    resize(w, h);
    console.info('[world] lowered quality');
  }

  function frame(now) {
    raf = running ? requestAnimationFrame(frame) : 0;
    if (disposed || lost) return;
    const dt = Math.min(0.05, last ? (now - last) / 1000 : 1 / 60);
    last = now;
    const st = read();
    const motion = st.motion;
    time += dt * (motion ? 1 : 0);
    shared.uTime.value = time;

    // theme cross-fade (1 s)
    if (themeK !== themeTo) {
      themeK += Math.sign(themeTo - themeK) * Math.min(Math.abs(themeTo - themeK), dt * (motion ? 1.2 : 99));
      blendTheme(shared, 'dusk', 'night', themeK);
    }

    // the act: mountain, or the ice field in the cloud
    const inField = fieldAct && st.act === 'field';
    if (fieldAct) fieldAct.post({ amount: st.dissolve || 0, speed: st.speed || 0, dt, motion });
    if (fieldAct && !inField) fieldAct.idle();

    if (inField) {
      st.dt = dt;
      fieldAct.update(st);
      renderPass.scene = fieldAct.scene;
      renderPass.camera = fieldAct.camera;
      if (snow.mesh.parent !== fieldAct.scene) fieldAct.scene.add(snow.mesh);
      rays.enabled = false;
      snow.uniforms.uCamPos.value.copy(fieldAct.camera.position);
      snow.uniforms.uDensity.value = 0.35;
      snow.uniforms.uWindV.value.set(0.6, 0.6, 0.2);
    } else {
      renderPass.scene = scene;
      renderPass.camera = camera;
      if (snow.mesh.parent !== scene) scene.add(snow.mesh);
      const pose = rig.update(st.alt, { aspect: camera.aspect, dt, time, motion });
      camera.position.copy(pose.pos);
      camera.lookAt(pose.target);
      camera.updateMatrixWorld();
      shared.uCam.value.copy(camera.position);
      shared.uClimb.value = st.climb;
      // the treeline cloud: how deep in the slab the camera is
      const cy = shared.uCloudY.value;
      const inside = Math.min(camera.position.y - cy.x, cy.y - camera.position.y);
      shared.uCloudIn.value = Math.max(0, Math.min(1, inside / 220));
      igloo.group.position.copy(pose.igloo);
      igloo.group.rotation.y = pose.iglooYaw;
      igloo.group.updateMatrixWorld();
      const warmth = Math.max(0, Math.min(1, (st.climb - 0.965) / 0.03));
      igloo.update({ build: st.build, now: time, motion, warmth, onLand: st.onLand, knoll: pose.knoll });
      sky.update(camera, motion);
      terrain.update(camera, { prints: st.prints, motion });
      pines.update(motion);
      features.update(camera, motion);
      // snow: wind for this altitude, gusts, the cursor's ray
      const gust = gustAt(time);
      const windDir = 0.6 + st.climb * 1.4;
      const ws = (2 + st.climb * 7) * (1 + gust * 0.8);
      snow.uniforms.uWindV.value.set(Math.cos(windDir) * ws, 0, Math.sin(windDir) * ws * 0.5);
      shared.uWind.value.set(Math.cos(windDir), 0, ws / 9);
      snow.uniforms.uGust.value = gust;
      snow.uniforms.uDensity.value = Math.min(1, snowAt(st.alt) / 3.4) * (load ? 0.6 : 1);
      snow.uniforms.uCamPos.value.copy(camera.position);
      // god-rays above the high cloud deck
      const rk = Math.max(0, Math.min(1, (st.alt - 4400) / 1200));
      moonScreen.copy(camera.position).addScaledVector(shared.uMoonDir.value, 1000).project(camera);
      const onScreen = moonScreen.z < 1 && Math.abs(moonScreen.x) < 1.6 && Math.abs(moonScreen.y) < 1.6;
      rays.enabled = !low && !lowered && rk > 0.01 && onScreen;
      rays.uniforms.uAmount.value = rk;
      rays.uniforms.uLight.value.set(moonScreen.x * 0.5 + 0.5, moonScreen.y * 0.5 + 0.5);
      // hover polygons on the igloo, picked every other frame while the pointer is over the scene
      if (st.pointer && !st.dragging && (pickTick++ & 1) === 0) {
        ndc.set(st.pointer[0], st.pointer[1]);
        ray.setFromCamera(ndc, camera);
        hoverIdx = igloo.pick(ray);
        igloo.setHover(hoverIdx);
        st.onHover?.(hoverIdx >= 0);
      } else if (!st.pointer && hoverIdx >= 0) {
        hoverIdx = -1;
        igloo.setHover(-1);
        st.onHover?.(false);
      }
    }
    // the cursor's wind: on while the pointer moves, fading when it rests
    const moved = st.pointer && (!lastPointer || Math.abs(st.pointer[0] - lastPointer[0]) + Math.abs(st.pointer[1] - lastPointer[1]) > 0.002);
    lastPointer = st.pointer ? [...st.pointer] : null;
    cursorK += ((moved && motion ? 1 : 0) - cursorK) * (1 - Math.exp(-dt * (moved ? 6 : 1.2)));
    const cam = renderPass.camera;
    if (st.pointer) {
      ndc.set(st.pointer[0], st.pointer[1]);
      ray.setFromCamera(ndc, cam);
      snow.uniforms.uRayO.value.copy(ray.ray.origin);
      snow.uniforms.uRayD.value.copy(ray.ray.direction);
    }
    snow.uniforms.uCursor.value = cursorK;
    snow.uniforms.uTime.value = time;
    snow.uniforms.uMotion.value = motion;
    snow.uniforms.uAval.value = st.aval || 0;
    if (st.drag) rig.drag(st.drag[0], st.drag[1]);
    else if (!st.dragging) rig.release();
    rig.pointer(st.pointer);

    composer.render(dt);

    // adaptive quality: 2 s averaging over 22 ms on the high tier steps down once
    frameMs += (dt * 1000 - frameMs) * 0.05;
    if (!lowered && !low && motion) {
      slow = frameMs > 22 ? slow + dt : Math.max(0, slow - dt * 0.5);
      if (slow > 2) lowerQuality();
    }
    onFrame?.({ dt: dt * 1000, placed: igloo.placed, total: igloo.total, first: firstFrame });
    firstFrame = false;
  }

  // For scripts/check-figures.mjs and debugging: where things are, and the igloo's count.
  window.__worldStats = () => ({ placed: igloo.placed, total: igloo.total, cam: camera.position.toArray().map(Math.round), igloo: igloo.group.position.toArray().map(Math.round), act: renderPass.scene === scene ? 'mountain' : 'field', dpr, lowered });

  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    lost = true;
  });

  return {
    total: igloo.total,
    resize,
    start() {
      if (running || disposed) return;
      running = true;
      last = 0;
      raf = requestAnimationFrame(frame);
    },
    stop() {
      running = false;
      cancelAnimationFrame(raf);
      raf = 0;
    },
    setTheme(t) {
      themeNow = t;
      themeTo = t === 'night' ? 1 : 0;
    },
    get theme() {
      return themeNow;
    },
    /** Live WebGL figures on the page: the world gives way (DPR 1, fewer flakes, no bloom). */
    setLoad(n) {
      if (n === load) return;
      load = n;
      const d = n > 0 ? 1 : Math.min(window.devicePixelRatio || 1, low || lowered ? 1 : 1.5);
      if (d !== dpr) {
        dpr = d;
        renderer.setPixelRatio(dpr);
        resize(w, h);
      }
      snow.setLoad(n > 0 || lowered ? 0.5 : 1);
      if (bloom) bloom.enabled = !(n > 0 || lowered);
    },
    /** One frame now (reduced motion: the page redraws only when the scroll moves). */
    renderOnce() {
      if (!running) frame(performance.now());
    },
    field: fieldAct,
    destroy() {
      disposed = true;
      running = false;
      cancelAnimationFrame(raf);
      fieldAct?.dispose();
      for (const x of [sky, terrain, pines, features, igloo, snow]) x.dispose();
      target.dispose();
      bloom?.dispose();
      composer.dispose?.();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
