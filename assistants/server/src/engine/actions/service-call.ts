import { BaseActionHandler } from './base.js';
import { TokenAuthError } from '../../integrations-client.js';
import type { ActionConfig, ActionResult, ExecutionContext } from '../types.js';
import { ServiceId, resolveServiceUrl } from '@symbia/sys';
import { interpolate, interpolateObject } from '../template.js';

export interface ServiceCallParams {
  service: string;  // 'logging', 'catalog', 'identity', etc.
  method: string;   // HTTP method
  path: string;     // API path
  body?: Record<string, unknown>;
  headers?: Record<string, string>;
  resultKey?: string; // Key to store result in context
}

/**
 * Map service names to ServiceId and resolve endpoints dynamically.
 * Supports environment variable overrides via @symbia/sys resolution.
 */
function getServiceEndpoint(service: string): string | null {
  const serviceMap: Record<string, ServiceId> = {
    logging: ServiceId.LOGGING,
    catalog: ServiceId.CATALOG,
    identity: ServiceId.IDENTITY,
    messaging: ServiceId.MESSAGING,
    runtime: ServiceId.RUNTIME,
    network: ServiceId.NETWORK,
    integrations: ServiceId.INTEGRATIONS,
  };

  const serviceId = serviceMap[service];
  if (!serviceId) return null;

  // Check for direct endpoint override first
  const envOverride = process.env[`${service.toUpperCase()}_ENDPOINT`];
  if (envOverride) return envOverride;

  // Use @symbia/sys service resolution
  return `${resolveServiceUrl(serviceId)}/api`;
}

export class ServiceCallHandler extends BaseActionHandler {
  type = 'service.call';

  async execute(config: ActionConfig, context: ExecutionContext): Promise<ActionResult> {
    const start = Date.now();
    const params = config.params as unknown as ServiceCallParams;

    try {
      const baseUrl = getServiceEndpoint(params.service);
      if (!baseUrl) {
        return this.failure(`Unknown service: ${params.service}`, Date.now() - start);
      }

      // Resolve template variables in path and body using unified Symbia Script
      const resolvedPath = interpolate(params.path, context);
      const resolvedBody = params.body ? interpolateObject(params.body, context) : undefined;

      const url = `${baseUrl}${resolvedPath}`;

      // Forward the caller's token.
      //
      // This action sent no Authorization header at all, so every service.call
      // from a rule came back "401 authentication_required" and surfaced that
      // string to the end user in the chat window. A rule could therefore
      // never read platform state -- which is most of what an assistant on
      // this platform is for.
      //
      // Same defect, same week, as integrations/auth.ts: an action that is
      // supposed to act on a user's behalf, not passing the thing that says
      // whose behalf it is. The token is on the execution context; llm.invoke
      // already reads it from exactly here.
      const token = (context.metadata as Record<string, unknown> | undefined)?.token as
        | string
        | undefined;

      // rawOrgId is the real org. context.orgId is a composite
      // "{assistantKey}:{orgId}" used for rule scoping, and sending it as
      // X-Org-Id makes services reject or mis-scope the request.
      const rawOrgId =
        ((context.metadata as Record<string, unknown> | undefined)?.rawOrgId as string) ??
        context.orgId;

      const response = await fetch(url, {
        method: params.method || 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-Org-Id': rawOrgId,
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...params.headers,
        },
        body: resolvedBody ? JSON.stringify(resolvedBody) : undefined,
      });

      if (!response.ok) {
        const errorText = await response.text();

        // A REJECTED TOKEN MUST THROW, not return a failure.
        //
        // The SDN webhook path already refreshes the assistant's token and
        // retries when it catches TokenAuthError — that machinery has been
        // there the whole time. But only llm.invoke ever threw it. service.call
        // returned an ordinary failure on 401, so the retry it was written for
        // never fired, and a stale token turned into an error message in the
        // user's chat instead of a refresh nobody would have noticed.
        //
        // Measured 8 Aug 2026: `network GET /events?limit=300 -> 401 (auth:
        // bearer sent)`, while the identical request with a FRESH token from
        // inside the same container returned 200.
        if (response.status === 401 || response.status === 403) {
          throw new TokenAuthError(
            `${params.service} ${params.method || 'GET'} ${resolvedPath} rejected the token (${response.status})`
          );
        }
        // SAY WHICH CALL FAILED.
        //
        // This read "Service call failed: 401 - {...}" with no service, no
        // path and no indication of whether a token was even sent. A rule with
        // four service.call steps produced an error that could have come from
        // any of them, and the operator's only move was to guess. Naming the
        // call, and whether an Authorization header went with it, turns one
        // message into the whole diagnosis.
        return this.failure(
          `Service call failed: ${params.service} ${params.method || 'GET'} ${resolvedPath} ` +
            `-> ${response.status} (auth: ${token ? 'bearer sent' : 'NO TOKEN'}) - ${errorText.slice(0, 200)}`,
          Date.now() - start
        );
      }

      const data = await response.json();

      // Optionally store result in context
      if (params.resultKey) {
        context.context[params.resultKey] = data;
      }

      return this.success({
        service: params.service,
        path: resolvedPath,
        status: response.status,
        data,
      }, Date.now() - start);
    } catch (error) {
      // Let a rejected token OUT.
      //
      // The throw above lands here, in this handler's own catch, which turned
      // it straight back into an ordinary failure — so the TokenAuthError
      // never reached the SDN retry, and the fix that was supposed to trigger
      // a refresh did nothing at all. rule-executor.ts:157 already rethrows
      // this type specifically; it just never received one.
      if (error instanceof TokenAuthError) throw error;
      const message = error instanceof Error ? error.message : 'Service call failed';
      return this.failure(message, Date.now() - start);
    }
  }
}
