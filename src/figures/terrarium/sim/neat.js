// Ported from terrarium src/sim/neat.js at 7612a40 (Warren's own project). Changes: none but this header.
/**
 * NEAT, small enough to read in one sitting. Genomes are plain JSON so they
 * cross the worker boundary for the brain panel untouched; brains are
 * compiled from them once, at birth, into flat typed arrays, because a
 * world of 600 creatures activates 600 brains up to 16 times a frame and
 * must not allocate while doing it.
 *
 * Activation is recurrent, one step per call (every node reads the previous
 * values of its sources), so loops are legal and a pulse visibly travels
 * through hidden nodes over successive ticks in the brain panel.
 *
 * Every activation is bounded (tanh, sigmoid, sin, and a relu capped at 1)
 * and weights are clamped, so even a genome mutated at rate 1 for hours
 * cannot overflow to Infinity/NaN.
 */
export const N_IN = 8;
export const N_OUT = 4;
export const BIAS = N_IN; // node id 8
export const FIRST_OUT = N_IN + 1; // 9..12: turn, thrust, eat, mate
export const FIRST_HIDDEN = FIRST_OUT + N_OUT; // 13
export const MAX_HIDDEN = 48;
const W_MAX = 8;
const HIDDEN_ACTS = ['tanh', 'sigmoid', 'relu', 'sin'];
const ACT_CODE = { id: 0, tanh: 1, sigmoid: 2, relu: 3, sin: 4 };

/**
 * tanh as a 7th-order Lambert continued fraction (|error| < 1e-4, exact ±1
 * beyond ±4.97). Math.tanh and Math.exp are several times slower and this
 * runs ~10 times per creature per step.
 */
export function tanh(x) {
  if (x > 4.97) return 1;
  if (x < -4.97) return -1;
  const x2 = x * x;
  const v = (x * (135135 + x2 * (17325 + x2 * (378 + x2)))) / (135135 + x2 * (62370 + x2 * (3150 + x2 * 28)));
  return v > 1 ? 1 : v < -1 ? -1 : v;
}

/**
 * One tracker per world: the same structural mutation, wherever it happens,
 * gets the same innovation number (and a split the same node id), which is
 * what lets crossover line genomes up.
 */
export function createTracker() {
  const conns = new Map();
  const splits = new Map();
  let nextInn = 0;
  let nextNode = FIRST_HIDDEN;
  return {
    connInn(from, to) {
      const key = from * 1048576 + to;
      let inn = conns.get(key);
      if (inn === undefined) conns.set(key, (inn = nextInn++));
      return inn;
    },
    splitNode(inn) {
      let id = splits.get(inn);
      if (id === undefined) splits.set(inn, (id = nextNode++));
      return id;
    },
  };
}

export function createGenome(rng, tracker) {
  const nodes = [];
  for (let i = 0; i < N_IN; i++) nodes.push({ id: i, type: 'in', act: 'id' });
  nodes.push({ id: BIAS, type: 'bias', act: 'id' });
  for (let i = 0; i < N_OUT; i++) nodes.push({ id: FIRST_OUT + i, type: 'out', act: 'tanh' });
  const conns = [];
  for (let from = 0; from <= BIAS; from++) {
    for (let o = 0; o < N_OUT; o++) {
      const to = FIRST_OUT + o;
      conns.push({ inn: tracker.connInn(from, to), from, to, w: rng.normal(), on: true });
    }
  }
  conns.sort(byInn);
  return { nodes, conns };
}

const byInn = (a, b) => a.inn - b.inn;
const clampW = (w) => (w > W_MAX ? W_MAX : w < -W_MAX ? -W_MAX : w);
const copy = (g) => ({ nodes: g.nodes.map((n) => ({ ...n })), conns: g.conns.map((c) => ({ ...c })) });

export function mutate(g, rng, tracker, rate = 0.3) {
  const out = copy(g);
  const { nodes, conns } = out;

  // weights: perturb (90%) or reset (10%)
  const pw = 0.8 * rate;
  for (const c of conns) {
    if (rng.next() >= pw) continue;
    c.w = clampW(rng.next() < 0.9 ? c.w + rng.normal() * 0.4 : rng.normal());
  }

  if (rng.next() < 0.08 * rate) {
    for (let attempt = 0; attempt < 20; attempt++) {
      const from = nodes[rng.int(nodes.length)].id;
      const toNode = nodes[rng.int(nodes.length)];
      if (toNode.type === 'in' || toNode.type === 'bias') continue;
      const to = toNode.id;
      if (conns.some((c) => c.from === from && c.to === to)) continue;
      conns.push({ inn: tracker.connInn(from, to), from, to, w: rng.normal(), on: true });
      conns.sort(byInn);
      break;
    }
  }

  if (rng.next() < 0.04 * rate) {
    const hidden = nodes.length - FIRST_HIDDEN;
    const enabled = conns.filter((c) => c.on);
    if (hidden < MAX_HIDDEN && enabled.length) {
      const old = enabled[rng.int(enabled.length)];
      const id = tracker.splitNode(old.inn);
      // a re-enabled connection split twice would mint a duplicate node
      if (!nodes.some((n) => n.id === id)) {
        old.on = false;
        // activation follows the node id, so the same split is the same gene everywhere
        nodes.push({ id, type: 'hidden', act: HIDDEN_ACTS[id % HIDDEN_ACTS.length] });
        conns.push({ inn: tracker.connInn(old.from, id), from: old.from, to: id, w: 1, on: true });
        conns.push({ inn: tracker.connInn(id, old.to), from: id, to: old.to, w: old.w, on: true });
        conns.sort(byInn);
      }
    }
  }

  if (conns.length && rng.next() < 0.02 * rate) {
    const c = conns[rng.int(conns.length)];
    c.on = !c.on;
  }
  return out;
}

