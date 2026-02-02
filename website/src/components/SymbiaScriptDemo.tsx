/**
 * Symbia Script Demo Component
 *
 * Interactive demonstration of Symbia Script's unified reference system.
 * Shows live resolution of @namespace.path references.
 */

import { useState, useMemo, useEffect } from 'react';

// =============================================================================
// TYPES
// =============================================================================

interface NamespaceInfo {
  name: string;
  icon: string;
  color: string;
  description: string;
  example: string;
}

interface ParsedRef {
  raw: string;
  valid: boolean;
  namespace: string;
  path: string;
  segments: string[];
}

interface ResolvedValue {
  success: boolean;
  value: unknown;
  error?: string;
}

// =============================================================================
// NAMESPACE DEFINITIONS
// =============================================================================

const NAMESPACES: NamespaceInfo[] = [
  { name: 'user', icon: '👤', color: '#3b82f6', description: 'Current user data', example: '@user.displayName' },
  { name: 'org', icon: '🏢', color: '#8b5cf6', description: 'Organization info', example: '@org.name' },
  { name: 'message', icon: '💬', color: '#10b981', description: 'Message context', example: '@message.content' },
  { name: 'context', icon: '🔧', color: '#f59e0b', description: 'Execution context', example: '@context.conversationId' },
  { name: 'service', icon: '⚡', color: '#ec4899', description: 'Internal services', example: '@service.catalog./resources' },
  { name: 'integration', icon: '🔌', color: '#06b6d4', description: 'External APIs', example: '@integration.openai.chat' },
  { name: 'var', icon: '📦', color: '#84cc16', description: 'Script variables', example: '@var.config.apiKey' },
  { name: 'env', icon: '🌍', color: '#f97316', description: 'Environment vars', example: '@env.NODE_ENV' },
  { name: 'catalog', icon: '📚', color: '#a855f7', description: 'Catalog resources', example: '@catalog.component[http/Request]' },
  { name: 'entity', icon: '🤖', color: '#14b8a6', description: 'Entity lookup', example: '@entity.log-analyst' },
];

// Mock context for demo
const DEMO_CONTEXT = {
  user: {
    id: 'usr_8x7k2mN3pQ',
    email: 'alex@acme.corp',
    displayName: 'Alex Chen',
    role: 'developer',
    metadata: {
      department: 'Engineering',
      timezone: 'America/Los_Angeles',
    },
  },
  org: {
    id: 'org_4vL9wXyZ2R',
    name: 'Acme Corp',
    plan: 'enterprise',
    metadata: {
      industry: 'Technology',
      employees: 250,
    },
  },
  message: {
    id: 'msg_kP3nQ8vMw2',
    content: 'Analyze the latest error logs',
    role: 'user',
    timestamp: Date.now(),
  },
  context: {
    conversationId: 'conv_7rT4sUvW1X',
    channel: 'slack',
    assistantKey: 'log-analyst',
    runId: 'run_2bC5dEfG6H',
  },
  var: {
    config: {
      apiKey: 'sk-...redacted',
      maxTokens: 4096,
    },
    results: {
      errorCount: 42,
      severity: 'high',
    },
  },
  env: {
    NODE_ENV: 'production',
    LOG_LEVEL: 'info',
  },
};

// =============================================================================
// PARSING & RESOLUTION (simplified client-side version)
// =============================================================================

function parseRef(ref: string): ParsedRef {
  const trimmed = ref.trim();

  if (!trimmed.startsWith('@')) {
    return { raw: ref, valid: false, namespace: '', path: '', segments: [] };
  }

  const match = trimmed.match(/^@([a-zA-Z][a-zA-Z0-9_]*)(?:\.(.+))?$/);
  if (!match) {
    return { raw: ref, valid: false, namespace: '', path: '', segments: [] };
  }

  const namespace = match[1];
  const path = match[2] || '';
  const segments = path ? path.split('.').filter(Boolean) : [];

  return { raw: ref, valid: true, namespace, path, segments };
}

function resolveRef(ref: ParsedRef): ResolvedValue {
  if (!ref.valid) {
    return { success: false, value: undefined, error: 'Invalid reference' };
  }

  const ctx = DEMO_CONTEXT as Record<string, unknown>;
  let current = ctx[ref.namespace];

  if (current === undefined) {
    // Check if it's an async namespace
    if (['service', 'integration', 'entity'].includes(ref.namespace)) {
      return { success: false, value: undefined, error: 'Requires async resolution' };
    }
    return { success: false, value: undefined, error: `Unknown namespace: ${ref.namespace}` };
  }

  for (const segment of ref.segments) {
    if (current === null || current === undefined) {
      return { success: false, value: undefined, error: `Path not found: ${segment}` };
    }
    if (typeof current !== 'object') {
      return { success: false, value: undefined, error: `Cannot access ${segment} on non-object` };
    }
    current = (current as Record<string, unknown>)[segment];
  }

  return { success: true, value: current };
}

