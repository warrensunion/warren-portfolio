// The game's input, scoped to the figure so the page keeps its own keys and its scrolling (spec 3.7):
// keys are read only from keydown events whose target is the figure element itself (a control inside
// it, or anything else on the page, never moves the archer), and only while a game is playing; only
// then do WASD, the arrows, Space, Q and E get preventDefault. Esc with the pointer unlocked asks the
// figure to let go (onEsc); with it locked the browser's own Esc releases the lock first. There is no
// wheel handler at all.
//
// Turning: mouse moves under Pointer Lock, or, when the lock is refused (headless, iframe policy, the
// visitor declining), a drag with the mouse. On touch, a 120 px stick on the left moves and a drag on
// the right half of the stage turns; the stage keeps touch-action: pan-y, so a vertical swipe still
// scrolls the page. Blur, a hidden tab and clear() release everything held.

export const SENSITIVITY = 0.0025; // rad per px
const STICK_R = 60; // px: the stick's travel, half its 120 px circle

const KEYS = {
  KeyW: 'up',
  ArrowUp: 'up',
  KeyS: 'down',
  ArrowDown: 'down',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
  KeyQ: 'dodge',
  KeyE: 'rain',
};
// Kept from the page while a game is focused and playing: the game's keys, and Space (it would scroll).
const KEPT = new Set([...Object.keys(KEYS), 'Space']);

export const keyMap = (code) => KEYS[code] || null;

/**
 * el: the figure (keys, blur). opts.surface: where pointers turn and the stick lives (the stage; el by
 * default). opts.stick: the stick element, if any (its child .ah-stick-knob follows the thumb).
 */
export function createInput(el, { onEsc, surface = el, stick = null } = {}) {
  const doc = el.ownerDocument || (typeof document !== 'undefined' ? document : null);
  const held = new Set();
  const pressed = { dodge: false, rain: false };
  let isPlaying = false;
  let yaw = 0;
  let drag = null; // { id, x }: a mouse drag (no pointer lock) or a touch on the right half, turning
  let thumb = null; // { id, cx, cy, x, y }: the touch on the stick
  const knob = stick && stick.querySelector ? stick.querySelector('.ah-stick-knob') : null;
  const listeners = [];
  const on = (target, type, fn, opts) => {
    if (!target || !target.addEventListener) return;
    target.addEventListener(type, fn, opts);
    listeners.push([target, type, fn, opts]);
  };
  const locked = () => !!doc && doc.pointerLockElement === el;

  function moveKnob(x, y) {
    if (knob) knob.style.transform = `translate(${x}px, ${y}px)`;
  }

  function clear() {
    held.clear();
    pressed.dodge = pressed.rain = false;
    drag = null;
    thumb = null;
    moveKnob(0, 0);
  }

  on(el, 'keydown', (e) => {
    if (e.target !== el) return;
    if (e.code === 'Escape' || e.key === 'Escape') {
      if (!locked()) onEsc?.();
      return;
    }
    if (!isPlaying) return;
    if (KEPT.has(e.code)) e.preventDefault();
    const k = keyMap(e.code);
    if (!k) return;
    if (k === 'dodge' || k === 'rain') {
      if (!e.repeat) pressed[k] = true;
    } else held.add(k);
  });
  // A key let go anywhere is let go: focus may have moved while it was down.
  on(el, 'keyup', (e) => {
    const k = keyMap(e.code);
    if (k) held.delete(k);
  });
  on(el, 'blur', clear);
  on(doc, 'visibilitychange', () => {
    if (doc.hidden) clear();
  });

  // Pointer Lock: relative mouse moves turn the camera (right turns right, so yaw falls).
  on(el, 'mousemove', (e) => {
    if (isPlaying && locked()) yaw -= (e.movementX || 0) * SENSITIVITY;
  });

  on(surface, 'pointerdown', (e) => {
    if (!isPlaying || locked()) return;
    if (e.pointerType === 'touch') {
      if (stick && !thumb && stick.contains?.(e.target)) {
        const r = stick.getBoundingClientRect();
        thumb = { id: e.pointerId, cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
        moveThumb(e);
        return;
      }
      const r = surface.getBoundingClientRect?.();
      if (!drag && r && e.clientX >= r.left + r.width / 2) drag = { id: e.pointerId, x: e.clientX };
      return;
    }
    if (e.button === 0 && !drag) drag = { id: e.pointerId, x: e.clientX };
  });
  function moveThumb(e) {
    let dx = e.clientX - thumb.cx;
    let dy = e.clientY - thumb.cy;
    const l = Math.hypot(dx, dy);
    if (l > STICK_R) {
      dx *= STICK_R / l;
      dy *= STICK_R / l;
    }
    thumb.x = dx / STICK_R;
    thumb.y = -dy / STICK_R;
    moveKnob(dx, dy);
  }
  on(surface, 'pointermove', (e) => {
    if (thumb && e.pointerId === thumb.id) return moveThumb(e);
    if (drag && e.pointerId === drag.id && !locked()) {
      yaw -= (e.clientX - drag.x) * SENSITIVITY;
      drag.x = e.clientX;
    }
  });
  const up = (e) => {
    if (thumb && e.pointerId === thumb.id) {
      thumb = null;
      moveKnob(0, 0);
    }
    if (drag && e.pointerId === drag.id) drag = null;
  };
  on(surface, 'pointerup', up);
  on(surface, 'pointercancel', up);
  on(surface, 'lostpointercapture', up);

  const axis = (pos, neg) => (held.has(pos) ? 1 : 0) - (held.has(neg) ? 1 : 0);
  const clamp1 = (v) => Math.max(-1, Math.min(1, v));

  return {
    /** The input for this tick; a Q or E press is reported once. */
    read() {
      const out = {
        mx: clamp1(axis('right', 'left') + (thumb?.x || 0)),
        mz: clamp1(axis('up', 'down') + (thumb?.y || 0)),
        yaw,
        dodge: pressed.dodge,
        rain: pressed.rain,
      };
      pressed.dodge = pressed.rain = false;
      return out;
    },
    /** A tap on the on-screen Q or E button. */
    press(action) {
      if (isPlaying && (action === 'dodge' || action === 'rain')) pressed[action] = true;
    },
    playing(on) {
      isPlaying = !!on;
      if (!isPlaying) clear();
    },
    get isPlaying() {
      return isPlaying;
    },
    setYaw(v) {
      yaw = v;
    },
    clear,
    destroy() {
      for (const [t, type, fn, opts] of listeners) t.removeEventListener(type, fn, opts);
      listeners.length = 0;
      clear();
    },
  };
}
