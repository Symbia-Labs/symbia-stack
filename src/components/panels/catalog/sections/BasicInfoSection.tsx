/**
 * Basic Info Section
 *
 * Shared section for key, name, and description fields.
 * Used by all resource types.
 */

import type { CatalogResource } from '@/types/catalog';

interface BasicInfoSectionProps {
  resource: CatalogResource;
  onUpdate: (updates: Partial<CatalogResource>) => void;
  disabled?: boolean;
}

export function BasicInfoSection({
  resource,
  onUpdate,
  disabled = false,
}: BasicInfoSectionProps) {
  return (
    <section className="space-y-4">
      <h3 className="text-sm font-medium text-slate-300 uppercase tracking-wider">
        Basic Information
      </h3>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="scc-label">Key</label>
          <input
            type="text"
            value={resource.key}
            onChange={(e) => onUpdate({ key: e.target.value })}
            placeholder={`${resource.type}/my-${resource.type}`}
            className="scc-input"
            disabled={disabled}
          />
          <p className="text-xs text-slate-500 mt-1">
            Unique identifier for this resource
          </p>
        </div>

        <div>
          <label className="scc-label">Name</label>
          <input
            type="text"
            value={resource.name}
            onChange={(e) => onUpdate({ name: e.target.value })}
            placeholder="Display Name"
            className="scc-input"
            disabled={disabled}
          />
        </div>
      </div>

      <div>
        <label className="scc-label">Description</label>
        <textarea
          value={resource.description || ''}
          onChange={(e) => onUpdate({ description: e.target.value })}
          placeholder={`Describe what this ${resource.type} does...`}
          rows={3}
          className="scc-input resize-none"
          disabled={disabled}
        />
      </div>
    </section>
  );
}
