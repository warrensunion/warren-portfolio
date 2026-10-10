// Placeholder until Task 7 ports the real scene. It throws on purpose so the host's error fallback
// (poster stays, "[fig:ring] fallback: error" logged) is exercised from day one.
export async function create() {
  throw new Error('not implemented');
}
