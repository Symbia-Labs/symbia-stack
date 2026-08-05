/**
 * SymbiaScriptInput
 *
 * Autocomplete input for Symbia Script references with syntax highlighting.
 * Supports @namespace.path syntax and {{@ref}} interpolation in templates.
 *
 * Single-line mode: For simple references like @user.displayName
 * Multi-line mode: For templates with embedded references like "Hello {{@user.displayName}}"
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { getRefSuggestions, parseRef, SymbiaNamespace } from '@symbia/sys';

interface Suggestion {
  value: string;
  description: string;
  namespace?: string;
}

interface SymbiaScriptInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  /** Multi-line mode for template editing */
  multiline?: boolean;
  /** Number of rows for multi-line mode */
  rows?: number;
  /** Label for the input */
  label?: string;
  /** Whether the input is for a bare reference or a template with {{}} */
  mode?: 'reference' | 'template';
}

// Get color class for namespace
function getNamespaceColor(namespace: string): string {
  switch (namespace) {
    case SymbiaNamespace.CONTEXT:
      return 'text-blue-400';
    case SymbiaNamespace.MESSAGE:
      return 'text-emerald-400';
    case SymbiaNamespace.USER:
      return 'text-cyan-400';
    case SymbiaNamespace.ORG:
      return 'text-purple-400';
    case SymbiaNamespace.SERVICE:
      return 'text-orange-400';
    case SymbiaNamespace.INTEGRATION:
      return 'text-pink-400';
    case SymbiaNamespace.VAR:
      return 'text-yellow-400';
    case SymbiaNamespace.ENV:
      return 'text-red-400';
    default:
      return 'text-slate-400';
  }
}

// Get badge color for namespace
function getNamespaceBadgeColor(namespace: string): string {
  switch (namespace) {
    case SymbiaNamespace.CONTEXT:
      return 'bg-blue-400/10 text-blue-400';
    case SymbiaNamespace.MESSAGE:
      return 'bg-emerald-400/10 text-emerald-400';
    case SymbiaNamespace.USER:
      return 'bg-cyan-400/10 text-cyan-400';
    case SymbiaNamespace.ORG:
      return 'bg-purple-400/10 text-purple-400';
    case SymbiaNamespace.SERVICE:
      return 'bg-orange-400/10 text-orange-400';
    case SymbiaNamespace.INTEGRATION:
      return 'bg-pink-400/10 text-pink-400';
    case SymbiaNamespace.VAR:
      return 'bg-yellow-400/10 text-yellow-400';
    case SymbiaNamespace.ENV:
      return 'bg-red-400/10 text-red-400';
    default:
      return 'bg-slate-400/10 text-slate-400';
  }
}

