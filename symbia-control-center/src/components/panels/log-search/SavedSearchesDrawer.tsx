/**
 * Saved Searches Drawer
 *
 * Slide-out panel for managing saved searches with localStorage persistence.
 */
import { useState } from 'react';
import { useLogSearchStore, type SavedSearch } from '@/stores/logSearchStore';

interface SavedSearchesDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SavedSearchesDrawer({ isOpen, onClose }: SavedSearchesDrawerProps) {
  const {
    savedSearches,
    loadSavedSearch,
    deleteSavedSearch,
    saveSearch,
    searchText,
    levelFilter,
    streamFilter,
  } = useLogSearchStore();

  const [newSearchName, setNewSearchName] = useState('');
  const [showSaveForm, setShowSaveForm] = useState(false);

  const handleSave = () => {
    if (!newSearchName.trim()) return;
    saveSearch(newSearchName.trim());
    setNewSearchName('');
    setShowSaveForm(false);
  };

  const hasActiveFilters = searchText || levelFilter !== 'all' || streamFilter.length > 0;

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed right-0 top-0 bottom-0 z-50 w-80 bg-scc-surface border-l border-scc-border shadow-xl flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-scc-border flex items-center justify-between">
          <h2 className="text-sm font-medium text-slate-200">Saved Searches</h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-slate-700 text-slate-500 hover:text-slate-300"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Save current search */}
        <div className="p-4 border-b border-scc-border">
          {showSaveForm ? (
            <div className="space-y-2">
              <input
                type="text"
                value={newSearchName}
                onChange={(e) => setNewSearchName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                placeholder="Enter search name..."
                className="w-full px-3 py-2 text-sm bg-slate-700 border border-slate-600 rounded text-slate-200 focus:border-scc-primary focus:outline-none"
                autoFocus
              />
              <div className="flex gap-2">
                <button
                  onClick={() => setShowSaveForm(false)}
                  className="flex-1 px-3 py-1.5 text-sm bg-slate-700 text-slate-300 rounded hover:bg-slate-600"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={!newSearchName.trim()}
                  className="flex-1 px-3 py-1.5 text-sm bg-scc-primary text-slate-900 rounded hover:bg-scc-primary/90 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                >
                  Save
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowSaveForm(true)}
              disabled={!hasActiveFilters}
              className="w-full px-4 py-2 text-sm flex items-center justify-center gap-2 rounded border border-dashed transition-colors
                disabled:opacity-50 disabled:cursor-not-allowed
                border-slate-600 text-slate-400 hover:border-scc-primary hover:text-scc-primary"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Save Current Search
            </button>
          )}
          {!hasActiveFilters && (
            <p className="text-xs text-slate-500 mt-2 text-center">
              Add filters or search text to save
            </p>
          )}
        </div>

        {/* Saved searches list */}
        <div className="flex-1 overflow-y-auto">
          {savedSearches.length === 0 ? (
            <div className="p-6 text-center">
              <svg className="w-10 h-10 mx-auto mb-3 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
              </svg>
              <p className="text-sm text-slate-500">No saved searches yet</p>
              <p className="text-xs text-slate-600 mt-1">
                Save your frequently used searches for quick access
              </p>
            </div>
          ) : (
            <div className="divide-y divide-scc-border/50">
              {savedSearches.map((search) => (
                <SavedSearchItem
                  key={search.id}
                  search={search}
                  onLoad={() => loadSavedSearch(search)}
                  onDelete={() => deleteSavedSearch(search.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function SavedSearchItem({
  search,
  onLoad,
  onDelete,
}: {
  search: SavedSearch;
  onLoad: () => void;
  onDelete: () => void;
}) {
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);

  const filterCount =
    (search.searchText ? 1 : 0) +
    (search.levelFilter !== 'all' ? 1 : 0) +
    search.streamFilter.length +
    search.sourceFilter.length;

  return (
    <div className="p-3 hover:bg-slate-800/50 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <button
          onClick={onLoad}
          className="flex-1 text-left group"
        >
          <span className="text-sm text-slate-200 group-hover:text-scc-primary transition-colors">
            {search.name}
          </span>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-slate-500">
              {filterCount} filter{filterCount !== 1 ? 's' : ''}
            </span>
            <span className="text-xs text-slate-600">
              {new Date(search.createdAt).toLocaleDateString()}
            </span>
          </div>
        </button>

        {showConfirmDelete ? (
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowConfirmDelete(false)}
              className="px-2 py-1 text-xs text-slate-400 hover:text-slate-200"
            >
              Cancel
            </button>
            <button
              onClick={onDelete}
              className="px-2 py-1 text-xs text-red-400 hover:text-red-300"
            >
              Delete
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowConfirmDelete(true)}
            className="p-1 rounded text-slate-500 hover:text-red-400 hover:bg-slate-700"
            title="Delete search"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        )}
      </div>

      {/* Search preview */}
      <div className="mt-2 flex flex-wrap gap-1">
        {search.searchText && (
          <span className="text-xs px-1.5 py-0.5 bg-slate-700 rounded text-slate-300">
            "{search.searchText}"
          </span>
        )}
        {search.levelFilter !== 'all' && (
          <span className="text-xs px-1.5 py-0.5 bg-slate-700 rounded text-slate-300">
            level:{search.levelFilter}
          </span>
        )}
        {search.streamFilter.slice(0, 2).map((stream) => (
          <span key={stream} className="text-xs px-1.5 py-0.5 bg-slate-700 rounded text-slate-300 truncate max-w-20">
            stream:{stream}
          </span>
        ))}
        {search.streamFilter.length > 2 && (
          <span className="text-xs px-1.5 py-0.5 bg-slate-700 rounded text-slate-400">
            +{search.streamFilter.length - 2} more
          </span>
        )}
      </div>
    </div>
  );
}
