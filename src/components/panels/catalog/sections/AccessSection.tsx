/**
 * Access Section
 *
 * Configure visibility, roles, and permissions for catalog resources.
 */

import { useState, useCallback } from 'react';
import type { CatalogResource } from '@/types/catalog';

interface AccessSectionProps {
  resource: CatalogResource;
  onUpdateMetadata: (metadata: Record<string, unknown>) => void;
}

type Visibility = 'private' | 'organization' | 'public';

interface RolePermission {
  id: string;
  role: string;
  permissions: string[];
}

const VISIBILITY_OPTIONS: { value: Visibility; label: string; description: string; icon: string }[] = [
  {
    value: 'private',
    label: 'Private',
    description: 'Only you can access this resource',
    icon: '🔒',
  },
  {
    value: 'organization',
    label: 'Organization',
    description: 'All members of your organization can access',
    icon: '🏢',
  },
  {
    value: 'public',
    label: 'Public',
    description: 'Anyone with the link can access (read-only)',
    icon: '🌐',
  },
];

const AVAILABLE_ROLES = [
  'admin',
  'editor',
  'viewer',
  'operator',
  'developer',
];

const AVAILABLE_PERMISSIONS = [
  { value: 'read', label: 'Read', description: 'View resource details' },
  { value: 'write', label: 'Write', description: 'Modify resource' },
  { value: 'delete', label: 'Delete', description: 'Remove resource' },
  { value: 'execute', label: 'Execute', description: 'Run or invoke resource' },
  { value: 'publish', label: 'Publish', description: 'Change resource status' },
  { value: 'share', label: 'Share', description: 'Grant access to others' },
];

