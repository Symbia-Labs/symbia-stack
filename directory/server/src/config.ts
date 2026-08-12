/**
 * Configuration for the Directory Service.
 */

export const config = {
  host: process.env.HOST || '0.0.0.0',
  nodeEnv: process.env.NODE_ENV || 'development',

  corsOrigins: (process.env.CORS_ORIGINS || '').split(',').filter(Boolean),

  /**
   * The one admission credential (design §6, phase 1). A peer or foreign node
   * presents it as `x-symbia-join-secret`; the directory checks it here and
   * nowhere else. This is where the network's open `node:register` stops.
   *
   * If unset, admission is OPEN — acceptable inside a trusted boundary (dev,
   * single VPC) and matching the platform's current within-network posture,
   * but the service says so loudly at boot so an open door is never silent.
   */
  joinSecret: process.env.DIRECTORY_JOIN_SECRET || '',

  /**
   * Event classes this installation offers to receive from peers, stated on
   * GET /api/offer. Empty would mean "offers nothing" — the default is the
   * one boring class the first seam crossing uses (topology mirroring), per
   * docs/2026-08-12-federation-predictions.md ruling 4.
   */
  offerAccepts: (process.env.DIRECTORY_OFFER_ACCEPTS || 'network.topology')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  /** How often expired foreign-node registrations are swept. */
  evictIntervalMs: parseInt(process.env.DIRECTORY_EVICT_INTERVAL_MS || '15000', 10),

  /** Default TTL applied when a foreign registration omits one. */
  defaultForeignTtlSeconds: parseInt(process.env.DIRECTORY_FOREIGN_TTL_SECONDS || '60', 10),
} as const;

export type Config = typeof config;
