import type {
  TriggerType,
  ExecutionContext,
  RuleSet,
  RunResult,
  ConversationState,
  MessageContext,
  UserContext,
} from './types.js';
import { ruleExecutor } from './rule-executor.js';

export interface IncomingEvent {
  type: TriggerType;
  orgId: string;
  conversationId: string;
  data: Record<string, unknown>;
  message?: MessageContext;
  user?: UserContext;
  metadata?: Record<string, unknown>;
  /** Catalog snapshot injected by webhooks so rules can resolve @catalog refs. */
  catalog?: { resources?: Record<string, unknown>[] };
}

export interface RunCoordinatorConfig {
  getRuleSet: (orgId: string) => Promise<RuleSet | null>;
  getConversationState: (conversationId: string) => Promise<ConversationState>;
  saveConversationState: (conversationId: string, state: ConversationState) => Promise<void>;
  getConversationContext: (conversationId: string) => Promise<Record<string, unknown>>;
  saveConversationContext: (conversationId: string, context: Record<string, unknown>) => Promise<void>;
  saveRunResult: (result: RunResult) => Promise<void>;
}

export class RunCoordinator {
  private config: RunCoordinatorConfig;
  
  constructor(config: RunCoordinatorConfig) {
    this.config = config;
  }
  
  async processEvent(event: IncomingEvent): Promise<RunResult> {
    const ruleSet = await this.config.getRuleSet(event.orgId);
    
    if (!ruleSet || !ruleSet.isActive) {
      return {
        runId: crypto.randomUUID(),
        orgId: event.orgId,
        conversationId: event.conversationId,
        trigger: event.type,
        rulesEvaluated: 0,
        rulesMatched: 0,
        results: [],
        durationMs: 0,
        timestamp: new Date().toISOString(),
      };
    }
    
    const conversationState = await this.config.getConversationState(event.conversationId);
    const conversationContext = await this.config.getConversationContext(event.conversationId);
    
    const executionContext: ExecutionContext = {
      orgId: event.orgId,
      conversationId: event.conversationId,
      conversationState,
      trigger: event.type,
      event: {
        id: crypto.randomUUID(),
        type: event.type,
        timestamp: new Date().toISOString(),
        data: event.data,
      },
      message: event.message,
      user: event.user,
      context: conversationContext,
      metadata: event.metadata || {},
      // THE LINE THAT MAKES LLM CONFIGURATION REAL.
      //
      // `ExecutionContext.llmConfig` has been declared since January and was
      // never assigned here — this is the only place every ExecutionContext in
      // the codebase is built, so "never assigned here" means never assigned at
      // all. Everything downstream that consulted it was therefore reading
      // `undefined` and silently taking its fallback path.
      //
      // Resolved at load time and carried on the ruleset, so this is a
      // reference copy rather than work repeated per message.
      llmConfig: ruleSet.resolvedLLMConfig,
    };
    
    const result = await ruleExecutor.execute(executionContext, ruleSet);
    
    if (result.newState) {
      await this.config.saveConversationState(event.conversationId, result.newState);
    }
    
    const contextUpdates = this.extractContextUpdates(result);
    if (Object.keys(contextUpdates).length > 0) {
      const merged = { ...conversationContext, ...contextUpdates };
      await this.config.saveConversationContext(event.conversationId, merged);
    }
    
    await this.config.saveRunResult(result);
    
    return result;
  }
  
  private extractContextUpdates(result: RunResult): Record<string, unknown> {
    const updates: Record<string, unknown> = {};
    
    for (const ruleResult of result.results) {
      for (const action of ruleResult.actionsExecuted) {
        if (action.actionType === 'context.update' && action.success && action.output) {
          const output = action.output as { newContext?: Record<string, unknown> };
          if (output.newContext) {
            Object.assign(updates, output.newContext);
          }
        }
      }
    }
    
    return updates;
  }
}

const inMemoryState: Record<string, ConversationState> = {};
const inMemoryContext: Record<string, Record<string, unknown>> = {};
const inMemoryRuleSets: Record<string, RuleSet> = {};
const inMemoryRuns: RunResult[] = [];

export const defaultCoordinator = new RunCoordinator({
  getRuleSet: async (orgId) => {
    // Try org-specific rules first
    if (inMemoryRuleSets[orgId]) {
      return inMemoryRuleSets[orgId];
    }
    // Fall back to default org rules (e.g., "log-analyst:org_123" -> "log-analyst:default")
    const [assistantKey] = orgId.split(':');
    const defaultKey = `${assistantKey}:default`;
    return inMemoryRuleSets[defaultKey] || null;
  },
  getConversationState: async (conversationId) => inMemoryState[conversationId] || 'idle',
  saveConversationState: async (conversationId, state) => {
    inMemoryState[conversationId] = state;
  },
  getConversationContext: async (conversationId) => inMemoryContext[conversationId] || {},
  saveConversationContext: async (conversationId, context) => {
    inMemoryContext[conversationId] = context;
  },
  saveRunResult: async (result) => {
    inMemoryRuns.push(result);
  },
});

export function setRuleSet(orgId: string, ruleSet: RuleSet): void {
  inMemoryRuleSets[orgId] = ruleSet;
}

export function getRuns(): RunResult[] {
  return [...inMemoryRuns];
}

export function clearRuns(): void {
  inMemoryRuns.length = 0;
}
