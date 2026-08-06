/**
 * Main Layout
 *
 * Modern sidebar-based layout with persistent navigation.
 */
import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useMessaging } from '@/hooks/useMessaging';
import { useServices } from '@/hooks/useServices';
import { useServicesStore } from '@/stores/servicesStore';
import { useMessagingStore } from '@/stores/messagingStore';
import { OrgSwitcher } from '@/components/org/OrgSwitcher';

// Icons as simple components
const IconOverview = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zM14 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
  </svg>
);

const IconNetwork = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
  </svg>
);

const IconAssistants = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
  </svg>
);

const IconIntegrations = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
  </svg>
);

const IconEnergy = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
  </svg>
);

const IconLogs = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>
);

const IconChat = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
  </svg>
);

export type PanelId = 'overview' | 'network' | 'assistants' | 'integrations' | 'energy' | 'logs' | 'chat';

function PaletteControl({ collapsed }: { collapsed: boolean }) {
  const [isOpen, setIsOpen] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    if (typeof document !== 'undefined') {
      return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
    }
    return 'dark';
  });
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleThemeChange = (newTheme: 'dark' | 'light') => {
    setTheme(newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
    setIsOpen(false);
  };

  const paletteColors = [
    { name: 'primary', color: 'var(--primary-500)', fallback: '#3fb8af' },
    { name: 'success', color: 'var(--success)', fallback: '#3fb950' },
    { name: 'warning', color: 'var(--warning)', fallback: '#d29922' },
    { name: 'error', color: 'var(--error)', fallback: '#f85149' },
    { name: 'info', color: 'var(--info)', fallback: '#58a6ff' },
  ];

  const nodeColors = [
    { name: 'input', color: 'var(--node-input)', fallback: '#3fb950' },
    { name: 'output', color: 'var(--node-output)', fallback: '#f97316' },
    { name: 'llm', color: 'var(--node-llm)', fallback: '#ec4899' },
    { name: 'router', color: 'var(--node-router)', fallback: '#a855f7' },
    { name: 'tool', color: 'var(--node-tool)', fallback: '#06b6d4' },
  ];

  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 px-2 py-1 rounded hover:bg-surface-highlight transition-colors"
        title="Color palette & theme"
      >
        <div className="flex -space-x-0.5">
          {paletteColors.slice(0, collapsed ? 3 : 5).map((c) => (
            <div
              key={c.name}
              className="w-2.5 h-2.5 rounded-full border border-border"
              style={{ backgroundColor: c.fallback }}
            />
          ))}
        </div>
        {!collapsed && (
          <svg
            className={`w-3 h-3 text-text-muted transition-transform ${isOpen ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
          </svg>
        )}
      </button>

      {isOpen && (
        <div className="absolute bottom-full left-0 mb-2 w-44 bg-surface-overlay border border-border rounded-lg shadow-xl z-50 animate-fade-in">
          <div className="p-3 border-b border-border">
            <div className="text-[10px] text-text-muted uppercase tracking-wider mb-2">Theme</div>
            <div className="flex gap-1">
              <button
                onClick={() => handleThemeChange('dark')}
                className={`flex-1 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                  theme === 'dark'
                    ? 'bg-scc-primary/20 text-scc-primary'
                    : 'text-text-secondary hover:bg-surface-highlight'
                }`}
              >
                Dark
              </button>
              <button
                onClick={() => handleThemeChange('light')}
                className={`flex-1 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                  theme === 'light'
                    ? 'bg-scc-primary/20 text-scc-primary'
                    : 'text-text-secondary hover:bg-surface-highlight'
                }`}
              >
                Light
              </button>
            </div>
          </div>
          <div className="p-3">
            <div className="text-[10px] text-text-muted uppercase tracking-wider mb-2">Semantic</div>
            <div className="flex gap-1.5 mb-3">
              {paletteColors.map((c) => (
                <div
                  key={c.name}
                  className="w-6 h-6 rounded border border-border-muted cursor-default"
                  style={{ backgroundColor: c.fallback }}
                  title={c.name}
                />
              ))}
            </div>
            <div className="text-[10px] text-text-muted uppercase tracking-wider mb-2">Nodes</div>
            <div className="flex gap-1.5">
              {nodeColors.map((c) => (
                <div
                  key={c.name}
                  className="w-6 h-6 rounded border border-border-muted cursor-default"
                  style={{ backgroundColor: c.fallback }}
                  title={c.name}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface NavItem {
  id: PanelId;
  label: string;
  icon: React.FC;
  badge?: number | string;
}

interface MainLayoutProps {
  activePanel: PanelId;
  onPanelChange: (panel: PanelId) => void;
  children: React.ReactNode;
}

export function MainLayout({ activePanel, onPanelChange, children }: MainLayoutProps) {
  const { user, logout } = useAuth();
  const { connectionStatus } = useMessaging();
  // Enable assistants and integrations to load counts for sidebar badges
  const {
    networkConnectionStatus,
    loadedAssistants,
    providers,
  } = useServices({
    enableAssistants: true,
    enableNetwork: false,
    enableIntegrations: true,
    enableLogging: false,
  });

  const [collapsed, setCollapsed] = useState(false);

  // Activity tracking for modem-style lights
  const { recentNetworkEvents } = useServicesStore();
  const { messages } = useMessagingStore();
  const [msgActivity, setMsgActivity] = useState(false);
  const [netActivity, setNetActivity] = useState(false);
  const lastNetEventCount = useRef(0);
  const lastMsgCount = useRef(0);

  // Flash NET light on new network events
  useEffect(() => {
    if (recentNetworkEvents.length > lastNetEventCount.current) {
      setNetActivity(true);
      const timer = setTimeout(() => setNetActivity(false), 150);
      lastNetEventCount.current = recentNetworkEvents.length;
      return () => clearTimeout(timer);
    }
  }, [recentNetworkEvents.length]);

  // Flash MSG light on new messages
  useEffect(() => {
    const totalMessages = Array.from(messages.values()).reduce((sum, msgs) => sum + msgs.length, 0);
    if (totalMessages > lastMsgCount.current) {
      setMsgActivity(true);
      const timer = setTimeout(() => setMsgActivity(false), 150);
      lastMsgCount.current = totalMessages;
      return () => clearTimeout(timer);
    }
  }, [messages]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey) {
        const panelKeys: Record<string, PanelId> = {
          '1': 'overview',
          '2': 'network',
          '3': 'assistants',
          '4': 'integrations',
          '5': 'logs',
          '6': 'chat',
        };
        const panel = panelKeys[e.key];
        if (panel) {
          e.preventDefault();
          onPanelChange(panel);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onPanelChange]);

  const navItems: NavItem[] = [
    { id: 'overview', label: 'Overview', icon: IconOverview },
    { id: 'network', label: 'Network', icon: IconNetwork },
    { id: 'assistants', label: 'Assistants', icon: IconAssistants, badge: loadedAssistants.length },
    { id: 'integrations', label: 'Integrations', icon: IconIntegrations, badge: providers.length },
    { id: 'energy', label: 'Energy', icon: IconEnergy },
    { id: 'logs', label: 'Logs', icon: IconLogs },
    { id: 'chat', label: 'Chat', icon: IconChat },
  ];

  return (
    <div className="h-screen flex bg-scc-surface text-text-primary">
      {/* Sidebar */}
      <aside
        className={`
          ${collapsed ? 'w-16' : 'w-56'}
          shrink-0 flex flex-col border-r border-scc-border bg-scc-elevated
          transition-all duration-200
        `}
      >
        {/* Logo */}
        <div className="h-14 flex items-center justify-between px-4 border-b border-scc-border">
          {!collapsed && (
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold text-scc-primary text-glow tracking-wider">
                SYMBIA
              </span>
            </div>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-1.5 rounded hover:bg-surface-highlight text-text-muted hover:text-text-primary transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {collapsed ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
              )}
            </svg>
          </button>
        </div>

        {/* Org Switcher */}
        {!collapsed && (
          <div className="px-3 py-3 border-b border-scc-border">
            <OrgSwitcher />
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 py-4 overflow-y-auto">
          <ul className="space-y-1 px-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activePanel === item.id;
              return (
                <li key={item.id}>
                  <button
                    onClick={() => onPanelChange(item.id)}
                    className={`
                      w-full flex items-center gap-3 px-3 py-2.5 rounded-lg
                      transition-all duration-150
                      ${isActive
                        ? 'bg-scc-primary/20 text-scc-primary border border-scc-primary/30 shadow-glow-sm'
                        : 'text-text-secondary hover:text-text-primary hover:bg-surface-highlight border border-transparent'
                      }
                    `}
                    title={collapsed ? item.label : undefined}
                  >
                    <Icon />
                    {!collapsed && (
                      <>
                        <span className="text-sm font-medium flex-1 text-left">
                          {item.label}
                        </span>
                        {item.badge !== undefined && Number(item.badge) > 0 && (
                          <span className={`
                            text-xs px-1.5 py-0.5 rounded-full
                            ${isActive ? 'bg-scc-primary/30' : 'bg-surface-highlight'}
                          `}>
                            {item.badge}
                          </span>
                        )}
                      </>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Connection Status - Modem-style activity lights + Palette */}
        <div className="p-4 border-t border-scc-border">
          <div className={`flex items-center ${collapsed ? 'flex-col gap-2' : 'gap-3'}`}>
            <div className={`flex items-center gap-3 ${collapsed ? 'justify-center' : ''}`}>
              <div className="flex items-center gap-1.5" title={
                connectionStatus === 'connected'
                  ? 'Messaging: Connected'
                  : connectionStatus === 'connecting'
                  ? 'Messaging: Connecting...'
                  : 'Messaging: Disconnected'
              }>
                <div
                  className={`
                    w-2 h-2 rounded-full transition-all duration-75
                    ${connectionStatus === 'disconnected'
                      ? 'bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.7)]'
                      : connectionStatus === 'connecting'
                      ? 'bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.7)] animate-pulse'
                      : msgActivity
                      ? 'bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.9)] scale-125'
                      : 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]'
                    }
                  `}
                />
                {!collapsed && (
                  <span className="text-[10px] font-mono text-text-muted uppercase tracking-wider">MSG</span>
                )}
              </div>
              <div className="flex items-center gap-1.5" title={
                networkConnectionStatus === 'connected'
                  ? 'Network: Connected'
                  : networkConnectionStatus === 'connecting'
                  ? 'Network: Connecting...'
                  : 'Network: Disconnected'
              }>
                <div
                  className={`
                    w-2 h-2 rounded-full transition-all duration-75
                    ${networkConnectionStatus === 'disconnected'
                      ? 'bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.7)]'
                      : networkConnectionStatus === 'connecting'
                      ? 'bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.7)] animate-pulse'
                      : netActivity
                      ? 'bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.9)] scale-125'
                      : 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]'
                    }
                  `}
                />
                {!collapsed && (
                  <span className="text-[10px] font-mono text-text-muted uppercase tracking-wider">NET</span>
                )}
              </div>
            </div>
            {!collapsed && <div className="w-px h-3 bg-border" />}
            <PaletteControl collapsed={collapsed} />
          </div>
        </div>

        {/* User */}
        <div className="p-4 border-t border-scc-border">
          {collapsed ? (
            <button
              onClick={logout}
              className="w-full flex justify-center p-2 rounded hover:bg-surface-highlight text-text-muted hover:text-text-primary transition-colors"
              title="Logout"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          ) : (
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-sm font-medium text-text-primary truncate">
                  {user?.name || 'User'}
                </p>
                <p className="text-xs text-text-muted truncate">
                  {user?.email}
                </p>
              </div>
              <button
                onClick={logout}
                className="p-2 rounded hover:bg-surface-highlight text-text-muted hover:text-text-primary transition-colors"
                title="Logout"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 min-h-0 h-full overflow-hidden">
        {children}
      </main>
    </div>
  );
}
