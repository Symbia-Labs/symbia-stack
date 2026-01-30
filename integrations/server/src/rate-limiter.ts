/**
 * Rate Limiting Middleware
 *
 * In-memory rate limiter for the integrations gateway. Since this service is
 * the sole external I/O layer in most Symbia networks, rate limiting here
 * protects both upstream providers and platform resources.
 *
 * Limits are enforced at three levels:
 * - Per-user: Prevents individual abuse
 * - Per-org: Prevents org-wide runaway usage
 * - Per-provider: Respects upstream provider rate limits
 *
 * This is a simple sliding window implementation. For production scale,
 * consider Redis-backed limits for multi-instance deployments.
 */

import type { Request, Response, NextFunction } from "express";
import { IntegrationError } from "./errors.js";

// =============================================================================
// Configuration
// =============================================================================

export interface RateLimitConfig {
  /** Requests per window per user */
  userLimit: number;
  /** Requests per window per org */
  orgLimit: number;
  /** Requests per window per provider (across all users/orgs) */
  providerLimit: number;
  /** Window size in milliseconds */
  windowMs: number;
}

const DEFAULT_CONFIG: RateLimitConfig = {
  userLimit: 100,      // 100 requests per user per minute
  orgLimit: 500,       // 500 requests per org per minute
  providerLimit: 1000, // 1000 requests per provider per minute
  windowMs: 60_000,    // 1 minute window
};

// Per-provider overrides (some providers are more generous)
const PROVIDER_LIMITS: Record<string, number> = {
  openai: 3000,
  anthropic: 1000,
  google: 500,
  mistral: 500,
  cohere: 500,
  huggingface: 300,
};

// =============================================================================
// Sliding Window Counter
// =============================================================================

interface WindowEntry {
  count: number;
  windowStart: number;
}

class SlidingWindowCounter {
  private windows = new Map<string, WindowEntry>();
  private readonly windowMs: number;

  constructor(windowMs: number) {
    this.windowMs = windowMs;
    // Cleanup stale entries every 5 minutes
    setInterval(() => this.cleanup(), 5 * 60_000);
  }

  /**
   * Increment counter and check if over limit
   * Returns { allowed: boolean, current: number, limit: number, resetMs: number }
   */
  check(key: string, limit: number): { allowed: boolean; current: number; limit: number; resetMs: number } {
    const now = Date.now();
    const entry = this.windows.get(key);

    if (!entry || now - entry.windowStart >= this.windowMs) {
      // New window
      this.windows.set(key, { count: 1, windowStart: now });
      return { allowed: true, current: 1, limit, resetMs: this.windowMs };
    }

    // Same window
    entry.count++;
    const resetMs = this.windowMs - (now - entry.windowStart);

    if (entry.count > limit) {
      return { allowed: false, current: entry.count, limit, resetMs };
    }

    return { allowed: true, current: entry.count, limit, resetMs };
  }

  /**
   * Get current count without incrementing
   */
  peek(key: string): number {
    const now = Date.now();
    const entry = this.windows.get(key);
    if (!entry || now - entry.windowStart >= this.windowMs) {
      return 0;
    }
    return entry.count;
  }

  /**
   * Remove stale entries
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.windows.entries()) {
      if (now - entry.windowStart >= this.windowMs * 2) {
        this.windows.delete(key);
      }
    }
  }
}

// =============================================================================
// Rate Limiter Instance
// =============================================================================

class RateLimiter {
  private userCounter: SlidingWindowCounter;
  private orgCounter: SlidingWindowCounter;
  private providerCounter: SlidingWindowCounter;
  private config: RateLimitConfig;

  constructor(config: Partial<RateLimitConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.userCounter = new SlidingWindowCounter(this.config.windowMs);
    this.orgCounter = new SlidingWindowCounter(this.config.windowMs);
    this.providerCounter = new SlidingWindowCounter(this.config.windowMs);
  }

  /**
   * Check all rate limits for a request
   * Throws IntegrationError if any limit exceeded
   */
  checkLimits(opts: {
    userId: string;
    orgId: string;
    provider: string;
  }): void {
    const { userId, orgId, provider } = opts;

    // Check user limit
    const userKey = `user:${userId}`;
    const userResult = this.userCounter.check(userKey, this.config.userLimit);
    if (!userResult.allowed) {
      throw new IntegrationError({
        message: `Rate limit exceeded. You've made ${userResult.current} requests in the last minute (limit: ${userResult.limit}). Try again in ${Math.ceil(userResult.resetMs / 1000)}s.`,
        category: "rate_limit",
        provider,
        retryable: true,
      });
    }

    // Check org limit
    const orgKey = `org:${orgId}`;
    const orgResult = this.orgCounter.check(orgKey, this.config.orgLimit);
    if (!orgResult.allowed) {
      throw new IntegrationError({
        message: `Organization rate limit exceeded. Your organization has made ${orgResult.current} requests in the last minute (limit: ${orgResult.limit}). Try again in ${Math.ceil(orgResult.resetMs / 1000)}s.`,
        category: "rate_limit",
        provider,
        retryable: true,
      });
    }

    // Check provider limit
    const providerLimit = PROVIDER_LIMITS[provider] || this.config.providerLimit;
    const providerKey = `provider:${provider}`;
    const providerResult = this.providerCounter.check(providerKey, providerLimit);
    if (!providerResult.allowed) {
      throw new IntegrationError({
        message: `${provider} rate limit exceeded. Platform has made ${providerResult.current} requests in the last minute (limit: ${providerResult.limit}). Try again in ${Math.ceil(providerResult.resetMs / 1000)}s.`,
        category: "rate_limit",
        provider,
        retryable: true,
      });
    }
  }

  /**
   * Get current usage stats (for debugging/monitoring)
   */
  getStats(opts: { userId?: string; orgId?: string; provider?: string }): Record<string, number> {
    const stats: Record<string, number> = {};
    if (opts.userId) {
      stats.userRequests = this.userCounter.peek(`user:${opts.userId}`);
    }
    if (opts.orgId) {
      stats.orgRequests = this.orgCounter.peek(`org:${opts.orgId}`);
    }
    if (opts.provider) {
      stats.providerRequests = this.providerCounter.peek(`provider:${opts.provider}`);
    }
    return stats;
  }
}

// Singleton instance
const rateLimiter = new RateLimiter();

// =============================================================================
// Middleware
// =============================================================================

/**
 * Rate limiting middleware for execute endpoints.
 * Must be called after auth middleware (needs user/org context).
 */
export function rateLimitMiddleware(req: Request, res: Response, next: NextFunction): void {
  const user = (req as any).user;
  const provider = req.body?.provider;

  if (!user || !provider) {
    // Let the handler deal with missing auth/params
    next();
    return;
  }

  try {
    rateLimiter.checkLimits({
      userId: user.id,
      orgId: user.orgId,
      provider,
    });

    // Add rate limit headers
    const stats = rateLimiter.getStats({ userId: user.id, orgId: user.orgId, provider });
    res.setHeader("X-RateLimit-User-Remaining", String(DEFAULT_CONFIG.userLimit - (stats.userRequests || 0)));
    res.setHeader("X-RateLimit-Org-Remaining", String(DEFAULT_CONFIG.orgLimit - (stats.orgRequests || 0)));

    next();
  } catch (error) {
    if (error instanceof IntegrationError) {
      res.status(error.statusCode).json(error.toResponse());
    } else {
      next(error);
    }
  }
}

/**
 * Get rate limiter instance for manual checks
 */
export function getRateLimiter(): RateLimiter {
  return rateLimiter;
}
