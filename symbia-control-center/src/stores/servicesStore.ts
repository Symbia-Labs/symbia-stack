/**
 * Services Store
 *
 * Unified store for Assistants, Network, and Integrations services data.
 * Provides reactive state management with real-time updates via subscriptions.
 */
import { create } from 'zustand';
import type { Graph, Actor, Run } from '@/services/assistantsClient';
import type { NetworkNode, NodeContract, NetworkTopology, SandboxEvent, EventTrace } from '@/services/networkClient';
import type { Provider, ProviderStatus, Integration, CapabilitiesResponse, ProviderCapability, ModelsByPurpose } from '@/services/integrationsClient';
import type { LogEntry, LogStream, LoggingStats } from '@/services/loggingStreamClient';

// =============================================================================
// Types
// =============================================================================

type NetworkConnectionStatus = 'connected' | 'connecting' | 'disconnected';

// Loaded assistant type (from catalog)
export interface LoadedAssistant {
  key: string;
  name: string;
  alias?: string;
  principalId: string;
  description: string;
  status: string;
  capabilities: string[];
  hasHandler: boolean;
  hasRules: boolean;
  rulesCount: number;
}

/**
 * Network permission error details
 */
export interface NetworkPermissionErrorState {
  operation: string;
  requiredPermission?: string;
  message: string;
}

interface ServicesState {
  // Assistants
  graphs: Graph[];
  actors: Actor[];
  runs: Run[];
  loadedAssistants: LoadedAssistant[]; // Catalog-loaded assistants (for @mentions)
  selectedGraphId: string | null;
  selectedActorId: string | null;
  isLoadingAssistants: boolean;
  assistantsError: string | null;

  // Network
  networkTopology: NetworkTopology | null;
  networkNodes: NetworkNode[];
  networkContracts: NodeContract[];
  networkConnectionStatus: NetworkConnectionStatus;
  recentNetworkEvents: Array<{ event: SandboxEvent; trace: EventTrace }>;
  networkEventsTotal: number; // Total events received (including streamed)
  isLoadingNetwork: boolean;
  networkError: string | null;
  networkPermissionError: NetworkPermissionErrorState | null; // Permission-specific error

  // Integrations
  providers: Provider[];
  providerStatuses: ProviderStatus[];
  integrations: Integration[];
  isLoadingIntegrations: boolean;
  integrationsError: string | null;

  // Capabilities (SOR - cached from integrations service)
  capabilities: CapabilitiesResponse | null;
  capabilitiesFetchedAt: number | null; // Timestamp for cache invalidation
  isLoadingCapabilities: boolean;

  // Logging (enhanced)
  logStreams: LogStream[];
  recentLogs: LogEntry[];
  loggingStats: LoggingStats | null;
  isLoadingLogging: boolean;
  loggingError: string | null;

  // Subscriptions tracking
  activeSubscriptions: Set<string>;

  // Actions - Assistants
  setGraphs: (graphs: Graph[]) => void;
  addGraph: (graph: Graph) => void;
  updateGraph: (id: string, graph: Partial<Graph>) => void;
  removeGraph: (id: string) => void;
  setActors: (actors: Actor[]) => void;
  addActor: (actor: Actor) => void;
  updateActor: (id: string, actor: Partial<Actor>) => void;
  removeActor: (id: string) => void;
  setRuns: (runs: Run[]) => void;
  addRun: (run: Run) => void;
  updateRun: (id: string, run: Partial<Run>) => void;
  setSelectedGraphId: (id: string | null) => void;
  setSelectedActorId: (id: string | null) => void;
  setLoadedAssistants: (assistants: LoadedAssistant[]) => void;
  setLoadingAssistants: (loading: boolean) => void;
  setAssistantsError: (error: string | null) => void;

  // Actions - Network
  setNetworkTopology: (topology: NetworkTopology | null) => void;
  setNetworkNodes: (nodes: NetworkNode[]) => void;
  addNetworkNode: (node: NetworkNode) => void;
  removeNetworkNode: (nodeId: string) => void;
  setNetworkContracts: (contracts: NodeContract[]) => void;
  addNetworkContract: (contract: NodeContract) => void;
  setNetworkConnectionStatus: (status: NetworkConnectionStatus) => void;
  addNetworkEvent: (event: SandboxEvent, trace: EventTrace) => void;
  setRecentNetworkEvents: (events: Array<{ event: SandboxEvent; trace: EventTrace }>) => void;
  clearNetworkEvents: () => void;
  setLoadingNetwork: (loading: boolean) => void;
  setNetworkError: (error: string | null) => void;
  setNetworkPermissionError: (error: NetworkPermissionErrorState | null) => void;

