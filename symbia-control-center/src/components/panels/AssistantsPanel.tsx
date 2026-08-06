/**
 * Assistants Panel
 *
 * Card-based view of AI assistants organized by category tags.
 * Click a card to edit routines, or add new assistants.
 */
import { useEffect, useCallback, useState, useMemo } from 'react';
import { assistantsClient } from '@/services/assistantsClient';
import { useCatalogEditorStore } from '@/stores/catalogEditorStore';
import { ResourceEditor } from './catalog';
import type { CatalogResource, ResourceType, ResourceStatus } from '@/types/catalog';

// Category definitions for grouping assistants
const CATEGORY_CONFIG: Record<string, {
  label: string;
  description: string;
  color: string;
  priority: number;
  matchTags: string[];
}> = {
  tutorial: {
    label: 'Tutorial Curriculum',
    description: 'Learn Symbia with these progressive examples - from deterministic to multi-agent',
    color: 'text-scc-primary',
    priority: 0,
    matchTags: ['tutorial', 'bootstrap', 'curriculum', 'level-1', 'level-2', 'level-3', 'level-4', 'level-5'],
  },
  development: {
    label: 'Development',
    description: 'Code, git, and documentation tools',
    color: 'text-blue-400',
    priority: 1,
    matchTags: ['development', 'code', 'git', 'code-review', 'documentation', 'version-control'],
  },
  utility: {
    label: 'Utility',
    description: 'Data conversion, formatting, and transformation',
    color: 'text-emerald-400',
    priority: 2,
    matchTags: ['utility', 'conversion', 'formatting', 'json', 'regex', 'sql', 'translation', 'i18n', 'math', 'calculations'],
  },
  analysis: {
    label: 'Analysis',
    description: 'Data analysis, monitoring, and insights',
    color: 'text-purple-400',
    priority: 3,
    matchTags: ['analysis', 'analytics', 'monitoring', 'logging', 'metrics', 'reporting', 'sentiment', 'nlp', 'fact-checking'],
  },
  productivity: {
    label: 'Productivity',
    description: 'Task management and personal productivity',
    color: 'text-amber-400',
    priority: 4,
    matchTags: ['productivity', 'tasks', 'todo', 'reminders', 'time', 'summarization'],
  },
  coordination: {
    label: 'Coordination & AI',
    description: 'Multi-agent orchestration and AI tools',
    color: 'text-pink-400',
    priority: 5,
    matchTags: ['coordination', 'routing', 'orchestration', 'multi-agent', 'meta', 'assistant-builder', 'model-evaluation', 'onboarding'],
  },
  debugging: {
    label: 'Debugging & Testing',
    description: 'Debug, test, and troubleshoot',
    color: 'text-orange-400',
    priority: 6,
    matchTags: ['debug', 'debugging', 'testing', 'e2e', 'runtime'],
  },
  other: {
    label: 'Other',
    description: 'Miscellaneous assistants',
    color: 'text-slate-400',
    priority: 99,
    matchTags: [],
  },
};

function getCategoryForTags(tags: string[]): string {
  // Find the best matching category based on tags
  const lowerTags = tags.map(t => t.toLowerCase());

  for (const [category, config] of Object.entries(CATEGORY_CONFIG)) {
    if (category === 'other') continue;
    for (const matchTag of config.matchTags) {
      if (lowerTags.includes(matchTag.toLowerCase())) {
        return category;
      }
    }
  }

  return 'other';
}

// Curriculum level configuration
const CURRICULUM_LEVELS: Record<number, {
  label: string;
  color: string;
  bgColor: string;
  description: string;
}> = {
  1: { label: 'L1', color: 'text-emerald-400', bgColor: 'bg-emerald-400/10', description: 'Pure Deterministic' },
  2: { label: 'L2', color: 'text-blue-400', bgColor: 'bg-blue-400/10', description: 'Deterministic + Tools' },
  3: { label: 'L3', color: 'text-amber-400', bgColor: 'bg-amber-400/10', description: 'Tool \u2192 AI' },
  4: { label: 'L4', color: 'text-purple-400', bgColor: 'bg-purple-400/10', description: 'AI \u2192 Tool' },
  5: { label: 'L5', color: 'text-pink-400', bgColor: 'bg-pink-400/10', description: 'Multi-Agent' },
};

