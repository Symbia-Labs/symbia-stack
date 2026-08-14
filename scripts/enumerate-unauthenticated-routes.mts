/**
 * Enumerate route surfaces reachable without credentials.
 *
 * Why this is a prober and not a list: STATUS.md and SECURITY.md have carried
 * "several route surfaces remain reachable without authentication in dev" since
 * 13 Aug with no enumeration behind it. The absence of the list was the defect.
 * But a hand-written list decays the moment a route moves, and a grep-based one
 * is the exact instrument this project already deleted — `tests/` (16 files,
 * 303 failures, zero defects) tested a February architecture by looking for
 * strings, and penalised the codebase for removing duplication it could not
 * see. Middleware-guarded routers are invisible to grep by construction; CI
 * commit `a34add9` fixed that same blind spot in validate-openapi-routes.
 *
 * So: ask the running stack. Every read operation in every committed OpenAPI
 * spec is requested with NO Authorization header. What comes back is the
 * measurement.
 *
 *   401 / 403  → guarded. The auth middleware ran and refused.
 *   2xx        → UNAUTHENTICATED. Anyone who can reach the port gets this.
 *   404 / 405  → not routed here (spec drift, or a path param we cannot fill).
 *   5xx        → errored before deciding; reported separately, never as a pass.
 *
 * Blank beats green: a service that does not answer is reported `unreachable`,
 * never counted as clean. Absence of evidence is not evidence of a guard.
 *
 * Usage:
 *   node --experimental-strip-types scripts/enumerate-unauthenticated-routes.mts
 *   npm run audit:unauth                      # same thing
 *   ... --json > docs/<date>-unauth-routes.json
 *
 * Reads only. Write operations (POST/PUT/PATCH/DELETE) are deliberately NOT
 * probed: the only way to learn whether an unauthenticated write is refused is
 * to attempt it, and if it is not refused the probe is the breach. That is a
 * real coverage gap in this instrument and it is stated here rather than
 * papered over — closing it needs a disposable stack, not a cleverer request.
 */

import { readFileSync, existsSync } from "node:fs";
// From @symbia/sys, never a literal port map: the MCP server carried its own
// copy of every port and `network: 5054` outlived the move to 5009 in exactly
// that way — confidently wrong rather than obviously broken.
import { ServicePorts, RunningServices, type ServiceId } from "@symbia/sys";

const HOST = process.env.SYMBIA_HOST ?? "localhost";
const JSON_OUT = process.argv.includes("--json");
const TIMEOUT_MS = 5000;

/** A path param we can fill with something syntactically valid but absent. */
const SENTINEL = "00000000-0000-4000-8000-000000000000";

type Verdict = "UNAUTHENTICATED" | "guarded" | "absent" | "error" | "unreachable";

interface Probe {
  service: ServiceId;
  path: string;
  method: string;
  status: number | null;
  verdict: Verdict;
  note?: string;
}

function specFor(service: ServiceId): Record<string, unknown> | null {
  const p = `${service}/docs/openapi.json`;
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function classify(status: number): Verdict {
  if (status === 401 || status === 403) return "guarded";
  if (status === 404 || status === 405) return "absent";
  if (status >= 500) return "error";
  if (status >= 200 && status < 400) return "UNAUTHENTICATED";
  // 400/422 etc: the handler ran and rejected the *shape*, not the caller.
  // It was reached without credentials, so it counts.
  return "UNAUTHENTICATED";
}

async function probe(service: ServiceId, port: number, rawPath: string): Promise<Probe> {
  const path = rawPath.replace(/\{[^}]+\}/g, SENTINEL);
  const url = `http://${HOST}:${port}${path}`;
  try {
    const r = await fetch(url, {
      method: "GET",
      // No Authorization, no cookie. That is the whole experiment.
      headers: { Accept: "application/json" },
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return {
      service,
      path: rawPath,
      method: "GET",
      status: r.status,
      verdict: classify(r.status),
      note: rawPath !== path ? "path param filled with sentinel" : undefined,
    };
  } catch (e) {
    return {
      service,
      path: rawPath,
      method: "GET",
      status: null,
      verdict: "unreachable",
      note: e instanceof Error ? e.message.slice(0, 100) : String(e),
    };
  }
}

async function main() {
  const probes: Probe[] = [];
  const noSpec: ServiceId[] = [];

  for (const service of RunningServices) {
    const spec = specFor(service);
    if (!spec) {
      noSpec.push(service);
      continue;
    }
    const port = ServicePorts[service];
    const paths = (spec.paths ?? {}) as Record<string, Record<string, unknown>>;
    const reads: string[] = [];
    for (const [p, ops] of Object.entries(paths)) {
      if (ops && typeof ops === "object" && "get" in ops) reads.push(p);
    }
    // Serial per service: a burst of 90 requests measures the rate limiter,
    // not the auth middleware.
    for (const p of reads) probes.push(await probe(service, port, p));
  }

  const unauth = probes.filter((p) => p.verdict === "UNAUTHENTICATED");
  const byService = new Map<string, Probe[]>();
  for (const p of unauth) {
    const list = byService.get(p.service) ?? [];
    list.push(p);
    byService.set(p.service, list);
  }

  if (JSON_OUT) {
    console.log(JSON.stringify({ probes, generated: new Date().toISOString() }, null, 2));
    return;
  }

  console.log(`Probed ${probes.length} read operations with no credentials.\n`);

  for (const [service, list] of [...byService].sort()) {
    console.log(`### ${service} — ${list.length} reachable unauthenticated`);
    for (const p of list) console.log(`  ${String(p.status).padEnd(4)} ${p.path}`);
    console.log();
  }

  const counts: Record<Verdict, number> = {
    UNAUTHENTICATED: 0, guarded: 0, absent: 0, error: 0, unreachable: 0,
  };
  for (const p of probes) counts[p.verdict]++;

  console.log("Totals:");
  console.log(`  UNAUTHENTICATED  ${counts.UNAUTHENTICATED}`);
  console.log(`  guarded (401/403) ${counts.guarded}`);
  console.log(`  absent (404/405)  ${counts.absent}`);
  console.log(`  error (5xx)       ${counts.error}`);
  console.log(`  unreachable       ${counts.unreachable}`);

  if (noSpec.length) {
    console.log(`\nNo committed OpenAPI spec, NOT PROBED: ${noSpec.join(", ")}`);
    console.log("  These are unmeasured, not clean.");
  }
  if (counts.unreachable > 0) {
    console.log(`\n${counts.unreachable} probes did not connect. The stack may be down;`);
    console.log("  those routes are unmeasured, not clean.");
  }
  console.log("\nWrite operations were not probed. See the header for why.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
