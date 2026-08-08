/**
 * What the chat window is floating over, and where it is on screen.
 *
 * Two kinds of position awareness, deliberately in one place because they end
 * up interacting: a window that knows it is over the network graph should also
 * know to park itself away from the graph canvas.
 *
 * The panel context is the interesting half. A chat window in an operator
 * console that does not know which screen you are on makes you retype what is
 * already in front of you — "what am I looking at" is unanswerable, and every
 * question has to restate its own context. Passing the current panel to the
 * assistant is the difference between a chat box that happens to be embedded
 * and one that is situated.
 *
 * IMPORTANT: this reports where the user IS, not what is on the screen. It
 * does not scrape the panel's contents. If the assistant needs the numbers it
 * must fetch them through the platform, with a receipt, like anything else —
 * scraping the DOM would produce answers with no provenance, which is the one
 * thing this codebase must not start doing.
 */
import { useEffect, useState } from 'react';
import type { PanelId } from '@/components/layout/MainLayout';

/** Human-readable description of each panel, for the assistant's context. */
const PANEL_CONTEXT: Record<string, { title: string; about: string }> = {
  overview: {
    title: 'Platform Overview',
    about: 'service health, counts and latency across the stack',
  },
  network: {
    title: 'Network Topology',
    about: 'the service mesh: nodes, contracts, event routing and traces',
  },
  catalog: {
    title: 'Catalog',
    about:
      'the registry: every resource by type, each component\'s typed config contract and per-port provenance lanes, and hygiene checks over the registry itself',
  },
  assistants: {
    title: 'Assistants',
    about: 'registered assistants, their aliases and rule sets',
  },
  integrations: {
    title: 'Integrations',
    about: 'external providers, credentials and the operations they expose',
  },
  logs: {
    title: 'Log Search',
    about: 'log search with field facets and time ranges',
  },
};

export interface ChatContext {
  panel: PanelId;
  title: string;
  about: string;
  /** One line handed to the assistant so it knows where the question came from. */
  situation: string;
}

export function useChatContext(panel: PanelId): ChatContext {
  const meta = PANEL_CONTEXT[panel] ?? {
    title: 'Symbia',
    about: 'the control center',
  };
  return {
    panel,
    ...meta,
    situation: `The operator is on the ${meta.title} panel (${meta.about}).`,
  };
}

/** Which screen edge a point is nearest, for snapping. */
export type Edge = 'left' | 'right' | 'none';

/**
 * Screen-position awareness.
 *
 * Reports the nearest edge and whether the window currently overlaps a region
 * the panel underneath cares about. The caller decides what to do about it —
 * this hook does not move anything, because a window that repositions itself
 * while you are dragging it is infuriating.
 */
export function useScreenPosition(
  rect: { x: number; y: number; w: number; h: number },
  snapPx = 48
): { edge: Edge; nearTop: boolean; nearBottom: boolean } {
  const [vp, setVp] = useState(() => ({
    w: typeof window === 'undefined' ? 1440 : window.innerWidth,
    h: typeof window === 'undefined' ? 900 : window.innerHeight,
  }));

  useEffect(() => {
    const onResize = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const distLeft = rect.x;
  const distRight = vp.w - (rect.x + rect.w);

  const edge: Edge =
    distLeft <= snapPx && distLeft <= distRight
      ? 'left'
      : distRight <= snapPx
      ? 'right'
      : 'none';

  return {
    edge,
    nearTop: rect.y <= snapPx,
    nearBottom: vp.h - (rect.y + rect.h) <= snapPx,
  };
}
