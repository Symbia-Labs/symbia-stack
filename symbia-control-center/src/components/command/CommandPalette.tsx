import { useState, useEffect, useRef, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useMessaging } from '@/hooks/useMessaging';

interface Command {
  id: string;
  label: string;
  shortcut?: string;
  action: () => void;
}

export function CommandPalette() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { logout } = useAuth();
  const { createConversation, setActiveConversation } = useMessaging();

  const commands: Command[] = [
    {
      id: 'new-session',
      label: 'New Session',
      shortcut: 'N',
      action: async () => {
        const conv = await createConversation({ type: 'private' });
        setActiveConversation(conv.id);
        setIsOpen(false);
      },
    },
    {
      id: 'dashboard',
      label: 'Go to Dashboard',
      shortcut: 'D',
      action: () => {
        navigate('/dashboard');
        setIsOpen(false);
      },
    },
    {
      id: 'logout',
      label: 'Sign Out',
      action: () => {
        logout();
        setIsOpen(false);
      },
    },
  ];

  const filteredCommands = commands.filter((cmd) =>
    cmd.label.toLowerCase().includes(query.toLowerCase())
  );

  // Global keyboard shortcut to open palette
  useEffect(() => {
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }

      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
      setQuery('');
      setSelectedIndex(0);
    }
  }, [isOpen]);

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, filteredCommands.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      filteredCommands[selectedIndex]?.action();
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => setIsOpen(false)}
      />

      {/* Palette */}
      <div className="relative w-full max-w-lg bg-scc-elevated border border-scc-border rounded-lg shadow-2xl animate-fade-in">
        {/* Search Input */}
        <div className="flex items-center px-4 border-b border-scc-border">
          <svg
            className="w-5 h-5 text-slate-500"
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
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Type a command..."
            className="flex-1 bg-transparent border-0 px-3 py-4 text-slate-100 placeholder-slate-500 focus:outline-none"
          />
          <kbd className="px-2 py-1 text-xs text-slate-500 bg-scc-surface rounded">
            ESC
          </kbd>
        </div>

        {/* Commands List */}
        <div className="max-h-64 overflow-y-auto py-2">
          {filteredCommands.length === 0 ? (
            <div className="px-4 py-8 text-center text-slate-500 text-sm">
              No commands found
            </div>
          ) : (
            filteredCommands.map((cmd, index) => (
              <button
                key={cmd.id}
                onClick={() => cmd.action()}
                className={`
                  w-full text-left px-4 py-2 flex items-center justify-between
                  ${
                    index === selectedIndex
                      ? 'bg-scc-primary/20 text-scc-primary'
                      : 'text-slate-300 hover:bg-slate-800'
                  }
                `}
              >
                <span>{cmd.label}</span>
                {cmd.shortcut && (
                  <kbd className="px-2 py-0.5 text-xs text-slate-500 bg-scc-surface rounded">
                    {cmd.shortcut}
                  </kbd>
                )}
              </button>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-scc-border flex items-center justify-between text-xs text-slate-500">
          <span>
            <kbd className="px-1.5 py-0.5 bg-scc-surface rounded mr-1">
              ↑↓
            </kbd>
            Navigate
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 bg-scc-surface rounded mr-1">
              ↵
            </kbd>
            Select
          </span>
        </div>
      </div>
    </div>
  );
}
