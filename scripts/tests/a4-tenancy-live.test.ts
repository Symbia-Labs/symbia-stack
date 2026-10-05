/**
 * A4 LIVE regression: tenant isolation against a real PostgreSQL.
 *
 * The stubbed suite (`a4-tenancy.test.ts`) proves the middleware logic and the
 * @symbia/db pool wrapper's transaction sequence. It does NOT prove that the RLS
 * *policies* actually filter rows on a real database — that is the gap named in
 * docs/2026-08-13-adversarial-analysis.md and reiterated after the fix landed.
 *
 * This test closes it. It stands up the production RLS policy shape (taken
 * verbatim from each service's server/migrations/0001_rls_policies.sql) on a
 * real table, seeds two orgs, and drives queries through the REAL @symbia/db
 * primitives
 * (runWithRLSContext + attachRLSPoolWrapper + setSessionContext).
 *
 * CRITICAL FIDELITY DETAIL: tenant queries run as a dedicated NON-SUPERUSER role
 * (`a4_app`). PostgreSQL superusers bypass RLS entirely, so a test that queried
 * as the admin/superuser role would pass while proving nothing. Setup/teardown
 * use the admin connection; every isolation assertion uses the app-role pool.
 *
 * Run against your stack's Postgres (published on 5432 by the dev overlay):
 *   DATABASE_URL=postgres://symbia:symbia_dev@localhost:5432/symbia \
 *     npm run test:security:a4-live
 *
 * If DATABASE_URL is unset the test SKIPS (exit 0) rather than failing, so it is
 * safe to include in stackless CI; wire it into a job that has a database.
 */

import { Pool } from "pg";
import {
  runWithRLSContext,
  attachRLSPoolWrapper,
  type RLSContext,
} from "../../symbia-db/dist/index.js";

let pass = 0,
  fail = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    pass++;
    console.log(`PASS ${name}`);
  } else {
    fail++;
    console.log(`FAIL ${name}`, detail !== undefined ? JSON.stringify(detail) : "");
  }
}

const APP_ROLE = "a4_app";
const APP_PW = "a4_app_pw";
const TABLE = "a4_widgets";

const ORG_A = "org-aaaaaaaa";
const ORG_B = "org-bbbbbbbb";

function ctx(partial: Partial<RLSContext>): RLSContext {
  return { orgId: "", userId: "u", ...partial };
}

