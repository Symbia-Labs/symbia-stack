/**
 * Which model looks at captured frames.
 *
 * Configured in the CONTROL CENTER, on the Integrations panel — not in the
 * spyglass and not in chat. Brian, 7 Aug 2026: "should just be a simple
 * configuration (via control center, not the chat/spyglass modal)". An
 * instrument should not carry its own settings screen; the place you configure
 * providers is the place you configure which provider does vision.
 *
 * DEFAULT IS AUTOMATIC. With nothing chosen, the client asks the integrations
 * service which providers are `available` — meaning a credential actually
 * resolved, not merely that an adapter is registered — and takes the first
 * model declaring `vision`. The stored selection is an OVERRIDE, so a stack
 * with one working provider needs no configuration at all.
 *
 * F5, LOGGED NOT WORKED AROUND: there is no platform store for an operator
 * preference like this. Identity has credentials but no settings; catalog is
 * for reusable resources (types, graphs, components, contexts) and a personal
 * override is not one; the control center deliberately exposes no API of its
 * own. So this lives in localStorage, which means it is per-browser and does
 * not travel. That is a platform gap with a visible consequence, recorded here
 * and stated in the UI rather than hidden behind a settings icon that implies
 * more durability than exists.
 */
import { create } from 'zustand';

const KEY = 'symbia:vision:model';

export interface VisionSelection {
  provider: string;
  model: string;
}

function load(): VisionSelection | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<VisionSelection>;
    return parsed.provider && parsed.model
      ? { provider: parsed.provider, model: parsed.model }
      : null;
  } catch {
    return null;
  }
}

interface VisionConfigState {
  /** null means "decide automatically from what is available". */
  selection: VisionSelection | null;
  choose: (s: VisionSelection | null) => void;
}

export const useVisionConfig = create<VisionConfigState>((set) => ({
  selection: typeof window === 'undefined' ? null : load(),
  choose: (selection) => {
    try {
      if (selection) localStorage.setItem(KEY, JSON.stringify(selection));
      else localStorage.removeItem(KEY);
    } catch {
      /* storage disabled — the choice still applies for this session */
    }
    set({ selection });
  },
}));

/** Read the override outside React. */
export function currentSelection(): VisionSelection | null {
  return useVisionConfig.getState().selection;
}
