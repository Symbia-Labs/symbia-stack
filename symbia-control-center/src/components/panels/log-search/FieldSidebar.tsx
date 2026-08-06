/**
 * Field Sidebar
 *
 * Faceted search sidebar showing field values with counts.
 * Uses the field registry for known fields and extracts values from log entries.
 */
import { useMemo, useState } from 'react';
import { useLogSearchStore } from '@/stores/logSearchStore';
import {
  ALL_FIELDS,
  CATEGORY_INFO,
  type FieldCategory,
  type FieldDefinition,
  extractFieldValue,
} from '@/config/logFields';
import type { LogEntry } from '@/services/loggingStreamClient';

const LEVEL_COLORS: Record<string, string> = {
  debug: 'bg-log-debug-bg text-log-debug',
  info: 'bg-log-info-bg text-log-info',
  warn: 'bg-log-warn-bg text-log-warn',
  error: 'bg-log-error-bg text-log-error',
};

const LEVEL_BAR_COLORS: Record<string, string> = {
  debug: 'bg-text-muted/30',
  info: 'bg-info/30',
  warn: 'bg-warning/30',
  error: 'bg-error/30',
};

const LEVEL_DOTS: Record<string, string> = {
  debug: 'bg-text-muted',
  info: 'bg-info',
  warn: 'bg-warning',
  error: 'bg-error',
};

// HTTP Method colors - complementary pairs
const HTTP_METHOD_COLORS: Record<string, string> = {
  GET: 'bg-sky-500/30',
  POST: 'bg-violet-500/30',
  PUT: 'bg-amber-500/30',
  PATCH: 'bg-orange-500/30',
  DELETE: 'bg-red-500/30',
  HEAD: 'bg-slate-500/30',
  OPTIONS: 'bg-slate-500/30',
};

// Service colors for source field - matches service config
const SERVICE_SOURCE_COLORS: Record<string, { bg: string; border: string; dot: string }> = {
  network: { bg: 'bg-violet-500/30', border: 'border-violet-500/70', dot: 'bg-violet-400' },
  identity: { bg: 'bg-cyan-500/30', border: 'border-cyan-500/70', dot: 'bg-cyan-400' },
  logging: { bg: 'bg-emerald-500/30', border: 'border-emerald-500/70', dot: 'bg-emerald-400' },
  catalog: { bg: 'bg-amber-500/30', border: 'border-amber-500/70', dot: 'bg-amber-400' },
  assistants: { bg: 'bg-pink-500/30', border: 'border-pink-500/70', dot: 'bg-pink-400' },
  messaging: { bg: 'bg-sky-500/30', border: 'border-sky-500/70', dot: 'bg-sky-400' },
  runtime: { bg: 'bg-orange-500/30', border: 'border-orange-500/70', dot: 'bg-orange-400' },
  integrations: { bg: 'bg-purple-500/30', border: 'border-purple-500/70', dot: 'bg-purple-400' },
};

// Extract service name from source like "service.network.logs" → "network"
const extractServiceFromSource = (source: string): string | null => {
  const match = source.match(/^service\.(\w+)\.logs$/);
  return match ? match[1] : null;
};

// Format source for display: "service.network.logs" → "Network"
const formatSourceDisplay = (source: string): string => {
  const service = extractServiceFromSource(source);
  if (service) {
    return service.charAt(0).toUpperCase() + service.slice(1);
  }
  return source;
};

// Get service color from source
const getServiceSourceColor = (source: string): { bg: string; border: string; dot: string } | null => {
  const service = extractServiceFromSource(source);
  return service ? SERVICE_SOURCE_COLORS[service] || null : null;
};

// Status code colors - good/neutral/bad
const getStatusCodeColor = (status: string): string => {
  const code = parseInt(status, 10);
  if (code >= 200 && code < 300) return 'bg-emerald-500/30'; // Success - green
  if (code >= 300 && code < 400) return 'bg-cyan-500/30';    // Redirect - cyan
  if (code >= 400 && code < 500) return 'bg-amber-500/30';   // Client error - amber
  if (code >= 500) return 'bg-red-500/30';                   // Server error - red
  return 'bg-slate-500/30';
};

// Direction colors
const DIRECTION_COLORS: Record<string, string> = {
  inbound: 'bg-teal-500/30',
  outbound: 'bg-indigo-500/30',
};

// Multi-color palette for string fields like Stream ID (cycles through)
const STRING_VALUE_PALETTE = [
  'bg-sky-500/30',
  'bg-violet-500/30',
  'bg-rose-500/30',
  'bg-amber-500/30',
  'bg-teal-500/30',
  'bg-fuchsia-500/30',
];

// Get color from palette based on index
const getStringValueColor = (index: number): string => {
  return STRING_VALUE_PALETTE[index % STRING_VALUE_PALETTE.length];
};

