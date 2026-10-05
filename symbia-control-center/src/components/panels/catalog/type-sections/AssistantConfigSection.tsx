/**
 * Assistant Configuration Section
 *
 * Editor for assistant-specific configuration including behavior routines,
 * identity, LLM settings, capabilities, and context bindings.
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import type { CatalogResource, AssistantResource } from '@/types/catalog';
import { TagEditor } from '../shared/TagEditor';
import { RoutineEditor, type Routine } from './RoutineEditor';
import { RoutineFlowPreview } from './RoutineFlowPreview';
import { getDefaultRoutines, hasCustomRoutines } from './defaultRoutines';
import { getServiceUrl } from '@/config/services';
import { useAuthStore } from '@/stores/authStore';
import { ContextBindingEditor, type ContextBinding } from './ContextBindingEditor';

interface AssistantConfigSectionProps {
  resource: CatalogResource;
  onUpdate: (updates: Partial<CatalogResource>) => void;
  onUpdateMetadata: (metadata: Record<string, unknown>) => void;
}

/**
 * The model list comes from the MODELS SERVICE REGISTRY — one list, local
 * and remote, which is the 12 Aug ruling (the models service handles model
 * selection; only something holding the registry can know what is legal).
 *
 * Until 15 Aug this section read integrations `/capabilities` instead,
 * which lists REMOTE providers with credentials — so a local model served
 * by this very platform could not be configured onto an assistant, found
 * by Brian creating one in the console. The registry answers the dialog's
 * actual questions: `brokered` (can this platform execute it), availability
 * WITH its reason (never inferred), and for local models the digest — the
 * bytes the assistant would actually run on.
 */
interface RegistryEntry {
  id: string;
  symbia: {
    source: 'local' | 'remote';
    provider: string;
    brokered: boolean;
    availability: 'available' | 'standby' | 'unavailable' | 'unknown';
    availabilityReason: string;
    digest?: string;
  };
  capabilities?: string[];
}

function useModelRegistry() {
  const token = useAuthStore((s) => s.token);
  const [entries, setEntries] = useState<RegistryEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    // Session-cookie sessions work too: a same-origin fetch carries cookies.
    fetch(`${getServiceUrl('models')}/api/models`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`models service returned ${res.status}`);
        const body = (await res.json()) as { data: RegistryEntry[] };
        if (!cancelled) { setEntries(body.data); setError(null); }
      })
      .catch((err) => {
        // The failure is content (confident-zero rule): entries stays null
        // and the selects say the registry could not be read, rather than
        // rendering an empty-but-plausible list.
        if (!cancelled) { setEntries(null); setError(err instanceof Error ? err.message : String(err)); }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token]);

  return { entries, loading, error };
}

function useProviders() {
  const { entries, loading, error } = useModelRegistry();
  const providers = useMemo(() => {
    if (!entries) return [];
    const byProvider = new Map<string, RegistryEntry[]>();
    for (const e of entries) {
      const list = byProvider.get(e.symbia.provider) ?? [];
      list.push(e);
      byProvider.set(e.symbia.provider, list);
    }
    return [...byProvider.entries()].map(([value, list]) => {
      const local = list.some((e) => e.symbia.source === 'local');
      return {
        value,
        label: local ? `${value} (local)` : value,
        description: local
          ? `${list.length} model(s) served by this platform`
          : `${list.length} model(s) via the ${value} adapter`,
        // "Selectable" means the platform can execute it — `brokered` from
        // the registry, not a credential guess made in the console.
        brokered: list.some((e) => e.symbia.brokered),
      };
    });
  }, [entries]);
  return { providers, loading, error };
}

function useProviderModels(provider: string | undefined) {
  const { entries, loading, error } = useModelRegistry();
  const chatModels = useMemo(() => {
    if (!entries || !provider) return [];
    return entries
      .filter((e) => e.symbia.provider === provider)
      // Capabilities are recorded for local models; an absent list on a
      // remote entry is "not stated", not "cannot chat".
      .filter((e) => !e.capabilities || e.capabilities.includes('chat') || e.capabilities.includes('reasoning'))
      .map((e) => {
        // Remote registry ids are provider-prefixed (`openai/gpt-4o`); the
        // assistant's llm config stores the bare model id beside `provider`.
        const bare = e.id.startsWith(`${provider}/`) ? e.id.slice(provider.length + 1) : e.id;
        const digestNote = e.symbia.digest ? ` · ${e.symbia.digest.slice(0, 19)}…` : '';
        const availNote = e.symbia.availability === 'available' ? '' : ` (${e.symbia.availability})`;
        return {
          id: bare,
          name: `${bare}${availNote}`,
          description: `${e.symbia.availabilityReason}${digestNote}`,
        };
      });
  }, [entries, provider]);
  return { chatModels, loading, error };
}

