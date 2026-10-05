/**
 * A4 regression: tenant isolation (docs/2026-08-13-adversarial-analysis.md).
 * Run from repo root: `npm run test:security:a4`.
 *
 * Covers: cross-org X-Org-Id → 403 (the headline case), member org allowed
 * with RLS context in AsyncLocalStorage scope during the request, token-org
 * fallback, super-admin cross-org, and the @symbia/db pool wrapper sequence
 * (BEGIN → SET LOCAL → query → COMMIT → release, ROLLBACK on error).
 *
 * Identity introspection is stubbed via global fetch; no running stack needed.
 */
let pass = 0, fail = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) { pass++; console.log(`PASS ${name}`); }
  else { fail++; console.log(`FAIL ${name}`, JSON.stringify(detail) ?? ''); }
}

function fakeRes() {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    headersSent: false,
    status(c: number) { res.statusCode = c; return res; },
    json(b: unknown) { res.body = b; res.headersSent = true; return res; },
  };
  return res;
}

function stubIntrospection(payload: Record<string, unknown>) {
  (globalThis as { fetch: unknown }).fetch = async () => ({ ok: true, json: async () => payload });
}

async function testMembership() {
  stubIntrospection({ active: true, sub: 'user-1', type: 'user', isSuperAdmin: false, organizations: [{ id: 'org-a' }], entitlements: [] });
  const { requireAuth } = await import('../../assistants/server/src/middleware/auth.js');
  const { getCurrentRLSContext } = await import('../../symbia-db/dist/index.js');

  // 1. Cross-org header → 403, next() never called
  {
    const res = fakeRes();
    let nexted = false;
    const req = { headers: { authorization: 'Bearer t', 'x-org-id': 'org-b' } };
    await requireAuth(req as never, res as never, () => { nexted = true; });
    check('cross-org X-Org-Id rejected with 403', res.statusCode === 403 && !nexted, { code: res.statusCode, body: res.body });
  }

  // 2. Member org header → allowed, RLS context in scope during next()
  {
    const res = fakeRes();
    let ctxInNext: { orgId?: string; userId?: string } | undefined;
    const req: { headers: Record<string, string>; orgId?: string } = { headers: { authorization: 'Bearer t', 'x-org-id': 'org-a' } };
    await requireAuth(req as never, res as never, () => { ctxInNext = getCurrentRLSContext(); });
    check('member org allowed', req.orgId === 'org-a', { orgId: req.orgId, code: res.statusCode });
    check('RLS context in ALS scope during request', ctxInNext?.orgId === 'org-a' && ctxInNext?.userId === 'user-1', ctxInNext);
  }

  // 3. No header → first membership org
  {
    const res = fakeRes();
    const req: { headers: Record<string, string>; orgId?: string } = { headers: { authorization: 'Bearer t' } };
    await requireAuth(req as never, res as never, () => {});
    check('no header falls back to token org', req.orgId === 'org-a', { orgId: req.orgId });
  }

  // 4. Super admin may cross orgs
  stubIntrospection({ active: true, sub: 'admin-1', type: 'user', isSuperAdmin: true, organizations: [{ id: 'org-a' }], entitlements: [] });
  {
    const res = fakeRes();
    const req: { headers: Record<string, string>; orgId?: string } = { headers: { authorization: 'Bearer t', 'x-org-id': 'org-z' } };
    await requireAuth(req as never, res as never, () => {});
    check('super admin may select any org', req.orgId === 'org-z', { orgId: req.orgId, code: res.statusCode });
  }
}

async function testPoolWrapper() {
  const { attachRLSPoolWrapper, runWithRLSContext } = await import('../../symbia-db/dist/index.js');

  const log: string[] = [];
  const clientQueryOk = async (...args: unknown[]) => {
    const a = args[0] as string | { text?: string };
    const text = typeof a === 'string' ? a : a?.text ?? '?';
    log.push(text.replace(/\s+/g, ' ').trim().slice(0, 40));
    return { rows: [], rowCount: 0 };
  };
  const client = { query: clientQueryOk, release: () => { log.push('RELEASE'); } };
  const pool = {
    query: async () => { log.push('POOL_DIRECT'); return { rows: [] }; },
    connect: async () => client,
  };

  attachRLSPoolWrapper(pool as never);

  await (pool.query as (...a: unknown[]) => Promise<unknown>)('SELECT 1');
  check('no context → direct pool query', log.join('|') === 'POOL_DIRECT', log);

  log.length = 0;
  await runWithRLSContext({ orgId: 'org-a', userId: 'u1' }, async () => {
    await (pool.query as (...a: unknown[]) => Promise<unknown>)('SELECT * FROM t');
  });
  check('context → BEGIN, SET LOCAL, query, COMMIT, release',
    /^BEGIN\|SELECT set_config.*\|SELECT \* FROM t\|COMMIT\|RELEASE$/.test(log.join('|')), log.join('|'));

  log.length = 0;
  client.query = (async (...args: unknown[]) => {
    const a = args[0] as string | { text?: string };
    const t = (typeof a === 'string' ? a : a?.text ?? '?').replace(/\s+/g, ' ').trim().slice(0, 40);
    log.push(t);
    if (t.startsWith('SELECT * FROM boom')) throw new Error('boom');
    return { rows: [] };
  }) as typeof clientQueryOk;
  let threw = false;
  await runWithRLSContext({ orgId: 'org-a', userId: 'u1' }, async () => {
    try { await (pool.query as (...a: unknown[]) => Promise<unknown>)('SELECT * FROM boom'); } catch { threw = true; }
  });
  check('error → ROLLBACK and release', threw && log.includes('ROLLBACK') && log.includes('RELEASE'), log);
}

async function main() {
  await testMembership();
  await testPoolWrapper();
  console.log(`\nA4: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}
main();
