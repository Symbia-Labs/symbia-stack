/**
 * Dashboard Page
 *
 * Main application page with sidebar navigation and dynamic panel switching.
 *
 * C5 (MVP gate) fix, 5 Aug 2026 — SYMBIA_MARKER_C5_DEEPLINK_20260805.
 * The panel used to live in useState, so the address bar never moved and
 * every direct URL fell through App's catch-all to /dashboard. A shared link
 * landed on the wrong screen. The panel now derives FROM the URL and
 * navigation writes back to it, which makes the address bar the single source
 * of truth rather than a decoration.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { MainLayout, type PanelId } from '@/components/layout/MainLayout';
import { OverviewPanel } from '@/components/panels/OverviewPanel';
import { NetworkPanel } from '@/components/panels/NetworkPanel';
import { AssistantsPanel } from '@/components/panels/AssistantsPanel';
import { IntegrationsPanel } from '@/components/panels/IntegrationsPanel';
import { LogSearchPanel } from '@/components/panels/LogSearchPanel';
import { ChatPanel } from '@/components/panels/ChatPanel';
import { ChatWindow } from '@/components/chat/ChatWindow';
import { ConnectionDot } from '@/components/chat/ConnectionDot';
import { useChatContext } from '@/components/chat/useChatContext';
import { Spyglass } from '@/components/glass/Spyglass';

/**
 * Chat is NOT in here. It stopped being a panel on 6 Aug 2026 and became a
 * phone-shaped popout that floats over whatever panel you are on — an operator
 * reading logs should not have to leave them to ask a question.
 */
const PANELS: Record<Exclude<PanelId, 'chat'>, React.ComponentType> = {
  overview: OverviewPanel,
  network: NetworkPanel,
  assistants: AssistantsPanel,
  integrations: IntegrationsPanel,
  logs: LogSearchPanel,
};

const PANEL_IDS = [...(Object.keys(PANELS) as PanelId[]), 'chat' as PanelId];

/**
 * Read the panel out of the path. Accepts both `/integrations` and
 * `/dashboard/integrations` so old links keep working. Anything
 * unrecognised falls back to overview — but note this is a FALLBACK, not a
 * redirect: the URL is left alone so the user can see what they asked for.
 */
export function panelFromPath(pathname: string): PanelId {
  const parts = pathname.split('/').filter(Boolean);
  const candidate = parts[0] === 'dashboard' ? parts[1] : parts[0];
  return PANEL_IDS.includes(candidate as PanelId)
    ? (candidate as PanelId)
    : 'overview';
}

export function DashboardPage() {
  // Which panel the popout floats over. A ref, not state: it must not trigger a
  // re-render, and it is read during render only to answer "what was I looking
  // at before I opened chat".
  const lastNonChatPanel = useRef<PanelId>('overview');
  const location = useLocation();
  const navigate = useNavigate();

  const activePanel = panelFromPath(location.pathname);

  // Chat's open state is INDEPENDENT of the route.
  //
  // It used to be `activePanel === 'chat'`, which meant clicking any other nav
  // item closed the window — you could not read logs while asking about them,
  // which is the entire reason it is a floating window and not a panel. The
  // route can OPEN it (so /chat stays a working deep link) but never closes it.
  // The spyglass is its own instrument: own state, own lifetime, no
  // relationship to chat. Toggled with ⌥G.
  const [spyOpen, setSpyOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // e.code, not e.key. On macOS Option+G emits '©' — the key property
      // carries the COMPOSED character, so an Alt shortcut matched on e.key
      // never fires on a Mac, which is the machine this runs on.
      if (e.altKey && e.code === 'KeyG') {
        e.preventDefault();
        setSpyOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const [chatOpen, setChatOpen] = useState(() => {
    if (typeof window === 'undefined') return false;
    if (panelFromPath(window.location.pathname) === 'chat') return true;
    return localStorage.getItem('symbia:chat:open') === 'true';
  });

  useEffect(() => {
    if (activePanel === 'chat') setChatOpen(true);
  }, [activePanel]);

  useEffect(() => {
    try {
      localStorage.setItem('symbia:chat:open', String(chatOpen));
    } catch {
      /* storage disabled — the window still works, it just forgets */
    }
  }, [chatOpen]);

  // The panel underneath is simply the current one. Chat no longer replaces a
  // screen, so there is nothing to substitute — /chat typed cold is the only
  // case that needs a fallback, and it gets the last panel you were on.
  const underlying: PanelId =
    activePanel === 'chat' ? lastNonChatPanel.current : activePanel;
  const PanelComponent = PANELS[underlying as Exclude<PanelId, 'chat'>] ?? OverviewPanel;
  if (activePanel !== 'chat') lastNonChatPanel.current = activePanel;

  const handlePanelChange = useCallback(
    (panel: PanelId) => {
      // Chat is a window, not a destination. Clicking it toggles the popout and
      // leaves you on the screen you were reading.
      if (panel === 'chat') {
        setChatOpen((v) => !v);
        return;
      }
      // push (not replace) so browser back/forward move between panels
      navigate(`/${panel}`);
    },
    [navigate]
  );

  // What the window is floating over. Derived from the panel underneath, not
  // the /chat route itself — the route is where you are, the panel is what you
  // are looking at.
  const chatContext = useChatContext(underlying as PanelId);

  // Closing just closes. It no longer navigates, because opening no longer
  // navigated — the two have to agree or the address bar starts lying.
  const closeChat = useCallback(() => {
    setChatOpen(false);
    if (activePanel === 'chat') navigate(`/${lastNonChatPanel.current}`);
  }, [navigate, activePanel]);

  return (
    <MainLayout activePanel={activePanel} onPanelChange={handlePanelChange}>
      <PanelComponent />
      <ChatWindow open={chatOpen} onClose={closeChat} status={<ConnectionDot />} context={chatContext}>
        {(skin) => <ChatPanel skin={skin} context={chatContext} />}
      </ChatWindow>
      {/* Visible launcher.
          Making the spyglass independent removed the 🔍 from the chat header
          and left only Option+G — a keyboard shortcut nobody can discover by
          looking. A feature reachable only by a shortcut you were told about
          is a feature most people do not have. */}
      <button
        onClick={() => setSpyOpen((v) => !v)}
        title="Spyglass — live pixels from any tab, window or screen (⌥G)"
        aria-pressed={spyOpen}
        className={`fixed bottom-5 right-5 z-[9998] w-12 h-12 rounded-full grid place-items-center text-[20px] shadow-xl border transition-colors ${
          spyOpen
            ? 'bg-white/20 border-white/35 text-white'
            : 'bg-black/70 border-white/20 text-white/70 hover:text-white hover:bg-black/85'
        }`}
      >
        🔍
      </button>

      <Spyglass open={spyOpen} onClose={() => setSpyOpen(false)} />
    </MainLayout>
  );
}
