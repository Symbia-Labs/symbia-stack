import type { ActionHandler } from './base.js';
import { LLMInvokeHandler } from './llm-invoke.js';
import { HandoffCreateHandler, HandoffAssignHandler, HandoffResolveHandler } from './handoff.js';
import { MessageSendHandler } from './message.js';
import { NotifyHandler } from './notify.js';
import { StateTransitionHandler } from './state-transition.js';
import { ContextUpdateHandler } from './context-update.js';
import { WebhookCallHandler } from './webhook-call.js';
import { ServiceCallHandler } from './service-call.js';
// Orchestration actions
import { WaitHandler } from './wait.js';
import { ParallelHandler } from './parallel.js';
import { ConditionHandler } from './condition.js';
import { LoopHandler } from './loop.js';
// Coordinator actions
import { AssistantRouteHandler } from './assistant-route.js';
import { EmbeddingRouteHandler } from './embedding-route.js';
// Tool actions (built-in tools like math, convert)
import { ToolInvokeHandler } from './tool-invoke.js';
// Code agent actions
import { CodeToolInvokeHandler, WorkspaceCreateHandler, WorkspaceDestroyHandler } from './code-tool-invoke.js';
// Integration actions
import { IntegrationInvokeHandler } from './integration-invoke.js';

const handlers: ActionHandler[] = [
  new LLMInvokeHandler(),
  new HandoffCreateHandler(),
  new HandoffAssignHandler(),
  new HandoffResolveHandler(),
  new MessageSendHandler(),
  new NotifyHandler(),
  new StateTransitionHandler(),
  new ContextUpdateHandler(),
  new WebhookCallHandler(),
  new ServiceCallHandler(),
  // Orchestration
  new WaitHandler(),
  new ParallelHandler(),
  new ConditionHandler(),
  new LoopHandler(),
  // Coordinator
  new AssistantRouteHandler(),
  new EmbeddingRouteHandler(),
  // Built-in tools
  new ToolInvokeHandler(),
  // Code agent
  new CodeToolInvokeHandler(),
  new WorkspaceCreateHandler(),
  new WorkspaceDestroyHandler(),
  // Integrations
  new IntegrationInvokeHandler(),
];

const handlerMap = new Map<string, ActionHandler>();
for (const handler of handlers) {
  handlerMap.set(handler.type, handler);
}

export function getActionHandler(type: string): ActionHandler | undefined {
  return handlerMap.get(type);
}

export function getAllActionHandlers(): ActionHandler[] {
  return [...handlers];
}

export function registerActionHandler(handler: ActionHandler): void {
  handlerMap.set(handler.type, handler);
  handlers.push(handler);
}

export * from './base.js';
export * from './llm-invoke.js';
export * from './handoff.js';
export * from './message.js';
export * from './notify.js';
export * from './state-transition.js';
export * from './context-update.js';
export * from './webhook-call.js';
export * from './service-call.js';
// Orchestration
export * from './wait.js';
export * from './parallel.js';
export * from './condition.js';
export * from './loop.js';
// Coordinator
export * from './assistant-route.js';
export * from './embedding-route.js';
// Built-in tools
export * from './tool-invoke.js';
// Code agent
export * from './code-tool-invoke.js';
// Integrations
export * from './integration-invoke.js';
