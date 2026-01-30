/**
 * Routine Compiler
 *
 * Transforms plain-English routine definitions into executable
 * graph definitions that the runtime can execute.
 *
 * The compilation is deterministic - the same routine always
 * produces the same graph structure. The semantic interpretation
 * of descriptions happens at runtime via LLM.
 */

import type {
  RoutineDefinition,
  Routine,
  RoutineStep,
  ValidationResult,
  ValidationError,
  ValidationWarning,
  CompiledRoutine,
  LLMConfig,
} from '../types/routine.js';
import type { GraphDefinition, GraphNode, GraphEdge } from '../types/graph.js';

/**
 * Compiler options
 */
export interface CompilerOptions {
  /** Generate debug metadata */
  debug?: boolean;
  /** Optimize the generated graph */
  optimize?: boolean;
  /** Include source mapping info */
  sourceMap?: boolean;
}

/**
 * Compilation result
 */
export interface CompilationResult {
  /** The compiled graph definitions (one per routine) */
  graphs: GraphDefinition[];
  /** Mapping from routine to compiled info */
  compiledRoutines: CompiledRoutine[];
  /** Any warnings during compilation */
  warnings: ValidationWarning[];
  /** Compilation metadata */
  metadata: {
    compilerVersion: string;
    compiledAt: string;
    sourceHash: string;
    routineCount: number;
    totalNodeCount: number;
    totalEdgeCount: number;
  };
}

/**
 * Step type to component mapping
 */
const STEP_TYPE_TO_COMPONENT: Record<string, string> = {
  say: 'symbia.routine.say',
  ask: 'symbia.routine.ask',
  think: 'symbia.routine.think',
  remember: 'symbia.routine.remember',
  recall: 'symbia.routine.recall',
  wait: 'symbia.routine.wait',
  check: 'symbia.routine.check',
  call: 'symbia.routine.call',
  repeat: 'symbia.routine.repeat',
  stop: 'symbia.routine.stop',
};

/**
 * RoutineCompiler class
 */
export class RoutineCompiler {
  private options: CompilerOptions;

  constructor(options: CompilerOptions = {}) {
    this.options = {
      debug: false,
      optimize: true,
      sourceMap: false,
      ...options,
    };
  }

  /**
   * Validate a routine definition
   */
  validate(definition: RoutineDefinition): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Check required fields
    if (!definition.symbia || definition.symbia !== 'routine/1.0') {
      errors.push({
        path: 'symbia',
        message: 'Invalid or missing symbia version. Expected "routine/1.0"',
        code: 'INVALID_VERSION',
      });
    }

    if (!definition.name) {
      errors.push({
        path: 'name',
        message: 'Routine definition must have a name',
        code: 'MISSING_NAME',
      });
    }

    if (!definition.version) {
      errors.push({
        path: 'version',
        message: 'Routine definition must have a version',
        code: 'MISSING_VERSION',
      });
    }

    if (!definition.assistantId) {
      errors.push({
        path: 'assistantId',
        message: 'Routine definition must specify an assistantId',
        code: 'MISSING_ASSISTANT_ID',
      });
    }

    if (!Array.isArray(definition.routines) || definition.routines.length === 0) {
      errors.push({
        path: 'routines',
        message: 'Routine definition must have at least one routine',
        code: 'NO_ROUTINES',
      });
    }

