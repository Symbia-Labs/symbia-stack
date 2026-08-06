import { create } from 'zustand';
import type { ServiceHealth, CatalogResource } from '@/services/platformClient';

export interface PlatformEvent {
  id: string;
  type: string;
  source: string;
  timestamp: string;
  message: string;
  data?: unknown;
}

interface PlatformState {
  // Service health
  serviceHealth: Map<string, ServiceHealth>;
  isCheckingHealth: boolean;
  lastHealthCheck: string | null;

  // Catalog resources
  resources: CatalogResource[];
  selectedResource: CatalogResource | null;
  resourceFilter: { type?: string; status?: string };
  isLoadingResources: boolean;

  // Event stream
  events: PlatformEvent[];
  maxEvents: number;

  // Active panel
  activePanel: 'status' | 'resources' | 'logs' | 'events' | 'agents' | 'chat';

  // Actions
  setServiceHealth: (health: ServiceHealth[]) => void;
  setCheckingHealth: (checking: boolean) => void;
  setResources: (resources: CatalogResource[]) => void;
  setSelectedResource: (resource: CatalogResource | null) => void;
  setResourceFilter: (filter: { type?: string; status?: string }) => void;
  setLoadingResources: (loading: boolean) => void;
  addEvent: (event: Omit<PlatformEvent, 'id' | 'timestamp'>) => void;
  clearEvents: () => void;
  setActivePanel: (panel: PlatformState['activePanel']) => void;
}

export const usePlatformStore = create<PlatformState>((set, get) => ({
  // Initial state
  serviceHealth: new Map(),
  isCheckingHealth: false,
  lastHealthCheck: null,
  resources: [],
  selectedResource: null,
  resourceFilter: {},
  isLoadingResources: false,
  events: [],
  maxEvents: 100,
  activePanel: 'status',

  // Actions
  setServiceHealth: (healthList) => {
    const healthMap = new Map<string, ServiceHealth>();
    healthList.forEach((h) => healthMap.set(h.serviceId, h));
    set({
      serviceHealth: healthMap,
      lastHealthCheck: new Date().toISOString(),
    });
  },

  setCheckingHealth: (isCheckingHealth) => set({ isCheckingHealth }),

  setResources: (resources) => set({ resources }),

  setSelectedResource: (selectedResource) => set({ selectedResource }),

  setResourceFilter: (resourceFilter) => set({ resourceFilter }),

  setLoadingResources: (isLoadingResources) => set({ isLoadingResources }),

  addEvent: (event) => {
    const newEvent: PlatformEvent = {
      ...event,
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
    };
    const events = [newEvent, ...get().events].slice(0, get().maxEvents);
    set({ events });
  },

  clearEvents: () => set({ events: [] }),

  setActivePanel: (activePanel) => set({ activePanel }),
}));
