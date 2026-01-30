import type { ActionConfig, ActionResult, ExecutionContext } from '../types.js';

export interface ActionHandler {
  type: string;
  execute(config: ActionConfig, context: ExecutionContext): Promise<ActionResult>;
}

export abstract class BaseActionHandler implements ActionHandler {
  abstract type: string;
  
  abstract execute(config: ActionConfig, context: ExecutionContext): Promise<ActionResult>;
  
  protected success(output: unknown, durationMs: number): ActionResult {
    return {
      success: true,
      actionType: this.type as ActionResult['actionType'],
      output,
      durationMs,
    };
  }
  
  protected failure(error: string, durationMs: number): ActionResult {
    return {
      success: false,
      actionType: this.type as ActionResult['actionType'],
      error,
      durationMs,
    };
  }
}
