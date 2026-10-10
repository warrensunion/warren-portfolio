// Ported from BTTRURSLF-v2 src/screens/shop/hub/background.js (the BTTRshop hub). What changed and why:
// the hub's lavender fog with drifting bands, blurred words, bokeh and dots became one quiet radial
// gradient in paper fog, because each figure is a small plate on a light page and anything moving
// behind the ice would compete with the frozen object. It converts to sRGB itself (colorspace chunk):
// the figure has no composer and OutputPass, so the colours land as their hex on the canvas.

/**
 * The fog: a full-frustum quad behind everything.
 *
 * It is a mesh in the scene, opaque, and not a CSS background, on purpose:
 * three's transmission refracts only what is in the opaque pass, and the
 * ice has to bend this fog or it reads as frosted plastic. It is a child of
 * the camera, 40 units in front of it, re-fitted to the frustum on resize.
 */

import * as THREE from 'three';

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

const FRAG = /* glsl */ `
  uniform vec2 uRes;      // CSS px
  uniform vec3 uCentre;
  uniform vec3 uEdge;
  varying vec2 vUv;
  void main() {
    float aspect = uRes.x / uRes.y;
    vec2 q = (vUv - 0.5) * vec2(aspect, 1.0);
    float r = length(q * vec2(0.85, 1.0));
    gl_FragColor = vec4(mix(uCentre, uEdge, smoothstep(0.05, 0.85, r)), 1.0);
    #include <colorspace_fragment>
  }
`;

export function createBackground({ colors }) {
  const uniforms = {
    uRes: { value: new THREE.Vector2(1, 1) },
    uCentre: { value: new THREE.Color(colors.centre) },
    uEdge: { value: new THREE.Color(colors.edge) },
  };
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG, depthWrite: false, fog: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
  mesh.renderOrder = -10;
  mesh.frustumCulled = false;
  const DIST = 40;
  mesh.position.set(0, 0, -DIST);

  return {
    mesh,
    /** Re-fit to the camera's frustum (fov / aspect). */
    fit(camera, w, h) {
      if (mesh.parent !== camera) camera.add(mesh);
      const hh = 2 * DIST * Math.tan((camera.fov * Math.PI) / 360);
      mesh.scale.set(hh * camera.aspect * 1.02, hh * 1.02, 1);
      uniforms.uRes.value.set(w, h);
    },
    dispose() {
      mesh.removeFromParent();
      mesh.geometry.dispose();
      mat.dispose();
    },
  };
}
