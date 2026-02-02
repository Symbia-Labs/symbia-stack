import { useState } from 'react';

// Types matching the catalog API response
export interface Condition {
  field: string;
  operator: string;
  value: unknown;
}

export interface ConditionGroup {
  logic: 'and' | 'or';
  conditions: (Condition | ConditionGroup)[];
}

export interface ActionConfig {
  id?: string;
  type: string;
  params?: Record<string, unknown>;
  onError?: {
    action: string;
    params?: Record<string, unknown>;
  };
}

export interface Rule {
  id: string;
  name: string;
  description?: string;
  priority: number;
  enabled: boolean;
  trigger: string;
  conditions: ConditionGroup;
  actions: ActionConfig[];
}

export interface RuleSet {
  id: string;
  name: string;
  description?: string;
  rules: Rule[];
  version: number;
  isActive: boolean;
}

interface RuleSetViewerProps {
  ruleSet: RuleSet | null | undefined;
  aliasColor: string;
}

// Human-readable trigger names
const TRIGGER_LABELS: Record<string, string> = {
  'message.received': 'When a message is received',
  'conversation.created': 'When a conversation starts',
  'conversation.updated': 'When a conversation is updated',
  'handoff.requested': 'When a handoff is requested',
  'handoff.completed': 'When a handoff completes',
  'context.updated': 'When context changes',
  'timer.elapsed': 'When a timer fires',
  'custom': 'Custom trigger',
};

// Human-readable action types
const ACTION_LABELS: Record<string, string> = {
  'message.send': 'Send message',
  'llm.invoke': 'Ask AI',
  'tool.invoke': 'Use tool',
  'code.tool.invoke': 'Run code',
  'handoff.create': 'Hand off to',
  'context.update': 'Update context',
  'webhook.call': 'Call webhook',
  'service.call': 'Call service',
  'assistant.route': 'Route to assistant',
  'embedding.route': 'Semantic routing',
  'integration.invoke': 'Use integration',
};

// Human-readable condition operators
const OPERATOR_LABELS: Record<string, string> = {
  'equals': '=',
  'not_equals': '≠',
  'contains': 'contains',
  'not_contains': 'doesn\'t contain',
  'matches': 'matches pattern',
  'not_matches': 'doesn\'t match',
  'exists': 'exists',
  'not_exists': 'doesn\'t exist',
  'greater_than': '>',
  'less_than': '<',
  'in': 'is one of',
  'not_in': 'is not one of',
};

export function RuleSetViewer({ ruleSet, aliasColor }: RuleSetViewerProps) {
  const [expandedRules, setExpandedRules] = useState<Set<string>>(new Set());

  if (!ruleSet || !ruleSet.rules || ruleSet.rules.length === 0) {
    return (
      <div style={{
        padding: 'var(--space-4)',
        color: 'var(--text-muted)',
        fontSize: 13,
        textAlign: 'center',
      }}>
        No rules defined
      </div>
    );
  }

  const toggleRule = (ruleId: string) => {
    setExpandedRules(prev => {
      const next = new Set(prev);
      if (next.has(ruleId)) {
        next.delete(ruleId);
      } else {
        next.add(ruleId);
      }
      return next;
    });
  };

  // Sort rules by priority (highest first)
  const sortedRules = [...ruleSet.rules].sort((a, b) => b.priority - a.priority);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      {/* RuleSet header */}
      <div style={{
        fontSize: 11,
        color: 'var(--text-muted)',
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
        marginBottom: 'var(--space-1)',
      }}>
        {ruleSet.name} • {ruleSet.rules.length} rules
      </div>

      {/* Rules list */}
      {sortedRules.map((rule, index) => (
        <RuleCard
          key={rule.id}
          rule={rule}
          index={index}
          expanded={expandedRules.has(rule.id)}
          onToggle={() => toggleRule(rule.id)}
          aliasColor={aliasColor}
        />
      ))}
    </div>
  );
}

interface RuleCardProps {
  rule: Rule;
  index: number;
  expanded: boolean;
  onToggle: () => void;
  aliasColor: string;
}

function RuleCard({ rule, index, expanded, onToggle, aliasColor }: RuleCardProps) {
  const triggerLabel = TRIGGER_LABELS[rule.trigger] || rule.trigger;

  return (
    <div style={{
      background: 'var(--bg-elevated)',
      borderRadius: 'var(--radius-md)',
      border: '1px solid var(--border)',
      overflow: 'hidden',
      opacity: rule.enabled ? 1 : 0.5,
    }}>
      {/* Rule header - always visible */}
      <div
        onClick={onToggle}
        style={{
          padding: 'var(--space-3)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 'var(--space-3)',
        }}
      >
        {/* Priority badge */}
        <div style={{
          width: 24,
          height: 24,
          borderRadius: 'var(--radius-sm)',
          background: `${aliasColor}20`,
          color: aliasColor,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 11,
          fontWeight: 600,
          flexShrink: 0,
        }}>
          {index + 1}
        </div>

        {/* Rule info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            marginBottom: 2,
          }}>
            <span style={{ fontWeight: 500, fontSize: 13 }}>{rule.name}</span>
            {!rule.enabled && (
              <span style={{
                fontSize: 10,
                padding: '1px 6px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--bg-muted)',
                color: 'var(--text-muted)',
              }}>
                disabled
              </span>
            )}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {triggerLabel}
          </div>
        </div>

        {/* Expand/collapse icon */}
        <div style={{
          color: 'var(--text-muted)',
          fontSize: 14,
          transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
          transition: 'transform 0.15s ease',
        }}>
          ▼
        </div>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div style={{
          padding: 'var(--space-3)',
          paddingTop: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-3)',
        }}>
          {/* Description */}
          {rule.description && (
            <div style={{
              fontSize: 12,
              color: 'var(--text-secondary)',
              fontStyle: 'italic',
              paddingLeft: 36,
            }}>
              {rule.description}
            </div>
          )}

          {/* Conditions */}
          <div style={{ paddingLeft: 36 }}>
            <ConditionsDisplay conditions={rule.conditions} />
          </div>

          {/* Actions */}
          <div style={{ paddingLeft: 36 }}>
            <ActionsDisplay actions={rule.actions} aliasColor={aliasColor} />
          </div>
        </div>
      )}
    </div>
  );
}

