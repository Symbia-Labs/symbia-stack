/**
 * Policy Service
 *
 * Handles hash computation/verification and routing policy evaluation.
 * The hash is a cryptographic commitment to the security policy.
 */

import { createHash } from 'crypto';
import type {
  SandboxEvent,
  EventPayload,
  EventWrapper,
  RoutingPolicy,
  PolicyCondition,
  PolicyAction,
} from '../types.js';
import { telemetry, NetworkEvents, NetworkMetrics } from '../telemetry.js';

// In-memory policy storage (MVP)
const policies = new Map<string, RoutingPolicy>();

// Secret for HMAC - required in production
const HASH_SECRET = process.env.NETWORK_HASH_SECRET;
if (!HASH_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('NETWORK_HASH_SECRET is required in production');
}
const hashSecret = HASH_SECRET || 'symbia-network-dev-only';

/**
 * Compute the security policy hash for an event
 *
 * The hash commits to:
 * - Event type and data
 * - Source and boundary
 * - Run context
 */
export function computeEventHash(
  payload: EventPayload,
  wrapper: Omit<EventWrapper, 'path'>
): string {
  const hashInput = JSON.stringify({
    type: payload.type,
    data: payload.data,
    source: wrapper.source,
    runId: wrapper.runId,
    boundary: wrapper.boundary,
    target: wrapper.target,
  });

  return createHash('sha256')
    .update(hashInput)
    .update(hashSecret)
    .digest('hex');
}

/**
 * Verify an event's hash is valid
 */
export function verifyEventHash(event: SandboxEvent): boolean {
  const { path, ...wrapperWithoutPath } = event.wrapper;
  const expectedHash = computeEventHash(event.payload, wrapperWithoutPath);
  return event.hash === expectedHash;
}

/**
 * Regenerate hash when context changes (e.g., crossing boundaries)
 */
export function regenerateHash(event: SandboxEvent, newBoundary: EventWrapper['boundary']): string {
  const { path, ...wrapperWithoutPath } = event.wrapper;
  return computeEventHash(event.payload, {
    ...wrapperWithoutPath,
    boundary: newBoundary,
  });
}

/**
 * Create a new routing policy
 */
export function createPolicy(
  name: string,
  priority: number,
  conditions: PolicyCondition[],
  action: PolicyAction
): RoutingPolicy {
  const policyObj: RoutingPolicy = {
    id: `policy_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    name,
    priority,
    conditions,
    action,
    enabled: true,
    createdAt: new Date().toISOString(),
  };
  policies.set(policyObj.id, policyObj);

  telemetry.event(
    NetworkEvents.POLICY_CREATED,
    `Policy created: ${name}`,
    {
      policyId: policyObj.id,
      policyName: name,
      priority,
      actionType: action.type,
      conditionCount: conditions.length,
    }
  );

  return policyObj;
}

/**
 * Get a policy by ID
 */
export function getPolicy(policyId: string): RoutingPolicy | undefined {
  return policies.get(policyId);
}

/**
 * Get all policies
 */
export function getAllPolicies(): RoutingPolicy[] {
  return Array.from(policies.values());
}

/**
 * Update a policy
 */
export function updatePolicy(
  policyId: string,
  updates: Partial<Omit<RoutingPolicy, 'id' | 'createdAt'>>
): RoutingPolicy | null {
  const existing = policies.get(policyId);
  if (!existing) return null;

  const updated = { ...existing, ...updates };
  policies.set(policyId, updated);

  telemetry.event(
    NetworkEvents.POLICY_UPDATED,
    `Policy updated: ${updated.name}`,
    {
      policyId,
      policyName: updated.name,
      priority: updated.priority,
      actionType: updated.action.type,
      enabled: updated.enabled,
      updatedFields: Object.keys(updates),
    }
  );

  return updated;
}

/**
 * Delete a policy
 */
export function deletePolicy(policyId: string): boolean {
  const existing = policies.get(policyId);
  const deleted = policies.delete(policyId);

  if (deleted && existing) {
    telemetry.event(
      NetworkEvents.POLICY_DELETED,
      `Policy deleted: ${existing.name}`,
      {
        policyId,
        policyName: existing.name,
        priority: existing.priority,
        actionType: existing.action.type,
      }
    );
  }

  return deleted;
}

/**
 * Evaluate all policies against an event
 * Returns the action from the highest priority matching policy
 */
export function evaluatePolicies(event: SandboxEvent): {
  policyId?: string;
  action: PolicyAction;
} {
  // Get enabled policies sorted by priority (highest first)
  const sortedPolicies = Array.from(policies.values())
    .filter((p) => p.enabled)
    .sort((a, b) => b.priority - a.priority);

  for (const policy of sortedPolicies) {
    if (matchesConditions(event, policy.conditions)) {
      return {
        policyId: policy.id,
        action: policy.action,
      };
    }
  }

  // Default: allow
  return { action: { type: 'allow' } };
}

/**
 * Check if an event matches all policy conditions
 */
function matchesConditions(event: SandboxEvent, conditions: PolicyCondition[]): boolean {
  for (const condition of conditions) {
    const value = getFieldValue(event, condition.field);
    if (!matchesCondition(value, condition.operator, condition.value)) {
      return false;
    }
  }
  return true;
}

/**
 * Get the value of a field from an event
 */
function getFieldValue(event: SandboxEvent, field: PolicyCondition['field']): string {
  switch (field) {
    case 'source':
      return event.wrapper.source;
    case 'target':
      return event.wrapper.target || '';
    case 'eventType':
      return event.payload.type;
    case 'boundary':
      return event.wrapper.boundary;
    case 'runId':
      return event.wrapper.runId;
    default:
      return '';
  }
}

/**
 * Check if a value matches a condition
 */
function matchesCondition(
  value: string,
  operator: PolicyCondition['operator'],
  conditionValue: string
): boolean {
  switch (operator) {
    case 'eq':
      return value === conditionValue;
    case 'neq':
      return value !== conditionValue;
    case 'contains':
      return value.includes(conditionValue);
    case 'startsWith':
      return value.startsWith(conditionValue);
    case 'regex':
      try {
        return new RegExp(conditionValue).test(value);
      } catch {
        return false;
      }
    default:
      return false;
  }
}

/**
 * Initialize default policies
 */
export function initDefaultPolicies(): void {
  // Allow all intra-sandbox events by default
  createPolicy(
    'allow-intra',
    100,
    [{ field: 'boundary', operator: 'eq', value: 'intra' }],
    { type: 'allow' }
  );

  // Log all inter-sandbox events
  createPolicy(
    'log-inter',
    90,
    [{ field: 'boundary', operator: 'eq', value: 'inter' }],
    { type: 'log', level: 'info' }
  );

  // Log all extra events (external)
  createPolicy(
    'log-extra',
    90,
    [{ field: 'boundary', operator: 'eq', value: 'extra' }],
    { type: 'log', level: 'warn' }
  );
}
