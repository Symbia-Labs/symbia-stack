import type { Request, Response, NextFunction } from 'express';
import { createHash, randomBytes } from 'crypto';
import { verifyApiKey, verifyToken, type IdentityUser } from './identity';
import { storage } from './storage';

declare global {
  namespace Express {
    interface Request {
      user?: IdentityUser;
      token?: string;
      apiKey?: { id: string; name: string };
    }
  }
}

export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

export function generateApiKey(): { key: string; prefix: string; hash: string } {
  const secureBytes = randomBytes(32).toString('hex');
  const key = `sos_${secureBytes}`;
  const prefix = key.substring(0, 8);
  const hash = hashApiKey(key);
  return { key, prefix, hash };
}

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  const cookieToken = req.cookies?.token;
  const apiKeyHeader = req.headers['x-api-key'] as string | undefined;

  // Check for API key first
  if (apiKeyHeader) {
    const keyHash = hashApiKey(apiKeyHeader);
    const apiKey = await storage.getApiKeyByHash(keyHash);
    
    if (!apiKey) {
      const verified = await verifyApiKey(apiKeyHeader);
      if (!verified) {
        res.status(401).json({ error: 'Invalid API key' });
        return;
      }

      req.user = verified.user;
      req.apiKey = { id: verified.user.id, name: verified.user.name };
      next();
      return;
    }
    
    if (apiKey.expiresAt && new Date(apiKey.expiresAt) < new Date()) {
      res.status(401).json({ error: 'API key expired' });
      return;
    }
    
    // Update last used timestamp asynchronously
    storage.updateApiKeyLastUsed(apiKey.id).catch(() => {});
    
    // API keys get super admin access
    req.user = {
      id: `api-key:${apiKey.id}`,
      email: `api-key@system`,
      name: apiKey.name,
      isSuperAdmin: true,
      organizations: [],
    };
    req.apiKey = { id: apiKey.id, name: apiKey.name };
    next();
    return;
  }
  
  const token = authHeader?.startsWith('Bearer ') 
    ? authHeader.slice(7) 
    : cookieToken;

  if (!token) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const user = await verifyToken(token);
  
  if (!user) {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }

  req.user = user;
  req.token = token;
  next();
}

export function optionalAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;
  const cookieToken = req.cookies?.token;
  
  const token = authHeader?.startsWith('Bearer ') 
    ? authHeader.slice(7) 
    : cookieToken;

  if (token) {
    verifyToken(token).then(user => {
      if (user) {
        req.user = user;
        req.token = token;
      }
      next();
    }).catch(() => {
      next();
    });
  } else {
    next();
  }
}

export function requireSuperAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  if (!req.user.isSuperAdmin) {
    res.status(403).json({ error: 'Super admin access required' });
    return;
  }

  next();
}
