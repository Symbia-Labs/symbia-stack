/**
 * App `requires` enforcement.
 *
 * An app manifest that lists what the platform must provide, and is never
 * checked against what the platform actually provides, is a claim with no
 * mechanism — the defect this project keeps recording. This is the mechanism.
 *
 * The worked example is real. On 6 Aug 2026 the `keyField` default on
 * `symbia.state.*` changed from "point" to "key". The energy pipeline had
 * silently depended on the old default, and began deriving `null` instead of a
 * PUE — no error, just a wrong answer. Declaring `symbia.state.join@^1.2.0`
 * and checking it at registration turns that class of failure into a refusal
 * at the boundary, where it is visible, instead of a silent wrong answer at
 * runtime, where it is not.
 *
 * Checked here rather than in the registration script on purpose: a gate that
 * lives in a helper can be skipped by not using the helper.
 */
import { ServiceId } from "@symbia/sys";
import { storage } from "./storage";
import type { AppManifest, ComponentManifest } from "@shared/schema";

/** Platform version this stack reports. */
export const PLATFORM_VERSION = process.env.SYMBIA_PLATFORM_VERSION || "1.1.1";

type Version = [number, number, number];

function parseVersion(v: string): Version | null {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(v.trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

function compare(a: Version, b: Version): number {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  }
  return 0;
}

/**
 * Minimal range check: `*`, exact, `>=x.y.z`, `>x.y.z`, `^x.y.z`, `~x.y.z`.
 *
 * Deliberately small rather than pulling in a semver dependency for six
 * operators. Anything it cannot parse is reported as unsupported instead of
 * being quietly treated as satisfied — an unparseable range that passes is the
 * same failure as no check at all.
 */
export function satisfies(version: string, range: string): { ok: boolean; reason?: string } {
  const v = parseVersion(version);
  if (!v) return { ok: false, reason: `unparseable version "${version}"` };

  const r = range.trim();
  if (r === "*" || r === "") return { ok: true };

  const op = /^(>=|<=|>|<|\^|~|=)?\s*(.+)$/.exec(r);
  if (!op) return { ok: false, reason: `unparseable range "${range}"` };
  const target = parseVersion(op[2]);
  if (!target) return { ok: false, reason: `unparseable range "${range}"` };

  const cmp = compare(v, target);
  switch (op[1]) {
    case ">=": return { ok: cmp >= 0 };
    case ">":  return { ok: cmp > 0 };
    case "<=": return { ok: cmp <= 0 };
    case "<":  return { ok: cmp < 0 };
    case "^":
      // Compatible within the same leading non-zero segment.
      if (target[0] > 0) return { ok: v[0] === target[0] && cmp >= 0 };
      if (target[1] > 0) return { ok: v[0] === 0 && v[1] === target[1] && cmp >= 0 };
      return { ok: cmp === 0 };
    case "~":
      return { ok: v[0] === target[0] && v[1] === target[1] && cmp >= 0 };
    case "=":
    case undefined:
      return { ok: cmp === 0 };
    default:
      return { ok: false, reason: `unsupported range operator in "${range}"` };
  }
}

export interface RequirementFailure {
  kind: "platform" | "component" | "service";
  requirement: string;
  reason: string;
}

/**
 * Check an app's requirements against what this stack actually provides.
 * Returns every failure rather than the first, so an author fixes one manifest
 * instead of discovering problems one registration at a time.
 */
export async function checkAppRequires(manifest: AppManifest): Promise<RequirementFailure[]> {
  const failures: RequirementFailure[] = [];
  const requires = manifest.requires;
  if (!requires) return failures;

  if (requires.platform) {
    const result = satisfies(PLATFORM_VERSION, requires.platform);
    if (!result.ok) {
      failures.push({
        kind: "platform",
        requirement: requires.platform,
        reason: result.reason ?? `platform is ${PLATFORM_VERSION}, which does not satisfy ${requires.platform}`,
      });
    }
  }

  const requiredComponents = requires.components ?? [];
  if (requiredComponents.length > 0) {
    const registered = await storage.getResourcesByType("component");
    const byKey = new Map<string, ComponentManifest>();
    for (const r of registered) {
      const m = (r.metadata as Record<string, unknown> | null)?.manifest as ComponentManifest | undefined;
      if (m?.key) byKey.set(m.key, m);
    }

    for (const spec of requiredComponents) {
      const at = spec.lastIndexOf("@");
      const key = at > 0 ? spec.slice(0, at) : spec;
      const range = at > 0 ? spec.slice(at + 1) : "*";
      const found = byKey.get(key);
      if (!found) {
        failures.push({
          kind: "component",
          requirement: spec,
          reason: `no component manifest registered for "${key}"`,
        });
        continue;
      }
      const result = satisfies(found.version, range);
      if (!result.ok) {
        failures.push({
          kind: "component",
          requirement: spec,
          reason: result.reason ?? `registered version ${found.version} does not satisfy ${range}`,
        });
      }
    }
  }

  const knownServices = new Set<string>(Object.values(ServiceId) as string[]);
  for (const service of requires.services ?? []) {
    if (!knownServices.has(service)) {
      failures.push({
        kind: "service",
        requirement: service,
        reason: `"${service}" is not a service this platform provides`,
      });
    }
  }

  return failures;
}