// LLM Configuration presets with their default values
const LLM_PRESETS = [
  {
    value: 'conversational',
    label: 'Conversational',
    description: 'Balanced for general chat and assistance',
    icon: '💬',
    defaults: {
      provider: 'openai',
      model: 'gpt-4o',
      temperature: 0.7,
      maxTokens: 2048,
    },
  },
  {
    value: 'routing',
    label: 'Routing',
    description: 'Fast, efficient for coordinator routing decisions',
    icon: '🔀',
    defaults: {
      provider: 'openai',
      model: 'gpt-4o-mini',
      temperature: 0.1,
      maxTokens: 100,
    },
  },
  {
    value: 'code',
    label: 'Code',
    description: 'Precise, accurate for code generation and analysis',
    icon: '💻',
    defaults: {
      provider: 'openai',
      model: 'gpt-4o',
      temperature: 0.2,
      maxTokens: 4096,
    },
  },
  {
    value: 'reasoning',
    label: 'Reasoning',
    description: 'Deep thinking with o-series models for complex analysis',
    icon: '🧠',
    defaults: {
      provider: 'openai',
      model: 'o4-mini',
      temperature: 1, // o-series requires temp=1
      maxTokens: 16000,
      reasoningEffort: 'medium' as const,
    },
  },
];

// Reasoning effort levels (for o-series models)
const REASONING_EFFORT_OPTIONS = [
  { value: 'none', label: 'None', description: 'No extended thinking' },
  { value: 'low', label: 'Low', description: 'Quick reasoning' },
  { value: 'medium', label: 'Medium', description: 'Balanced (recommended)' },
  { value: 'high', label: 'High', description: 'Thorough analysis' },
  { value: 'xhigh', label: 'Maximum', description: 'Deepest reasoning (o3-pro only)' },
];

// Note: ContextBinding type is now imported from ContextBindingEditor

