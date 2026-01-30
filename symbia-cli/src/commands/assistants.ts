import { Command } from 'commander';
import { assistants } from '../client.js';
import { success, error, output, detail, info } from '../output.js';

interface Graph {
  id: string;
  name: string;
  description?: string;
  isPublished: boolean;
  version?: number;
  createdAt: string;
  updatedAt: string;
}

interface Run {
  id: string;
  graphId: string;
  conversationId?: string;
  status: 'running' | 'paused' | 'waiting' | 'completed' | 'failed' | 'cancelled';
  priority: 'low' | 'normal' | 'high' | 'critical';
  startedAt: string;
  updatedAt: string;
}

interface Actor {
  id: string;
  principalId: string;
  principalType: 'agent' | 'assistant';
  name: string;
  description?: string;
  isActive: boolean;
  createdAt: string;
}

interface RuleSet {
  id: string;
  orgId: string;
  name: string;
  description?: string;
  rules: unknown[];
  version: number;
  isActive: boolean;
}

interface Assistant {
  key: string;
  name: string;
  description?: string;
  status: 'active' | 'inactive' | 'draft';
  capabilities: string[];
}

interface LLMSettings {
  provider: 'openai' | 'anthropic' | 'custom';
  model: string;
  temperature: number;
  maxTokens: number;
}

