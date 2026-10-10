// Ported from HowPolluted src/screens/globe/globe.js at 80f6d06 (Warren's own project). Changes: no wheel
// or pinch zoom (removed, so the page always scrolls); no rAF or ResizeObserver of its own (the figure calls
// render(dtMs) and resize(w, h)); the time-driven flyTo() became aim(point, t), a pure pose of t in 0..1
// on the source's ease-out cubic; the pin's back-out drop became setPin(point, s); drag-to-spin with
// inertia only while interactive(true), with the pointer handlers handed to the figure instead of bound
// here; no hover callback; DPR min(devicePixelRatio, 2 on the high tier else 1); an opaque paper clear
// colour instead of a transparent canvas; the camera backs off on a portrait stage so the globe fits its
// width. three 0.180: every API the source uses on 0.186 exists in 0.180 unchanged, so nothing was swapped.
//
// The spinning globe: one sphere wearing the inked map (HowPolluted's scripts/build-globe.mjs), lit with
// one soft terminator so it reads as a drawing, not a planet render, and outlined by its own back faces
// pushed out in ink - the reference's every-shape-has-a-line rule. Rotation is two angles (yaw, then
// pitch) so north always stays up and "fly to a point" is just two targets.
import * as THREE from 'three';

const R = 1;
const PAPER = 0xf1ede5;
const IDLE = { yaw: (-20 * Math.PI) / 180, pitch: (18 * Math.PI) / 180, dist: 4.3 };
const IDLE_SPIN = 0.096; // rad/s: the source's 0.0016 rad per 60 Hz frame
const ZOOM = 2.6;

const toRad = (d) => (d * Math.PI) / 180;
const backOut = (t, s = 1.7) => 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2);
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);

// Local direction of a lat/lon on three's SphereGeometry (u = 0 at lon -180).
export function latLonToVec(lat, lon, r = R) {
  const phi = ((lon + 180) / 360) * Math.PI * 2;
  const theta = toRad(90 - lat);
  return new THREE.Vector3(-Math.cos(phi) * Math.sin(theta), Math.cos(theta), Math.sin(phi) * Math.sin(theta)).multiplyScalar(r);
}

