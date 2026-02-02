/**
 * Integrations Demo Component
 *
 * Interactive demonstration of Symbia's integration system:
 * - OpenAPI spec → registered integration → invoke flow
 * - MCP server discovery and tool execution
 */

import { useState, useEffect } from 'react';

// =============================================================================
// TYPES
// =============================================================================

interface Provider {
  name: string;
  key: string;
  icon: string;
  operations: string[];
  models?: string[];
}

interface MCPToolGroup {
  name: string;
  icon: string;
  toolCount: number;
  source: 'internal' | 'external';
}

// =============================================================================
// DEMO DATA (fallback when platform unavailable)
// =============================================================================

const DEMO_PROVIDERS: Provider[] = [
  { name: 'OpenAI', key: 'openai', icon: '🤖', operations: ['chat.completions.create', 'embeddings.create'], models: ['gpt-4', 'gpt-4-turbo', 'gpt-3.5-turbo'] },
  { name: 'Anthropic', key: 'anthropic', icon: '🧠', operations: ['messages.create'], models: ['claude-3-opus', 'claude-3-sonnet', 'claude-3-haiku'] },
  { name: 'Google', key: 'google', icon: '🔮', operations: ['generateContent', 'embedContent'], models: ['gemini-pro', 'gemini-ultra'] },
  { name: 'Mistral', key: 'mistral', icon: '🌬️', operations: ['chat.completions.create', 'embeddings.create'], models: ['mistral-large', 'mistral-medium'] },
  { name: 'Cohere', key: 'cohere', icon: '🔷', operations: ['chat', 'embed'], models: ['command-r-plus', 'command-r'] },
  { name: 'HuggingFace', key: 'huggingface', icon: '🤗', operations: ['text-generation', 'embeddings'], models: ['meta-llama/Llama-2-70b'] },
];

const DEMO_MCP_TOOLS: MCPToolGroup[] = [
  { name: 'Identity', icon: '🔐', toolCount: 15, source: 'internal' },
  { name: 'Catalog', icon: '📚', toolCount: 23, source: 'internal' },
  { name: 'Logging', icon: '📝', toolCount: 12, source: 'internal' },
  { name: 'Assistants', icon: '🤖', toolCount: 28, source: 'internal' },
  { name: 'Messaging', icon: '💬', toolCount: 18, source: 'internal' },
  { name: 'Runtime', icon: '⚡', toolCount: 9, source: 'internal' },
  { name: 'Network', icon: '🌐', toolCount: 8, source: 'internal' },
  { name: 'OpenAI', icon: '🤖', toolCount: 45, source: 'external' },
  { name: 'HuggingFace', icon: '🤗', toolCount: 156, source: 'external' },
  { name: 'Telegram', icon: '✈️', toolCount: 38, source: 'external' },
  { name: 'Anthropic', icon: '🧠', toolCount: 32, source: 'external' },
];

// Sample OpenAPI spec for demo
const SAMPLE_OPENAPI_SPEC = `{
  "openapi": "3.0.0",
  "info": {
    "title": "Weather API",
    "version": "1.0.0"
  },
  "paths": {
    "/forecast": {
      "get": {
        "operationId": "getForecast",
        "parameters": [
          { "name": "city", "in": "query" }
        ]
      }
    }
  }
}`;

// =============================================================================
// COMPONENT
// =============================================================================

