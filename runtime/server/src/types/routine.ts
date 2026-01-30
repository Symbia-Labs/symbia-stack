/**
 * Routine Types
 *
 * Type definitions for the plain-English routine DSL.
 * Routines are high-level behavior specifications that compile
 * to executable graph definitions.
 */

/**
 * Supported LLM providers
 */
export type LLMProvider =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'mistral'
  | 'cohere'
  | 'huggingface';

/**
 * LLM configuration for a routine or step
 */
export interface LLMConfig {
  provider?: LLMProvider;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
}

/**
 * Step types - the primitive actions in a routine
 */
export type RoutineStepType =
  | 'say'      // Send a message to the user
  | 'ask'      // Ask a question and wait for response
  | 'think'    // LLM reasoning step
  | 'remember' // Store a value in context
  | 'recall'   // Retrieve a value (@ reference)
  | 'wait'     // Pause execution
  | 'check'    // Conditional branch
  | 'call'     // Call another routine
  | 'repeat'   // Loop construct
  | 'stop';    // End execution

/**
 * A single step in a routine
 */
export interface RoutineStep {
  id: string;
  type: RoutineStepType;
  description: string;
  params?: Record<string, unknown>;
  /** LLM config override for this step (think, check, say steps) */
  llm?: LLMConfig;
}

/**
 * A routine - a named sequence of steps with optional trigger
 */
export interface Routine {
  id: string;
  name: string;
  trigger?: string;      // When this routine activates
  isMain?: boolean;      // Entry point routine
  steps: RoutineStep[];
}

/**
 * Complete routine definition for an assistant
 */
export interface RoutineDefinition {
  symbia: 'routine/1.0';  // Version marker
  name: string;
  version: string;
  description?: string;
  assistantId: string;    // The assistant these routines belong to
  alias?: string;         // @mention alias
  routines: Routine[];
  variables?: Record<string, VariableDefinition>;
  capabilities?: string[];
  /** Default LLM configuration for all routines */
  llm?: LLMConfig;
}

/**
 * Variable type definitions for routine context
 */
export interface VariableDefinition {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description?: string;
  default?: unknown;
}

/**
 * Compiled result - contains the graph plus metadata
 */
export interface CompiledRoutine {
  graphId: string;
  assistantId: string;
  routine: Routine;
  nodeMapping: Map<string, string>;  // step.id -> node.id
}

/**
 * Type guard for routine definitions
 */
export function isRoutineDefinition(obj: unknown): obj is RoutineDefinition {
  if (typeof obj !== 'object' || obj === null) return false;
  const def = obj as Record<string, unknown>;
  return def.symbia === 'routine/1.0' && Array.isArray(def.routines);
}

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  path: string;
  message: string;
  code: string;
}

export interface ValidationWarning {
  path: string;
  message: string;
  code: string;
}
