// Placeholder until Task 6 ports the real scene. It throws on purpose so the host's error fallback
// (poster stays, "[fig:iceblock] fallback: error" logged) is exercised from day one.
export async function create() {
  throw new Error('not implemented');
}
