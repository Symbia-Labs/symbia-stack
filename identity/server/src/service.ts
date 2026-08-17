/**
 * The identity service as a value: routes plus the bootstrap that makes a
 * fresh database usable.
 *
 * Why this file exists — measured 15 Aug 2026. The imagine sidecar mounted
 * identity's routes and every registration failed with a foreign-key error
 * on memberships: `addUserToSystemOrg` writes a membership into the system
 * org, and the system org is created by `initSystemBootstrap()`, which only
 * ever ran from index.ts. The routes were reachable; the thing that makes
 * them work was not.
 *
 * It cannot be fixed by importing the bootstrap separately, either: each
 * esbuild bundle carries its own module graph, so a second bundle would
 * hold a SECOND pg-mem database and seed a store nobody reads. Whatever a
 * host needs must ship in ONE entry with the routes.
 *
 * This is `createService()` in miniature — see
 * docs/proposals/service-composition.md, stage S2.
 */
import bcrypt from "bcryptjs";
import { db } from "./db.js";
import * as schema from "@shared/schema";
import { DEFAULT_USER_IDS, DEFAULT_ORG_IDS } from "@symbia/seed";
import { initSystemBootstrap } from "./system-bootstrap.js";

export { registerRoutes } from "./routes.js";

/**
 * Make a fresh identity database usable: the system org first (memberships
 * reference it), then the default admin with its org and membership.
 *
 * Idempotent by construction — every insert is onConflictDoNothing — so a
 * host may call it on every boot. Disable the admin with
 * IDENTITY_SEED_DEFAULT_ADMIN=false; the system org is not optional.
 */
export async function bootstrap(): Promise<void> {
  await initSystemBootstrap();

    // Default admin, so first run has a working login regardless of backend.
    // STOPGAP — real first-run org/user creation is a separate, later concern.
    //
    // Deliberately NOT seedIdentityData: that seeds the whole cohort all-or-
    // nothing, and against a users table that already holds rows but not the
    // defaults it skips user creation yet still attaches entitlements to the
    // absent super admin — a foreign-key violation (observed 9 Aug against a
    // DB with real users). This ensures ONLY dev@example.com plus its own org,
    // idempotently, and coexists with existing users.
    //
    // The org + membership are load-bearing, not optional: a bare user with no
    // membership has NO org context, and every org-scoped call refuses with
    // "Organization context required. Provide X-Org-Id" — observed 9 Aug when
    // the spyglass vision call through the integrations gateway refused because
    // the admin belonged to no org. Each insert is onConflictDoNothing, so this
    // is safe on every boot and repairs an existing org-less admin.
    // Disable with IDENTITY_SEED_DEFAULT_ADMIN=false.
    if (process.env.IDENTITY_SEED_DEFAULT_ADMIN !== "false") {
      try {
        await db
          .insert(schema.users)
          .values({
            id: DEFAULT_USER_IDS.SUPER_ADMIN,
            email: "dev@example.com",
            passwordHash: bcrypt.hashSync("password123", 10),
            name: "Dev Admin",
            isSuperAdmin: true,
          })
          .onConflictDoNothing();

        await db
          .insert(schema.organizations)
          .values({
            id: DEFAULT_ORG_IDS.SYMBIA_LABS,
            name: "Symbia Labs",
            slug: "symbia-labs",
          })
          .onConflictDoNothing();

        await db
          .insert(schema.memberships)
          .values({
            userId: DEFAULT_USER_IDS.SUPER_ADMIN,
            orgId: DEFAULT_ORG_IDS.SYMBIA_LABS,
            role: "admin",
          })
          .onConflictDoNothing();

        console.log("✓ Default admin ensured (dev@example.com / password123) in org symbia-labs");
      } catch (error) {
        console.error("Failed to ensure default admin:", error);
      }
    }

}