function formatValue(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
}

// =============================================================================
// EXAMPLE TEMPLATES
// =============================================================================

const EXAMPLE_TEMPLATES = [
  {
    name: 'Greeting',
    template: 'Hello {{@user.displayName}} from {{@org.name}}!',
    description: 'User greeting with org context',
  },
  {
    name: 'Log Query',
    template: 'Analyzing logs for {{@context.assistantKey}} in conversation {{@context.conversationId}}',
    description: 'Context reference in logging',
  },
  {
    name: 'Config Access',
    template: 'Using {{@var.config.maxTokens}} tokens in {{@env.NODE_ENV}} mode',
    description: 'Variable and environment access',
  },
  {
    name: 'Message Echo',
    template: 'Processing "{{@message.content}}" from {{@message.role}}',
    description: 'Message content reference',
  },
];

// =============================================================================
// COMPONENT
// =============================================================================

export function SymbiaScriptDemo() {
  const [input, setInput] = useState('@user.displayName');
  const [template, setTemplate] = useState('Hello {{@user.displayName}}, welcome to {{@org.name}}!');
  const [activeTab, setActiveTab] = useState<'reference' | 'template'>('reference');
  const [highlightedNs, setHighlightedNs] = useState<string | null>(null);

  // Parse and resolve the reference
  const parsed = useMemo(() => parseRef(input), [input]);
  const resolved = useMemo(() => resolveRef(parsed), [parsed]);

  // Find namespace info
  const nsInfo = useMemo(
    () => NAMESPACES.find(ns => ns.name === parsed.namespace),
    [parsed.namespace]
  );

  // Interpolate template
  const interpolated = useMemo(() => {
    return template.replace(/\{\{([^}]+)\}\}/g, (_, content) => {
      const trimmed = content.trim();
      if (trimmed.startsWith('@')) {
        const ref = parseRef(trimmed);
        const result = resolveRef(ref);
        return result.success ? formatValue(result.value) : `[${result.error}]`;
      }
      return `[invalid: ${trimmed}]`;
    });
  }, [template]);

  // Extract refs from template for highlighting
  const templateRefs = useMemo(() => {
    const refs: Array<{ raw: string; start: number; end: number; ref: ParsedRef; resolved: ResolvedValue }> = [];
    const regex = /\{\{([^}]+)\}\}/g;
    let match;
    while ((match = regex.exec(template)) !== null) {
      const content = match[1].trim();
      if (content.startsWith('@')) {
        const ref = parseRef(content);
        refs.push({
          raw: match[0],
          start: match.index,
          end: match.index + match[0].length,
          ref,
          resolved: resolveRef(ref),
        });
      }
    }
    return refs;
  }, [template]);

  // Auto-cycle through namespace highlights for visual effect
  useEffect(() => {
    if (activeTab !== 'reference') return;
    let i = 0;
    const interval = setInterval(() => {
      i = (i + 1) % NAMESPACES.length;
      setHighlightedNs(NAMESPACES[i].name);
      setTimeout(() => setHighlightedNs(null), 2000);
    }, 4000);
    return () => clearInterval(interval);
  }, [activeTab]);

  return (
    <div className="symbia-script-demo">
      {/* Header */}
      <div className="demo-header">
        <div className="demo-title">
          <span className="demo-icon">@</span>
          <span>Symbia Script</span>
        </div>
        <div className="demo-subtitle">Unified Reference System</div>
      </div>

      {/* Namespace Pills */}
      <div className="namespace-pills">
        {NAMESPACES.map(ns => (
          <button
            key={ns.name}
            className={`namespace-pill ${parsed.namespace === ns.name ? 'active' : ''} ${highlightedNs === ns.name ? 'highlighted' : ''}`}
            style={{ '--ns-color': ns.color } as React.CSSProperties}
            onClick={() => setInput(ns.example)}
            onMouseEnter={() => setHighlightedNs(ns.name)}
            onMouseLeave={() => setHighlightedNs(null)}
            title={ns.description}
          >
            <span className="pill-icon">{ns.icon}</span>
            <span className="pill-name">@{ns.name}</span>
          </button>
        ))}
      </div>

      {/* Tab Switcher */}
      <div className="demo-tabs">
        <button
          className={`demo-tab ${activeTab === 'reference' ? 'active' : ''}`}
          onClick={() => setActiveTab('reference')}
        >
          Reference Resolution
        </button>
        <button
          className={`demo-tab ${activeTab === 'template' ? 'active' : ''}`}
          onClick={() => setActiveTab('template')}
        >
          Template Interpolation
        </button>
      </div>

      {/* Reference Mode */}
      {activeTab === 'reference' && (
        <div className="demo-content">
          {/* Input */}
          <div className="demo-input-section">
            <label className="demo-label">Reference</label>
            <div className="demo-input-wrapper">
              <span className="demo-input-prefix">@</span>
              <input
                type="text"
                className="demo-input"
                value={input.startsWith('@') ? input.slice(1) : input}
                onChange={e => setInput('@' + e.target.value)}
                placeholder="namespace.path"
              />
            </div>
          </div>

          {/* Resolution Flow */}
          <div className="resolution-flow">
            {/* Step 1: Parse */}
            <div className="resolution-step">
              <div className="step-header">
                <span className="step-number">1</span>
                <span className="step-title">Parse</span>
              </div>
              <div className="step-content">
                {parsed.valid ? (
                  <div className="parse-result">
                    <div className="parse-row">
                      <span className="parse-label">Namespace</span>
                      <span
                        className="parse-value namespace-tag"
                        style={{ '--ns-color': nsInfo?.color || '#666' } as React.CSSProperties}
                      >
                        {nsInfo?.icon} {parsed.namespace}
                      </span>
                    </div>
                    <div className="parse-row">
                      <span className="parse-label">Path</span>
                      <span className="parse-value path-segments">
                        {parsed.segments.length > 0
                          ? parsed.segments.map((seg, i) => (
                              <span key={i} className="segment">{seg}</span>
                            ))
                          : <span className="segment empty">(root)</span>
                        }
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="parse-error">Invalid reference format</div>
                )}
              </div>
            </div>

            {/* Arrow */}
            <div className="resolution-arrow">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
            </div>

            {/* Step 2: Resolve */}
            <div className="resolution-step">
              <div className="step-header">
                <span className="step-number">2</span>
                <span className="step-title">Resolve</span>
              </div>
              <div className="step-content">
                {resolved.success ? (
                  <div className="resolve-result success">
                    <pre className="resolve-value">{formatValue(resolved.value)}</pre>
                  </div>
                ) : (
                  <div className="resolve-result error">
                    <span className="resolve-error">{resolved.error}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Quick Examples */}
          <div className="quick-examples">
            <div className="examples-label">Try these:</div>
            <div className="examples-list">
              <button onClick={() => setInput('@user.email')}>@user.email</button>
              <button onClick={() => setInput('@org.metadata.employees')}>@org.metadata.employees</button>
              <button onClick={() => setInput('@context.channel')}>@context.channel</button>
              <button onClick={() => setInput('@var.results.errorCount')}>@var.results.errorCount</button>
            </div>
          </div>
        </div>
      )}

      {/* Template Mode */}
      {activeTab === 'template' && (
        <div className="demo-content">
          {/* Template Input */}
          <div className="demo-input-section">
            <label className="demo-label">Template</label>
            <textarea
              className="demo-textarea"
              value={template}
              onChange={e => setTemplate(e.target.value)}
              placeholder="Enter template with {{@ref}} placeholders..."
              rows={3}
            />
          </div>

          {/* Detected References */}
          <div className="template-refs">
            <div className="refs-header">
              <span className="refs-label">Detected References</span>
              <span className="refs-count">{templateRefs.length}</span>
            </div>
            <div className="refs-list">
              {templateRefs.map((r, i) => {
                const nsInfo = NAMESPACES.find(ns => ns.name === r.ref.namespace);
                return (
                  <div
                    key={i}
                    className={`ref-item ${r.resolved.success ? 'success' : 'error'}`}
                    style={{ '--ns-color': nsInfo?.color || '#666' } as React.CSSProperties}
                  >
                    <span className="ref-icon">{nsInfo?.icon || '?'}</span>
                    <span className="ref-raw">{r.ref.raw}</span>
                    <span className="ref-arrow">→</span>
                    <span className="ref-value">
                      {r.resolved.success
                        ? formatValue(r.resolved.value)
                        : r.resolved.error
                      }
                    </span>
                  </div>
                );
              })}
              {templateRefs.length === 0 && (
                <div className="refs-empty">No references detected. Use {'{{@namespace.path}}'} syntax.</div>
              )}
            </div>
          </div>

          {/* Output */}
          <div className="template-output">
            <div className="output-header">
              <span className="output-label">Output</span>
            </div>
            <div className="output-content">
              {interpolated}
            </div>
          </div>

          {/* Example Templates */}
          <div className="example-templates">
            <div className="examples-label">Examples:</div>
            <div className="examples-buttons">
              {EXAMPLE_TEMPLATES.map((ex, i) => (
                <button
                  key={i}
                  className="example-btn"
                  onClick={() => setTemplate(ex.template)}
                  title={ex.description}
                >
                  {ex.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Context Preview */}
      <div className="context-preview">
        <details>
          <summary>Demo Context Data</summary>
          <pre>{JSON.stringify(DEMO_CONTEXT, null, 2)}</pre>
        </details>
      </div>
    </div>
  );
}

export default SymbiaScriptDemo;
