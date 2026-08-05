/**
 * Log Search Store
 *
 * Zustand store for the log search interface.
 * Manages search filters, results, pagination, and UI state.
 */
import { create } from 'zustand';
import { loggingStreamClient, type LogEntry, type LogStream, type LogsQuery } from '@/services/loggingStreamClient';

// =============================================================================
// Types
// =============================================================================

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type TimeRangePreset = '15m' | '1h' | '4h' | '24h' | '7d' | 'custom';

export interface TimeRange {
  preset: TimeRangePreset;
  startTime?: Date;
  endTime?: Date;
}

export interface FieldStat {
  field: string;
  values: Array<{ value: string; count: number }>;
}

/**
 * Filter token types - designed for future Symbia Script compatibility
 *
 * Current syntax: field:value (simple equality)
 * Future Symbia Script: @filter(field, "value"), @match(field, "pattern"), etc.
 */
export type FilterOperator = 'eq' | 'neq' | 'contains' | 'regex' | 'gt' | 'lt' | 'gte' | 'lte' | 'exists';

export interface FilterToken {
  id: string;
  field: string;
  operator: FilterOperator;
  value: string;
  /** Display label for the field (from field registry) */
  fieldLabel?: string;
  /** Whether this is a negation (NOT) */
  negated?: boolean;
}

/**
 * Convert filter token to display string
 */
export function filterTokenToString(token: FilterToken): string {
  const prefix = token.negated ? '-' : '';
  switch (token.operator) {
    case 'eq':
      return `${prefix}${token.field}:${token.value}`;
    case 'neq':
      return `${prefix}${token.field}:!${token.value}`;
    case 'contains':
      return `${prefix}${token.field}:*${token.value}*`;
    case 'regex':
      return `${prefix}${token.field}:/${token.value}/`;
    case 'gt':
      return `${prefix}${token.field}:>${token.value}`;
    case 'lt':
      return `${prefix}${token.field}:<${token.value}`;
    case 'gte':
      return `${prefix}${token.field}:>=${token.value}`;
    case 'lte':
      return `${prefix}${token.field}:<=${token.value}`;
    case 'exists':
      return `${prefix}${token.field}:*`;
    default:
      return `${prefix}${token.field}:${token.value}`;
  }
}

/**
 * Convert filter token to future Symbia Script syntax (preview)
 */
export function filterTokenToSymbiaScript(token: FilterToken): string {
  const not = token.negated ? '!' : '';
  switch (token.operator) {
    case 'eq':
      return `${not}@filter(${token.field}, "${token.value}")`;
    case 'neq':
      return `@filter(${token.field}, != "${token.value}")`;
    case 'contains':
      return `${not}@match(${token.field}, "*${token.value}*")`;
    case 'regex':
      return `${not}@match(${token.field}, /${token.value}/)`;
    case 'gt':
    case 'lt':
    case 'gte':
    case 'lte':
      return `${not}@range(${token.field}, ${token.operator}, ${token.value})`;
    case 'exists':
      return `${not}@exists(${token.field})`;
    default:
      return `${not}@filter(${token.field}, "${token.value}")`;
  }
}

export interface SavedSearch {
  id: string;
  name: string;
  searchText: string;
  levelFilter: LogLevel | 'all';
  streamFilter: string[];
  sourceFilter: string[];
  timeRange: TimeRange;
  createdAt: string;
}

export interface HistogramBucket {
  time: Date;
  debug: number;
  info: number;
  warn: number;
  error: number;
  total: number;
}

interface LogSearchState {
  // Filters (structured, not query string)
  searchText: string;
  filterTokens: FilterToken[];
  levelFilter: LogLevel | 'all';
  streamFilter: string[];
  sourceFilter: string[];
  timeRange: TimeRange;

  // Available streams (for filter UI)
  availableStreams: LogStream[];

  // Results
  results: LogEntry[];
  totalCount: number;
  isLoading: boolean;
  error: string | null;

  // Histogram data
  histogramData: HistogramBucket[];
  isLoadingHistogram: boolean;

  // Pagination
  offset: number;
  limit: number;
  hasMore: boolean;

