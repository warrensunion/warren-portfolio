// Ported from terrarium src/worker/sim.worker.js at 7612a40 (Warren's own project). Changes: slimmed for the
// track figure: CPU sensor only (no sense-gpu.js, so the world is deterministic and matches history.json), no
// simcheck, no URL params, no params or debug-kill messages; `reset` restarts the same seed; a step carries
// `n`; the backlog divisor is taken once per queued batch; `handle(msg, post)` is exported for Node tests.
/**
 * The world lives here, off the main thread, so a 16x frame of stepping never costs the renderer a frame.
 * The figure asks for n steps once per rAF and always gets exactly one answer back: a frame, with its typed
 * arrays transferred rather than copied, or `{type:'error', message, request}` if handling failed. A step
 * before a successful init is an error too, never an empty frame, so the figure can fall back.
 *
 * Messages are handled strictly in order through one promise chain. If step requests pile up faster than
 * they can be served, each runs its steps divided by the backlog, so a slow device slows the sim down
 * instead of drowning in queued work. The divisor is the backlog seen when the first of a queued batch
 * starts, and holds for that whole batch: four queued requests of 16 run 4 steps each.
 *
 * Messages in: {type:'init', seed, count, params}, {type:'step', n}, {type:'inspect', id}, {type:'reset'}.
 * Messages out: {type:'frame', ...packFrame(...)} and {type:'error', message, request}.
 */
import { createWorld, packFrame } from './sim/world.js';
import { senseCPU } from './sim/sense-cpu.js';

let world = null;
let config = null;
let inspectId = null;
let since = -1;
let carryDeaths = []; // ids from a world replaced by reset, not yet reported
let carryDead = null;
let queue = Promise.resolve();
let pending = 0; // step requests queued and not yet started
let batchLeft = 0; // requests left in the batch the current divisor was taken for
let batchDiv = 1;

/** Queue one message; resolves once it has been handled (and answered, for a step). */
export function handle(msg, post) {
  if (msg?.type === 'step') pending++;
  const run = queue.then(() => handleNow(msg, post)).catch((err) => {
    post({ type: 'error', message: String(err?.message || err), request: msg?.type ?? null });
  });
  queue = run;
  return run;
}

function handleNow(msg, post) {
  switch (msg?.type) {
    case 'init':
      config = { seed: msg.seed ?? 1, count: msg.count ?? 300, params: { ...msg.params } };
      inspectId = null;
      carryDeaths = [];
      carryDead = null;
      world = null;
      newWorld(0);
      return;
    case 'step': {
      if (batchLeft === 0) {
        batchDiv = Math.max(1, pending);
        batchLeft = batchDiv;
      }
      pending--;
      batchLeft--;
      if (!world) throw new Error('no world: init has not run');
      const n = Math.ceil(Math.max(0, msg.n | 0) / batchDiv);
      for (let i = 0; i < n; i++) world.step();
      postFrame(post);
      return;
    }
    case 'inspect':
      inspectId = msg.id ?? null;
      return;
    case 'reset':
      if (world) reset();
      return;
    default:
      return;
  }
}

function newWorld(idBase) {
  world = createWorld({ seed: config.seed, count: config.count, params: config.params, sensor: senseCPU, idBase });
  since = -1;
}

// The same seed again. Ids keep counting up from the old world's (ids never steer the sim), so the main
// thread can drop every old creature by the deaths this carries and never confuse two with one id.
function reset() {
  const last = packFrame(world, null, since);
  // creatures whose birth was never reported were never added on the main side
  const unseen = new Set(last.births.map((b) => b.id));
  const gone = last.deaths.concat(world.creatures.map((c) => c.id)).filter((id) => !unseen.has(id));
  carryDeaths = carryDeaths.concat(gone);
  if (inspectId != null) {
    carryDead = inspectId;
    inspectId = null;
  }
  newWorld(world.lastId);
}

function postFrame(post) {
  const frame = packFrame(world, inspectId, since);
  since = frame.tick;
  if (carryDeaths.length) {
    frame.deaths = carryDeaths.concat(frame.deaths);
    carryDeaths = [];
  }
  if (carryDead != null) {
    frame.dead = carryDead;
    carryDead = null;
  }
  if (frame.dead != null && frame.dead === inspectId) inspectId = null;
  const transfer = [frame.creatures.buffer, frame.food.buffer];
  if (frame.inspect) transfer.push(frame.inspect.values.buffer);
  post(frame, transfer);
}

// In a worker (not when Node tests import this file), every message goes through handle().
if (typeof self !== 'undefined' && typeof self.postMessage === 'function' && typeof window === 'undefined') {
  self.onmessage = (e) => handle(e.data, (m, transfer) => self.postMessage(m, transfer || []));
}
