/**
 * Versions Section
 *
 * View and manage version history for catalog resources.
 */

import { useState } from 'react';
import type { CatalogResource } from '@/types/catalog';

interface VersionsSectionProps {
  resource: CatalogResource;
  onRestore?: (version: number) => void;
}

interface Version {
  version: number;
  createdAt: string;
  createdBy: string;
  status: 'draft' | 'published' | 'archived';
  changes: string;
  isCurrent: boolean;
}

// Mock version history - in production this would come from the API
function getMockVersions(resource: CatalogResource): Version[] {
  const currentVersion = resource.currentVersion || 1;
  const createdAt = resource.createdAt || new Date().toISOString();
  const updatedAt = resource.updatedAt || createdAt;

  const versions: Version[] = [
    {
      version: currentVersion,
      createdAt: updatedAt,
      createdBy: 'You',
      status: resource.status as Version['status'] || 'draft',
      changes: 'Current version',
      isCurrent: true,
    },
  ];

  // Add some mock historical versions if version > 1
  if (currentVersion > 1) {
    for (let v = currentVersion - 1; v >= 1; v--) {
      const daysAgo = (currentVersion - v) * 2;
      const date = new Date();
      date.setDate(date.getDate() - daysAgo);

      versions.push({
        version: v,
        createdAt: date.toISOString(),
        createdBy: v === 1 ? 'You' : 'Team member',
        status: v === 1 ? 'draft' : 'published',
        changes: v === 1 ? 'Initial version' : `Updated configuration`,
        isCurrent: false,
      });
    }
  }

  return versions;
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffHours === 0) {
      const diffMins = Math.floor(diffMs / (1000 * 60));
      return diffMins <= 1 ? 'Just now' : `${diffMins} minutes ago`;
    }
    return diffHours === 1 ? '1 hour ago' : `${diffHours} hours ago`;
  }
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
}

function getStatusColor(status: Version['status']): string {
  switch (status) {
    case 'published':
      return 'bg-green-500/20 text-green-400 border-green-500/30';
    case 'draft':
      return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
    case 'archived':
      return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
    default:
      return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
  }
}

export function VersionsSection({ resource, onRestore }: VersionsSectionProps) {
  const [versions] = useState<Version[]>(() => getMockVersions(resource));
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);
  const [showDiff, setShowDiff] = useState(false);

  const handleRestore = (version: number) => {
    if (onRestore) {
      onRestore(version);
    } else {
      // TODO: Implement actual restore functionality
      console.log(`Restore to version ${version}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Version Timeline */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-slate-300 uppercase tracking-wider">
              Version History
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              {versions.length} version{versions.length !== 1 ? 's' : ''} • Current: v{resource.currentVersion || 1}
            </p>
          </div>
          <button
            onClick={() => setShowDiff(!showDiff)}
            className={`
              text-xs px-3 py-1.5 rounded transition-colors
              ${showDiff
                ? 'bg-scc-primary/20 text-scc-primary'
                : 'text-slate-400 hover:text-slate-200'
              }
            `}
          >
            {showDiff ? 'Hide Changes' : 'Show Changes'}
          </button>
        </div>

        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-4 top-6 bottom-6 w-px bg-scc-border" />

          {/* Version entries */}
          <div className="space-y-4">
            {versions.map((version, index) => (
              <div
                key={version.version}
                className={`
                  relative pl-10 cursor-pointer transition-all
                  ${selectedVersion === version.version ? 'opacity-100' : 'opacity-80 hover:opacity-100'}
                `}
                onClick={() => setSelectedVersion(
                  selectedVersion === version.version ? null : version.version
                )}
              >
                {/* Timeline dot */}
                <div
                  className={`
                    absolute left-2.5 top-2 w-3 h-3 rounded-full border-2 transition-colors
                    ${version.isCurrent
                      ? 'bg-scc-primary border-scc-primary'
                      : selectedVersion === version.version
                        ? 'bg-slate-400 border-slate-400'
                        : 'bg-scc-surface border-slate-600'
                    }
                  `}
                />

                {/* Version card */}
                <div
                  className={`
                    scc-card p-4 transition-all
                    ${selectedVersion === version.version ? 'border-scc-primary/50' : ''}
                    ${version.isCurrent ? 'bg-scc-primary/5' : ''}
                  `}
                >
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-medium text-slate-200">
                          v{version.version}
                        </span>
                        <span
                          className={`
                            text-xs px-2 py-0.5 rounded border
                            ${getStatusColor(version.status)}
                          `}
                        >
                          {version.status}
                        </span>
                        {version.isCurrent && (
                          <span className="text-xs text-scc-primary">
                            (Current)
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-slate-400">{version.changes}</p>
                      <p className="text-xs text-slate-500">
                        {formatDate(version.createdAt)} by {version.createdBy}
                      </p>
                    </div>

                    {!version.isCurrent && (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRestore(version.version);
                          }}
                          className="text-xs text-slate-400 hover:text-scc-primary transition-colors"
                        >
                          Restore
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Diff view (placeholder) */}
                  {showDiff && selectedVersion === version.version && index < versions.length - 1 && (
                    <div className="mt-4 pt-4 border-t border-scc-border">
                      <div className="text-xs text-slate-500 mb-2">
                        Changes from v{versions[index + 1].version}:
                      </div>
                      <div className="font-mono text-xs space-y-1">
                        <div className="text-green-400">+ Added new configuration</div>
                        <div className="text-red-400">- Removed deprecated field</div>
                        <div className="text-yellow-400">~ Modified metadata</div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Version Actions */}
      <section className="space-y-4">
        <h3 className="text-sm font-medium text-slate-300 uppercase tracking-wider">
          Actions
        </h3>
        <div className="flex gap-3">
          <button
            className="scc-button-ghost text-sm flex items-center gap-2"
            onClick={() => {
              // TODO: Export version history
              console.log('Export versions');
            }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export History
          </button>
          <button
            className="scc-button-ghost text-sm flex items-center gap-2"
            onClick={() => {
              // TODO: Compare versions
              console.log('Compare versions');
            }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            Compare Versions
          </button>
        </div>
      </section>

      {/* Retention Policy Info */}
      <section className="space-y-4">
        <h3 className="text-sm font-medium text-slate-300 uppercase tracking-wider">
          Retention Policy
        </h3>
        <div className="scc-card p-4 bg-scc-surface/50">
          <div className="flex items-start gap-3">
            <span className="text-xl">📋</span>
            <div className="text-sm text-slate-400">
              <p>
                Version history is retained for <strong className="text-slate-300">90 days</strong>.
                Published versions are kept indefinitely.
              </p>
              <p className="mt-2 text-slate-500">
                Contact your administrator to adjust retention settings.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
