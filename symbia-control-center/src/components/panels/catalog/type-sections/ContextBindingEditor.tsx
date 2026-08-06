/**
 * Context Binding Editor
 *
 * Rich editor for configuring context bindings on assistants.
 * Supports binding to catalog Context resources or dynamic data sources
 * like logs, events, metrics, and custom endpoints.
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { platformClient } from '@/services/platformClient';
import type { CatalogResource } from '@/types/catalog';

// =============================================================================
// Types
// =============================================================================

export type BindingType = 'context' | 'logs' | 'events' | 'catalog' | 'metrics' | 'custom';

export interface ContextBinding {
  id: string;
  /** What type of data source */
  type: BindingType;
  /** For 'context' type: the catalog resource key */
  contextKey: string;
  /** Local alias for referencing in prompts (e.g., @logs, @config) */
  alias: string;
  /** When to refresh the data */
  refresh: string;
  /** Type-specific configuration */
  config?: BindingConfig;
}

export interface BindingConfig {
  // For logs binding
  logs?: {
    source?: string[];
    level?: string[];
    timeRange?: string;
    limit?: number;
    search?: string;
  };
  // For events binding
  events?: {
    types?: string[];
    sources?: string[];
    timeRange?: string;
    limit?: number;
  };
  // For catalog binding (dynamic query)
  catalog?: {
    type?: string;
    prefix?: string;
    limit?: number;
  };
  // For metrics binding
  metrics?: {
    metric?: string;
    timeRange?: string;
    aggregation?: 'sum' | 'avg' | 'min' | 'max' | 'count';
  };
  // For custom binding
  custom?: {
    endpoint?: string;
    method?: 'GET' | 'POST';
    body?: Record<string, unknown>;
  };
}

interface ContextBindingEditorProps {
  bindings: ContextBinding[];
  onChange: (bindings: ContextBinding[]) => void;
}

// =============================================================================
// Constants
// =============================================================================

const BINDING_TYPES: Array<{
  value: BindingType;
  label: string;
  icon: string;
  description: string;
}> = [
  {
    value: 'context',
    label: 'Context Resource',
    icon: '📦',
    description: 'Bind to a catalog Context resource',
  },
  {
    value: 'logs',
    label: 'Logs',
    icon: '📋',
    description: 'Recent log entries from services',
  },
  {
    value: 'events',
    label: 'Events',
    icon: '⚡',
    description: 'System events from the network',
  },
  {
    value: 'catalog',
    label: 'Catalog Query',
    icon: '🗂️',
    description: 'Dynamic query for catalog resources',
  },
  {
    value: 'metrics',
    label: 'Metrics',
    icon: '📊',
    description: 'Performance and usage metrics',
  },
  {
    value: 'custom',
    label: 'Custom Endpoint',
    icon: '🔌',
    description: 'Call a custom API endpoint',
  },
];

const REFRESH_OPTIONS = [
  { value: 'on_start', label: 'On Start', description: 'When conversation begins' },
  { value: 'on_turn', label: 'Each Turn', description: 'Before each response' },
  { value: '60000', label: '1 minute', description: 'Every minute' },
  { value: '300000', label: '5 minutes', description: 'Every 5 minutes' },
  { value: '900000', label: '15 minutes', description: 'Every 15 minutes' },
  { value: 'never', label: 'Never', description: 'Only on demand' },
];

const TIME_RANGE_OPTIONS = [
  { value: '15m', label: '15 minutes' },
  { value: '1h', label: '1 hour' },
  { value: '6h', label: '6 hours' },
  { value: '24h', label: '24 hours' },
  { value: '7d', label: '7 days' },
];

const LOG_LEVELS = ['debug', 'info', 'warn', 'error'];

const AGGREGATION_OPTIONS = [
  { value: 'sum', label: 'Sum' },
  { value: 'avg', label: 'Average' },
  { value: 'min', label: 'Minimum' },
  { value: 'max', label: 'Maximum' },
  { value: 'count', label: 'Count' },
];

// =============================================================================
// Hook: Fetch Context Resources
// =============================================================================