  // Field stats (computed from results)
  fieldStats: FieldStat[];

  // UI state
  isLive: boolean;
  liveSubscriptionId: string | null;
  expandedLogId: string | null;
  sidebarCollapsed: boolean;
  selectedColumns: string[];

  // Saved searches
  savedSearches: SavedSearch[];
  savedSearchesOpen: boolean;

  // Actions - Filters
  setSearchText: (text: string) => void;
  setLevelFilter: (level: LogLevel | 'all') => void;
  setStreamFilter: (streams: string[]) => void;
  toggleStreamFilter: (streamId: string) => void;
  setSourceFilter: (sources: string[]) => void;
  addSourceFilter: (source: string) => void;
  removeSourceFilter: (source: string) => void;
  setTimeRange: (range: TimeRange) => void;
  setTimeRangePreset: (preset: TimeRangePreset) => void;
  clearFilters: () => void;

  // Actions - Filter Tokens
  addFilterToken: (field: string, value: string, operator?: FilterOperator, fieldLabel?: string) => void;
  removeFilterToken: (id: string) => void;
  toggleFilterToken: (field: string, value: string, operator?: FilterOperator, fieldLabel?: string) => void;
  clearFilterTokens: () => void;
  hasFilterToken: (field: string, value: string) => boolean;

  // Actions - Search
  executeSearch: () => Promise<void>;
  loadMore: () => Promise<void>;
  refreshResults: () => Promise<void>;

  // Actions - Histogram
  loadHistogram: () => Promise<void>;
  zoomToTimeRange: (start: Date, end: Date) => void;

  // Actions - Live mode
  toggleLiveMode: () => void;
  startLiveMode: () => void;
  stopLiveMode: () => void;

  // Actions - UI
  setExpandedLogId: (id: string | null) => void;
  toggleSidebar: () => void;
  setSelectedColumns: (columns: string[]) => void;

  // Actions - Saved searches
  saveSearch: (name: string) => void;
  loadSavedSearch: (search: SavedSearch) => void;
  deleteSavedSearch: (id: string) => void;
  toggleSavedSearches: () => void;

  // Actions - Streams
  loadStreams: () => Promise<void>;

  // Actions - Field stats
  computeFieldStats: () => void;

  // Reset
  reset: () => void;
}

// =============================================================================
// Helpers
// =============================================================================

const STORAGE_KEY = 'symbia:log-search:saved-searches';

function loadSavedSearchesFromStorage(): SavedSearch[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveSavedSearchesToStorage(searches: SavedSearch[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(searches));
  } catch (e) {
    console.error('[LogSearchStore] Failed to save searches:', e);
  }
}

function getTimeRangeStart(preset: TimeRangePreset): Date {
  const now = new Date();
  switch (preset) {
    case '15m':
      return new Date(now.getTime() - 15 * 60 * 1000);
    case '1h':
      return new Date(now.getTime() - 60 * 60 * 1000);
    case '4h':
      return new Date(now.getTime() - 4 * 60 * 60 * 1000);
    case '24h':
      return new Date(now.getTime() - 24 * 60 * 60 * 1000);
    case '7d':
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case 'custom':
    default:
      return new Date(now.getTime() - 60 * 60 * 1000); // Default to 1h
  }
}

function buildQuery(state: Pick<LogSearchState, 'searchText' | 'levelFilter' | 'streamFilter' | 'timeRange' | 'offset' | 'limit'>): LogsQuery {
  const query: LogsQuery = {
    limit: state.limit,
    offset: state.offset,
  };

  if (state.searchText) {
    query.search = state.searchText;
  }

  if (state.levelFilter !== 'all') {
    query.level = state.levelFilter;
  }

  if (state.streamFilter.length > 0) {
    query.streamIds = state.streamFilter;
  }

  // Time range
  if (state.timeRange.preset !== 'custom') {
    query.startTime = getTimeRangeStart(state.timeRange.preset).toISOString();
    query.endTime = new Date().toISOString();
  } else if (state.timeRange.startTime && state.timeRange.endTime) {
    query.startTime = state.timeRange.startTime.toISOString();
    query.endTime = state.timeRange.endTime.toISOString();
  }

  return query;
}