/**
 * Calculate determinism score based on assistant metadata
 * Higher score = more predictable output
 */
function calculateDeterminismScore(metadata: Record<string, unknown>): number {
  const llmConfig = metadata.llmConfig as Record<string, unknown> | null;
  const curriculumLevel = metadata.curriculumLevel as number | undefined;

  // Level 1-2: Pure deterministic = 100%
  if (curriculumLevel && curriculumLevel <= 2) return 100;

  // No LLM config = deterministic
  if (!llmConfig) return 100;

  // Has LLM - calculate based on temperature
  const temperature = (llmConfig.temperature as number) ?? 0.7;

  // temp=0 is very deterministic, temp=2 is very random
  // Score: 100% at temp=0, 50% at temp=0.7, 20% at temp=2
  const score = Math.round(100 - (temperature / 2) * 80);
  return Math.max(20, Math.min(100, score));
}

/**
 * Calculate confidence score based on rule coverage
 * Higher score = better defined behavior
 */
function calculateConfidenceScore(metadata: Record<string, unknown>): number {
  const ruleSet = metadata.ruleSet as { rules?: Array<{ actions?: unknown[]; onError?: unknown }> } | undefined;
  const rulesCount = (metadata.rulesCount as number) || ruleSet?.rules?.length || 0;
  const curriculumLevel = metadata.curriculumLevel as number | undefined;

  if (rulesCount === 0) return 30; // Low confidence without rules

  let score = 50; // Base score

  // More rules = more confidence (up to +30)
  score += Math.min(30, rulesCount * 10);

  // Check for error handling
  const hasErrorHandling = ruleSet?.rules?.some(r => r.onError);
  if (hasErrorHandling) score += 10;

  // Curriculum levels have been tested
  if (curriculumLevel) score += 10;

  return Math.min(100, score);
}

/**
 * Score indicator component
 */
function ScoreIndicator({
  score,
  icon,
  tooltip,
}: {
  score: number;
  icon: string;
  tooltip: string;
}) {
  const color = score >= 80 ? 'text-emerald-400' : score >= 50 ? 'text-amber-400' : 'text-red-400';
  const bgColor = score >= 80 ? 'bg-emerald-400' : score >= 50 ? 'bg-amber-400' : 'bg-red-400';

  return (
    <div className="flex items-center gap-1" title={tooltip}>
      <span className="text-xs text-slate-500">{icon}</span>
      <div className="w-12 h-1.5 bg-slate-700 rounded-full overflow-hidden">
        <div
          className={`h-full ${bgColor} transition-all`}
          style={{ width: `${score}%` }}
        />
      </div>
      <span className={`text-xs font-mono ${color}`}>{score}</span>
    </div>
  );
}

