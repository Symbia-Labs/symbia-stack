/**
 * @symbia/auth - Express middleware for authentication
 */
import type { Request, Response, NextFunction } from 'express';
import type { AuthUser, AuthMiddlewareOptions, SessionCookie } from './types.js';
declare global {
    namespace Express {
        interface Request {
            user?: AuthUser;
        }
    }
}
/**
 * Create authentication middleware for a service
 */
export declare function createAuthMiddleware(options: AuthMiddlewareOptions): {
    getCurrentUser: (req: Request) => Promise<AuthUser | null>;
    requireAuth: (req: Request, res: Response, next: NextFunction) => void;
    optionalAuth: (req: Request, res: Response, next: NextFunction) => void;
    requireAdmin: (req: Request, res: Response, next: NextFunction) => void;
    requireSuperAdmin: (req: Request, res: Response, next: NextFunction) => void;
    authClient: {
        introspectToken: (token: string) => Promise<AuthUser | null>;
        verifyApiKey: (apiKey: string) => Promise<AuthUser | null>;
        verifySessionCookie: (sessionCookie: SessionCookie) => Promise<AuthUser | null>;
        getUserOrganizations: (token: string) => Promise<import("./types.js").AuthOrganization[]>;
        buildIdentityUrl: (path: string) => string;
    };
};
export type AuthMiddleware = ReturnType<typeof createAuthMiddleware>;
//# sourceMappingURL=middleware.d.ts.map