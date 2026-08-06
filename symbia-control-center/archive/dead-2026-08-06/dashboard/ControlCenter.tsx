import { useState, useCallback } from 'react';
import { usePlatformStore } from '@/stores/platformStore';
import { ServiceGrid } from './ServiceGrid';
import { ResourceBrowser } from './ResourceBrowser';
import { EventStream } from './EventStream';
import { UnifiedInput } from './UnifiedInput';
import { ChatPanel } from './ChatPanel';
import { LogViewer } from './LogViewer';

type Panel = 'status' | 'resources' | 'events' | 'logs' | 'chat';

const PANELS: { id: Panel; label: string; shortcut: string }[] = [
  { id: 'status', label: 'Status', shortcut: '1' },
  { id: 'resources', label: 'Resources', shortcut: '2' },
  { id: 'logs', label: 'Logs', shortcut: '3' },
  { id: 'events', label: 'Events', shortcut: '4' },
  { id: 'chat', label: 'Chat', shortcut: '5' },
];

export function ControlCenter() {
  const { activePanel, setActivePanel, addEvent } = usePlatformStore();
  const [commandOutput, setCommandOutput] = useState<string | null>(null);

  const handleCommandResult = useCallback((message: string, target?: string) => {
    setCommandOutput(message);
    if (target) {
      setActivePanel(target as Panel);
    }
    addEvent({
      type: 'command.executed',
      source: 'control-center',
      message,
    });

    // Clear output after 5 seconds
    setTimeout(() => setCommandOutput(null), 5000);
  }, [setActivePanel, addEvent]);

  return (
    <div className="h-full flex flex-col bg-surface-base">
      {/* Top: Service Status Grid (always visible) */}
      <div className="p-4 border-b border-border">
        <ServiceGrid />
      </div>

      {/* Middle: Panel Navigation + Content */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* Panel Tabs */}
        <div className="flex items-center gap-1 px-4 py-2 border-b border-border bg-surface-raised">
          {PANELS.map((panel) => (
            <button
              key={panel.id}
              onClick={() => setActivePanel(panel.id)}
              className={`
                px-4 py-2.5 text-sm font-medium rounded-md transition-all duration-fast
                ${
                  activePanel === panel.id
                    ? 'bg-primary-500/15 text-primary-500 border border-primary-500/40'
                    : 'text-text-secondary hover:text-text-primary hover:bg-surface-highlight border border-transparent'
                }
              `}
            >
              {panel.label}
              <span className="ml-2 text-xs text-text-muted hidden sm:inline">
                {panel.shortcut}
              </span>
            </button>
          ))}
        </div>

        {/* Panel Content */}
        <div className="flex-1 p-4 overflow-hidden">
          {activePanel === 'status' && (
            <div className="h-full flex items-center justify-center text-text-secondary">
              <div className="text-center">
                <div className="text-4xl mb-4 text-primary-500">
                  &gt;_
                </div>
                <p>Service status shown above</p>
                <p className="text-sm mt-2">
                  Use <code className="text-primary-500 bg-surface-sunken px-1.5 py-0.5 rounded">/help</code> to see available commands
                </p>
              </div>
            </div>
          )}
          {activePanel === 'resources' && <ResourceBrowser />}
          {activePanel === 'logs' && <LogViewer />}
          {activePanel === 'events' && <EventStream />}
          {activePanel === 'chat' && <ChatPanel />}
        </div>
      </div>

      {/* Command Output */}
      {commandOutput && (
        <div className="px-4 py-2 bg-surface-raised border-t border-border">
          <pre className="text-sm text-primary-500 font-mono whitespace-pre-wrap">
            {commandOutput}
          </pre>
        </div>
      )}

      {/* Bottom: Unified Input */}
      <div className="border-t border-border bg-surface-raised">
        <UnifiedInput onCommandResult={handleCommandResult} />
      </div>
    </div>
  );
}
