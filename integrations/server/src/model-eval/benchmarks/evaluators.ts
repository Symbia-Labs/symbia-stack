/**
 * Benchmark Evaluators
 *
 * Functions that score model outputs against expected results.
 * Each evaluator returns a score between 0 and 1.
 */

import type { TestCase, TestCaseResult } from "../types.js";

// =============================================================================
// Types
// =============================================================================

export interface EvaluatorContext {
  testCase: TestCase;
  output: string;
  functionCall?: {
    name: string;
    arguments: Record<string, unknown>;
  };
}

export interface EvaluatorResult {
  passed: boolean;
  score: number;
  reason?: string;
}

export type Evaluator = (context: EvaluatorContext) => EvaluatorResult;

// =============================================================================
// Evaluator Registry
// =============================================================================

const evaluatorRegistry = new Map<string, Evaluator>();

export function registerEvaluator(name: string, evaluator: Evaluator): void {
  evaluatorRegistry.set(name, evaluator);
}

export function getEvaluator(name: string): Evaluator | undefined {
  return evaluatorRegistry.get(name);
}

// =============================================================================
// Built-in Evaluators
// =============================================================================

/**
 * Exact match evaluator
 * Scores 1.0 if output exactly matches expected, 0 otherwise
 */
export const exactEvaluator: Evaluator = (context) => {
  const expected = context.testCase.expected.content;
  if (!expected) {
    return { passed: false, score: 0, reason: "No expected content defined" };
  }

  const normalizedOutput = context.output.trim().toLowerCase();
  const normalizedExpected = expected.trim().toLowerCase();

  const passed = normalizedOutput === normalizedExpected;
  return {
    passed,
    score: passed ? 1 : 0,
    reason: passed ? "Exact match" : `Expected "${expected}", got "${context.output.slice(0, 100)}..."`,
  };
};

/**
 * Contains evaluator
 * Scores based on how many expected substrings are found
 */
export const containsEvaluator: Evaluator = (context) => {
  const { contains, notContains } = context.testCase.expected;
  const outputLower = context.output.toLowerCase();

  let score = 1;
  const reasons: string[] = [];

  // Check required substrings
  if (contains && contains.length > 0) {
    let foundCount = 0;
    for (const substring of contains) {
      if (outputLower.includes(substring.toLowerCase())) {
        foundCount++;
      } else {
        reasons.push(`Missing: "${substring}"`);
      }
    }
    score = foundCount / contains.length;
  }

  // Check forbidden substrings
  if (notContains && notContains.length > 0) {
    for (const substring of notContains) {
      if (outputLower.includes(substring.toLowerCase())) {
        score = Math.max(0, score - 0.25);
        reasons.push(`Should not contain: "${substring}"`);
      }
    }
  }

  const passed = score >= 0.5;
  return {
    passed,
    score,
    reason: reasons.length > 0 ? reasons.join("; ") : "All expected content found",
  };
};

/**
 * Regex evaluator
 * Scores 1.0 if output matches the pattern, 0 otherwise
 */
export const regexEvaluator: Evaluator = (context) => {
  const pattern = context.testCase.expected.pattern;
  if (!pattern) {
    return { passed: false, score: 0, reason: "No pattern defined" };
  }

  try {
    const regex = new RegExp(pattern, "i");
    const passed = regex.test(context.output);
    return {
      passed,
      score: passed ? 1 : 0,
      reason: passed ? "Pattern matched" : `Pattern "${pattern}" not found`,
    };
  } catch (error) {
    return {
      passed: false,
      score: 0,
      reason: `Invalid regex pattern: ${error}`,
    };
  }
};

/**
 * JSON Schema evaluator
 * Validates that output is valid JSON matching the expected schema
 */
export const jsonSchemaEvaluator: Evaluator = (context) => {
  const schema = context.testCase.expected.schema;
  if (!schema) {
    return { passed: false, score: 0, reason: "No schema defined" };
  }

  // Try to extract JSON from the output
  let jsonContent: unknown;
  try {
    // Try direct parse first
    jsonContent = JSON.parse(context.output);
  } catch {
    // Try to find JSON in markdown code blocks
    const jsonMatch = context.output.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      try {
        jsonContent = JSON.parse(jsonMatch[1].trim());
      } catch {
        return { passed: false, score: 0, reason: "Could not parse JSON from output" };
      }
    } else {
      // Try to find JSON object/array in the output
      const objectMatch = context.output.match(/\{[\s\S]*\}/);
      const arrayMatch = context.output.match(/\[[\s\S]*\]/);
      const match = objectMatch || arrayMatch;
      if (match) {
        try {
          jsonContent = JSON.parse(match[0]);
        } catch {
          return { passed: false, score: 0, reason: "Could not parse JSON from output" };
        }
      } else {
        return { passed: false, score: 0, reason: "No JSON found in output" };
      }
    }
  }

  // Basic schema validation (simplified - doesn't handle all JSON Schema features)
  const validationResult = validateAgainstSchema(jsonContent, schema);
  return validationResult;
};

/**
 * Function call evaluator
 * Validates that the correct function was called with expected arguments
 */
