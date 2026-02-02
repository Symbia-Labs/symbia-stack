/**
 * Network Service Schema
 *
 * The network service does not use a database.
 * This file provides shared type definitions.
 */

export interface NetworkNode {
  id: string;
  name: string;
  type: 'service' | 'bridge' | 'gateway';
  endpoint: string;
  status: 'online' | 'offline' | 'degraded';
  metadata?: Record<string, unknown>;
}

export interface NetworkPolicy {
  id: string;
  name: string;
  rules: PolicyRule[];
  priority: number;
  isActive: boolean;
}

export interface PolicyRule {
  action: 'allow' | 'deny' | 'rate_limit';
  source?: string;
  destination?: string;
  protocol?: string;
  port?: number;
  rateLimit?: {
    requests: number;
    windowMs: number;
  };
}

export interface NetworkEvent {
  id: string;
  type: string;
  source: string;
  destination?: string;
  payload: unknown;
  timestamp: Date;
}
