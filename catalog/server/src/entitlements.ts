import type { Request, Response, NextFunction } from 'express';
import type { Resource, AccessPolicy, AccessPolicyAction } from '@shared/schema';
import { defaultAccessPolicy, publicAccessPolicy } from '@shared/schema';
import type { IdentityUser } from './identity';

export function getPrincipalEntitlements(user: IdentityUser | undefined): string[] {
  if (!user) {
    return ['public'];
  }

  const entitlements: string[] = ['public', 'authenticated'];

  if (user.isSuperAdmin) {
    entitlements.push(
      'role:admin',
      'role:publisher',
      'role:reviewer',
      'cap:registry.write',
      'cap:registry.publish',
      'cap:registry.sign',
      'cap:registry.certify'
    );
  }

  if (user.entitlements) {
    entitlements.push(...user.entitlements);
  }

  if (user.roles) {
    user.roles.forEach(role => entitlements.push(`role:${role}`));
  }

  if (user.organizations) {
    user.organizations.forEach(org => {
      entitlements.push(`org:${org.id}`);
      if (org.role === 'admin') {
        entitlements.push(`role:admin:${org.id}`);
      }
      if (org.role === 'member' || org.role === 'admin') {
        entitlements.push(`role:member:${org.id}`);
      }
    });
  }

  return Array.from(new Set(entitlements));
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
