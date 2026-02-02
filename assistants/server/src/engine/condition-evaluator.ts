import type { Condition, ConditionGroup, ConditionOperator, ExecutionContext } from './types.js';

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;
  
  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }
    if (typeof current === 'object') {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  
  return current;
}

function evaluateOperator(fieldValue: unknown, operator: ConditionOperator, conditionValue: unknown): boolean {
  switch (operator) {
    case 'eq':
      return fieldValue === conditionValue;
    
    case 'neq':
      return fieldValue !== conditionValue;
    
    case 'gt':
      if (typeof fieldValue === 'number' && typeof conditionValue === 'number') {
        return fieldValue > conditionValue;
      }
      return false;
    
    case 'gte':
      if (typeof fieldValue === 'number' && typeof conditionValue === 'number') {
        return fieldValue >= conditionValue;
      }
      return false;
    
    case 'lt':
      if (typeof fieldValue === 'number' && typeof conditionValue === 'number') {
        return fieldValue < conditionValue;
      }
      return false;
    
    case 'lte':
      if (typeof fieldValue === 'number' && typeof conditionValue === 'number') {
        return fieldValue <= conditionValue;
      }
      return false;
    
    case 'contains':
      if (typeof fieldValue === 'string' && typeof conditionValue === 'string') {
        return fieldValue.toLowerCase().includes(conditionValue.toLowerCase());
      }
      if (Array.isArray(fieldValue)) {
        return fieldValue.includes(conditionValue);
      }
      return false;
    
    case 'not_contains':
      if (typeof fieldValue === 'string' && typeof conditionValue === 'string') {
        return !fieldValue.toLowerCase().includes(conditionValue.toLowerCase());
      }
      if (Array.isArray(fieldValue)) {
        return !fieldValue.includes(conditionValue);
      }
      return true;
    
    case 'starts_with':
      if (typeof fieldValue === 'string' && typeof conditionValue === 'string') {
        return fieldValue.toLowerCase().startsWith(conditionValue.toLowerCase());
      }
      return false;
    
    case 'ends_with':
      if (typeof fieldValue === 'string' && typeof conditionValue === 'string') {
        return fieldValue.toLowerCase().endsWith(conditionValue.toLowerCase());
      }
      return false;
    
    case 'matches':
      if (typeof fieldValue === 'string' && typeof conditionValue === 'string') {
        try {
          const regex = new RegExp(conditionValue, 'i');
          return regex.test(fieldValue);
        } catch {
          return false;
        }
      }
      return false;

    case 'not_matches':
      if (typeof fieldValue === 'string' && typeof conditionValue === 'string') {
        try {
          const regex = new RegExp(conditionValue, 'i');
          return !regex.test(fieldValue);
        } catch {
          return true;
        }
      }
      return true;

    case 'in':
      if (Array.isArray(conditionValue)) {
        return conditionValue.includes(fieldValue);
      }
      return false;
    
    case 'not_in':
      if (Array.isArray(conditionValue)) {
        return !conditionValue.includes(fieldValue);
      }
      return true;
    
    case 'exists':
      return fieldValue !== undefined && fieldValue !== null;
    
    case 'not_exists':
      return fieldValue === undefined || fieldValue === null;

    case 'length_gte':
      if (typeof fieldValue === 'string' && typeof conditionValue === 'number') {
        return fieldValue.length >= conditionValue;
      }
      if (Array.isArray(fieldValue) && typeof conditionValue === 'number') {
        return fieldValue.length >= conditionValue;
      }
      return false;

    case 'length_lte':
      if (typeof fieldValue === 'string' && typeof conditionValue === 'number') {
        return fieldValue.length <= conditionValue;
      }
      if (Array.isArray(fieldValue) && typeof conditionValue === 'number') {
        return fieldValue.length <= conditionValue;
      }
      return false;

    case 'length_eq':
      if (typeof fieldValue === 'string' && typeof conditionValue === 'number') {
        return fieldValue.length === conditionValue;
      }
      if (Array.isArray(fieldValue) && typeof conditionValue === 'number') {
        return fieldValue.length === conditionValue;
      }
      return false;

    default:
      return false;
  }
}

function flattenContext(ctx: ExecutionContext): Record<string, unknown> {
  return {
    orgId: ctx.orgId,
    conversationId: ctx.conversationId,
    conversationState: ctx.conversationState,
    trigger: ctx.trigger,
    event: ctx.event,
    message: ctx.message,
    user: ctx.user,
    context: ctx.context,  // Keep context nested for field path access (e.g., context.codeAgentActive)
    metadata: ctx.metadata,
  };
}

function evaluateCondition(condition: Condition, flatContext: Record<string, unknown>): boolean {
  const fieldValue = getNestedValue(flatContext, condition.field);

  // Central fix for @mention detection: when checking message.content for @mentions,
  // also check message.metadata.originalContent since @mentions are stripped from content
  // during message routing but preserved in originalContent
  if (condition.field === 'message.content' &&
      typeof condition.value === 'string' &&
      condition.value.includes('@')) {
    const originalContent = getNestedValue(flatContext, 'message.metadata.originalContent');
    if (originalContent && typeof originalContent === 'string') {
      const resultWithOriginal = evaluateOperator(originalContent, condition.operator, condition.value);
      if (resultWithOriginal) {
        console.log(`[ConditionEval] ${condition.field} ${condition.operator} ${JSON.stringify(condition.value)} => ${resultWithOriginal} (via originalContent: "${originalContent.substring(0, 50)}")`);
        return resultWithOriginal;
      }
    }
  }

  const result = evaluateOperator(fieldValue, condition.operator, condition.value);
  console.log(`[ConditionEval] ${condition.field} ${condition.operator} ${JSON.stringify(condition.value)} => ${result} (actual: ${JSON.stringify(fieldValue)})`);
  return result;
}

function isConditionGroup(item: Condition | ConditionGroup): item is ConditionGroup {
  return 'logic' in item && 'conditions' in item;
}

export function evaluateConditions(
  group: ConditionGroup,
  context: ExecutionContext
): boolean {
  const flatContext = flattenContext(context);

  if (group.conditions.length === 0) {
    console.log(`[ConditionEval] Empty conditions group (${group.logic}) => true (matches all)`);
    return true;
  }

  console.log(`[ConditionEval] Evaluating ${group.conditions.length} condition(s) with logic: ${group.logic}`);

  const results = group.conditions.map((item) => {
    if (isConditionGroup(item)) {
      return evaluateConditions(item, context);
    }
    return evaluateCondition(item, flatContext);
  });

  const finalResult = group.logic === 'and' ? results.every(Boolean) : results.some(Boolean);
  console.log(`[ConditionEval] Group result (${group.logic}): [${results.join(', ')}] => ${finalResult}`);
  console.log(`[ConditionEval] RETURNING: ${finalResult} (typeof: ${typeof finalResult}, strictTrue: ${finalResult === true})`);

  return finalResult;
}

export function createAlwaysTrueCondition(): ConditionGroup {
  return { logic: 'and', conditions: [] };
}

export function createSimpleCondition(
  field: string,
  operator: ConditionOperator,
  value: unknown
): ConditionGroup {
  return {
    logic: 'and',
    conditions: [{ field, operator, value }],
  };
}
