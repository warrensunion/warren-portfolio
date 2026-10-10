// Ported from terrarium src/live/camera.js at 7612a40 (Warren's own project). Changes: ease.js path; no wheel handler (wheel zoom removed, so the page always scrolls); drag turns the azimuth only (a vertical drag is left to the page); new setOrbit(phi, theta, zoom, snap) so the figure can drive the intro orbit by scroll; new azimuth getter.
/**
 * The camera is how a visitor handles the jar, so it should feel like turning
 * a real object: every input sets a goal and the camera damps toward it, so
 * nothing snaps. Orbit by drag (or one finger), zoom by pinch (never the wheel: it scrolls the page),
 * clamped so the jar never leaves view; follow(getPos) glides down onto a
 * creature at λ = 4 and release() glides back out: same azimuth and zoom,
 * tilt reset to the home stage angle. (Under reduced motion both are cuts.)
 *
 * Framing follows makemepulse: the subject fills the frame. The home distance
 * is fitted, not tuned: fitView() projects the jar's silhouette (JAR_RINGS) and finds
 * the distance at which it fills ~88% of the viewport height (or 90% of the
 * width on narrow screens), and the target height that centres it. Wheel/pinch
 * zoom is a factor on that fitted distance, so it holds at every aspect.
 * Dragging the tilt refits too, so the camera dollies in or out as you tilt
 * and the jar keeps filling the frame.
 */
import * as THREE from 'three';
import { damp, clamp } from '../ease.js';
import { heightAt } from './terrain.js';
import { WORLD_R, JAR_R } from './look.js';

const PHI_MIN = 0.22, PHI_MAX = 1.42;
const PHI_HOME = 0.9;               // ~38° above the horizon: the moss floor tilts toward you, a stage
const ZOOM_MIN = 0.32, ZOOM_MAX = 1.15; // × fitted distance: never inside the glass from orbit, never lost
const FOLLOW_MIN = 0.7, FOLLOW_MAX = 5;
// the jar's silhouette as rings (radius, height): base on the table, top of the straight
// wall, the cork top. A single cylinder to the cork would overstate the top.
export const JAR_RINGS = [[JAR_R + 0.1, -2.15], [JAR_R + 0.1, 4.7], [3.3, 7.4]];
const FILL_H = 0.88, FILL_W = 0.9;

/**
 * Distance and target height at which the jar fills the frame (pure; allocation-free).
 * @returns {{ dist:number, targetY:number }} written into out
 */
export function fitView(phi, aspect, fovYdeg, out = { dist: 20, targetY: 2.6 }, rings = JAR_RINGS) {
  const tanY = Math.tan((fovYdeg * Math.PI) / 360), tanX = tanY * aspect;
  const sp = Math.sin(phi), cp = Math.cos(phi);
  // view basis for theta = 0 (the jar is round, so azimuth does not matter)
  const fy = -cp, fz = -sp;          // forward (x = 0)
  const uy = sp, uz = -cp;           // up
  let ty = (rings[0][1] + rings[rings.length - 1][1]) / 2;
  const nPts = rings.length * 16;
  let d = 20;
  for (let pass = 0; pass < 3; pass++) {
    let lo = 2, hi = 200;
    for (let it = 0; it < 40; it++) {
      d = (lo + hi) / 2;
      let fits = true;
      const cy = ty + d * cp, cz = d * sp;
      for (let k = 0; k < nPts && fits; k++) {
        const ring = rings[k >> 4], a = (k & 15) * Math.PI / 8, y = ring[1], rr = ring[0];
        const px = Math.cos(a) * rr, py = y - cy, pz = Math.sin(a) * rr - cz;
        const depth = py * fy + pz * fz;
        if (depth <= 0.01) { fits = false; break; }
        const nx = px / depth / tanX, ny = (py * uy + pz * uz) / depth / tanY;
        if (Math.abs(nx) > FILL_W || Math.abs(ny) > FILL_H) fits = false;
      }
      if (fits) hi = d; else lo = d;
    }
    d = hi;
    // centre it vertically: measure the projected extent and shift the target
    const cy = ty + d * cp, cz = d * sp;
    let yMin = 1, yMax = -1;
    for (let k = 0; k < nPts; k++) {
      const ring = rings[k >> 4], a = (k & 15) * Math.PI / 8, y = ring[1], rr = ring[0];
      const py = y - cy, pz = Math.sin(a) * rr - cz;
      const ny = (py * uy + pz * uz) / (py * fy + pz * fz) / tanY;
      if (ny < yMin) yMin = ny; if (ny > yMax) yMax = ny;
    }
    ty += ((yMin + yMax) / 2) * d * tanY / Math.max(0.3, sp);
  }
  out.dist = d; out.targetY = ty;
  return out;
}

/**
 * @param {THREE.PerspectiveCamera} camera
 * @param {HTMLElement} dom element that receives pointer and wheel input
 * @param {{ reducedMotion?:boolean }} [opts]
 */
