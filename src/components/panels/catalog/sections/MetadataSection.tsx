/**
 * Metadata Section
 *
 * Shared section for editing resource metadata as JSON.
 * Used by all resource types.
 */

import type { CatalogResource } from '@/types/catalog';
import { JsonEditor } from '../shared/JsonEditor';

interface MetadataSectionProps {
  resource: CatalogResource;
  onUpdateMetadata: (metadata: Record<string, unknown>) => void;
  disabled?: boolean;
}

export function MetadataSection({
  resource,
  onUpdateMetadata,
  disabled = false,
}: MetadataSectionProps) {
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-slate-300 uppercase tracking-wider">
          Metadata
        </h3>
        <span className="text-xs text-slate-500">
          Custom key-value pairs
        </span>
      </div>

      <JsonEditor
        value={resource.metadata}
        onChange={(value) => onUpdateMetadata(value as Record<string, unknown>)}
        height={200}
        readOnly={disabled}
      />

      <p className="text-xs text-slate-500">
        Additional metadata stored with this resource. Must be valid JSON.
      </p>
    </section>
  );
}
