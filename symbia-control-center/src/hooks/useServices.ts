/**
 * useServices Hook
 *
 * Unified hook for managing all service connections and real-time data subscriptions.
 * Provides a single entry point for connecting to Assistants, Network, Integrations,
 * and enhanced Logging services with automatic cleanup.
 */
import { useEffect, useCallback, useRef } from 'react';
import { useServicesStore } from '@/stores/servicesStore';
import { useAuthStore } from '@/stores/authStore';
import { useOrgStore } from '@/stores/orgStore';
import { assistantsClient } from '@/services/assistantsClient';
import { integrationsClient } from '@/services/integrationsClient';
import {
  connectNetworkSocket,
  disconnectNetworkSocket,
  subscribeToSDNEvents,
  unsubscribeFromSDNEvents,
  networkClient,
  NetworkPermissionError,
  NetworkAuthError,
  type NetworkEventHandlers,
} from '@/services/networkClient';
import { loggingStreamClient, pollingManager } from '@/services/loggingStreamClient';
import { DEBUG } from '@/config/debug';

interface UseServicesOptions {
  enableAssistants?: boolean;
  enableNetwork?: boolean;
  enableIntegrations?: boolean;
  enableLogging?: boolean;
  loggingPollInterval?: number;
  networkEventStream?: boolean;
}

// Get store actions once (they're stable references)
const getStoreActions = () => useServicesStore.getState();

