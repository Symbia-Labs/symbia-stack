/**
 * Curriculum Overview Section
 *
 * Shows detailed curriculum information, scores, and rule breakdown
 * for assistants in the Details tab.
 */

import { useMemo } from 'react';
import type { CatalogResource } from '@/types/catalog';
import { SymbiaScriptHighlight, SymbiaScriptLegend } from '@/components/inputs/SymbiaScriptHighlight';

interface CurriculumOverviewSectionProps {
  resource: CatalogResource;
}

// Curriculum level configuration
const CURRICULUM_LEVELS: Record<number, {
  label: string;
  title: string;
  color: string;
  bgColor: string;
  borderColor: string;
  description: string;
  pattern: string;
  icon: string;
}> = {
  1: {
    label: 'Level 1',
    title: 'Pure Deterministic',
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-400/10',
    borderColor: 'border-emerald-400/30',
    description: 'No AI involvement. Input maps directly to output through rules.',
    pattern: 'Input \u2192 Rules \u2192 Output',
    icon: '\u2699\ufe0f',
  },
  2: {
    label: 'Level 2',
    title: 'Deterministic + Tools',
    color: 'text-blue-400',
    bgColor: 'bg-blue-400/10',
    borderColor: 'border-blue-400/30',
    description: 'Rules invoke deterministic tools (math, conversion) for precise results.',
    pattern: 'Input \u2192 Rules \u2192 Tool \u2192 Output',
    icon: '\ud83e\uddf0',
  },
  3: {
    label: 'Level 3',
    title: 'Tool \u2192 AI Explanation',
    color: 'text-amber-400',
    bgColor: 'bg-amber-400/10',
    borderColor: 'border-amber-400/30',
    description: 'Tools produce data, then AI explains results in natural language.',
    pattern: 'Input \u2192 Tool \u2192 LLM \u2192 Output',
    icon: '\ud83d\udca1',
  },
  4: {
    label: 'Level 4',
    title: 'AI \u2192 Tool Execution',
    color: 'text-purple-400',
    bgColor: 'bg-purple-400/10',
    borderColor: 'border-purple-400/30',
    description: 'AI understands natural language intent, then tools execute precisely.',
    pattern: 'Input \u2192 LLM \u2192 Tool \u2192 Output',
    icon: '\ud83e\udde0',
  },
  5: {
    label: 'Level 5',
    title: 'Multi-Agent Collaboration',
    color: 'text-pink-400',
    bgColor: 'bg-pink-400/10',
    borderColor: 'border-pink-400/30',
    description: 'Multiple specialists coordinate to solve complex problems together.',
    pattern: 'Input \u2192 Coordinator \u2192 Specialists \u2192 Output',
    icon: '\ud83d\udc65',
  },
};

/**
 * Calculate determinism score based on assistant metadata
 */
function calculateDeterminismScore(metadata: Record<string, unknown>): { score: number; reason: string } {
  const llmConfig = metadata.llmConfig as Record<string, unknown> | null;
  const curriculumLevel = metadata.curriculumLevel as number | undefined;

  // Level 1-2: Pure deterministic = 100%
  if (curriculumLevel && curriculumLevel <= 2) {
    return { score: 100, reason: 'No LLM - purely deterministic rules and tools' };
  }

  // No LLM config = deterministic
  if (!llmConfig) {
    return { score: 100, reason: 'No LLM configured - deterministic behavior' };
  }

  // Has LLM - calculate based on temperature
  const temperature = (llmConfig.temperature as number) ?? 0.7;

  if (temperature === 0) {
    return { score: 95, reason: 'LLM at temperature=0 (highly deterministic)' };
  }
  if (temperature <= 0.3) {
    return { score: 85, reason: `LLM at temperature=${temperature} (mostly deterministic)` };
  }
  if (temperature <= 0.7) {
    return { score: 60, reason: `LLM at temperature=${temperature} (balanced)` };
  }

  const score = Math.round(100 - (temperature / 2) * 80);
  return { score: Math.max(20, score), reason: `LLM at temperature=${temperature} (creative/variable)` };
}

/**
 * Calculate confidence score based on rule coverage
 */
