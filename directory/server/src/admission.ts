/**
 * Admission — the single trust edge.
 *
 * Design §6: federation has exactly one place a credential is checked, and it
 * is here, not spread across every node. Phase 1 is a shared join secret;
 * phase 2 (an identity-issued bridge credential) slots in behind this same
 * function without callers changing.
 */
import type { Request } from 'express';
import { config } from './config.js';

export interface AdmissionResult {
  ok: boolean;
  reason?: string;
}

export function checkAdmission(req: Request): AdmissionResult {
  // No secret configured → open admission, by explicit choice (see config).
  // The boot warning is the "blank beats green" honesty: an open door is a
  // stated state, never an inferred pass.
  if (!config.joinSecret) return { ok: true };

  const presented = req.header('x-symbia-join-secret');
  if (!presented) {
    return { ok: false, reason: 'missing x-symbia-join-secret' };
  }
  if (presented !== config.joinSecret) {
    return { ok: false, reason: 'invalid join secret' };
  }
  return { ok: true };
}