/** Matching genes from a random parent; disjoint and excess from the fitter. */
export function crossover(fitter, other, rng) {
  const conns = [];
  const a = fitter.conns, b = other.conns;
  let j = 0;
  for (let i = 0; i < a.length; i++) {
    const ca = a[i];
    while (j < b.length && b[j].inn < ca.inn) j++;
    const src = j < b.length && b[j].inn === ca.inn && rng.next() < 0.5 ? b[j] : ca;
    conns.push({ inn: ca.inn, from: ca.from, to: ca.to, w: src.w, on: src.on });
  }
  return { nodes: fitter.nodes.map((n) => ({ ...n })), conns };
}

/** δ = c1·E/N + c2·D/N + c3·W̄ over innovation-sorted connection genes. */
export function distance(a, b, { c1 = 1, c2 = 1, c3 = 0.4 } = {}) {
  const A = a.conns, B = b.conns;
  let i = 0, j = 0, disjoint = 0, matching = 0, wsum = 0;
  while (i < A.length && j < B.length) {
    const ia = A[i].inn, ib = B[j].inn;
    if (ia === ib) {
      wsum += Math.abs(A[i].w - B[j].w);
      matching++;
      i++; j++;
    } else if (ia < ib) {
      disjoint++; i++;
    } else {
      disjoint++; j++;
    }
  }
  const excess = A.length - i + (B.length - j);
  const n = Math.max(A.length, B.length, 1);
  return (c1 * excess) / n + (c2 * disjoint) / n + c3 * (matching ? wsum / matching : 0);
}

export function validateGenome(g) {
  const errors = [];
  const types = new Map();
  for (const n of g.nodes) {
    if (types.has(n.id)) errors.push(`duplicate node ${n.id}`);
    types.set(n.id, n.type);
    if (!(n.act in ACT_CODE)) errors.push(`node ${n.id} has unknown act ${n.act}`);
  }
  const inns = new Set();
  const pairs = new Set();
  for (const c of g.conns) {
    if (inns.has(c.inn)) errors.push(`duplicate innovation ${c.inn}`);
    inns.add(c.inn);
    const pair = c.from * 1048576 + c.to;
    if (pairs.has(pair)) errors.push(`duplicate connection ${c.from}>${c.to}`);
    pairs.add(pair);
    if (!types.has(c.from)) errors.push(`conn ${c.inn} from missing node ${c.from}`);
    if (!types.has(c.to)) errors.push(`conn ${c.inn} to missing node ${c.to}`);
    const t = types.get(c.to);
    if (t === 'in' || t === 'bias') errors.push(`conn ${c.inn} into ${t} node ${c.to}`);
    if (!Number.isFinite(c.w)) errors.push(`conn ${c.inn} weight ${c.w}`);
  }
  return errors;
}

/**
 * Compiles a genome to flat arrays. `activate` reuses its output array, so
 * callers read it before the next call.
 */
export function createBrain(g) {
  const n = g.nodes.length;
  const order = g.nodes.map((nd) => nd.id);
  const index = new Map(order.map((id, i) => [id, i]));
  const acts = new Uint8Array(n);
  g.nodes.forEach((nd, i) => (acts[i] = ACT_CODE[nd.act]));
  const live = g.conns.filter((c) => c.on).map((c) => [index.get(c.from), index.get(c.to), c.w]);
  live.sort((p, q) => p[1] - q[1] || p[0] - q[0]);
  const src = new Int32Array(live.length);
  const w = new Float32Array(live.length);
  const start = new Int32Array(n + 1); // conns into node k are start[k]..start[k+1]
  live.forEach(([s, d, wt], k) => {
    src[k] = s;
    w[k] = wt;
    start[d + 1]++;
  });
  for (let k = 0; k < n; k++) start[k + 1] += start[k];

  const outIdx = new Int32Array(N_OUT);
  for (let o = 0; o < N_OUT; o++) outIdx[o] = index.get(FIRST_OUT + o);
  const values = new Float32Array(n);
  const prev = new Float32Array(n);
  const outputs = new Float32Array(N_OUT);

  function activate(inputs) {
    for (let i = 0; i < N_IN; i++) values[i] = inputs[i];
    values[BIAS] = 1;
    for (let k = 0; k < n; k++) prev[k] = values[k]; // .set() costs more on arrays this small
    for (let k = BIAS + 1; k < n; k++) {
      let s = 0;
      for (let c = start[k], e = start[k + 1]; c < e; c++) s += w[c] * prev[src[c]];
      switch (acts[k]) {
        case 1: s = tanh(s); break;
        case 2: s = 0.5 + 0.5 * tanh(0.5 * s); break; // logistic sigmoid
        case 3: s = s < 0 ? 0 : s > 1 ? 1 : s; break;
        case 4: s = Math.sin(s); break;
        default: break;
      }
      values[k] = s;
    }
    for (let o = 0; o < N_OUT; o++) outputs[o] = values[outIdx[o]];
    return outputs;
  }

  return { activate, values, order };
}
