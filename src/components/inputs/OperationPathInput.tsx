/**
 * OperationPathInput
 *
 * Autocomplete input for operation paths with syntax highlighting.
 * Supports paths like: integrations.{integration-key}.{operation-id}
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { integrationsClient, type Integration, type IntegrationOperation } from '@/services/integrationsClient';

interface Suggestion {
  value: string;
  label: string;
  description?: string;
  type: 'namespace' | 'integration' | 'operation';
  method?: string;
}

interface OperationPathInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  onOperationSelect?: (integration: Integration, operation: IntegrationOperation) => void;
}

export function OperationPathInput({
  value,
  onChange,
  placeholder = 'integrations.openai.chat.completions.create',
  className = '',
  onOperationSelect,
}: OperationPathInputProps) {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  // Load integrations on mount
  useEffect(() => {
    const loadIntegrations = async () => {
      setIsLoading(true);
      try {
        const data = await integrationsClient.listIntegrations();
        setIntegrations(data);
      } catch (error) {
        console.error('Failed to load integrations:', error);
      } finally {
        setIsLoading(false);
      }
    };
    loadIntegrations();
  }, []);

  // Compute suggestions based on current path
  const computeSuggestions = useCallback((currentValue: string) => {
    const segments = currentValue.split('.');
    const newSuggestions: Suggestion[] = [];

    // Empty or just starting
    if (!currentValue || currentValue === '') {
      newSuggestions.push({
        value: 'integrations.',
        label: 'integrations',
        description: 'Access registered integrations',
        type: 'namespace',
      });
      return newSuggestions;
    }

    // Just typed 'integrations' or partial
    if (segments.length === 1) {
      if ('integrations'.startsWith(segments[0].toLowerCase())) {
        newSuggestions.push({
          value: 'integrations.',
          label: 'integrations',
          description: 'Access registered integrations',
          type: 'namespace',
        });
      }
      return newSuggestions;
    }

    // After 'integrations.' - show integration keys
    if (segments[0] === 'integrations' && segments.length === 2) {
      const partialKey = segments[1].toLowerCase();
      for (const integration of integrations) {
        if (integration.key.toLowerCase().includes(partialKey) || partialKey === '') {
          newSuggestions.push({
            value: `integrations.${integration.key}.`,
            label: integration.key,
            description: integration.name,
            type: 'integration',
          });
        }
      }
      return newSuggestions;
    }

    // After 'integrations.{key}.' - show operations
    if (segments[0] === 'integrations' && segments.length >= 3) {
      const integrationKey = segments[1];
      const integration = integrations.find(i => i.key === integrationKey);

      if (integration?.operations) {
        const partialOp = segments.slice(2).join('.').toLowerCase();

        for (const op of integration.operations) {
          const opPath = op.id;
          if (opPath.toLowerCase().includes(partialOp) || partialOp === '') {
            newSuggestions.push({
              value: `integrations.${integrationKey}.${opPath}`,
              label: opPath,
              description: op.summary || op.path,
              type: 'operation',
              method: op.method,
            });
          }
        }
      }
      return newSuggestions;
    }

    return newSuggestions;
  }, [integrations]);

  // Update suggestions when value changes
  useEffect(() => {
    const newSuggestions = computeSuggestions(value);
    setSuggestions(newSuggestions);
    setSelectedIndex(0);
  }, [value, computeSuggestions]);

  // Handle input change
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    onChange(newValue);
    setShowSuggestions(true);
  };

  // Handle suggestion selection
  const handleSelectSuggestion = (suggestion: Suggestion) => {
    onChange(suggestion.value);
    setShowSuggestions(false);

    // If it's a complete operation, notify parent
    if (suggestion.type === 'operation' && onOperationSelect) {
      const segments = suggestion.value.split('.');
      const integrationKey = segments[1];
      const operationId = segments.slice(2).join('.');

      const integration = integrations.find(i => i.key === integrationKey);
      const operation = integration?.operations?.find(o => o.id === operationId);

      if (integration && operation) {
        onOperationSelect(integration, operation);
      }
    }

    // Focus back on input after selection
    inputRef.current?.focus();
  };

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showSuggestions || suggestions.length === 0) {
      if (e.key === 'ArrowDown' || e.key === 'Tab') {
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
        e.preventDefault();
        if (suggestions[selectedIndex]) {
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

  // Get method color
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

  // Render highlighted path
  const renderHighlightedValue = () => {
    if (!value) return null;

    const segments = value.split('.');
    return (
      <div className="absolute inset-0 flex items-center px-3 pointer-events-none overflow-hidden">
        {segments.map((segment, idx) => {
          let colorClass = 'text-slate-400';

          if (idx === 0 && segment === 'integrations') {
            colorClass = 'text-purple-400';
          } else if (idx === 1 && integrations.some(i => i.key === segment)) {
            colorClass = 'text-blue-400';
          } else if (idx >= 2) {
            colorClass = 'text-emerald-400';
          }

          return (
            <span key={idx} className="flex items-center">
              {idx > 0 && <span className="text-slate-600">.</span>}
              <span className={`${colorClass} font-mono text-sm`}>{segment}</span>
            </span>
          );
        })}
      </div>
    );
  };

  return (
    <div className={`relative ${className}`}>
      {/* Hidden highlighted overlay */}
      {renderHighlightedValue()}

      {/* Actual input */}
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onFocus={() => setShowSuggestions(true)}
        placeholder={placeholder}
        className="scc-input w-full text-sm font-mono text-transparent caret-slate-200 bg-transparent relative z-10"
        autoComplete="off"
        spellCheck={false}
      />

      {/* Loading indicator */}
      {isLoading && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2 z-20">
          <svg className="w-4 h-4 animate-spin text-slate-500" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
      )}

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
                {suggestion.method && (
                  <span className={`px-1.5 py-0.5 text-xs font-mono rounded ${getMethodColor(suggestion.method)}`}>
                    {suggestion.method}
                  </span>
                )}
                {suggestion.type === 'namespace' && (
                  <span className="px-1.5 py-0.5 text-xs rounded bg-purple-400/10 text-purple-400">
                    ns
                  </span>
                )}
                {suggestion.type === 'integration' && (
                  <span className="px-1.5 py-0.5 text-xs rounded bg-blue-400/10 text-blue-400">
                    api
                  </span>
                )}
                <span className="font-mono text-sm text-slate-200">{suggestion.label}</span>
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

      {/* No suggestions message */}
      {showSuggestions && suggestions.length === 0 && value && !isLoading && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-scc-surface border border-scc-border rounded-lg shadow-xl z-50 p-3">
          <p className="text-xs text-slate-500">
            No matching operations found. Try typing <code className="text-purple-400">integrations.</code> to browse.
          </p>
        </div>
      )}
    </div>
  );
}
