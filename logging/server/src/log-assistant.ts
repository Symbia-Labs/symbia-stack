import type { LogEntry } from "@shared/schema";
import { createTelemetryClient, type TelemetryClient } from "@symbia/logging-client";
import { executeChat, getIntegrationsStatus, type ChatMessage } from "./integrations-client.js";

// LLM call telemetry for observability
let telemetry: TelemetryClient | null = null;
try {
  telemetry = createTelemetryClient({
    serviceId: "log-assistant",
    endpoint: process.env.TELEMETRY_ENDPOINT,
  });
} catch {
  // Telemetry optional
}

// Verbose logging flag - enable via environment variable
const VERBOSE_TELEMETRY = process.env.LOG_ASSISTANT_VERBOSE === "true" || process.env.NODE_ENV === "development";

function logVerbose(category: string, message: string, data?: Record<string, unknown>) {
  if (VERBOSE_TELEMETRY) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [LogAssistant:${category}] ${message}`, data ? JSON.stringify(data) : "");
    telemetry?.event(`assistant.${category.toLowerCase()}`, message, data || {}, "debug");
  }
}

export interface LLMCallMetrics {
  provider: string;
  model: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  latencyMs: number;
  success: boolean;
  error?: string;
}

export interface Insight {
  id: string;
  text: string;
  severity: "critical" | "warning" | "info";
  category: "error" | "performance" | "pattern" | "anomaly" | "health";
  /** Search query or filter to find related logs */
  searchHint?: string;
  /** Service(s) this insight relates to */
  services?: string[];
  /** Approximate count of related logs */
  count?: number;
}

export interface AssistantSummary {
  summary: string;
  insights: Insight[];
  errorCount: number;
  warnCount: number;
  patterns?: string[];
}

export interface InvestigationResult {
  insight: string;
  explanation: string;
  relatedLogs: LogEntry[];
  suggestedActions?: string[];
}

export interface ErrorAnalysis {
  summary: string;
  errorMessages: string[];
  possibleCauses: string[];
  suggestedActions: string[];
}

export interface LogGroup {
  id: string;
  name: string;
  pattern: string;
  count: number;
  logIds: string[];
}

interface LLMConfig {
  provider: string;
  model: string;
  temperature: number;
  maxTokens: number;
}

const DEFAULT_CONFIG: LLMConfig = {
  provider: "openai",
  model: "gpt-4o-mini",
  temperature: 0.3,
  maxTokens: 2000,
};

export class LogAssistantService {
  private config: LLMConfig;
  private integrationsAvailable: boolean | null = null;

  constructor() {
    // Configuration for LLM calls through Integrations service
    this.config = {
      provider: process.env.LLM_PROVIDER || DEFAULT_CONFIG.provider,
      model: process.env.LLM_MODEL || DEFAULT_CONFIG.model,
      temperature: parseFloat(process.env.LLM_TEMPERATURE || "") || DEFAULT_CONFIG.temperature,
      maxTokens: parseInt(process.env.LLM_MAX_TOKENS || "") || DEFAULT_CONFIG.maxTokens,
    };

    if (process.env.NODE_ENV === "development") {
      console.log(`[LogAssistant] Initialized (provider: ${this.config.provider}, model: ${this.config.model})`);
      console.log(`[LogAssistant] LLM calls will be routed through Integrations service`);
    }
  }

  /**
   * Check if the Integrations service is available (cached for performance)
   */
  async isConfigured(): Promise<boolean> {
    if (this.integrationsAvailable !== null) {
      return this.integrationsAvailable;
    }

    try {
      const status = await getIntegrationsStatus();
      this.integrationsAvailable = status.available && status.providers.some(p => p.configured);

      if (process.env.NODE_ENV === "development") {
        console.log(`[LogAssistant] Integrations service: ${this.integrationsAvailable ? 'available' : 'unavailable'}`);
      }

      return this.integrationsAvailable;
    } catch {
      this.integrationsAvailable = false;
      return false;
    }
  }

  /**
   * Reset the cached availability check (useful after configuration changes)
   */
  resetAvailabilityCache(): void {
    this.integrationsAvailable = null;
  }

  async summarizeLogs(entries: LogEntry[], authToken?: string): Promise<AssistantSummary> {
    const startTime = Date.now();
    const requestId = `summarize-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    logVerbose("SUMMARIZE", `Starting summarization`, {
      requestId,
      entryCount: entries.length,
      hasAuthToken: !!authToken,
      levels: {
        error: entries.filter(e => e.level === "error" || e.level === "fatal").length,
        warn: entries.filter(e => e.level === "warn").length,
        info: entries.filter(e => e.level === "info").length,
      },
    });

    // Generate local analysis first
    const localSummary = this.generateLocalSummary(entries);

    logVerbose("SUMMARIZE", `Local analysis complete`, {
      requestId,
      localErrorCount: localSummary.errorCount,
      localWarnCount: localSummary.warnCount,
      localInsightCount: localSummary.insights.length,
      localPatternCount: localSummary.patterns?.length || 0,
    });

    // If no auth token, return local analysis (can't call Integrations service)
    if (!authToken) {
      logVerbose("SUMMARIZE", `Returning local-only summary (no auth token)`, {
        requestId,
        durationMs: Date.now() - startTime,
      });
      telemetry?.metric("assistant.summarize.duration", Date.now() - startTime, { mode: "local" });
      return localSummary;
    }

    try {
      const prompt = this.buildSummarizePrompt(entries);
      logVerbose("SUMMARIZE", `Built LLM prompt`, {
        requestId,
        promptLength: prompt.length,
        promptPreview: prompt.substring(0, 200) + "...",
      });

      const response = await this.callLLM(prompt, "summarize", authToken);

      // Parse LLM response and merge with local stats
      const llmSummary = this.parseSummaryResponse(response);

      logVerbose("SUMMARIZE", `LLM response parsed`, {
        requestId,
        hasSummary: !!llmSummary.summary,
        llmInsightCount: llmSummary.insights?.length || 0,
        llmPatternCount: llmSummary.patterns?.length || 0,
      });

      // Prefer LLM insights but fall back to local if LLM returns none
      const insights: Insight[] = llmSummary.insights && llmSummary.insights.length > 0
        ? llmSummary.insights
        : localSummary.insights;

      const result = {
        ...localSummary,
        summary: llmSummary.summary || localSummary.summary,
        insights: insights.slice(0, 5),
        patterns: llmSummary.patterns || localSummary.patterns,
      };

      logVerbose("SUMMARIZE", `Summarization complete`, {
        requestId,
        durationMs: Date.now() - startTime,
        finalInsightCount: result.insights.length,
        usedLLMInsights: llmSummary.insights && llmSummary.insights.length > 0,
      });

      telemetry?.metric("assistant.summarize.duration", Date.now() - startTime, { mode: "llm" });
      telemetry?.metric("assistant.summarize.insights", result.insights.length, {});

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logVerbose("SUMMARIZE", `LLM summarization failed, using local analysis`, {
        requestId,
        error: errorMessage,
        durationMs: Date.now() - startTime,
      });
      telemetry?.event("assistant.summarize.fallback", "LLM failed, using local", { requestId, error: errorMessage }, "warn");
      telemetry?.metric("assistant.summarize.duration", Date.now() - startTime, { mode: "fallback" });
      return localSummary;
    }
  }

  async analyzeErrors(entries: LogEntry[], authToken?: string): Promise<ErrorAnalysis> {
    const startTime = Date.now();
    const requestId = `analyze-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const errorEntries = entries.filter(
      (e) => e.level === "error" || e.level === "fatal"
    );

    logVerbose("ANALYZE", `Starting error analysis`, {
      requestId,
      totalEntries: entries.length,
      errorCount: errorEntries.length,
      hasAuthToken: !!authToken,
    });

    if (errorEntries.length === 0) {
      logVerbose("ANALYZE", `No errors to analyze`, { requestId, durationMs: Date.now() - startTime });
      telemetry?.metric("assistant.analyze.duration", Date.now() - startTime, { result: "no_errors" });
      return {
        summary: "No errors found in the provided logs.",
        errorMessages: [],
        possibleCauses: [],
        suggestedActions: [],
      };
    }

    // Local analysis
    const errorMessages = Array.from(new Set(errorEntries.map((e) => e.message))).slice(0, 10);

    // Group errors by service for telemetry
    const errorsByService = new Map<string, number>();
    errorEntries.forEach(e => {
      const svc = e.serviceId || "unknown";
      errorsByService.set(svc, (errorsByService.get(svc) || 0) + 1);
    });

    logVerbose("ANALYZE", `Error distribution by service`, {
      requestId,
      uniqueMessages: errorMessages.length,
      serviceBreakdown: Object.fromEntries(errorsByService),
    });

    if (!authToken) {
      logVerbose("ANALYZE", `Returning local-only analysis (no auth token)`, {
        requestId,
        durationMs: Date.now() - startTime,
      });
      telemetry?.metric("assistant.analyze.duration", Date.now() - startTime, { mode: "local" });
      return {
        summary: `Found ${errorEntries.length} error(s) in the logs.`,
        errorMessages,
        possibleCauses: ["Unable to determine causes without AI analysis."],
        suggestedActions: ["Review error messages manually.", "Check system logs for more context."],
      };
    }

    try {
      const prompt = this.buildErrorAnalysisPrompt(errorEntries);
      logVerbose("ANALYZE", `Built error analysis prompt`, {
        requestId,
        promptLength: prompt.length,
      });

      const response = await this.callLLM(prompt, "analyzeErrors", authToken);
      const result = this.parseErrorAnalysisResponse(response, errorMessages);

      logVerbose("ANALYZE", `Error analysis complete`, {
        requestId,
        durationMs: Date.now() - startTime,
        possibleCausesCount: result.possibleCauses.length,
        suggestedActionsCount: result.suggestedActions.length,
      });

      telemetry?.metric("assistant.analyze.duration", Date.now() - startTime, { mode: "llm" });
      telemetry?.metric("assistant.analyze.errors", errorEntries.length, {});

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logVerbose("ANALYZE", `LLM error analysis failed`, {
        requestId,
        error: errorMessage,
        durationMs: Date.now() - startTime,
      });
      telemetry?.event("assistant.analyze.fallback", "LLM failed, using local", { requestId, error: errorMessage }, "warn");
      telemetry?.metric("assistant.analyze.duration", Date.now() - startTime, { mode: "fallback" });
      return {
        summary: `Found ${errorEntries.length} error(s) in the logs.`,
        errorMessages,
        possibleCauses: ["LLM analysis unavailable."],
        suggestedActions: ["Review error messages manually."],
      };
    }
  }

  /**
   * Investigate a specific insight - provides deeper analysis and relevant log excerpts
   */
  async investigate(
    insight: Insight,
    entries: LogEntry[],
    allEntries: LogEntry[],
    authToken?: string
  ): Promise<InvestigationResult> {
    const startTime = Date.now();
    const requestId = `investigate-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    logVerbose("INVESTIGATE", `Starting investigation`, {
      requestId,
      insightId: insight.id,
      insightText: insight.text,
      insightSeverity: insight.severity,
      insightCategory: insight.category,
      insightServices: insight.services,
      searchHint: insight.searchHint,
      entriesCount: entries.length,
      allEntriesCount: allEntries.length,
      hasAuthToken: !!authToken,
    });

    // Find logs related to this insight
    let relatedLogs: LogEntry[] = [];
    let matchStrategy = "unknown";

    if (insight.searchHint) {
      // Search by hint
      matchStrategy = "searchHint";
      const hint = insight.searchHint.toLowerCase();
      relatedLogs = allEntries.filter(
        (e) =>
          e.message.toLowerCase().includes(hint) ||
          (e.serviceId && insight.services?.includes(e.serviceId))
      );
      logVerbose("INVESTIGATE", `Matched by searchHint`, {
        requestId,
        hint,
        matchCount: relatedLogs.length,
      });
    } else if (insight.services && insight.services.length > 0) {
      // Filter by service
      matchStrategy = "services";
      relatedLogs = allEntries.filter((e) => insight.services!.includes(e.serviceId || ""));
      logVerbose("INVESTIGATE", `Matched by services`, {
        requestId,
        services: insight.services,
        matchCount: relatedLogs.length,
      });
    } else {
      // Fall back to category-based filtering
      matchStrategy = "category";
      if (insight.category === "error") {
        relatedLogs = allEntries.filter((e) => e.level === "error" || e.level === "fatal");
      } else {
        relatedLogs = entries.slice(0, 20);
      }
      logVerbose("INVESTIGATE", `Matched by category fallback`, {
        requestId,
        category: insight.category,
        matchCount: relatedLogs.length,
      });
    }

    // Limit to most relevant logs
    const originalCount = relatedLogs.length;
    relatedLogs = relatedLogs.slice(0, 15);

    logVerbose("INVESTIGATE", `Related logs selected`, {
      requestId,
      matchStrategy,
      originalMatchCount: originalCount,
      selectedCount: relatedLogs.length,
      truncated: originalCount > 15,
    });

    // If no auth token, return basic result
    if (!authToken) {
      logVerbose("INVESTIGATE", `Returning local-only result (no auth token)`, {
        requestId,
        durationMs: Date.now() - startTime,
      });
      telemetry?.metric("assistant.investigate.duration", Date.now() - startTime, { mode: "local" });
      return {
        insight: insight.text,
        explanation: `Found ${relatedLogs.length} related log entries.`,
        relatedLogs,
        suggestedActions: ["Review the log entries for more details."],
      };
    }

    try {
      const prompt = this.buildInvestigatePrompt(insight, relatedLogs);
      logVerbose("INVESTIGATE", `Built investigation prompt`, {
        requestId,
        promptLength: prompt.length,
      });

      const response = await this.callLLM(prompt, "investigate", authToken);
      const result = this.parseInvestigateResponse(response, insight, relatedLogs);

      logVerbose("INVESTIGATE", `Investigation complete`, {
        requestId,
        durationMs: Date.now() - startTime,
        hasExplanation: !!result.explanation,
        suggestedActionsCount: result.suggestedActions?.length || 0,
        relatedLogsReturned: result.relatedLogs.length,
      });

      telemetry?.metric("assistant.investigate.duration", Date.now() - startTime, { mode: "llm" });
      telemetry?.event("assistant.investigate.complete", "Investigation completed", {
        requestId,
        insightId: insight.id,
        insightCategory: insight.category,
        matchStrategy,
        relatedLogCount: relatedLogs.length,
      }, "info");

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logVerbose("INVESTIGATE", `LLM investigation failed`, {
        requestId,
        error: errorMessage,
        durationMs: Date.now() - startTime,
      });
      telemetry?.event("assistant.investigate.fallback", "LLM failed, using local", { requestId, error: errorMessage }, "warn");
      telemetry?.metric("assistant.investigate.duration", Date.now() - startTime, { mode: "fallback" });
      return {
        insight: insight.text,
        explanation: `Found ${relatedLogs.length} related log entries. LLM analysis unavailable.`,
        relatedLogs,
        suggestedActions: ["Review the log entries manually."],
      };
    }
  }

  private buildInvestigatePrompt(insight: Insight, logs: LogEntry[]): string {
    const formattedLogs = this.formatLogsForLLM(logs, 15);

    return `Investigate this observation from log analysis:

INSIGHT: "${insight.text}"
Category: ${insight.category}
Severity: ${insight.severity}
${insight.services ? `Services: ${insight.services.join(", ")}` : ""}

RELATED LOGS:
${formattedLogs}

Provide a deeper explanation of what's happening and why. Be specific.

Respond with JSON:
{
  "explanation": "2-4 sentences explaining what's happening, the likely cause, and impact",
  "suggestedActions": ["specific action 1", "specific action 2"]
}

Focus on:
- Root cause if identifiable
- Impact on the system
- Specific next steps to resolve or investigate further`;
  }

  private parseInvestigateResponse(
    response: string,
    insight: Insight,
    relatedLogs: LogEntry[]
  ): InvestigationResult {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          insight: insight.text,
          explanation: parsed.explanation || "Analysis complete.",
          relatedLogs,
          suggestedActions: parsed.suggestedActions || [],
        };
      }
    } catch {
      // Fall through
    }

    return {
      insight: insight.text,
      explanation: "Unable to parse LLM response.",
      relatedLogs,
      suggestedActions: ["Review the log entries manually."],
    };
  }

  async groupRelatedLogs(entries: LogEntry[]): Promise<LogGroup[]> {
    const startTime = Date.now();
    const requestId = `group-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    logVerbose("GROUP", `Starting log grouping`, {
      requestId,
      entryCount: entries.length,
    });

    const groups = new Map<string, LogGroup>();

    entries.forEach((entry) => {
      // Create simplified pattern by normalizing IDs and numbers
      const pattern = entry.message
        .replace(/[0-9a-f]{8,}/gi, "[ID]")
        .replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z?/g, "[TIMESTAMP]")
        .replace(/\d+\.\d+\.\d+\.\d+/g, "[IP]")
        .replace(/\d+/g, "[N]")
        .substring(0, 100);

      const existing = groups.get(pattern);
      if (existing) {
        existing.count++;
        existing.logIds.push(entry.id);
      } else {
        groups.set(pattern, {
          id: `group-${groups.size + 1}`,
          name: pattern.substring(0, 50),
          pattern,
          count: 1,
          logIds: [entry.id],
        });
      }
    });

    // Return groups with more than 1 entry, sorted by count
    const result = Array.from(groups.values())
      .filter((g) => g.count > 1)
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);

    logVerbose("GROUP", `Log grouping complete`, {
      requestId,
      durationMs: Date.now() - startTime,
      totalPatterns: groups.size,
      groupsWithMultiple: result.length,
      topGroupCount: result[0]?.count || 0,
      topGroupPattern: result[0]?.pattern.substring(0, 50) || "none",
    });

    telemetry?.metric("assistant.group.duration", Date.now() - startTime, {});
    telemetry?.metric("assistant.group.patterns", result.length, {});

    return result;
  }

  private generateLocalSummary(entries: LogEntry[]): AssistantSummary {
    if (entries.length === 0) {
      return {
        summary: "No logs to analyze in the current time range.",
        insights: [],
        errorCount: 0,
        warnCount: 0,
      };
    }

    const errorCount = entries.filter((l) => l.level === "error" || l.level === "fatal").length;
    const warnCount = entries.filter((l) => l.level === "warn").length;
    const insights: Insight[] = [];

    // Group errors by service and message pattern
    if (errorCount > 0) {
      const errorsByService = new Map<string, LogEntry[]>();
      entries.filter(l => l.level === "error" || l.level === "fatal").forEach(e => {
        const svc = e.serviceId || "unknown";
        if (!errorsByService.has(svc)) errorsByService.set(svc, []);
        errorsByService.get(svc)!.push(e);
      });

      Array.from(errorsByService.entries()).forEach(([service, errors]) => {
        // Find most common error pattern in this service
        const patterns = new Map<string, { count: number; sample: string }>();
        errors.forEach((e) => {
          const normalized = e.message.replace(/[0-9a-f]{8,}/gi, "*").replace(/\d+/g, "#").substring(0, 60);
          const existing = patterns.get(normalized);
          if (existing) {
            existing.count++;
          } else {
            patterns.set(normalized, { count: 1, sample: e.message.substring(0, 80) });
          }
        });
        const topPattern = Array.from(patterns.entries()).sort((a, b) => b[1].count - a[1].count)[0];

        if (topPattern) {
          insights.push({
            id: `error-${service}-${insights.length}`,
            text: `${service}: ${topPattern[1].sample}${topPattern[1].count > 1 ? ` (${topPattern[1].count}x)` : ""}`,
            severity: "critical",
            category: "error",
            searchHint: topPattern[1].sample.split(" ").slice(0, 3).join(" "),
            services: [service],
            count: topPattern[1].count,
          });
        }
      });
    }

    // Detect high-frequency patterns (potential spam or loops)
    const messagePatterns = new Map<string, { count: number; sample: string; services: Set<string> }>();
    entries.forEach((log) => {
      const simplified = log.message
        .replace(/[0-9a-f]{8,}/gi, "[ID]")
        .replace(/\d{4}-\d{2}-\d{2}/g, "[DATE]")
        .replace(/\d+\.\d+\.\d+\.\d+/g, "[IP]")
        .replace(/\d+/g, "[N]")
        .substring(0, 50);
      const existing = messagePatterns.get(simplified);
      if (existing) {
        existing.count++;
        if (log.serviceId) existing.services.add(log.serviceId);
      } else {
        messagePatterns.set(simplified, {
          count: 1,
          sample: log.message.substring(0, 60),
          services: new Set(log.serviceId ? [log.serviceId] : []),
        });
      }
    });

    const repeatedPatterns = Array.from(messagePatterns.entries())
      .filter(([, data]) => data.count > 5)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 3);

    repeatedPatterns.forEach(([, data]) => {
      if (insights.length < 5) {
        insights.push({
          id: `pattern-${insights.length}`,
          text: `${data.count}x: "${data.sample}"`,
          severity: data.count > 20 ? "warning" : "info",
          category: "pattern",
          searchHint: data.sample.split(" ").slice(0, 2).join(" "),
          services: Array.from(data.services),
          count: data.count,
        });
      }
    });

    let summary = `Analyzed ${entries.length} log entries. `;
    if (errorCount === 0 && warnCount === 0) {
      summary += "All systems appear healthy with no errors or warnings.";
    } else if (errorCount > 0) {
      summary += `Found ${errorCount} error${errorCount > 1 ? "s" : ""} that may need attention.`;
    } else if (warnCount > 0) {
      summary += `Found ${warnCount} warning${warnCount > 1 ? "s" : ""} to review.`;
    }

    return {
      summary,
      insights: insights.slice(0, 5),
      errorCount,
      warnCount,
      patterns: repeatedPatterns.map(([pattern]) => pattern),
    };
  }

  /**
   * Format logs compactly for LLM context.
   * Uses a condensed format to maximize information per token:
   * - Relative timestamps (seconds from first entry)
   * - Single-char level codes: E=error, W=warn, I=info, D=debug
   * - Grouped by service when available
   * - Deduplicated similar messages with counts
   */
  private formatLogsForLLM(entries: LogEntry[], maxEntries = 50): string {
    if (entries.length === 0) return "(no logs)";

    const sample = entries.slice(0, maxEntries);
    const baseTime = new Date(sample[0].timestamp).getTime();

    // Level abbreviations
    const levelCode: Record<string, string> = {
      error: "E", fatal: "E", warn: "W", info: "I", debug: "D", trace: "D"
    };

    // Group by service for context
    const byService = new Map<string, LogEntry[]>();
    sample.forEach((entry) => {
      const meta = entry.metadata as Record<string, unknown> | null;
      const svc = entry.serviceId || (meta?.serviceId as string) || "unknown";
      if (!byService.has(svc)) byService.set(svc, []);
      byService.get(svc)!.push(entry);
    });

    const lines: string[] = [];

    Array.from(byService.entries()).forEach(([service, logs]) => {
      // Deduplicate similar messages within service
      const msgCounts = new Map<string, { count: number; first: LogEntry }>();

      logs.forEach((log) => {
        // Normalize message for deduplication
        const normalized = log.message
          .replace(/[0-9a-f]{8,}/gi, "*")  // UUIDs/hashes
          .replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z?/g, "*")  // timestamps
          .replace(/\d+\.\d+\.\d+\.\d+/g, "*")  // IPs
          .replace(/\d+/g, "#")  // numbers
          .substring(0, 100);

        const existing = msgCounts.get(normalized);
        if (existing) {
          existing.count++;
        } else {
          msgCounts.set(normalized, { count: 1, first: log });
        }
      });

      // Format service header if multiple services
      if (byService.size > 1) {
        lines.push(`[${service}]`);
      }

      // Format each unique message
      Array.from(msgCounts.values()).forEach(({ count, first }) => {
        const relTime = ((new Date(first.timestamp).getTime() - baseTime) / 1000).toFixed(1);
        const lvl = levelCode[first.level] || "?";
        const msg = first.message.substring(0, 120);
        const countSuffix = count > 1 ? ` (x${count})` : "";

        lines.push(`+${relTime}s ${lvl} ${msg}${countSuffix}`);
      });
    });

    return lines.join("\n");
  }

  /**
   * Build context summary for the LLM (stats that don't need to be in logs)
   */
  private buildLogContext(entries: LogEntry[]): string {
    const levels = { error: 0, warn: 0, info: 0, debug: 0 };
    const services = new Set<string>();

    entries.forEach((e) => {
      if (e.level in levels) levels[e.level as keyof typeof levels]++;
      if (e.serviceId) services.add(e.serviceId);
    });

    const timeRange = entries.length > 1
      ? `${new Date(entries[0].timestamp).toISOString()} to ${new Date(entries[entries.length - 1].timestamp).toISOString()}`
      : "single point";

    return `Count: ${entries.length} | Errors: ${levels.error} | Warns: ${levels.warn} | Services: ${Array.from(services).join(", ") || "unknown"} | Range: ${timeRange}`;
  }

  private buildSummarizePrompt(entries: LogEntry[]): string {
    const context = this.buildLogContext(entries);
    const formattedLogs = this.formatLogsForLLM(entries, 75);

    return `Analyze these application logs and surface specific, actionable insights.

CONTEXT: ${context}

LOGS (format: +seconds level message):
${formattedLogs}

Generate insights that are SPECIFIC and CLICKABLE - each should make someone want to investigate further.

BAD insights (too generic):
- "2 errors detected"
- "High warning volume"
- "Multiple services logging"

GOOD insights (specific, intriguing):
- "auth-service: Token validation failing repeatedly for session xyz"
- "catalog-service response time spiked 3x starting at 14:22"
- "47 retry attempts from messaging-service to identity-service"
- "Unusual 401 responses on /api/users endpoint (normally 0, now 12)"

Respond with JSON:
{
  "summary": "1-2 sentence executive summary",
  "insights": [
    {
      "text": "Specific, actionable observation that invites investigation",
      "severity": "critical|warning|info",
      "category": "error|performance|pattern|anomaly|health",
      "searchHint": "search term to find related logs",
      "services": ["service-name"],
      "count": 5
    }
  ]
}

Rules:
- Include service names when relevant
- Include counts when meaningful
- Include timestamps or time references when notable
- Make each insight sound like something worth clicking
- Prioritize unusual or unexpected findings over routine observations
- Maximum 5 insights, fewer if logs are unremarkable`;
  }

  private buildErrorAnalysisPrompt(entries: LogEntry[]): string {
    // For errors, include more detail including relevant metadata
    const errorDetails = entries.slice(0, 25).map((e) => {
      const relMeta: Record<string, unknown> = {};
      const meta = e.metadata as Record<string, unknown> | null;
      if (meta) {
        // Extract only relevant metadata fields
        const keep = ["status", "statusCode", "error", "code", "path", "method", "stack", "cause"];
        keep.forEach((k) => {
          if (k in meta) relMeta[k] = meta[k];
        });
      }
      return {
        t: new Date(e.timestamp).toISOString().slice(11, 23), // HH:mm:ss.SSS
        svc: e.serviceId || (meta?.serviceId as string | undefined),
        msg: e.message.substring(0, 200),
        ...(Object.keys(relMeta).length > 0 ? { meta: relMeta } : {}),
      };
    });

    // Group by error type/message pattern
    const errorGroups = new Map<string, number>();
    entries.forEach((e) => {
      const pattern = e.message.replace(/[0-9a-f]{8,}/gi, "*").replace(/\d+/g, "#").substring(0, 60);
      errorGroups.set(pattern, (errorGroups.get(pattern) || 0) + 1);
    });

    const topErrors = Array.from(errorGroups.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([pattern, count]) => `${count}x: ${pattern}`)
      .join("\n");

    return `Diagnose these errors.

ERROR SUMMARY (${entries.length} total):
${topErrors}

RECENT ERRORS:
${JSON.stringify(errorDetails)}

Respond with JSON:
{"summary":"1-2 sentences","possibleCauses":["cause1","cause2"],"suggestedActions":["action1","action2"]}

Be specific and actionable.`;
  }

  /**
   * Call LLM through the Integrations service
   * @param prompt - The prompt to send to the LLM
   * @param operation - Operation name for logging
   * @param authToken - User's auth token for Integrations service
   */
  private async callLLM(prompt: string, operation: string, authToken: string): Promise<string> {
    const startTime = Date.now();
    const requestId = `llm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Log the outbound request
    const requestLog = {
      requestId,
      operation,
      provider: this.config.provider,
      model: this.config.model,
      promptLength: prompt.length,
      temperature: this.config.temperature,
      maxTokens: this.config.maxTokens,
    };

    console.log(`[LLM] Request ${requestId}:`, JSON.stringify(requestLog));
    telemetry?.event("llm.request", `LLM ${operation} request via Integrations`, requestLog, "debug");

    try {
      // Build messages for chat completion
      const messages: ChatMessage[] = [
        {
          role: "system",
          content: "You are a log analysis assistant. Analyze logs and provide structured insights. Always respond with valid JSON.",
        },
        { role: "user", content: prompt },
      ];

      // Call Integrations service
      const result = await executeChat(
        authToken,
        this.config.provider,
        messages,
        {
          model: this.config.model,
          temperature: this.config.temperature,
          maxTokens: this.config.maxTokens,
        }
      );

      const latencyMs = Date.now() - startTime;

      if (!result.success) {
        throw new Error(result.error || "Integrations service request failed");
      }

      const responseContent = result.data && "content" in result.data ? result.data.content : "";
      const usage = result.data?.usage;

      // Log successful response
      const responseLog: LLMCallMetrics = {
        provider: this.config.provider,
        model: result.data?.model || this.config.model,
        promptTokens: usage?.promptTokens,
        completionTokens: usage?.completionTokens,
        totalTokens: usage?.totalTokens,
        latencyMs,
        success: true,
      };

      console.log(`[LLM] Response ${requestId}:`, JSON.stringify({
        ...responseLog,
        responseLength: responseContent.length,
        responsePreview: responseContent.substring(0, 200),
        integrationsRequestId: result.requestId,
      }));

      telemetry?.event("llm.response", `LLM ${operation} completed via Integrations`, {
        requestId,
        integrationsRequestId: result.requestId,
        ...responseLog,
        responseLength: responseContent.length,
      }, "info");

      // Record metrics
      telemetry?.metric("llm.latency", latencyMs, { provider: this.config.provider, model: this.config.model, operation });
      if (usage?.totalTokens) {
        telemetry?.metric("llm.tokens", usage.totalTokens, { provider: this.config.provider, model: this.config.model, operation });
      }

      return responseContent;

    } catch (error) {
      const latencyMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Log error
      const errorLog: LLMCallMetrics = {
        provider: this.config.provider,
        model: this.config.model,
        latencyMs,
        success: false,
        error: errorMessage,
      };

      console.error(`[LLM] Error ${requestId}:`, JSON.stringify(errorLog));
      telemetry?.event("llm.error", `LLM ${operation} failed`, { requestId, ...errorLog }, "error");

      throw error;
    }
  }

  private parseSummaryResponse(response: string): Partial<AssistantSummary> {
    try {
      // Extract JSON from response (handle potential markdown wrapping)
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);

        // Convert insights to proper structure if they came from LLM
        if (parsed.insights && Array.isArray(parsed.insights)) {
          parsed.insights = parsed.insights.map((insight: Insight | string, idx: number) => {
            if (typeof insight === "string") {
              // Legacy format - convert to new structure
              return {
                id: `llm-${idx}`,
                text: insight,
                severity: "info" as const,
                category: "health" as const,
              };
            }
            // New format from LLM - ensure id exists
            return {
              id: insight.id || `llm-${idx}`,
              text: insight.text,
              severity: insight.severity || "info",
              category: insight.category || "health",
              searchHint: insight.searchHint,
              services: insight.services,
              count: insight.count,
            };
          });
        }

        return parsed;
      }
      return {};
    } catch {
      return {};
    }
  }

  private parseErrorAnalysisResponse(
    response: string,
    fallbackMessages: string[]
  ): ErrorAnalysis {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          summary: parsed.summary || "Error analysis completed.",
          errorMessages: fallbackMessages,
          possibleCauses: parsed.possibleCauses || [],
          suggestedActions: parsed.suggestedActions || [],
        };
      }
    } catch {
      // Fall through to default
    }

    return {
      summary: "Error analysis parsing failed.",
      errorMessages: fallbackMessages,
      possibleCauses: [],
      suggestedActions: ["Review error messages manually."],
    };
  }
}

// Export singleton instance
export const logAssistant = new LogAssistantService();
