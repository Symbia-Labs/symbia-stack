import type { Request, Response, NextFunction } from "express";

interface RateLimitStore {
  [key: string]: {
    count: number;
    resetTime: number;
  };
}

const stores: Map<string, RateLimitStore> = new Map();

/**
 * Creates a rate limiter middleware that reads limits from env vars at request time
 */
function createRateLimiter(
  name: string,
  getWindowMs: () => number,
  getMaxRequests: () => number,
  message: string
) {
  if (!stores.has(name)) {
    stores.set(name, {});
  }

  return (req: Request, res: Response, next: NextFunction) => {
    const store = stores.get(name)!;
    const key = req.user?.id || req.ip || 'anonymous';
    const now = Date.now();
    const windowMs = getWindowMs();
    const maxRequests = getMaxRequests();

    if (!store[key] || store[key].resetTime < now) {
      store[key] = {
        count: 1,
        resetTime: now + windowMs,
      };
      return next();
    }

    store[key].count++;

    if (store[key].count > maxRequests) {
      const retryAfter = Math.ceil((store[key].resetTime - now) / 1000);
      res.setHeader('Retry-After', retryAfter);
      res.setHeader('X-RateLimit-Limit', maxRequests);
      res.setHeader('X-RateLimit-Remaining', 0);
      res.setHeader('X-RateLimit-Reset', Math.ceil(store[key].resetTime / 1000));
      return res.status(429).json({ error: message });
    }

    res.setHeader('X-RateLimit-Limit', maxRequests);
    res.setHeader('X-RateLimit-Remaining', maxRequests - store[key].count);
    res.setHeader('X-RateLimit-Reset', Math.ceil(store[key].resetTime / 1000));

    next();
  };
}

// Helper functions to read env vars at runtime
const getWindowMs = () => parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10);
const getWriteMax = () => parseInt(process.env.RATE_LIMIT_WRITE_MAX || '30', 10);
const getSearchMax = () => parseInt(process.env.RATE_LIMIT_SEARCH_MAX || '60', 10);
const getUploadMax = () => parseInt(process.env.RATE_LIMIT_UPLOAD_MAX || '10', 10);

// Export rate limit config as getters for the /api/rate-limits endpoint
export const RATE_LIMITS = {
  get windowMs() { return getWindowMs(); },
  get writeMaxRequests() { return getWriteMax(); },
  get searchMaxRequests() { return getSearchMax(); },
  get uploadMaxRequests() { return getUploadMax(); },
};

// Rate limiter middleware instances
export const writeRateLimiter = createRateLimiter(
  'write',
  getWindowMs,
  getWriteMax,
  'Too many write requests, please try again later'
);

export const searchRateLimiter = createRateLimiter(
  'search',
  getWindowMs,
  getSearchMax,
  'Too many search requests, please try again later'
);

export const uploadRateLimiter = createRateLimiter(
  'upload',
  getWindowMs,
  getUploadMax,
  'Too many upload requests, please try again later'
);
