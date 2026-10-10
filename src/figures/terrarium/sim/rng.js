// Ported from terrarium src/sim/rng.js at 7612a40 (Warren's own project). Changes: none but this header.
/**
 * Every random draw in the sim comes from here so a seed replays a world
 * bit for bit (tests compare two runs frame by frame). mulberry32 is tiny,
 * fast and good enough for a toy ecology; Math.random is never used in sim/.
 */
export function createRng(seed = 1) {
  let s = seed >>> 0;
  let spare = NaN; // Box-Muller makes two normals; keep the second

  function next() {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  return {
    next,
    int: (n) => Math.floor(next() * n),
    range: (a, b) => a + (b - a) * next(),
    normal() {
      if (spare === spare) {
        const v = spare;
        spare = NaN;
        return v;
      }
      const u = 1 - next(); // (0, 1], so log is finite
      const r = Math.sqrt(-2 * Math.log(u));
      const a = 2 * Math.PI * next();
      spare = r * Math.sin(a);
      return r * Math.cos(a);
    },
    pick: (arr) => arr[Math.floor(next() * arr.length)],
  };
}
