/**
 * System Bootstrap Module
 *
 * Manages the ephemeral system secret and symbia-system org for service-to-service auth.
 * - Generates a random secret on startup (not persisted, not logged)
 * - Auto-creates symbia-system org if it doesn't exist
 * - Provides bootstrap endpoint for other services to fetch credentials
 */

import crypto from "crypto";
import { storage } from "./storage";
import { DEFAULT_ORG_IDS } from "@symbia/seed";

// Ephemeral system secret - regenerated on every Identity restart
// Never logged, never persisted, only held in memory
let SYSTEM_SECRET: string | null = null;

// Well-known org ID for system-level telemetry
export const SYSTEM_ORG_ID = DEFAULT_ORG_IDS.SYMBIA_SYSTEM;
export const SYSTEM_ORG_NAME = "Symbia System";
export const SYSTEM_ORG_SLUG = "symbia-system";

/**
 * Initialize the system bootstrap:
 * 1. Generate ephemeral secret
 * 2. Ensure symbia-system org exists
 */
export async function initSystemBootstrap(): Promise<void> {
  // Generate ephemeral secret (32 bytes = 64 hex chars)
  SYSTEM_SECRET = crypto.randomBytes(32).toString("hex");
  console.log("[identity] System bootstrap secret generated (in-memory only)");

  // Ensure symbia-system org exists
  const existingOrg = await storage.getOrganization(SYSTEM_ORG_ID);
  if (!existingOrg) {
    await storage.createOrganizationWithId({
      id: SYSTEM_ORG_ID,
      name: SYSTEM_ORG_NAME,
      slug: SYSTEM_ORG_SLUG,
    });
    console.log("[identity] Created symbia-system organization");
  } else {
    console.log("[identity] symbia-system organization already exists");
  }
}

/**
 * Get the current system secret
 * Returns null if bootstrap hasn't been initialized
 */
export function getSystemSecret(): string | null {
  return SYSTEM_SECRET;
}

/**
 * Validate a system secret
 */
export function validateSystemSecret(secret: string): boolean {
  if (!SYSTEM_SECRET) return false;
  // Constant-time comparison to prevent timing attacks
  return crypto.timingSafeEqual(
    Buffer.from(secret),
    Buffer.from(SYSTEM_SECRET)
  );
}

/**
 * Get bootstrap config for internal services
 * Only call this from the bootstrap endpoint (which should be network-restricted)
 */
export function getBootstrapConfig(): {
  secret: string;
  orgId: string;
  orgName: string;
  serviceId: string;
} | null {
  if (!SYSTEM_SECRET) return null;

  return {
    secret: SYSTEM_SECRET,
    orgId: SYSTEM_ORG_ID,
    orgName: SYSTEM_ORG_NAME,
    serviceId: "system",
  };
}

/**
 * Add a user to the symbia-system org
 * Used when creating super admins
 */
export async function addUserToSystemOrg(userId: string): Promise<void> {
  // Check if membership already exists
  const memberships = await storage.getMembershipsByUser(userId);
  const alreadyMember = memberships.some(m => m.orgId === SYSTEM_ORG_ID);

  if (!alreadyMember) {
    await storage.createMembership({
      userId,
      orgId: SYSTEM_ORG_ID,
      role: "admin",
    });
    console.log(`[identity] Added user ${userId} to symbia-system org`);
  }
}
