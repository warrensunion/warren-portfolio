// The drag orbit of an ice figure, kept free of three.js and the DOM so its numbers can be tested in
// Node. The hub never let anyone turn a block; the gain comes from its tube drag (tube.js:742-754),
// and the yaw limit from block.js's fitting, which only guarantees the art stays inside the hull for
// turns up to +-39 deg. Letting go springs back, critically damped, so a block never overshoots home.

export const DEG = Math.PI / 180;
export const YAW_MAX = 39 * DEG;
export const PITCH_MAX = 12 * DEG;
/** Radians per max(320, stage width) px of drag (the hub tube's feel). */
export const DRAG_GAIN = 2.6;
/** Critically damped spring rate (1/s): ~95 % of the way home in 0.8 s. */
export const SPRING = 6;
/** One arrow key press. */
export const KEY_YAW = 8 * DEG;
export const KEY_PITCH = 4 * DEG;

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/** The angle a drag of dPx (from where it started at `start`) turns to, clamped to +-limit. */
export function dragAngle(start, dPx, sizePx, limit) {
  return clamp(start + (dPx / Math.max(320, sizePx || 0)) * DRAG_GAIN, -limit, limit);
}

/**
 * One exact step of a critically damped spring toward 0: x(t) = (x0 + (v0 + w x0) t) e^(-w t).
 * Exact rather than Euler so a long frame (a tab coming back) cannot make it overshoot or blow up.
 */
export function springStep(x, v, dt, omega = SPRING) {
  const e = Math.exp(-omega * dt);
  const c = v + omega * x;
  return [(x + c * dt) * e, (v - omega * c * dt) * e];
}

/** Arrow keys -> [yaw, pitch] nudge, or null for any other key. */
export function keyNudge(key) {
  switch (key) {
    case 'ArrowLeft':
      return [-KEY_YAW, 0];
    case 'ArrowRight':
      return [KEY_YAW, 0];
    case 'ArrowUp':
      return [0, -KEY_PITCH];
    case 'ArrowDown':
      return [0, KEY_PITCH];
    default:
      return null;
  }
}

/** The plate's readout: "yaw 12°", "yaw -7°" (ASCII minus, never "-0"). */
export function formatYaw(rad) {
  const d = Math.round(rad / DEG) || 0;
  return `yaw ${d}°`;
}

/**
 * The orbit's state. Held (a pointer down, or an arrow key down) it stays where it is put; released it
 * springs home. Angles are radians; yaw > 0 turns the block's front to the right.
 */
export class Orbit {
  constructor() {
    this.yaw = 0;
    this.pitch = 0;
    this.vy = 0;
    this.vp = 0;
    this.held = 0; // count of holds: a pointer and a key may overlap
    this._from = null;
  }

  grab() {
    this.held += 1;
    this.vy = 0;
    this.vp = 0;
    this._from = [this.yaw, this.pitch];
  }

  /** dx, dy: px since grab(); size: the stage width in px. */
  drag(dx, dy, size) {
    if (!this._from) return;
    this.yaw = dragAngle(this._from[0], dx, size, YAW_MAX);
    this.pitch = dragAngle(this._from[1], dy, size, PITCH_MAX);
  }

  release() {
    this.held = Math.max(0, this.held - 1);
    if (!this.held) this._from = null;
  }

  nudge(dyaw, dpitch) {
    this.vy = 0;
    this.vp = 0;
    this.yaw = clamp(this.yaw + dyaw, -YAW_MAX, YAW_MAX);
    this.pitch = clamp(this.pitch + dpitch, -PITCH_MAX, PITCH_MAX);
    if (this._from) this._from = [this.yaw, this.pitch];
  }

  /** Advance dt seconds. Returns true while the orbit is away from home or moving. */
  step(dt) {
    if (!this.held) {
      [this.yaw, this.vy] = springStep(this.yaw, this.vy, dt);
      [this.pitch, this.vp] = springStep(this.pitch, this.vp, dt);
      if (Math.abs(this.yaw) < 1e-5 && Math.abs(this.vy) < 1e-5) this.yaw = this.vy = 0;
      if (Math.abs(this.pitch) < 1e-5 && Math.abs(this.vp) < 1e-5) this.pitch = this.vp = 0;
    }
    return this.held > 0 || this.yaw !== 0 || this.pitch !== 0;
  }
}