export const functionCallEvaluator: Evaluator = (context) => {
  const expected = context.testCase.expected.functionCall;
  if (!expected) {
    return { passed: false, score: 0, reason: "No expected function call defined" };
  }

  if (!context.functionCall) {
    return { passed: false, score: 0, reason: "No function call in output" };
  }

  let score = 0;
  const reasons: string[] = [];

  // Check function name (50% of score)
  if (context.functionCall.name === expected.name) {
    score += 0.5;
  } else {
    reasons.push(`Wrong function: expected "${expected.name}", got "${context.functionCall.name}"`);
  }

  // Check arguments if expected (50% of score)
  if (expected.arguments) {
    const argScore = compareArguments(expected.arguments, context.functionCall.arguments);
    score += argScore * 0.5;
    if (argScore < 1) {
      reasons.push(`Argument mismatch (${Math.round(argScore * 100)}% match)`);
    }
  } else {
    // No argument requirements, give full points for correct function
    score += 0.5;
  }

  const passed = score >= 0.75;
  return {
    passed,
    score,
    reason: reasons.length > 0 ? reasons.join("; ") : "Function call matches",
  };
};

/**
 * Semantic similarity evaluator (placeholder - would need embeddings)
 * For now, falls back to contains-based similarity
 */
export const semanticEvaluator: Evaluator = (context) => {
  // TODO: Implement actual semantic similarity using embeddings
  // For now, use a weighted combination of exact and contains
  const containsResult = containsEvaluator(context);

  // Boost score slightly for longer, more detailed responses
  const lengthBonus = Math.min(0.1, context.output.length / 1000 * 0.1);

  return {
    passed: containsResult.passed,
    score: Math.min(1, containsResult.score + lengthBonus),
    reason: `Semantic evaluation (using contains fallback): ${containsResult.reason}`,
  };
};

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Basic JSON schema validation
 */
function validateAgainstSchema(
  value: unknown,
  schema: Record<string, unknown>
): EvaluatorResult {
  const type = schema.type as string;
  const reasons: string[] = [];
  let score = 1;

  // Type check
  if (type) {
    const actualType = Array.isArray(value) ? "array" : typeof value;
    if (type === "integer" && typeof value === "number" && !Number.isInteger(value)) {
      score -= 0.25;
      reasons.push("Expected integer, got float");
    } else if (type !== actualType && !(type === "integer" && actualType === "number")) {
      score -= 0.5;
      reasons.push(`Expected type "${type}", got "${actualType}"`);
    }
  }

  // Object properties
  if (type === "object" && typeof value === "object" && value !== null) {
    const obj = value as Record<string, unknown>;
    const properties = schema.properties as Record<string, Record<string, unknown>> | undefined;
    const required = schema.required as string[] | undefined;

    // Check required properties
    if (required) {
      for (const prop of required) {
        if (!(prop in obj)) {
          score -= 0.2;
          reasons.push(`Missing required property: "${prop}"`);
        }
      }
    }

    // Validate each property against its schema
    if (properties) {
      for (const [key, propSchema] of Object.entries(properties)) {
        if (key in obj) {
          const propResult = validateAgainstSchema(obj[key], propSchema);
          if (!propResult.passed) {
            score -= 0.1;
            reasons.push(`Property "${key}": ${propResult.reason}`);
          }
        }
      }
    }
  }

  // Enum check
  if (schema.enum && Array.isArray(schema.enum)) {
    if (!schema.enum.includes(value)) {
      score -= 0.3;
      reasons.push(`Value not in enum: expected one of ${JSON.stringify(schema.enum)}`);
    }
  }

  // Range checks for numbers
  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < (schema.minimum as number)) {
      score -= 0.2;
      reasons.push(`Value ${value} below minimum ${schema.minimum}`);
    }
    if (schema.maximum !== undefined && value > (schema.maximum as number)) {
      score -= 0.2;
      reasons.push(`Value ${value} above maximum ${schema.maximum}`);
    }
  }

  score = Math.max(0, score);
  return {
    passed: score >= 0.5,
    score,
    reason: reasons.length > 0 ? reasons.join("; ") : "Schema validation passed",
  };
}

/**
 * Compare function call arguments
 */
function compareArguments(
  expected: Record<string, unknown>,
  actual: Record<string, unknown>
): number {
  const expectedKeys = Object.keys(expected);
  if (expectedKeys.length === 0) return 1;

  let matchCount = 0;
  for (const key of expectedKeys) {
    if (key in actual) {
      const expectedVal = expected[key];
      const actualVal = actual[key];

      // Deep comparison for objects
      if (typeof expectedVal === "object" && typeof actualVal === "object") {
        if (JSON.stringify(expectedVal) === JSON.stringify(actualVal)) {
          matchCount++;
        } else {
          // Partial match for nested objects
          matchCount += 0.5;
        }
      } else if (expectedVal === actualVal) {
        matchCount++;
      } else if (
        typeof expectedVal === "string" &&
        typeof actualVal === "string" &&
        actualVal.toLowerCase().includes(expectedVal.toLowerCase())
      ) {
        // Partial match for strings
        matchCount += 0.75;
      }
    }
  }

  return matchCount / expectedKeys.length;
}

// =============================================================================
// Initialize Built-in Evaluators
// =============================================================================

registerEvaluator("exact", exactEvaluator);
registerEvaluator("contains", containsEvaluator);
registerEvaluator("regex", regexEvaluator);
registerEvaluator("json_schema", jsonSchemaEvaluator);
registerEvaluator("function_call", functionCallEvaluator);
registerEvaluator("semantic", semanticEvaluator);
registerEvaluator("custom", containsEvaluator); // Fallback for custom

/**
 * Evaluate a test case result
 */
export function evaluate(context: EvaluatorContext): EvaluatorResult {
  const evaluatorType = context.testCase.evaluator;
  const evaluator = getEvaluator(evaluatorType);

  if (!evaluator) {
    return {
      passed: false,
      score: 0,
      reason: `Unknown evaluator type: ${evaluatorType}`,
    };
  }

  return evaluator(context);
}