interface FieldValueCount {
  value: string;
  count: number;
}

interface ExtractedField {
  definition: FieldDefinition;
  values: FieldValueCount[];
  totalCount: number;
}

interface FieldSidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function FieldSidebar({ collapsed, onToggle }: FieldSidebarProps) {
  const {
    results,
    filterTokens,
    toggleFilterToken,
    removeFilterToken,
    hasFilterToken,
    executeSearch,
  } = useLogSearchStore();

  const [expandedCategories, setExpandedCategories] = useState<Set<FieldCategory>>(
    new Set(['common', 'payload'])
  );
  const [searchQuery, setSearchQuery] = useState('');

  // Extract field values from results using the field registry
  const extractedFields = useMemo(() => {
    return extractFieldsFromResults(results);
  }, [results]);

  // Filter fields based on search
  const filteredFields = useMemo(() => {
    if (!searchQuery) return extractedFields;
    const query = searchQuery.toLowerCase();
    return extractedFields.filter(
      (f) =>
        f.definition.label.toLowerCase().includes(query) ||
        f.definition.key.toLowerCase().includes(query)
    );
  }, [extractedFields, searchQuery]);

  // Group fields by category
  const fieldsByCategory = useMemo(() => {
    const grouped = new Map<FieldCategory, ExtractedField[]>();
    for (const field of filteredFields) {
      const category = field.definition.category;
      if (!grouped.has(category)) {
        grouped.set(category, []);
      }
      grouped.get(category)!.push(field);
    }
    return grouped;
  }, [filteredFields]);

  const handleFieldValueClick = (field: FieldDefinition, value: string) => {
    toggleFilterToken(field.key, value, 'eq', field.label);
    executeSearch();
  };

  const toggleCategory = (category: FieldCategory) => {
    const newSet = new Set(expandedCategories);
    if (newSet.has(category)) {
      newSet.delete(category);
    } else {
      newSet.add(category);
    }
    setExpandedCategories(newSet);
  };

  if (collapsed) {
    return (
      <div className="w-10 shrink-0 border-r border-scc-border bg-scc-elevated/30">
        <button
          onClick={onToggle}
          className="w-full p-2 flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-surface-highlight"
          title="Expand sidebar"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    );
  }

  const categories: FieldCategory[] = ['common', 'trace', 'payload', 'envelope'];

