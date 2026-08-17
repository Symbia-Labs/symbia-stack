/**
 * Messaging RLS LIVE regression (R1, docs/2026-08-13-adversarial-analysis-round-2.md).
 *
 * Round 2 found that messaging — the service holding private conversations and
 * message bodies — shipped RLS policies but never activated them: it owns its
 * own pool (never wrapped), used the shared @symbia/auth (which had no RLS
 * awareness), and never applied its migration. The fix wires an RLS scope at the
 * @symbia/auth root and wraps messaging's pool.
 *
 * This proves the messaging policies actually isolate rows on a real PostgreSQL,
 * driven through the REAL @symbia/db primitives (runWithRLSContext +
 * attachRLSPoolWrapper). Policy shape is taken from
 * messaging/server/migrations/0001_rls_policies.sql.
 *
 * Fidelity: tenant queries run as a NON-SUPERUSER role — superusers bypass RLS,
 * so a test querying as the admin role would prove nothing. Setup/teardown use
 * the admin connection; every isolation assertion uses the app-role pool.
 *
 * Run against your stack's Postgres:
 *   DATABASE_URL=postgres://symbia:symbia_dev@localhost:5432/symbia \
 *     npm run test:security:messaging-rls-live
 *
 * Skips (exit 0) when DATABASE_URL is unset, so it is safe in stackless CI.
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

const APP_ROLE = "msg_rls_app";
const APP_PW = "msg_rls_app_pw";
const ORG_A = "org-msg-aaaa";
const ORG_B = "org-msg-bbbb";

function ctx(partial: Partial<RLSContext>): RLSContext {
  return { orgId: "", userId: "u", ...partial };
}

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
      "SKIP messaging-rls-live: DATABASE_URL not set (needs a real Postgres).",
    );
    console.log("\nMESSAGING-RLS-LIVE: skipped");
    process.exit(0);
  }

  const admin = new Pool({ connectionString: databaseUrl });
  let app: Pool | undefined;

  try {
    // ---- setup (as admin/owner) -------------------------------------------
    await admin.query(`DROP TABLE IF EXISTS msg_messages`);
    await admin.query(`DROP TABLE IF EXISTS msg_conversations`);
    await admin.query(`DROP OWNED BY ${APP_ROLE}`).catch(() => {});
    await admin.query(`DROP ROLE IF EXISTS ${APP_ROLE}`).catch(() => {});
    await admin.query(
      `CREATE ROLE ${APP_ROLE} LOGIN PASSWORD '${APP_PW}' NOSUPERUSER NOBYPASSRLS`,
    );

    // Two org-scoped tables shaped like messaging's conversations + messages.
    await admin.query(`
      CREATE TABLE msg_conversations (
        id bigserial PRIMARY KEY, org_id text NOT NULL, name text NOT NULL
      )`);
    await admin.query(`
      CREATE TABLE msg_messages (
        id bigserial PRIMARY KEY, org_id text NOT NULL, body text NOT NULL
      )`);

    // Production policy shape, verbatim from messaging 0001_rls_policies.sql.
    for (const t of ["msg_conversations", "msg_messages"]) {
      await admin.query(`ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY`);
      await admin.query(`ALTER TABLE ${t} FORCE ROW LEVEL SECURITY`);
      await admin.query(`
        CREATE POLICY ${t}_org_isolation ON ${t}
          FOR ALL
          USING (
            current_setting('symbia.can_bypass_org', true) = 'true'
            OR org_id = current_setting('symbia.org_id', true)
          )`);
      await admin.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ${t} TO ${APP_ROLE}`);
    }
    await admin.query(`GRANT USAGE ON SCHEMA public TO ${APP_ROLE}`);

    // Seed as admin (superuser bypasses RLS, so both orgs' rows land).
    await admin.query(
      `INSERT INTO msg_conversations (org_id, name) VALUES ($1,'a-conv'),($2,'b-conv-1'),($2,'b-conv-2')`,
      [ORG_A, ORG_B],
    );
    await admin.query(
      `INSERT INTO msg_messages (org_id, body) VALUES ($1,'a-secret'),($2,'b-secret-1'),($2,'b-secret-2')`,
      [ORG_A, ORG_B],
    );

    // ---- app-role pool, wrapped exactly as messaging now wraps its pool ----
    app = new Pool(appConfig(databaseUrl));
    attachRLSPoolWrapper(app);

    const who = await app.query(
      "SELECT current_user, current_setting('is_superuser') AS su",
    );
    check(
      "tenant queries run as non-superuser app role",
      who.rows[0].current_user === APP_ROLE && who.rows[0].su === "off",
      who.rows[0],
    );

    // org-A sees only org-A conversations
    await runWithRLSContext(ctx({ orgId: ORG_A, userId: "user-a" }), async () => {
      const r = await app!.query(`SELECT org_id FROM msg_conversations`);
      const orgs = new Set(r.rows.map((x) => x.org_id));
      check(
        "org-A sees only its conversations",
        r.rows.length === 1 && orgs.size === 1 && orgs.has(ORG_A),
        { count: r.rows.length, orgs: [...orgs] },
      );
    });

    // org-B sees only org-B messages
    await runWithRLSContext(ctx({ orgId: ORG_B, userId: "user-b" }), async () => {
      const r = await app!.query(`SELECT org_id FROM msg_messages`);
      const orgs = new Set(r.rows.map((x) => x.org_id));
      check(
        "org-B sees only its messages",
        r.rows.length === 2 && orgs.size === 1 && orgs.has(ORG_B),
        { count: r.rows.length, orgs: [...orgs] },
      );
    });

    // the spoof: authed as org-A, ask for org-B message bodies → empty
    await runWithRLSContext(ctx({ orgId: ORG_A, userId: "user-a" }), async () => {
      const r = await app!.query(
        `SELECT body FROM msg_messages WHERE org_id = $1`,
        [ORG_B],
      );
      check("org-A cannot read org-B message bodies", r.rows.length === 0, {
        count: r.rows.length,
      });
    });

    // fail-closed: no context → zero rows, not all rows
    {
      const r = await app.query(`SELECT * FROM msg_messages`);
      check("no RLS context → zero messages (fail-closed)", r.rows.length === 0, {
        count: r.rows.length,
      });
    }

    // super-admin bypass sees every org's messages
    await runWithRLSContext(
      ctx({ orgId: ORG_A, userId: "admin", isSuperAdmin: true }),
      async () => {
        const r = await app!.query(`SELECT org_id FROM msg_messages`);
        check("super-admin sees all orgs' messages", r.rows.length === 3, {
          count: r.rows.length,
        });
      },
    );

    // write isolation: org-A cannot insert a message tagged org-B
    await runWithRLSContext(ctx({ orgId: ORG_A, userId: "user-a" }), async () => {
      let denied = false;
      try {
        await app!.query(`INSERT INTO msg_messages (org_id, body) VALUES ($1,'x')`, [
          ORG_B,
        ]);
      } catch {
        denied = true;
      }
      check("org-A cannot write a message tagged org-B", denied);
    });
  } finally {
    if (app) await app.end().catch(() => {});
    await admin.query(`DROP TABLE IF EXISTS msg_messages`).catch(() => {});
    await admin.query(`DROP TABLE IF EXISTS msg_conversations`).catch(() => {});
    await admin.query(`DROP OWNED BY ${APP_ROLE}`).catch(() => {});
    await admin.query(`DROP ROLE IF EXISTS ${APP_ROLE}`).catch(() => {});
    await admin.end().catch(() => {});
  }

  console.log(`\nMESSAGING-RLS-LIVE: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("MESSAGING-RLS-LIVE crashed:", e);
  process.exit(1);
});
