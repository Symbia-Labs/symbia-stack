/**
 * Integrations Panel
 *
 * Unified hub for all integrations - LLM providers, OpenAPI services, MCP servers.
 * Single point of egress for all external API traffic.
 */
import { useState, useEffect, useMemo } from 'react';
import {
  integrationsClient,
  type Integration,
  type IntegrationOperation,
  type MCPConfig,
  type InvokeResponse,
} from '@/services/integrationsClient';
import { OperationPathInput } from '@/components/inputs/OperationPathInput';
import { JsonInput } from '@/components/inputs/JsonInput';
import { VisionSettings } from '@/components/panels/VisionSettings';

type TabId = 'integrations' | 'llm' | 'playground';

// =============================================================================
// Integration Card
// =============================================================================

function NewIntegrationCard({ onClick }: { onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      className="scc-card p-5 cursor-pointer transition-all border-dashed hover:border-scc-primary/50 hover:bg-scc-primary/5 group flex flex-col items-center justify-center min-h-[140px]"
    >
      <div className="w-12 h-12 rounded-full bg-scc-primary/10 flex items-center justify-center mb-3 group-hover:bg-scc-primary/20 transition-colors">
        <svg className="w-6 h-6 text-scc-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
      </div>
      <span className="text-sm font-medium text-slate-400 group-hover:text-scc-primary transition-colors">
        New Integration
      </span>
    </div>
  );
}

function IntegrationCard({
  integration,
  onClick,
}: {
  integration: Integration;
  onClick: () => void;
}) {
  const typeColors: Record<string, string> = {
    openapi: 'text-blue-400 border-blue-400/30 bg-blue-400/10',
    mcp: 'text-purple-400 border-purple-400/30 bg-purple-400/10',
    builtin: 'text-emerald-400 border-emerald-400/30 bg-emerald-400/10',
    custom: 'text-orange-400 border-orange-400/30 bg-orange-400/10',
  };

  const statusColors: Record<string, string> = {
    active: 'text-emerald-400 bg-emerald-400/10',
    pending: 'text-yellow-400 bg-yellow-400/10',
    error: 'text-red-400 bg-red-400/10',
    disabled: 'text-slate-500 bg-slate-500/10',
  };

  return (
    <div
      onClick={onClick}
      className="scc-card p-4 border-scc-border cursor-pointer hover:border-scc-primary/50 transition-all"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${typeColors[integration.type]?.split(' ')[2] || 'bg-slate-700'}`}>
            {integration.type === 'openapi' && (
              <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
            )}
            {integration.type === 'mcp' && (
              <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            )}
            {integration.type === 'builtin' && (
              <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            )}
            {integration.type === 'custom' && (
              <svg className="w-5 h-5 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 00-1-1H4a2 2 0 110-4h1a1 1 0 001-1V7a1 1 0 011-1h3a1 1 0 001-1V4z" />
              </svg>
            )}
          </div>
          <div>
            <h3 className="font-medium text-slate-200">{integration.name}</h3>
            <p className="text-xs text-slate-500 font-mono">{integration.key}</p>
          </div>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded ${statusColors[integration.status]}`}>
          {integration.status}
        </span>
      </div>

      {integration.description && (
        <p className="text-xs text-slate-400 mb-3 line-clamp-2">{integration.description}</p>
      )}

      <div className="flex items-center justify-between">
        <span className={`text-xs px-1.5 py-0.5 rounded border ${typeColors[integration.type]}`}>
          {integration.type}
        </span>
        <span className="text-xs text-slate-500">
          {integration.operations?.length || 0} operations
        </span>
      </div>
    </div>
  );
}

// =============================================================================
// Add Integration Modal
// =============================================================================

