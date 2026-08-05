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
import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { MainLayout, type PanelId } from '@/components/layout/MainLayout';
import { OverviewPanel } from '@/components/panels/OverviewPanel';
import { NetworkPanel } from '@/components/panels/NetworkPanel';
import { AssistantsPanel } from '@/components/panels/AssistantsPanel';
import { IntegrationsPanel } from '@/components/panels/IntegrationsPanel';
import { LogSearchPanel } from '@/components/panels/LogSearchPanel';
import { ChatPanel } from '@/components/panels/ChatPanel';
import { EnergyPanel } from '@/components/panels/EnergyPanel';

const PANELS: Record<PanelId, React.ComponentType> = {
  overview: OverviewPanel,
  network: NetworkPanel,
  assistants: AssistantsPanel,
  integrations: IntegrationsPanel,
  energy: EnergyPanel,
  logs: LogSearchPanel,
  chat: ChatPanel,
};

const PANEL_IDS = Object.keys(PANELS) as PanelId[];

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
  const location = useLocation();
  const navigate = useNavigate();

  const activePanel = panelFromPath(location.pathname);
  const PanelComponent = PANELS[activePanel];

  const handlePanelChange = useCallback(
    (panel: PanelId) => {
      // push (not replace) so browser back/forward move between panels
      navigate(`/${panel}`);
    },
    [navigate]
  );

  return (
    <MainLayout activePanel={activePanel} onPanelChange={handlePanelChange}>
      <PanelComponent />
    </MainLayout>
  );
}
