/**
 * Assistants List
 *
 * Simple sidebar showing only assistants with search and create.
 */

import type { CatalogResource, ResourceType, ResourceStatus } from '@/types/catalog';
import { STATUS_META } from '@/types/catalog';

interface CatalogListProps {
  resources: CatalogResource[];
  selectedResourceId: string | null;
  isLoading: boolean;
  error: string | null;
  typeFilter: ResourceType | 'all';
  statusFilter: ResourceStatus | 'all';
  searchQuery: string;
  onSelectResource: (id: string) => void;
  onCreateResource: (type: ResourceType) => void;
  onTypeFilterChange: (type: ResourceType | 'all') => void;
  onStatusFilterChange: (status: ResourceStatus | 'all') => void;
  onSearchChange: (query: string) => void;
}

export function CatalogList({
  resources,
  selectedResourceId,
  isLoading,
  error,
  searchQuery,
  onSelectResource,
  onCreateResource,
  onSearchChange,
}: CatalogListProps) {
  // Filter to assistants only
  const assistants = resources.filter((r) => r.type === 'assistant');

  // Apply search filter
  const filteredAssistants = assistants.filter((r) =>
    !searchQuery ||
    r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.key.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="w-72 shrink-0 border-r border-scc-border flex flex-col h-full bg-scc-surface">
      {/* Header */}
      <div className="shrink-0 p-4 border-b border-scc-border">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-lg font-semibold text-slate-100">Assistants</h1>
          {isLoading && (
            <div className="w-3 h-3 border-2 border-slate-500 border-t-transparent rounded-full animate-spin" />
          )}
        </div>

        {/* Search */}
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search assistants..."
          className="scc-input w-full text-sm py-2"
        />

        {/* New Assistant Button */}
        <button
          onClick={() => onCreateResource('assistant')}
          className="w-full mt-3 py-2.5 rounded-lg text-sm font-medium bg-scc-primary/20 text-scc-primary border border-scc-primary/30 hover:bg-scc-primary/30 transition-colors flex items-center justify-center gap-2"
        >
          <span>+</span>
          <span>New Assistant</span>
        </button>
      </div>

      {/* Assistant List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {error ? (
          <div className="text-center py-8 text-red-400 text-sm">
            <p>{error}</p>
          </div>
        ) : isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-5 h-5 border-2 border-slate-600 border-t-scc-primary rounded-full animate-spin" />
          </div>
        ) : filteredAssistants.length === 0 ? (
          <div className="text-center py-8 text-slate-500">
            <div className="text-4xl mb-3">🤖</div>
            {searchQuery ? (
              <p className="text-sm">No assistants match your search</p>
            ) : (
              <>
                <p className="text-sm mb-1">No assistants yet</p>
                <p className="text-xs">Create one to get started</p>
              </>
            )}
          </div>
        ) : (
          filteredAssistants.map((assistant) => (
            <AssistantCard
              key={assistant.id}
              assistant={assistant}
              isSelected={selectedResourceId === assistant.id}
              onSelect={() => onSelectResource(assistant.id)}
            />
          ))
        )}
      </div>

      {/* Footer with count */}
      <div className="shrink-0 px-4 py-2 border-t border-scc-border text-xs text-slate-500">
        {assistants.length} assistant{assistants.length !== 1 ? 's' : ''}
      </div>
    </div>
  );
}

/**
 * Compact assistant card
 */
function AssistantCard({
  assistant,
  isSelected,
  onSelect,
}: {
  assistant: CatalogResource;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const statusMeta = STATUS_META[assistant.status];
  const alias = (assistant.metadata?.alias as string) || assistant.key.split('/').pop();

  return (
    <button
      onClick={onSelect}
      className={`
        w-full text-left p-3 rounded-lg transition-all
        ${isSelected
          ? 'bg-scc-primary/20 border border-scc-primary/50'
          : 'hover:bg-scc-elevated border border-transparent'
        }
      `}
    >
      <div className="flex items-center gap-3">
        <div className="text-2xl">🤖</div>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-slate-200 truncate">
            {assistant.name || alias}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs text-slate-500">@{alias}</span>
            <span className={`text-xs px-1.5 py-0.5 rounded ${statusMeta.color}`}>
              {statusMeta.label}
            </span>
          </div>
        </div>
      </div>
      {assistant.description && (
        <p className="text-xs text-slate-500 mt-2 line-clamp-2 pl-11">
          {assistant.description}
        </p>
      )}
    </button>
  );
}
