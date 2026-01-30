export type TriggerType = 
  | 'message.received'
  | 'conversation.created'
  | 'conversation.updated'
  | 'handoff.requested'
  | 'handoff.completed'
  | 'context.updated'
  | 'timer.elapsed'
  | 'custom';

export type ActionType =
  | 'llm.invoke'
  | 'handoff.create'
  | 'handoff.assign'
  | 'handoff.resolve'
  | 'message.send'
  | 'notify'
  | 'context.update'
  | 'state.transition'
  | 'webhook.call'
  | 'service.call'
  // Orchestration actions
  | 'wait'           // Delay execution for a specified duration
  | 'parallel'       // Execute multiple actions concurrently
  | 'condition'      // Conditional branching within actions
  | 'loop'           // Iterate over a collection
  // Coordinator actions
  | 'assistant.route'      // Silently route message to another assistant (LLM-based)
  | 'embedding.route'      // Fast semantic routing using embeddings
  // Tool actions
  | 'tool.invoke'         // Invoke a built-in tool (math, convert, etc.)
  // Code agent actions
  | 'code.tool.invoke'    // Invoke a code tool (file ops, bash, search)
  | 'workspace.create'    // Create an isolated workspace
  | 'workspace.destroy'   // Destroy a workspace
  // Integration actions
  | 'integration.invoke'  // Invoke any integration operation by namespace path
  // Embedding actions
  | 'embedding.create'    // Create embeddings for text
  | 'embedding.search'    // Search by semantic similarity
  | 'custom';

export type ConversationState =
  | 'idle'
  | 'ai_active'
  | 'waiting_for_user'
  | 'handoff_pending'
  | 'agent_active'
  | 'resolved'
  | 'archived';

export type ConditionOperator =
  | 'eq'
  | 'neq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'contains'
  | 'not_contains'
  | 'starts_with'
  | 'ends_with'
  | 'matches'
  | 'not_matches'
  | 'in'
  | 'not_in'
  | 'exists'
  | 'not_exists';

export interface Condition {
  field: string;
  operator: ConditionOperator;
  value: unknown;
}

export interface ConditionGroup {
  logic: 'and' | 'or';
  conditions: (Condition | ConditionGroup)[];
}

export interface ActionConfig {
  type: ActionType;
  params: Record<string, unknown>;
}

export interface Rule {
  id: string;
  name: string;
  description?: string;
  priority: number;
  enabled: boolean;
  trigger: TriggerType;
  conditions: ConditionGroup;
  actions: ActionConfig[];
  metadata?: Record<string, unknown>;
}

export interface RuleSet {
  id: string;
  orgId: string;
  name: string;
  description?: string;
  rules: Rule[];
  version: number;
  isActive: boolean;
  /**
   * LLM and embedding configuration for this assistant.
   * If not specified, uses org-level or system defaults.
   * Individual actions can override specific settings.
   */
  llmConfig?: AssistantLLMConfigRef;
}

/**
 * Reference to LLM configuration - can be inline or reference a preset
 */
export interface AssistantLLMConfigRef {
  /** Use a predefined configuration preset */
  preset?: 'routing' | 'conversational' | 'code' | 'reasoning' | 'custom';
  /** Inline configuration overrides (merged with preset if specified) */
  overrides?: {
    // Generation settings
    generation?: {
      model?: string;
      temperature?: number;
      maxTokens?: number;
      topP?: number;
      topK?: number;
      frequencyPenalty?: number;
      presencePenalty?: number;
      stop?: string[];
      seed?: number;
      responseFormat?: 'text' | 'json' | 'json_schema';
      jsonSchema?: Record<string, unknown>;
      reasoningEffort?: 'none' | 'low' | 'medium' | 'high' | 'xhigh';
    };
    // Embedding settings
    embedding?: {
      provider?: string;
      model?: string;
      dimensions?: number;
    };
    // Routing settings (for coordinator-type assistants)
    routing?: {
      strategy?: 'embedding' | 'llm' | 'hybrid' | 'rules';
      similarityThreshold?: number;
      confidenceThreshold?: number;
    };
    // Safety settings
    safety?: {
      contentFilterLevel?: 'none' | 'low' | 'medium' | 'high';
      piiDetection?: boolean;
      promptInjectionProtection?: boolean;
    };
    // Reliability settings
    reliability?: {
      timeoutMs?: number;
      maxRetries?: number;
      enableFallback?: boolean;
    };
    // Context settings
    context?: {
      maxContextTokens?: number;
      truncationStrategy?: 'oldest_first' | 'summarize' | 'sliding_window';
      enableRollingContext?: boolean;
    };
  };
}

