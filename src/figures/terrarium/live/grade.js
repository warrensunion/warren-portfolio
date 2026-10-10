// Ported from terrarium src/live/grade.js at 7612a40 (Warren's own project). Changes: createGrade takes { samples } (the low tier passes 0, no MSAA).
/**
 * The film look from docs/art-direction.md, applied once to the whole frame:
 * the scene renders in linear light into an MSAA target, then one full-screen
 * pass tone-maps, lifts the blacks to #14241F, warms the highlights toward
 * #FFF4D6, cools the shadows, darkens the corners ~18% and adds 3–4% grain.
 * One pass instead of a composer chain because it is all per-pixel maths.
 */
import * as THREE from 'three';
import { PALETTE } from './look.js';

const vert = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const frag = /* glsl */ `
uniform sampler2D tScene;
uniform float uTime, uExposure, uGrain;
uniform vec3 uLift, uHigh;
uniform vec2 uRes;
uniform vec3 uBeam;
uniform float uBeamAmt;
varying vec2 vUv;
vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
vec3 toSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
float hash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
void main() {
  vec3 c = texture2D(tScene, vUv).rgb * uExposure;
  c = toSRGB(aces(c));
  // the afternoon shaft: a soft warm beam falling from the upper-left window,
  // with faint bands where the mullions cut it
  float asp = uRes.x / uRes.y;
  vec2 d = vec2(vUv.x * asp, vUv.y) - vec2(-0.15 * asp, 1.2);
  vec2 dir = normalize(vec2(0.78, -0.62));
  float along = dot(d, dir), across = dot(d, vec2(-dir.y, dir.x));
  float beam = exp(-pow(across / (0.1 + 0.22 * along), 2.0)) * smoothstep(0.1, 0.5, along) * smoothstep(1.9, 0.6, along);
  beam *= 0.75 + 0.25 * sin(across * 38.0 / (0.4 + along));
  c += uBeam * beam * uBeamAmt;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  // gouache is matte: pull saturation back a little everywhere
  c = mix(vec3(l), c, 0.88);
  // cool shadows, warm highlights
  c += vec3(-0.012, 0.004, 0.018) * (1.0 - l) * (1.0 - l);
  c = mix(c, c * uHigh, smoothstep(0.45, 1.0, l) * 0.6);
  // lifted blacks: the darkest pixel is ink-lift, never black
  c = uLift + c * (1.0 - uLift);
  // vignette: about 18% at the corners, toward the moss ink
  vec2 q = vUv - 0.5; q.x *= uRes.x / uRes.y;
  float v = smoothstep(0.35, 1.05, length(q) * 1.15);
  c = mix(c, c * vec3(0.78, 0.86, 0.84), v * 0.85);
  // grain, re-rolled every frame
  float g = hash(gl_FragCoord.xy + fract(uTime * 7.13) * 917.0) - 0.5;
  c += g * uGrain;
  gl_FragColor = vec4(c, 1.0);
}`;

export function createGrade(renderer, { samples = 4 } = {}) {
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const rt = new THREE.WebGLRenderTarget(size.x, size.y, {
    type: THREE.HalfFloatType, samples, depthBuffer: true,
  });
  // uLift / uHigh are display-referred: use the raw sRGB values
  const srgb = (c) => new THREE.Vector3(...c.clone().convertLinearToSRGB().toArray());
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      tScene: { value: rt.texture }, uTime: { value: 0 }, uExposure: { value: 1.0 }, uGrain: { value: 0.035 },
      uLift: { value: srgb(PALETTE.inkLift) }, uHigh: { value: srgb(PALETTE.highlight) }, uRes: { value: size.clone() },
      uBeam: { value: srgb(PALETTE.highlight) }, uBeamAmt: { value: 0.12 },
    },
    vertexShader: vert, fragmentShader: frag, depthTest: false, depthWrite: false,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  quad.frustumCulled = false;
  const post = new THREE.Scene();
  post.add(quad);
  const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  return {
    uniforms: mat.uniforms,
    target: rt,
    /** compile the grade program ahead of the first frame */
    compileAsync() { return renderer.compileAsync(post, ortho); },
    setSize(w, h) { rt.setSize(w, h); mat.uniforms.uRes.value.set(w, h); },
    render(scene, camera, time) {
      mat.uniforms.uTime.value = time;
      renderer.setRenderTarget(rt);
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);
      renderer.render(post, ortho);
    },
    dispose() { rt.dispose(); quad.geometry.dispose(); mat.dispose(); },
  };
}