/** Build an app-role connection config from the admin DATABASE_URL. */
function appConfig(databaseUrl: string) {
  const u = new URL(databaseUrl);
  return {
    host: u.hostname,
    port: u.port ? Number(u.port) : 5432,
    database: u.pathname.replace(/^\//, ""),
    user: APP_ROLE,
    password: APP_PW,
  };
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.log(
      "SKIP a4-tenancy-live: DATABASE_URL not set (needs a real Postgres). " +
        "Run: DATABASE_URL=postgres://symbia:symbia_dev@localhost:5432/symbia npm run test:security:a4-live",
    );
    console.log("\nA4-LIVE: skipped");
    process.exit(0);
  }

  const admin = new Pool({ connectionString: databaseUrl });
  let app: Pool | undefined;

  try {
    // ---- setup (as admin/owner) -------------------------------------------
    await admin.query(`DROP TABLE IF EXISTS ${TABLE}`);
    // Recreate the app role cleanly. REVOKE/DROP guarded for reruns.
    await admin.query(`DROP OWNED BY ${APP_ROLE}`).catch(() => {});
    await admin.query(`DROP ROLE IF EXISTS ${APP_ROLE}`).catch(() => {});
    await admin.query(
      `CREATE ROLE ${APP_ROLE} LOGIN PASSWORD '${APP_PW}' NOSUPERUSER NOBYPASSRLS`,
    );

    await admin.query(`
      CREATE TABLE ${TABLE} (
        id     bigserial PRIMARY KEY,
        org_id text NOT NULL,
        label  text NOT NULL
      )
    `);

    // Production policy shape, verbatim from 0001_rls_policies.sql.
    await admin.query(`ALTER TABLE ${TABLE} ENABLE ROW LEVEL SECURITY`);
    await admin.query(`ALTER TABLE ${TABLE} FORCE ROW LEVEL SECURITY`);
    await admin.query(`
      CREATE POLICY ${TABLE}_org_isolation ON ${TABLE}
        FOR ALL
        USING (
          current_setting('symbia.can_bypass_org', true) = 'true'
          OR org_id = current_setting('symbia.org_id', true)
        )
    `);

    await admin.query(`GRANT USAGE ON SCHEMA public TO ${APP_ROLE}`);
    await admin.query(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON ${TABLE} TO ${APP_ROLE}`,
    );

    // Seed as admin (superuser bypasses RLS, so both orgs' rows land).
    await admin.query(
      `INSERT INTO ${TABLE} (org_id, label) VALUES ($1,'a-1'),($1,'a-2'),($2,'b-1'),($2,'b-2'),($2,'b-3')`,
      [ORG_A, ORG_B],
    );

    // ---- app-role pool, wrapped exactly as the services wrap theirs --------
    app = new Pool(appConfig(databaseUrl));
    attachRLSPoolWrapper(app);

    // Sanity: the app role is genuinely not a superuser and not bypassing RLS.
    const who = await app.query(
      "SELECT current_user, current_setting('is_superuser') AS su",
    );
    check(
      "tenant queries run as non-superuser app role",
      who.rows[0].current_user === APP_ROLE && who.rows[0].su === "off",
      who.rows[0],
    );

    // A — org-a context sees ONLY org-a rows (headline isolation).
    await runWithRLSContext(ctx({ orgId: ORG_A, userId: "user-a" }), async () => {
      const r = await app!.query(`SELECT org_id FROM ${TABLE}`);
      const orgs = new Set(r.rows.map((x) => x.org_id));
      check(
        "org-A context sees only org-A rows",
        r.rows.length === 2 && orgs.size === 1 && orgs.has(ORG_A),
        { count: r.rows.length, orgs: [...orgs] },
      );
    });

    // B — symmetry: org-b context sees only org-b rows.
    await runWithRLSContext(ctx({ orgId: ORG_B, userId: "user-b" }), async () => {
      const r = await app!.query(`SELECT org_id FROM ${TABLE}`);
      const orgs = new Set(r.rows.map((x) => x.org_id));
      check(
        "org-B context sees only org-B rows",
        r.rows.length === 3 && orgs.size === 1 && orgs.has(ORG_B),
        { count: r.rows.length, orgs: [...orgs] },
      );
    });

    // C — the spoof, at the DB layer: authenticated as org-A, explicitly ask
    // for org-B's data. RLS AND-s with the query predicate → empty result set.
    await runWithRLSContext(ctx({ orgId: ORG_A, userId: "user-a" }), async () => {
      const r = await app!.query(
        `SELECT * FROM ${TABLE} WHERE org_id = $1`,
        [ORG_B],
      );
      check(
        "org-A context requesting org-B data returns empty set",
        r.rows.length === 0,
        { count: r.rows.length },
      );
    });

    // D — fail-closed: no context in scope → wrapper passes through with no
    // session vars set → policy matches nothing → ZERO rows, not all rows.
    {
      const r = await app.query(`SELECT * FROM ${TABLE}`);
      check(
        "no RLS context → zero rows (fail-closed, not fail-open)",
        r.rows.length === 0,
        { count: r.rows.length },
      );
    }

    // E — legitimate cross-org: super-admin (can_bypass_org) sees everything.
    await runWithRLSContext(
      ctx({ orgId: ORG_A, userId: "admin", isSuperAdmin: true }),
      async () => {
        const r = await app!.query(`SELECT org_id FROM ${TABLE}`);
        const orgs = new Set(r.rows.map((x) => x.org_id));
        check(
          "super-admin bypass sees all orgs",
          r.rows.length === 5 && orgs.size === 2,
          { count: r.rows.length, orgs: [...orgs] },
        );
      },
    );

    // F — capability-based bypass path (cap:global.read) also crosses orgs.
    await runWithRLSContext(
      ctx({ orgId: ORG_A, userId: "svc", capabilities: ["cap:global.read"] }),
      async () => {
        const r = await app!.query(`SELECT org_id FROM ${TABLE}`);
        check("global-read capability bypass sees all orgs", r.rows.length === 5, {
          count: r.rows.length,
        });
      },
    );

    // G — write isolation: org-A cannot INSERT a row tagged org-B (WITH CHECK
    // via FOR ALL policy). Should be denied by RLS, not silently accepted.
    await runWithRLSContext(ctx({ orgId: ORG_A, userId: "user-a" }), async () => {
      let denied = false;
      try {
        await app!.query(`INSERT INTO ${TABLE} (org_id, label) VALUES ($1,'x')`, [
          ORG_B,
        ]);
      } catch {
        denied = true;
      }
      check("org-A cannot write a row tagged org-B", denied);
    });
  } finally {
    // ---- teardown ----------------------------------------------------------
    if (app) await app.end().catch(() => {});
    await admin.query(`DROP TABLE IF EXISTS ${TABLE}`).catch(() => {});
    await admin.query(`DROP OWNED BY ${APP_ROLE}`).catch(() => {});
    await admin.query(`DROP ROLE IF EXISTS ${APP_ROLE}`).catch(() => {});
    await admin.end().catch(() => {});
  }

  console.log(`\nA4-LIVE: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("A4-LIVE crashed:", e);
  process.exit(1);
});
