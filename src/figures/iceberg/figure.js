// Placeholder until Task 4 ports the real scene. It throws on purpose so the host's error fallback
// (poster stays, "[fig:iceberg] fallback: error" logged) is exercised from day one.
export async function create() {
  throw new Error('not implemented');
}
