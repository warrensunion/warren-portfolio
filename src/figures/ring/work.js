// Ported from BTTRURSLF-v2 src/screens/shop/hub/work.js. Same idea: one module worker per job,
// terminated when it answers, and an abort that terminates every running one and rejects its promise
// with { aborted: true } so nobody falls back to the main thread for a figure that has gone.
// Changed: the running set belongs to a pool (createWork) instead of the module, because the page's
// host may destroy one ring instance while another is being built, and an abort must only end its own.

export function createWork() {
  const running = new Set();

  function run(msg, transfer = []) {
    return new Promise((resolve, reject) => {
      let w;
      try {
        w = new Worker(new URL('./hubWorker.js', import.meta.url), { type: 'module' });
      } catch (err) {
        reject(err);
        return;
      }
      const job = { w, reject };
      running.add(job);
      const end = () => {
        running.delete(job);
        w.terminate();
      };
      w.onmessage = (e) => {
        end();
        if (e.data?.error) reject(new Error(e.data.error));
        else resolve(e.data.result);
      };
      w.onerror = (e) => {
        end();
        e.preventDefault?.();
        reject(new Error(e.message || 'ring worker failed'));
      };
      w.postMessage(msg, transfer);
    });
  }

  function abort() {
    for (const job of running) {
      job.w.terminate();
      job.reject(Object.assign(new Error('aborted'), { aborted: true }));
    }
    running.clear();
  }

  return { run, abort, get size() { return running.size; } };
}
