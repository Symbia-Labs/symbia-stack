/**
 * Catalog Toolbar
 *
 * Toolbar for resource editing actions: Save, Publish, Delete, etc.
 */

import { useState } from 'react';
import type { CatalogResource } from '@/types/catalog';
import { STATUS_META, RESOURCE_TYPE_META } from '@/types/catalog';

interface CatalogToolbarProps {
  resource: CatalogResource | null;
  isCreating: boolean;
  isDirty: boolean;
  isSaving: boolean;
  onSave: () => void;
  onPublish: () => void;
  onDelete: () => void;
  onDiscard: () => void;
}

export function CatalogToolbar({
  resource,
  isCreating,
  isDirty,
  isSaving,
  onSave,
  onPublish,
  onDelete,
  onDiscard,
}: CatalogToolbarProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showPublishMenu, setShowPublishMenu] = useState(false);

  if (!resource && !isCreating) {
    return null;
  }

  const typeMeta = resource ? RESOURCE_TYPE_META[resource.type] : null;
  const statusMeta = resource ? STATUS_META[resource.status] : null;

  const handleDelete = () => {
    setShowDeleteConfirm(false);
    onDelete();
  };

  return (
    <div className="shrink-0 px-6 py-4 border-b border-scc-border bg-scc-elevated/50">
      <div className="flex items-center justify-between">
        {/* Left side - Resource info */}
        <div className="flex items-center gap-3">
          {typeMeta && (
            <span className="text-2xl" title={typeMeta.label}>
              {typeMeta.icon}
            </span>
          )}
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-slate-100">
                {isCreating
                  ? `New ${typeMeta?.label || 'Resource'}`
                  : resource?.name || 'Untitled'}
              </h2>
              {isDirty && (
                <span className="text-xs text-amber-400 font-medium">
                  (unsaved)
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 text-sm">
              {resource?.key && (
                <span className="font-mono text-slate-500">{resource.key}</span>
              )}
              {statusMeta && (
                <span
                  className={`text-xs px-1.5 py-0.5 rounded ${statusMeta.color}`}
                >
                  {statusMeta.label}
                </span>
              )}
              {resource?.currentVersion !== undefined && (
                <span className="text-xs text-slate-500">
                  v{resource.currentVersion}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Right side - Actions */}
        <div className="flex items-center gap-2">
          {/* Discard button */}
          {isDirty && (
            <button
              onClick={onDiscard}
              className="scc-button-ghost text-sm"
              disabled={isSaving}
            >
              Discard
            </button>
          )}

          {/* Save button */}
          <button
            onClick={onSave}
            disabled={!isDirty || isSaving}
            className="scc-button text-sm"
          >
            {isSaving ? 'Saving...' : 'Save'}
          </button>

          {/* Publish dropdown */}
          {!isCreating && resource?.status !== 'published' && (
            <div className="relative">
              <button
                onClick={() => setShowPublishMenu(!showPublishMenu)}
                className="scc-button-secondary text-sm flex items-center gap-1"
                disabled={isDirty || isSaving}
              >
                Publish
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </button>
              {showPublishMenu && (
                <div className="absolute right-0 mt-1 w-48 bg-scc-elevated border border-scc-border rounded-lg shadow-lg z-10">
                  <button
                    onClick={() => {
                      setShowPublishMenu(false);
                      onPublish();
                    }}
                    className="w-full text-left px-4 py-2 text-sm text-slate-200 hover:bg-slate-700 rounded-t-lg"
                  >
                    Publish now
                  </button>
                  <button
                    onClick={() => setShowPublishMenu(false)}
                    className="w-full text-left px-4 py-2 text-sm text-slate-400 hover:bg-slate-700 rounded-b-lg"
                    disabled
                  >
                    Schedule publish...
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Delete button */}
          {!isCreating && (
            <div className="relative">
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-400/10 rounded transition-colors"
                title="Delete resource"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
              </button>

              {/* Delete confirmation */}
              {showDeleteConfirm && (
                <div className="absolute right-0 mt-1 w-64 bg-scc-elevated border border-scc-border rounded-lg shadow-lg p-4 z-10">
                  <p className="text-sm text-slate-300 mb-3">
                    Delete "{resource?.name}"? This cannot be undone.
                  </p>
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setShowDeleteConfirm(false)}
                      className="scc-button-ghost text-xs"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleDelete}
                      className="px-3 py-1.5 text-xs bg-red-500/20 text-red-400 border border-red-500/50 rounded hover:bg-red-500/30 transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
