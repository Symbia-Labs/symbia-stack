import type { Request } from "express";
import type { ScopeHeaders } from "./types.js";

/**
 * Extract scope headers from incoming request
 */
export function getScopeHeaders(req: Request): ScopeHeaders {
  const orgId = req.get("x-org-id") || null;
  const serviceId = req.get("x-service-id") || null;
  const env = req.get("x-env") || req.get("x-environment") || null;
  const dataClass = req.get("x-data-class") || null;
  const policyRef = req.get("x-policy-ref") || null;
  return { orgId, serviceId, env, dataClass, policyRef };
}

/**
 * Build labels object from scope headers for telemetry
 */
export function buildScopeLabels(scope: ScopeHeaders): Record<string, string> {
  const labels: Record<string, string> = {};
  if (scope.orgId) labels.orgId = scope.orgId;
  if (scope.serviceId) labels.serviceId = scope.serviceId;
  if (scope.env) labels.env = scope.env;
  if (scope.dataClass) labels.dataClass = scope.dataClass;
  if (scope.policyRef) labels.policyRef = scope.policyRef;
  return labels;
}
