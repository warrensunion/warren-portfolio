/**
 * Ported from the BTTRshop hub (BTTRURSLF-v2 src/screens/shop/hub/background.js, Warren's own code); this
 * page's fog is the cold blue-grey of the cloud at the treeline, not the hub's lavender. Its notes:
 *
 * igloo's fog: a full-screen quad behind everything - the flat lavender
 * gradient, a sparse dot grid, a few slow bokeh discs and huge blurred
 * monospace text sliding in parallax (TEARDOWN step 3).
 *
 * It is a mesh in the scene, opaque, and not a CSS background, on purpose:
 * three's transmission refracts only what is in the opaque pass, and the
 * ice has to bend this fog and this text or it reads as frosted plastic.
 * It is a child of the camera, 40 units in front of it, re-fitted to the
 * frustum every frame - so it fills the view whatever the camera rig does.
 */

import * as THREE from 'three';

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

const FRAG = /* glsl */ `
  uniform vec2 uRes;      // CSS px
  uniform float uTime;
  uniform float uScroll;  // wheel px
  uniform float uMotion;
  uniform vec3 uCentre;
  uniform vec3 uEdge;
  uniform vec3 uCorner;
  uniform sampler2D uText;
  varying vec2 vUv;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vn(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
  }

  void main() {
    vec2 px = vUv * uRes;
    float aspect = uRes.x / uRes.y;
    vec2 q = (vUv - 0.5) * vec2(aspect, 1.0);
    // Gradient: centre -> edges, darker cool corners (live recording).
    float r = length(q * vec2(0.85, 1.0));
    vec3 col = mix(uCentre, uEdge, smoothstep(0.05, 0.85, r));
    col = mix(col, uCorner, smoothstep(0.75, 1.25, r) * 0.7);
    // Very soft lighter bands drifting.
    float band = vn(vec2(vUv.x * 3.0 + uTime * 0.01 * uMotion, uScroll * 0.00008));
    col *= 1.0 + (band - 0.5) * 0.05; // relative, so a dark backdrop keeps its hue

    float s = uScroll / 1200.0; // one block pitch (timeline.js PITCH)
    // Blurred text: one layer, scrolling slower than the blocks (parallax).
    vec2 tuv = vec2(vUv.x * min(aspect * 0.55, 0.92) + uTime * 0.0025 * uMotion, vUv.y * 0.34 - s * 0.06);
    float t1 = texture2D(uText, tuv).a;
    col += vec3(1.0) * t1 * 0.16;

    // Bokeh: a few large soft discs.
    for (int i = 0; i < 7; i++) {
      float fi = float(i);
      vec2 c = vec2(hash(vec2(fi, 1.3)), hash(vec2(fi, 7.1)));
      c.x = fract(c.x + uTime * 0.004 * (0.5 + hash(vec2(fi, 3.0))) * uMotion);
      c.y = fract(c.y - s * (0.08 + 0.1 * hash(vec2(fi, 9.0))));
      vec2 d = (vUv - c) * vec2(aspect, 1.0);
      float rad = 0.04 + 0.08 * hash(vec2(fi, 4.4));
      col += vec3(1.0) * smoothstep(rad, rad * 0.3, length(d)) * 0.035;
    }

    // Sparse fine dots on a loose grid.
    vec2 cell = floor((px + vec2(0.0, uScroll * 0.15)) / 9.0);
    float h = hash(cell);
    vec2 f = fract((px + vec2(0.0, uScroll * 0.15)) / 9.0) - 0.5;
    if (h > 0.985) col += vec3(1.0) * smoothstep(0.16, 0.0, length(f)) * 0.22;

    gl_FragColor = vec4(col, 1.0);
  }
`;

export function createBackground({ textTexture, colors }) {
  const uniforms = {
    uRes: { value: new THREE.Vector2(1, 1) },
    uTime: { value: 0 },
    uScroll: { value: 0 },
    uMotion: { value: 1 },
    uCentre: { value: new THREE.Color(colors.centre) },
    uEdge: { value: new THREE.Color(colors.edge) },
    uCorner: { value: new THREE.Color(colors.corner) },
    uText: { value: textTexture },
  };
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG, depthWrite: false, fog: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
  mesh.renderOrder = -10;
  mesh.frustumCulled = false;
  const DIST = 40;
  mesh.position.set(0, 0, -DIST);

  return {
    mesh,
    /**
     * Re-fit to the camera's frustum. The quad is a child of the camera, so
     * wherever a stage moves or tilts the camera it stays behind everything;
     * this only follows fov / aspect, and is cheap enough to run every frame.
     */
    fit(camera, w, h) {
      if (mesh.parent !== camera) camera.add(mesh);
      const hh = 2 * DIST * Math.tan((camera.fov * Math.PI) / 360);
      mesh.scale.set(hh * camera.aspect * 1.02, hh * 1.02, 1);
      uniforms.uRes.value.set(w, h);
    },
    /** Per-segment fog colours ({ centre, edge, corner }, any THREE.Color input). */
    setColors(c) {
      if (c.centre) uniforms.uCentre.value.set(c.centre);
      if (c.edge) uniforms.uEdge.value.set(c.edge);
      if (c.corner) uniforms.uCorner.value.set(c.corner);
    },
    update({ time, px, motion }) {
      uniforms.uTime.value = time;
      uniforms.uScroll.value = px;
      uniforms.uMotion.value = motion;
    },
    dispose() {
      mesh.removeFromParent();
      mesh.geometry.dispose();
      mat.dispose();
    },
  };
}
