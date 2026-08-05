import { useState, useEffect, useRef } from 'react';
import { useMessagingStore } from '@/stores/messagingStore';
import { useServicesStore } from '@/stores/servicesStore';
import { useOrgStore } from '@/stores/orgStore';
import { useAuthStore } from '@/stores/authStore';

type LightState = 'off' | 'red' | 'amber' | 'green';
type BlinkMode = 'solid' | 'slow' | 'fast';

interface ModemLightProps {
  label: string;
  state: LightState;
  blink: BlinkMode;
  title?: string;
}

function PaletteControl() {
  const [isOpen, setIsOpen] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    if (typeof document !== 'undefined') {
      return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
    }
    return 'dark';
  });
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
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
    { name: 'primary', color: 'var(--primary-500)' },
    { name: 'success', color: 'var(--success)' },
    { name: 'warning', color: 'var(--warning)' },
    { name: 'error', color: 'var(--error)' },
    { name: 'info', color: 'var(--info)' },
  ];

  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-surface-highlight transition-colors duration-fast"
        title="Color palette"
      >
        <div className="flex -space-x-0.5">
          {paletteColors.map((c) => (
            <div
              key={c.name}
              className="w-2 h-2 rounded-full border border-surface-base"
              style={{ backgroundColor: c.color }}
            />
          ))}
        </div>
        <svg
          className={`w-2.5 h-2.5 text-text-muted transition-transform duration-fast ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute bottom-full left-0 mb-1 w-36 bg-surface-overlay border border-border rounded-lg shadow-lg z-dropdown animate-fade-in">
          <div className="p-2 border-b border-border">
            <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1.5">Theme</div>
            <div className="flex gap-1">
              <button
                onClick={() => handleThemeChange('dark')}
                className={`flex-1 px-2 py-1 rounded text-[10px] font-medium transition-colors ${
                  theme === 'dark'
                    ? 'bg-primary-500/15 text-primary-500'
                    : 'text-text-secondary hover:bg-surface-highlight'
                }`}
              >
                Dark
              </button>
              <button
                onClick={() => handleThemeChange('light')}
                className={`flex-1 px-2 py-1 rounded text-[10px] font-medium transition-colors ${
                  theme === 'light'
                    ? 'bg-primary-500/15 text-primary-500'
                    : 'text-text-secondary hover:bg-surface-highlight'
                }`}
              >
                Light
              </button>
            </div>
          </div>
          <div className="p-2">
            <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1.5">Palette</div>
            <div className="grid grid-cols-5 gap-1">
              {paletteColors.map((c) => (
                <div
                  key={c.name}
                  className="w-5 h-5 rounded border border-border-muted"
                  style={{ backgroundColor: c.color }}
                  title={c.name}
                />
              ))}
            </div>
            <div className="grid grid-cols-5 gap-1 mt-1">
              <div className="w-5 h-5 rounded border border-border-muted bg-node-input" title="input" />
              <div className="w-5 h-5 rounded border border-border-muted bg-node-output" title="output" />
              <div className="w-5 h-5 rounded border border-border-muted bg-node-llm" title="llm" />
              <div className="w-5 h-5 rounded border border-border-muted bg-node-router" title="router" />
              <div className="w-5 h-5 rounded border border-border-muted bg-node-tool" title="tool" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ModemLight({ label, state, blink, title }: ModemLightProps) {
  const colors: Record<LightState, string> = {
    off: 'bg-text-muted',
    red: 'bg-error shadow-[0_0_6px_var(--error)]',
    amber: 'bg-warning shadow-[0_0_6px_var(--warning)]',
    green: 'bg-success shadow-[0_0_6px_var(--success)]',
  };

  const blinkClass: Record<BlinkMode, string> = {
    solid: '',
    slow: 'animate-pulse',
    fast: 'animate-[pulse_0.3s_ease-in-out_infinite]',
  };

  return (
    <div className="flex items-center gap-1.5" title={title}>
      <span className="text-[10px] font-mono text-text-muted uppercase tracking-wider w-6">
        {label}
      </span>
      <div
        className={`
          w-2 h-2 rounded-full transition-all duration-fast
          ${colors[state]}
          ${blinkClass[blink]}
        `}
      />
    </div>
  );
}

export function StatusBar() {
  const { connectionStatus: msgStatus } = useMessagingStore();
  const { networkConnectionStatus: netStatus, recentNetworkEvents } = useServicesStore();
  const { currentOrgId } = useOrgStore();
  const { organizations } = useAuthStore();

  // Track activity for fast blink on new events
  const [netActivity, setNetActivity] = useState(false);
  const lastEventCount = useRef(0);

  // Flash network light on new events
  useEffect(() => {
    if (recentNetworkEvents.length > lastEventCount.current) {
      setNetActivity(true);
      const timer = setTimeout(() => setNetActivity(false), 200);
      lastEventCount.current = recentNetworkEvents.length;
      return () => clearTimeout(timer);
    }
  }, [recentNetworkEvents.length]);

  // Calculate MSG light state
  const getMsgLight = (): { state: LightState; blink: BlinkMode; title: string } => {
    if (msgStatus === 'disconnected') {
      return { state: 'red', blink: 'solid', title: 'Messaging: Disconnected' };
    }
    if (msgStatus === 'connecting') {
      return { state: 'amber', blink: 'slow', title: 'Messaging: Connecting...' };
    }
    // TODO: Add message activity tracking when messaging store has event counter
    return { state: 'green', blink: 'solid', title: 'Messaging: Connected' };
  };

  // Calculate NET light state
  const getNetLight = (): { state: LightState; blink: BlinkMode; title: string } => {
    if (netStatus === 'disconnected') {
      return { state: 'red', blink: 'solid', title: 'Network: Disconnected' };
    }
    if (netStatus === 'connecting') {
      return { state: 'amber', blink: 'slow', title: 'Network: Connecting...' };
    }
    if (netActivity) {
      return { state: 'green', blink: 'fast', title: 'Network: Activity' };
    }
    return { state: 'green', blink: 'solid', title: 'Network: Connected' };
  };

  const msgLight = getMsgLight();
  const netLight = getNetLight();
  const currentOrg = organizations.find((o) => o.id === currentOrgId);

  return (
    <footer className="h-6 bg-surface-base border-t border-border px-4 flex items-center justify-between text-xs select-none">
      {/* Left: Modem Lights + Palette */}
      <div className="flex items-center gap-4">
        <ModemLight
          label="MSG"
          state={msgLight.state}
          blink={msgLight.blink}
          title={msgLight.title}
        />
        <ModemLight
          label="NET"
          state={netLight.state}
          blink={netLight.blink}
          title={netLight.title}
        />
        <div className="w-px h-3 bg-border-muted" />
        <PaletteControl />
      </div>

      {/* Center: Current Org */}
      {currentOrg && (
        <div className="text-text-muted">
          <span className="text-text-secondary">{currentOrg.name}</span>
        </div>
      )}

      {/* Right: Event counter */}
      <div className="flex items-center gap-3 text-text-muted">
        {recentNetworkEvents.length > 0 && (
          <span className="font-mono text-[10px]">
            {recentNetworkEvents.length} events
          </span>
        )}
        <span className="font-mono">{new Date().toLocaleTimeString()}</span>
      </div>
    </footer>
  );
}
