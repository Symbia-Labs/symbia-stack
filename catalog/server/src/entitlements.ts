import type { Request, Response, NextFunction } from 'express';
import type { Resource, AccessPolicy, AccessPolicyAction } from '@shared/schema';
import { defaultAccessPolicy, publicAccessPolicy } from '@shared/schema';
import type { IdentityUser } from './identity';
import { Capabilities, Roles, buildEntitlements } from '@symbia/sys';

export function getPrincipalEntitlements(user: IdentityUser | undefined): string[] {
  if (!user) {
    return ['public'];
  }

  // Use shared buildEntitlements from @symbia/sys for consistency
  const baseEntitlements = buildEntitlements({
    isSuperAdmin: user.isSuperAdmin,
    entitlements: user.entitlements,
    roles: user.roles,
    organizations: user.organizations,
  });

  // Add catalog-specific capabilities for super admins
  if (user.isSuperAdmin) {
    baseEntitlements.push(
      Roles.PUBLISHER,
      'role:reviewer',
      Capabilities.REGISTRY_WRITE,
      Capabilities.REGISTRY_PUBLISH,
      Capabilities.REGISTRY_SIGN,
      Capabilities.REGISTRY_CERTIFY,
      Capabilities.CATALOG_ADMIN
    );
  }

  return Array.from(new Set(baseEntitlements));
}

export function checkEntitlement(
  principalEntitlements: string[],
  requiredAnyOf: string[]
): boolean {
  return requiredAnyOf.some(required => principalEntitlements.includes(required));
}

export function canPerformAction(
  user: IdentityUser | undefined,
  resource: Resource,
  action: AccessPolicyAction
): boolean {
  if (user?.isSuperAdmin) {
    return true;
  }

  const policy: AccessPolicy = resource.accessPolicy || defaultAccessPolicy;
  const principalEntitlements = getPrincipalEntitlements(user);

  if (policy.visibility === 'org' && resource.orgId) {
    const hasOrgAccess = principalEntitlements.includes(`org:${resource.orgId}`);
    if (!hasOrgAccess && action === 'read') {
      return false;
    }
  }

  if (policy.visibility === 'private') {
    if (!user) return false;
  }

  const actionPolicy = policy.actions[action];
  if (!actionPolicy || !actionPolicy.anyOf) {
    return user?.isSuperAdmin ?? false;
  }

  return checkEntitlement(principalEntitlements, actionPolicy.anyOf);
}

export function filterResourcesByReadAccess(
  resources: Resource[],
  user: IdentityUser | undefined
): Resource[] {
  return resources.filter(resource => canPerformAction(user, resource, 'read'));
}

export function requireEntitlement(action: AccessPolicyAction) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const resource = (req as any).resource as Resource | undefined;
    
    if (!resource) {
      next();
      return;
    }

    if (!canPerformAction(req.user, resource, action)) {
      res.status(403).json({ 
        error: 'Access denied',
        action,
        required: resource.accessPolicy?.actions[action]?.anyOf || defaultAccessPolicy.actions[action]?.anyOf
      });
      return;
    }

    next();
  };
}

export function getPublicReadPolicy(): AccessPolicy {
  return publicAccessPolicy;
}