function AssistantCard({
  assistant,
  onClick,
}: {
  assistant: CatalogResource;
  onClick: () => void;
}) {
  const alias = (assistant.metadata?.alias as string) || assistant.key.split('/').pop();
  const capabilities = (assistant.metadata?.capabilities as string[]) || [];
  const rulesCount = (assistant.metadata?.rulesCount as number) || 0;
  const isPublished = assistant.status === 'published';

  // Curriculum info
  const curriculumLevel = assistant.metadata?.curriculumLevel as number | undefined;
  const curriculumTitle = assistant.metadata?.curriculumTitle as string | undefined;
  const levelConfig = curriculumLevel ? CURRICULUM_LEVELS[curriculumLevel] : null;

  // Calculate scores
  const determinismScore = calculateDeterminismScore(assistant.metadata || {});
  const confidenceScore = calculateConfidenceScore(assistant.metadata || {});

  return (
    <div
      onClick={onClick}
      className="scc-card p-4 cursor-pointer transition-all hover:border-scc-primary/50 hover:shadow-lg hover:shadow-scc-primary/5 group"
    >
      {/* Header with name, alias, and curriculum badge */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
          <h3 className="font-medium text-slate-200 group-hover:text-white transition-colors text-sm">
            {assistant.name}
          </h3>
        </div>
        <div className="flex items-center gap-1.5">
          {levelConfig && (
            <span
              className={`px-1.5 py-0.5 rounded text-xs font-medium ${levelConfig.bgColor} ${levelConfig.color}`}
              title={`${levelConfig.description}: ${curriculumTitle || ''}`}
            >
              {levelConfig.label}
            </span>
          )}
          {alias && (
            <span className="text-xs font-medium text-scc-secondary">
              @{alias}
            </span>
          )}
        </div>
      </div>

      {/* Description */}
      <p className="text-xs text-slate-500 mb-3 line-clamp-2 min-h-[2rem]">
        {assistant.description || 'No description'}
      </p>

      {/* Scores */}
      <div className="flex items-center gap-3 mb-3">
        <ScoreIndicator
          score={determinismScore}
          icon="⚙️"
          tooltip={`Determinism: ${determinismScore}% - How predictable the output is`}
        />
        <ScoreIndicator
          score={confidenceScore}
          icon="✅"
          tooltip={`Confidence: ${confidenceScore}% - How well-defined the behavior is`}
        />
      </div>

      {/* Footer with rules and status */}
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-1.5">
          <span className={`px-1.5 py-0.5 rounded ${
            rulesCount > 0 ? 'bg-scc-secondary/20 text-scc-secondary' : 'bg-slate-700 text-slate-500'
          }`}>
            {rulesCount} rules
          </span>
          {isPublished && (
            <span className="px-1.5 py-0.5 bg-emerald-500/20 text-emerald-400 rounded">
              published
            </span>
          )}
        </div>
        {capabilities.length > 0 && (
          <span className="text-slate-500">
            {capabilities.length} capabilities
          </span>
        )}
      </div>
    </div>
  );
}

function _NewAssistantCard({ onClick }: { onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      className="scc-card p-4 cursor-pointer transition-all border-dashed hover:border-scc-primary/50 hover:bg-scc-primary/5 group flex flex-col items-center justify-center min-h-[120px]"
    >
      <div className="w-10 h-10 rounded-full bg-scc-primary/10 flex items-center justify-center mb-2 group-hover:bg-scc-primary/20 transition-colors">
        <svg className="w-5 h-5 text-scc-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
      </div>
      <span className="text-xs font-medium text-slate-400 group-hover:text-scc-primary transition-colors">
        New Assistant
      </span>
    </div>
  );
}

function CategorySection({
  category,
  assistants,
  onSelectAssistant,
}: {
  category: string;
  assistants: CatalogResource[];
  onSelectAssistant: (id: string) => void;
}) {
  const config = CATEGORY_CONFIG[category] || CATEGORY_CONFIG.other;

  if (assistants.length === 0) return null;

  return (
    <div className="mb-8">
      <div className="flex items-center gap-3 mb-4">
        <h2 className={`text-lg font-semibold ${config.color}`}>
          {config.label}
        </h2>
        <span className="text-xs text-slate-500 bg-slate-800 px-2 py-0.5 rounded">
          {assistants.length}
        </span>
      </div>
      <p className="text-sm text-slate-500 mb-4">{config.description}</p>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {assistants.map((assistant) => (
          <AssistantCard
            key={assistant.id}
            assistant={assistant}
            onClick={() => onSelectAssistant(assistant.id)}
          />
        ))}
      </div>
    </div>
  );
}

export function AssistantsPanel() {
  // View mode: 'grid' shows cards, 'editor' shows full-page editor
  const [viewMode, setViewMode] = useState<'grid' | 'editor'>('grid');

  // Store state
  const {
    isLoadingResources,
    resourcesError,
    draftResource,
    isDirty,
    isSaving,
    isCreating,
    setResources,
    setLoadingResources,
    setResourcesError,
    selectResource,
    updateDraft,
    updateDraftMetadata,
    startCreating,
    discardChanges,
    addResource,
    updateResourceInList,
    removeResource,
    setSaving,
    setSaveError,
    markClean,
    getFilteredResources,
  } = useCatalogEditorStore();

  // Load assistants from API
  const loadResources = useCallback(async () => {
    setLoadingResources(true);
    setResourcesError(null);

    try {
      const assistants = await assistantsClient.listAssistants();

      const transformedResources: CatalogResource[] = assistants.map((a) => ({
        id: a.key,
        key: a.key,
        name: a.name,
        description: a.description,
        type: 'assistant' as ResourceType,
        status: (a.status === 'bootstrap' ? 'published' : 'draft') as ResourceStatus,
        orgId: '',
        tags: a.tags || [], // Include tags from API
        metadata: {
          alias: a.alias,
          principalId: a.principalId,
          capabilities: a.capabilities,
          hasHandler: a.hasHandler,
          hasRules: a.hasRules,
          rulesCount: a.rulesCount,
          // Include routines from API response for Behavior editor
          routines: (a as unknown as { routines?: unknown[] }).routines || [],
          // Include LLM config from API response
          llm: (a as unknown as { llm?: Record<string, unknown> }).llm || {},
        },
        currentVersion: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }));

      setResources(transformedResources);
    } catch (err) {
      setResourcesError(
        err instanceof Error ? err.message : 'Failed to load assistants'
      );
    } finally {
      setLoadingResources(false);
    }
  }, [setResources, setLoadingResources, setResourcesError]);

  // Load on mount
  useEffect(() => {
    loadResources();
  }, [loadResources]);

  // Get all resources
  const resources = getFilteredResources();

  // Group assistants by category
  const groupedAssistants = useMemo(() => {
    const groups: Record<string, CatalogResource[]> = {};

    // Initialize all categories
    Object.keys(CATEGORY_CONFIG).forEach(cat => {
      groups[cat] = [];
    });

    // Assign each assistant to a category
    resources.forEach(resource => {
      const tags = resource.tags || [];
      const category = getCategoryForTags(tags);
      groups[category].push(resource);
    });

    // Sort assistants within each group by name
    Object.values(groups).forEach(group => {
      group.sort((a, b) => a.name.localeCompare(b.name));
    });

    return groups;
  }, [resources]);

  // Get sorted categories by priority
  const sortedCategories = useMemo(() => {
    return Object.entries(CATEGORY_CONFIG)
      .sort(([, a], [, b]) => a.priority - b.priority)
      .map(([key]) => key)
      .filter(cat => groupedAssistants[cat]?.length > 0);
  }, [groupedAssistants]);

  // Handle card click - select and switch to editor
  const handleSelectAssistant = useCallback((id: string) => {
    if (isDirty) {
      const confirmed = window.confirm('You have unsaved changes. Discard them?');
      if (!confirmed) return;
      discardChanges();
    }
    selectResource(id);
    setViewMode('editor');
  }, [isDirty, selectResource, discardChanges]);

  // Handle create new
  const handleCreateNew = useCallback(() => {
    if (isDirty) {
      const confirmed = window.confirm('You have unsaved changes. Discard them?');
      if (!confirmed) return;
      discardChanges();
    }
    startCreating('assistant');
    setViewMode('editor');
  }, [isDirty, startCreating, discardChanges]);

  // Handle back to grid
  const handleBack = useCallback(() => {
    if (isDirty) {
      const confirmed = window.confirm('You have unsaved changes. Discard them?');
      if (!confirmed) return;
      discardChanges();
    }
    setViewMode('grid');
  }, [isDirty, discardChanges]);

  // Handle save
  const handleSave = useCallback(async () => {
    if (!draftResource) return;

    setSaving(true);
    setSaveError(null);

    try {
      if (isCreating) {
        const newResource: CatalogResource = {
          ...draftResource,
          id: `assistant-${Date.now()}`,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        addResource(newResource);
        selectResource(newResource.id);
        console.log('Created resource:', newResource);
      } else {
        updateResourceInList(draftResource.id, draftResource);
        console.log('Updated resource:', draftResource);
      }
      markClean();
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : 'Failed to save resource'
      );
    } finally {
      setSaving(false);
    }
  }, [
    draftResource,
    isCreating,
    setSaving,
    setSaveError,
    addResource,
    updateResourceInList,
    selectResource,
    markClean,
  ]);

  // Handle publish
  const handlePublish = useCallback(async () => {
    if (!draftResource || !draftResource.id) return;

    setSaving(true);
    try {
      updateResourceInList(draftResource.id, {
        status: 'published',
        currentVersion: (draftResource.currentVersion || 0) + 1,
        updatedAt: new Date().toISOString(),
      });
      console.log('Published resource:', draftResource.id);
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : 'Failed to publish resource'
      );
    } finally {
      setSaving(false);
    }
  }, [draftResource, setSaving, setSaveError, updateResourceInList]);

  // Handle delete
  const handleDelete = useCallback(async () => {
    if (!draftResource || !draftResource.id) return;

    setSaving(true);
    try {
      removeResource(draftResource.id);
      setViewMode('grid');
      console.log('Deleted resource:', draftResource.id);
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : 'Failed to delete resource'
      );
    } finally {
      setSaving(false);
    }
  }, [draftResource, setSaving, setSaveError, removeResource]);

  // Editor view - full page
  if (viewMode === 'editor') {
    return (
      <div className="h-full flex flex-col">
        {/* Back header */}
        <div className="shrink-0 px-6 py-4 border-b border-scc-border bg-scc-elevated/30 flex items-center gap-4">
          <button
            onClick={handleBack}
            className="flex items-center gap-2 text-slate-400 hover:text-slate-200 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            <span className="text-sm font-medium">Assistants</span>
          </button>
          {draftResource && (
            <div className="flex items-center gap-2 text-slate-500">
              <span>/</span>
              <span className="text-slate-300">{draftResource.name || 'New Assistant'}</span>
              {isDirty && <span className="text-scc-primary text-xs">(unsaved)</span>}
            </div>
          )}
        </div>

        {/* Full-page editor */}
        <div className="flex-1 overflow-hidden">
          <ResourceEditor
            resource={draftResource}
            isCreating={isCreating}
            isDirty={isDirty}
            isSaving={isSaving}
            onUpdate={updateDraft}
            onUpdateMetadata={updateDraftMetadata}
            onSave={handleSave}
            onPublish={handlePublish}
            onDelete={handleDelete}
            onDiscard={discardChanges}
          />
        </div>
      </div>
    );
  }

  // Grid view - cards organized by category
  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="shrink-0 p-6 border-b border-scc-border">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-slate-100">Assistants</h1>
            <p className="text-sm text-slate-500 mt-1">
              {resources.length} assistants with @mention aliases and customizable behaviors
            </p>
          </div>
          <div className="flex items-center gap-3">
            {isLoadingResources && (
              <div className="w-4 h-4 border-2 border-scc-primary border-t-transparent rounded-full animate-spin" />
            )}
            <button
              onClick={handleCreateNew}
              className="flex items-center gap-2 px-3 py-1.5 bg-scc-primary/20 hover:bg-scc-primary/30 text-scc-primary rounded-lg transition-colors text-sm font-medium"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Assistant
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* Tip */}
        <div className="mb-6 p-3 bg-scc-secondary/10 border border-scc-secondary/30 rounded-lg">
          <p className="text-sm text-scc-secondary">
            <span className="font-medium">Tip:</span> Use @mentions in the Chat panel to invite assistants.
            Click any card to customize behavior and routines.
          </p>
        </div>

        {/* Error state */}
        {resourcesError && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400">
            {resourcesError}
          </div>
        )}

        {/* Loading state */}
        {isLoadingResources && resources.length === 0 ? (
          <div className="text-center py-12 text-slate-500">
            <div className="w-8 h-8 border-2 border-scc-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p>Loading assistants...</p>
          </div>
        ) : (
          /* Categories with assistants */
          <div>
            {sortedCategories.map((category) => (
              <CategorySection
                key={category}
                category={category}
                assistants={groupedAssistants[category]}
                onSelectAssistant={handleSelectAssistant}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