function ConditionsDisplay({ conditions }: { conditions: ConditionGroup }) {
  if (!conditions.conditions || conditions.conditions.length === 0) {
    return null;
  }

  return (
    <div style={{
      fontSize: 12,
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-1)',
    }}>
      <div style={{
        color: 'var(--text-muted)',
        fontSize: 10,
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
        marginBottom: 2,
      }}>
        When ({conditions.logic})
      </div>
      {conditions.conditions.map((cond, i) => (
        <ConditionItem key={i} condition={cond} />
      ))}
    </div>
  );
}

function ConditionItem({ condition }: { condition: Condition | ConditionGroup }) {
  // Check if it's a nested group
  if ('logic' in condition) {
    return (
      <div style={{
        paddingLeft: 'var(--space-3)',
        borderLeft: '2px solid var(--border)',
      }}>
        <ConditionsDisplay conditions={condition} />
      </div>
    );
  }

  const operatorLabel = OPERATOR_LABELS[condition.operator] || condition.operator;
  const fieldParts = condition.field.split('.');
  const fieldDisplay = fieldParts[fieldParts.length - 1];

  // Format value for display
  let valueDisplay = String(condition.value);
  if (typeof condition.value === 'boolean') {
    valueDisplay = condition.value ? 'true' : 'false';
  } else if (condition.value === null || condition.value === undefined) {
    valueDisplay = '(empty)';
  } else if (typeof condition.value === 'string' && condition.value.startsWith('^')) {
    valueDisplay = `/${condition.value}/`;  // Show regex pattern
  }

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-2)',
      padding: 'var(--space-1) var(--space-2)',
      background: 'var(--bg-muted)',
      borderRadius: 'var(--radius-sm)',
      fontFamily: 'var(--font-mono)',
      fontSize: 11,
    }}>
      <span style={{ color: 'var(--secondary)' }}>{fieldDisplay}</span>
      <span style={{ color: 'var(--text-muted)' }}>{operatorLabel}</span>
      <span style={{ color: 'var(--tertiary)' }}>{valueDisplay}</span>
    </div>
  );
}

function ActionsDisplay({ actions, aliasColor }: { actions: ActionConfig[]; aliasColor: string }) {
  if (!actions || actions.length === 0) {
    return null;
  }

  return (
    <div style={{
      fontSize: 12,
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-1)',
    }}>
      <div style={{
        color: 'var(--text-muted)',
        fontSize: 10,
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
        marginBottom: 2,
      }}>
        Then
      </div>
      {actions.map((action, i) => (
        <ActionItem key={i} action={action} index={i} aliasColor={aliasColor} />
      ))}
    </div>
  );
}

function ActionItem({ action, index, aliasColor }: { action: ActionConfig; index: number; aliasColor: string }) {
  const actionLabel = ACTION_LABELS[action.type] || action.type;

  // Extract meaningful param to show
  let paramDisplay = '';
  if (action.params) {
    if (action.params.content) {
      // Truncate long content
      const content = String(action.params.content);
      paramDisplay = content.length > 50 ? content.substring(0, 50) + '...' : content;
    } else if (action.params.template) {
      paramDisplay = String(action.params.template);
    } else if (action.params.tool) {
      paramDisplay = String(action.params.tool);
    } else if (action.params.assistant) {
      paramDisplay = `@${action.params.assistant}`;
    }
  }

  return (
    <div style={{
      display: 'flex',
      alignItems: 'flex-start',
      gap: 'var(--space-2)',
      padding: 'var(--space-2)',
      background: 'var(--bg-muted)',
      borderRadius: 'var(--radius-sm)',
      fontSize: 11,
    }}>
      <span style={{
        width: 18,
        height: 18,
        borderRadius: '50%',
        background: `${aliasColor}30`,
        color: aliasColor,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 10,
        fontWeight: 600,
        flexShrink: 0,
      }}>
        {index + 1}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>
          {actionLabel}
        </div>
        {paramDisplay && (
          <div style={{
            color: 'var(--text-muted)',
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            marginTop: 2,
            wordBreak: 'break-word',
          }}>
            {paramDisplay}
          </div>
        )}
        {action.onError && (
          <div style={{
            color: 'var(--node-condition)',
            fontSize: 10,
            marginTop: 2,
          }}>
            On error: {ACTION_LABELS[action.onError.action] || action.onError.action}
          </div>
        )}
      </div>
    </div>
  );
}
