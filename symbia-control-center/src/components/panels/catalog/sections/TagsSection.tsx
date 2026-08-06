/**
 * Tags Section
 *
 * Shared section for managing resource tags.
 * Used by all resource types.
 */

import type { CatalogResource } from '@/types/catalog';
import { TagEditor } from '../shared/TagEditor';

interface TagsSectionProps {
  resource: CatalogResource;
  onUpdate: (updates: Partial<CatalogResource>) => void;
  disabled?: boolean;
}

export function TagsSection({
  resource,
  onUpdate,
  disabled = false,
}: TagsSectionProps) {
  return (
    <section className="space-y-4">
      <h3 className="text-sm font-medium text-slate-300 uppercase tracking-wider">
        Tags
      </h3>

      <div>
        <TagEditor
          tags={resource.tags}
          onChange={(tags) => onUpdate({ tags })}
          placeholder="Add tags to organize and filter resources..."
          disabled={disabled}
        />
        <p className="text-xs text-slate-500 mt-2">
          Press Enter or comma to add a tag. Backspace to remove the last tag.
        </p>
      </div>
    </section>
  );
}
