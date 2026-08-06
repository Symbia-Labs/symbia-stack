/**
 * SymbiaScriptHighlight
 *
 * Read-only syntax highlighting for Symbia Script content.
 * Highlights:
 * - @mentions (assistant aliases like @calc, @echo)
 * - Template variables ({{message.content}}, {{steps.*.result}})
 * - Actions (llm.invoke, tool.invoke, message.send, route.byValue)
 * - Namespaces (@context, @message, @user, @org)
 * - JSON structure in rule definitions
 */

import { useMemo } from 'react';

interface Token {
  type: 'text' | 'mention' | 'template' | 'action' | 'namespace' | 'keyword' | 'string' | 'number' | 'boolean' | 'punctuation';
  content: string;
  subtype?: string;
}

// Action types used in Symbia rules
const ACTION_TYPES = new Set([
  'message.send',
  'llm.invoke',
  'tool.invoke',
  'route.byValue',
  'route.byIntent',
  'context.set',
  'context.get',
  'webhook.call',
  'delegate.to',
]);

// Reserved keywords in Symbia script
const KEYWORDS = new Set([
  'trigger',
  'conditions',
  'actions',
  'params',
  'template',
  'type',
  'onError',
  'continue',
  'storeAs',
]);

// Namespace colors (matching SymbiaScriptInput)
const NAMESPACE_COLORS: Record<string, string> = {
  context: 'text-blue-400',
  message: 'text-emerald-400',
  user: 'text-cyan-400',
  org: 'text-purple-400',
  service: 'text-orange-400',
  integration: 'text-pink-400',
  var: 'text-yellow-400',
  env: 'text-red-400',
  steps: 'text-amber-400',
  llm: 'text-violet-400',
  tool: 'text-teal-400',
};

// Token colors
const TOKEN_COLORS: Record<Token['type'], string> = {
  text: 'text-slate-300',
  mention: 'text-scc-primary font-medium',
  template: 'text-amber-400',
  action: 'text-pink-400 font-medium',
  namespace: 'text-blue-400',
  keyword: 'text-purple-400',
  string: 'text-emerald-400',
  number: 'text-orange-400',
  boolean: 'text-cyan-400',
  punctuation: 'text-slate-500',
};

/**
 * Tokenize a string for syntax highlighting
 */
