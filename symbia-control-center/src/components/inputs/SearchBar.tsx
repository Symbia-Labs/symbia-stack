/**
 * Search Bar with Filter Tokens
 *
 * Interactive search bar that displays filter tokens as chips.
 * Designed for future Symbia Script compatibility.
 */
import { useRef, useState } from 'react';
import {
  useLogSearchStore,
  type FilterToken,
  filterTokenToSymbiaScript,
} from '@/stores/logSearchStore';

const OPERATOR_LABELS: Record<string, string> = {
  eq: '=',
  neq: '!=',
  contains: '~',
  regex: '/./',
  gt: '>',
  lt: '<',
  gte: '>=',
  lte: '<=',
  exists: '*',
};

interface SearchBarProps {
  onSearch: () => void;
  placeholder?: string;
  showSymbiaScriptPreview?: boolean;
}

export function SearchBar({
  onSearch,
  placeholder = 'Search logs...',
  showSymbiaScriptPreview = false,
}: SearchBarProps) {
  const {
    searchText,
    setSearchText,
    filterTokens,
    removeFilterToken,
    clearFilterTokens,
  } = useLogSearchStore();

  const inputRef = useRef<HTMLInputElement>(null);
  const [isFocused, setIsFocused] = useState(false);

  // Focus input when clicking the container
  const handleContainerClick = () => {
    inputRef.current?.focus();
  };

  // Handle keyboard shortcuts
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      onSearch();
    }
    // Backspace on empty input removes last filter token
    if (e.key === 'Backspace' && searchText === '' && filterTokens.length > 0) {
      removeFilterToken(filterTokens[filterTokens.length - 1].id);
    }
  };

  // Build Symbia Script preview
  const symbiaScriptPreview = [
    ...filterTokens.map(filterTokenToSymbiaScript),
    searchText ? `"${searchText}"` : '',
  ].filter(Boolean).join(' ');

  return (
    <div className="space-y-1">
      {/* Main search bar container */}
      <div
        onClick={handleContainerClick}
        className={`
          flex items-center flex-wrap gap-1.5 min-h-[40px] px-3 py-1.5
          bg-slate-700 border rounded-lg cursor-text transition-colors
          ${isFocused ? 'border-scc-primary' : 'border-slate-600'}
        `}
      >
        {/* Search icon */}
        <svg
          className="w-4 h-4 text-slate-500 shrink-0"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>

        {/* Filter tokens */}
        {filterTokens.map((token) => (
          <FilterTokenChip
            key={token.id}
            token={token}
            onRemove={() => removeFilterToken(token.id)}
          />
        ))}

        {/* Text input */}
        <input
          ref={inputRef}
          type="text"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder={filterTokens.length > 0 ? 'Add more filters...' : placeholder}
          className="flex-1 min-w-[120px] bg-transparent text-sm text-slate-200 placeholder-slate-500 outline-none"
        />

        {/* Clear all button */}
        {(filterTokens.length > 0 || searchText) && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              clearFilterTokens();
              setSearchText('');
            }}
            className="p-1 rounded hover:bg-slate-600 text-slate-500 hover:text-slate-300 shrink-0"
            title="Clear all"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Symbia Script preview (optional) */}
      {showSymbiaScriptPreview && filterTokens.length > 0 && (
        <div className="px-3 py-1.5 bg-slate-800/50 rounded text-xs font-mono text-slate-500">
          <span className="text-slate-600">Symbia Script: </span>
          {symbiaScriptPreview}
        </div>
      )}

      {/* Keyboard hint */}
      {isFocused && (
        <div className="flex items-center gap-3 px-1 text-xs text-slate-600">
          <span>
            <kbd className="px-1 py-0.5 bg-slate-800 rounded text-slate-500">Enter</kbd> to search
          </span>
          <span>
            <kbd className="px-1 py-0.5 bg-slate-800 rounded text-slate-500">Backspace</kbd> to remove last filter
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * Individual filter token chip
 */
function FilterTokenChip({
  token,
  onRemove,
}: {
  token: FilterToken;
  onRemove: () => void;
}) {
  const label = token.fieldLabel || token.field;
  const operatorLabel = OPERATOR_LABELS[token.operator] || '=';

  // Color based on field type
  const getChipColor = () => {
    if (token.field === 'level') {
      switch (token.value) {
        case 'error': return 'bg-red-500/20 text-red-400 border-red-500/30';
        case 'warn': return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
        case 'info': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
        case 'debug': return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
      }
    }
    return 'bg-scc-primary/20 text-scc-primary border-scc-primary/30';
  };

  return (
    <span
      className={`
        inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs border
        ${getChipColor()}
      `}
    >
      <span className="text-slate-500">{label}</span>
      <span className="opacity-60">{operatorLabel}</span>
      <span className="font-medium">{token.value}</span>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="ml-0.5 hover:text-white"
      >
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </span>
  );
}

/**
 * Compact version of search bar for inline use
 */
export function CompactSearchBar({ onSearch }: { onSearch: () => void }) {
  const { searchText, setSearchText, filterTokens } = useLogSearchStore();

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 relative">
        <input
          type="text"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onSearch()}
          placeholder="Search..."
          className="w-full pl-8 pr-3 py-1.5 text-sm bg-slate-700 border border-slate-600 rounded text-slate-200 placeholder-slate-500 focus:border-scc-primary focus:outline-none"
        />
        <svg
          className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </div>
      {filterTokens.length > 0 && (
        <span className="text-xs text-slate-500">
          +{filterTokens.length} filter{filterTokens.length > 1 ? 's' : ''}
        </span>
      )}
    </div>
  );
}
