import { useEffect, useCallback, useState } from 'react';
import { usePlatformStore } from '@/stores/platformStore';
import { platformClient, type CatalogResource } from '@/services/platformClient';

const RESOURCE_TYPES = [
  { value: '', label: 'All Types' },
  { value: 'component', label: 'Components' },
  { value: 'graph', label: 'Graphs' },
  { value: 'assistant', label: 'Assistants' },
  { value: 'executor', label: 'Executors' },
  { value: 'context', label: 'Contexts' },
  { value: 'integration', label: 'Integrations' },
];

const TYPE_COLORS: Record<string, string> = {
  component: 'var(--node-tool)',
  graph: 'var(--node-condition)',
  assistant: 'var(--node-llm)',
  executor: 'var(--node-output)',
  context: 'var(--node-recall)',
  integration: 'var(--node-router)',
};

export function ResourceBrowser() {
  const {
    resources,
    selectedResource,
    resourceFilter,
    isLoadingResources,
    setResources,
    setSelectedResource,
    setResourceFilter,
    setLoadingResources,
    addEvent,
  } = usePlatformStore();

  const [searchQuery, setSearchQuery] = useState('');

  const loadResources = useCallback(async () => {
    setLoadingResources(true);
    try {
      const results = await platformClient.listCatalogResources({
        type: resourceFilter.type,
        status: resourceFilter.status,
        limit: 50,
      });
      setResources(results);
      addEvent({
        type: 'catalog.loaded',
        source: 'catalog',
        message: `Loaded ${results.length} resources from catalog`,
      });
    } catch (error) {
      addEvent({
        type: 'catalog.error',
        source: 'catalog',
        message: `Failed to load resources: ${error}`,
      });
    } finally {
      setLoadingResources(false);
    }
  }, [resourceFilter, setResources, setLoadingResources, addEvent]);

  useEffect(() => {
    loadResources();
  }, [loadResources]);

  // Filter resources by search query
  const filteredResources = resources.filter((r) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      r.name.toLowerCase().includes(query) ||
      r.key.toLowerCase().includes(query) ||
      r.description?.toLowerCase().includes(query)
    );
  });

  return (
    <div className="card p-4 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-text-primary">Resources</h2>
        {isLoadingResources && (
          <div className="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-3">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search..."
          className="input text-sm flex-1"
        />
        <select
          value={resourceFilter.type || ''}
          onChange={(e) => setResourceFilter({ ...resourceFilter, type: e.target.value || undefined })}
          className="input text-sm w-32"
        >
          {RESOURCE_TYPES.map((type) => (
            <option key={type.value} value={type.value}>
              {type.label}
            </option>
          ))}
        </select>
      </div>

      {/* Resource List */}
      <div className="flex-1 overflow-y-auto space-y-1">
        {filteredResources.length === 0 ? (
          <div className="text-center py-8 text-text-muted text-sm">
            {isLoadingResources ? 'Loading...' : 'No resources found'}
          </div>
        ) : (
          filteredResources.map((resource) => (
            <ResourceItem
              key={resource.id}
              resource={resource}
              isSelected={selectedResource?.id === resource.id}
              onSelect={() => setSelectedResource(resource)}
            />
          ))
        )}
      </div>

      {/* Selected Resource Details */}
      {selectedResource && (
        <ResourceDetails
          resource={selectedResource}
          onClose={() => setSelectedResource(null)}
        />
      )}
    </div>
  );
}

function ResourceItem({
  resource,
  isSelected,
  onSelect,
}: {
  resource: CatalogResource;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const color = TYPE_COLORS[resource.type] || 'var(--text-muted)';

  return (
    <button
      onClick={onSelect}
      className={`
        w-full text-left p-2 rounded-md transition-all duration-fast
        ${
          isSelected
            ? 'bg-primary-500/15 border border-primary-500/40'
            : 'hover:bg-surface-highlight border border-transparent'
        }
      `}
    >
      <div className="flex items-center gap-2">
        <span
          className="text-xs px-1.5 py-0.5 rounded font-medium"
          style={{ backgroundColor: `color-mix(in srgb, ${color} 20%, transparent)`, color }}
        >
          {resource.type}
        </span>
        <span className="text-sm font-medium text-text-primary truncate">
          {resource.name}
        </span>
        {resource.isBootstrap && (
          <span className="text-xs text-text-muted">(system)</span>
        )}
      </div>
      <div className="text-xs text-text-muted mt-0.5 truncate">
        {resource.key}
      </div>
    </button>
  );
}

function ResourceDetails({
  resource,
  onClose,
}: {
  resource: CatalogResource;
  onClose: () => void;
}) {
  const color = TYPE_COLORS[resource.type] || 'var(--text-muted)';

  return (
    <div className="mt-3 pt-3 border-t border-border">
      <div className="flex items-center justify-between mb-2">
        <span
          className="text-xs px-1.5 py-0.5 rounded font-medium"
          style={{ backgroundColor: `color-mix(in srgb, ${color} 20%, transparent)`, color }}
        >
          {resource.type}
        </span>
        <button
          onClick={onClose}
          className="text-text-muted hover:text-text-primary transition-colors duration-fast"
        >
          &times;
        </button>
      </div>
      <h3 className="text-sm font-semibold text-text-primary mb-1">
        {resource.name}
      </h3>
      <div className="text-xs text-text-secondary mb-2">{resource.key}</div>
      {resource.description && (
        <p className="text-xs text-text-secondary mb-2">{resource.description}</p>
      )}
      <div className="flex items-center gap-2 text-xs text-text-muted">
        <span
          className={`
            px-1.5 py-0.5 rounded
            ${
              resource.status === 'published'
                ? 'bg-success-muted text-success'
                : resource.status === 'draft'
                ? 'bg-warning-muted text-warning'
                : 'bg-surface-highlight text-text-secondary'
            }
          `}
        >
          {resource.status}
        </span>
        {resource.tags?.map((tag) => (
          <span key={tag} className="bg-surface-highlight px-1.5 py-0.5 rounded">
            {tag}
          </span>
        ))}
      </div>
    </div>
  );
}