export function createCameraRig(camera, dom, { reducedMotion = false } = {}) {
  const fit = fitView(PHI_HOME, camera.aspect || 1.6, camera.fov);
  const home = new THREE.Vector3(0, fit.targetY, 0);
  const target = home.clone();
  let theta = -0.32, phi = PHI_HOME, dist = fit.dist;
  let thetaT = theta, phiT = phi, distT = dist;
  let zoom = 1;          // orbit distance = fitted distance × zoom
  let followDistT = 1.9; // follow distance (wheel/pinch adjust it while following)
  let getPos = null;
  let idle = 0, reduced = reducedMotion;
  let cut = false; // reduced motion: follow/release jump instead of gliding
  const goal = new THREE.Vector3();
  const pointers = new Map();
  let pinch0 = 0, pinchDist0 = 0, moved = 0;

  const onDown = (e) => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved = 0; idle = 0;
    dom.setPointerCapture?.(e.pointerId);
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch0 = Math.hypot(a.x - b.x, a.y - b.y); pinchDist0 = getPos ? followDistT : zoom;
    }
  };
  const onMove = (e) => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    moved += Math.abs(dx) + Math.abs(dy);
    idle = 0;
    if (pointers.size === 1) {
      // azimuth only: on a page, a vertical drag belongs to scrolling (touch-action: pan-y)
      const k = 1 / Math.max(320, Math.min(dom.clientWidth, dom.clientHeight));
      thetaT -= dx * k * 3.2;
    } else if (pointers.size === 2 && pinch0 > 0) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      setZoom(pinchDist0 * (pinch0 / Math.max(1, d)));
    }
  };
  const onUp = (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch0 = 0;
  };
  function setZoom(v) {
    if (getPos) followDistT = clamp(v, FOLLOW_MIN, FOLLOW_MAX);
    else zoom = clamp(v, ZOOM_MIN, ZOOM_MAX);
  }

  dom.addEventListener('pointerdown', onDown);
  dom.addEventListener('pointermove', onMove);
  dom.addEventListener('pointerup', onUp);
  dom.addEventListener('pointercancel', onUp);

  const rig = {
    /**
     * Drive the orbit from outside (the track figure's scroll-driven intro): tilt, azimuth and a zoom
     * factor on the fitted distance become the goals, damped like any input. snap lands on them at once
     * (a poster still). It also counts as input, so the idle turn does not fight it.
     */
    setOrbit(p, t, z = zoom, snap = false) {
      phiT = clamp(p, PHI_MIN, PHI_MAX);
      thetaT = t;
      zoom = clamp(z, ZOOM_MIN, ZOOM_MAX);
      idle = 0;
      if (snap) cut = true;
    },
    /** the goal azimuth (radians), which a drag moves */
    get azimuth() { return thetaT; },
    follow(fn) {
      getPos = fn;
      followDistT = 1.9;
      phiT = clamp(phiT, 0.5, 1.15);
      if (reduced) cut = true;
    },
    release() {
      if (!getPos) return;
      getPos = null;
      phiT = PHI_HOME;
      if (reduced) cut = true;
    },
    get following() { return !!getPos; },
    /** total pointer travel (px) of the current/last press: < 6 means it was a click */
    get dragDistance() { return moved; },
    setReducedMotion(v) { reduced = !!v; },
    update(dt) {
      dt = Math.min(dt, 0.1);
      // refit when the aspect or the tilt changes (the jar keeps filling the frame)
      const a = camera.aspect, pq = Math.round(phiT * 100);
      if (a !== fit.aspect || pq !== fit.phiQ) {
        fitView(pq / 100, a, camera.fov, fit); fit.aspect = a; fit.phiQ = pq; home.y = fit.targetY;
        // extreme aspects fit from far away: keep the room (backdrop, table) inside the far plane
        const far = Math.max(200, fit.dist * ZOOM_MAX + 70);
        if (camera.far !== far) { camera.far = far; camera.updateProjectionMatrix(); }
      }
      distT = getPos ? followDistT : fit.dist * zoom;
      if (getPos) {
        const p = getPos();
        if (!p) rig.release();
        else goal.copy(p);
      }
      if (!getPos) {
        goal.copy(home);
        // when left alone the jar turns very slowly on its own, like a display stand
        idle += dt;
        if (!reduced && idle > 5 && pointers.size === 0) thetaT += dt * 0.025 * Math.min(1, (idle - 5) / 3);
      }
      if (cut) {
        // a cut, not a glide: land on the goal this frame
        cut = false;
        target.copy(goal); theta = thetaT; phi = phiT; dist = distT;
      }
      const lam = getPos ? 4 : 2.5;
      target.x = damp(target.x, goal.x, lam, dt);
      target.y = damp(target.y, goal.y, lam, dt);
      target.z = damp(target.z, goal.z, lam, dt);
      theta = damp(theta, thetaT, 7, dt);
      phi = damp(phi, phiT, 7, dt);
      dist = damp(dist, distT, getPos ? 4 : 3.2, dt);
      const sp = Math.sin(phi);
      camera.position.set(
        target.x + dist * sp * Math.sin(theta),
        target.y + dist * Math.cos(phi),
        target.z + dist * sp * Math.cos(theta),
      );
      // inside the jar never dip under the moss
      const cx = camera.position.x, cz = camera.position.z;
      if (cx * cx + cz * cz < JAR_R * JAR_R) {
        const floor = heightAt(cx / WORLD_R, cz / WORLD_R) + 0.3;
        if (camera.position.y < floor) camera.position.y = floor;
      }
      camera.lookAt(target);
    },
    dispose() {
      dom.removeEventListener('pointerdown', onDown);
      dom.removeEventListener('pointermove', onMove);
      dom.removeEventListener('pointerup', onUp);
      dom.removeEventListener('pointercancel', onUp);
    },
  };
  return rig;
}
