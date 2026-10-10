// Ported from terrarium src/sim/sense-cpu.js at 7612a40 (Warren's own project). Changes: none but this header.
/**
 * Sensing is the only O(n²)-shaped part of a step (600 creatures × 900
 * pellets × 600 creatures), so on the CPU it goes through a uniform grid:
 * cells are a quarter of the 0.35 sensing radius and the nearest-neighbour
 * search walks rings outward and stops as soon as no farther ring can beat
 * the best hit. Grids are counting-sorted into preallocated typed arrays,
 * so building and querying them allocates nothing.
 *
 * Positions are read from the world's Float32 snapshot (x, y, heading per
 * creature), the same bytes the WebGPU sensor uploads, and ties go to the
 * lower index exactly like the GPU's linear scan; that is what lets the
 * ?simcheck=1 parity run compare the two paths to float precision.
 */
export const SENSE_R = 0.35;
export const GRID_N = 23;
export const CELL = 2 / GRID_N; // ~0.087: four cells per sensing radius
const RINGS = Math.ceil(SENSE_R / CELL);
const R2 = SENSE_R * SENSE_R;

export function createGrid(cap) {
  return { start: new Int32Array(GRID_N * GRID_N + 1), items: new Int32Array(cap), cell: new Int32Array(cap) };
}

export function cellCoord(v) {
  const c = Math.floor((v + 1) / CELL);
  return c < 0 ? 0 : c >= GRID_N ? GRID_N - 1 : c;
}

/**
 * Index n points of xy (stride 3: x, y, third). With `needAmount`, points
 * whose third value is <= 0 (eaten food) are left out.
 */
export function buildGrid(grid, xy, n, needAmount) {
  const { start, items, cell } = grid;
  start.fill(0);
  for (let i = 0; i < n; i++) {
    const o = i * 3;
    if (needAmount && !(xy[o + 2] > 0)) {
      cell[i] = -1;
      continue;
    }
    const k = cellCoord(xy[o + 1]) * GRID_N + cellCoord(xy[o]);
    cell[i] = k;
    start[k + 1]++;
  }
  const nn = GRID_N * GRID_N;
  for (let k = 0; k < nn; k++) start[k + 1] += start[k]; // start[k+1] = end of cell k
  const total = start[nn];
  // fill back to front, so each cell lists indices ascending; afterwards
  // start[k+1] has been walked down to the beginning of cell k
  for (let i = n - 1; i >= 0; i--) {
    const k = cell[i];
    if (k >= 0) items[--start[k + 1]] = i;
  }
  for (let k = 0; k < nn; k++) start[k] = start[k + 1];
  start[nn] = total;
  return grid;
}

/**
 * Nearest indexed point to (x, y) within SENSE_R, skipping index `self`.
 * Returns the index or -1.
 */
export function nearest(grid, xy, x, y, self) {
  const { start, items } = grid;
  const cx = cellCoord(x), cy = cellCoord(y);
  let best = -1, bestD2 = R2;
  for (let k = 0; k <= RINGS; k++) {
    if (best >= 0 && bestD2 < ((k - 1) * CELL) ** 2) break;
    const y0 = cy - k, y1 = cy + k;
    for (let gy = y0; gy <= y1; gy++) {
      if (gy < 0 || gy >= GRID_N) continue;
      const edge = gy === y0 || gy === y1;
      const step = edge ? 1 : 2 * k || 1;
      for (let gx = cx - k; gx <= cx + k; gx += step) {
        if (gx < 0 || gx >= GRID_N) continue;
        const kk = gy * GRID_N + gx;
        for (let s = start[kk], e = start[kk + 1]; s < e; s++) {
          const j = items[s];
          if (j === self) continue;
          const dx = xy[j * 3] - x, dy = xy[j * 3 + 1] - y;
          const d2 = dx * dx + dy * dy;
          if (d2 < bestD2 || (d2 === bestD2 && j < best)) {
            bestD2 = d2;
            best = j;
          }
        }
      }
    }
  }
  return best;
}

/**
 * Writes inputs 0..5 (food sin, cos, distance; creature sin, cos, distance)
 * for every creature, angles relative to heading, distance 1 = nothing
 * within reach. The world must have called indexSpace() this step.
 */
export function senseCPU(world) {
  const { creatures, snap, food, creatureGrid, foodGrid } = world;
  for (let i = 0, n = creatures.length; i < n; i++) {
    const inp = creatures[i].inputs;
    const x = snap[i * 3], y = snap[i * 3 + 1], h = snap[i * 3 + 2];
    const sh = Math.sin(h), ch = Math.cos(h);
    let j = nearest(foodGrid, food, x, y, -1);
    if (j >= 0) relative(inp, 0, food[j * 3] - x, food[j * 3 + 1] - y, sh, ch);
    else none(inp, 0);
    j = nearest(creatureGrid, snap, x, y, i);
    if (j >= 0) relative(inp, 3, snap[j * 3] - x, snap[j * 3 + 1] - y, sh, ch);
    else none(inp, 3);
  }
}

function relative(inp, o, dx, dy, sh, ch) {
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d < 1e-9) {
    inp[o] = 0; inp[o + 1] = 1; inp[o + 2] = 0;
    return;
  }
  inp[o] = (dy * ch - dx * sh) / d; // sin(angle - heading)
  inp[o + 1] = (dx * ch + dy * sh) / d; // cos(angle - heading)
  inp[o + 2] = d / SENSE_R;
}

function none(inp, o) {
  inp[o] = 0; inp[o + 1] = 0; inp[o + 2] = 1;
}