function useContextResources() {
  const [resources, setResources] = useState<CatalogResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function fetchContexts() {
      try {
        setLoading(true);
        const all = await platformClient.listCatalogResources({ type: 'context' });
        if (mounted) {
          setResources(all as CatalogResource[]);
          setError(null);
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Failed to fetch contexts');
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    fetchContexts();
    return () => { mounted = false; };
  }, []);

  return { resources, loading, error };
}

// =============================================================================
// Sub-Components
// =============================================================================

interface ContextPickerProps {
  value: string;
  onChange: (key: string, name?: string) => void;
  resources: CatalogResource[];
  loading: boolean;
}

function ContextPicker({ value, onChange, resources, loading }: ContextPickerProps) {
  const [search, setSearch] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  const filtered = useMemo(() => {
    if (!search) return resources;
    const lower = search.toLowerCase();
    return resources.filter(
      r => r.key.toLowerCase().includes(lower) || r.name.toLowerCase().includes(lower)
    );
  }, [resources, search]);

  const selected = resources.find(r => r.key === value);

  return (
    <div className="relative">
      <div
        className="scc-input flex items-center justify-between cursor-pointer"
        onClick={() => setIsOpen(!isOpen)}
      >
        {selected ? (
          <div className="flex items-center gap-2">
            <span className="text-blue-400">📦</span>
            <span className="text-slate-200">{selected.name}</span>
            <span className="text-slate-500 text-xs font-mono">{selected.key}</span>
          </div>
        ) : (
          <span className="text-slate-500">
            {loading ? 'Loading contexts...' : 'Select a Context resource...'}
          </span>
        )}
        <svg className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {isOpen && (
        <div className="absolute z-50 mt-1 w-full bg-slate-800 border border-slate-600 rounded-lg shadow-xl max-h-64 overflow-hidden">
          <div className="p-2 border-b border-slate-700">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search contexts..."
              className="scc-input text-sm"
              autoFocus
            />
          </div>
          <div className="overflow-y-auto max-h-48">
            {filtered.length === 0 ? (
              <div className="p-3 text-center text-slate-500 text-sm">
                {loading ? 'Loading...' : 'No contexts found'}
              </div>
            ) : (
              filtered.map(r => (
                <button
                  key={r.id}
                  onClick={() => {
                    onChange(r.key, r.name);
                    setIsOpen(false);
                    setSearch('');
                  }}
                  className={`w-full p-3 text-left hover:bg-slate-700 transition-colors flex items-start gap-3 ${
                    r.key === value ? 'bg-slate-700/50' : ''
                  }`}
                >
                  <span className="text-blue-400 mt-0.5">📦</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-slate-200 font-medium">{r.name}</div>
                    <div className="text-slate-500 text-xs font-mono truncate">{r.key}</div>
                    {r.description && (
                      <div className="text-slate-500 text-xs mt-1 truncate">{r.description}</div>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

interface TypeConfigPanelProps {
  type: BindingType;
  config: BindingConfig;
  onChange: (config: BindingConfig) => void;
}

function TypeConfigPanel({ type, config, onChange }: TypeConfigPanelProps) {
  switch (type) {
    case 'logs':
      return (
        <div className="space-y-3 p-3 bg-slate-800/50 rounded-lg">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 block mb-1">Time Range</label>
              <select
                value={config.logs?.timeRange || '1h'}
                onChange={(e) => onChange({
                  ...config,
                  logs: { ...config.logs, timeRange: e.target.value }
                })}
                className="scc-input text-sm"
              >
                {TIME_RANGE_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Limit</label>
              <input
                type="number"
                value={config.logs?.limit || ''}
                onChange={(e) => onChange({
                  ...config,
                  logs: { ...config.logs, limit: parseInt(e.target.value) || undefined }
                })}
                placeholder="50"
                className="scc-input text-sm"
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-400 block mb-1">Log Levels</label>
            <div className="flex gap-2">
              {LOG_LEVELS.map(level => (
                <label key={level} className="flex items-center gap-1 text-sm">
                  <input
                    type="checkbox"
                    checked={config.logs?.level?.includes(level) || false}
                    onChange={(e) => {
                      const current = config.logs?.level || [];
                      const newLevels = e.target.checked
                        ? [...current, level]
                        : current.filter(l => l !== level);
                      onChange({
                        ...config,
                        logs: { ...config.logs, level: newLevels.length ? newLevels : undefined }
                      });
                    }}
                    className="accent-scc-primary"
                  />
                  <span className={`capitalize ${
                    level === 'error' ? 'text-red-400' :
                    level === 'warn' ? 'text-amber-400' :
                    level === 'info' ? 'text-blue-400' : 'text-slate-400'
                  }`}>{level}</span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-400 block mb-1">Search Filter</label>
            <input
              type="text"
              value={config.logs?.search || ''}
              onChange={(e) => onChange({
                ...config,
                logs: { ...config.logs, search: e.target.value || undefined }
              })}
              placeholder="Filter by message content..."
              className="scc-input text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-slate-400 block mb-1">Source Services (comma-separated)</label>
            <input
              type="text"
              value={config.logs?.source?.join(', ') || ''}
              onChange={(e) => {
                const sources = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
                onChange({
                  ...config,
                  logs: { ...config.logs, source: sources.length ? sources : undefined }
                });
              }}
              placeholder="e.g., assistants, runtime, catalog"
              className="scc-input text-sm"
            />
          </div>
        </div>
      );

    case 'events':
      return (
        <div className="space-y-3 p-3 bg-slate-800/50 rounded-lg">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 block mb-1">Time Range</label>
              <select
                value={config.events?.timeRange || '1h'}
                onChange={(e) => onChange({
                  ...config,
                  events: { ...config.events, timeRange: e.target.value }
                })}
                className="scc-input text-sm"
              >
                {TIME_RANGE_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Limit</label>
              <input
                type="number"
                value={config.events?.limit || ''}
                onChange={(e) => onChange({
                  ...config,
                  events: { ...config.events, limit: parseInt(e.target.value) || undefined }
                })}
                placeholder="50"
                className="scc-input text-sm"
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-400 block mb-1">Event Types (comma-separated)</label>
            <input
              type="text"
              value={config.events?.types?.join(', ') || ''}
              onChange={(e) => {
                const types = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
                onChange({
                  ...config,
                  events: { ...config.events, types: types.length ? types : undefined }
                });
              }}
              placeholder="e.g., assistant.routed, graph.executed"
              className="scc-input text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-slate-400 block mb-1">Source Services (comma-separated)</label>
            <input
              type="text"
              value={config.events?.sources?.join(', ') || ''}
              onChange={(e) => {
                const sources = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
                onChange({
                  ...config,
                  events: { ...config.events, sources: sources.length ? sources : undefined }
                });
              }}
              placeholder="e.g., assistants, runtime"
              className="scc-input text-sm"
            />
          </div>
        </div>
      );

    case 'catalog':
      return (
        <div className="space-y-3 p-3 bg-slate-800/50 rounded-lg">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 block mb-1">Resource Type</label>
              <select
                value={config.catalog?.type || ''}
                onChange={(e) => onChange({
                  ...config,
                  catalog: { ...config.catalog, type: e.target.value || undefined }
                })}
                className="scc-input text-sm"
              >
                <option value="">All types</option>
                <option value="assistant">Assistants</option>
                <option value="graph">Graphs</option>
                <option value="context">Contexts</option>
                <option value="component">Components</option>
                <option value="integration">Integrations</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Limit</label>
              <input
                type="number"
                value={config.catalog?.limit || ''}
                onChange={(e) => onChange({
                  ...config,
                  catalog: { ...config.catalog, limit: parseInt(e.target.value) || undefined }
                })}
                placeholder="50"
                className="scc-input text-sm"
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-400 block mb-1">Key Prefix Filter</label>
            <input
              type="text"
              value={config.catalog?.prefix || ''}
              onChange={(e) => onChange({
                ...config,
                catalog: { ...config.catalog, prefix: e.target.value || undefined }
              })}
              placeholder="e.g., org/assistants/"
              className="scc-input text-sm"
            />
          </div>
        </div>
      );

    case 'metrics':
      return (
        <div className="space-y-3 p-3 bg-slate-800/50 rounded-lg">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 block mb-1">Metric Name</label>
              <input
                type="text"
                value={config.metrics?.metric || ''}
                onChange={(e) => onChange({
                  ...config,
                  metrics: { ...config.metrics, metric: e.target.value || undefined }
                })}
                placeholder="e.g., llm.tokens.total"
                className="scc-input text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Aggregation</label>
              <select
                value={config.metrics?.aggregation || 'sum'}
                onChange={(e) => onChange({
                  ...config,
                  metrics: { ...config.metrics, aggregation: e.target.value as 'sum' | 'avg' | 'min' | 'max' | 'count' }
                })}
                className="scc-input text-sm"
              >
                {AGGREGATION_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-400 block mb-1">Time Range</label>
            <select
              value={config.metrics?.timeRange || '1h'}
              onChange={(e) => onChange({
                ...config,
                metrics: { ...config.metrics, timeRange: e.target.value }
              })}
              className="scc-input text-sm"
            >
              {TIME_RANGE_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>
      );

    case 'custom':
      return (
        <div className="space-y-3 p-3 bg-slate-800/50 rounded-lg">
          <div className="grid grid-cols-4 gap-3">
            <div>
              <label className="text-xs text-slate-400 block mb-1">Method</label>
              <select
                value={config.custom?.method || 'GET'}
                onChange={(e) => onChange({
                  ...config,
                  custom: { ...config.custom, method: e.target.value as 'GET' | 'POST' }
                })}
                className="scc-input text-sm"
              >
                <option value="GET">GET</option>
                <option value="POST">POST</option>
              </select>
            </div>
            <div className="col-span-3">
              <label className="text-xs text-slate-400 block mb-1">Endpoint URL</label>
              <input
                type="text"
                value={config.custom?.endpoint || ''}
                onChange={(e) => onChange({
                  ...config,
                  custom: { ...config.custom, endpoint: e.target.value || undefined }
                })}
                placeholder="https://api.example.com/data"
                className="scc-input text-sm font-mono"
              />
            </div>
          </div>
          {config.custom?.method === 'POST' && (
            <div>
              <label className="text-xs text-slate-400 block mb-1">Request Body (JSON)</label>
              <textarea
                value={config.custom?.body ? JSON.stringify(config.custom.body, null, 2) : ''}
                onChange={(e) => {
                  try {
                    const body = e.target.value ? JSON.parse(e.target.value) : undefined;
                    onChange({
                      ...config,
                      custom: { ...config.custom, body }
                    });
                  } catch {
                    // Invalid JSON, ignore
                  }
                }}
                placeholder='{"key": "value"}'
                className="scc-input text-sm font-mono min-h-[60px]"
              />
            </div>
          )}
        </div>
      );

    default:
      return null;
  }
}

// =============================================================================
// Single Binding Row
// =============================================================================

interface BindingRowProps {
  binding: ContextBinding;
  onChange: (binding: ContextBinding) => void;
  onRemove: () => void;
  contextResources: CatalogResource[];
  contextLoading: boolean;
  isExpanded: boolean;
  onToggleExpand: () => void;
}

function BindingRow({
  binding,
  onChange,
  onRemove,
  contextResources,
  contextLoading,
  isExpanded,
  onToggleExpand,
}: BindingRowProps) {
  const typeInfo = BINDING_TYPES.find(t => t.value === binding.type) || BINDING_TYPES[0];

  return (
    <div className="scc-card border-slate-700 overflow-hidden">
      {/* Header Row */}
      <div className="p-3 flex items-center gap-3">
        <button
          onClick={onToggleExpand}
          className="text-slate-400 hover:text-slate-200 transition-colors"
        >
          <svg
            className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>

        <span className="text-xl">{typeInfo.icon}</span>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-slate-200 font-medium truncate">
              {binding.alias ? `@${binding.alias}` : '(no alias)'}
            </span>
            <span className="text-slate-500 text-xs px-2 py-0.5 bg-slate-700/50 rounded">
              {typeInfo.label}
            </span>
          </div>
          {binding.contextKey && (
            <div className="text-slate-500 text-xs font-mono truncate mt-0.5">
              {binding.contextKey}
            </div>
          )}
        </div>

        <select
          value={binding.refresh}
          onChange={(e) => onChange({ ...binding, refresh: e.target.value })}
          className="scc-input text-sm w-32"
          onClick={(e) => e.stopPropagation()}
        >
          {REFRESH_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>

        <button
          onClick={onRemove}
          className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-400/10 rounded transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>

      {/* Expanded Config */}
      {isExpanded && (
        <div className="px-3 pb-3 pt-0 space-y-4 border-t border-slate-700/50">
          {/* Type Selection */}
          <div className="pt-3">
            <label className="text-xs text-slate-400 block mb-2">Binding Type</label>
            <div className="grid grid-cols-3 gap-2">
              {BINDING_TYPES.map(t => (
                <button
                  key={t.value}
                  onClick={() => onChange({
                    ...binding,
                    type: t.value,
                    contextKey: t.value === 'context' ? binding.contextKey : '',
                    config: {},
                  })}
                  className={`p-2 rounded-lg border text-left transition-all ${
                    binding.type === t.value
                      ? 'border-scc-primary bg-scc-primary/10'
                      : 'border-slate-700 hover:border-slate-600'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span>{t.icon}</span>
                    <span className="text-sm text-slate-200">{t.label}</span>
                  </div>
                  <div className="text-xs text-slate-500 mt-1">{t.description}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Context Picker (for context type) */}
          {binding.type === 'context' && (
            <div>
              <label className="text-xs text-slate-400 block mb-2">Context Resource</label>
              <ContextPicker
                value={binding.contextKey}
                onChange={(key, name) => onChange({
                  ...binding,
                  contextKey: key,
                  alias: binding.alias || name?.toLowerCase().replace(/\s+/g, '-') || '',
                })}
                resources={contextResources}
                loading={contextLoading}
              />
            </div>
          )}

          {/* Alias Input */}
          <div>
            <label className="text-xs text-slate-400 block mb-2">
              Local Alias
              <span className="text-slate-600 ml-2">How to reference this data in prompts</span>
            </label>
            <div className="flex items-center gap-2">
              <span className="text-slate-500">@</span>
              <input
                type="text"
                value={binding.alias}
                onChange={(e) => onChange({ ...binding, alias: e.target.value })}
                placeholder="e.g., logs, config, events"
                className="scc-input text-sm flex-1"
              />
            </div>
          </div>

          {/* Type-specific Config */}
          {binding.type !== 'context' && (
            <div>
              <label className="text-xs text-slate-400 block mb-2">Configuration</label>
              <TypeConfigPanel
                type={binding.type}
                config={binding.config || {}}
                onChange={(config) => onChange({ ...binding, config })}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function ContextBindingEditor({ bindings, onChange }: ContextBindingEditorProps) {
  const { resources, loading } = useContextResources();
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const toggleExpanded = useCallback((id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const addBinding = useCallback(() => {
    const newId = `binding-${Date.now()}`;
    const newBinding: ContextBinding = {
      id: newId,
      type: 'context',
      contextKey: '',
      alias: '',
      refresh: 'on_start',
    };
    onChange([...bindings, newBinding]);
    setExpandedIds(prev => new Set(prev).add(newId));
  }, [bindings, onChange]);

  const updateBinding = useCallback((id: string, updated: ContextBinding) => {
    onChange(bindings.map(b => b.id === id ? updated : b));
  }, [bindings, onChange]);

  const removeBinding = useCallback((id: string) => {
    onChange(bindings.filter(b => b.id !== id));
    setExpandedIds(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, [bindings, onChange]);

  return (
    <div className="space-y-3">
      {bindings.length === 0 ? (
        <div className="scc-card p-6 border-dashed text-center">
          <div className="text-4xl mb-3">📦</div>
          <p className="text-slate-300 font-medium mb-1">No context bindings configured</p>
          <p className="text-slate-500 text-sm mb-4">
            Bind data sources to provide context during assistant execution.
          </p>
          <button onClick={addBinding} className="scc-button-primary text-sm">
            + Add Context Binding
          </button>
        </div>
      ) : (
        <>
          {bindings.map(binding => (
            <BindingRow
              key={binding.id}
              binding={binding}
              onChange={(updated) => updateBinding(binding.id, updated)}
              onRemove={() => removeBinding(binding.id)}
              contextResources={resources}
              contextLoading={loading}
              isExpanded={expandedIds.has(binding.id)}
              onToggleExpand={() => toggleExpanded(binding.id)}
            />
          ))}
        </>
      )}
    </div>
  );
}