export function useServices(options: UseServicesOptions = {}) {
  const {
    enableAssistants = true,
    enableNetwork = true,
    enableIntegrations = true,
    enableLogging = true,
    loggingPollInterval = 5000,
    networkEventStream = false,
  } = options;

  const token = useAuthStore((s) => s.token);
  const organizations = useAuthStore((s) => s.organizations);
  const orgId = useOrgStore((s) => s.currentOrgId);
  const setCurrentOrg = useOrgStore((s) => s.setCurrentOrg);

  // Auto-set org when organizations are loaded but no org is selected
  useEffect(() => {
    if (organizations.length > 0 && !orgId) {
      const firstOrg = organizations[0];
      if (DEBUG) {
        console.log('[useServices] Auto-setting org to:', firstOrg.id, firstOrg.name);
      }
      setCurrentOrg(firstOrg.id);
    }
  }, [organizations, orgId, setCurrentOrg]);

  // Subscribe to store state for reactivity
  const store = useServicesStore();
  const subscriptionsRef = useRef<string[]>([]);
  const networkConnectedRef = useRef(false);
  const networkInitializedRef = useRef(false);
  const lastOrgIdRef = useRef<string | null>(null);

  // ===========================================================================
  // Assistants Service
  // ===========================================================================

  const loadAssistantsData = useCallback(async () => {
    const currentToken = useAuthStore.getState().token;
    const currentOrgId = useOrgStore.getState().currentOrgId;

    if (DEBUG) {
      console.log('[useServices] loadAssistantsData called', { hasToken: !!currentToken, currentOrgId });
    }

    const actions = getStoreActions();

    // SYMBIA_MARKER_T02_NOT_FETCHED_20260805
    // This used to `return` silently. The store then kept loadedAssistants
    // as [], and the dashboard rendered "ASSISTANTS 0 loaded" while 15 were
    // in fact loaded — a confident zero that meant "never asked". Zero
    // fetched and zero existing are different facts and must not share a
    // rendering. Record why, so the panel can say so.
    if (!currentToken || !currentOrgId) {
      actions.setAssistantsError(
        `not fetched — ${!currentToken ? 'no auth token' : 'no org selected'}`
      );
      actions.setLoadingAssistants(false);
      return;
    }

    actions.setLoadingAssistants(true);
    actions.setAssistantsError(null);

    try {
      const [graphs, actors, runs, loadedAssistants] = await Promise.all([
        assistantsClient.listGraphs(),
        assistantsClient.listActors(),
        assistantsClient.listRuns(),
        assistantsClient.listAssistants(),
      ]);

      if (DEBUG) {
        console.log('[useServices] Assistants data loaded', {
          graphs: graphs.length,
          actors: actors.length,
          runs: runs.length,
          loadedAssistants: loadedAssistants.length,
        });
      }

      actions.setGraphs(graphs);
      actions.setActors(actors);
      actions.setRuns(runs);
      actions.setLoadedAssistants(loadedAssistants);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load assistants data';
      console.error('[useServices] Failed to load assistants data:', error);
      actions.setAssistantsError(message);
    } finally {
      actions.setLoadingAssistants(false);
    }
  }, []);

  // ===========================================================================
  // Network Service
  // ===========================================================================

  const connectNetwork = useCallback(async () => {
    const currentToken = useAuthStore.getState().token;
    if (!currentToken || networkConnectedRef.current) return;

    const actions = getStoreActions();
    actions.setLoadingNetwork(true);
    actions.setNetworkConnectionStatus('connecting');
    actions.setNetworkPermissionError(null); // Clear previous permission errors

    // First load topology via REST (more reliable than socket for initial data)
    try {
      const topology = await networkClient.getTopology();
      actions.setNetworkTopology(topology);
      if (DEBUG) {
        console.log('[useServices] Loaded topology via REST:', topology.nodes.length, 'nodes');
      }
    } catch (error) {
      if (DEBUG) {
        console.error('[useServices] Failed to load topology via REST:', error);
      }
      // Track permission errors specifically
      if (error instanceof NetworkPermissionError) {
        actions.setNetworkPermissionError({
          operation: error.operation,
          requiredPermission: error.requiredPermission,
          message: error.message,
        });
      } else if (error instanceof NetworkAuthError) {
        actions.setNetworkError('Authentication required for network access');
      }
      // Continue with socket connection even if REST fails
    }

    // Load recent events with traces (server returns them already wrapped)
    try {
      const eventsWithTraces = await networkClient.getRecentEvents({ limit: 500 });
      if (eventsWithTraces && Array.isArray(eventsWithTraces)) {
        actions.setRecentNetworkEvents(eventsWithTraces);
        if (DEBUG) {
          console.log('[useServices] Loaded events via REST:', eventsWithTraces.length, 'events');
        }
      }
    } catch (error) {
      if (DEBUG) {
        console.error('[useServices] Failed to load events via REST:', error);
      }
      // Track permission errors but don't block
      if (error instanceof NetworkPermissionError && !actions.networkPermissionError) {
        actions.setNetworkPermissionError({
          operation: error.operation,
          requiredPermission: error.requiredPermission,
          message: error.message,
        });
      }
    }

    actions.setLoadingNetwork(false);

    const handlers: NetworkEventHandlers = {
      onConnect: async () => {
        networkConnectedRef.current = true;
        const a = getStoreActions();
        a.setNetworkConnectionStatus('connected');
        a.setNetworkError(null);

        // Subscribe to SDN events if enabled
        if (networkEventStream) {
          if (DEBUG) {
            console.log('[useServices] Subscribing to SDN events (networkEventStream enabled)');
          }
          try {
            const subId = await subscribeToSDNEvents();
            if (DEBUG) {
              console.log('[useServices] SDN subscription successful:', subId);
            }
          } catch (error) {
            if (DEBUG) {
              console.error('[useServices] Failed to subscribe to SDN events:', error);
            }
            // Track permission errors
            if (error instanceof NetworkPermissionError) {
              a.setNetworkPermissionError({
                operation: error.operation,
                requiredPermission: error.requiredPermission,
                message: error.message,
              });
            } else if (error instanceof NetworkAuthError) {
              a.setNetworkError('Authentication required for SDN event stream');
            }
          }
        } else {
          if (DEBUG) {
            console.log('[useServices] SDN event streaming not enabled (networkEventStream=false)');
          }
        }
      },

      onDisconnect: () => {
        networkConnectedRef.current = false;
        getStoreActions().setNetworkConnectionStatus('disconnected');
      },

      onError: (error) => {
        const a = getStoreActions();
        a.setNetworkError(error.message);
        a.setLoadingNetwork(false);
        a.setNetworkConnectionStatus('disconnected');
      },

      onNodeJoined: (event) => {
        getStoreActions().addNetworkNode({
          id: event.nodeId,
          name: event.name,
          type: event.type as 'service' | 'assistant' | 'sandbox' | 'bridge' | 'client',
          capabilities: [],
          endpoint: '',
          registeredAt: new Date().toISOString(),
          lastHeartbeat: new Date().toISOString(),
        });
      },

      onNodeLeft: (event) => {
        getStoreActions().removeNetworkNode(event.nodeId);
      },

      onNodeDisconnected: (event) => {
        if (DEBUG) {
          console.log('[useServices] Node disconnected:', event.nodeId);
        }
      },

      onContractCreated: (contract) => {
        getStoreActions().addNetworkContract(contract);
      },

      onSDNEvent: (event, trace) => {
        getStoreActions().addNetworkEvent(event, trace);
      },
    };

    connectNetworkSocket(handlers);
  }, [networkEventStream]);

  const disconnectNetwork = useCallback(async () => {
    if (networkEventStream) {
      await unsubscribeFromSDNEvents();
    }
    disconnectNetworkSocket();
    networkConnectedRef.current = false;
    getStoreActions().setNetworkConnectionStatus('disconnected');
  }, [networkEventStream]);

  // ===========================================================================
  // Integrations Service
  // ===========================================================================

  const loadIntegrationsData = useCallback(async () => {
    const currentToken = useAuthStore.getState().token;

    const actions = getStoreActions();

    // SYMBIA_MARKER_T03_PROVIDERS_20260805
    // Same silent-return defect as loadAssistantsData: bailing without a
    // token left providers as [], and the Overview panel then asserted "No
    // providers configured" while the API reported configuredProviders: 3.
    // Never leave an empty list that a panel can mistake for an answer.
    if (!currentToken) {
      actions.setIntegrationsError('not fetched — no auth token');
      actions.setLoadingIntegrations(false);
      return;
    }

    actions.setLoadingIntegrations(true);
    actions.setIntegrationsError(null);

    try {
      const [providers, status, integrations, capabilities] = await Promise.all([
        integrationsClient.listProviders(),
        integrationsClient.getStatus(),
        integrationsClient.listIntegrations().catch(() => []), // Non-fatal if registry fails
        integrationsClient.getCapabilities().catch(() => null), // Non-fatal if capabilities fail
      ]);

      actions.setProviders(providers);
      actions.setProviderStatuses(status.providers);
      actions.setIntegrations(integrations);

      // Store capabilities (SOR for UI components)
      if (capabilities) {
        actions.setCapabilities(capabilities);
        if (DEBUG) {
          console.log('[useServices] Loaded capabilities:', {
            providers: capabilities.providers.length,
            chatModels: capabilities.modelsByPurpose.chat.length,
            embeddingModels: capabilities.modelsByPurpose.embedding.length,
          });
        }
      }

      if (DEBUG) {
        console.log('[useServices] Loaded integrations:', integrations.length);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load integrations data';
      actions.setIntegrationsError(message);
    } finally {
      actions.setLoadingIntegrations(false);
    }
  }, []);

  /**
   * Load capabilities separately (for components that only need provider/model data)
   * Uses cache if data is fresh (< 5 minutes old)
   */
  const loadCapabilities = useCallback(async (forceRefresh = false) => {
    const currentToken = useAuthStore.getState().token;
    if (!currentToken) return;

    const actions = getStoreActions();
    const state = useServicesStore.getState();

    // Check cache (5 minute TTL)
    const cacheAge = state.capabilitiesFetchedAt ? Date.now() - state.capabilitiesFetchedAt : Infinity;
    if (!forceRefresh && state.capabilities && cacheAge < 5 * 60 * 1000) {
      if (DEBUG) {
        console.log('[useServices] Using cached capabilities (age:', Math.round(cacheAge / 1000), 's)');
      }
      return state.capabilities;
    }

    actions.setLoadingCapabilities(true);

    try {
      const capabilities = await integrationsClient.getCapabilities();
      actions.setCapabilities(capabilities);
      return capabilities;
    } catch (error) {
      console.error('[useServices] Failed to load capabilities:', error);
      return null;
    } finally {
      actions.setLoadingCapabilities(false);
    }
  }, []);

  // ===========================================================================
  // Logging Service with Streaming
  // ===========================================================================

  const initLogging = useCallback(async () => {
    const currentToken = useAuthStore.getState().token;
    if (!currentToken) return;

    const actions = getStoreActions();
    actions.setLoadingLogging(true);
    actions.setLoggingError(null);

    try {
      // Initial data fetch - get recent logs to populate state before streaming
      const [streams, stats, initialLogs] = await Promise.all([
        loggingStreamClient.getLogStreams(),
        loggingStreamClient.getStats(),
        loggingStreamClient.getRecentLogs({ limit: 100 }),
      ]);

      actions.setLogStreams(streams);
      actions.setLoggingStats(stats);
      // Set initial logs
      actions.setRecentLogs(initialLogs);

      if (DEBUG) {
        console.log('[useServices] Initial logs loaded:', initialLogs.length);
      }

      // Subscribe to live log updates - use addLogs to merge new logs with existing
      const logsSubscriptionId = loggingStreamClient.subscribeLogs(
        (logs) => {
          if (DEBUG) {
            console.log('[useServices] SSE received logs batch:', logs.length);
          }
          // Use addLogs to merge, not setRecentLogs which replaces
          getStoreActions().addLogs(logs);
        },
        { limit: 100, intervalMs: loggingPollInterval }
      );
      subscriptionsRef.current.push(logsSubscriptionId);
      actions.addSubscription(logsSubscriptionId);

      // Subscribe to stats updates
      const statsSubscriptionId = loggingStreamClient.subscribeStats(
        (stats) => getStoreActions().setLoggingStats(stats),
        loggingPollInterval * 2 // Stats update less frequently
      );
      subscriptionsRef.current.push(statsSubscriptionId);
      actions.addSubscription(statsSubscriptionId);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to initialize logging';
      actions.setLoggingError(message);
    } finally {
      actions.setLoadingLogging(false);
    }
  }, [loggingPollInterval]);

  // ===========================================================================
  // Cleanup
  // ===========================================================================

  const cleanupPolling = useCallback(() => {
    // Unsubscribe from all polling subscriptions (org-dependent)
    for (const id of subscriptionsRef.current) {
      pollingManager.unsubscribe(id);
      getStoreActions().removeSubscription(id);
    }
    subscriptionsRef.current = [];
  }, []);

  const cleanupNetwork = useCallback(() => {
    // Only disconnect network socket - called on logout
    disconnectNetwork();
  }, [disconnectNetwork]);

  // ===========================================================================
  // Refresh Functions
  // ===========================================================================

  const refreshAssistants = useCallback(() => {
    loadAssistantsData();
  }, [loadAssistantsData]);

  const refreshIntegrations = useCallback(() => {
    loadIntegrationsData();
  }, [loadIntegrationsData]);

  const refreshCapabilities = useCallback(() => {
    return loadCapabilities(true); // Force refresh
  }, [loadCapabilities]);

  const refreshNetwork = useCallback(async () => {
    const actions = getStoreActions();
    actions.setNetworkPermissionError(null);
    try {
      const topology = await networkClient.getTopology();
      actions.setNetworkTopology(topology);
    } catch (error) {
      if (DEBUG) {
        console.error('[useServices] Failed to refresh topology:', error);
      }
      if (error instanceof NetworkPermissionError) {
        actions.setNetworkPermissionError({
          operation: error.operation,
          requiredPermission: error.requiredPermission,
          message: error.message,
        });
      }
    }
  }, []);

  // ===========================================================================
  // Effect: Initialize org-independent services (network, logging) once
  // ===========================================================================

  useEffect(() => {
    if (!token) {
      // On logout: cleanup both polling and network
      cleanupPolling();
      cleanupNetwork();
      networkInitializedRef.current = false;
      return;
    }

    // Initialize network/logging once per token (org-independent)
    if (!networkInitializedRef.current) {
      networkInitializedRef.current = true;

      if (enableNetwork) {
        connectNetwork();
      }

      if (enableLogging) {
        initLogging();
      }
    }

    // On component unmount: only cleanup polling, NOT network
    // Network stays connected as long as user is logged in
    return () => {
      cleanupPolling();
      // NOTE: Do NOT disconnect network here - it's shared across components
      // Network is only disconnected on logout (when token becomes null)
    };
  }, [token]); // Only depend on token, not orgId

  // ===========================================================================
  // Effect: Initialize org-dependent services when orgId changes
  // ===========================================================================

  useEffect(() => {
    if (!token || !orgId) return;

    // Only reload if orgId actually changed
    if (orgId !== lastOrgIdRef.current) {
      lastOrgIdRef.current = orgId;

      if (DEBUG) {
        console.log('[useServices] OrgId changed, loading org-dependent services', {
          orgId,
          enableAssistants,
          enableIntegrations,
        });
      }

      if (enableAssistants) {
        loadAssistantsData();
      }

      if (enableIntegrations) {
        loadIntegrationsData();
      }
    }
  }, [token, orgId, enableAssistants, enableIntegrations, loadAssistantsData, loadIntegrationsData]);

  // ===========================================================================
  // Return API
  // ===========================================================================

  return {
    // State
    ...store,

    // Loading states
    isLoading:
      store.isLoadingAssistants ||
      store.isLoadingNetwork ||
      store.isLoadingIntegrations ||
      store.isLoadingLogging ||
      store.isLoadingCapabilities,

    // Connection status
    isNetworkConnected: store.networkConnectionStatus === 'connected',

    // Refresh functions
    refreshAssistants,
    refreshIntegrations,
    refreshNetwork,
    refreshCapabilities,

    // Capabilities helpers
    loadCapabilities,

    // Cleanup (for manual cleanup if needed - typically not required)
    cleanup: cleanupPolling,
  };
}

/**
 * Lightweight hook for just Assistants service
 */
export function useAssistants() {
  return useServices({
    enableAssistants: true,
    enableNetwork: false,
    enableIntegrations: false,
    enableLogging: false,
  });
}

/**
 * Lightweight hook for just Network service
 */
export function useNetwork(options?: { enableEventStream?: boolean }) {
  return useServices({
    enableAssistants: false,
    enableNetwork: true,
    enableIntegrations: false,
    enableLogging: false,
    networkEventStream: options?.enableEventStream,
  });
}

/**
 * Lightweight hook for just Integrations service
 */
export function useIntegrations() {
  return useServices({
    enableAssistants: false,
    enableNetwork: false,
    enableIntegrations: true,
    enableLogging: false,
  });
}

/**
 * Lightweight hook for just Logging service with streaming
 */
export function useLogging(options?: { pollInterval?: number }) {
  return useServices({
    enableAssistants: false,
    enableNetwork: false,
    enableIntegrations: false,
    enableLogging: true,
    loggingPollInterval: options?.pollInterval || 5000,
  });
}
