/**
 * Integration Connection Section
 *
 * Editor for integration-specific configuration including:
 * - OpenAPI spec discovery
 * - MCP server configuration
 * - Authentication, rate limiting, and retry policies
 */

import { useState, useCallback } from 'react';
import type { CatalogResource, IntegrationResource } from '@/types/catalog';
import { integrationsClient } from '@/services/integrationsClient';

interface IntegrationConnectionSectionProps {
  resource: CatalogResource;
  onUpdateMetadata: (metadata: Record<string, unknown>) => void;
}

type IntegrationType = 'openapi' | 'mcp' | 'custom';
type AuthMethod = 'none' | 'apiKey' | 'bearer' | 'basic' | 'oauth2';
type MCPTransport = 'stdio' | 'http' | 'websocket';

interface DiscoveredOperation {
  id: string;
  method?: string;
  path?: string;
  summary?: string;
  tags?: string[];
}

export function IntegrationConnectionSection({
  resource,
  onUpdateMetadata,
}: IntegrationConnectionSectionProps) {
  const integrationResource = resource as IntegrationResource;
  const metadata = integrationResource.metadata || {};

  // Integration type
  const integrationType = (metadata.type as IntegrationType) || 'openapi';

  // OpenAPI config
  const openapi = (metadata.openapi || {}) as {
    specUrl?: string;
    serverUrl?: string;
  };

  // MCP config
  const mcp = (metadata.mcp || {}) as {
    transport?: MCPTransport;
    command?: string;
    args?: string[];
    serverUrl?: string;
  };

  // Auth config
  const auth = (metadata.auth || {}) as {
    type?: AuthMethod;
    header?: string;
    credentialKey?: string;
  };

  // Rate limit config
  const rateLimit = (metadata.rateLimit || {}) as {
    requestsPerMinute?: number;
    requestsPerSecond?: number;
  };

  // Retry config
  const retry = (metadata.retry || {}) as {
    maxRetries?: number;
    backoffMs?: number;
  };

  // Discovered operations
  const [operations, setOperations] = useState<DiscoveredOperation[]>(
    (metadata.operations as DiscoveredOperation[]) || []
  );
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);
  const [expandedTags, setExpandedTags] = useState<Set<string>>(new Set());

  // Update metadata helpers
  const updateType = useCallback((type: IntegrationType) => {
    onUpdateMetadata({ ...metadata, type });
  }, [metadata, onUpdateMetadata]);

  const updateOpenAPI = useCallback((updates: Partial<typeof openapi>) => {
    onUpdateMetadata({
      ...metadata,
      openapi: { ...openapi, ...updates },
    });
  }, [metadata, openapi, onUpdateMetadata]);

  const updateMCP = useCallback((updates: Partial<typeof mcp>) => {
    onUpdateMetadata({
      ...metadata,
      mcp: { ...mcp, ...updates },
    });
  }, [metadata, mcp, onUpdateMetadata]);

  const updateAuth = useCallback((updates: Partial<typeof auth>) => {
    onUpdateMetadata({
      ...metadata,
      auth: { ...auth, ...updates },
    });
  }, [metadata, auth, onUpdateMetadata]);

  const updateRateLimit = useCallback((updates: Partial<typeof rateLimit>) => {
    onUpdateMetadata({
      ...metadata,
      rateLimit: { ...rateLimit, ...updates },
    });
  }, [metadata, rateLimit, onUpdateMetadata]);

  const updateRetry = useCallback((updates: Partial<typeof retry>) => {
    onUpdateMetadata({
      ...metadata,
      retry: { ...retry, ...updates },
    });
  }, [metadata, retry, onUpdateMetadata]);

  // Discover operations from spec
  const discoverOperations = useCallback(async () => {
    setIsDiscovering(true);
    setDiscoveryError(null);

    try {
      if (integrationType === 'openapi' && openapi.specUrl) {
        const response = await fetch(
          `${integrationsClient['getBaseUrl']()}/parse/openapi`,
          {
            method: 'POST',
            headers: integrationsClient['getHeaders'](),
            body: JSON.stringify({
              specUrl: openapi.specUrl,
              serverUrl: openapi.serverUrl,
            }),
          }
        );

        const result = await response.json();

        if (result.success) {
          setOperations(result.operations);
          onUpdateMetadata({
            ...metadata,
            operations: result.operations,
            namespace: result.namespace,
            discoveredInfo: result.info,
            discoveredAuthType: result.authType,
          });
        } else {
          setDiscoveryError(result.error || 'Failed to parse OpenAPI spec');
        }
      } else if (integrationType === 'mcp') {
        const response = await fetch(
          `${integrationsClient['getBaseUrl']()}/parse/mcp`,
          {
            method: 'POST',
            headers: integrationsClient['getHeaders'](),
            body: JSON.stringify(mcp),
          }
        );

        const result = await response.json();

        if (result.success) {
          setOperations(result.operations);
          onUpdateMetadata({
            ...metadata,
            operations: result.operations,
            namespace: result.namespace,
            mcpCapabilities: result.capabilities,
          });
        } else {
          setDiscoveryError(result.error || 'Failed to connect to MCP server');
        }
      }
    } catch (error) {
      setDiscoveryError(error instanceof Error ? error.message : 'Discovery failed');
    } finally {
      setIsDiscovering(false);
    }
  }, [integrationType, openapi, mcp, metadata, onUpdateMetadata]);

  // Group operations by tag
  const operationsByTag = operations.reduce((acc, op) => {
    const tags = op.tags?.length ? op.tags : ['Other'];
    for (const tag of tags) {
      if (!acc[tag]) acc[tag] = [];
      acc[tag].push(op);
    }
    return acc;
  }, {} as Record<string, DiscoveredOperation[]>);

  const toggleTag = (tag: string) => {
    setExpandedTags(prev => {
      const next = new Set(prev);
      if (next.has(tag)) {
        next.delete(tag);
      } else {
        next.add(tag);
      }
      return next;
    });
  };

  return (
    <div className="space-y-8">
      {/* Integration Type */}
      <section className="space-y-4">
        <h3 className="text-sm font-medium text-slate-300 uppercase tracking-wider">
          Integration Type
        </h3>
        <div className="grid grid-cols-3 gap-3">
          {(['openapi', 'mcp', 'custom'] as const).map((type) => (
            <button
              key={type}
              onClick={() => updateType(type)}
              className={`
                p-4 rounded-lg border text-left transition-all
                ${integrationType === type
                  ? 'border-scc-primary bg-scc-primary/10'
                  : 'border-scc-border hover:border-slate-500'
                }
              `}
            >
              <div className="text-2xl mb-2">
                {type === 'openapi' ? '📄' : type === 'mcp' ? '🔌' : '⚙️'}
              </div>
              <div className="font-medium text-slate-200 capitalize">{type}</div>
              <div className="text-xs text-slate-500 mt-1">
                {type === 'openapi' && 'Auto-discover from OpenAPI spec'}
                {type === 'mcp' && 'Connect to MCP server'}
                {type === 'custom' && 'Manual configuration'}
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* OpenAPI Configuration */}
      {integrationType === 'openapi' && (
        <section className="space-y-4">
          <h3 className="text-sm font-medium text-slate-300 uppercase tracking-wider">
            OpenAPI Specification
          </h3>
          <div className="space-y-4">
            <div>
              <label className="scc-label">Spec URL</label>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={openapi.specUrl || ''}
                  onChange={(e) => updateOpenAPI({ specUrl: e.target.value })}
                  placeholder="https://api.example.com/openapi.json"
                  className="scc-input flex-1"
                />
                <button
                  onClick={discoverOperations}
                  disabled={!openapi.specUrl || isDiscovering}
                  className="scc-button-primary px-4 disabled:opacity-50"
                >
                  {isDiscovering ? 'Discovering...' : 'Discover'}
                </button>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Enter the URL to your OpenAPI 3.x specification (JSON format)
              </p>
            </div>
            <div>
              <label className="scc-label">Server URL Override (optional)</label>
              <input
                type="url"
                value={openapi.serverUrl || ''}
                onChange={(e) => updateOpenAPI({ serverUrl: e.target.value })}
                placeholder="https://api.example.com"
                className="scc-input"
              />
            </div>
          </div>

          {discoveryError && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
              {discoveryError}
            </div>
          )}
        </section>
      )}

      {/* MCP Configuration */}
      {integrationType === 'mcp' && (
        <section className="space-y-4">
          <h3 className="text-sm font-medium text-slate-300 uppercase tracking-wider">
            MCP Server
          </h3>
          <div className="space-y-4">
            <div>
              <label className="scc-label">Transport</label>
              <select
                value={mcp.transport || 'stdio'}
                onChange={(e) => updateMCP({ transport: e.target.value as MCPTransport })}
                className="scc-input"
              >
                <option value="stdio">stdio (local process)</option>
                <option value="http">HTTP</option>
                <option value="websocket">WebSocket</option>
              </select>
            </div>

            {mcp.transport === 'stdio' && (
              <>
                <div>
                  <label className="scc-label">Command</label>
                  <input
                    type="text"
                    value={mcp.command || ''}
                    onChange={(e) => updateMCP({ command: e.target.value })}
                    placeholder="npx @anthropic/mcp-server-filesystem"
                    className="scc-input"
                  />
                </div>
                <div>
                  <label className="scc-label">Arguments (comma-separated)</label>
                  <input
                    type="text"
                    value={mcp.args?.join(', ') || ''}
                    onChange={(e) => updateMCP({
                      args: e.target.value.split(',').map(s => s.trim()).filter(Boolean),
                    })}
                    placeholder="/path/to/allowed/directory"
                    className="scc-input"
                  />
                </div>
              </>
            )}

            {(mcp.transport === 'http' || mcp.transport === 'websocket') && (
              <div>
                <label className="scc-label">Server URL</label>
                <input
                  type="url"
                  value={mcp.serverUrl || ''}
                  onChange={(e) => updateMCP({ serverUrl: e.target.value })}
                  placeholder={mcp.transport === 'websocket' ? 'ws://localhost:3000' : 'http://localhost:3000'}
                  className="scc-input"
                />
              </div>
            )}

            <button
              onClick={discoverOperations}
              disabled={isDiscovering || (!mcp.command && !mcp.serverUrl)}
              className="scc-button-primary px-4 disabled:opacity-50"
            >
              {isDiscovering ? 'Connecting...' : 'Discover Tools'}
            </button>
          </div>

          {discoveryError && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
              {discoveryError}
            </div>
          )}
        </section>
      )}

      {/* Discovered Operations */}
      {operations.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-slate-300 uppercase tracking-wider">
              Discovered Operations ({operations.length})
            </h3>
            <span className="text-xs text-slate-500">
              Available as integrations.{resource.key}.*
            </span>
          </div>

          <div className="scc-card divide-y divide-scc-border max-h-80 overflow-y-auto">
            {Object.entries(operationsByTag).map(([tag, ops]) => (
              <div key={tag}>
                <button
                  onClick={() => toggleTag(tag)}
                  className="w-full px-4 py-2 flex items-center justify-between hover:bg-scc-surface/50 transition-colors"
                >
                  <span className="font-medium text-slate-300">{tag}</span>
                  <span className="text-slate-500 text-sm">
                    {ops.length} {expandedTags.has(tag) ? '▼' : '▶'}
                  </span>
                </button>
                {expandedTags.has(tag) && (
                  <div className="px-4 pb-2 space-y-1">
                    {ops.map((op) => (
                      <div
                        key={op.id}
                        className="flex items-center gap-2 py-1 text-sm"
                      >
                        {op.method && (
                          <span className={`
                            px-1.5 py-0.5 rounded text-xs font-mono font-medium
                            ${op.method === 'GET' ? 'bg-green-500/20 text-green-400' :
                              op.method === 'POST' ? 'bg-blue-500/20 text-blue-400' :
                              op.method === 'PUT' ? 'bg-yellow-500/20 text-yellow-400' :
                              op.method === 'DELETE' ? 'bg-red-500/20 text-red-400' :
                              'bg-slate-500/20 text-slate-400'}
                          `}>
                            {op.method}
                          </span>
                        )}
                        <code className="text-slate-400 text-xs">
                          {op.id}
                        </code>
                        {op.summary && (
                          <span className="text-slate-500 truncate">
                            — {op.summary}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Authentication */}
      <section className="space-y-4">
        <h3 className="text-sm font-medium text-slate-300 uppercase tracking-wider">
          Authentication
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="scc-label">Method</label>
            <select
              value={auth.type || 'none'}
              onChange={(e) => updateAuth({ type: e.target.value as AuthMethod })}
              className="scc-input"
            >
              <option value="none">None</option>
              <option value="bearer">Bearer Token</option>
              <option value="apiKey">API Key (Header)</option>
              <option value="basic">Basic Auth</option>
              <option value="oauth2">OAuth 2.0</option>
            </select>
          </div>
          {auth.type === 'apiKey' && (
            <div>
              <label className="scc-label">Header Name</label>
              <input
                type="text"
                value={auth.header || ''}
                onChange={(e) => updateAuth({ header: e.target.value })}
                placeholder="X-API-Key"
                className="scc-input"
              />
            </div>
          )}
        </div>
        {auth.type && auth.type !== 'none' && (
          <div>
            <label className="scc-label">Credential Key</label>
            <input
              type="text"
              value={auth.credentialKey || ''}
              onChange={(e) => updateAuth({ credentialKey: e.target.value })}
              placeholder={`${resource.key}-api-key`}
              className="scc-input"
            />
            <p className="text-xs text-slate-500 mt-1">
              Reference to stored credential in Identity service
            </p>
          </div>
        )}
      </section>

      {/* Rate Limiting */}
      <section className="space-y-4">
        <h3 className="text-sm font-medium text-slate-300 uppercase tracking-wider">
          Rate Limiting
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="scc-label">Requests per Minute</label>
            <input
              type="number"
              value={rateLimit.requestsPerMinute || ''}
              onChange={(e) => updateRateLimit({ requestsPerMinute: parseInt(e.target.value) || undefined })}
              placeholder="60"
              className="scc-input"
            />
          </div>
          <div>
            <label className="scc-label">Requests per Second</label>
            <input
              type="number"
              value={rateLimit.requestsPerSecond || ''}
              onChange={(e) => updateRateLimit({ requestsPerSecond: parseInt(e.target.value) || undefined })}
              placeholder="10"
              className="scc-input"
            />
          </div>
        </div>
      </section>

      {/* Retry Policy */}
      <section className="space-y-4">
        <h3 className="text-sm font-medium text-slate-300 uppercase tracking-wider">
          Retry Policy
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="scc-label">Max Retries</label>
            <input
              type="number"
              value={retry.maxRetries ?? ''}
              onChange={(e) => updateRetry({ maxRetries: parseInt(e.target.value) || undefined })}
              placeholder="3"
              className="scc-input"
            />
          </div>
          <div>
            <label className="scc-label">Backoff (ms)</label>
            <input
              type="number"
              value={retry.backoffMs ?? ''}
              onChange={(e) => updateRetry({ backoffMs: parseInt(e.target.value) || undefined })}
              placeholder="1000"
              className="scc-input"
            />
          </div>
        </div>
        <p className="text-xs text-slate-500">
          Exponential backoff will be applied between retries.
        </p>
      </section>

      {/* Usage Example */}
      {operations.length > 0 && (
        <section className="space-y-4">
          <h3 className="text-sm font-medium text-slate-300 uppercase tracking-wider">
            Usage in Rules
          </h3>
          <div className="scc-card p-4 bg-scc-surface/50">
            <pre className="text-xs text-slate-400 overflow-x-auto">
{`# Invoke any operation via namespace path
actions:
  - type: integration.invoke
    params:
      operation: integrations.${resource.key}.${operations[0]?.id || 'operation.name'}
      body:
        # operation-specific parameters
        key: "value"`}
            </pre>
          </div>
        </section>
      )}
    </div>
  );
}