function calculateConfidenceScore(metadata: Record<string, unknown>): { score: number; reason: string } {
  const ruleSet = metadata.ruleSet as { rules?: Array<{ actions?: unknown[]; onError?: unknown }> } | undefined;
  const rulesCount = (metadata.rulesCount as number) || ruleSet?.rules?.length || 0;
  const curriculumLevel = metadata.curriculumLevel as number | undefined;

  const reasons: string[] = [];
  let score = 50;

  if (rulesCount === 0) {
    return { score: 30, reason: 'No rules defined - behavior undefined' };
  }

  // More rules = more confidence
  const ruleBonus = Math.min(30, rulesCount * 10);
  score += ruleBonus;
  reasons.push(`${rulesCount} rules defined (+${ruleBonus})`);

  // Check for error handling
  const hasErrorHandling = ruleSet?.rules?.some(r => r.onError);
  if (hasErrorHandling) {
    score += 10;
    reasons.push('Error handling present (+10)');
  }

  // Curriculum levels have been tested
  if (curriculumLevel) {
    score += 10;
    reasons.push('Bootstrap/tested assistant (+10)');
  }

  return { score: Math.min(100, score), reason: reasons.join(', ') };
}

/**
 * Score display component with visual indicator
 */
function ScoreDisplay({
  label,
  score,
  reason,
  icon,
}: {
  label: string;
  score: number;
  reason: string;
  icon: string;
}) {
  const color = score >= 80 ? 'text-emerald-400' : score >= 50 ? 'text-amber-400' : 'text-red-400';
  const bgColor = score >= 80 ? 'bg-emerald-400' : score >= 50 ? 'bg-amber-400' : 'bg-red-400';
  const bgColorLight = score >= 80 ? 'bg-emerald-400/10' : score >= 50 ? 'bg-amber-400/10' : 'bg-red-400/10';

  return (
    <div className={`p-4 rounded-lg border border-slate-700/50 ${bgColorLight}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-lg">{icon}</span>
          <span className="text-sm font-medium text-slate-300">{label}</span>
        </div>
        <span className={`text-2xl font-bold font-mono ${color}`}>{score}</span>
      </div>
      <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden mb-2">
        <div
          className={`h-full ${bgColor} transition-all`}
          style={{ width: `${score}%` }}
        />
      </div>
      <p className="text-xs text-slate-500">{reason}</p>
    </div>
  );
}

/**
 * LLM Configuration display component
 */
function LLMConfigDisplay({ config }: { config: Record<string, unknown> }) {
  const provider = config.provider as string | undefined;
  const model = config.model as string | undefined;
  const temperature = config.temperature as number | undefined;
  const maxTokens = config.maxTokens as number | undefined;

  return (
    <div>
      <h3 className="text-sm font-medium text-slate-300 uppercase tracking-wider mb-3">
        LLM Configuration
      </h3>
      <div className="p-3 rounded-lg bg-slate-800/30 border border-slate-700/50">
        <div className="grid grid-cols-2 gap-3 text-sm">
          {provider && (
            <div>
              <span className="text-slate-500">Provider:</span>
              <span className="ml-2 text-slate-300">{provider}</span>
            </div>
          )}
          {model && (
            <div>
              <span className="text-slate-500">Model:</span>
              <span className="ml-2 text-slate-300 font-mono text-xs">{model}</span>
            </div>
          )}
          {temperature !== undefined && (
            <div>
              <span className="text-slate-500">Temperature:</span>
              <span className="ml-2 text-slate-300">{temperature}</span>
            </div>
          )}
          {maxTokens && (
            <div>
              <span className="text-slate-500">Max Tokens:</span>
              <span className="ml-2 text-slate-300">{maxTokens}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function CurriculumOverviewSection({ resource }: CurriculumOverviewSectionProps) {
  const metadata = resource.metadata || {};

  // Curriculum info
  const curriculumLevel = metadata.curriculumLevel as number | undefined;
  const curriculumTitle = metadata.curriculumTitle as string | undefined;
  const curriculumDescription = metadata.curriculumDescription as string | undefined;
  const levelConfig = curriculumLevel ? CURRICULUM_LEVELS[curriculumLevel] : null;

  // Rule set info
  const ruleSet = metadata.ruleSet as {
    id?: string;
    name?: string;
    description?: string;
    rules?: Array<{
      id: string;
      name: string;
      description?: string;
      trigger: string;
      conditions?: unknown;
      actions?: Array<{ type: string; params?: unknown }>;
    }>;
  } | undefined;

  // Calculate scores
  const determinism = useMemo(() => calculateDeterminismScore(metadata), [metadata]);
  const confidence = useMemo(() => calculateConfidenceScore(metadata), [metadata]);

  // Format rule set for display
  const ruleSetJson = useMemo(() => {
    if (!ruleSet) return null;
    return JSON.stringify(ruleSet, null, 2);
  }, [ruleSet]);

  // If not an assistant or no curriculum info, don't show anything
  if (resource.type !== 'assistant') return null;

  return (
    <div className="space-y-6">
      {/* Curriculum Level Badge */}
      {levelConfig && (
        <div className={`p-4 rounded-lg border ${levelConfig.borderColor} ${levelConfig.bgColor}`}>
          <div className="flex items-start gap-4">
            <div className="text-4xl">{levelConfig.icon}</div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className={`px-2 py-0.5 rounded text-xs font-bold ${levelConfig.bgColor} ${levelConfig.color}`}>
                  {levelConfig.label}
                </span>
                <h3 className={`text-lg font-semibold ${levelConfig.color}`}>
                  {curriculumTitle || levelConfig.title}
                </h3>
              </div>
              <p className="text-sm text-slate-400 mb-2">
                {curriculumDescription || levelConfig.description}
              </p>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-500">Pattern:</span>
                <code className="px-2 py-0.5 bg-slate-800/50 rounded font-mono text-slate-300">
                  {levelConfig.pattern}
                </code>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Scores */}
      <div>
        <h3 className="text-sm font-medium text-slate-300 uppercase tracking-wider mb-3">
          Behavior Scores
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <ScoreDisplay
            label="Determinism"
            score={determinism.score}
            reason={determinism.reason}
            icon="\u2699\ufe0f"
          />
          <ScoreDisplay
            label="Confidence"
            score={confidence.score}
            reason={confidence.reason}
            icon="\u2705"
          />
        </div>
        <p className="text-xs text-slate-500 mt-2">
          <strong>Determinism:</strong> How predictable the output is for the same input.
          <strong className="ml-2">Confidence:</strong> How well-defined and tested the behavior is.
        </p>
      </div>

      {/* Rule Set Overview */}
      {ruleSet && ruleSet.rules && ruleSet.rules.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-slate-300 uppercase tracking-wider">
              Rule Set: {ruleSet.name || 'Unnamed'}
            </h3>
            <span className="text-xs text-slate-500">
              {ruleSet.rules.length} rules
            </span>
          </div>

          {ruleSet.description && (
            <p className="text-sm text-slate-400 mb-3">{ruleSet.description}</p>
          )}

          {/* Rules Summary */}
          <div className="space-y-2 mb-4">
            {ruleSet.rules.map((rule, idx) => (
              <div
                key={rule.id || idx}
                className="p-3 rounded-lg bg-slate-800/30 border border-slate-700/50"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-slate-200">{rule.name}</span>
                  <span className="text-xs text-slate-500 font-mono">{rule.trigger}</span>
                </div>
                {rule.description && (
                  <p className="text-xs text-slate-500 mb-2">{rule.description}</p>
                )}
                {rule.actions && (
                  <div className="flex items-center gap-2 flex-wrap">
                    {rule.actions.map((action, actionIdx) => (
                      <span
                        key={actionIdx}
                        className="px-2 py-0.5 text-xs font-mono rounded bg-pink-400/10 text-pink-400"
                      >
                        {action.type}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Full Rule Set JSON with Syntax Highlighting */}
          <details className="group">
            <summary className="cursor-pointer text-sm text-slate-400 hover:text-slate-300 flex items-center gap-2">
              <span className="group-open:rotate-90 transition-transform">\u25b6</span>
              View Full Rule Definition (Symbia Script)
            </summary>
            <div className="mt-3 space-y-2">
              <SymbiaScriptLegend />
              {ruleSetJson && (
                <SymbiaScriptHighlight
                  content={ruleSetJson}
                  showLineNumbers
                  maxHeight="500px"
                />
              )}
            </div>
          </details>
        </div>
      )}

      {/* LLM Configuration Summary */}
      {/* `metadata.llmConfig` is unknown; `unknown && JSX` types the whole
          child as unknown, which is not a valid ReactNode. Ternary keeps the
          rendered value JSX | null. */}
      {metadata.llmConfig ? (
        <LLMConfigDisplay config={metadata.llmConfig as Record<string, unknown>} />
      ) : null}
    </div>
  );
}