function AddIntegrationModal({
  isOpen,
  onClose,
  onSuccess,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [type, setType] = useState<'openapi' | 'mcp'>('openapi');
  const [key, setKey] = useState('');
  const [name, setName] = useState('');
  const [specUrl, setSpecUrl] = useState('');
  const [serverUrl, setServerUrl] = useState('');
  const [mcpCommand, setMcpCommand] = useState('');
  const [mcpArgs, setMcpArgs] = useState('');
  const [mcpUrl, setMcpUrl] = useState('');
  const [transport, setTransport] = useState<'stdio' | 'http' | 'websocket'>('stdio');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ operations: IntegrationOperation[]; info?: { title: string } } | null>(null);

  if (!isOpen) return null;

  const handleDiscover = async () => {
    setError(null);
    setIsLoading(true);
    setPreview(null);

    try {
      if (type === 'openapi') {
        const result = await integrationsClient.parseOpenAPISpec({
          specUrl: specUrl || undefined,
          serverUrl: serverUrl || undefined,
        });

        if (result.success) {
          setPreview({
            operations: result.operations || [],
            info: result.info,
          });
          if (result.info?.title && !name) {
            setName(result.info.title);
          }
          if (!key && result.info?.title) {
            setKey(result.info.title.toLowerCase().replace(/[^a-z0-9]/g, '-'));
          }
        } else {
          setError(result.error || 'Failed to parse OpenAPI spec');
        }
      } else {
        const config: MCPConfig = {
          transport,
          command: transport === 'stdio' ? mcpCommand : undefined,
          args: transport === 'stdio' && mcpArgs ? mcpArgs.split(' ') : undefined,
          serverUrl: transport !== 'stdio' ? mcpUrl : undefined,
        };

        const result = await integrationsClient.parseMCPServer(config);

        if (result.success) {
          setPreview({
            operations: result.operations || [],
          });
        } else {
          setError(result.error || 'Failed to discover MCP server');
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Discovery failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async () => {
    if (!key || !name) {
      setError('Key and name are required');
      return;
    }

    setError(null);
    setIsLoading(true);

    try {
      const integration: Partial<Integration> = {
        key,
        name,
        type,
        status: 'pending',
        version: 1,
      };

      if (type === 'openapi') {
        integration.openapi = {
          specUrl: specUrl || undefined,
          serverUrl: serverUrl || undefined,
        };
      } else {
        integration.mcp = {
          transport,
          command: transport === 'stdio' ? mcpCommand : undefined,
          args: transport === 'stdio' && mcpArgs ? mcpArgs.split(' ') : undefined,
          serverUrl: transport !== 'stdio' ? mcpUrl : undefined,
        };
      }

      const result = await integrationsClient.registerIntegration(integration);

      if (result.success) {
        onSuccess();
        onClose();
      } else {
        setError(result.error || 'Failed to register integration');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-scc-surface border border-scc-border rounded-lg w-full max-w-2xl max-h-[80vh] overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-4 border-b border-scc-border flex items-center justify-between">
          <h2 className="text-lg font-medium text-slate-200">Add Integration</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-4 overflow-y-auto max-h-[calc(80vh-120px)]">
          {/* Type Selector */}
          <div className="flex gap-2 mb-6">
            <button
              onClick={() => setType('openapi')}
              className={`flex-1 p-3 rounded-lg border transition-all ${
                type === 'openapi'
                  ? 'border-blue-400/50 bg-blue-400/10 text-blue-400'
                  : 'border-scc-border text-slate-400 hover:border-slate-600'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
                <span className="font-medium">OpenAPI</span>
              </div>
              <p className="text-xs text-slate-500">REST APIs via spec URL</p>
            </button>
            <button
              onClick={() => setType('mcp')}
              className={`flex-1 p-3 rounded-lg border transition-all ${
                type === 'mcp'
                  ? 'border-purple-400/50 bg-purple-400/10 text-purple-400'
                  : 'border-scc-border text-slate-400 hover:border-slate-600'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span className="font-medium">MCP Server</span>
              </div>
              <p className="text-xs text-slate-500">Model Context Protocol</p>
            </button>
          </div>

          {/* OpenAPI Config */}
          {type === 'openapi' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1">OpenAPI Spec URL *</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={specUrl}
                    onChange={e => setSpecUrl(e.target.value)}
                    placeholder="https://api.example.com/openapi.json"
                    className="scc-input flex-1 text-sm"
                  />
                  <button
                    onClick={handleDiscover}
                    disabled={isLoading || !specUrl}
                    className="scc-button px-4 text-sm"
                  >
                    {isLoading ? 'Loading...' : 'Discover'}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Server URL Override (optional)</label>
                <input
                  type="text"
                  value={serverUrl}
                  onChange={e => setServerUrl(e.target.value)}
                  placeholder="https://api.example.com"
                  className="scc-input w-full text-sm"
                />
              </div>
            </div>
          )}

          {/* MCP Config */}
          {type === 'mcp' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Transport</label>
                <div className="flex gap-2">
                  {(['stdio', 'http', 'websocket'] as const).map(t => (
                    <button
                      key={t}
                      onClick={() => setTransport(t)}
                      className={`px-3 py-1.5 text-sm rounded transition-all ${
                        transport === t
                          ? 'bg-purple-400/20 text-purple-400 border border-purple-400/50'
                          : 'text-slate-400 border border-scc-border hover:border-slate-600'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {transport === 'stdio' ? (
                <>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Command</label>
                    <input
                      type="text"
                      value={mcpCommand}
                      onChange={e => setMcpCommand(e.target.value)}
                      placeholder="npx -y @modelcontextprotocol/server-filesystem"
                      className="scc-input w-full text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Arguments</label>
                    <input
                      type="text"
                      value={mcpArgs}
                      onChange={e => setMcpArgs(e.target.value)}
                      placeholder="/path/to/allowed/directory"
                      className="scc-input w-full text-sm"
                    />
                  </div>
                </>
              ) : (
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Server URL</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={mcpUrl}
                      onChange={e => setMcpUrl(e.target.value)}
                      placeholder={transport === 'websocket' ? 'ws://localhost:3000' : 'http://localhost:3000'}
                      className="scc-input flex-1 text-sm"
                    />
                    <button
                      onClick={handleDiscover}
                      disabled={isLoading || !mcpUrl}
                      className="scc-button px-4 text-sm"
                    >
                      {isLoading ? 'Loading...' : 'Discover'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Preview */}
          {preview && (
            <div className="mt-6 p-4 bg-scc-bg rounded-lg border border-scc-border">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-slate-300">
                  Discovered {preview.operations.length} operations
                </h3>
                {preview.info && (
                  <span className="text-xs text-slate-500">{preview.info.title}</span>
                )}
              </div>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {preview.operations.slice(0, 20).map(op => (
                  <div key={op.id} className="flex items-center gap-2 text-xs">
                    {op.method && (
                      <span className={`w-14 text-center font-mono ${
                        op.method === 'GET' ? 'text-green-400' :
                        op.method === 'POST' ? 'text-blue-400' :
                        op.method === 'PUT' ? 'text-yellow-400' :
                        op.method === 'DELETE' ? 'text-red-400' : 'text-slate-400'
                      }`}>{op.method}</span>
                    )}
                    <span className="text-slate-400 font-mono">{op.path || op.id}</span>
                    {op.summary && <span className="text-slate-500 truncate">{op.summary}</span>}
                  </div>
                ))}
                {preview.operations.length > 20 && (
                  <p className="text-xs text-slate-500 mt-2">
                    ...and {preview.operations.length - 20} more
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Registration Fields */}
          {preview && (
            <div className="mt-6 space-y-4 pt-4 border-t border-scc-border">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Integration Key *</label>
                  <input
                    type="text"
                    value={key}
                    onChange={e => setKey(e.target.value)}
                    placeholder="my-api"
                    className="scc-input w-full text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Display Name *</label>
                  <input
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="My API"
                    className="scc-input w-full text-sm"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded text-sm text-red-400">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-scc-border flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200">
            Cancel
          </button>
          <button
            onClick={handleRegister}
            disabled={isLoading || !preview || !key || !name}
            className="scc-button px-4 py-2 text-sm"
          >
            {isLoading ? 'Registering...' : 'Register Integration'}
          </button>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Operations Browser - Hierarchical navigation with Symbia script field
// =============================================================================

function OperationsBrowser({
  integration,
  getMethodColor,
}: {
  integration: Integration;
  getMethodColor: (method?: string) => string;
}) {
  const [searchPath, setSearchPath] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  // Build tag-based hierarchy from operations
  const operationsByTag = useMemo(() => {
    const byTag = new Map<string, IntegrationOperation[]>();
    const noTag: IntegrationOperation[] = [];

    for (const op of integration.operations || []) {
      if (op.tags && op.tags.length > 0) {
        for (const tag of op.tags) {
          if (!byTag.has(tag)) {
            byTag.set(tag, []);
          }
          byTag.get(tag)!.push(op);
        }
      } else {
        noTag.push(op);
      }
    }

    if (noTag.length > 0) {
      byTag.set('Other', noTag);
    }

    return byTag;
  }, [integration.operations]);

  // Build path-based hierarchy from operations
  const operationsByPath = useMemo(() => {
    const byPath = new Map<string, IntegrationOperation[]>();

    for (const op of integration.operations || []) {
      // Extract first path segment (e.g., /chat/completions -> chat)
      const pathParts = op.path?.split('/').filter(Boolean) || [];
      const topLevel = pathParts[0] || 'root';

      if (!byPath.has(topLevel)) {
        byPath.set(topLevel, []);
      }
      byPath.get(topLevel)!.push(op);
    }

    return byPath;
  }, [integration.operations]);

  // Filter operations based on search
  const filteredOperations = useMemo(() => {
    if (!searchPath) return integration.operations || [];

    const lower = searchPath.toLowerCase();
    return (integration.operations || []).filter(op =>
      op.id.toLowerCase().includes(lower) ||
      op.path?.toLowerCase().includes(lower) ||
      op.summary?.toLowerCase().includes(lower) ||
      op.tags?.some(t => t.toLowerCase().includes(lower))
    );
  }, [integration.operations, searchPath]);

  // Get unique tags sorted by operation count
  const sortedTags = useMemo(() => {
    return Array.from(operationsByTag.entries())
      .sort((a: [string, IntegrationOperation[]], b: [string, IntegrationOperation[]]) => b[1].length - a[1].length)
      .map((entry: [string, IntegrationOperation[]]) => entry[0]);
  }, [operationsByTag]);

  const toggleGroup = (group: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(group)) {
        next.delete(group);
      } else {
        next.add(group);
      }
      return next;
    });
  };

  // Operations to display based on filters
  const displayOperations = selectedTag
    ? operationsByTag.get(selectedTag) || []
    : filteredOperations;

  return (
    <div className="space-y-4">
      {/* Symbia Script Path Field */}
      <div className="scc-card p-4">
        <label className="block text-xs text-slate-400 mb-2">Quick Navigation (Symbia Script)</label>
        <OperationPathInput
          value={searchPath ? `integrations.${integration.key}.${searchPath}` : ''}
          onChange={(val) => {
            // Extract the operation part after integrations.{key}.
            const prefix = `integrations.${integration.key}.`;
            if (val.startsWith(prefix)) {
              setSearchPath(val.slice(prefix.length));
            } else if (val.startsWith('integrations.')) {
              setSearchPath(val.slice('integrations.'.length));
            } else {
              setSearchPath(val);
            }
          }}
          placeholder={`integrations.${integration.key}.chat.completions.create`}
        />
        <p className="text-xs text-slate-600 mt-1">
          Type to search or paste a full namespace path
        </p>
      </div>

      {/* Tag Filter Chips */}
      {sortedTags.length > 1 && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setSelectedTag(null)}
            className={`px-3 py-1.5 text-xs rounded-full transition-all ${
              selectedTag === null
                ? 'bg-scc-primary text-white'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
            }`}
          >
            All ({integration.operations?.length || 0})
          </button>
          {sortedTags.slice(0, 12).map((tag: string) => (
            <button
              key={tag}
              onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
              className={`px-3 py-1.5 text-xs rounded-full transition-all ${
                selectedTag === tag
                  ? 'bg-scc-primary text-white'
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
              }`}
            >
              {tag} ({operationsByTag.get(tag)?.length || 0})
            </button>
          ))}
          {sortedTags.length > 12 && (
            <span className="px-3 py-1.5 text-xs text-slate-500">
              +{sortedTags.length - 12} more
            </span>
          )}
        </div>
      )}

      {/* Path-based Groups (when no tag selected and no search) */}
      {!selectedTag && !searchPath && operationsByPath.size > 1 && (
        <div className="space-y-2">
          {Array.from(operationsByPath.entries())
            .sort((a: [string, IntegrationOperation[]], b: [string, IntegrationOperation[]]) => b[1].length - a[1].length)
            .map(([pathGroup, ops]: [string, IntegrationOperation[]]) => (
              <div key={pathGroup} className="scc-card overflow-hidden">
                <button
                  onClick={() => toggleGroup(pathGroup)}
                  className="w-full p-3 flex items-center justify-between hover:bg-slate-800/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <svg
                      className={`w-4 h-4 text-slate-500 transition-transform ${
                        expandedGroups.has(pathGroup) ? 'rotate-90' : ''
                      }`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                    <span className="text-sm font-mono text-slate-300">/{pathGroup}</span>
                  </div>
                  <span className="text-xs text-slate-500">{ops.length} endpoints</span>
                </button>

                {expandedGroups.has(pathGroup) && (
                  <div className="border-t border-scc-border">
                    {ops.map((op: IntegrationOperation) => (
                      <OperationRow
                        key={op.id}
                        integration={integration}
                        operation={op}
                        getMethodColor={getMethodColor}
                      />
                    ))}
                  </div>
                )}
              </div>
            ))}
        </div>
      )}

      {/* Flat list (when searching or tag selected) */}
      {(selectedTag || searchPath) && (
        <div className="space-y-2">
          {displayOperations.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              <p>No operations match your search.</p>
            </div>
          ) : (
            displayOperations.map((op: IntegrationOperation) => (
              <div key={op.id} className="scc-card">
                <OperationRow
                  integration={integration}
                  operation={op}
                  getMethodColor={getMethodColor}
                />
              </div>
            ))
          )}
        </div>
      )}

      {/* Summary when no filters */}
      {!selectedTag && !searchPath && operationsByPath.size <= 1 && (
        <div className="space-y-2">
          {(integration.operations || []).map(op => (
            <div key={op.id} className="scc-card">
              <OperationRow
                integration={integration}
                operation={op}
                getMethodColor={getMethodColor}
              />
            </div>
          ))}
        </div>
      )}

      {(!integration.operations || integration.operations.length === 0) && (
        <div className="text-center py-12 text-slate-500">
          <p>No operations discovered yet.</p>
          <p className="text-sm mt-1">Operations are auto-discovered from the API spec.</p>
        </div>
      )}
    </div>
  );
}

function OperationRow({
  integration,
  operation: op,
  getMethodColor,
}: {
  integration: Integration;
  operation: IntegrationOperation;
  getMethodColor: (method?: string) => string;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="hover:bg-slate-800/30 transition-colors">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-4 text-left"
      >
        <div className="flex items-center gap-3 mb-1">
          {op.method && (
            <span className={`px-2 py-0.5 text-xs font-mono rounded ${getMethodColor(op.method)}`}>
              {op.method}
            </span>
          )}
          <span className="text-sm text-slate-200 font-mono flex-1 truncate">{op.path || op.id}</span>
          {op.deprecated && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400">deprecated</span>
          )}
          <svg
            className={`w-4 h-4 text-slate-500 transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
        {op.summary && (
          <p className="text-sm text-slate-400 truncate">{op.summary}</p>
        )}
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3">
          {/* Full description */}
          {op.description && op.description !== op.summary && (
            <p className="text-xs text-slate-500">{op.description}</p>
          )}

          {/* Namespace path */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-600">Namespace:</span>
            <code className="text-xs text-purple-400 bg-purple-400/10 px-2 py-1 rounded font-mono">
              integrations.{integration.key}.{op.id}
            </code>
            <button
              onClick={(e) => {
                e.stopPropagation();
                navigator.clipboard.writeText(`integrations.${integration.key}.${op.id}`);
              }}
              className="text-slate-500 hover:text-slate-300"
              title="Copy namespace"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </button>
          </div>

          {/* Tags */}
          {op.tags && op.tags.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-600">Tags:</span>
              <div className="flex gap-1">
                {op.tags.map(tag => (
                  <span key={tag} className="px-1.5 py-0.5 text-xs rounded bg-slate-800 text-slate-500">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Parameters preview */}
          {op.parameters && op.parameters.length > 0 && (
            <div>
              <span className="text-xs text-slate-600 block mb-1">Parameters:</span>
              <div className="text-xs space-y-1">
                {op.parameters.slice(0, 5).map(param => (
                  <div key={param.name} className="flex items-center gap-2">
                    <code className="text-blue-400">{param.name}</code>
                    <span className="text-slate-600">({param.location})</span>
                    {param.required && <span className="text-red-400">*</span>}
                    {param.description && (
                      <span className="text-slate-500 truncate">{param.description}</span>
                    )}
                  </div>
                ))}
                {op.parameters.length > 5 && (
                  <span className="text-slate-500">+{op.parameters.length - 5} more</span>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Integration Configuration Panel
// =============================================================================

function IntegrationConfigPanel({
  integration,
  onClose,
  onRefresh,
}: {
  integration: Integration;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const [activeSection, setActiveSection] = useState<'overview' | 'operations' | 'auth' | 'settings'>('overview');
  const [credential, setCredential] = useState<import('@/services/identityClient').Credential | null>(null);
  const [isLoadingCredential, setIsLoadingCredential] = useState(true);
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);

  // Load credential for this integration
  useEffect(() => {
    const loadCredential = async () => {
      setIsLoadingCredential(true);
      try {
        const { identityClient } = await import('@/services/identityClient');
        const cred = await identityClient.getCredentialForProvider(integration.key);
        setCredential(cred);
      } catch (err) {
        console.error('Failed to load credential:', err);
      } finally {
        setIsLoadingCredential(false);
      }
    };
    loadCredential();
  }, [integration.key]);

  const sections = [
    { id: 'overview' as const, label: 'Overview' },
    { id: 'operations' as const, label: `Operations (${integration.operations?.length || 0})` },
    { id: 'auth' as const, label: 'Authentication' },
    { id: 'settings' as const, label: 'Settings' },
  ];

  const typeLabels: Record<string, string> = {
    openapi: 'OpenAPI',
    mcp: 'MCP Server',
    builtin: 'Built-in Provider',
    custom: 'Custom',
  };

  const getMethodColor = (method?: string) => {
    switch (method) {
      case 'GET': return 'text-green-400 bg-green-400/10';
      case 'POST': return 'text-blue-400 bg-blue-400/10';
      case 'PUT': return 'text-yellow-400 bg-yellow-400/10';
      case 'PATCH': return 'text-orange-400 bg-orange-400/10';
      case 'DELETE': return 'text-red-400 bg-red-400/10';
      default: return 'text-slate-400 bg-slate-400/10';
    }
  };

  return (
    <div className="h-full flex flex-col bg-scc-bg">
      {/* Header */}
      <div className="shrink-0 p-6 border-b border-scc-border bg-scc-surface">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div>
              <h1 className="text-xl font-semibold text-slate-100">{integration.name}</h1>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-sm text-slate-500 font-mono">{integration.key}</span>
                <span className="text-xs px-2 py-0.5 rounded bg-slate-700 text-slate-400">
                  {typeLabels[integration.type] || integration.type}
                </span>
                <span className={`text-xs px-2 py-0.5 rounded ${
                  integration.status === 'active' ? 'bg-emerald-500/20 text-emerald-400' :
                  integration.status === 'error' ? 'bg-red-500/20 text-red-400' :
                  'bg-slate-700 text-slate-400'
                }`}>
                  {integration.status}
                </span>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-2">
            {!credential && (
              <button
                onClick={() => setShowApiKeyModal(true)}
                className="scc-button px-4 py-2 text-sm"
              >
                Configure API Key
              </button>
            )}
          </div>
        </div>

        {/* Section Tabs */}
        <div className="flex gap-1 mt-4">
          {sections.map(section => (
            <button
              key={section.id}
              onClick={() => setActiveSection(section.id)}
              className={`px-4 py-2 text-sm rounded-t transition-all ${
                activeSection === section.id
                  ? 'bg-scc-bg text-slate-200 border-t border-l border-r border-scc-border'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {section.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {activeSection === 'overview' && (
          <div className="space-y-6">
            {/* Description */}
            {integration.description && (
              <div className="scc-card p-4">
                <h3 className="text-sm font-medium text-slate-300 mb-2">Description</h3>
                <p className="text-sm text-slate-400">{integration.description}</p>
              </div>
            )}

            {/* Connection Info */}
            <div className="scc-card p-4">
              <h3 className="text-sm font-medium text-slate-300 mb-3">Connection</h3>
              <div className="space-y-3">
                {integration.openapi?.serverUrl && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500">Server URL</span>
                    <span className="text-sm text-slate-300 font-mono">{integration.openapi.serverUrl}</span>
                  </div>
                )}
                {integration.openapi?.specUrl && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500">OpenAPI Spec</span>
                    <a
                      href={integration.openapi.specUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-scc-primary hover:underline font-mono"
                    >
                      {integration.openapi.specUrl}
                    </a>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500">Namespace</span>
                  <span className="text-sm text-purple-400 font-mono">integrations.{integration.key}.*</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500">Operations</span>
                  <span className="text-sm text-slate-300">{integration.operations?.length || 0} available</span>
                </div>
              </div>
            </div>

            {/* Auth Status */}
            <div className="scc-card p-4">
              <h3 className="text-sm font-medium text-slate-300 mb-3">Authentication</h3>
              {isLoadingCredential ? (
                <div className="flex items-center gap-2 text-slate-500">
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Loading...
                </div>
              ) : credential ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-emerald-400">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-sm">API Key Configured</span>
                  </div>
                  <p className="text-xs text-slate-500">
                    {credential.isOrgWide ? 'Organization-wide' : 'Personal'} •
                    Added {new Date(credential.createdAt).toLocaleDateString()}
                  </p>
                  <button
                    onClick={() => setShowApiKeyModal(true)}
                    className="text-xs text-scc-primary hover:underline"
                  >
                    Update credentials
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-yellow-400">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <span className="text-sm">No API Key Configured</span>
                  </div>
                  <p className="text-xs text-slate-500">
                    Configure credentials to use this integration
                  </p>
                  <button
                    onClick={() => setShowApiKeyModal(true)}
                    className="text-xs text-scc-primary hover:underline"
                  >
                    Add API key
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {activeSection === 'operations' && (
          <OperationsBrowser
            integration={integration}
            getMethodColor={getMethodColor}
          />
        )}

        {activeSection === 'auth' && (
          <div className="scc-card p-6">
            <h3 className="text-lg font-medium text-slate-200 mb-4">API Key Management</h3>

            {credential ? (
              <div className="space-y-4">
                <div className="p-4 bg-scc-bg rounded border border-scc-border">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-slate-300">{credential.name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded ${
                      credential.isOrgWide ? 'bg-purple-500/20 text-purple-400' : 'bg-slate-700 text-slate-400'
                    }`}>
                      {credential.isOrgWide ? 'Organization' : 'Personal'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    Created {new Date(credential.createdAt).toLocaleDateString()}
                    {credential.lastUsedAt && ` • Last used ${new Date(credential.lastUsedAt).toLocaleDateString()}`}
                  </p>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => setShowApiKeyModal(true)}
                    className="scc-button px-4 py-2 text-sm"
                  >
                    Update Key
                  </button>
                  <button
                    onClick={async () => {
                      if (confirm('Remove this API key?')) {
                        const { identityClient } = await import('@/services/identityClient');
                        await identityClient.deleteCredential(credential.id);
                        setCredential(null);
                        onRefresh();
                      }
                    }}
                    className="px-4 py-2 text-sm text-red-400 hover:text-red-300 border border-red-500/30 rounded hover:border-red-500/50 transition-colors"
                  >
                    Remove Key
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-center py-8">
                <p className="text-slate-400 mb-4">No API key configured for this integration.</p>
                <button
                  onClick={() => setShowApiKeyModal(true)}
                  className="scc-button px-6 py-2"
                >
                  Add API Key
                </button>
              </div>
            )}
          </div>
        )}

        {activeSection === 'settings' && (
          <div className="space-y-6">
            <div className="scc-card p-4">
              <h3 className="text-sm font-medium text-slate-300 mb-3">Integration Settings</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Timeout (ms)</label>
                  <input
                    type="number"
                    defaultValue={30000}
                    className="scc-input w-full text-sm"
                    placeholder="30000"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Rate Limit (requests/min)</label>
                  <input
                    type="number"
                    defaultValue={60}
                    className="scc-input w-full text-sm"
                    placeholder="60"
                  />
                </div>
              </div>
            </div>

            {integration.type !== 'builtin' && (
              <div className="scc-card p-4 border-red-500/30">
                <h3 className="text-sm font-medium text-red-400 mb-2">Danger Zone</h3>
                <p className="text-xs text-slate-500 mb-4">
                  Removing this integration will delete all configuration and credentials.
                </p>
                <button className="px-4 py-2 text-sm text-red-400 border border-red-500/30 rounded hover:bg-red-500/10 transition-colors">
                  Remove Integration
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* API Key Modal */}
      {showApiKeyModal && (
        <ProviderConfigModal
          provider={integration.key}
          existingCredential={credential}
          isOpen={true}
          onClose={() => setShowApiKeyModal(false)}
          onSave={async (data) => {
            const { identityClient } = await import('@/services/identityClient');
            if (credential) {
              await identityClient.deleteCredential(credential.id);
            }
            await identityClient.createCredential(data);
            const cred = await identityClient.getCredentialForProvider(integration.key);
            setCredential(cred);
            onRefresh();
          }}
          onDelete={async () => {
            if (credential) {
              const { identityClient } = await import('@/services/identityClient');
              await identityClient.deleteCredential(credential.id);
              setCredential(null);
              onRefresh();
            }
          }}
        />
      )}
    </div>
  );
}

// =============================================================================
// Invoke Playground
// =============================================================================

function InvokePlayground({
  integration,
  operation,
  onClose,
}: {
  integration?: Integration;
  operation?: IntegrationOperation;
  onClose: () => void;
}) {
  const [operationPath, setOperationPath] = useState(
    operation && integration
      ? `integrations.${integration.key}.${operation.id}`
      : ''
  );
  const [params, setParams] = useState('{}');
  const [body, setBody] = useState('{}');
  const [isExecuting, setIsExecuting] = useState(false);
  const [response, setResponse] = useState<InvokeResponse | null>(null);

  // Update when operation changes
  useEffect(() => {
    if (operation && integration) {
      setOperationPath(`integrations.${integration.key}.${operation.id}`);

      // Build sample body from request body schema
      if (operation.requestBody?.schema) {
        const schema = operation.requestBody.schema as { properties?: Record<string, { type?: string; example?: unknown }> };
        const sample: Record<string, unknown> = {};
        if (schema.properties) {
          for (const [key, prop] of Object.entries(schema.properties)) {
            if (prop.example !== undefined) {
              sample[key] = prop.example;
            } else if (prop.type === 'string') {
              sample[key] = '';
            } else if (prop.type === 'number' || prop.type === 'integer') {
              sample[key] = 0;
            } else if (prop.type === 'boolean') {
              sample[key] = false;
            } else if (prop.type === 'array') {
              sample[key] = [];
            } else if (prop.type === 'object') {
              sample[key] = {};
            }
          }
        }
        setBody(JSON.stringify(sample, null, 2));
      }

      // Build sample params from path/query parameters
      if (operation.parameters?.length) {
        const sampleParams: Record<string, unknown> = {};
        for (const param of operation.parameters) {
          if (param.example !== undefined) {
            sampleParams[param.name] = param.example;
          } else if (param.required) {
            sampleParams[param.name] = '';
          }
        }
        setParams(JSON.stringify(sampleParams, null, 2));
      }
    }
  }, [operation, integration]);

  const handleExecute = async () => {
    if (!operationPath) return;

    setIsExecuting(true);
    setResponse(null);

    try {
      let parsedParams: Record<string, unknown> = {};
      let parsedBody: unknown;

      try {
        parsedParams = JSON.parse(params);
      } catch {
        // Ignore parse error, use empty object
      }

      try {
        parsedBody = JSON.parse(body);
      } catch {
        // Use raw body if not valid JSON
        parsedBody = body;
      }

      const result = await integrationsClient.invoke(operationPath, {
        params: parsedParams,
        body: parsedBody,
      });

      setResponse(result);
    } catch (error) {
      setResponse({
        success: false,
        error: error instanceof Error ? error.message : 'Execution failed',
        requestId: 'local_error',
        durationMs: 0,
        operation: operationPath,
        integration: integration?.key || 'unknown',
      });
    } finally {
      setIsExecuting(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-scc-surface">
      {/* Header */}
      <div className="p-4 border-b border-scc-border flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-slate-200">Invoke Operation</h3>
          {operation && (
            <p className="text-xs text-slate-500 mt-0.5">
              {operation.method} {operation.path || operation.id}
            </p>
          )}
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-200">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Operation Path */}
        <div>
          <label className="block text-xs text-slate-400 mb-1">Operation Path</label>
          <OperationPathInput
            value={operationPath}
            onChange={setOperationPath}
            onOperationSelect={(_selectedIntegration, selectedOperation) => {
              // Build sample body from request body schema
              if (selectedOperation.requestBody?.schema) {
                const schema = selectedOperation.requestBody.schema as { properties?: Record<string, { type?: string; example?: unknown }> };
                const sample: Record<string, unknown> = {};
                if (schema.properties) {
                  for (const [key, prop] of Object.entries(schema.properties)) {
                    if (prop.example !== undefined) {
                      sample[key] = prop.example;
                    } else if (prop.type === 'string') {
                      sample[key] = '';
                    } else if (prop.type === 'number' || prop.type === 'integer') {
                      sample[key] = 0;
                    } else if (prop.type === 'boolean') {
                      sample[key] = false;
                    } else if (prop.type === 'array') {
                      sample[key] = [];
                    } else if (prop.type === 'object') {
                      sample[key] = {};
                    }
                  }
                }
                setBody(JSON.stringify(sample, null, 2));
              }

              // Build sample params from path/query parameters
              if (selectedOperation.parameters?.length) {
                const sampleParams: Record<string, unknown> = {};
                for (const param of selectedOperation.parameters) {
                  if (param.example !== undefined) {
                    sampleParams[param.name] = param.example;
                  } else if (param.required) {
                    sampleParams[param.name] = '';
                  }
                }
                setParams(JSON.stringify(sampleParams, null, 2));
              }
            }}
          />
          <p className="text-xs text-slate-500 mt-1">
            Type <code className="text-purple-400">integrations.</code> to see available APIs
          </p>
        </div>

        {/* Parameters */}
        <JsonInput
          value={params}
          onChange={setParams}
          rows={4}
          label="Parameters (path/query)"
        />

        {/* Request Body */}
        <JsonInput
          value={body}
          onChange={setBody}
          rows={8}
          label="Request Body"
        />

        {/* Execute Button */}
        <button
          onClick={handleExecute}
          disabled={isExecuting || !operationPath}
          className={`
            w-full py-2.5 rounded font-medium transition-all
            ${isExecuting
              ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
              : 'bg-scc-primary hover:bg-scc-primary/80 text-white'
            }
          `}
        >
          {isExecuting ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Executing...
            </span>
          ) : (
            'Execute'
          )}
        </button>

        {/* Response */}
        {response && (
          <div className="p-4 bg-scc-bg rounded-lg border border-scc-border">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-medium text-slate-300">Response</h4>
              <div className="flex items-center gap-3 text-xs">
                {response.success ? (
                  <span className="text-emerald-400">Success</span>
                ) : (
                  <span className="text-red-400">Failed</span>
                )}
                <span className="text-slate-500">{response.durationMs}ms</span>
                <span className="text-slate-600 font-mono">{response.requestId?.slice(0, 8)}</span>
              </div>
            </div>

            {response.error && (
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded text-sm text-red-400 mb-3">
                {response.error}
              </div>
            )}

            {response.data !== undefined && (
              <pre className="p-3 bg-slate-900 rounded text-xs text-slate-300 font-mono overflow-x-auto max-h-64">
                {JSON.stringify(response.data, null, 2)}
              </pre>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// LLM Providers Section with Credential Management
// =============================================================================

// Provider metadata for display
const PROVIDER_INFO: Record<string, { name: string; icon: string; description: string; docsUrl: string }> = {
  openai: {
    name: 'OpenAI',
    icon: '🧠',
    description: 'GPT-4o, o1, o3, and embedding models',
    docsUrl: 'https://platform.openai.com/api-keys',
  },
  anthropic: {
    name: 'Anthropic',
    icon: '🔮',
    description: 'Claude 4, Claude 3.5 Sonnet, Opus, and Haiku',
    docsUrl: 'https://console.anthropic.com/settings/keys',
  },
  huggingface: {
    name: 'Hugging Face',
    icon: '🤗',
    description: 'Open source models via Inference API',
    docsUrl: 'https://huggingface.co/settings/tokens',
  },
};

function ProviderConfigModal({
  provider,
  existingCredential,
  isOpen,
  onClose,
  onSave,
  onDelete,
}: {
  provider: string;
  existingCredential: import('@/services/identityClient').Credential | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: import('@/services/identityClient').CreateCredentialRequest) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState(existingCredential?.metadata?.baseUrl || '');
  const [isOrgWide, setIsOrgWide] = useState(existingCredential?.isOrgWide || false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const info = PROVIDER_INFO[provider] || { name: provider, icon: '🔌', description: '', docsUrl: '' };

  if (!isOpen) return null;

  const handleSave = async () => {
    if (!apiKey && !existingCredential) {
      setError('API key is required');
      return;
    }

    setError(null);
    setIsSaving(true);

    try {
      await onSave({
        provider,
        name: `${info.name} API Key`,
        apiKey: apiKey || 'unchanged', // Backend should handle this
        isOrgWide,
        metadata: baseUrl ? { baseUrl } : undefined,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to remove this API key?')) return;

    setIsDeleting(true);
    try {
      await onDelete();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-scc-surface border border-scc-border rounded-lg w-full max-w-md overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-4 border-b border-scc-border flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{info.icon}</span>
            <div>
              <h2 className="text-lg font-medium text-slate-200">
                {existingCredential ? 'Update' : 'Configure'} {info.name}
              </h2>
              <p className="text-xs text-slate-500">{info.description}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* API Key */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">
              API Key {existingCredential ? '(leave blank to keep current)' : '*'}
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder={existingCredential ? '••••••••••••••••' : 'sk-...'}
              className="scc-input w-full text-sm font-mono"
              autoComplete="off"
            />
            {info.docsUrl && (
              <a
                href={info.docsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-scc-primary hover:underline mt-1 inline-block"
              >
                Get API key from {info.name} →
              </a>
            )}
          </div>

          {/* Custom Base URL */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">
              Custom Base URL (optional)
            </label>
            <input
              type="text"
              value={baseUrl}
              onChange={e => setBaseUrl(e.target.value)}
              placeholder="https://api.openai.com/v1"
              className="scc-input w-full text-sm"
            />
            <p className="text-xs text-slate-600 mt-1">
              Use for Azure OpenAI, local models, or custom endpoints
            </p>
          </div>

          {/* Org-wide toggle */}
          <div className="flex items-center justify-between p-3 bg-scc-bg rounded border border-scc-border">
            <div>
              <label className="text-sm text-slate-300">Share with organization</label>
              <p className="text-xs text-slate-500">Allow all org members to use this key</p>
            </div>
            <button
              onClick={() => setIsOrgWide(!isOrgWide)}
              className={`relative w-10 h-5 rounded-full transition-colors ${
                isOrgWide ? 'bg-scc-primary' : 'bg-slate-600'
              }`}
            >
              <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
                isOrgWide ? 'translate-x-5' : ''
              }`} />
            </button>
          </div>

          {/* Error */}
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded text-sm text-red-400">
              {error}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-scc-border flex justify-between">
          <div>
            {existingCredential && (
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="px-4 py-2 text-sm text-red-400 hover:text-red-300 disabled:opacity-50"
              >
                {isDeleting ? 'Removing...' : 'Remove Key'}
              </button>
            )}
          </div>
          <div className="flex gap-3">
            <button onClick={onClose} className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200">
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="scc-button px-4 py-2 text-sm"
            >
              {isSaving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Main Panel
// =============================================================================

function IntegrationsErrorBanner({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="mb-4 p-4 bg-red-500/10 border border-red-500/30 rounded flex items-start justify-between gap-4">
      <div className="flex items-start gap-3">
        <svg className="w-5 h-5 text-red-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
        </svg>
        <div>
          <p className="text-sm font-medium text-red-400">Couldn't load integrations</p>
          <p className="text-xs text-slate-400 mt-1">{message}</p>
        </div>
      </div>
      <button
        onClick={onRetry}
        className="shrink-0 px-3 py-1.5 text-xs text-slate-200 border border-scc-border rounded hover:bg-slate-800 transition-colors"
      >
        Retry
      </button>
    </div>
  );
}

export function IntegrationsPanel() {
  const [activeTab, setActiveTab] = useState<TabId>('integrations');
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedIntegration, setSelectedIntegration] = useState<Integration | null>(null);

  // LLM provider credentials are managed through the identity service, which is
  // independent of the integrations gateway — so provider onboarding stays
  // available even when listIntegrations() below is failing.
  const [credentials, setCredentials] = useState<import('@/services/identityClient').Credential[]>([]);
  const [credsError, setCredsError] = useState<string | null>(null);
  const [llmProviderKey, setLlmProviderKey] = useState<string | null>(null);

  const loadIntegrations = async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const data = await integrationsClient.listIntegrations();
      setIntegrations(data);
    } catch (error) {
      console.error('Failed to load integrations:', error);
      setLoadError(
        error instanceof Error
          ? error.message
          : 'Could not reach the integrations gateway.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  // SYMBIA_MARKER_T03_CREDS_20260805
  // This swallowed the error to console and left credentials as []. Every
  // provider card then displayed "Not configured" — a confident claim about
  // the user's account produced by a request that failed. Record the failure
  // so the cards can say "unknown" instead of asserting absence.
  const loadCredentials = async () => {
    try {
      const { identityClient } = await import('@/services/identityClient');
      setCredentials(await identityClient.listCredentials());
      setCredsError(null);
    } catch (error) {
      console.error('Failed to load credentials:', error);
      setCredsError(
        error instanceof Error
          ? `identity service: ${error.message}`
          : 'identity service unreachable'
      );
    }
  };

  useEffect(() => {
    loadIntegrations();
    loadCredentials();
  }, []);

  const tabs: { id: TabId; label: string }[] = [
    { id: 'integrations', label: 'All Integrations' },
    { id: 'llm', label: 'LLM Providers' },
    { id: 'playground', label: 'Playground' },
  ];

  // If an integration is selected, show its config panel
  if (selectedIntegration) {
    return (
      <IntegrationConfigPanel
        integration={selectedIntegration}
        onClose={() => setSelectedIntegration(null)}
        onRefresh={loadIntegrations}
      />
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="shrink-0 p-6 border-b border-scc-border">
        <div className="mb-4">
          <h1 className="text-xl font-semibold text-slate-100">Integrations</h1>
          <p className="text-sm text-slate-500 mt-1">
            Unified gateway for all external API traffic
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm rounded-t transition-all ${
                activeTab === tab.id
                  ? 'bg-scc-surface text-slate-200 border-t border-l border-r border-scc-border'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'integrations' && (
          <div className="h-full overflow-y-auto p-6">
            {isLoading ? (
              <div className="flex items-center justify-center h-64">
                <svg className="w-8 h-8 animate-spin text-slate-500" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              </div>
            ) : (
              <>
                {loadError && (
                  <IntegrationsErrorBanner message={loadError} onRetry={loadIntegrations} />
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {/* New Integration Card */}
                  <NewIntegrationCard onClick={() => setShowAddModal(true)} />

                  {/* Existing Integrations */}
                  {integrations.map(integration => (
                    <IntegrationCard
                      key={integration.id}
                      integration={integration}
                      onClick={() => setSelectedIntegration(integration)}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === 'llm' && (
          <div className="h-full overflow-y-auto p-6">
            {loadError && (
              <IntegrationsErrorBanner message={loadError} onRetry={loadIntegrations} />
            )}

            {/* Which model looks at spyglass frames. It sits with the providers
                because that is what it selects between, and deliberately NOT in
                the spyglass or the chat window — an instrument should not carry
                its own settings screen. */}
            <div className="mb-6">
              <VisionSettings />
            </div>

            {/* Add / manage LLM provider API keys. Credentials go through the
                identity service, so this works even when the integrations
                gateway (above) is unavailable. */}
            <div className="mb-2 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-medium text-slate-200">LLM Providers</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Add an API key to enable a provider for assistants and the playground.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
              {Object.entries(PROVIDER_INFO).map(([key, info]) => {
                const cred = credentials.find(c => c.provider === key) || null;
                return (
                  <button
                    key={key}
                    onClick={() => setLlmProviderKey(key)}
                    className="scc-card p-4 text-left hover:border-scc-primary/50 transition-colors flex flex-col gap-3"
                  >
                    <div className="flex items-start justify-between">
                      <span className="text-2xl">{info.icon}</span>
                      <span
                        className={`text-xs px-2 py-0.5 rounded ${
                          credsError
                            ? 'bg-amber-500/20 text-amber-400'
                            : cred
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : 'bg-slate-700 text-slate-400'
                        }`}
                        title={credsError ?? undefined}
                      >
                        {credsError
                          ? 'Status unknown'
                          : cred
                          ? 'Configured'
                          : 'Not configured'}
                      </span>
                    </div>
                    <div>
                      <h3 className="text-sm font-medium text-slate-200">{info.name}</h3>
                      <p className="text-xs text-slate-500 mt-1">{info.description}</p>
                    </div>
                    <span className="text-xs text-scc-primary mt-auto">
                      {cred ? 'Manage API key →' : 'Add API key →'}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Provider-backed integrations discovered via the gateway */}
            {isLoading ? (
              <div className="flex items-center justify-center h-32">
                <svg className="w-8 h-8 animate-spin text-slate-500" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              </div>
            ) : (
              (() => {
                const llmIntegrations = integrations.filter(i => i.type === 'builtin' || i.operations?.some(op =>
                  op.tags?.includes('llm') || op.tags?.includes('chat') || op.tags?.includes('embedding')
                ));
                if (llmIntegrations.length === 0) return null;
                return (
                  <>
                    <h2 className="text-sm font-medium text-slate-200 mb-2">Provider integrations</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {llmIntegrations.map(integration => (
                        <IntegrationCard
                          key={integration.id}
                          integration={integration}
                          onClick={() => setSelectedIntegration(integration)}
                        />
                      ))}
                    </div>
                  </>
                );
              })()
            )}
          </div>
        )}

        {activeTab === 'playground' && (
          <div className="h-full">
            <InvokePlayground
              onClose={() => setActiveTab('integrations')}
            />
          </div>
        )}
      </div>

      {/* Add Integration Modal */}
      <AddIntegrationModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSuccess={loadIntegrations}
      />

      {/* LLM Provider API Key Modal */}
      {llmProviderKey && (
        <ProviderConfigModal
          provider={llmProviderKey}
          existingCredential={credentials.find(c => c.provider === llmProviderKey) || null}
          isOpen={true}
          onClose={() => setLlmProviderKey(null)}
          onSave={async (data) => {
            const { identityClient } = await import('@/services/identityClient');
            const existing = credentials.find(c => c.provider === data.provider);
            if (existing) {
              await identityClient.deleteCredential(existing.id);
            }
            await identityClient.createCredential(data);
            await loadCredentials();
          }}
          onDelete={async () => {
            const existing = credentials.find(c => c.provider === llmProviderKey);
            if (existing) {
              const { identityClient } = await import('@/services/identityClient');
              await identityClient.deleteCredential(existing.id);
              await loadCredentials();
            }
          }}
        />
      )}
    </div>
  );
}
