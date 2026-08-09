/**
 * Stable per-participant colour.
 *
 * A group conversation mixes humans, assistants and machines; the eye tracks
 * who-said-what by colour long before it reads the name. The colour must be
 * STABLE for a given participant across renders and reloads — derived from the
 * participant's id, never from array order (which shifts as people join) or a
 * random seed (which changes every mount). Same id in, same colour out.
 */

// Chosen to read on the dark chat surface and to stay distinguishable from each
// other. Own-message blue (#5eabe1) is deliberately included so the local user
// is just another participant, not a special case.
const PALETTE = [
  '#5eabe1', // blue
  '#f59e0b', // amber
  '#22c55e', // green
  '#ec4899', // pink
  '#a855f7', // violet
  '#14b8a6', // teal
  '#f97316', // orange
  '#eab308', // yellow
  '#06b6d4', // cyan
  '#f43f5e', // rose
];

/** Deterministic id → colour. FNV-ish hash so small id differences spread. */
export function participantColor(id: string): string {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return PALETTE[Math.abs(hash) % PALETTE.length];
}