  return (
    <div className="w-64 shrink-0 border-r border-scc-border bg-scc-elevated/30 flex flex-col">
      {/* Header */}
      <div className="p-3 border-b border-scc-border flex items-center justify-between">
        <span className="text-sm font-medium text-text-secondary">Fields</span>
        <button
          onClick={onToggle}
          className="p-1 rounded hover:bg-surface-highlight text-text-muted hover:text-text-primary"
          title="Collapse sidebar"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      </div>

      {/* Search fields */}
      <div className="p-2 border-b border-scc-border">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search fields..."
          className="w-full px-2 py-1 text-xs bg-surface-sunken border border-border rounded text-text-primary placeholder-text-muted focus:border-primary-500 focus:outline-none"
        />
      </div>

      {/* Active filters */}
      {filterTokens.length > 0 && (
        <div className="p-2 border-b border-scc-border">
          <div className="text-xs text-text-muted mb-1.5">Active Filters</div>
          <div className="flex flex-wrap gap-1">
            {filterTokens.map((token) => (
              <button
                key={token.id}
                onClick={() => {
                  removeFilterToken(token.id);
                  executeSearch();
                }}
                className={`text-xs px-1.5 py-0.5 rounded flex items-center gap-1 ${
                  token.field === 'level' ? LEVEL_COLORS[token.value] || 'bg-scc-primary/20 text-scc-primary' : 'bg-scc-primary/20 text-scc-primary'
                }`}
              >
                {token.fieldLabel || token.field}:{token.value}
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Field categories */}
      <div className="flex-1 overflow-y-auto">
        {results.length === 0 ? (
          <div className="p-4 text-center text-sm text-text-muted">
            No results yet.
            <br />
            Run a search to see fields.
          </div>
        ) : (
          categories.map((category) => {
            const fields = fieldsByCategory.get(category) || [];
            const isExpanded = expandedCategories.has(category);
            const hasValues = fields.some((f) => f.values.length > 0);

            if (!hasValues && !searchQuery) return null;

            return (
              <div key={category} className="border-b border-scc-border/50">
                {/* Category header */}
                <button
                  onClick={() => toggleCategory(category)}
                  className="w-full px-3 py-2 flex items-center justify-between bg-surface-highlight/50 hover:bg-surface-highlight transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <svg
                      className={`w-3 h-3 text-text-muted transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                    <span className="text-xs font-medium text-text-secondary uppercase tracking-wider">
                      {CATEGORY_INFO[category].label}
                    </span>
                  </div>
                  <span className="text-xs text-text-muted">
                    {fields.filter((f) => f.values.length > 0).length}
                  </span>
                </button>

                {/* Fields in category */}
                {isExpanded && (
                  <div className="py-1">
                    {fields.map((field) =>
                      field.values.length > 0 ? (
                        <FieldSection
                          key={field.definition.key}
                          field={field}
                          totalLogs={results.length}
                          isValueActive={(value) => hasFilterToken(field.definition.key, value)}
                          onValueClick={(value) => handleFieldValueClick(field.definition, value)}
                        />
                      ) : null
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}

        {/* Dynamic tags section */}
        {results.length > 0 && (
          <DynamicTagsSection
            results={results}
            searchQuery={searchQuery}
          />
        )}
      </div>

      {/* Footer with field count */}
      <div className="shrink-0 px-3 py-2 border-t border-scc-border text-xs text-text-muted">
        {filteredFields.filter((f) => f.values.length > 0).length} fields with values
      </div>
    </div>
  );
}

function FieldSection({
  field,
  isValueActive,
  onValueClick,
  totalLogs,
}: {
  field: ExtractedField;
  isValueActive: (value: string) => boolean;
  onValueClick: (value: string) => void;
  totalLogs: number;
}) {
  const [isExpanded, setIsExpanded] = useState(true);
  const isLevel = field.definition.key === 'level';
  const isSource = field.definition.key === 'source';
  const maxCount = Math.max(...field.values.map((v) => v.count));

  // Calculate bar width as percentage of total logs (capped at 33% - right third)
  const barWidth = totalLogs > 0 ? (field.totalCount / totalLogs) * 33 : 0;

  // Get bar color based on field category (for field headers)
  const getBarColor = () => {
    const category = field.definition.category;
    switch (category) {
      case 'common':
        return 'bg-blue-500/30';
      case 'trace':
        return 'bg-purple-500/30';
      case 'payload':
        return 'bg-emerald-500/30';
      case 'envelope':
        return 'bg-cyan-500/30'; // More visible than slate
      default:
        return 'bg-scc-primary/25';
    }
  };

  // Get value-specific bar color based on field key and value
  const getValueBarColor = (value: string, index: number): string => {
    const fieldKey = field.definition.key;

    // Level field
    if (fieldKey === 'level') {
      return LEVEL_BAR_COLORS[value] || 'bg-slate-500/30';
    }

    // Source field - use service-specific colors
    if (fieldKey === 'source') {
      const serviceColor = getServiceSourceColor(value);
      return serviceColor?.bg || getStringValueColor(index);
    }

    // HTTP Method
    if (fieldKey === 'metadata.method') {
      return HTTP_METHOD_COLORS[value] || 'bg-slate-500/30';
    }

    // Status Code
    if (fieldKey === 'metadata.status') {
      return getStatusCodeColor(value);
    }

    // Direction
    if (fieldKey === 'metadata.direction') {
      return DIRECTION_COLORS[value] || 'bg-slate-500/30';
    }

    // Envelope fields (streamId, etc.) - use rotating palette
    if (field.definition.category === 'envelope') {
      return getStringValueColor(index);
    }

    // Other string fields with many values - use rotating palette
    if (field.definition.type === 'string' && field.values.length > 2) {
      return getStringValueColor(index);
    }

    // Fall back to category color
    return getBarColor();
  };

  // Get border color for source field values
  const getValueBorderColor = (value: string, index: number): string => {
    if (field.definition.key === 'source') {
      const serviceColor = getServiceSourceColor(value);
      return serviceColor?.border || 'border-slate-500/70';
    }
    const barColor = getValueBarColor(value, index);
    return barColor.replace('bg-', 'border-').replace('/30', '/70');
  };

  // Get highlight color from bar color (brighter for border)
  const barColor = getBarColor();
  const highlightColor = barColor.replace('/30', '/60');

  return (
    <div className="mb-0.5">
      {/* Field header with count bar */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-3 py-1.5 flex items-center justify-between text-left hover:bg-surface-highlight relative overflow-hidden"
      >
        {/* Background bar showing proportion (from right side) with highlight border */}
        <div
          className={`absolute right-0 top-0.5 bottom-0.5 rounded-l transition-all ${barColor} border-l-2 ${highlightColor.replace('bg-', 'border-')}`}
          style={{ width: `${barWidth}%` }}
        />
        <div className="flex items-center gap-1.5 relative z-10">
          <svg
            className={`w-2.5 h-2.5 text-text-muted transition-transform ${isExpanded ? 'rotate-90' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <span className="text-xs text-text-secondary">{field.definition.label}</span>
        </div>
        <span className="text-xs text-text-secondary font-medium relative z-10">{field.totalCount}</span>
      </button>

      {/* Field values */}
      {isExpanded && (
        <div className="ml-3">
          {field.values.slice(0, 10).map(({ value, count }, index) => {
            const isActive = isValueActive(value);
            const barWidth = (count / maxCount) * 33; // Capped at right third
            const barColor = getValueBarColor(value, index);
            const borderColor = getValueBorderColor(value, index);

            // Get display value and dot color for source field
            const displayValue = isSource ? formatSourceDisplay(value) : value;
            const sourceColor = isSource ? getServiceSourceColor(value) : null;

            return (
              <button
                key={value}
                onClick={() => onValueClick(value)}
                className={`
                  w-full px-2 py-1.5 text-left flex items-center justify-between gap-2
                  transition-colors relative overflow-hidden text-xs
                  ${isActive
                    ? 'bg-primary-500/20 text-primary-500'
                    : 'text-text-secondary hover:bg-surface-highlight'
                  }
                `}
              >
                {/* Background bar (from right side) with highlight border */}
                <div
                  className={`absolute right-0 top-0.5 bottom-0.5 rounded-l transition-all ${barColor} border-l-2 ${borderColor}`}
                  style={{ width: `${barWidth}%` }}
                />

                {/* Content */}
                <span className="relative truncate flex items-center gap-1.5">
                  {isLevel && (
                    <span className={`w-1.5 h-1.5 rounded-full ${LEVEL_DOTS[value] || 'bg-text-muted'}`} />
                  )}
                  {isSource && sourceColor && (
                    <span className={`w-2 h-2 rounded-full ${sourceColor.dot}`} />
                  )}
                  {displayValue || '(empty)'}
                </span>
                <span className="relative text-text-secondary font-medium">{count}</span>
              </button>
            );
          })}
          {field.values.length > 10 && (
            <div className="px-2 py-1 text-xs text-text-muted">
              +{field.values.length - 10} more values
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Dynamic tags section - extracts tags from log entries
 */
function DynamicTagsSection({
  results,
  searchQuery,
}: {
  results: LogEntry[];
  searchQuery: string;
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  const tagStats = useMemo(() => {
    const tagCounts = new Map<string, Map<string, number>>();

    for (const log of results) {
      if (log.tags) {
        for (const [key, value] of Object.entries(log.tags)) {
          if (!tagCounts.has(key)) {
            tagCounts.set(key, new Map());
          }
          const valueMap = tagCounts.get(key)!;
          valueMap.set(value, (valueMap.get(value) || 0) + 1);
        }
      }
    }

    const stats: Array<{ key: string; values: FieldValueCount[] }> = [];
    for (const [key, valueMap] of tagCounts) {
      if (searchQuery && !key.toLowerCase().includes(searchQuery.toLowerCase())) {
        continue;
      }
      const values = Array.from(valueMap.entries())
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => b.count - a.count);
      stats.push({ key, values });
    }

    return stats.sort((a, b) => a.key.localeCompare(b.key));
  }, [results, searchQuery]);

  if (tagStats.length === 0) return null;

  return (
    <div className="border-b border-scc-border/50">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-3 py-2 flex items-center justify-between bg-surface-highlight/50 hover:bg-surface-highlight transition-colors"
      >
        <div className="flex items-center gap-2">
          <svg
            className={`w-3 h-3 text-text-muted transition-transform ${isExpanded ? 'rotate-90' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <span className="text-xs font-medium text-text-secondary uppercase tracking-wider">Tags</span>
        </div>
        <span className="text-xs text-text-muted">{tagStats.length}</span>
      </button>

      {isExpanded && (
        <div className="py-1">
          {tagStats.map(({ key, values }) => (
            <div key={key} className="mb-1">
              <div className="px-3 py-1 text-xs text-text-muted">{key}</div>
              <div className="ml-3">
                {values.slice(0, 5).map(({ value, count }) => (
                  <div
                    key={value}
                    className="px-2 py-1 text-xs flex items-center justify-between text-text-secondary"
                  >
                    <span className="truncate">{value}</span>
                    <span className="text-text-muted">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Extract field values from log entries using the field registry
 */
function extractFieldsFromResults(results: LogEntry[]): ExtractedField[] {
  const filterableFields = ALL_FIELDS.filter((f) => f.filterable);
  const extracted: ExtractedField[] = [];

  for (const fieldDef of filterableFields) {
    const valueCounts = new Map<string, number>();

    for (const log of results) {
      const value = extractFieldValue(log as unknown as Record<string, unknown>, fieldDef);
      if (value !== undefined && value !== null && value !== '') {
        const strValue = String(value);
        valueCounts.set(strValue, (valueCounts.get(strValue) || 0) + 1);
      }
    }

    const values = Array.from(valueCounts.entries())
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count);

    extracted.push({
      definition: fieldDef,
      values,
      totalCount: values.reduce((sum, v) => sum + v.count, 0),
    });
  }

  return extracted;
}
