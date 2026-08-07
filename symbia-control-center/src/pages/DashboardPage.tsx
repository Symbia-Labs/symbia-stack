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
import { useCallback, useRef } from 'react';
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
  const chatOpen = activePanel === 'chat';

  // /chat is still a real, linkable route — the C5 deep-link work stands — but
  // it now renders the popout over a panel rather than replacing the screen.
  // The panel underneath is whatever you were last on; overview when the URL
  // was typed cold.
  const underlying = chatOpen ? lastNonChatPanel.current : activePanel;
  const PanelComponent = PANELS[underlying as Exclude<PanelId, 'chat'>] ?? OverviewPanel;
  if (!chatOpen) lastNonChatPanel.current = activePanel;

  const handlePanelChange = useCallback(
    (panel: PanelId) => {
      // push (not replace) so browser back/forward move between panels
      navigate(`/${panel}`);
    },
    [navigate]
  );

  // Closing returns to the panel underneath, so the address bar keeps matching
  // what is on screen. Closing the window while the URL still said /chat was
  // the first thing that felt broken.
  // What the window is floating over. Derived from the panel underneath, not
  // the /chat route itself — the route is where you are, the panel is what you
  // are looking at.
  const chatContext = useChatContext(underlying as PanelId);

  const closeChat = useCallback(
    () => navigate(`/${lastNonChatPanel.current}`),
    [navigate]
  );

  return (
    <MainLayout activePanel={activePanel} onPanelChange={handlePanelChange}>
      <PanelComponent />
      <ChatWindow open={chatOpen} onClose={closeChat} status={<ConnectionDot />} context={chatContext}>
        {(skin) => <ChatPanel skin={skin} context={chatContext} />}
      </ChatWindow>
    </MainLayout>
  );
}