function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < text.length) {
    // Check for template variables {{...}}
    if (text.slice(i, i + 2) === '{{') {
      const endBrace = text.indexOf('}}', i + 2);
      if (endBrace !== -1) {
        tokens.push({ type: 'punctuation', content: '{{' });
        const inner = text.slice(i + 2, endBrace);

        // Highlight inner content based on namespace
        if (inner.startsWith('@')) {
          const namespace = inner.match(/@([a-zA-Z]+)/)?.[1] || '';
          tokens.push({
            type: 'template',
            content: inner,
            subtype: namespace,
          });
        } else {
          // Check for steps.*, llm.*, tool.* references
          const dotMatch = inner.match(/^([a-zA-Z]+)\./);
          if (dotMatch && NAMESPACE_COLORS[dotMatch[1]]) {
            tokens.push({
              type: 'template',
              content: inner,
              subtype: dotMatch[1],
            });
          } else {
            tokens.push({ type: 'template', content: inner });
          }
        }

        tokens.push({ type: 'punctuation', content: '}}' });
        i = endBrace + 2;
        continue;
      }
    }

    // Check for @mentions (assistant aliases)
    if (text[i] === '@' && (i === 0 || /[\s\n({[]/.test(text[i - 1]))) {
      const mentionMatch = text.slice(i).match(/^@([a-zA-Z][a-zA-Z0-9_-]*)/);
      if (mentionMatch) {
        // Check if it's a namespace reference (@context.xxx)
        const afterMention = text.slice(i + mentionMatch[0].length);
        if (afterMention.startsWith('.')) {
          // It's a namespace reference
          const fullRef = text.slice(i).match(/^@([a-zA-Z]+)(\.[a-zA-Z0-9_./?&=%-]+)?/);
          if (fullRef) {
            const namespace = fullRef[1];
            tokens.push({
              type: 'namespace',
              content: fullRef[0],
              subtype: namespace,
            });
            i += fullRef[0].length;
            continue;
          }
        }
        // It's an assistant @mention
        tokens.push({ type: 'mention', content: mentionMatch[0] });
        i += mentionMatch[0].length;
        continue;
      }
    }

    // Check for action types in strings
    for (const action of ACTION_TYPES) {
      if (text.slice(i).startsWith(`"${action}"`) || text.slice(i).startsWith(`'${action}'`)) {
        const quote = text[i];
        tokens.push({ type: 'punctuation', content: quote });
        tokens.push({ type: 'action', content: action });
        tokens.push({ type: 'punctuation', content: quote });
        i += action.length + 2;
        continue;
      }
    }

    // Check for quoted strings
    if (text[i] === '"' || text[i] === "'") {
      const quote = text[i];
      let j = i + 1;
      while (j < text.length && (text[j] !== quote || text[j - 1] === '\\')) {
        j++;
      }
      if (j < text.length) {
        const content = text.slice(i, j + 1);

        // Check if string content is an action type
        const innerContent = content.slice(1, -1);
        if (ACTION_TYPES.has(innerContent)) {
          tokens.push({ type: 'punctuation', content: quote });
          tokens.push({ type: 'action', content: innerContent });
          tokens.push({ type: 'punctuation', content: quote });
        } else {
          tokens.push({ type: 'string', content });
        }

        i = j + 1;
        continue;
      }
    }

    // Check for numbers
    const numMatch = text.slice(i).match(/^-?\d+\.?\d*/);
    if (numMatch && (i === 0 || /[\s\n:,\[{(]/.test(text[i - 1]))) {
      tokens.push({ type: 'number', content: numMatch[0] });
      i += numMatch[0].length;
      continue;
    }

    // Check for booleans
    if (text.slice(i).match(/^(true|false)/) && (i === 0 || /[\s\n:,\[{(]/.test(text[i - 1]))) {
      const match = text.slice(i).match(/^(true|false)/);
      if (match) {
        tokens.push({ type: 'boolean', content: match[0] });
        i += match[0].length;
        continue;
      }
    }

    // Check for null
    if (text.slice(i).startsWith('null') && (i === 0 || /[\s\n:,\[{(]/.test(text[i - 1]))) {
      tokens.push({ type: 'boolean', content: 'null' });
      i += 4;
      continue;
    }

    // Check for keywords (as property names)
    for (const keyword of KEYWORDS) {
      if (text.slice(i).startsWith(`"${keyword}":`)) {
        tokens.push({ type: 'punctuation', content: '"' });
        tokens.push({ type: 'keyword', content: keyword });
        tokens.push({ type: 'punctuation', content: '":' });
        i += keyword.length + 3;
        continue;
      }
    }

    // Check for punctuation
    if (/[{}\[\]:,]/.test(text[i])) {
      tokens.push({ type: 'punctuation', content: text[i] });
      i++;
      continue;
    }

    // Default: add as text
    let j = i + 1;
    while (j < text.length && !/[@{}"'\[\]:,\d]/.test(text[j])) {
      j++;
    }
    tokens.push({ type: 'text', content: text.slice(i, j) });
    i = j;
  }

  return tokens;
}

/**
 * Get color class for a token
 */
function getTokenColor(token: Token): string {
  if (token.type === 'template' && token.subtype) {
    return NAMESPACE_COLORS[token.subtype] || TOKEN_COLORS.template;
  }
  if (token.type === 'namespace' && token.subtype) {
    return NAMESPACE_COLORS[token.subtype] || TOKEN_COLORS.namespace;
  }
  return TOKEN_COLORS[token.type] || 'text-slate-300';
}

interface SymbiaScriptHighlightProps {
  /** The content to highlight */
  content: string;
  /** Additional CSS classes */
  className?: string;
  /** Whether to show line numbers */
  showLineNumbers?: boolean;
  /** Maximum height before scrolling */
  maxHeight?: string;
  /** Whether to wrap long lines */
  wrap?: boolean;
}

export function SymbiaScriptHighlight({
  content,
  className = '',
  showLineNumbers = false,
  maxHeight = '400px',
  wrap = true,
}: SymbiaScriptHighlightProps) {
  const tokens = useMemo(() => tokenize(content), [content]);

  const lines = useMemo(() => {
    if (!showLineNumbers) return null;
    return content.split('\n').length;
  }, [content, showLineNumbers]);

  return (
    <div
      className={`font-mono text-sm bg-slate-900/50 rounded-lg border border-slate-700/50 overflow-auto ${className}`}
      style={{ maxHeight }}
    >
      <div className="flex">
        {showLineNumbers && lines && (
          <div className="flex-shrink-0 select-none pr-3 pl-3 py-3 text-right text-slate-600 border-r border-slate-700/50 bg-slate-900/30">
            {Array.from({ length: lines }, (_, i) => (
              <div key={i + 1}>{i + 1}</div>
            ))}
          </div>
        )}
        <pre className={`p-3 ${wrap ? 'whitespace-pre-wrap break-words' : 'whitespace-pre'} flex-1 overflow-x-auto`}>
          <code>
            {tokens.map((token, idx) => (
              <span key={idx} className={getTokenColor(token)}>
                {token.content}
              </span>
            ))}
          </code>
        </pre>
      </div>
    </div>
  );
}

/**
 * Inline version for use in text
 */
export function SymbiaScriptInline({ content }: { content: string }) {
  const tokens = useMemo(() => tokenize(content), [content]);

  return (
    <code className="font-mono text-sm bg-slate-800/50 px-1.5 py-0.5 rounded">
      {tokens.map((token, idx) => (
        <span key={idx} className={getTokenColor(token)}>
          {token.content}
        </span>
      ))}
    </code>
  );
}

/**
 * Legend component showing what each color means
 */
export function SymbiaScriptLegend() {
  return (
    <div className="flex flex-wrap gap-3 text-xs">
      <div className="flex items-center gap-1.5">
        <span className="w-2 h-2 rounded bg-scc-primary" />
        <span className="text-slate-400">@mention</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="w-2 h-2 rounded bg-amber-400" />
        <span className="text-slate-400">{'{{template}}'}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="w-2 h-2 rounded bg-pink-400" />
        <span className="text-slate-400">action</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="w-2 h-2 rounded bg-blue-400" />
        <span className="text-slate-400">@namespace</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="w-2 h-2 rounded bg-emerald-400" />
        <span className="text-slate-400">"string"</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="w-2 h-2 rounded bg-purple-400" />
        <span className="text-slate-400">keyword</span>
      </div>
    </div>
  );
}
