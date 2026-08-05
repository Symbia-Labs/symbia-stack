/**
 * Log Search Panel
 *
 * Full-featured log search interface with faceted filtering.
 * Features: search bar, time range selector, volume histogram, field sidebar,
 * virtual-scrolled results, live mode, saved searches, and export.
 */
import { useEffect, useCallback } from 'react';
import { useLogSearchStore } from '@/stores/logSearchStore';
import { TimeRangeSelector } from '@/components/inputs/TimeRangeSelector';
import { SearchBar } from '@/components/inputs/SearchBar';
import { LogVolumeHistogram } from '@/components/charts/LogVolumeHistogram';
import { StreamActionBar } from '@/components/common/StreamActionBar';
import { FieldSidebar } from './log-search/FieldSidebar';
import { LogResultsTable } from './log-search/LogResultsTable';
import { SavedSearchesDrawer } from './log-search/SavedSearchesDrawer';
import type { LogEntry } from '@/services/loggingStreamClient';

export function LogSearchPanel() {
  const {
    // Filters
    levelFilter,
    setLevelFilter,
    timeRange,
    setTimeRange,

    // Results
    results,
    isLoading,
    hasMore,
    totalCount,

    // Histogram
    histogramData,
    isLoadingHistogram,

    // UI state
    isLive,
    sidebarCollapsed,
    savedSearchesOpen,

    // Actions
    executeSearch,
    loadMore,
    toggleLiveMode,
    toggleSidebar,
    toggleSavedSearches,
    zoomToTimeRange,
    clearFilters,
  } = useLogSearchStore();

  // Execute initial search on mount
  useEffect(() => {
    executeSearch();
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + Enter to search
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        executeSearch();
      }
      // Escape to clear search
      if (e.key === 'Escape') {
        clearFilters();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [executeSearch, clearFilters]);

  const handleSearch = useCallback(() => {
    executeSearch();
  }, [executeSearch]);

  const handleHistogramBarClick = useCallback((bucket: { time: Date }) => {
    // Zoom to the time range around this bucket
    const bucketTime = bucket.time.getTime();
    const start = new Date(bucketTime - 5 * 60 * 1000); // 5 minutes before
    const end = new Date(bucketTime + 5 * 60 * 1000);   // 5 minutes after
    zoomToTimeRange(start, end);
  }, [zoomToTimeRange]);

  const handleExportJSON = useCallback(() => {
    const blob = new Blob([JSON.stringify(results, null, 2)], { type: 'application/json' });
    downloadBlob(blob, `logs-${new Date().toISOString()}.json`);
  }, [results]);

  const handleExportCSV = useCallback(() => {
    const csv = convertToCSV(results);
    const blob = new Blob([csv], { type: 'text/csv' });
    downloadBlob(blob, `logs-${new Date().toISOString()}.csv`);
  }, [results]);

  return (
    <div className="h-full flex flex-col">
      {/* Header with search and controls */}
      <div className="shrink-0 p-4 border-b border-scc-border space-y-3">
        {/* Top row: Title and saved searches */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-text-primary">Log Search</h1>
            <p className="text-xs text-text-muted mt-0.5">
              Search and analyze logs with filters, time ranges, and field facets
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleSavedSearches}
              className="px-3 py-1.5 text-sm flex items-center gap-2 rounded border transition-colors
                bg-surface-raised text-text-secondary border-border hover:bg-surface-highlight"
              title="Saved searches"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
              </svg>
              Saved
            </button>
          </div>
        </div>

        {/* Search row */}
        <div className="flex items-center gap-3">
          {/* Search bar with filter tokens */}
          <div className="flex-1">
            <SearchBar
              onSearch={handleSearch}
              placeholder="Search logs... (Enter to search)"
            />
          </div>

          {/* Time range */}
          <TimeRangeSelector
            value={timeRange}
            onChange={setTimeRange}
            onSearch={handleSearch}
          />

          {/* Search button */}
          <button
            onClick={handleSearch}
            disabled={isLoading}
            className="px-4 py-2 text-sm bg-primary-500 text-text-inverse rounded-lg hover:bg-primary-600 transition-colors font-medium disabled:opacity-50"
          >
            {isLoading ? 'Searching...' : 'Search'}
          </button>
        </div>

        {/* Filters row */}
        <div className="flex items-center gap-4">
          {/* Level filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-text-muted">Level:</span>
            {(['all', 'debug', 'info', 'warn', 'error'] as const).map((level) => (
              <button
                key={level}
                onClick={() => {
                  setLevelFilter(level);
                  handleSearch();
                }}
                className={`
                  px-2 py-0.5 text-xs rounded transition-all capitalize
                  ${levelFilter === level
                    ? level === 'all'
                      ? 'bg-primary-500/20 text-primary-500'
                      : level === 'debug'
                      ? 'bg-log-debug-bg text-log-debug'
                      : level === 'info'
                      ? 'bg-log-info-bg text-log-info'
                      : level === 'warn'
                      ? 'bg-log-warn-bg text-log-warn'
                      : 'bg-log-error-bg text-log-error'
                    : 'text-text-secondary hover:text-text-primary hover:bg-surface-highlight'
                  }
                `}
              >
                {level}
              </button>
            ))}
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Export buttons */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleExportJSON}
              disabled={results.length === 0}
              className="px-2 py-1 text-xs rounded transition-colors disabled:opacity-50
                bg-surface-raised text-text-secondary border border-border hover:bg-surface-highlight"
              title="Export as JSON"
            >
              JSON
            </button>
            <button
              onClick={handleExportCSV}
              disabled={results.length === 0}
              className="px-2 py-1 text-xs rounded transition-colors disabled:opacity-50
                bg-surface-raised text-text-secondary border border-border hover:bg-surface-highlight"
              title="Export as CSV"
            >
              CSV
            </button>
          </div>
        </div>
      </div>

      {/* Histogram */}
      <div className="shrink-0 px-4 py-2 border-b border-scc-border">
        <LogVolumeHistogram
          data={histogramData}
          isLoading={isLoadingHistogram}
          onBarClick={handleHistogramBarClick}
          height={60}
        />
      </div>

      {/* Action bar */}
      <div className="shrink-0 px-4 py-2 border-b border-scc-border">
        <StreamActionBar
          isLive={isLive}
          onPause={() => toggleLiveMode()}
          onResume={() => toggleLiveMode()}
          onRestart={() => {
            clearFilters();
            executeSearch();
          }}
          itemCount={totalCount}
          itemLabel="logs"
          compact
        />
      </div>

      {/* Main content: Sidebar + Results */}
      <div className="flex-1 flex overflow-hidden">
        {/* Field Sidebar */}
        <FieldSidebar
          collapsed={sidebarCollapsed}
          onToggle={toggleSidebar}
        />

        {/* Results Table */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <LogResultsTable
            logs={results}
            isLoading={isLoading}
            hasMore={hasMore}
            onLoadMore={loadMore}
          />
        </div>
      </div>

      {/* Saved Searches Drawer */}
      <SavedSearchesDrawer
        isOpen={savedSearchesOpen}
        onClose={toggleSavedSearches}
      />
    </div>
  );
}

// =============================================================================
// Helpers
// =============================================================================

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function convertToCSV(logs: LogEntry[]): string {
  if (logs.length === 0) return '';

  const headers = ['timestamp', 'level', 'source', 'message', 'traceId', 'spanId'];
  const rows = logs.map((log) => [
    log.timestamp,
    log.level,
    log.source || '',
    `"${(log.message || '').replace(/"/g, '""')}"`,
    log.traceId || '',
    log.spanId || '',
  ]);

  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
}
