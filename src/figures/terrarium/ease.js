// Ported from terrarium src/core/ease.js at 7612a40 (Warren's own project). Changes: none but this header.
/**
 * The easing vocabulary. makemepulse's transitions are GSAP Power2-4 curves
 * (design-reference/makemepulse/NOTES.md), so these are the same maths:
 * PowerN.easeIn = t^(N+1). The CSS twins are --e-* in styles/tokens.css.
 */
const pin = (n) => (t) => t ** n;
const pout = (n) => (t) => 1 - (1 - t) ** n;
const pinout = (n) => (t) => (t < 0.5 ? (2 * t) ** n / 2 : 1 - (2 - 2 * t) ** n / 2);

export const p1in = pin(2), p1out = pout(2), p1inOut = pinout(2);
export const p2in = pin(3), p2out = pout(3), p2inOut = pinout(3);
export const p3in = pin(4), p3out = pout(4), p3inOut = pinout(4);
export const p4in = pin(5), p4out = pout(5), p4inOut = pinout(5);

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
/** frame-rate independent exponential smoothing; lambda = 1 / time constant */
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
/** progress of v through [a, b], clamped */
export const range = (v, a, b) => clamp((v - a) / (b - a), 0, 1);

/** Expo.easeOut: the preloader pop and hover breath (NOTES.md §1). Exactly 1 at t = 1. */
export const expoOut = (t) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t));
/** smoothstep-free hermite for idle wobble where a curve must have zero slope at both ends */
export const smooth = (t) => t * t * (3 - 2 * t);
/** run an ease over a window [start, start + dur] of a timeline; 0 before, 1 after */
export const seg = (t, start, dur, ease = (x) => x) => ease(range(t, start, start + dur));