export interface ExecutionContext {
  orgId: string;
  conversationId: string;
  conversationState: ConversationState;
  trigger: TriggerType;
  event: EventPayload;
  message?: MessageContext;
  user?: UserContext;
  context: Record<string, unknown>;
  metadata: Record<string, unknown>;
  catalog?: {
    resources?: Record<string, unknown>[];
  };
  /**
   * Resolved LLM configuration for the current assistant.
   * This is the merged result of preset + overrides + org defaults.
   * Actions should use this config unless they have explicit overrides.
   */
  llmConfig?: ResolvedLLMConfig;
  /**
   * Assistant metadata for routing decisions
   */
  assistant?: {
    key: string;
    name: string;
    alias?: string;
  };
}

/**
 * Resolved LLM configuration (fully populated with defaults)
 */
export interface ResolvedLLMConfig {
  // Provider
  provider: {
    type: string;
    baseUrl?: string;
  };
  // Generation
  generation: {
    model: string;
    temperature: number;
    maxTokens: number;
    topP?: number;
    topK?: number;
    frequencyPenalty?: number;
    presencePenalty?: number;
    stop?: string[];
    seed?: number;
    responseFormat: 'text' | 'json' | 'json_schema';
    jsonSchema?: Record<string, unknown>;
    reasoningEffort?: 'none' | 'low' | 'medium' | 'high' | 'xhigh';
  };
  // Embedding
  embedding?: {
    provider: string;
    model: string;
    dimensions?: number;
    normalize: boolean;
  };
  // Routing
  routing?: {
    strategy: 'embedding' | 'llm' | 'hybrid' | 'rules';
    similarityThreshold: number;
    confidenceThreshold: number;
    cacheEmbeddings: boolean;
  };
  // Safety
  safety: {
    contentFilterLevel: 'none' | 'low' | 'medium' | 'high';
    piiDetection: boolean;
    promptInjectionProtection: boolean;
  };
  // Reliability
  reliability: {
    timeoutMs: number;
    maxRetries: number;
    enableFallback: boolean;
    fallbackModels?: Array<{ provider: string; model: string }>;
  };
  // Context
  context: {
    maxContextTokens: number;
    reserveForResponse: number;
    truncationStrategy: 'oldest_first' | 'summarize' | 'sliding_window';
    enableRollingContext: boolean;
  };
  // Observability
  observability: {
    logLevel: 'debug' | 'info' | 'warn' | 'error';
    logTokenUsage: boolean;
    logLatency: boolean;
  };
}

export interface EventPayload {
  id: string;
  type: TriggerType;
  timestamp: string;
  data: Record<string, unknown>;
}

export interface MessageContext {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'agent';
  content: string;
  metadata?: Record<string, unknown>;
}

export interface UserContext {
  id: string;
  externalId?: string;
  email?: string;
  displayName?: string;
  metadata?: Record<string, unknown>;
}

export interface ActionResult {
  success: boolean;
  actionType: ActionType;
  output?: unknown;
  error?: string;
  durationMs: number;
}

export interface RuleExecutionResult {
  ruleId: string;
  ruleName: string;
  matched: boolean;
  conditionsEvaluated: boolean;
  actionsExecuted: ActionResult[];
  error?: string;
  durationMs: number;
}

export interface RunResult {
  runId: string;
  orgId: string;
  conversationId: string;
  trigger: TriggerType;
  rulesEvaluated: number;
  rulesMatched: number;
  results: RuleExecutionResult[];
  newState?: ConversationState;
  durationMs: number;
  timestamp: string;
}

export interface ExecutionStrategy {
  execute(context: ExecutionContext, ruleSet: RuleSet): Promise<RunResult>;
}
