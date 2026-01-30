/**
 * Base Assistant Template
 *
 * This module provides the standard interface and base class for building
 * assistants in the Symbia Assistants service. All assistants should extend
 * BaseAssistant to ensure consistency and enable automatic discovery.
 *
 * @example
 * ```typescript
 * import { BaseAssistant, AssistantCapability } from './base.js';
 *
 * class MyAssistant extends BaseAssistant {
 *   readonly key = 'my-assistant';
 *   readonly name = 'My Assistant';
 *   readonly description = 'Does something useful';
 *   readonly capabilities: AssistantCapability[] = [
 *     { name: 'data.query', description: 'Query data from service' },
 *     { name: 'data.analyze', description: 'Analyze queried data' },
 *   ];
 *
 *   protected async processMessage(payload: MessagePayload, orgId: string): Promise<AssistantResponse> {
 *     // Your logic here
 *   }
 * }
 *
 * export default new MyAssistant().createRouter();
 * ```
 */

import { Router, Request, Response } from 'express';
import { getLoadedAssistant, type AssistantConfig } from '../../services/assistant-loader.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Incoming message from the Messaging mesh
 */
export interface MessagePayload {
  conversationId: string;
  messageId: string;
  content: string;
  contentType: 'text' | 'markdown' | 'json' | 'html' | 'event';
  senderId: string;
  senderType: 'user' | 'agent' | 'service' | 'actor';
  metadata?: Record<string, unknown>;
  runId?: string;
  traceId?: string;
}

/**
 * Response from assistant back to the Messaging mesh
 */
export interface AssistantResponse {
  conversationId: string;
  replyTo?: string;
  content: string;
  contentType: 'text' | 'markdown' | 'json';
  metadata?: Record<string, unknown>;
}

/**
 * Capability declaration for an assistant
 */
export interface AssistantCapability {
  name: string;
  description: string;
  parameters?: Record<string, {
    type: string;
    description: string;
    required?: boolean;
  }>;
}

/**
 * Health check result
 */
export interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  dependencies: Record<string, {
    status: 'connected' | 'degraded' | 'unreachable';
    endpoint?: string;
    latencyMs?: number;
  }>;
}

/**
 * Query parameters for direct API access
 */
export interface QueryParams {
  [key: string]: unknown;
}

/**
 * Query result from direct API
 */
export interface QueryResult<T = unknown> {
  data: T;
  analysis?: {
    summary: string;
    insights: string[];
    anomalies: string[];
    recommendations: string[];
  };
  meta: {
    count: number;
    query: QueryParams;
    executionMs: number;
  };
}

// ============================================================================
// Base Assistant Class
// ============================================================================

/**
 * Base class for all assistants.
 *
 * Extend this class to create a new assistant. You must implement:
 * - `key`: Unique identifier (used in URLs)
 * - `name`: Human-readable name
 * - `description`: What the assistant does
 * - `capabilities`: List of capabilities
 * - `processMessage()`: Handle incoming chat messages
 *
 * Optionally override:
 * - `handleQuery()`: Direct programmatic queries
 * - `getSummary()`: Generate activity summary
 * - `checkHealth()`: Custom health checks
 * - `getServiceEndpoint()`: Resolve service endpoints
 */
export abstract class BaseAssistant {
  /** Unique key for this assistant (used in URLs: /api/assistants/{key}) */
  abstract readonly key: string;

  /** Human-readable name */
  abstract readonly name: string;

  /** Description of what this assistant does */
  abstract readonly description: string;

  /** Declared capabilities */
  abstract readonly capabilities: AssistantCapability[];

  /** Default service endpoints (can be overridden by Catalog config) */
  protected serviceEndpoints: Record<string, string> = {};

  // ==========================================================================
  // Core Methods (must implement processMessage)
  // ==========================================================================

  /**
   * Process an incoming message from the Messaging mesh.
   * This is the main entry point for chat-based interactions.
   *
   * @param payload - The incoming message payload
   * @param orgId - Organization ID for multi-tenant isolation
   * @returns Response to send back to the conversation
   */
  protected abstract processMessage(
    payload: MessagePayload,
    orgId: string
  ): Promise<AssistantResponse>;

  /**
   * Handle a direct query (programmatic API access).
   * Override this to support direct queries outside of chat.
   *
   * @param params - Query parameters
   * @param orgId - Organization ID
   * @returns Query result with data and optional analysis
   */
  protected async handleQuery(
    params: QueryParams,
    orgId: string
  ): Promise<QueryResult> {
    return {
      data: null,
      meta: {
        count: 0,
        query: params,
        executionMs: 0,
      },
    };
  }