    // Validate each routine
    const routineNames = new Set<string>();
    definition.routines?.forEach((routine, idx) => {
      const routinePath = `routines[${idx}]`;

      if (!routine.id) {
        errors.push({
          path: `${routinePath}.id`,
          message: 'Routine must have an id',
          code: 'MISSING_ROUTINE_ID',
        });
      }

      if (!routine.name) {
        errors.push({
          path: `${routinePath}.name`,
          message: 'Routine must have a name',
          code: 'MISSING_ROUTINE_NAME',
        });
      }

      if (routineNames.has(routine.name)) {
        errors.push({
          path: `${routinePath}.name`,
          message: `Duplicate routine name: ${routine.name}`,
          code: 'DUPLICATE_ROUTINE_NAME',
        });
      }
      routineNames.add(routine.name);

      if (!Array.isArray(routine.steps) || routine.steps.length === 0) {
        warnings.push({
          path: `${routinePath}.steps`,
          message: 'Routine has no steps',
          code: 'EMPTY_ROUTINE',
        });
      }

      // Validate steps
      routine.steps?.forEach((step, stepIdx) => {
        const stepPath = `${routinePath}.steps[${stepIdx}]`;

        if (!step.id) {
          errors.push({
            path: `${stepPath}.id`,
            message: 'Step must have an id',
            code: 'MISSING_STEP_ID',
          });
        }

        if (!step.type) {
          errors.push({
            path: `${stepPath}.type`,
            message: 'Step must have a type',
            code: 'MISSING_STEP_TYPE',
          });
        } else if (!STEP_TYPE_TO_COMPONENT[step.type]) {
          errors.push({
            path: `${stepPath}.type`,
            message: `Unknown step type: ${step.type}`,
            code: 'UNKNOWN_STEP_TYPE',
          });
        }

        if (!step.description) {
          warnings.push({
            path: `${stepPath}.description`,
            message: 'Step has no description',
            code: 'MISSING_STEP_DESCRIPTION',
          });
        }

        // Type-specific validation
        if (step.type === 'call') {
          const targetRoutine = step.params?.routineName as string;
          if (targetRoutine && !routineNames.has(targetRoutine)) {
            // Check if target exists in definition
            const exists = definition.routines?.some(r => r.name === targetRoutine);
            if (!exists) {
              warnings.push({
                path: `${stepPath}.params.routineName`,
                message: `Call target routine "${targetRoutine}" not found in definition`,
                code: 'UNKNOWN_CALL_TARGET',
              });
            }
          }
        }
      });
    });

    // Check for main routine
    const hasMain = definition.routines?.some(r => r.isMain);
    if (!hasMain) {
      warnings.push({
        path: 'routines',
        message: 'No main routine defined. First routine will be used as entry point.',
        code: 'NO_MAIN_ROUTINE',
      });
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Compile a routine definition into graph definitions
   */
  compile(definition: RoutineDefinition, options?: CompilerOptions): CompilationResult {
    const opts = { ...this.options, ...options };

    // Validate first
    const validation = this.validate(definition);
    if (!validation.valid) {
      throw new CompilationError(
        'Validation failed',
        validation.errors
      );
    }

    const compiledRoutines: CompiledRoutine[] = [];
    const graphs: GraphDefinition[] = [];
    let totalNodeCount = 0;
    let totalEdgeCount = 0;

    // Compile each routine
    for (const routine of definition.routines) {
      const { graph, nodeMapping } = this.compileRoutine(
        routine,
        definition,
        opts
      );

      graphs.push(graph);
      compiledRoutines.push({
        graphId: graph.name,
        assistantId: definition.assistantId,
        routine,
        nodeMapping,
      });

      totalNodeCount += graph.nodes.length;
      totalEdgeCount += graph.edges.length;
    }

    return {
      graphs,
      compiledRoutines,
      warnings: validation.warnings,
      metadata: {
        compilerVersion: '1.0.0',
        compiledAt: new Date().toISOString(),
        sourceHash: this.hashDefinition(definition),
        routineCount: definition.routines.length,
        totalNodeCount,
        totalEdgeCount,
      },
    };
  }

  /**
   * Compile a single routine into a graph
   */
  private compileRoutine(
    routine: Routine,
    definition: RoutineDefinition,
    options: CompilerOptions
  ): { graph: GraphDefinition; nodeMapping: Map<string, string> } {
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];
    const nodeMapping = new Map<string, string>();

    // Create entry node (receives trigger/input)
    const entryNodeId = `${routine.id}-entry`;
    nodes.push({
      id: entryNodeId,
      component: 'symbia.core.passthrough',
      config: {
        routineId: routine.id,
        routineName: routine.name,
        trigger: routine.trigger,
      },
      position: { x: 0, y: 0 },
    });

    // Process each step
    let prevNodeId = entryNodeId;
    let prevOutputPort = 'output';
    let yOffset = 100;

    for (let i = 0; i < routine.steps.length; i++) {
      const step = routine.steps[i];
      const nodeId = `${routine.id}-${step.id}`;
      nodeMapping.set(step.id, nodeId);

      const component = STEP_TYPE_TO_COMPONENT[step.type];
      if (!component) {
        throw new CompilationError(
          `Unknown step type: ${step.type}`,
          [{ path: `step.${step.id}`, message: `Unknown type`, code: 'UNKNOWN_TYPE' }]
        );
      }

      // Merge LLM config: definition-level defaults + step-level overrides
      const llmConfig = this.mergeLLMConfig(definition.llm, step.llm);

      // Create node for step
      const node: GraphNode = {
        id: nodeId,
        component,
        config: {
          description: step.description,
          ...(step.params || {}),
          // Include LLM config for steps that use it
          ...(this.stepUsesLLM(step.type) && llmConfig ? { llm: llmConfig } : {}),
        },
        position: { x: 200, y: yOffset },
      };

      // Add debug metadata
      if (options.debug) {
        node.config._debug = {
          stepId: step.id,
          stepIndex: i,
          stepType: step.type,
          routineId: routine.id,
        };
      }

      nodes.push(node);

      // Connect to previous node
      edges.push({
        id: `edge-${prevNodeId}-to-${nodeId}`,
        source: { node: prevNodeId, port: prevOutputPort },
        target: { node: nodeId, port: 'input' },
      });

      // Handle conditional branching (check step)
      if (step.type === 'check') {
        // Look ahead for the conditional target
        const nextStep = routine.steps[i + 1];
        if (nextStep) {
          const nextNodeId = `${routine.id}-${nextStep.id}`;
          // True branch goes to next step
          // False branch skips (connect later or to exit)
          prevOutputPort = 'true';
        } else {
          prevOutputPort = 'output';
        }
      } else if (step.type === 'repeat') {
        // Loop back edge will be created after processing body
        prevOutputPort = 'output';
      } else {
        prevOutputPort = 'output';
      }

      prevNodeId = nodeId;
      yOffset += 100;
    }

    // Create exit node
    const exitNodeId = `${routine.id}-exit`;
    nodes.push({
      id: exitNodeId,
      component: 'symbia.core.passthrough',
      config: {
        routineId: routine.id,
        exitPoint: true,
      },
      position: { x: 200, y: yOffset },
    });

    edges.push({
      id: `edge-${prevNodeId}-to-exit`,
      source: { node: prevNodeId, port: prevOutputPort },
      target: { node: exitNodeId, port: 'input' },
    });

    // Build graph definition
    const graph: GraphDefinition = {
      symbia: '1.0',
      name: `${definition.assistantId}/${routine.name.toLowerCase().replace(/\s+/g, '-')}`,
      version: definition.version,
      description: routine.trigger || `Routine: ${routine.name}`,
      nodes,
      edges,
      metadata: {
        compiledFrom: 'routine',
        routineId: routine.id,
        routineName: routine.name,
        assistantId: definition.assistantId,
        assistantAlias: definition.alias,
        isMain: routine.isMain || false,
        trigger: routine.trigger,
        // Include default LLM config at graph level
        llm: definition.llm,
      },
    };

    return { graph, nodeMapping };
  }