  // Actions - Integrations
  setProviders: (providers: Provider[]) => void;
  setProviderStatuses: (statuses: ProviderStatus[]) => void;
  setIntegrations: (integrations: Integration[]) => void;
  setLoadingIntegrations: (loading: boolean) => void;
  setIntegrationsError: (error: string | null) => void;

  // Actions - Capabilities (SOR)
  setCapabilities: (capabilities: CapabilitiesResponse) => void;
  setLoadingCapabilities: (loading: boolean) => void;
  invalidateCapabilities: () => void;
  getProviderCapability: (provider: string) => ProviderCapability | undefined;
  getModelsForPurpose: (purpose: keyof ModelsByPurpose) => Array<{ provider: string; model: any }>;

  // Actions - Logging
  setLogStreams: (streams: LogStream[]) => void;
  setRecentLogs: (logs: LogEntry[]) => void;
  addLogs: (logs: LogEntry[]) => void;
  setLoggingStats: (stats: LoggingStats | null) => void;
  setLoadingLogging: (loading: boolean) => void;
  setLoggingError: (error: string | null) => void;

  // Actions - Subscriptions
  addSubscription: (id: string) => void;
  removeSubscription: (id: string) => void;
  clearSubscriptions: () => void;

  // Reset
  reset: () => void;
}

// =============================================================================
// Store
// =============================================================================

const initialState = {
  // Assistants
  graphs: [],
  actors: [],
  runs: [],
  loadedAssistants: [] as LoadedAssistant[],
  selectedGraphId: null,
  selectedActorId: null,
  isLoadingAssistants: false,
  assistantsError: null,

  // Network
  networkTopology: null,
  networkNodes: [],
  networkContracts: [],
  networkConnectionStatus: 'disconnected' as NetworkConnectionStatus,
  recentNetworkEvents: [],
  networkEventsTotal: 0,
  isLoadingNetwork: false,
  networkError: null,
  networkPermissionError: null,

  // Integrations
  providers: [],
  providerStatuses: [],
  integrations: [] as Integration[],
  isLoadingIntegrations: false,
  integrationsError: null,

  // Capabilities (SOR)
  capabilities: null as CapabilitiesResponse | null,
  capabilitiesFetchedAt: null as number | null,
  isLoadingCapabilities: false,

  // Logging
  logStreams: [],
  recentLogs: [],
  loggingStats: null,
  isLoadingLogging: false,
  loggingError: null,

  // Subscriptions
  activeSubscriptions: new Set<string>(),
};

