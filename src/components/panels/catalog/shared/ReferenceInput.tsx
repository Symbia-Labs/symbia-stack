/**
 * Reference Input
 *
 * Smart input with @ and # autocomplete for referencing contexts and tags.
 * Highlights references in the text.
 */

import { useState, useRef, useEffect, useCallback } from 'react';

// Sample contexts and tags for suggestions (in real app, these would come from the store)
const SAMPLE_CONTEXTS = [
  { key: 'user', label: 'User', description: 'Current user context' },
  { key: 'session', label: 'Session', description: 'Active session data' },
  { key: 'preferences', label: 'Preferences', description: 'User preferences' },
  { key: 'history', label: 'History', description: 'Conversation history' },
  { key: 'memory', label: 'Memory', description: 'Long-term memory' },
];

const SAMPLE_TAGS = [
  { tag: 'important', description: 'Mark as important' },
  { tag: 'async', description: 'Run asynchronously' },
  { tag: 'cached', description: 'Use cached result' },
  { tag: 'logged', description: 'Log this step' },
  { tag: 'retry', description: 'Retry on failure' },
];

interface ReferenceInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function ReferenceInput({
  value,
  onChange,
  placeholder,
  className = '',
}: ReferenceInputProps) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestionType, setSuggestionType] = useState<'@' | '#' | null>(null);
  const [suggestionFilter, setSuggestionFilter] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  // Get filtered suggestions based on type and filter
  const getSuggestions = useCallback(() => {
    if (suggestionType === '@') {
      return SAMPLE_CONTEXTS.filter(
        c => c.key.toLowerCase().includes(suggestionFilter.toLowerCase()) ||
             c.label.toLowerCase().includes(suggestionFilter.toLowerCase())
      );
    } else if (suggestionType === '#') {
      return SAMPLE_TAGS.filter(
        t => t.tag.toLowerCase().includes(suggestionFilter.toLowerCase())
      );
    }
    return [];
  }, [suggestionType, suggestionFilter]);

  const suggestions = getSuggestions();

  // Handle input change
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    onChange(newValue);

    // Check for @ or # trigger
    const cursorPos = e.target.selectionStart || 0;
    const textBeforeCursor = newValue.slice(0, cursorPos);

    // Find the last @ or # before cursor
    const lastAt = textBeforeCursor.lastIndexOf('@');
    const lastHash = textBeforeCursor.lastIndexOf('#');
    const lastSpace = Math.max(
      textBeforeCursor.lastIndexOf(' '),
      textBeforeCursor.lastIndexOf('\n')
    );

    if (lastAt > lastSpace && lastAt > lastHash) {
      // We're in an @ reference
      setSuggestionType('@');
      setSuggestionFilter(textBeforeCursor.slice(lastAt + 1));
      setShowSuggestions(true);
      setSelectedIndex(0);
    } else if (lastHash > lastSpace && lastHash > lastAt) {
      // We're in a # reference
      setSuggestionType('#');
      setSuggestionFilter(textBeforeCursor.slice(lastHash + 1));
      setShowSuggestions(true);
      setSelectedIndex(0);
    } else {
      setShowSuggestions(false);
      setSuggestionType(null);
    }
  };

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showSuggestions || suggestions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      selectSuggestion(selectedIndex);
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  };

  // Select a suggestion
  const selectSuggestion = (index: number) => {
    const suggestion = suggestions[index];
    if (!suggestion || !inputRef.current) return;

    const cursorPos = inputRef.current.selectionStart || 0;
    const textBeforeCursor = value.slice(0, cursorPos);
    const textAfterCursor = value.slice(cursorPos);

    // Find where the reference starts
    const refStart = suggestionType === '@'
      ? textBeforeCursor.lastIndexOf('@')
      : textBeforeCursor.lastIndexOf('#');

    // Build new value
    const refText = suggestionType === '@'
      ? `@${(suggestion as typeof SAMPLE_CONTEXTS[0]).key}`
      : `#${(suggestion as typeof SAMPLE_TAGS[0]).tag}`;

    const newValue = textBeforeCursor.slice(0, refStart) + refText + ' ' + textAfterCursor;
    onChange(newValue);
    setShowSuggestions(false);

    // Focus back on input
    setTimeout(() => {
      if (inputRef.current) {
        const newCursorPos = refStart + refText.length + 1;
        inputRef.current.focus();
        inputRef.current.setSelectionRange(newCursorPos, newCursorPos);
      }
    }, 0);
  };

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(e.target as Node) &&
        !inputRef.current?.contains(e.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative flex-1">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
        placeholder={placeholder}
        className={`scc-input text-sm ${className}`}
      />

      {/* Suggestions dropdown */}
      {showSuggestions && suggestions.length > 0 && (
        <div
          ref={suggestionsRef}
          className="absolute left-0 right-0 top-full mt-1 bg-scc-elevated border border-scc-border rounded-lg shadow-lg z-20 max-h-48 overflow-y-auto"
        >
          <div className="p-1">
            <div className="px-2 py-1 text-xs text-slate-500 border-b border-scc-border mb-1">
              {suggestionType === '@' ? 'Contexts' : 'Tags'}
            </div>
            {suggestions.map((suggestion, index) => (
              <button
                key={suggestionType === '@'
                  ? (suggestion as typeof SAMPLE_CONTEXTS[0]).key
                  : (suggestion as typeof SAMPLE_TAGS[0]).tag
                }
                onClick={() => selectSuggestion(index)}
                className={`
                  w-full text-left px-2 py-1.5 rounded text-sm flex items-center gap-2 transition-colors
                  ${index === selectedIndex ? 'bg-scc-primary/20 text-scc-primary' : 'hover:bg-scc-surface text-slate-300'}
                `}
              >
                <span className={suggestionType === '@' ? 'text-blue-400' : 'text-green-400'}>
                  {suggestionType}
                </span>
                <span className="font-medium">
                  {suggestionType === '@'
                    ? (suggestion as typeof SAMPLE_CONTEXTS[0]).key
                    : (suggestion as typeof SAMPLE_TAGS[0]).tag
                  }
                </span>
                <span className="text-xs text-slate-500 ml-auto">
                  {suggestionType === '@'
                    ? (suggestion as typeof SAMPLE_CONTEXTS[0]).description
                    : (suggestion as typeof SAMPLE_TAGS[0]).description
                  }
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Hint */}
      {!value && (
        <div className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-600 pointer-events-none">
          Type @ or #
        </div>
      )}
    </div>
  );
}