export function registerAssistantsCommands(program: Command): void {
  const ast = program
    .command('assistants')
    .alias('ast')
    .description('AI assistants, graphs, rules, and actors');

  // Graphs
  const graphs = ast
    .command('graphs')
    .description('Manage workflow graphs');

  graphs
    .command('list')
    .description('List workflow graphs')
    .action(async () => {
      const res = await assistants.get<{ graphs?: Graph[] }>('/api/graphs');

      if (!res.ok) {
        error(res.error || 'Failed to list graphs');
        process.exit(1);
      }

      output(res.data?.graphs || [], {
        columns: [
          { key: 'id', header: 'ID' },
          { key: 'name', header: 'Name' },
          { key: 'isPublished', header: 'Published' },
          { key: 'version', header: 'Version' },
          { key: 'updatedAt', header: 'Updated' },
        ],
        idKey: 'id',
      });
    });

  graphs
    .command('get <id>')
    .description('Get graph details')
    .action(async (id) => {
      const res = await assistants.get<Graph>(`/api/graphs/${id}`);

      if (!res.ok) {
        error(res.error || 'Graph not found');
        process.exit(1);
      }

      const graph = res.data!;
      detail('ID', graph.id);
      detail('Name', graph.name);
      detail('Description', graph.description);
      detail('Published', graph.isPublished);
      detail('Version', graph.version);
      detail('Created', graph.createdAt);
      detail('Updated', graph.updatedAt);
    });

  graphs
    .command('create <name>')
    .description('Create a new graph')
    .option('-d, --description <desc>', 'Graph description')
    .option('--json <graphJson>', 'Graph JSON definition')
    .action(async (name, opts) => {
      const res = await assistants.post<Graph>('/api/graphs', {
        name,
        description: opts.description,
        graphJson: opts.json ? JSON.parse(opts.json) : { nodes: [], edges: [] },
      });

      if (!res.ok) {
        error(res.error || 'Failed to create graph');
        process.exit(1);
      }

      success(`Created graph: ${res.data?.name}`);
      detail('ID', res.data?.id);
    });

  graphs
    .command('update <id>')
    .description('Update a graph')
    .option('-n, --name <name>', 'New name')
    .option('-d, --description <desc>', 'New description')
    .option('--json <graphJson>', 'New graph JSON')
    .action(async (id, opts) => {
      const updates: Record<string, unknown> = {};
      if (opts.name) updates.name = opts.name;
      if (opts.description) updates.description = opts.description;
      if (opts.json) updates.graphJson = JSON.parse(opts.json);

      const res = await assistants.put<Graph>(`/api/graphs/${id}`, updates);

      if (!res.ok) {
        error(res.error || 'Failed to update graph');
        process.exit(1);
      }

      success(`Updated graph: ${res.data?.name}`);
    });

  graphs
    .command('delete <id>')
    .description('Delete a graph')
    .option('-f, --force', 'Skip confirmation')
    .action(async (id, opts) => {
      if (!opts.force) {
        error('Use --force to confirm deletion');
        process.exit(1);
      }

      const res = await assistants.delete(`/api/graphs/${id}`);

      if (!res.ok) {
        error(res.error || 'Failed to delete graph');
        process.exit(1);
      }

      success(`Deleted graph: ${id}`);
    });

  graphs
    .command('publish <id>')
    .description('Publish a graph')
    .action(async (id) => {
      const res = await assistants.post<Graph>(`/api/graphs/${id}/publish`, {});

      if (!res.ok) {
        error(res.error || 'Failed to publish graph');
        process.exit(1);
      }

      success(`Published graph: ${res.data?.name} (v${res.data?.version})`);
    });

  // Runs
  const runs = ast
    .command('runs')
    .description('Manage graph execution runs');

  runs
    .command('list')
    .description('List runs')
    .option('-g, --graph <id>', 'Filter by graph ID')
    .option('-c, --conversation <id>', 'Filter by conversation ID')
    .option('-s, --status <status>', 'Filter by status')
    .option('-l, --limit <n>', 'Maximum results', '20')
    .action(async (opts) => {
      const params: Record<string, string | number | undefined> = {
        limit: parseInt(opts.limit, 10),
      };
      if (opts.graph) params.graphId = opts.graph;
      if (opts.conversation) params.conversationId = opts.conversation;
      if (opts.status) params.status = opts.status;

      const res = await assistants.get<{ runs?: Run[] }>('/api/runs', params);

      if (!res.ok) {
        error(res.error || 'Failed to list runs');
        process.exit(1);
      }

      output(res.data?.runs || [], {
        columns: [
          { key: 'id', header: 'ID' },
          { key: 'graphId', header: 'Graph' },
          { key: 'status', header: 'Status' },
          { key: 'priority', header: 'Priority' },
          { key: 'startedAt', header: 'Started' },
        ],
        idKey: 'id',
      });
    });

  runs
    .command('get <id>')
    .description('Get run details')
    .action(async (id) => {
      const res = await assistants.get<Run>(`/api/runs/${id}`);

      if (!res.ok) {
        error(res.error || 'Run not found');
        process.exit(1);
      }

      const run = res.data!;
      detail('ID', run.id);
      detail('Graph ID', run.graphId);
      detail('Conversation ID', run.conversationId);
      detail('Status', run.status);
      detail('Priority', run.priority);
      detail('Started', run.startedAt);
      detail('Updated', run.updatedAt);
    });

  runs
    .command('logs <id>')
    .description('Get run logs')
    .option('-l, --level <level>', 'Filter by log level')
    .action(async (id, opts) => {
      const params: Record<string, string | undefined> = {};
      if (opts.level) params.level = opts.level;

      const res = await assistants.get<{ logs?: Array<{ level: string; message: string; timestamp: string }> }>(
        `/api/runs/${id}/logs`,
        params
      );

      if (!res.ok) {
        error(res.error || 'Failed to get logs');
        process.exit(1);
      }

      const logs = res.data?.logs || [];
      if (logs.length === 0) {
        info('No logs');
        return;
      }

      logs.forEach(log => {
        const time = new Date(log.timestamp).toLocaleTimeString();
        const level = log.level.toUpperCase().padEnd(5);
        console.log(`${time} [${level}] ${log.message}`);
      });
    });

  // Actors
  const actors = ast
    .command('actors')
    .description('Manage agent/assistant principals');

  actors
    .command('list')
    .description('List actors')
    .option('-t, --type <type>', 'Filter by type (agent, assistant)')
    .action(async (opts) => {
      const params: Record<string, string | undefined> = {};
      if (opts.type) params.type = opts.type;

      const res = await assistants.get<{ actors?: Actor[] }>('/api/actors', params);

      if (!res.ok) {
        error(res.error || 'Failed to list actors');
        process.exit(1);
      }

      output(res.data?.actors || [], {
        columns: [
          { key: 'id', header: 'ID' },
          { key: 'name', header: 'Name' },
          { key: 'principalType', header: 'Type' },
          { key: 'isActive', header: 'Active' },
          { key: 'createdAt', header: 'Created' },
        ],
        idKey: 'id',
      });
    });

  actors
    .command('get <id>')
    .description('Get actor details')
    .action(async (id) => {
      const res = await assistants.get<Actor>(`/api/actors/${id}`);

      if (!res.ok) {
        error(res.error || 'Actor not found');
        process.exit(1);
      }

      const actor = res.data!;
      detail('ID', actor.id);
      detail('Principal ID', actor.principalId);
      detail('Type', actor.principalType);
      detail('Name', actor.name);
      detail('Description', actor.description);
      detail('Active', actor.isActive);
      detail('Created', actor.createdAt);
    });

  actors
    .command('create <principalId>')
    .description('Register a new actor')
    .option('-n, --name <name>', 'Actor name')
    .option('-t, --type <type>', 'Principal type (agent, assistant)', 'assistant')
    .option('-d, --description <desc>', 'Description')
    .option('-g, --graph <id>', 'Default graph ID')
    .action(async (principalId, opts) => {
      const res = await assistants.post<Actor>('/api/actors', {
        principalId,
        principalType: opts.type,
        name: opts.name || principalId,
        description: opts.description,
        defaultGraphId: opts.graph,
      });

      if (!res.ok) {
        error(res.error || 'Failed to create actor');
        process.exit(1);
      }

      success(`Created actor: ${res.data?.name}`);
      detail('ID', res.data?.id);
    });

  actors
    .command('update <id>')
    .description('Update an actor')
    .option('-n, --name <name>', 'New name')
    .option('-d, --description <desc>', 'New description')
    .option('--active <bool>', 'Set active status')
    .action(async (id, opts) => {
      const updates: Record<string, unknown> = {};
      if (opts.name) updates.name = opts.name;
      if (opts.description) updates.description = opts.description;
      if (opts.active !== undefined) updates.isActive = opts.active === 'true';

      const res = await assistants.put<Actor>(`/api/actors/${id}`, updates);

      if (!res.ok) {
        error(res.error || 'Failed to update actor');
        process.exit(1);
      }

      success(`Updated actor: ${res.data?.name}`);
    });

  actors
    .command('delete <id>')
    .description('Delete an actor')
    .option('-f, --force', 'Skip confirmation')
    .action(async (id, opts) => {
      if (!opts.force) {
        error('Use --force to confirm deletion');
        process.exit(1);
      }

      const res = await assistants.delete(`/api/actors/${id}`);

      if (!res.ok) {
        error(res.error || 'Failed to delete actor');
        process.exit(1);
      }

      success(`Deleted actor: ${id}`);
    });

  // Rules
  const rules = ast
    .command('rules')
    .description('Manage rule sets');

  rules
    .command('list')
    .description('List rule sets')
    .action(async () => {
      const res = await assistants.get<{ ruleSets?: RuleSet[] }>('/api/rules');

      if (!res.ok) {
        error(res.error || 'Failed to list rule sets');
        process.exit(1);
      }

      output(res.data?.ruleSets || [], {
        columns: [
          { key: 'id', header: 'ID' },
          { key: 'name', header: 'Name' },
          { key: 'version', header: 'Version' },
          { key: 'isActive', header: 'Active' },
        ],
        idKey: 'id',
      });
    });

  rules
    .command('get <orgId>')
    .description('Get rule set for organization')
    .action(async (orgId) => {
      const res = await assistants.get<RuleSet>(`/api/rules/${orgId}`);

      if (!res.ok) {
        error(res.error || 'Rule set not found');
        process.exit(1);
      }

      const ruleSet = res.data!;
      detail('ID', ruleSet.id);
      detail('Org ID', ruleSet.orgId);
      detail('Name', ruleSet.name);
      detail('Description', ruleSet.description);
      detail('Version', ruleSet.version);
      detail('Active', ruleSet.isActive);
      detail('Rules Count', ruleSet.rules?.length || 0);
    });

  rules
    .command('create <name>')
    .description('Create a rule set')
    .option('-d, --description <desc>', 'Description')
    .action(async (name, opts) => {
      const res = await assistants.post<RuleSet>('/api/rules', {
        name,
        description: opts.description,
        rules: [],
        isActive: true,
      });

      if (!res.ok) {
        error(res.error || 'Failed to create rule set');
        process.exit(1);
      }

      success(`Created rule set: ${res.data?.name}`);
      detail('ID', res.data?.id);
    });

  // Assistants
  const assistantsCmd = ast
    .command('list')
    .description('List all assistants')
    .action(async () => {
      const res = await assistants.get<{ assistants?: Assistant[] }>('/api/assistants');

      if (!res.ok) {
        error(res.error || 'Failed to list assistants');
        process.exit(1);
      }

      output(res.data?.assistants || [], {
        columns: [
          { key: 'key', header: 'Key' },
          { key: 'name', header: 'Name' },
          { key: 'status', header: 'Status' },
          { key: 'capabilities', header: 'Capabilities' },
        ],
        idKey: 'key',
      });
    });

  ast
    .command('get <key>')
    .description('Get assistant details')
    .action(async (key) => {
      const res = await assistants.get<Assistant>(`/api/assistants/${key}`);

      if (!res.ok) {
        error(res.error || 'Assistant not found');
        process.exit(1);
      }

      const assistant = res.data!;
      detail('Key', assistant.key);
      detail('Name', assistant.name);
      detail('Description', assistant.description);
      detail('Status', assistant.status);
      detail('Capabilities', assistant.capabilities?.join(', '));
    });

  ast
    .command('create <key>')
    .description('Create a custom assistant')
    .option('-n, --name <name>', 'Assistant name')
    .option('-d, --description <desc>', 'Description')
    .option('--model <model>', 'LLM model', 'gpt-4o-mini')
    .option('--temperature <temp>', 'Temperature', '0.7')
    .action(async (key, opts) => {
      const res = await assistants.post<Assistant>('/api/assistants', {
        key,
        name: opts.name || key,
        description: opts.description,
        model: opts.model,
        temperature: parseFloat(opts.temperature),
        status: 'draft',
        capabilities: [],
      });

      if (!res.ok) {
        error(res.error || 'Failed to create assistant');
        process.exit(1);
      }

      success(`Created assistant: ${res.data?.name}`);
      detail('Key', res.data?.key);
    });

  ast
    .command('update <key>')
    .description('Update an assistant')
    .option('-n, --name <name>', 'New name')
    .option('-d, --description <desc>', 'New description')
    .option('--status <status>', 'Status (active, inactive, draft)')
    .action(async (key, opts) => {
      const updates: Record<string, unknown> = {};
      if (opts.name) updates.name = opts.name;
      if (opts.description) updates.description = opts.description;
      if (opts.status) updates.status = opts.status;

      const res = await assistants.put<Assistant>(`/api/assistants/${key}`, updates);

      if (!res.ok) {
        error(res.error || 'Failed to update assistant');
        process.exit(1);
      }

      success(`Updated assistant: ${res.data?.name}`);
    });

  ast
    .command('delete <key>')
    .description('Delete an assistant')
    .option('-f, --force', 'Skip confirmation')
    .action(async (key, opts) => {
      if (!opts.force) {
        error('Use --force to confirm deletion');
        process.exit(1);
      }

      const res = await assistants.delete(`/api/assistants/${key}`);

      if (!res.ok) {
        error(res.error || 'Failed to delete assistant');
        process.exit(1);
      }

      success(`Deleted assistant: ${key}`);
    });

  // Settings
  const settings = ast
    .command('settings')
    .description('Manage assistant settings');

  settings
    .command('llm')
    .description('Get LLM settings')
    .action(async () => {
      const res = await assistants.get<LLMSettings>('/api/settings/llm');

      if (!res.ok) {
        error(res.error || 'Failed to get LLM settings');
        process.exit(1);
      }

      const s = res.data!;
      detail('Provider', s.provider);
      detail('Model', s.model);
      detail('Temperature', s.temperature);
      detail('Max Tokens', s.maxTokens);
    });

  settings
    .command('llm-set')
    .description('Configure LLM settings')
    .option('-p, --provider <provider>', 'Provider (openai, anthropic, custom)')
    .option('-m, --model <model>', 'Model name')
    .option('-t, --temperature <temp>', 'Temperature')
    .option('--max-tokens <n>', 'Max tokens')
    .option('--api-key <key>', 'API key')
    .action(async (opts) => {
      const updates: Record<string, unknown> = {};
      if (opts.provider) updates.provider = opts.provider;
      if (opts.model) updates.model = opts.model;
      if (opts.temperature) updates.temperature = parseFloat(opts.temperature);
      if (opts.maxTokens) updates.maxTokens = parseInt(opts.maxTokens, 10);
      if (opts.apiKey) updates.apiKey = opts.apiKey;

      const res = await assistants.put<LLMSettings>('/api/settings/llm', updates);

      if (!res.ok) {
        error(res.error || 'Failed to update LLM settings');
        process.exit(1);
      }

      success('Updated LLM settings');
    });

  // Query an assistant directly
  ast
    .command('query <key> <message>')
    .description('Send a query to an assistant')
    .action(async (key, message) => {
      const res = await assistants.post<{ response: string; runId?: string }>(`/api/assistants/${key}/query`, {
        message,
      });

      if (!res.ok) {
        error(res.error || 'Query failed');
        process.exit(1);
      }

      console.log(res.data?.response);
      if (res.data?.runId) {
        detail('Run ID', res.data.runId);
      }
    });
}