export function AssistantConfigSection({
  resource,
  onUpdate: _onUpdate,
  onUpdateMetadata,
}: AssistantConfigSectionProps) {
  const assistantResource = resource as AssistantResource;
  const metadata = assistantResource.metadata || {};

  // LLM Config
  const llmConfig = (metadata.llm || {}) as {
    provider?: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
    systemPrompt?: string;
    preset?: string;
    reasoningEffort?: 'none' | 'low' | 'medium' | 'high' | 'xhigh';
  };

  // Track whether to show advanced options
  const [showAdvancedLLM, setShowAdvancedLLM] = useState(false);

  // Check if selected model is an o-series (reasoning) model
  const isReasoningModel = useMemo(() => {
    const model = llmConfig.model || '';
    return model.startsWith('o1') || model.startsWith('o3') || model.startsWith('o4');
  }, [llmConfig.model]);

  // Capabilities
  const capabilities = (metadata.capabilities || []) as string[];

  // Routines (behavior) - use defaults if none defined
  const alias = (metadata.alias as string) || resource.key.split('/').pop() || '';
  const storedRoutines = (metadata.routines || []) as Routine[];
  const defaultRoutines = getDefaultRoutines(alias);

  // Auto-populate with defaults if no custom routines
  const [hasLoadedDefaults, setHasLoadedDefaults] = useState(false);

  useEffect(() => {
    // Only auto-populate once, and only if there are defaults available
    if (!hasLoadedDefaults && storedRoutines.length === 0 && defaultRoutines.length > 0) {
      onUpdateMetadata({
        ...metadata,
        routines: defaultRoutines,
      });
      setHasLoadedDefaults(true);
    }
  }, [hasLoadedDefaults, storedRoutines.length, defaultRoutines, metadata, onUpdateMetadata]);

  // Use stored routines if available, otherwise show defaults
  const routines = storedRoutines.length > 0 ? storedRoutines : defaultRoutines;
  const isUsingDefaults = !hasCustomRoutines(routines, alias);

  // Update routines
  const updateRoutines = useCallback((newRoutines: Routine[]) => {
    onUpdateMetadata({
      ...metadata,
      routines: newRoutines,
    });
  }, [metadata, onUpdateMetadata]);

  // Reset to defaults
  const resetToDefaults = useCallback(() => {
    if (defaultRoutines.length > 0) {
      onUpdateMetadata({
        ...metadata,
        routines: defaultRoutines,
      });
    }
  }, [defaultRoutines, metadata, onUpdateMetadata]);

  // Flow preview collapse state
  const [showFlowPreview, setShowFlowPreview] = useState(true);

  // Context bindings
  const [bindings, setBindings] = useState<ContextBinding[]>(() => {
    const storedBindings = (metadata.contextBindings || []) as unknown as Array<{
      type?: string;
      contextKey?: string;
      alias?: string;
      refresh?: string;
      config?: Record<string, unknown>;
    }>;
    return storedBindings.map((b, i) => ({
      id: `binding-${i}`,
      type: (b.type as ContextBinding['type']) || 'context',
      contextKey: b.contextKey || '',
      alias: b.alias || '',
      refresh: b.refresh || 'on_start',
      config: b.config,
    }));
  });

  // Update LLM config - uses current resource metadata directly to avoid stale closure
  const updateLlmConfig = useCallback((updates: Partial<typeof llmConfig>) => {
    // Get fresh metadata from the resource to avoid stale closure issues
    const currentMetadata = (resource as AssistantResource).metadata || {};
    const currentLlmConfig = (currentMetadata.llm || {}) as typeof llmConfig;

    const newLlmConfig = { ...currentLlmConfig, ...updates };
    console.log('[AssistantConfig] updateLlmConfig:', { currentLlmConfig, updates, newLlmConfig });

    onUpdateMetadata({
      ...currentMetadata,
      llm: newLlmConfig,
    });
  }, [resource, onUpdateMetadata]);

  // Update capabilities
  const updateCapabilities = useCallback((caps: string[]) => {
    onUpdateMetadata({
      ...metadata,
      capabilities: caps,
    });
  }, [metadata, onUpdateMetadata]);

  // Update context bindings
  const updateBindings = useCallback((newBindings: ContextBinding[]) => {
    setBindings(newBindings);
    onUpdateMetadata({
      ...metadata,
      contextBindings: newBindings.map(b => ({
        type: b.type,
        contextKey: b.contextKey,
        alias: b.alias,
        refresh: b.refresh,
        config: b.config,
      })),
    });
  }, [metadata, onUpdateMetadata]);

  // Note: addBinding and removeBinding are now handled by ContextBindingEditor

  // Get providers and models from capabilities (SOR)
  const { providers, loading: providersLoading } = useProviders();
  const { chatModels, loading: modelsLoading } = useProviderModels(llmConfig.provider);

  // Get the selected provider's info for display
  const selectedProvider = useMemo(() =>
    providers.find(p => p.value === llmConfig.provider),
    [providers, llmConfig.provider]
  );

  return (
    <div className="space-y-8">
      {/* Behavior / Routines Section */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-slate-300 uppercase tracking-wider">
            Behavior
          </h3>
          {defaultRoutines.length > 0 && !isUsingDefaults && (
            <button
              onClick={resetToDefaults}
              className="text-xs text-slate-500 hover:text-scc-primary transition-colors"
            >
              Reset to defaults
            </button>
          )}
        </div>

        {/* Flow Preview - Collapsible */}
        {routines.length > 0 && routines.some(r => r.steps.length > 0) && (
          <div className="space-y-2">
            <button
              onClick={() => setShowFlowPreview(!showFlowPreview)}
              className="flex items-center gap-2 text-xs text-slate-400 hover:text-slate-300 transition-colors"
            >
              <span className={`transition-transform ${showFlowPreview ? 'rotate-90' : ''}`}>▶</span>
              <span>Flow Preview</span>
              <span className="text-slate-600">
                ({routines.reduce((sum, r) => sum + r.steps.length, 0)} steps across {routines.length} routine{routines.length !== 1 ? 's' : ''})
              </span>
            </button>
            {showFlowPreview && (
              <RoutineFlowPreview routines={routines} />
            )}
          </div>
        )}

        {/* Helpful guidance */}
        <div className="scc-card p-4 bg-scc-primary/5 border-scc-primary/20">
          <div className="flex items-start gap-3">
            <span className="text-xl">💡</span>
            <div className="space-y-2 text-sm">
              <p className="text-slate-300">
                <strong>Define what @{alias || 'this assistant'} does</strong> using plain English steps.
              </p>
              <div className="text-slate-500 space-y-1">
                <p>• <strong>Say</strong> to respond to the user • <strong>Ask</strong> to request information</p>
                <p>• <strong>Think</strong> to reason privately • <strong>Check</strong> to make decisions</p>
                <p>• <strong>Recall</strong> @context to fetch data • <strong>Remember</strong> to store results</p>
                <p>• <strong>Run</strong> to call sub-routines • <strong>Wait</strong> for timing</p>
              </div>
              {isUsingDefaults && defaultRoutines.length > 0 && (
                <p className="text-scc-primary/80 text-xs mt-2">
                  ✨ Pre-configured with suggested routines. Customize as needed.
                </p>
              )}
            </div>
          </div>
        </div>

        <RoutineEditor routines={routines} onChange={updateRoutines} />
      </section>

      {/* Identity Section */}
      <section className="space-y-4">
        <h3 className="text-sm font-medium text-slate-300 uppercase tracking-wider">
          Identity
        </h3>
        <div>
          <label className="scc-label">Alias</label>
          <div className="flex items-center">
            <span className="text-slate-500 mr-1">@</span>
            <input
              type="text"
              value={alias}
              onChange={(e) => onUpdateMetadata({ ...metadata, alias: e.target.value })}
              placeholder="assistant-name"
              className="scc-input flex-1 max-w-xs"
            />
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Used for @mentions in chat (e.g., "@{alias} help me analyze logs")
          </p>
        </div>
      </section>

      {/* LLM Configuration */}
      <section className="space-y-4">
        <h3 className="text-sm font-medium text-slate-300 uppercase tracking-wider">
          LLM Configuration
        </h3>
        <p className="text-xs text-slate-500">
          Configure which AI provider and model powers this assistant's reasoning, responses, and decisions.
        </p>

        {/* Preset Selector */}
        <div className="space-y-2">
          <label className="scc-label">Configuration Preset</label>
          <div className="grid grid-cols-4 gap-2">
            {LLM_PRESETS.map(preset => (
              <button
                key={preset.value}
                onClick={() => {
                  // Apply preset with all its defaults explicitly
                  const presetConfig = {
                    preset: preset.value,
                    provider: preset.defaults.provider,
                    model: preset.defaults.model,
                    temperature: preset.defaults.temperature,
                    maxTokens: preset.defaults.maxTokens,
                    ...(preset.defaults.reasoningEffort ? { reasoningEffort: preset.defaults.reasoningEffort } : {}),
                  };
                  console.log('[AssistantConfig] Applying preset:', preset.value, presetConfig);
                  updateLlmConfig(presetConfig);
                }}
                className={`scc-card p-3 text-center transition-all hover:border-scc-primary/50 ${
                  llmConfig.preset === preset.value
                    ? 'border-scc-primary bg-scc-primary/10'
                    : 'border-slate-700'
                }`}
              >
                <div className="text-2xl mb-1">{preset.icon}</div>
                <div className="text-sm font-medium text-slate-200">{preset.label}</div>
                <div className="text-xs text-slate-500 mt-1">{preset.description}</div>
              </button>
            ))}
          </div>
          <p className="text-xs text-slate-500">
            Presets configure optimal defaults for different use cases. You can customize below.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="scc-label">Provider</label>
            <select
              value={llmConfig.provider || ''}
              onChange={(e) => updateLlmConfig({ provider: e.target.value, model: '' })}
              className="scc-input"
              disabled={providersLoading}
            >
              <option value="">
                {providersLoading ? 'Loading providers...' : 'Select provider'}
              </option>
              {providers.map(p => (
                <option
                  key={p.value}
                  value={p.value}
                  disabled={!p.brokered}
                >
                  {p.label} {!p.brokered && '(not brokered)'}
                </option>
              ))}
            </select>
            {selectedProvider && (
              <p className="text-xs text-slate-500 mt-1">
                {selectedProvider.description}
              </p>
            )}
          </div>
          <div>
            <label className="scc-label">Model</label>
            <select
              value={llmConfig.model || ''}
              onChange={(e) => updateLlmConfig({ model: e.target.value })}
              className="scc-input"
              disabled={!llmConfig.provider || modelsLoading}
            >
              <option value="">
                {modelsLoading ? 'Loading models...' : 'Select model'}
              </option>
              {chatModels.map(m => (
                <option key={m.id} value={m.id} title={m.description}>
                  {m.name}
                </option>
              ))}
            </select>
            {llmConfig.model && chatModels.length > 0 && (
              <p className="text-xs text-slate-500 mt-1">
                {chatModels.find(m => m.id === llmConfig.model)?.description || ''}
              </p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="scc-label">
              Temperature: {llmConfig.temperature?.toFixed(2) || '0.70'}
              {isReasoningModel && <span className="text-amber-500 ml-2">(locked at 1.0 for o-series)</span>}
            </label>
            <input
              type="range"
              min="0"
              max="2"
              step="0.05"
              value={isReasoningModel ? 1 : (llmConfig.temperature ?? 0.7)}
              onChange={(e) => updateLlmConfig({ temperature: parseFloat(e.target.value) })}
              className="w-full accent-scc-primary"
              disabled={isReasoningModel}
            />
            <div className="flex justify-between text-xs text-slate-500">
              <span>Precise</span>
              <span>Creative</span>
            </div>
          </div>
          <div>
            <label className="scc-label">Max Tokens</label>
            <input
              type="number"
              value={llmConfig.maxTokens || ''}
              onChange={(e) => updateLlmConfig({ maxTokens: parseInt(e.target.value) || undefined })}
              placeholder="4096"
              className="scc-input"
            />
          </div>
        </div>

        {/* Reasoning Effort - Only show for o-series models */}
        {isReasoningModel && (
          <div className="scc-card p-4 bg-purple-500/5 border-purple-500/20">
            <label className="scc-label flex items-center gap-2">
              <span className="text-lg">🧠</span>
              Reasoning Effort
            </label>
            <div className="grid grid-cols-5 gap-2 mt-2">
              {REASONING_EFFORT_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => updateLlmConfig({ reasoningEffort: opt.value as typeof llmConfig.reasoningEffort })}
                  disabled={opt.value === 'xhigh' && !llmConfig.model?.includes('o3-pro')}
                  className={`scc-card p-2 text-center text-sm transition-all ${
                    llmConfig.reasoningEffort === opt.value
                      ? 'border-purple-500 bg-purple-500/10'
                      : 'border-slate-700 hover:border-purple-500/50'
                  } ${opt.value === 'xhigh' && !llmConfig.model?.includes('o3-pro') ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <div className="font-medium text-slate-200">{opt.label}</div>
                  <div className="text-xs text-slate-500">{opt.description}</div>
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-500 mt-2">
              Higher effort = more compute time but better reasoning. Medium is recommended for most tasks.
            </p>
          </div>
        )}

        <div>
          <label className="scc-label">System Prompt</label>
          <textarea
            value={llmConfig.systemPrompt || ''}
            onChange={(e) => updateLlmConfig({ systemPrompt: e.target.value })}
            placeholder="You are a helpful assistant that specializes in..."
            className="scc-input min-h-[80px] resize-y"
            rows={3}
          />
          <p className="text-xs text-slate-500 mt-1">
            Base instructions that shape the assistant's personality and behavior across all interactions.
          </p>
        </div>

        {/* Advanced Options Toggle */}
        <div className="pt-2">
          <button
            onClick={() => setShowAdvancedLLM(!showAdvancedLLM)}
            className="flex items-center gap-2 text-sm text-slate-400 hover:text-slate-300 transition-colors"
          >
            <span className={`transition-transform ${showAdvancedLLM ? 'rotate-90' : ''}`}>▶</span>
            <span>Advanced Options</span>
          </button>

          {showAdvancedLLM && (
            <div className="mt-4 space-y-4 pl-4 border-l border-slate-700">
              {/* Routing Configuration (for coordinator-type assistants) */}
              {llmConfig.preset === 'routing' && (
                <div className="space-y-3">
                  <h4 className="text-xs font-medium text-slate-400 uppercase">Routing Strategy</h4>
                  <div className="grid grid-cols-3 gap-2">
                    {['embedding', 'llm', 'hybrid'].map(strategy => (
                      <button
                        key={strategy}
                        onClick={() => onUpdateMetadata({
                          ...metadata,
                          llm: { ...llmConfig, routing: { ...(llmConfig as any).routing, strategy } }
                        })}
                        className={`scc-card p-2 text-center text-sm ${
                          ((llmConfig as any).routing?.strategy || 'hybrid') === strategy
                            ? 'border-scc-primary bg-scc-primary/10'
                            : 'border-slate-700'
                        }`}
                      >
                        <div className="font-medium capitalize">{strategy}</div>
                        <div className="text-xs text-slate-500">
                          {strategy === 'embedding' && 'Fast (~50ms)'}
                          {strategy === 'llm' && 'Accurate (~500ms)'}
                          {strategy === 'hybrid' && 'Best of both'}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Embedding Configuration */}
              <div className="space-y-3">
                <h4 className="text-xs font-medium text-slate-400 uppercase">Embedding Model</h4>
                <div className="grid grid-cols-2 gap-3">
                  <select
                    value={(llmConfig as any).embedding?.model || 'text-embedding-3-small'}
                    onChange={(e) => onUpdateMetadata({
                      ...metadata,
                      llm: {
                        ...llmConfig,
                        embedding: { ...(llmConfig as any).embedding, model: e.target.value }
                      }
                    })}
                    className="scc-input text-sm"
                  >
                    <option value="text-embedding-3-small">text-embedding-3-small (fast)</option>
                    <option value="text-embedding-3-large">text-embedding-3-large (accurate)</option>
                    <option value="text-embedding-ada-002">text-embedding-ada-002 (legacy)</option>
                  </select>
                  <input
                    type="number"
                    value={(llmConfig as any).embedding?.dimensions || ''}
                    onChange={(e) => onUpdateMetadata({
                      ...metadata,
                      llm: {
                        ...llmConfig,
                        embedding: { ...(llmConfig as any).embedding, dimensions: parseInt(e.target.value) || undefined }
                      }
                    })}
                    placeholder="Dimensions (512, 1536...)"
                    className="scc-input text-sm"
                  />
                </div>
                <p className="text-xs text-slate-500">
                  Lower dimensions = faster but less accurate. 512 is good for routing, 1536+ for semantic search.
                </p>
              </div>

              {/* Reliability Settings */}
              <div className="space-y-3">
                <h4 className="text-xs font-medium text-slate-400 uppercase">Reliability</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-slate-500">Timeout (ms)</label>
                    <input
                      type="number"
                      value={(llmConfig as any).reliability?.timeoutMs || ''}
                      onChange={(e) => onUpdateMetadata({
                        ...metadata,
                        llm: {
                          ...llmConfig,
                          reliability: { ...(llmConfig as any).reliability, timeoutMs: parseInt(e.target.value) || undefined }
                        }
                      })}
                      placeholder="45000"
                      className="scc-input text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500">Max Retries</label>
                    <input
                      type="number"
                      value={(llmConfig as any).reliability?.retry?.maxRetries || ''}
                      onChange={(e) => onUpdateMetadata({
                        ...metadata,
                        llm: {
                          ...llmConfig,
                          reliability: {
                            ...(llmConfig as any).reliability,
                            retry: { ...(llmConfig as any).reliability?.retry, maxRetries: parseInt(e.target.value) || undefined }
                          }
                        }
                      })}
                      placeholder="3"
                      className="scc-input text-sm"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Capabilities */}
      <section className="space-y-4">
        <h3 className="text-sm font-medium text-slate-300 uppercase tracking-wider">
          Capabilities
        </h3>
        <TagEditor
          tags={capabilities}
          onChange={updateCapabilities}
          placeholder="Add capability (e.g., llm.chat, logging.query)..."
        />
        <p className="text-xs text-slate-500">
          Define what this assistant can do. Common capabilities: llm.chat, llm.embed, logging.query, webhook.call
        </p>
      </section>

      {/* Context Bindings */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-slate-300 uppercase tracking-wider">
            Context Bindings
          </h3>
        </div>
        <p className="text-xs text-slate-500">
          Bind data sources to provide context during execution. Use @aliases to reference bound data in prompts and routines.
        </p>
        <ContextBindingEditor
          bindings={bindings}
          onChange={updateBindings}
        />
      </section>
    </div>
  );
}
