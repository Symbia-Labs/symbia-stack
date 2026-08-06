/**
 * Component Interface Section
 *
 * Editor for component-specific configuration including
 * input/output schemas and implementation.
 */

import { useState, useCallback } from 'react';
import type { CatalogResource, ComponentResource } from '@/types/catalog';
import { JsonEditor } from '../shared/JsonEditor';
import { TagEditor } from '../shared/TagEditor';

interface ComponentInterfaceSectionProps {
  resource: CatalogResource;
  onUpdateMetadata: (metadata: Record<string, unknown>) => void;
}

type ImplementationType = 'function' | 'template' | 'external';

export function ComponentInterfaceSection({
  resource,
  onUpdateMetadata,
}: ComponentInterfaceSectionProps) {
  const componentResource = resource as ComponentResource;
  const metadata = componentResource.metadata || {};

  const inputSchema = (metadata.inputSchema || { type: 'object', properties: {} }) as Record<string, unknown>;
  const outputSchema = (metadata.outputSchema || { type: 'object', properties: {} }) as Record<string, unknown>;
  const implementation = (metadata.implementation || {}) as {
    type?: ImplementationType;
    code?: string;
    url?: string;
    template?: string;
  };
  const dependencies = (metadata.dependencies || []) as string[];

  const [activeTab, setActiveTab] = useState<'interface' | 'implementation'>('interface');

  // Update input schema
  const updateInputSchema = useCallback((schema: Record<string, unknown> | unknown[]) => {
    if (!Array.isArray(schema)) {
      onUpdateMetadata({ ...metadata, inputSchema: schema });
    }
  }, [metadata, onUpdateMetadata]);

  // Update output schema
  const updateOutputSchema = useCallback((schema: Record<string, unknown> | unknown[]) => {
    if (!Array.isArray(schema)) {
      onUpdateMetadata({ ...metadata, outputSchema: schema });
    }
  }, [metadata, onUpdateMetadata]);

  // Update implementation
  const updateImplementation = useCallback((updates: Partial<typeof implementation>) => {
    onUpdateMetadata({
      ...metadata,
      implementation: { ...implementation, ...updates },
    });
  }, [metadata, implementation, onUpdateMetadata]);

  // Update dependencies
  const updateDependencies = useCallback((deps: string[]) => {
    onUpdateMetadata({ ...metadata, dependencies: deps });
  }, [metadata, onUpdateMetadata]);

  return (
    <div className="space-y-6">
      {/* Sub-tabs for Interface vs Implementation */}
      <div className="flex gap-1 border-b border-scc-border">
        <button
          onClick={() => setActiveTab('interface')}
          className={`px-4 py-2 text-sm font-medium transition-colors relative ${
            activeTab === 'interface' ? 'text-scc-primary' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Interface
          {activeTab === 'interface' && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-scc-primary" />
          )}
        </button>
        <button
          onClick={() => setActiveTab('implementation')}
          className={`px-4 py-2 text-sm font-medium transition-colors relative ${
            activeTab === 'implementation' ? 'text-scc-primary' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Implementation
          {activeTab === 'implementation' && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-scc-primary" />
          )}
        </button>
      </div>

      {activeTab === 'interface' ? (
        <div className="space-y-6">
          {/* Input Schema */}
          <section className="space-y-4">
            <h3 className="text-sm font-medium text-slate-300 uppercase tracking-wider">
              Input Schema
            </h3>
            <p className="text-xs text-slate-500">
              Define the expected input parameters for this component.
            </p>
            <JsonEditor
              value={inputSchema}
              onChange={updateInputSchema}
              height={200}
            />
          </section>

          {/* Output Schema */}
          <section className="space-y-4">
            <h3 className="text-sm font-medium text-slate-300 uppercase tracking-wider">
              Output Schema
            </h3>
            <p className="text-xs text-slate-500">
              Define the output structure returned by this component.
            </p>
            <JsonEditor
              value={outputSchema}
              onChange={updateOutputSchema}
              height={200}
            />
          </section>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Implementation Type */}
          <section className="space-y-4">
            <h3 className="text-sm font-medium text-slate-300 uppercase tracking-wider">
              Implementation Type
            </h3>
            <div className="grid grid-cols-3 gap-3">
              {(['function', 'template', 'external'] as ImplementationType[]).map((type) => (
                <button
                  key={type}
                  onClick={() => updateImplementation({ type })}
                  className={`p-4 rounded-lg border text-left transition-colors ${
                    implementation.type === type
                      ? 'border-scc-primary bg-scc-primary/10'
                      : 'border-scc-border hover:border-scc-border-hover'
                  }`}
                >
                  <div className="text-lg mb-1">
                    {type === 'function' ? '𝑓' : type === 'template' ? '📝' : '🌐'}
                  </div>
                  <div className="text-sm font-medium text-slate-200 capitalize">{type}</div>
                  <div className="text-xs text-slate-500 mt-1">
                    {type === 'function' && 'JavaScript/TypeScript code'}
                    {type === 'template' && 'Template-based transform'}
                    {type === 'external' && 'External API endpoint'}
                  </div>
                </button>
              ))}
            </div>
          </section>

          {/* Type-specific configuration */}
          {implementation.type === 'function' && (
            <section className="space-y-4">
              <h3 className="text-sm font-medium text-slate-300 uppercase tracking-wider">
                Function Code
              </h3>
              <div className="scc-card border-dashed">
                <textarea
                  value={implementation.code || ''}
                  onChange={(e) => updateImplementation({ code: e.target.value })}
                  placeholder={`// Component function\nasync function execute(input, context) {\n  // Your code here\n  return { result: input.value };\n}`}
                  rows={12}
                  className="w-full bg-transparent text-slate-200 font-mono text-sm p-4 outline-none resize-none"
                />
              </div>
              <p className="text-xs text-slate-500">
                Write a JavaScript/TypeScript function that receives input and context, and returns the output.
              </p>
            </section>
          )}

          {implementation.type === 'template' && (
            <section className="space-y-4">
              <h3 className="text-sm font-medium text-slate-300 uppercase tracking-wider">
                Template
              </h3>
              <div className="scc-card border-dashed">
                <textarea
                  value={implementation.template || ''}
                  onChange={(e) => updateImplementation({ template: e.target.value })}
                  placeholder={`{\n  "result": "{{input.value}}",\n  "timestamp": "{{now}}"\n}`}
                  rows={8}
                  className="w-full bg-transparent text-slate-200 font-mono text-sm p-4 outline-none resize-none"
                />
              </div>
              <p className="text-xs text-slate-500">
                Use {'{{variable}}'} syntax to reference input fields and context values.
              </p>
            </section>
          )}

          {implementation.type === 'external' && (
            <section className="space-y-4">
              <h3 className="text-sm font-medium text-slate-300 uppercase tracking-wider">
                External Endpoint
              </h3>
              <div>
                <label className="scc-label">URL</label>
                <input
                  type="url"
                  value={implementation.url || ''}
                  onChange={(e) => updateImplementation({ url: e.target.value })}
                  placeholder="https://api.example.com/component"
                  className="scc-input"
                />
              </div>
              <p className="text-xs text-slate-500">
                The external endpoint will receive POST requests with the input data.
              </p>
            </section>
          )}

          {/* Dependencies */}
          <section className="space-y-4">
            <h3 className="text-sm font-medium text-slate-300 uppercase tracking-wider">
              Dependencies
            </h3>
            <TagEditor
              tags={dependencies}
              onChange={updateDependencies}
              placeholder="Add dependency (e.g., component/utils)..."
            />
            <p className="text-xs text-slate-500">
              Other components this component depends on.
            </p>
          </section>
        </div>
      )}
    </div>
  );
}
