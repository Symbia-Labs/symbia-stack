/**
 * Symbia Script Demo Component
 *
 * Interactive demonstration of Symbia Script's unified reference system.
 * Shows live resolution of @namespace.path references with editable context.
 */

import { useState, useMemo, useEffect, useCallback } from 'react';

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

interface DemoContext {
  user: {
    id: string;
    email: string;
    displayName: string;
    role: string;
    metadata: {
      department: string;
      timezone: string;
    };
  };
  org: {
    id: string;
    name: string;
    plan: string;
    metadata: {
      industry: string;
      employees: number;
    };
  };
  message: {
    id: string;
    content: string;
    role: string;
    timestamp: number;
  };
  context: {
    conversationId: string;
    channel: string;
    assistantKey: string;
    runId: string;
  };
  var: {
    config: {
      apiKey: string;
      maxTokens: number;
    };
    results: {
      errorCount: number;
      severity: string;
    };
  };
  env: {
    NODE_ENV: string;
    LOG_LEVEL: string;
  };
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

// Default context for demo
const DEFAULT_CONTEXT: DemoContext = {
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

function resolveRefWithContext(ref: ParsedRef, ctx: DemoContext): ResolvedValue {
  if (!ref.valid) {
    return { success: false, value: undefined, error: 'Invalid reference' };
  }

  const ctxRecord = ctx as unknown as Record<string, unknown>;
  let current = ctxRecord[ref.namespace];

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
// EDITABLE FIELD COMPONENT
// =============================================================================

interface EditableFieldProps {
  label: string;
  path: string;
  value: string | number;
  onChange: (path: string, value: string | number) => void;
  type?: 'text' | 'number';
}

function EditableField({ label, path, value, onChange, type = 'text' }: EditableFieldProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(String(value));

  const handleSave = () => {
    const newValue = type === 'number' ? Number(editValue) : editValue;
    onChange(path, newValue);
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      setEditValue(String(value));
      setIsEditing(false);
    }
  };

  useEffect(() => {
    setEditValue(String(value));
  }, [value]);

  return (
    <div className="editable-field">
      <span className="editable-field-label">{label}</span>
      {isEditing ? (
        <input
          type={type}
          className="editable-field-input"
          value={editValue}
          onChange={e => setEditValue(e.target.value)}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          autoFocus
        />
      ) : (
        <span
          className="editable-field-value"
          onClick={() => setIsEditing(true)}
          title="Click to edit"
        >
          {String(value)}
          <svg className="edit-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
        </span>
      )}
    </div>
  );
}

// =============================================================================
// COMPONENT
// =============================================================================

export function SymbiaScriptDemo() {
  const [input, setInput] = useState('@user.displayName');
  const [template, setTemplate] = useState('Hello {{@user.displayName}}, welcome to {{@org.name}}!');
  const [activeTab, setActiveTab] = useState<'reference' | 'template'>('reference');
  const [highlightedNs, setHighlightedNs] = useState<string | null>(null);
  const [context, setContext] = useState<DemoContext>(DEFAULT_CONTEXT);
  const [contextExpanded, setContextExpanded] = useState(false);
  const [editMode, setEditMode] = useState<'fields' | 'json'>('fields');
  const [jsonError, setJsonError] = useState<string | null>(null);

  // Update a nested value in context
  const updateContextValue = useCallback((path: string, value: string | number) => {
    setContext(prev => {
      const newContext = JSON.parse(JSON.stringify(prev)); // Deep clone
      const segments = path.split('.');
      let current: Record<string, unknown> = newContext;

      for (let i = 0; i < segments.length - 1; i++) {
        current = current[segments[i]] as Record<string, unknown>;
      }

      current[segments[segments.length - 1]] = value;
      return newContext;
    });
  }, []);

  // Handle JSON edit
  const handleJsonChange = useCallback((jsonStr: string) => {
    try {
      const parsed = JSON.parse(jsonStr);
      setContext(parsed);
      setJsonError(null);
    } catch {
      setJsonError('Invalid JSON');
    }
  }, []);

  // Reset context to defaults
  const resetContext = useCallback(() => {
    setContext(DEFAULT_CONTEXT);
    setJsonError(null);
  }, []);

  // Parse and resolve the reference
  const parsed = useMemo(() => parseRef(input), [input]);
  const resolved = useMemo(() => resolveRefWithContext(parsed, context), [parsed, context]);

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
        const result = resolveRefWithContext(ref, context);
        return result.success ? formatValue(result.value) : `[${result.error}]`;
      }
      return `[invalid: ${trimmed}]`;
    });
  }, [template, context]);

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
          resolved: resolveRefWithContext(ref, context),
        });
      }
    }
    return refs;
  }, [template, context]);

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

          {/* API Example - Real Integration Invoke */}
          <div className="api-example">
            <div className="api-example-header">
              <span className="api-example-label">Real-World Usage</span>
              <span className="api-example-hint">Symbia Script in an external API call</span>
            </div>
            <div className="api-example-content">
              <div className="api-request">
                <div className="api-method">POST</div>
                <div className="api-url">/api/integrations/invoke</div>
              </div>
              <pre className="api-body">{`{
  "operation": "openai.chat.completions.create",
  "body": {
    "model": "gpt-4",
    "messages": [
      {
        "role": "system",
        "content": "You are helping {{${input}}}"
      },
      {
        "role": "user",
        "content": "{{@message.content}}"
      }
    ]
  }
}`}</pre>
              <div className="api-response-header">
                <span className="api-response-label">After Interpolation</span>
                <span className="api-status success">Resolved</span>
              </div>
              <pre className="api-response success">{`{
  "operation": "openai.chat.completions.create",
  "body": {
    "model": "gpt-4",
    "messages": [
      {
        "role": "system",
        "content": "You are helping ${resolved.success ? formatValue(resolved.value) : '[unresolved]'}"
      },
      {
        "role": "user",
        "content": "${context.message.content}"
      }
    ]
  }
}`}</pre>
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

      {/* Editable Context Section */}
      <div className="context-editor">
        <div
          className="context-editor-header"
          onClick={() => setContextExpanded(!contextExpanded)}
        >
          <div className="context-editor-title">
            <svg
              className={`context-chevron ${contextExpanded ? 'expanded' : ''}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M9 18l6-6-6-6"/>
            </svg>
            <span>Context Data</span>
            <span className="context-editor-hint">(click values to edit)</span>
          </div>
          <div className="context-editor-actions" onClick={e => e.stopPropagation()}>
            <button
              className={`context-mode-btn ${editMode === 'fields' ? 'active' : ''}`}
              onClick={() => setEditMode('fields')}
            >
              Fields
            </button>
            <button
              className={`context-mode-btn ${editMode === 'json' ? 'active' : ''}`}
              onClick={() => setEditMode('json')}
            >
              JSON
            </button>
            <button className="context-reset-btn" onClick={resetContext} title="Reset to defaults">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                <path d="M3 3v5h5"/>
              </svg>
            </button>
          </div>
        </div>

        {contextExpanded && (
          <div className="context-editor-content">
            {editMode === 'fields' ? (
              <div className="context-fields">
                {/* User */}
                <div className="context-namespace">
                  <div className="context-namespace-header">
                    <span className="context-ns-icon">👤</span>
                    <span className="context-ns-name">@user</span>
                  </div>
                  <div className="context-namespace-fields">
                    <EditableField label="displayName" path="user.displayName" value={context.user.displayName} onChange={updateContextValue} />
                    <EditableField label="email" path="user.email" value={context.user.email} onChange={updateContextValue} />
                    <EditableField label="role" path="user.role" value={context.user.role} onChange={updateContextValue} />
                    <EditableField label="metadata.department" path="user.metadata.department" value={context.user.metadata.department} onChange={updateContextValue} />
                  </div>
                </div>

                {/* Org */}
                <div className="context-namespace">
                  <div className="context-namespace-header">
                    <span className="context-ns-icon">🏢</span>
                    <span className="context-ns-name">@org</span>
                  </div>
                  <div className="context-namespace-fields">
                    <EditableField label="name" path="org.name" value={context.org.name} onChange={updateContextValue} />
                    <EditableField label="plan" path="org.plan" value={context.org.plan} onChange={updateContextValue} />
                    <EditableField label="metadata.industry" path="org.metadata.industry" value={context.org.metadata.industry} onChange={updateContextValue} />
                    <EditableField label="metadata.employees" path="org.metadata.employees" value={context.org.metadata.employees} onChange={updateContextValue} type="number" />
                  </div>
                </div>

                {/* Message */}
                <div className="context-namespace">
                  <div className="context-namespace-header">
                    <span className="context-ns-icon">💬</span>
                    <span className="context-ns-name">@message</span>
                  </div>
                  <div className="context-namespace-fields">
                    <EditableField label="content" path="message.content" value={context.message.content} onChange={updateContextValue} />
                    <EditableField label="role" path="message.role" value={context.message.role} onChange={updateContextValue} />
                  </div>
                </div>

                {/* Context */}
                <div className="context-namespace">
                  <div className="context-namespace-header">
                    <span className="context-ns-icon">🔧</span>
                    <span className="context-ns-name">@context</span>
                  </div>
                  <div className="context-namespace-fields">
                    <EditableField label="channel" path="context.channel" value={context.context.channel} onChange={updateContextValue} />
                    <EditableField label="assistantKey" path="context.assistantKey" value={context.context.assistantKey} onChange={updateContextValue} />
                  </div>
                </div>

                {/* Var */}
                <div className="context-namespace">
                  <div className="context-namespace-header">
                    <span className="context-ns-icon">📦</span>
                    <span className="context-ns-name">@var</span>
                  </div>
                  <div className="context-namespace-fields">
                    <EditableField label="config.maxTokens" path="var.config.maxTokens" value={context.var.config.maxTokens} onChange={updateContextValue} type="number" />
                    <EditableField label="results.errorCount" path="var.results.errorCount" value={context.var.results.errorCount} onChange={updateContextValue} type="number" />
                    <EditableField label="results.severity" path="var.results.severity" value={context.var.results.severity} onChange={updateContextValue} />
                  </div>
                </div>

                {/* Env */}
                <div className="context-namespace">
                  <div className="context-namespace-header">
                    <span className="context-ns-icon">🌍</span>
                    <span className="context-ns-name">@env</span>
                  </div>
                  <div className="context-namespace-fields">
                    <EditableField label="NODE_ENV" path="env.NODE_ENV" value={context.env.NODE_ENV} onChange={updateContextValue} />
                    <EditableField label="LOG_LEVEL" path="env.LOG_LEVEL" value={context.env.LOG_LEVEL} onChange={updateContextValue} />
                  </div>
                </div>
              </div>
            ) : (
              <div className="context-json">
                {jsonError && <div className="context-json-error">{jsonError}</div>}
                <textarea
                  className="context-json-editor"
                  value={JSON.stringify(context, null, 2)}
                  onChange={e => handleJsonChange(e.target.value)}
                  spellCheck={false}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default SymbiaScriptDemo;