  /**
   * Generate a summary of recent activity.
   * Override this to provide summary endpoints.
   *
   * @param hours - Number of hours to summarize
   * @param orgId - Organization ID
   * @returns Summary with analysis
   */
  protected async getSummary(
    hours: number,
    orgId: string
  ): Promise<QueryResult> {
    return this.handleQuery({ hours }, orgId);
  }

  /**
   * Check health of this assistant and its dependencies.
   * Override to add custom health checks.
   */
  protected async checkHealth(): Promise<HealthCheckResult> {
    return {
      status: 'healthy',
      dependencies: {},
    };
  }

  // ==========================================================================
  // Configuration Helpers
  // ==========================================================================

  /**
   * Get the loaded configuration from Catalog (if available)
   */
  protected getConfig(): AssistantConfig | undefined {
    return getLoadedAssistant(this.key)?.config;
  }

  /**
   * Get a service endpoint with fallback chain:
   * 1. Catalog-loaded serviceConfig
   * 2. Environment variable
   * 3. Default from serviceEndpoints
   *
   * @param name - Endpoint name (e.g., 'logging', 'identity')
   * @param envVar - Environment variable to check
   * @param defaultValue - Fallback default
   */
  protected getServiceEndpoint(
    name: string,
    envVar?: string,
    defaultValue?: string
  ): string | undefined {
    // 1. Check Catalog config
    const config = this.getConfig();
    const catalogValue = config?.serviceConfig?.[`${name}Endpoint`] as string | undefined;
    if (catalogValue) return catalogValue;

    // 2. Check environment
    if (envVar && process.env[envVar]) {
      return process.env[envVar];
    }

    // 3. Check instance defaults
    if (this.serviceEndpoints[name]) {
      return this.serviceEndpoints[name];
    }

    // 4. Return provided default
    return defaultValue;
  }

  /**
   * Get the org ID from request headers with fallback
   */
  protected getOrgId(req: Request, fallback = 'default-org'): string {
    return (req.headers['x-org-id'] as string) || fallback;
  }

  // ==========================================================================
  // Analysis Helpers
  // ==========================================================================

  /**
   * Standard analysis structure for processed data.
   * Use this to ensure consistent analysis output across assistants.
   */
  protected createAnalysis(
    data: unknown[],
    options?: {
      countBy?: string;
      errorField?: string;
      errorThreshold?: number;
    }
  ): {
    summary: string;
    insights: string[];
    anomalies: string[];
    recommendations: string[];
  } {
    const insights: string[] = [];
    const anomalies: string[] = [];
    const recommendations: string[] = [];

    // Default analysis: count and error rate
    const count = Array.isArray(data) ? data.length : 0;

    if (options?.errorField && Array.isArray(data)) {
      const errors = data.filter(item =>
        (item as Record<string, unknown>)[options.errorField!] === 'error' ||
        (item as Record<string, unknown>)[options.errorField!] === 'fatal'
      );
      const errorRate = count > 0 ? (errors.length / count) * 100 : 0;
      const threshold = options.errorThreshold ?? 5;

      if (errorRate > threshold) {
        anomalies.push(`High error rate: ${errorRate.toFixed(1)}%`);
        recommendations.push('Investigate error sources');
      }
    }

    const summary = count === 0
      ? 'No data found for the specified criteria.'
      : `Analyzed ${count} item(s).`;

    return { summary, insights, anomalies, recommendations };
  }

  /**
   * Format analysis as markdown for chat responses
   */
  protected formatAnalysisAsMarkdown(
    title: string,
    analysis: ReturnType<typeof this.createAnalysis>,
    dataCount: number
  ): string {
    const parts: string[] = [];

    parts.push(`## ${title}\n`);
    parts.push(analysis.summary);
    parts.push('');

    if (analysis.insights.length > 0) {
      parts.push('### Insights');
      analysis.insights.forEach(i => parts.push(`- ${i}`));
      parts.push('');
    }

    if (analysis.anomalies.length > 0) {
      parts.push('### Anomalies');
      analysis.anomalies.forEach(a => parts.push(`- ⚠️ ${a}`));
      parts.push('');
    }

    if (analysis.recommendations.length > 0) {
      parts.push('### Recommendations');
      analysis.recommendations.forEach(r => parts.push(`- ${r}`));
    }

    if (dataCount === 0) {
      parts.push('\n*No data found for the specified criteria.*');
    }

    return parts.join('\n');
  }

  // ==========================================================================
  // Router Factory
  // ==========================================================================