const VERT = `
varying vec2 vUv;
varying vec3 vNormal;
void main() {
  vUv = uv;
  vNormal = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
// One soft terminator from a key light at the upper left, multiplied into
// the map; a thin paper rim on the lit edge.
const FRAG = `
uniform sampler2D map;
uniform vec3 lightDir;
varying vec2 vUv;
varying vec3 vNormal;
void main() {
  vec3 base = texture2D(map, vUv).rgb;
  float l = dot(normalize(vNormal), normalize(lightDir));
  float shade = mix(0.8, 1.0, smoothstep(-0.35, 0.45, l));
  vec3 col = base * shade;
  float rim = pow(1.0 - max(dot(normalize(vNormal), vec3(0.0, 0.0, 1.0)), 0.0), 3.0);
  col = mix(col, vec3(0.945, 0.929, 0.898), rim * 0.25 * step(0.0, l));
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

export function createGlobe(canvas, { texture, tier = 'high', onPick }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, tier === 'high' ? 2 : 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(PAPER, 1);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);

  const globe = new THREE.Group();
  scene.add(globe);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const geo = new THREE.SphereGeometry(R, 128, 96);
  const mat = new THREE.ShaderMaterial({
    uniforms: { map: { value: texture }, lightDir: { value: new THREE.Vector3(-0.6, 0.7, 0.6) } },
    vertexShader: VERT,
    fragmentShader: FRAG,
  });
  const earth = new THREE.Mesh(geo, mat);
  globe.add(earth);
  // Ink outline: the back faces of a slightly bigger sphere.
  const outline = new THREE.Mesh(new THREE.SphereGeometry(R * 1.012, 96, 64), new THREE.MeshBasicMaterial({ color: 0x2b2d3a, side: THREE.BackSide }));
  scene.add(outline);

  // The pin: an ink needle with a rose head, standing on the surface normal.
  const pin = new THREE.Group();
  const needle = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.14, 8), new THREE.MeshBasicMaterial({ color: 0x2b2d3a }));
  needle.position.y = 0.07;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.026, 20, 14), new THREE.MeshBasicMaterial({ color: 0xa86a6a }));
  head.position.y = 0.145;
  const headLine = new THREE.Mesh(new THREE.SphereGeometry(0.031, 20, 14), new THREE.MeshBasicMaterial({ color: 0x2b2d3a, side: THREE.BackSide }));
  headLine.position.y = 0.145;
  pin.add(needle, headLine, head);
  pin.visible = false;
  globe.add(pin);

  // Pose: yaw about Y, then pitch about X (Euler 'XYZ' = Rx·Ry).
  let idleYaw = IDLE.yaw; // advances only while the globe rests at t = 0
  let yaw = IDLE.yaw;
  let pitch = IDLE.pitch;
  let dist = IDLE.dist;
  let aimT = 0;
  let free = false; // interactive: the visitor spins it
  let vYaw = 0;
  let vPitch = 0;
  let visible = true;
  let fit = 1; // > 1 on a portrait stage, so the whole globe fits the width

  function resize(w, h) {
    w = Math.max(1, Math.round(w));
    h = Math.max(1, Math.round(h));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    fit = Math.max(1, 1 / camera.aspect);
  }
  resize(canvas.clientWidth || 800, canvas.clientHeight || 500);

  // Turn the globe so the point faces the camera (north up) and dolly in, as the source's flyTo did over
  // time, but as a pure function of t: t = 0 is the resting idle spin, t = 1 faces the point at zoom 2.6.
  function aim({ lat, lon }, t) {
    aimT = clamp01(t);
    if (free) return;
    const v = latLonToVec(lat, lon);
    let yaw1 = -Math.atan2(v.x, v.z);
    while (yaw1 - idleYaw > Math.PI) yaw1 -= Math.PI * 2;
    while (yaw1 - idleYaw < -Math.PI) yaw1 += Math.PI * 2;
    const k = easeOut(aimT);
    yaw = idleYaw + (yaw1 - idleYaw) * k;
    pitch = IDLE.pitch + (toRad(lat) - IDLE.pitch) * k;
    dist = IDLE.dist + (ZOOM - IDLE.dist) * k;
  }

  // The pin drops in on the same back-out curve as the source's loader disc; s = 0 hides it.
  function setPin({ lat, lon }, s) {
    const v = latLonToVec(lat, lon);
    pin.position.copy(v);
    pin.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.clone().normalize());
    pin.visible = s > 0;
    pin.scale.setScalar(Math.max(0.001, backOut(clamp01(s))));
  }

  // --- input: drag to spin (with inertia) and click to pick, only while interactive
  let down = null; // { id, x, y, moved }
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  function pickAt(x, y) {
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObject(earth)[0];
    if (!hit || !hit.uv) return null;
    return { lat: hit.uv.y * 180 - 90, lon: hit.uv.x * 360 - 180 };
  }

  const pointer = {
    down(e) {
      if (!free || down) return false;
      down = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: 0 };
      vYaw = vPitch = 0;
      return true;
    },
    move(e) {
      if (!free || !down || e.pointerId !== down.id) return;
      const dx = e.clientX - down.x;
      const dy = e.clientY - down.y;
      down.x = e.clientX;
      down.y = e.clientY;
      down.moved += Math.abs(dx) + Math.abs(dy);
      const k = (0.0045 * (dist - R)) / 3.3;
      vYaw = dx * k;
      vPitch = dy * k;
      yaw += vYaw;
      pitch = Math.max(-1.3, Math.min(1.3, pitch + vPitch));
    },
    up(e) {
      if (!down || e.pointerId !== down.id) return;
      const click = down.moved < 6 && e.type !== 'pointercancel';
      down = null;
      if (click && free) {
        const p = pickAt(e.clientX, e.clientY);
        if (p) onPick?.(p);
      }
    },
  };

  function render(dtMs) {
    const dt = Math.min(0.05, Math.max(0, (dtMs || 0) / 1000));
    if (free) {
      if (!down) {
        vYaw *= Math.pow(0.04, dt);
        vPitch *= Math.pow(0.04, dt);
        yaw += vYaw;
        pitch = Math.max(-1.3, Math.min(1.3, pitch + vPitch));
      }
    } else if (aimT === 0) {
      idleYaw += IDLE_SPIN * dt;
      yaw = idleYaw;
    }
    if (!visible) return false;
    globe.rotation.set(pitch, yaw, 0, 'XYZ');
    camera.position.set(0, 0, dist * fit);
    camera.lookAt(0, 0, 0);
    renderer.render(scene, camera);
    return true;
  }

  return {
    aim,
    setPin,
    pointer,
    resize,
    render,
    setVisible(v) {
      visible = !!v;
    },
    // Hands the current pose to the visitor (or takes it back for scroll-driven aiming).
    interactive(on) {
      free = !!on;
      down = null;
      vYaw = vPitch = 0;
    },
    destroy() {
      geo.dispose();
      mat.dispose();
      outline.geometry.dispose();
      outline.material.dispose();
      pin.traverse((o) => {
        o.geometry?.dispose();
        o.material?.dispose();
      });
      texture.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