export const useServicesStore = create<ServicesState>((set, get) => ({
  ...initialState,

  // ===========================================================================
  // Assistants Actions
  // ===========================================================================

  setGraphs: (graphs) => set({ graphs }),

  addGraph: (graph) =>
    set((state) => ({
      graphs: [graph, ...state.graphs],
    })),

  updateGraph: (id, updates) =>
    set((state) => ({
      graphs: state.graphs.map((g) =>
        g.id === id ? { ...g, ...updates } : g
      ),
    })),

  removeGraph: (id) =>
    set((state) => ({
      graphs: state.graphs.filter((g) => g.id !== id),
      selectedGraphId: state.selectedGraphId === id ? null : state.selectedGraphId,
    })),

  setActors: (actors) => set({ actors }),

  addActor: (actor) =>
    set((state) => ({
      actors: [actor, ...state.actors],
    })),

  updateActor: (id, updates) =>
    set((state) => ({
      actors: state.actors.map((a) =>
        a.id === id ? { ...a, ...updates } : a
      ),
    })),

  removeActor: (id) =>
    set((state) => ({
      actors: state.actors.filter((a) => a.id !== id),
      selectedActorId: state.selectedActorId === id ? null : state.selectedActorId,
    })),

  setRuns: (runs) => set({ runs }),

  addRun: (run) =>
    set((state) => ({
      runs: [run, ...state.runs],
    })),

  updateRun: (id, updates) =>
    set((state) => ({
      runs: state.runs.map((r) =>
        r.id === id ? { ...r, ...updates } : r
      ),
    })),

  setSelectedGraphId: (selectedGraphId) => set({ selectedGraphId }),

  setSelectedActorId: (selectedActorId) => set({ selectedActorId }),

  setLoadedAssistants: (loadedAssistants) => set({ loadedAssistants }),

  setLoadingAssistants: (isLoadingAssistants) => set({ isLoadingAssistants }),

  setAssistantsError: (assistantsError) => set({ assistantsError }),

  // ===========================================================================
  // Network Actions
  // ===========================================================================

  setNetworkTopology: (networkTopology) =>
    set({
      networkTopology,
      networkNodes: networkTopology?.nodes || [],
      networkContracts: networkTopology?.contracts || [],
    }),

  setNetworkNodes: (networkNodes) => set({ networkNodes }),

  addNetworkNode: (node) =>
    set((state) => {
      // Avoid duplicates
      const exists = state.networkNodes.some((n) => n.id === node.id);
      if (exists) {
        return {
          networkNodes: state.networkNodes.map((n) =>
            n.id === node.id ? node : n
          ),
        };
      }
      return { networkNodes: [...state.networkNodes, node] };
    }),

  removeNetworkNode: (nodeId) =>
    set((state) => ({
      networkNodes: state.networkNodes.filter((n) => n.id !== nodeId),
    })),

  setNetworkContracts: (networkContracts) => set({ networkContracts }),

  addNetworkContract: (contract) =>
    set((state) => ({
      networkContracts: [...state.networkContracts, contract],
    })),

  setNetworkConnectionStatus: (networkConnectionStatus) =>
    set({ networkConnectionStatus }),

  addNetworkEvent: (event, trace) =>
    set((state) => ({
      recentNetworkEvents: [
        { event, trace },
        ...state.recentNetworkEvents.slice(0, 499), // Keep last 500 events
      ],
      networkEventsTotal: state.networkEventsTotal + 1,
    })),

  setRecentNetworkEvents: (events) =>
    set((state) => ({
      recentNetworkEvents: events,
      networkEventsTotal: Math.max(state.networkEventsTotal, events.length),
    })),

  clearNetworkEvents: () => set({ recentNetworkEvents: [], networkEventsTotal: 0 }),

  setLoadingNetwork: (isLoadingNetwork) => set({ isLoadingNetwork }),

  setNetworkError: (networkError) => set({ networkError }),

  setNetworkPermissionError: (networkPermissionError) => set({ networkPermissionError }),

  // ===========================================================================
  // Integrations Actions
  // ===========================================================================

  setProviders: (providers) => set({ providers }),

  setProviderStatuses: (providerStatuses) => set({ providerStatuses }),

  setIntegrations: (integrations) => set({ integrations }),

  setLoadingIntegrations: (isLoadingIntegrations) =>
    set({ isLoadingIntegrations }),

  setIntegrationsError: (integrationsError) => set({ integrationsError }),

  // ===========================================================================
  // Capabilities Actions (SOR)
  // ===========================================================================

  setCapabilities: (capabilities) =>
    set({
      capabilities,
      capabilitiesFetchedAt: Date.now(),
      isLoadingCapabilities: false,
    }),

  setLoadingCapabilities: (isLoadingCapabilities) => set({ isLoadingCapabilities }),

  invalidateCapabilities: () =>
    set({
      capabilities: null,
      capabilitiesFetchedAt: null,
    }),

  getProviderCapability: (provider) => {
    // Use create()'s get, not useServicesStore.getState(): referencing the
    // store inside its own initializer made the whole store's type circular
    // (TS7022) and untyped every consumer of it.
    const state = get();
    return state.capabilities?.byProvider[provider];
  },

  getModelsForPurpose: (purpose) => {
    const state = get();
    if (!state.capabilities) return [];
    // Only return models for providers the user has access to
    return state.capabilities.modelsByPurpose[purpose].filter(m => {
      const providerCap = state.capabilities?.byProvider[m.provider];
      return providerCap?.access.hasCredential;
    });
  },

  // ===========================================================================
  // Logging Actions
  // ===========================================================================

  setLogStreams: (logStreams) => set({ logStreams }),

  setRecentLogs: (recentLogs) => set({ recentLogs }),

  addLogs: (logs) =>
    set((state) => {
      // Deduplicate by id and keep most recent
      const existingIds = new Set(state.recentLogs.map((l) => l.id));
      const newLogs = logs.filter((l) => !existingIds.has(l.id));
      return {
        recentLogs: [...newLogs, ...state.recentLogs].slice(0, 500),
      };
    }),

  setLoggingStats: (loggingStats) => set({ loggingStats }),

  setLoadingLogging: (isLoadingLogging) => set({ isLoadingLogging }),

  setLoggingError: (loggingError) => set({ loggingError }),

  // ===========================================================================
  // Subscription Tracking
  // ===========================================================================

  addSubscription: (id) =>
    set((state) => ({
      activeSubscriptions: new Set([...state.activeSubscriptions, id]),
    })),

  removeSubscription: (id) =>
    set((state) => {
      const newSet = new Set(state.activeSubscriptions);
      newSet.delete(id);
      return { activeSubscriptions: newSet };
    }),

  clearSubscriptions: () => set({ activeSubscriptions: new Set() }),

  // ===========================================================================
  // Reset
  // ===========================================================================

  reset: () => set(initialState),
}));