  /**
   * Generate a hash for the definition (for caching)
   */
  private hashDefinition(definition: RoutineDefinition): string {
    const str = JSON.stringify(definition);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16).padStart(8, '0');
  }

  /**
   * Check if a step type uses LLM
   */
  private stepUsesLLM(stepType: string): boolean {
    // These step types invoke the LLM for interpretation
    return ['think', 'say', 'ask', 'check'].includes(stepType);
  }

  /**
   * Merge LLM configs with step-level taking precedence
   */
  private mergeLLMConfig(
    definitionLevel?: LLMConfig,
    stepLevel?: LLMConfig
  ): LLMConfig | undefined {
    if (!definitionLevel && !stepLevel) return undefined;
    if (!definitionLevel) return stepLevel;
    if (!stepLevel) return definitionLevel;

    return {
      provider: stepLevel.provider ?? definitionLevel.provider,
      model: stepLevel.model ?? definitionLevel.model,
      temperature: stepLevel.temperature ?? definitionLevel.temperature,
      maxTokens: stepLevel.maxTokens ?? definitionLevel.maxTokens,
      systemPrompt: stepLevel.systemPrompt ?? definitionLevel.systemPrompt,
    };
  }
}

/**
 * Compilation error
 */
export class CompilationError extends Error {
  errors: ValidationError[];

  constructor(message: string, errors: ValidationError[]) {
    super(message);
    this.name = 'CompilationError';
    this.errors = errors;
  }
}

/**
 * Default compiler instance
 */
export const routineCompiler = new RoutineCompiler();
