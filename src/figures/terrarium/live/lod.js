// Ported from terrarium src/live/lod.js at 7612a40 (Warren's own project). Changes: none but this header.
/**
 * Leg level of detail. At the overview a creature is a few pixels across and
 * its legs are sub-pixel, yet planting feet and solving IK for them was most
 * of the main thread's work at 1000 creatures. So the renderer asks how big a
 * creature is on screen and spends IK only where it can be seen:
 *   far  (< ~8 px across): legs are sub-pixel, so none are drawn (no gait, no IK)
 *   mid  (~8–20 px): gait + IK on one frame in three (interleaved by slot)
 *   full (> ~20 px): every frame
 * Thresholds have ±15% hysteresis so a creature at a boundary does not flicker.
 */
export const LOD_FAR = 0, LOD_MID = 1, LOD_FULL = 2;
export const LOD_FAR_PX = 8, LOD_NEAR_PX = 20;
const HYST = 0.15;

/** body diameter in screen px, for a body of `radius` at `dist`, with `pxPerUnit` px per unit at distance 1 */
export function projectedPx(radius, dist, pxPerUnit) {
  return (2 * radius * pxPerUnit) / (dist > 1e-3 ? dist : 1e-3);
}

/** next level from the size on screen and the creature's previous level */
export function lodFor(px, prev) {
  // a boundary must be crossed by HYST in the direction of travel before the level changes
  const farUp = LOD_FAR_PX * (1 + HYST), farDown = LOD_FAR_PX * (1 - HYST);
  const nearUp = LOD_NEAR_PX * (1 + HYST), nearDown = LOD_NEAR_PX * (1 - HYST);
  if (prev === LOD_FAR) return px > nearUp ? LOD_FULL : px > farUp ? LOD_MID : LOD_FAR;
  if (prev === LOD_FULL) return px < farDown ? LOD_FAR : px < nearDown ? LOD_MID : LOD_FULL;
  return px < farDown ? LOD_FAR : px > nearUp ? LOD_FULL : LOD_MID;
}