export function IntegrationsDemo() {
  const [activeTab, setActiveTab] = useState<'openapi' | 'mcp'>('openapi');
  const [providers, setProviders] = useState<Provider[]>(DEMO_PROVIDERS);
  const [mcpTools] = useState<MCPToolGroup[]>(DEMO_MCP_TOOLS);
  const [selectedProvider, setSelectedProvider] = useState<Provider | null>(null);
  const [flowStep, setFlowStep] = useState(1);
  const [isLive, setIsLive] = useState(false);

  // Try to fetch live data from platform
  useEffect(() => {
    const fetchProviders = async () => {
      try {
        const res = await fetch('/api/integrations/providers');
        if (res.ok) {
          const data = await res.json();
          if (data.providers && data.providers.length > 0) {
            setProviders(data.providers.map((p: { name: string; key?: string; operations?: string[]; models?: string[] }) => ({
              name: p.name,
              key: p.key || p.name.toLowerCase(),
              icon: getProviderIcon(p.name),
              operations: p.operations || [],
              models: p.models || [],
            })));
            setIsLive(true);
          }
        }
      } catch {
        // Fall back to demo data
      }
    };
    fetchProviders();
  }, []);

  const getProviderIcon = (name: string): string => {
    const icons: Record<string, string> = {
      'OpenAI': '🤖',
      'Anthropic': '🧠',
      'Google': '🔮',
      'Mistral': '🌬️',
      'Cohere': '🔷',
      'HuggingFace': '🤗',
    };
    return icons[name] || '🔌';
  };

  const totalMcpTools = mcpTools.reduce((sum, g) => sum + g.toolCount, 0);
  const internalTools = mcpTools.filter(g => g.source === 'internal').reduce((sum, g) => sum + g.toolCount, 0);
  const externalTools = mcpTools.filter(g => g.source === 'external').reduce((sum, g) => sum + g.toolCount, 0);

  // Auto-advance flow animation
  useEffect(() => {
    if (activeTab !== 'openapi') return;
    const interval = setInterval(() => {
      setFlowStep(prev => (prev % 3) + 1);
    }, 3000);
    return () => clearInterval(interval);
  }, [activeTab]);

  return (
    <div className="integrations-demo">
      {/* Header */}
      <div className="demo-header">
        <div className="demo-title">
          <span className="demo-icon">🔌</span>
          <span>Integrations</span>
        </div>
        <div className="demo-subtitle">
          Connect any API or MCP server
          {isLive && <span className="live-badge">● Live</span>}
        </div>
      </div>

      {/* Provider Pills */}
      <div className="provider-pills">
        {providers.slice(0, 6).map(provider => (
          <button
            key={provider.key}
            className={`provider-pill ${selectedProvider?.key === provider.key ? 'active' : ''}`}
            onClick={() => setSelectedProvider(provider)}
          >
            <span className="pill-icon">{provider.icon}</span>
            <span className="pill-name">{provider.name}</span>
          </button>
        ))}
      </div>

      {/* Tab Switcher */}
      <div className="demo-tabs">
        <button
          className={`demo-tab ${activeTab === 'openapi' ? 'active' : ''}`}
          onClick={() => setActiveTab('openapi')}
        >
          OpenAPI Integration
        </button>
        <button
          className={`demo-tab ${activeTab === 'mcp' ? 'active' : ''}`}
          onClick={() => setActiveTab('mcp')}
        >
          MCP Protocol
        </button>
      </div>

      {/* OpenAPI Tab */}
      {activeTab === 'openapi' && (
        <div className="demo-content">
          {/* Integration Flow */}
          <div className="integration-flow">
            {/* Step 1: Spec */}
            <div className={`flow-step ${flowStep >= 1 ? 'active' : ''}`}>
              <div className="step-header">
                <span className="step-number">1</span>
                <span className="step-title">OpenAPI Spec</span>
              </div>
              <div className="step-content">
                <pre className="code-block spec-code">{SAMPLE_OPENAPI_SPEC}</pre>
              </div>
            </div>

            {/* Arrow */}
            <div className={`flow-arrow ${flowStep >= 2 ? 'active' : ''}`}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
            </div>

            {/* Step 2: Register */}
            <div className={`flow-step ${flowStep >= 2 ? 'active' : ''}`}>
              <div className="step-header">
                <span className="step-number">2</span>
                <span className="step-title">Register</span>
              </div>
              <div className="step-content">
                <div className="api-call">
                  <span className="method">POST</span>
                  <span className="endpoint">/api/integrations/register</span>
                </div>
                <pre className="code-block">{`{
  "key": "weather",
  "spec": "https://api.example.com/openapi.json",
  "auth": { "type": "apiKey" }
}`}</pre>
              </div>
            </div>

            {/* Arrow */}
            <div className={`flow-arrow ${flowStep >= 3 ? 'active' : ''}`}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
            </div>

            {/* Step 3: Use */}
            <div className={`flow-step ${flowStep >= 3 ? 'active' : ''}`}>
              <div className="step-header">
                <span className="step-number">3</span>
                <span className="step-title">Invoke</span>
              </div>
              <div className="step-content">
                <div className="api-call">
                  <span className="method">POST</span>
                  <span className="endpoint">/api/integrations/invoke</span>
                </div>
                <pre className="code-block success">{`{
  "operation": "weather.getForecast",
  "params": { "city": "{{@user.location}}" }
}`}</pre>
              </div>
            </div>
          </div>

          {/* Result Namespace */}
          <div className="namespace-result">
            <div className="namespace-header">
              <span className="namespace-icon">📂</span>
              <span>Resulting Namespace Tree</span>
            </div>
            <div className="namespace-tree">
              <div className="tree-item root">integrations</div>
              <div className="tree-item level-1">└─ weather</div>
              <div className="tree-item level-2">   └─ getForecast <span className="tree-badge">GET</span></div>
            </div>
            <div className="namespace-usage">
              <span className="usage-label">Use in Symbia Script:</span>
              <code className="usage-code">@integration.weather.getForecast</code>
            </div>
          </div>
        </div>
      )}

      {/* MCP Tab */}
      {activeTab === 'mcp' && (
        <div className="demo-content">
          {/* MCP Stats */}
          <div className="mcp-stats">
            <div className="mcp-stat">
              <div className="stat-value">{totalMcpTools}</div>
              <div className="stat-label">Total Tools</div>
            </div>
            <div className="mcp-stat">
              <div className="stat-value">{internalTools}</div>
              <div className="stat-label">Internal Services</div>
            </div>
            <div className="mcp-stat">
              <div className="stat-value">{externalTools}</div>
              <div className="stat-label">External APIs</div>
            </div>
          </div>

          {/* Tool Groups */}
          <div className="mcp-tools">
            <div className="tools-section">
              <div className="tools-section-header">Internal Services</div>
              <div className="tools-grid">
                {mcpTools.filter(g => g.source === 'internal').map(group => (
                  <div key={group.name} className="tool-group">
                    <span className="tool-icon">{group.icon}</span>
                    <span className="tool-name">{group.name}</span>
                    <span className="tool-count">{group.toolCount}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="tools-section">
              <div className="tools-section-header">External Integrations</div>
              <div className="tools-grid">
                {mcpTools.filter(g => g.source === 'external').map(group => (
                  <div key={group.name} className="tool-group external">
                    <span className="tool-icon">{group.icon}</span>
                    <span className="tool-name">{group.name}</span>
                    <span className="tool-count">{group.toolCount}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* MCP Protocol Example */}
          <div className="mcp-example">
            <div className="mcp-example-header">
              <span className="mcp-example-label">MCP JSON-RPC 2.0</span>
            </div>
            <div className="mcp-example-content">
              <div className="api-call">
                <span className="method">POST</span>
                <span className="endpoint">/api/integrations/mcp</span>
              </div>
              <pre className="code-block">{`{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "catalog_list_resources",
    "arguments": { "type": "assistant" }
  },
  "id": 1
}`}</pre>
            </div>
          </div>
        </div>
      )}

      {/* Learn More Link */}
      <div className="demo-footer">
        <a
          href="https://github.com/Symbia-Labs/symbia-stack/blob/main/integrations/docs/CHANNELS.md"
          target="_blank"
          rel="noopener noreferrer"
          className="learn-more-link"
        >
          View Integration Docs
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M7 17L17 7M17 7H7M17 7v10"/>
          </svg>
        </a>
      </div>
    </div>
  );
}

export default IntegrationsDemo;
