// The camera rig: where the camera stands and looks at an altitude, plus the visitor's own say (drag to
// look round, with damped inertia that springs back once let go; the cursor's slight parallax when not
// dragging; a small idle sway). The camera walks the ridge crest (land.js) and looks out across the range
// at a bearing that turns from log to log (up the valley at base camp, toward the icefall, west over the
// crevasse plateau, out and down over the cloud sea at the summit). The igloo stands on its own snow knoll
// a little ahead and right of the view, as igloo.inc's stands on its hill, so it is always in frame, on
// the side of the screen the text column is not.
import * as THREE from 'three';
import { H, crestX, sOfAlt, L } from './land.js';

const EYE = 4.2; // camera height over the snow, m
const DEG = Math.PI / 180;

// [altitude, bearing (deg east of north), pitch (deg)]: the view turns as the climb goes on.
const VIEWS = [
  [0, 28, 0],
  [900, 52, -5],
  [2100, 50, -14],
  [3400, -72, -7],
  [4600, -104, -10],
  [5500, 58, -9],
  [6100, 14, -13],
];
function view(alt) {
  let i = 0;
  while (i + 1 < VIEWS.length && alt > VIEWS[i + 1][0]) i++;
  const a = VIEWS[i];
  const b = VIEWS[Math.min(i + 1, VIEWS.length - 1)];
  const t = b[0] > a[0] ? Math.max(0, Math.min(1, (alt - a[0]) / (b[0] - a[0]))) : 0;
  const k = t * t * (3 - 2 * t);
  return [a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}

export function createRig() {
  const look = { yaw: 0, pitch: 0, vy: 0, vp: 0, dragging: false, idle: 0 };
  const par = { x: 0, y: 0 };
  const out = {
    pos: new THREE.Vector3(),
    target: new THREE.Vector3(),
    igloo: new THREE.Vector3(),
    iglooYaw: 0,
    knoll: 4, // how far the knoll's skirt reaches down to the slope, m
  };
  const fwd = new THREE.Vector3();
  const right = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);

  return {
    out,
    /** Drag deltas in CSS px (grab the world: drag right turns the view left). */
    drag(dx, dy) {
      look.dragging = true;
      look.idle = 0;
      look.vy = dx * 0.0035;
      look.vp = dy * 0.0028;
      look.yaw += look.vy;
      look.pitch += look.vp;
    },
    release() {
      look.dragging = false;
    },
    /** The pointer's NDC (or null when it left the window), for the parallax. */
    pointer(p) {
      par.x = p ? p[0] : 0;
      par.y = p ? p[1] : 0;
    },
    /** Pose at an altitude (m). aspect: width / height (portrait frames the igloo nearer the middle). */
    update(alt, { aspect, dt, time, motion }) {
      const s = sOfAlt(alt);
      const z = -s * L;
      const cx = crestX(s);
      const gy = H(cx, z, 6);
      // a little higher over the crest as it steepens, so its own bumps never fill the view
      const camY = gy + EYE + 5 * Math.min(1, Math.max(0, (s - 0.03) / 0.22));
      out.pos.set(cx, camY, z);

      const [bearing, pitch0] = view(alt);
      const portrait = aspect < 1;
      // the igloo: ahead, right of the view, on its knoll a little below the eye
      const ib = (bearing + (portrait ? 3 : 15)) * DEG;
      const dist = portrait ? 19 : 15.5;
      const ix = cx + Math.sin(ib) * dist;
      const iz = z - Math.cos(ib) * dist;
      const iy = camY - (portrait ? 4.6 : 3.9);
      out.igloo.set(ix, iy, iz);
      // deep enough that the skirt meets the slope below it on every side, not in the air
      out.knoll = Math.max(4, iy - H(ix, iz, 5) + 10);
      out.iglooYaw = Math.atan2(cx - ix, z - iz) - 0.45;

      // the visitor's look: inertia while free, a slow spring home after 2.5 s
      if (!look.dragging) {
        look.idle += dt;
        look.yaw += look.vy;
        look.pitch += look.vp;
        const damp = Math.exp(-dt * 4);
        look.vy *= damp;
        look.vp *= damp;
        if (look.idle > 2.5) {
          const k = 1 - Math.exp(-dt * 0.9);
          look.yaw -= look.yaw * k;
          look.pitch -= look.pitch * k;
        }
      }
      look.yaw = Math.max(-1.2, Math.min(1.2, look.yaw));
      look.pitch = Math.max(-0.45, Math.min(0.4, look.pitch));
      const sway = motion ? Math.sin(time * 0.31) * 0.006 + Math.sin(time * 0.17) * 0.004 : 0;
      const yaw = -bearing * DEG + look.yaw + (look.dragging ? 0 : par.x * -0.035 * motion) + sway;
      const pitch = pitch0 * DEG + (portrait ? -0.05 : 0) + look.pitch + (look.dragging ? 0 : par.y * 0.022 * motion);
      fwd.set(0, 0, -1).applyAxisAngle(up, yaw);
      right.crossVectors(fwd, up).normalize();
      fwd.applyAxisAngle(right, pitch);
      out.target.copy(out.pos).addScaledVector(fwd, 1000);
      return out;
    },
  };
}
