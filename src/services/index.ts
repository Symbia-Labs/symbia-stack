/**
 * Services Index
 *
 * Central export point for all Symbia Control Center service clients.
 * Provides unified access to platform APIs with real-time capabilities.
 */

// Platform & Catalog
export { platformClient, type ServiceHealth, type ServiceStats, type CatalogResource } from './platformClient';

// Identity
export { identityClient } from './identityClient';

// Messaging
export {
  messagingBridge,
  connectSocket,
  disconnectSocket,
  getSocket,
  joinConversation,
  leaveConversation,
  sendSocketMessage,
  startTyping,
  stopTyping,
  sendSocketControl,
  type CreateConversationParams,
  type SendMessageParams,
  type ControlEventParams,
  type SocketEventHandlers,
} from './messagingBridge';

// Assistants
export {
  assistantsClient,
  type Graph,
  type Actor,
  type Run,
  type RunLog,
  type RunStatus,
  type CreateGraphParams,
  type UpdateGraphParams,
  type CreateActorParams,
  type UpdateActorParams,
} from './assistantsClient';

// Integrations
export {
  integrationsClient,
  type Provider,
  type ProviderConfig,
  type ProviderName,
  type OperationType,
  type ModelInfo,
  type ChatMessage,
  type ExecuteParams,
  type ExecuteResponse,
  type NormalizedLLMResponse,
  type NormalizedEmbeddingResponse,
  type TokenUsage,
  type ProviderStatus,
} from './integrationsClient';

// Network
export {
  networkClient,
  connectNetworkSocket,
  disconnectNetworkSocket,
  getNetworkSocket,
  requestTopology,
  subscribeToSDNEvents,
  unsubscribeFromSDNEvents,
  type NetworkNode,
  type NodeContract,
  type NetworkBridge,
  type NetworkTopology,
  type SandboxEvent,
  type EventTrace,
  type TraceHop,
  type NetworkEventHandlers,
} from './networkClient';

// Logging (streaming)
export {
  loggingStreamClient,
  pollingManager,
  type LogStream,
  type LogEntry,
  type MetricDefinition,
  type DataPoint,
  type Trace,
  type Span,
  type LogsQuery,
  type MetricsQuery,
  type TracesQuery,
  type LoggingStats,
  type LogInsight,
  type LogAnalysis,
} from './loggingStreamClient';

// Legacy Logging Client & Telemetry
export {
  loggingClient,
  telemetry,
  type LogEntry as LegacyLogEntry,
  type LogStream as LegacyLogStream,
  type LoggingStats as LegacyLoggingStats,
  type LogQueryParams,
  type MetricQueryParams,
} from './loggingClient';