function computeFieldStatsFromResults(results: LogEntry[]): FieldStat[] {
  const fieldCounts = new Map<string, Map<string, number>>();

  // Collect stats for key fields
  for (const log of results) {
    // Level
    if (!fieldCounts.has('level')) fieldCounts.set('level', new Map());
    const levelMap = fieldCounts.get('level')!;
    levelMap.set(log.level, (levelMap.get(log.level) || 0) + 1);

    // Source
    if (log.source) {
      if (!fieldCounts.has('source')) fieldCounts.set('source', new Map());
      const sourceMap = fieldCounts.get('source')!;
      sourceMap.set(log.source, (sourceMap.get(log.source) || 0) + 1);
    }

    // Tags
    if (log.tags) {
      for (const [key, value] of Object.entries(log.tags)) {
        const tagField = `tag:${key}`;
        if (!fieldCounts.has(tagField)) fieldCounts.set(tagField, new Map());
        const tagMap = fieldCounts.get(tagField)!;
        tagMap.set(value, (tagMap.get(value) || 0) + 1);
      }
    }
  }

  // Convert to FieldStat array
  const stats: FieldStat[] = [];
  for (const [field, valueMap] of fieldCounts) {
    const values = Array.from(valueMap.entries())
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10); // Top 10 values per field
    stats.push({ field, values });
  }

  return stats;
}

function generateHistogramData(results: LogEntry[], bucketCount: number = 20): HistogramBucket[] {
  if (results.length === 0) return [];

  // Find time range from results
  const times = results.map(r => new Date(r.timestamp).getTime());
  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);
  const bucketSize = (maxTime - minTime) / bucketCount || 60000; // Default to 1 minute buckets

  // Initialize buckets
  const buckets: HistogramBucket[] = [];
  for (let i = 0; i < bucketCount; i++) {
    buckets.push({
      time: new Date(minTime + i * bucketSize),
      debug: 0,
      info: 0,
      warn: 0,
      error: 0,
      total: 0,
    });
  }

  // Fill buckets
  for (const log of results) {
    const time = new Date(log.timestamp).getTime();
    const bucketIndex = Math.min(
      Math.floor((time - minTime) / bucketSize),
      bucketCount - 1
    );
    if (bucketIndex >= 0 && bucketIndex < buckets.length) {
      buckets[bucketIndex][log.level]++;
      buckets[bucketIndex].total++;
    }
  }

  return buckets;
}

// =============================================================================
// Initial State
// =============================================================================

const initialState = {
  // Filters
  searchText: '',
  filterTokens: [] as FilterToken[],
  levelFilter: 'all' as const,
  streamFilter: [] as string[],
  sourceFilter: [] as string[],
  timeRange: { preset: '1h' as const },

  // Streams
  availableStreams: [] as LogStream[],

  // Results
  results: [] as LogEntry[],
  totalCount: 0,
  isLoading: false,
  error: null as string | null,

  // Histogram
  histogramData: [] as HistogramBucket[],
  isLoadingHistogram: false,

  // Pagination
  offset: 0,
  limit: 100,
  hasMore: false,

  // Field stats
  fieldStats: [] as FieldStat[],

  // UI
  isLive: false,
  liveSubscriptionId: null as string | null,
  expandedLogId: null as string | null,
  sidebarCollapsed: false,
  selectedColumns: ['timestamp', 'level', 'source', 'message'] as string[],

  // Saved searches
  savedSearches: loadSavedSearchesFromStorage(),
  savedSearchesOpen: false,
};

// =============================================================================
// Store
// =============================================================================

