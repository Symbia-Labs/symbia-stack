import { platformClient } from './platformClient';
import { usePlatformStore } from '@/stores/platformStore';
import { SERVICES } from '@/config/services';

export interface CommandResult {
  success: boolean;
  message: string;
  data?: unknown;
  action?: 'navigate' | 'display' | 'execute';
  target?: string;
}

interface Command {
  pattern: RegExp;
  description: string;
  examples: string[];
  handler: (args: string[], input: string) => Promise<CommandResult>;
}

const commands: Command[] = [
  // Status commands
  {
    pattern: /^\/status$/i,
    description: 'Show status of all services',
    examples: ['/status'],
    handler: async () => {
      const health = await platformClient.checkAllHealth();
      const healthy = health.filter((h) => h.status === 'healthy').length;
      return {
        success: true,
        message: `${healthy}/${SERVICES.length} services healthy`,
        data: health,
        action: 'navigate',
        target: 'status',
      };
    },
  },
  {
    pattern: /^\/health\s+(\w+)$/i,
    description: 'Check health of a specific service',
    examples: ['/health identity', '/health messaging'],
    handler: async (args) => {
      const serviceId = args[1].toLowerCase();
      const service = SERVICES.find((s) => s.id === serviceId);
      if (!service) {
        return {
          success: false,
          message: `Unknown service: ${serviceId}. Available: ${SERVICES.map((s) => s.id).join(', ')}`,
        };
      }
      const health = await platformClient.checkHealth(serviceId);
      return {
        success: health.status === 'healthy',
        message: `${service.name} (${service.port}): ${health.status}${health.latencyMs ? ` (${health.latencyMs}ms)` : ''}`,
        data: health,
      };
    },
  },

  // Resource commands
  {
    pattern: /^\/resources$/i,
    description: 'List catalog resources',
    examples: ['/resources'],
    handler: async () => {
      const resources = await platformClient.listCatalogResources({ limit: 20 });
      return {
        success: true,
        message: `Found ${resources.length} resources`,
        data: resources,
        action: 'navigate',
        target: 'resources',
      };
    },
  },
  {
    pattern: /^\/resources\s+(\w+)$/i,
    description: 'List resources by type',
    examples: ['/resources graph', '/resources component', '/resources assistant'],
    handler: async (args) => {
      const type = args[1].toLowerCase();
      const resources = await platformClient.listCatalogResources({ type, limit: 20 });
      return {
        success: true,
        message: `Found ${resources.length} ${type} resources`,
        data: resources,
        action: 'navigate',
        target: 'resources',
      };
    },
  },

  // Agent/Assistant commands
  {
    pattern: /^\/assistants$/i,
    description: 'List available assistants',
    examples: ['/assistants'],
    handler: async () => {
      const assistants = await platformClient.listAssistants();
      return {
        success: true,
        message: `Found ${assistants.length} assistants`,
        data: assistants,
        action: 'navigate',
        target: 'agents',
      };
    },
  },

  // Execution commands
  {
    pattern: /^\/run\s+(.+)$/i,
    description: 'Execute a graph by ID',
    examples: ['/run my-graph-id'],
    handler: async (args) => {
      const graphId = args[1];
      const result = await platformClient.executeGraph(graphId);
      if (result) {
        return {
          success: true,
          message: `Graph execution started: ${result.executionId}`,
          data: result,
          action: 'execute',
        };
      }
      return {
        success: false,
        message: `Failed to execute graph: ${graphId}`,
      };
    },
  },

  // Navigation commands
  {
    pattern: /^\/logs$/i,
    description: 'Show logs from logging service',
    examples: ['/logs'],
    handler: async () => {
      return {
        success: true,
        message: 'Showing logs',
        action: 'navigate',
        target: 'logs',
      };
    },
  },
  {
    pattern: /^\/events$/i,
    description: 'Show event stream',
    examples: ['/events'],
    handler: async () => {
      return {
        success: true,
        message: 'Showing event stream',
        action: 'navigate',
        target: 'events',
      };
    },
  },
  {
    pattern: /^\/chat$/i,
    description: 'Switch to chat mode',
    examples: ['/chat'],
    handler: async () => {
      return {
        success: true,
        message: 'Switched to chat mode',
        action: 'navigate',
        target: 'chat',
      };
    },
  },

  // Help command
  {
    pattern: /^\/help$/i,
    description: 'Show available commands',
    examples: ['/help'],
    handler: async () => {
      const helpText = commands
        .map((cmd) => `  ${cmd.examples[0]} - ${cmd.description}`)
        .join('\n');
      return {
        success: true,
        message: `Available commands:\n${helpText}`,
      };
    },
  },

  // Clear events
  {
    pattern: /^\/clear$/i,
    description: 'Clear event stream',
    examples: ['/clear'],
    handler: async () => {
      usePlatformStore.getState().clearEvents();
      return {
        success: true,
        message: 'Events cleared',
      };
    },
  },
];

// Natural language patterns
const nlPatterns: Array<{
  pattern: RegExp;
  command: string;
}> = [
  { pattern: /show\s+(me\s+)?status/i, command: '/status' },
  { pattern: /check\s+health/i, command: '/status' },
  { pattern: /list\s+resources/i, command: '/resources' },
  { pattern: /show\s+(me\s+)?resources/i, command: '/resources' },
  { pattern: /list\s+assistants/i, command: '/assistants' },
  { pattern: /show\s+(me\s+)?assistants/i, command: '/assistants' },
  { pattern: /show\s+(me\s+)?events/i, command: '/events' },
  { pattern: /show\s+(me\s+)?logs/i, command: '/logs' },
  { pattern: /view\s+logs/i, command: '/logs' },
  { pattern: /what\s+commands/i, command: '/help' },
  { pattern: /help\s+(me)?/i, command: '/help' },
];

export async function parseAndExecuteCommand(input: string): Promise<CommandResult | null> {
  const trimmed = input.trim();

  // Check for slash commands first
  if (trimmed.startsWith('/')) {
    for (const cmd of commands) {
      const match = trimmed.match(cmd.pattern);
      if (match) {
        return cmd.handler(match, trimmed);
      }
    }
    // Unknown slash command
    return {
      success: false,
      message: `Unknown command. Type /help for available commands.`,
    };
  }

  // Check for natural language patterns
  for (const nl of nlPatterns) {
    if (nl.pattern.test(trimmed)) {
      return parseAndExecuteCommand(nl.command);
    }
  }

  // Not a command - return null to indicate it should be treated as a message
  return null;
}

export function getCommandSuggestions(input: string): string[] {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed.startsWith('/')) return [];

  return commands
    .flatMap((cmd) => cmd.examples)
    .filter((example) => example.toLowerCase().startsWith(trimmed))
    .slice(0, 5);
}