  /**
   * Create an Express router with standard endpoints.
   * Call this and export as default to register the assistant.
   *
   * Standard endpoints:
   * - GET / - Assistant info
   * - GET /health - Health check
   * - POST /message - Incoming message handler
   * - POST /query - Direct query endpoint
   * - GET /summary - Activity summary
   */
  createRouter(): Router {
    const router = Router();

    // GET / - Assistant info
    router.get('/', async (req: Request, res: Response) => {
      const loaded = getLoadedAssistant(this.key);

      if (loaded?.config) {
        return res.json({
          principalId: loaded.config.principalId,
          principalType: loaded.config.principalType,
          name: loaded.resource.name,
          description: loaded.resource.description,
          capabilities: this.capabilities,
          endpoints: {
            message: `/api/assistants/${this.key}/message`,
            query: `/api/assistants/${this.key}/query`,
            summary: `/api/assistants/${this.key}/summary`,
            health: `/api/assistants/${this.key}/health`,
          },
          source: loaded.resource.status === 'local' ? 'local' : 'catalog',
          resourceId: loaded.resource.id,
        });
      }

      res.json({
        principalId: `assistant:${this.key}`,
        principalType: 'assistant',
        name: this.name,
        description: this.description,
        capabilities: this.capabilities,
        endpoints: {
          message: `/api/assistants/${this.key}/message`,
          query: `/api/assistants/${this.key}/query`,
          summary: `/api/assistants/${this.key}/summary`,
          health: `/api/assistants/${this.key}/health`,
        },
        source: 'default',
      });
    });

    // GET /health - Health check
    router.get('/health', async (_req: Request, res: Response) => {
      try {
        const health = await this.checkHealth();
        const loaded = getLoadedAssistant(this.key);

        res.json({
          ...health,
          assistant: this.key,
          source: loaded
            ? (loaded.resource.status === 'local' ? 'local' : 'catalog')
            : 'default',
        });
      } catch (error) {
        res.status(500).json({
          status: 'unhealthy',
          assistant: this.key,
          error: error instanceof Error ? error.message : 'Health check failed',
        });
      }
    });

    // POST /message - Handle incoming message
    router.post('/message', async (req: Request, res: Response) => {
      try {
        const payload: MessagePayload = req.body;
        const orgId = this.getOrgId(req);

        console.log(`[${this.name}] Received message: ${payload.content?.substring(0, 100)}`);

        const response = await this.processMessage(payload, orgId);
        res.json(response);
      } catch (error) {
        console.error(`[${this.name}] Error processing message:`, error);
        res.status(500).json({
          error: 'Failed to process message',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });

    // POST /query - Direct query
    router.post('/query', async (req: Request, res: Response) => {
      try {
        const orgId = this.getOrgId(req);
        const params: QueryParams = req.body;
        const start = Date.now();

        const result = await this.handleQuery(params, orgId);
        result.meta.executionMs = Date.now() - start;

        res.json(result);
      } catch (error) {
        console.error(`[${this.name}] Query error:`, error);
        res.status(500).json({
          error: 'Query failed',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });

    // GET /summary - Activity summary
    router.get('/summary', async (req: Request, res: Response) => {
      try {
        const orgId = this.getOrgId(req);
        const hours = parseInt(req.query.hours as string) || 1;
        const start = Date.now();

        const result = await this.getSummary(hours, orgId);
        result.meta.executionMs = Date.now() - start;

        res.json(result);
      } catch (error) {
        console.error(`[${this.name}] Summary error:`, error);
        res.status(500).json({
          error: 'Summary failed',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });

    return router;
  }
}

// ============================================================================
// Intent Parsing Helper (for simple rule-based parsing)
// ============================================================================

/**
 * Simple intent parser for message content.
 * Use this for basic keyword matching; for production, use LLM-based intent parsing.
 */
export function parseIntent(
  content: string,
  intents: Record<string, string[]>
): { intent: string | null; confidence: number } {
  const lower = content.toLowerCase();

  for (const [intent, keywords] of Object.entries(intents)) {
    const matches = keywords.filter(kw => lower.includes(kw));
    if (matches.length > 0) {
      return {
        intent,
        confidence: Math.min(matches.length / keywords.length, 1),
      };
    }
  }

  return { intent: null, confidence: 0 };
}

/**
 * Extract time range from message content.
 * Returns start/end ISO strings for common phrases like "last hour", "today", etc.
 */
export function parseTimeRange(
  content: string
): { startTime?: string; endTime?: string } {
  const lower = content.toLowerCase();
  const now = new Date();

  if (lower.includes('last hour') || lower.includes('recent')) {
    return {
      startTime: new Date(now.getTime() - 60 * 60 * 1000).toISOString(),
      endTime: now.toISOString(),
    };
  }

  if (lower.includes('last day') || lower.includes('today') || lower.includes('24 hour')) {
    return {
      startTime: new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(),
      endTime: now.toISOString(),
    };
  }

  if (lower.includes('last week') || lower.includes('7 day')) {
    return {
      startTime: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      endTime: now.toISOString(),
    };
  }

  return {};
}