export const useLogSearchStore = create<LogSearchState>((set, get) => ({
  ...initialState,

  // ===========================================================================
  // Filter Actions
  // ===========================================================================

  setSearchText: (searchText) => set({ searchText }),

  setLevelFilter: (levelFilter) => set({ levelFilter }),

  setStreamFilter: (streamFilter) => set({ streamFilter }),

  toggleStreamFilter: (streamId) =>
    set((state) => {
      const newFilter = state.streamFilter.includes(streamId)
        ? state.streamFilter.filter((id) => id !== streamId)
        : [...state.streamFilter, streamId];
      return { streamFilter: newFilter };
    }),

  setSourceFilter: (sourceFilter) => set({ sourceFilter }),

  addSourceFilter: (source) =>
    set((state) => ({
      sourceFilter: state.sourceFilter.includes(source)
        ? state.sourceFilter
        : [...state.sourceFilter, source],
    })),

  removeSourceFilter: (source) =>
    set((state) => ({
      sourceFilter: state.sourceFilter.filter((s) => s !== source),
    })),

  setTimeRange: (timeRange) => set({ timeRange }),

  setTimeRangePreset: (preset) =>
    set({ timeRange: { preset } }),

  clearFilters: () =>
    set({
      searchText: '',
      filterTokens: [],
      levelFilter: 'all',
      streamFilter: [],
      sourceFilter: [],
      timeRange: { preset: '1h' },
    }),

  // ===========================================================================
  // Filter Token Actions
  // ===========================================================================

  addFilterToken: (field, value, operator = 'eq', fieldLabel) => {
    const id = `filter_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    set((state) => ({
      filterTokens: [
        ...state.filterTokens,
        { id, field, operator, value, fieldLabel },
      ],
    }));
  },

  removeFilterToken: (id) =>
    set((state) => ({
      filterTokens: state.filterTokens.filter((t) => t.id !== id),
    })),

  toggleFilterToken: (field, value, operator = 'eq', fieldLabel) => {
    const state = get();
    const existing = state.filterTokens.find(
      (t) => t.field === field && t.value === value && t.operator === operator
    );
    if (existing) {
      get().removeFilterToken(existing.id);
    } else {
      get().addFilterToken(field, value, operator, fieldLabel);
    }
  },

  clearFilterTokens: () => set({ filterTokens: [] }),

  hasFilterToken: (field, value) => {
    const state = get();
    return state.filterTokens.some((t) => t.field === field && t.value === value);
  },

  // ===========================================================================
  // Search Actions
  // ===========================================================================

  executeSearch: async () => {
    const state = get();

    // Stop live mode when searching
    if (state.isLive) {
      get().stopLiveMode();
    }

    set({ isLoading: true, error: null, offset: 0 });

    try {
      const query = buildQuery({ ...state, offset: 0 });
      const results = await loggingStreamClient.queryLogs(query);

      set({
        results,
        totalCount: results.length,
        hasMore: results.length === state.limit,
        isLoading: false,
      });

      // Compute field stats and histogram from results
      get().computeFieldStats();
      get().loadHistogram();
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Search failed',
        isLoading: false,
      });
    }
  },

  loadMore: async () => {
    const state = get();
    if (state.isLoading || !state.hasMore) return;

    set({ isLoading: true });

    try {
      const newOffset = state.offset + state.limit;
      const query = buildQuery({ ...state, offset: newOffset });
      const moreResults = await loggingStreamClient.queryLogs(query);

      set({
        results: [...state.results, ...moreResults],
        offset: newOffset,
        hasMore: moreResults.length === state.limit,
        isLoading: false,
      });

      get().computeFieldStats();
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to load more',
        isLoading: false,
      });
    }
  },

  refreshResults: async () => {
    const state = get();
    if (state.isLive) return; // Don't refresh while live

    set({ isLoading: true, error: null });

    try {
      const query = buildQuery(state);
      const results = await loggingStreamClient.queryLogs(query);

      set({
        results,
        totalCount: results.length,
        isLoading: false,
      });

      get().computeFieldStats();
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Refresh failed',
        isLoading: false,
      });
    }
  },

  // ===========================================================================
  // Histogram Actions
  // ===========================================================================

  loadHistogram: async () => {
    const state = get();
    set({ isLoadingHistogram: true });

    // For now, generate histogram from current results
    // In the future, this could be a separate aggregation API call
    const histogramData = generateHistogramData(state.results);

    set({
      histogramData,
      isLoadingHistogram: false,
    });
  },

  zoomToTimeRange: (start, end) => {
    set({
      timeRange: {
        preset: 'custom',
        startTime: start,
        endTime: end,
      },
    });
    get().executeSearch();
  },

  // ===========================================================================
  // Live Mode Actions
  // ===========================================================================

  toggleLiveMode: () => {
    const state = get();
    if (state.isLive) {
      get().stopLiveMode();
    } else {
      get().startLiveMode();
    }
  },

  startLiveMode: () => {
    const state = get();
    if (state.liveSubscriptionId) return; // Already subscribed

    const subscriptionId = loggingStreamClient.subscribeLogs(
      (logs) => {
        set((s) => {
          // Merge new logs, avoiding duplicates
          const existingIds = new Set(s.results.map((l) => l.id));
          const newLogs = logs.filter((l) => !existingIds.has(l.id));
          const merged = [...newLogs, ...s.results].slice(0, 500);
          return { results: merged, totalCount: merged.length };
        });
        get().computeFieldStats();
      },
      {
        streamIds: state.streamFilter.length > 0 ? state.streamFilter : undefined,
        level: state.levelFilter !== 'all' ? state.levelFilter : undefined,
        limit: 50,
        // SSE streams in real-time, no polling interval needed
      }
    );

    set({ isLive: true, liveSubscriptionId: subscriptionId });
  },

  stopLiveMode: () => {
    const state = get();
    if (state.liveSubscriptionId) {
      loggingStreamClient.unsubscribe(state.liveSubscriptionId);
    }
    set({ isLive: false, liveSubscriptionId: null });
  },

  // ===========================================================================
  // UI Actions
  // ===========================================================================

  setExpandedLogId: (expandedLogId) => set({ expandedLogId }),

  toggleSidebar: () =>
    set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

  setSelectedColumns: (selectedColumns) => set({ selectedColumns }),

  // ===========================================================================
  // Saved Searches Actions
  // ===========================================================================

  saveSearch: (name) => {
    const state = get();
    const newSearch: SavedSearch = {
      id: `saved_${Date.now()}`,
      name,
      searchText: state.searchText,
      levelFilter: state.levelFilter,
      streamFilter: [...state.streamFilter],
      sourceFilter: [...state.sourceFilter],
      timeRange: { ...state.timeRange },
      createdAt: new Date().toISOString(),
    };

    const savedSearches = [newSearch, ...state.savedSearches];
    saveSavedSearchesToStorage(savedSearches);
    set({ savedSearches });
  },

  loadSavedSearch: (search) => {
    set({
      searchText: search.searchText,
      levelFilter: search.levelFilter,
      streamFilter: [...search.streamFilter],
      sourceFilter: [...search.sourceFilter],
      timeRange: { ...search.timeRange },
      savedSearchesOpen: false,
    });
    get().executeSearch();
  },

  deleteSavedSearch: (id) => {
    const savedSearches = get().savedSearches.filter((s) => s.id !== id);
    saveSavedSearchesToStorage(savedSearches);
    set({ savedSearches });
  },

  toggleSavedSearches: () =>
    set((state) => ({ savedSearchesOpen: !state.savedSearchesOpen })),

  // ===========================================================================
  // Streams Actions
  // ===========================================================================

  loadStreams: async () => {
    try {
      const streams = await loggingStreamClient.getLogStreams();
      set({ availableStreams: streams });
    } catch (error) {
      console.error('[LogSearchStore] Failed to load streams:', error);
    }
  },

  // ===========================================================================
  // Field Stats Actions
  // ===========================================================================

  computeFieldStats: () => {
    const state = get();
    const fieldStats = computeFieldStatsFromResults(state.results);
    set({ fieldStats });
  },

  // ===========================================================================
  // Reset
  // ===========================================================================

  reset: () => {
    const state = get();
    if (state.liveSubscriptionId) {
      loggingStreamClient.unsubscribe(state.liveSubscriptionId);
    }
    set({
      ...initialState,
      savedSearches: get().savedSearches, // Preserve saved searches
    });
  },
}));
