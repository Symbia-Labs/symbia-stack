/**
 * Executor Runtime Section
 *
 * Editor for executor-specific configuration including
 * runtime settings, resources, and scaling.
 */

import { useState, useCallback } from 'react';
// 'executor' is no longer a catalog ResourceType (settled 9 Aug,
// docs/2026-08-09-catalog-roadmap.md §7.3); this section is retained but
// unrouted, typed against the base resource.
import type { CatalogResource } from '@/types/catalog';

interface ExecutorRuntimeSectionProps {
  resource: CatalogResource;
  onUpdateMetadata: (metadata: Record<string, unknown>) => void;
}

type RuntimeType = 'local' | 'cloud' | 'edge' | 'container';

interface EnvVar {
  id: string;
  key: string;
  value: string;
}

export function ExecutorRuntimeSection({
  resource,
  onUpdateMetadata,
}: ExecutorRuntimeSectionProps) {
  const executorResource = resource;
  const metadata = executorResource.metadata || {};

  const runtime = (metadata.runtime || {}) as {
    type?: RuntimeType;
    timeout?: number;
    image?: string;
  };

  const resources = (metadata.resources || {}) as {
    memory?: number;
    cpu?: number;
  };

  const scaling = (metadata.scaling || {}) as {
    minInstances?: number;
    maxInstances?: number;
    scaleThreshold?: number;
  };

  // Environment variables
  const [envVars, setEnvVars] = useState<EnvVar[]>(() => {
    const env = (metadata.env || {}) as Record<string, string>;
    return Object.entries(env).map(([key, value], i) => ({
      id: `env-${i}`,
      key,
      value,
    }));
  });

  // Update runtime
  const updateRuntime = useCallback((updates: Partial<typeof runtime>) => {
    onUpdateMetadata({
      ...metadata,
      runtime: { ...runtime, ...updates },
    });
  }, [metadata, runtime, onUpdateMetadata]);

  // Update resources
  const updateResources = useCallback((updates: Partial<typeof resources>) => {
    onUpdateMetadata({
      ...metadata,
      resources: { ...resources, ...updates },
    });
  }, [metadata, resources, onUpdateMetadata]);

  // Update scaling
  const updateScaling = useCallback((updates: Partial<typeof scaling>) => {
    onUpdateMetadata({
      ...metadata,
      scaling: { ...scaling, ...updates },
    });
  }, [metadata, scaling, onUpdateMetadata]);

  // Update env vars
  const updateEnvVars = useCallback((newVars: EnvVar[]) => {
    setEnvVars(newVars);
    const env: Record<string, string> = {};
    for (const v of newVars) {
      if (v.key) env[v.key] = v.value;
    }
    onUpdateMetadata({ ...metadata, env });
  }, [metadata, onUpdateMetadata]);

  // Add env var
  const addEnvVar = useCallback(() => {
    updateEnvVars([...envVars, { id: `env-${Date.now()}`, key: '', value: '' }]);
  }, [envVars, updateEnvVars]);

  // Remove env var
  const removeEnvVar = useCallback((id: string) => {
    updateEnvVars(envVars.filter(v => v.id !== id));
  }, [envVars, updateEnvVars]);

  return (
    <div className="space-y-8">
      {/* Runtime Settings */}
      <section className="space-y-4">
        <h3 className="text-sm font-medium text-slate-300 uppercase tracking-wider">
          Runtime
        </h3>
        <div className="grid grid-cols-4 gap-3">
          {(['local', 'cloud', 'edge', 'container'] as RuntimeType[]).map((type) => (
            <button
              key={type}
              onClick={() => updateRuntime({ type })}
              className={`p-4 rounded-lg border text-center transition-colors ${
                runtime.type === type
                  ? 'border-scc-primary bg-scc-primary/10'
                  : 'border-scc-border hover:border-scc-border-hover'
              }`}
            >
              <div className="text-2xl mb-2">
                {type === 'local' ? '💻' : type === 'cloud' ? '☁️' : type === 'edge' ? '⚡' : '📦'}
              </div>
              <div className="text-sm font-medium text-slate-200 capitalize">{type}</div>
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="scc-label">Timeout (ms)</label>
            <input
              type="number"
              value={runtime.timeout || ''}
              onChange={(e) => updateRuntime({ timeout: parseInt(e.target.value) || undefined })}
              placeholder="30000"
              className="scc-input"
            />
          </div>
          {runtime.type === 'container' && (
            <div>
              <label className="scc-label">Container Image</label>
              <input
                type="text"
                value={runtime.image || ''}
                onChange={(e) => updateRuntime({ image: e.target.value })}
                placeholder="node:18-alpine"
                className="scc-input"
              />
            </div>
          )}
        </div>
      </section>

      {/* Resource Allocation */}
      <section className="space-y-4">
        <h3 className="text-sm font-medium text-slate-300 uppercase tracking-wider">
          Resources
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="scc-label">Memory (MB)</label>
            <input
              type="number"
              value={resources.memory || ''}
              onChange={(e) => updateResources({ memory: parseInt(e.target.value) || undefined })}
              placeholder="512"
              className="scc-input"
            />
            <div className="mt-2">
              <input
                type="range"
                min="128"
                max="4096"
                step="128"
                value={resources.memory || 512}
                onChange={(e) => updateResources({ memory: parseInt(e.target.value) })}
                className="w-full accent-scc-primary"
              />
              <div className="flex justify-between text-xs text-slate-500">
                <span>128 MB</span>
                <span>4096 MB</span>
              </div>
            </div>
          </div>
          <div>
            <label className="scc-label">CPU Cores</label>
            <input
              type="number"
              value={resources.cpu || ''}
              onChange={(e) => updateResources({ cpu: parseFloat(e.target.value) || undefined })}
              placeholder="1"
              step="0.25"
              min="0.25"
              max="8"
              className="scc-input"
            />
            <div className="mt-2">
              <input
                type="range"
                min="0.25"
                max="8"
                step="0.25"
                value={resources.cpu || 1}
                onChange={(e) => updateResources({ cpu: parseFloat(e.target.value) })}
                className="w-full accent-scc-primary"
              />
              <div className="flex justify-between text-xs text-slate-500">
                <span>0.25</span>
                <span>8 cores</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Scaling */}
      <section className="space-y-4">
        <h3 className="text-sm font-medium text-slate-300 uppercase tracking-wider">
          Scaling
        </h3>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="scc-label">Min Instances</label>
            <input
              type="number"
              value={scaling.minInstances ?? ''}
              onChange={(e) => updateScaling({ minInstances: parseInt(e.target.value) || undefined })}
              placeholder="1"
              min="0"
              className="scc-input"
            />
          </div>
          <div>
            <label className="scc-label">Max Instances</label>
            <input
              type="number"
              value={scaling.maxInstances ?? ''}
              onChange={(e) => updateScaling({ maxInstances: parseInt(e.target.value) || undefined })}
              placeholder="10"
              min="1"
              className="scc-input"
            />
          </div>
          <div>
            <label className="scc-label">Scale Threshold (%)</label>
            <input
              type="number"
              value={scaling.scaleThreshold ?? ''}
              onChange={(e) => updateScaling({ scaleThreshold: parseInt(e.target.value) || undefined })}
              placeholder="80"
              min="1"
              max="100"
              className="scc-input"
            />
          </div>
        </div>
        <p className="text-xs text-slate-500">
          Scale up when CPU/memory usage exceeds the threshold. Scale down when below threshold for 5 minutes.
        </p>
      </section>

      {/* Environment Variables */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-slate-300 uppercase tracking-wider">
            Environment Variables
          </h3>
          <button
            onClick={addEnvVar}
            className="scc-button-ghost text-sm flex items-center gap-1"
          >
            <span>+</span>
            <span>Add Variable</span>
          </button>
        </div>

        {envVars.length === 0 ? (
          <div className="scc-card p-6 border-dashed text-center">
            <p className="text-slate-400 text-sm">
              No environment variables configured.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {envVars.map((envVar) => (
              <div key={envVar.id} className="flex items-center gap-2">
                <input
                  type="text"
                  value={envVar.key}
                  onChange={(e) => {
                    updateEnvVars(envVars.map(v =>
                      v.id === envVar.id ? { ...v, key: e.target.value } : v
                    ));
                  }}
                  placeholder="KEY"
                  className="scc-input w-1/3 font-mono text-sm"
                />
                <span className="text-slate-500">=</span>
                <input
                  type="text"
                  value={envVar.value}
                  onChange={(e) => {
                    updateEnvVars(envVars.map(v =>
                      v.id === envVar.id ? { ...v, value: e.target.value } : v
                    ));
                  }}
                  placeholder="value"
                  className="scc-input flex-1 text-sm"
                />
                <button
                  onClick={() => removeEnvVar(envVar.id)}
                  className="p-2 text-slate-500 hover:text-red-400 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
