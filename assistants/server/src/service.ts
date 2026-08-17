/**
 * The assistants service as a value: routes plus a loader that can be run
 * AGAIN once the catalog has contents.
 *
 * `loadAssistants` already runs inside `registerRoutes`, which is fine for
 * the container — the catalog is populated before assistants boots. In a
 * composition root the order inverts: services mount first, bootstrap
 * runs second, so the loader saw an empty catalog and registered nothing
 * (measured 15 Aug: an assistant authored through the API never appeared
 * in `GET /api/assistants`).
 *
 * The fix is not to reorder mounting — a host should not have to know
 * which service seeds which other one. It is to let a host say "the
 * catalog is ready now" and have the service respond.
 */
import type { Express } from 'express';
import { loadAssistants } from './services/assistant-loader.js';
import { getAllRuleSets, registerRuleSet } from './routes/rules.js';

export { registerRoutes } from './routes.js';

export interface StartContext {
  /** The app this service's routes were mounted on. */
  app: Express;
}

/** Re-read the roster from the catalog. Safe to call more than once. */
export async function start(ctx: StartContext): Promise<void> {
  await loadAssistants(ctx.app);
  await publishRulesToOrg();
}

/**
 * A LOADED RULE SET IS NOT AN EXECUTABLE ONE.
 *
 * `POST /api/rules/execute` resolves a rule set BY ORG. The loader calls
 * `registerRuleSet(assistantKey, ruleSet)` — against a parameter named
 * `orgId`, under a comment saying it is "for Admin UI visibility". So the
 * map is keyed by assistant and read by org, and the executor finds
 * nothing.
 *
 * Measured 16 Aug: `rulesEvaluated: 0, rulesMatched: 0` for a message that
 * matches the coordinator's platform-status rule exactly. Registering the
 * same rules under the org by hand produced `rulesEvaluated: 4,
 * rulesMatched: 1` and a live service.call returning real catalog counts.
 *
 * An org's executable rules are the UNION of its assistants' rules — each
 * rule's own conditions decide which fires, so two assistants can coexist.
 * Merging is what makes the union executable rather than last-writer-wins.
 */
export async function publishRulesToOrg(): Promise<void> {
  const orgId = process.env.SYMBIA_SYSTEM_ORG_ID;
  if (!orgId) {
    // Say it rather than skip it silently: without an org, assistants load
    // and can never be triggered, which looks like the assistant is broken.
    console.warn(
      '[assistants] SYMBIA_SYSTEM_ORG_ID is not set, so no rules were published ' +
        'to an org. Assistants will load and never fire: POST /api/rules/execute ' +
        'resolves rule sets by org.'
    );
    return;
  }

  const byAssistant = getAllRuleSets();
  const merged: any[] = [];
  const sources: string[] = [];
  for (const [key, set] of Object.entries(byAssistant)) {
    // Skip anything already keyed by an org — only assistant-keyed sets
    // are being promoted here.
    if (key === orgId) continue;
    const rules = (set as any)?.rules ?? [];
    if (!rules.length) continue;
    merged.push(...rules);
    sources.push(`${key}(${rules.length})`);
  }
  if (!merged.length) return;

  registerRuleSet(orgId, {
    id: `org-${orgId}`,
    name: 'Org rules',
    description: `Union of assistant rule sets: ${sources.join(', ')}`,
    version: 1,
    isActive: true,
    rules: merged,
  } as any);

  console.log(
    `[assistants] published ${merged.length} rule(s) to org ${orgId} from ${sources.join(', ')}`
  );
}