export function SymbiaScriptInput({
  value,
  onChange,
  placeholder = '@context.key',
  className = '',
  multiline = false,
  rows = 4,
  label,
  mode = 'reference',
}: SymbiaScriptInputProps) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [cursorPosition, setCursorPosition] = useState(0);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const highlightRef = useRef<HTMLPreElement>(null);

  // Find the current reference being typed at cursor position
  const getCurrentRef = useCallback((text: string, cursor: number): { ref: string; start: number; end: number } | null => {
    // In template mode, look for {{@...}} or bare @...
    if (mode === 'template') {
      // Check if we're inside {{...}}
      const beforeCursor = text.slice(0, cursor);
      const afterCursor = text.slice(cursor);

      const openBrace = beforeCursor.lastIndexOf('{{');
      const closeBrace = beforeCursor.lastIndexOf('}}');

      if (openBrace > closeBrace) {
        // We're inside {{ }}, find the @ reference
        const insideContent = beforeCursor.slice(openBrace + 2);
        const atIndex = insideContent.lastIndexOf('@');
        if (atIndex !== -1) {
          const start = openBrace + 2 + atIndex;
          const endMatch = afterCursor.match(/^[a-zA-Z0-9_./?&=%-]*/);
          const end = cursor + (endMatch?.[0]?.length || 0);
          return { ref: text.slice(start, end), start, end };
        }
      }
    }

    // In reference mode or when not in braces, look for bare @...
    const beforeCursor = text.slice(0, cursor);
    const lastAt = beforeCursor.lastIndexOf('@');
    const lastSpace = Math.max(
      beforeCursor.lastIndexOf(' '),
      beforeCursor.lastIndexOf('\n'),
      beforeCursor.lastIndexOf('{')
    );

    if (lastAt > lastSpace) {
      const afterCursor = text.slice(cursor);
      const endMatch = afterCursor.match(/^[a-zA-Z0-9_./?&=%-]*/);
      const end = cursor + (endMatch?.[0]?.length || 0);
      return { ref: text.slice(lastAt, end), start: lastAt, end };
    }

    return null;
  }, [mode]);

  // Compute suggestions based on current reference
  const computeSuggestions = useCallback((text: string, cursor: number) => {
    const currentRef = getCurrentRef(text, cursor);

    if (!currentRef) {
      // Check if we should suggest starting a reference
      const beforeCursor = text.slice(0, cursor);
      if (mode === 'template') {
        // In template mode, suggest after typing {{
        if (beforeCursor.endsWith('{{')) {
          return getRefSuggestions('@').map(s => ({
            ...s,
            namespace: s.value.match(/@([a-zA-Z]+)/)?.[1],
          }));
        }
      } else {
        // In reference mode, suggest if empty or at start
        if (!text || cursor === 0) {
          return getRefSuggestions('@').map(s => ({
            ...s,
            namespace: s.value.match(/@([a-zA-Z]+)/)?.[1],
          }));
        }
      }
      return [];
    }

    return getRefSuggestions(currentRef.ref).map(s => ({
      ...s,
      namespace: s.value.match(/@([a-zA-Z]+)/)?.[1],
    }));
  }, [getCurrentRef, mode]);

  // Update suggestions when value or cursor changes
  useEffect(() => {
    const newSuggestions = computeSuggestions(value, cursorPosition);
    setSuggestions(newSuggestions);
    setSelectedIndex(0);
  }, [value, cursorPosition, computeSuggestions]);

  // Handle input change
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    onChange(newValue);
    setCursorPosition(e.target.selectionStart || 0);
    setShowSuggestions(true);
  };

  // Handle cursor movement
  const handleSelect = (e: React.SyntheticEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const target = e.target as HTMLInputElement | HTMLTextAreaElement;
    setCursorPosition(target.selectionStart || 0);
  };

  // Handle suggestion selection
  const handleSelectSuggestion = (suggestion: Suggestion) => {
    const currentRef = getCurrentRef(value, cursorPosition);

    if (currentRef) {
      // Replace the current reference
      const newValue =
        value.slice(0, currentRef.start) +
        suggestion.value +
        value.slice(currentRef.end);
      onChange(newValue);

      // Move cursor to end of inserted value
      const newCursor = currentRef.start + suggestion.value.length;
      setCursorPosition(newCursor);
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.setSelectionRange(newCursor, newCursor);
          inputRef.current.focus();
        }
      }, 0);
    } else if (mode === 'template') {
      // Insert at cursor for template mode
      const newValue = value.slice(0, cursorPosition) + suggestion.value + value.slice(cursorPosition);
      onChange(newValue);
    } else {
      // Replace entire value for reference mode
      onChange(suggestion.value);
    }

    setShowSuggestions(false);
  };

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showSuggestions || suggestions.length === 0) {
      if (e.key === 'ArrowDown' || (e.key === ' ' && e.ctrlKey)) {
        setShowSuggestions(true);
        e.preventDefault();
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => (prev + 1) % suggestions.length);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => (prev - 1 + suggestions.length) % suggestions.length);
        break;
      case 'Tab':
      case 'Enter':
        if (suggestions[selectedIndex]) {
          e.preventDefault();
          handleSelectSuggestion(suggestions[selectedIndex]);
        }
        break;
      case 'Escape':
        setShowSuggestions(false);
        break;
    }
  };

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Scroll selected suggestion into view
  useEffect(() => {
    if (suggestionsRef.current && showSuggestions) {
      const selectedEl = suggestionsRef.current.children[selectedIndex] as HTMLElement;
      if (selectedEl) {
        selectedEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex, showSuggestions]);

  // Sync scroll for multiline
  const syncScroll = useCallback(() => {
    if (inputRef.current && highlightRef.current && multiline) {
      highlightRef.current.scrollTop = inputRef.current.scrollTop;
      highlightRef.current.scrollLeft = inputRef.current.scrollLeft;
    }
  }, [multiline]);

  // Render highlighted value for single-line reference mode
  const renderHighlightedRef = () => {
    if (!value) return null;

    const parsed = parseRef(value);
    if (!parsed.valid) {
      return <span className="text-slate-400">{value}</span>;
    }

    const nsColor = getNamespaceColor(parsed.namespace);
    return (
      <span className="font-mono text-sm">
        <span className="text-slate-500">@</span>
        <span className={nsColor}>{parsed.namespace}</span>
        {parsed.path && (
          <>
            <span className="text-slate-600">.</span>
            <span className="text-slate-200">{parsed.path}</span>
          </>
        )}
      </span>
    );
  };

  // Render highlighted template for multiline mode
  const renderHighlightedTemplate = () => {
    if (!value) {
      return <span className="text-slate-600">{placeholder}</span>;
    }

    // Tokenize the template
    const tokens: Array<{ type: 'text' | 'ref' | 'brace'; content: string; namespace?: string }> = [];
    let match;

    const refPattern = /\{\{(@[a-zA-Z][a-zA-Z0-9_./?&=%-]*)\}\}/g;

    let lastIndex = 0;
    while ((match = refPattern.exec(value)) !== null) {
      // Add text before the match
      if (match.index > lastIndex) {
        tokens.push({ type: 'text', content: value.slice(lastIndex, match.index) });
      }

      // Add the reference
      const ref = match[1];
      const parsed = parseRef(ref);
      tokens.push({
        type: 'ref',
        content: ref,
        namespace: parsed.namespace,
      });

      lastIndex = match.index + match[0].length;
    }

    // Add remaining text
    if (lastIndex < value.length) {
      tokens.push({ type: 'text', content: value.slice(lastIndex) });
    }

    return tokens.map((token, idx) => {
      if (token.type === 'text') {
        return <span key={idx} className="text-slate-300">{token.content}</span>;
      }
      if (token.type === 'ref') {
        const nsColor = getNamespaceColor(token.namespace || '');
        return (
          <span key={idx}>
            <span className="text-slate-600">{'{'+'{'}</span>
            <span className={nsColor}>{token.content}</span>
            <span className="text-slate-600">{'}'+'}'}</span>
          </span>
        );
      }
      return null;
    });
  };

  // Single-line input
  if (!multiline) {
    return (
      <div className={`relative ${className}`}>
        {label && (
          <label className="block text-xs text-slate-400 mb-1">{label}</label>
        )}

        {/* Highlighted overlay */}
        <div className="absolute inset-0 flex items-center px-3 pointer-events-none overflow-hidden">
          {renderHighlightedRef()}
        </div>

        {/* Actual input */}
        <input
          ref={inputRef as React.RefObject<HTMLInputElement>}
          type="text"
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onSelect={handleSelect}
          onFocus={() => setShowSuggestions(true)}
          placeholder={placeholder}
          className="scc-input w-full text-sm font-mono text-transparent caret-slate-200 bg-transparent relative z-10"
          autoComplete="off"
          spellCheck={false}
        />

        {/* Suggestions dropdown */}
        {showSuggestions && suggestions.length > 0 && (
          <div
            ref={suggestionsRef}
            className="absolute top-full left-0 right-0 mt-1 bg-scc-surface border border-scc-border rounded-lg shadow-xl z-50 max-h-64 overflow-y-auto"
          >
            {suggestions.map((suggestion, idx) => (
              <div
                key={suggestion.value}
                onClick={() => handleSelectSuggestion(suggestion)}
                className={`
                  px-3 py-2 cursor-pointer transition-colors
                  ${idx === selectedIndex
                    ? 'bg-scc-primary/20 border-l-2 border-scc-primary'
                    : 'hover:bg-slate-800/50 border-l-2 border-transparent'
                  }
                `}
              >
                <div className="flex items-center gap-2">
                  {suggestion.namespace && (
                    <span className={`px-1.5 py-0.5 text-xs font-mono rounded ${getNamespaceBadgeColor(suggestion.namespace)}`}>
                      @{suggestion.namespace}
                    </span>
                  )}
                  <span className="font-mono text-sm text-slate-200">
                    {suggestion.value.replace(/^@[a-zA-Z]+\.?/, '')}
                  </span>
                </div>
                {suggestion.description && (
                  <p className="text-xs text-slate-500 mt-0.5 truncate pl-0.5">
                    {suggestion.description}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Hint for empty input */}
        {!value && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-600 pointer-events-none z-0">
            Type @ for suggestions
          </div>
        )}
      </div>
    );
  }

  // Multi-line textarea
  return (
    <div className={className}>
      {label && (
        <label className="block text-xs text-slate-400 mb-1">{label}</label>
      )}

      <div className="relative rounded-lg border border-scc-border bg-scc-bg focus-within:border-scc-primary/50 focus-within:ring-1 focus-within:ring-scc-primary/20">
        {/* Highlighted layer */}
        <pre
          ref={highlightRef}
          className="absolute inset-0 p-3 font-mono text-sm overflow-hidden whitespace-pre-wrap break-words pointer-events-none"
          aria-hidden="true"
        >
          <code>{renderHighlightedTemplate()}</code>
        </pre>

        {/* Actual textarea */}
        <textarea
          ref={inputRef as React.RefObject<HTMLTextAreaElement>}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onSelect={handleSelect}
          onScroll={syncScroll}
          onFocus={() => setShowSuggestions(true)}
          rows={rows}
          placeholder=""
          className="w-full p-3 font-mono text-sm bg-transparent text-transparent caret-slate-200 resize-none relative z-10 outline-none"
          spellCheck={false}
        />

        {/* Suggestions dropdown */}
        {showSuggestions && suggestions.length > 0 && (
          <div
            ref={suggestionsRef}
            className="absolute top-full left-0 right-0 mt-1 bg-scc-surface border border-scc-border rounded-lg shadow-xl z-50 max-h-64 overflow-y-auto"
          >
            {suggestions.map((suggestion, idx) => (
              <div
                key={suggestion.value}
                onClick={() => handleSelectSuggestion(suggestion)}
                className={`
                  px-3 py-2 cursor-pointer transition-colors
                  ${idx === selectedIndex
                    ? 'bg-scc-primary/20 border-l-2 border-scc-primary'
                    : 'hover:bg-slate-800/50 border-l-2 border-transparent'
                  }
                `}
              >
                <div className="flex items-center gap-2">
                  {suggestion.namespace && (
                    <span className={`px-1.5 py-0.5 text-xs font-mono rounded ${getNamespaceBadgeColor(suggestion.namespace)}`}>
                      @{suggestion.namespace}
                    </span>
                  )}
                  <span className="font-mono text-sm text-slate-200">
                    {suggestion.value.replace(/^@[a-zA-Z]+\.?/, '')}
                  </span>
                </div>
                {suggestion.description && (
                  <p className="text-xs text-slate-500 mt-0.5 truncate pl-0.5">
                    {suggestion.description}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Hint */}
      {!value && (
        <p className="text-xs text-slate-600 mt-1">
          Use {'{{@namespace.path}}'} for references. Type @ inside {'{{ }}'} for suggestions.
        </p>
      )}
    </div>
  );
}
