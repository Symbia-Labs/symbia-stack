/**
 * Seed guard (R5, docs/2026-08-13-seed-guard-predictions.md).
 *
 * `npm run seed` deletes ALL catalog resources and reloads the snapshot, which
 * silently reverts gated catalog writes made since the snapshot — STATUS.md
 * §6.1's most dangerous entry. These pure helpers make that destruction opt-in.
 * Kept database-free so they can be unit-tested without a running catalog.
 */

/** True when destruction is explicitly requested via `--force` or SEED_FORCE=true. */
export function seedForced(
  argv: readonly string[] = process.argv,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return argv.includes("--force") || env.SEED_FORCE === "true";
}

export interface SeedDecision {
  proceed: boolean;
  reason: string;
}

/**
 * Decide whether a destructive seed may run. Proceeds on an empty catalog or when
 * forced; otherwise refuses so a routine `npm run seed` cannot wipe live data.
 */
export function seedDecision(existingCount: number, forced: boolean): SeedDecision {
  if (existingCount === 0) return { proceed: true, reason: "catalog is empty; nothing to destroy" };
  if (forced) return { proceed: true, reason: `forced: overwriting ${existingCount} existing resources` };
  return {
    proceed: false,
    reason:
      `refusing to seed: ${existingCount} existing resources would be deleted and ` +
      `replaced by the snapshot, reverting any gated catalog writes since it was taken. ` +
      `Re-run with \`npm run seed -- --force\` (or SEED_FORCE=true) to overwrite.`,
  };
}