export function AccessSection({ resource, onUpdateMetadata }: AccessSectionProps) {
  const metadata = resource.metadata || {};
  const access = (metadata.access || {}) as {
    visibility?: Visibility;
    roles?: RolePermission[];
    allowedUsers?: string[];
    deniedUsers?: string[];
  };

  const [visibility, setVisibility] = useState<Visibility>(access.visibility || 'private');
  const [rolePermissions, setRolePermissions] = useState<RolePermission[]>(
    access.roles || []
  );

  // Update access config in metadata
  const updateAccess = useCallback((updates: Partial<typeof access>) => {
    onUpdateMetadata({
      ...metadata,
      access: {
        ...access,
        ...updates,
      },
    });
  }, [metadata, access, onUpdateMetadata]);

  // Handle visibility change
  const handleVisibilityChange = useCallback((newVisibility: Visibility) => {
    setVisibility(newVisibility);
    updateAccess({ visibility: newVisibility });
  }, [updateAccess]);

  // Add a new role permission
  const addRolePermission = useCallback(() => {
    const newRole: RolePermission = {
      id: `role-${Date.now()}`,
      role: '',
      permissions: ['read'],
    };
    const updated = [...rolePermissions, newRole];
    setRolePermissions(updated);
    updateAccess({ roles: updated });
  }, [rolePermissions, updateAccess]);

  // Update a role permission
  const updateRolePermission = useCallback((id: string, updates: Partial<RolePermission>) => {
    const updated = rolePermissions.map(rp =>
      rp.id === id ? { ...rp, ...updates } : rp
    );
    setRolePermissions(updated);
    updateAccess({ roles: updated });
  }, [rolePermissions, updateAccess]);

  // Remove a role permission
  const removeRolePermission = useCallback((id: string) => {
    const updated = rolePermissions.filter(rp => rp.id !== id);
    setRolePermissions(updated);
    updateAccess({ roles: updated });
  }, [rolePermissions, updateAccess]);

  // Toggle permission for a role
  const togglePermission = useCallback((roleId: string, permission: string) => {
    const role = rolePermissions.find(rp => rp.id === roleId);
    if (!role) return;

    const hasPermission = role.permissions.includes(permission);
    const newPermissions = hasPermission
      ? role.permissions.filter(p => p !== permission)
      : [...role.permissions, permission];

    updateRolePermission(roleId, { permissions: newPermissions });
  }, [rolePermissions, updateRolePermission]);

  return (
    <div className="space-y-8">
      {/* Visibility Section */}
      <section className="space-y-4">
        <h3 className="text-sm font-medium text-slate-300 uppercase tracking-wider">
          Visibility
        </h3>
        <p className="text-xs text-slate-500">
          Control who can discover and access this resource.
        </p>

        <div className="grid grid-cols-3 gap-3">
          {VISIBILITY_OPTIONS.map((option) => (
            <button
              key={option.value}
              onClick={() => handleVisibilityChange(option.value)}
              className={`
                p-4 rounded-lg border text-left transition-all
                ${visibility === option.value
                  ? 'border-scc-primary bg-scc-primary/10'
                  : 'border-scc-border bg-scc-surface hover:border-slate-600'
                }
              `}
            >
              <div className="text-2xl mb-2">{option.icon}</div>
              <div className="font-medium text-slate-200 text-sm">{option.label}</div>
              <div className="text-xs text-slate-500 mt-1">{option.description}</div>
            </button>
          ))}
        </div>
      </section>

      {/* Role-Based Access Section */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-slate-300 uppercase tracking-wider">
              Role Permissions
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Define what actions each role can perform on this resource.
            </p>
          </div>
          <button
            onClick={addRolePermission}
            className="scc-button-ghost text-sm flex items-center gap-1"
          >
            <span>+</span>
            <span>Add Role</span>
          </button>
        </div>

        {rolePermissions.length === 0 ? (
          <div className="scc-card p-6 border-dashed text-center">
            <div className="text-3xl mb-2">👥</div>
            <p className="text-slate-400 text-sm">
              No role-specific permissions configured.
            </p>
            <p className="text-slate-500 text-xs mt-1">
              Add roles to customize access beyond the visibility setting.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {rolePermissions.map((rp) => (
              <div key={rp.id} className="scc-card p-4">
                <div className="flex items-start gap-4">
                  {/* Role selector */}
                  <div className="w-40">
                    <label className="scc-label text-xs">Role</label>
                    <select
                      value={rp.role}
                      onChange={(e) => updateRolePermission(rp.id, { role: e.target.value })}
                      className="scc-input text-sm"
                    >
                      <option value="">Select role</option>
                      {AVAILABLE_ROLES.map(role => (
                        <option key={role} value={role}>
                          {role.charAt(0).toUpperCase() + role.slice(1)}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Permissions */}
                  <div className="flex-1">
                    <label className="scc-label text-xs">Permissions</label>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {AVAILABLE_PERMISSIONS.map((perm) => (
                        <button
                          key={perm.value}
                          onClick={() => togglePermission(rp.id, perm.value)}
                          title={perm.description}
                          className={`
                            px-3 py-1 rounded text-xs font-medium transition-colors
                            ${rp.permissions.includes(perm.value)
                              ? 'bg-scc-primary/20 text-scc-primary border border-scc-primary/30'
                              : 'bg-scc-surface text-slate-400 border border-scc-border hover:border-slate-500'
                            }
                          `}
                        >
                          {perm.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Remove button */}
                  <button
                    onClick={() => removeRolePermission(rp.id)}
                    className="p-1 text-slate-500 hover:text-red-400 transition-colors mt-5"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Inheritance Info */}
      <section className="space-y-4">
        <h3 className="text-sm font-medium text-slate-300 uppercase tracking-wider">
          Access Inheritance
        </h3>
        <div className="scc-card p-4 bg-scc-surface/50">
          <div className="flex items-start gap-3">
            <span className="text-xl">ℹ️</span>
            <div className="text-sm text-slate-400">
              <p>
                Resources inherit access settings from their parent namespace by default.
                Settings configured here override inherited permissions.
              </p>
              <p className="mt-2 text-slate-500">
                Current namespace: <code className="text-scc-primary">{resource.key.split('/').slice(0, -1).join('/') || '/'}</code>
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
