/**
 * Resource Editor
 *
 * Form-based editor for catalog resources.
 * Focused on assistant configuration and related resources.
 */

import { useState } from 'react';
import type { CatalogResource } from '@/types/catalog';
import { CatalogToolbar } from './CatalogToolbar';
import { BasicInfoSection } from './sections/BasicInfoSection';
import { TagsSection } from './sections/TagsSection';
import { MetadataSection } from './sections/MetadataSection';
import { AccessSection } from './sections/AccessSection';
import { VersionsSection } from './sections/VersionsSection';
import { CurriculumOverviewSection } from './sections/CurriculumOverviewSection';

// Type-specific sections
import { ContextSchemaSection } from './type-sections/ContextSchemaSection';
import { AssistantConfigSection } from './type-sections/AssistantConfigSection';
import { ComponentInterfaceSection } from './type-sections/ComponentInterfaceSection';
import { IntegrationConnectionSection } from './type-sections/IntegrationConnectionSection';
import { ExecutorRuntimeSection } from './type-sections/ExecutorRuntimeSection';

type TabId = 'details' | 'config' | 'access' | 'versions';

interface Tab {
  id: TabId;
  label: string;
  icon: string;
}

const TABS: Tab[] = [
  { id: 'details', label: 'Details', icon: '📋' },
  { id: 'config', label: 'Configuration', icon: '⚙️' },
  { id: 'access', label: 'Access', icon: '🔒' },
  { id: 'versions', label: 'Versions', icon: '📚' },
];

interface ResourceEditorProps {
  resource: CatalogResource | null;
  isCreating: boolean;
  isDirty: boolean;
  isSaving: boolean;
  onUpdate: (updates: Partial<CatalogResource>) => void;
  onUpdateMetadata: (metadata: Record<string, unknown>) => void;
  onSave: () => void;
  onPublish: () => void;
  onDelete: () => void;
  onDiscard: () => void;
}

export function ResourceEditor({
  resource,
  isCreating,
  isDirty,
  isSaving,
  onUpdate,
  onUpdateMetadata,
  onSave,
  onPublish,
  onDelete,
  onDiscard,
}: ResourceEditorProps) {
  // Default to Behavior tab for assistants, Details for others
  const [activeTab, setActiveTab] = useState<TabId>(
    resource?.type === 'assistant' ? 'config' : 'details'
  );

  // Show empty state when no resource is selected
  if (!resource) {
    return (
      <div className="h-full flex items-center justify-center bg-gradient-to-br from-scc-surface to-scc-elevated/50">
        <div className="text-center max-w-lg px-8">
          <div className="text-7xl mb-6">🤖</div>
          <h2 className="text-2xl font-semibold text-slate-200 mb-3">
            Build Your Assistant
          </h2>
          <p className="text-slate-400 mb-8 leading-relaxed">
            Create an AI assistant with custom behaviors, context awareness, and integrations.
            Define what it does using plain English routines.
          </p>
          <div className="grid grid-cols-3 gap-4 text-left">
            <div className="p-4 rounded-lg bg-scc-surface/50 border border-scc-border">
              <div className="text-2xl mb-2">💬</div>
              <div className="text-sm font-medium text-slate-300">Routines</div>
              <div className="text-xs text-slate-500 mt-1">Define behaviors with plain English steps</div>
            </div>
            <div className="p-4 rounded-lg bg-scc-surface/50 border border-scc-border">
              <div className="text-2xl mb-2">📦</div>
              <div className="text-sm font-medium text-slate-300">@contexts</div>
              <div className="text-xs text-slate-500 mt-1">Reference data and state with @mentions</div>
            </div>
            <div className="p-4 rounded-lg bg-scc-surface/50 border border-scc-border">
              <div className="text-2xl mb-2">#️⃣</div>
              <div className="text-sm font-medium text-slate-300">#tags</div>
              <div className="text-xs text-slate-500 mt-1">Organize and filter with hashtags</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Get type-specific tab label
  const getConfigTabLabel = () => {
    switch (resource.type) {
      case 'context':
        return 'Schema';
      case 'assistant':
        return 'Behavior';
      case 'component':
        return 'Interface';
      case 'integration':
        return 'Connection';
      case 'executor':
        return 'Runtime';
      default:
        return 'Configuration';
    }
  };

  // Render tab content
  const renderTabContent = () => {
    switch (activeTab) {
      case 'details':
        return (
          <div className="space-y-8">
            <BasicInfoSection resource={resource} onUpdate={onUpdate} />
            {resource.type === 'assistant' && (
              <CurriculumOverviewSection resource={resource} />
            )}
            <TagsSection resource={resource} onUpdate={onUpdate} />
            <MetadataSection resource={resource} onUpdateMetadata={onUpdateMetadata} />
          </div>
        );

      case 'config':
        return renderTypeSpecificConfig();

      case 'access':
        return (
          <AccessSection
            resource={resource}
            onUpdateMetadata={onUpdateMetadata}
          />
        );

      case 'versions':
        return (
          <VersionsSection
            resource={resource}
          />
        );

      default:
        return null;
    }
  };

  // Render type-specific configuration section
  const renderTypeSpecificConfig = () => {
    switch (resource.type) {
      case 'context':
        return (
          <ContextSchemaSection
            resource={resource}
            onUpdateMetadata={onUpdateMetadata}
          />
        );
      case 'assistant':
        return (
          <AssistantConfigSection
            resource={resource}
            onUpdate={onUpdate}
            onUpdateMetadata={onUpdateMetadata}
          />
        );
      case 'component':
        return (
          <ComponentInterfaceSection
            resource={resource}
            onUpdateMetadata={onUpdateMetadata}
          />
        );
      case 'integration':
        return (
          <IntegrationConnectionSection
            resource={resource}
            onUpdateMetadata={onUpdateMetadata}
          />
        );
      case 'executor':
        return (
          <ExecutorRuntimeSection
            resource={resource}
            onUpdateMetadata={onUpdateMetadata}
          />
        );
      default:
        return (
          <div className="text-slate-500">
            No configuration options for this resource type.
          </div>
        );
    }
  };

  // Customize tabs based on resource type
  const tabs = TABS.map((tab) => {
    if (tab.id === 'config') {
      return { ...tab, label: getConfigTabLabel() };
    }
    return tab;
  });

  return (
    <div className="h-full flex flex-col">
      <CatalogToolbar
        resource={resource}
        isCreating={isCreating}
        isDirty={isDirty}
        isSaving={isSaving}
        onSave={onSave}
        onPublish={onPublish}
        onDelete={onDelete}
        onDiscard={onDiscard}
      />

      {/* Tab Navigation */}
      <div className="shrink-0 border-b border-scc-border bg-scc-elevated/30">
        <nav className="flex gap-1 px-6" aria-label="Tabs">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                px-4 py-3 text-sm font-medium transition-colors relative
                ${activeTab === tab.id
                  ? 'text-scc-primary'
                  : 'text-slate-400 hover:text-slate-200'
                }
              `}
            >
              <span className="flex items-center gap-2">
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
              </span>
              {activeTab === tab.id && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-scc-primary" />
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {renderTabContent()}
      </div>
    </div>
  );
}
