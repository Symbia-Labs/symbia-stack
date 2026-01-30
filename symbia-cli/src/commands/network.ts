import { Command } from 'commander';
import { network } from '../client.js';
import { success, error, output, detail, info } from '../output.js';

interface NetworkNode {
  id: string;
  name: string;
  type: 'service' | 'assistant' | 'sandbox' | 'bridge';
  capabilities: string[];
  endpoint: string;
  registeredAt: string;
  lastHeartbeat: string;
}

interface NodeContract {
  id: string;
  from: string;
  to: string;
  allowedEventTypes: string[];
  boundaries: ('intra' | 'inter' | 'extra')[];
  createdAt: string;
  expiresAt?: string;
}

interface NetworkBridge {
  id: string;
  name: string;
  type: 'webhook' | 'websocket' | 'grpc' | 'custom';
  endpoint: string;
  eventTypes: string[];
  active: boolean;
}

interface RoutingPolicy {
  id: string;
  name: string;
  priority: number;
  enabled: boolean;
  createdAt: string;
}

interface EventTrace {
  eventId: string;
  runId: string;
  status: 'delivered' | 'dropped' | 'pending' | 'error';
  totalDurationMs: number;
}

interface NetworkSummary {
  nodes: {
    total: number;
    byType: Record<string, number>;
    connected: number;
  };
  contracts: { total: number };
  bridges: { total: number; active: number };
  policies: { total: number; enabled: number };
}

export function registerNetworkCommands(program: Command): void {
  const net = program
    .command('network')
    .alias('net')
    .description('Network routing, policies, and observability');

  // Nodes
  const nodes = net
    .command('nodes')
    .description('Manage network nodes');

  nodes
    .command('list')
    .description('List registered nodes')
    .option('-t, --type <type>', 'Filter by type (service, assistant, sandbox, bridge)')
    .action(async (opts) => {
      let url = '/api/registry/nodes';
      if (opts.type) {
        url = `/api/registry/nodes/type/${opts.type}`;
      }

      const res = await network.get<{ nodes: NetworkNode[]; count: number }>(url);

      if (!res.ok) {
        error(res.error || 'Failed to list nodes');
        process.exit(1);
      }

      output(res.data?.nodes || [], {
        columns: [
          { key: 'id', header: 'ID' },
          { key: 'name', header: 'Name' },
          { key: 'type', header: 'Type' },
          { key: 'endpoint', header: 'Endpoint' },
          { key: 'lastHeartbeat', header: 'Last Heartbeat' },
        ],
        idKey: 'id',
      });
    });

  nodes
    .command('get <id>')
    .description('Get node details')
    .action(async (id) => {
      const res = await network.get<NetworkNode>(`/api/registry/nodes/${id}`);

      if (!res.ok) {
        error(res.error || 'Node not found');
        process.exit(1);
      }

      const node = res.data!;
      detail('ID', node.id);
      detail('Name', node.name);
      detail('Type', node.type);
      detail('Endpoint', node.endpoint);
      detail('Capabilities', node.capabilities?.join(', '));
      detail('Registered', node.registeredAt);
      detail('Last Heartbeat', node.lastHeartbeat);
    });

  nodes
    .command('register')
    .description('Register a new node')
    .requiredOption('-i, --id <id>', 'Node ID')
    .requiredOption('-n, --name <name>', 'Node name')
    .requiredOption('-t, --type <type>', 'Node type (service, assistant, sandbox, bridge)')
    .requiredOption('-e, --endpoint <url>', 'HTTP endpoint')
    .option('-c, --capabilities <caps>', 'Comma-separated capabilities')
    .action(async (opts) => {
      const res = await network.post<NetworkNode>('/api/registry/nodes', {
        id: opts.id,
        name: opts.name,
        type: opts.type,
        endpoint: opts.endpoint,
        capabilities: opts.capabilities ? opts.capabilities.split(',') : [],
      });

      if (!res.ok) {
        error(res.error || 'Failed to register node');
        process.exit(1);
      }

      success(`Registered node: ${res.data?.name}`);
      detail('ID', res.data?.id);
    });

  nodes
    .command('unregister <id>')
    .description('Unregister a node')
    .action(async (id) => {
      const res = await network.delete(`/api/registry/nodes/${id}`);

      if (!res.ok) {
        error(res.error || 'Failed to unregister node');
        process.exit(1);
      }

      success(`Unregistered node: ${id}`);
    });

  nodes
    .command('heartbeat <id>')
    .description('Send heartbeat for a node')
    .action(async (id) => {
      const res = await network.post<{ ok: boolean; timestamp: string }>(`/api/registry/nodes/${id}/heartbeat`, {});

      if (!res.ok) {
        error(res.error || 'Failed to send heartbeat');
        process.exit(1);
      }

      success(`Heartbeat sent: ${res.data?.timestamp}`);
    });

  nodes
    .command('find-capability <capability>')
    .description('Find nodes with a specific capability')
    .action(async (capability) => {
      const res = await network.get<{ nodes: NetworkNode[]; count: number }>(
        `/api/registry/nodes/capability/${capability}`
      );

      if (!res.ok) {
        error(res.error || 'Failed to find nodes');
        process.exit(1);
      }

      output(res.data?.nodes || [], {
        columns: [
          { key: 'id', header: 'ID' },
          { key: 'name', header: 'Name' },
          { key: 'type', header: 'Type' },
          { key: 'endpoint', header: 'Endpoint' },
        ],
        idKey: 'id',
      });
    });

  // Contracts
  const contracts = net
    .command('contracts')
    .description('Manage node contracts');

  contracts
    .command('list')
    .description('List contracts')
    .option('-n, --node <id>', 'Filter by node ID')
    .action(async (opts) => {
      const params: Record<string, string | undefined> = {};
      if (opts.node) params.nodeId = opts.node;

      const res = await network.get<{ contracts: NodeContract[]; count: number }>('/api/registry/contracts', params);

      if (!res.ok) {
        error(res.error || 'Failed to list contracts');
        process.exit(1);
      }

      output(res.data?.contracts || [], {
        columns: [
          { key: 'id', header: 'ID' },
          { key: 'from', header: 'From' },
          { key: 'to', header: 'To' },
          { key: 'allowedEventTypes', header: 'Event Types' },
          { key: 'boundaries', header: 'Boundaries' },
        ],
        idKey: 'id',
      });
    });

  contracts
    .command('create')
    .description('Create a contract between nodes')
    .requiredOption('--from <nodeId>', 'Source node ID')
    .requiredOption('--to <nodeId>', 'Target node ID')
    .option('-e, --events <types>', 'Comma-separated event types (* for all)', '*')
    .option('-b, --boundaries <bounds>', 'Comma-separated boundaries (intra, inter, extra)', 'intra')
    .option('--expires <date>', 'Expiration date (ISO 8601)')
    .action(async (opts) => {
      const res = await network.post<NodeContract>('/api/registry/contracts', {
        from: opts.from,
        to: opts.to,
        allowedEventTypes: opts.events.split(','),
        boundaries: opts.boundaries.split(','),
        expiresAt: opts.expires,
      });

      if (!res.ok) {
        error(res.error || 'Failed to create contract');
        process.exit(1);
      }

      success(`Created contract: ${res.data?.from} -> ${res.data?.to}`);
      detail('ID', res.data?.id);
    });

  contracts
    .command('delete <id>')
    .description('Delete a contract')
    .action(async (id) => {
      const res = await network.delete(`/api/registry/contracts/${id}`);

      if (!res.ok) {
        error(res.error || 'Failed to delete contract');
        process.exit(1);
      }

      success(`Deleted contract: ${id}`);
    });

  // Bridges
  const bridges = net
    .command('bridges')
    .description('Manage external bridges');

  bridges
    .command('list')
    .description('List bridges')
    .action(async () => {
      const res = await network.get<{ bridges: NetworkBridge[]; count: number }>('/api/registry/bridges');

      if (!res.ok) {
        error(res.error || 'Failed to list bridges');
        process.exit(1);
      }

      output(res.data?.bridges || [], {
        columns: [
          { key: 'id', header: 'ID' },
          { key: 'name', header: 'Name' },
          { key: 'type', header: 'Type' },
          { key: 'endpoint', header: 'Endpoint' },
          { key: 'active', header: 'Active' },
        ],
        idKey: 'id',
      });
    });

  bridges
    .command('get <id>')
    .description('Get bridge details')
    .action(async (id) => {
      const res = await network.get<NetworkBridge>(`/api/registry/bridges/${id}`);

      if (!res.ok) {
        error(res.error || 'Bridge not found');
        process.exit(1);
      }

      const bridge = res.data!;
      detail('ID', bridge.id);
      detail('Name', bridge.name);
      detail('Type', bridge.type);
      detail('Endpoint', bridge.endpoint);
      detail('Event Types', bridge.eventTypes?.join(', '));
      detail('Active', bridge.active);
    });

  bridges
    .command('create')
    .description('Create a bridge')
    .requiredOption('-n, --name <name>', 'Bridge name')
    .requiredOption('-t, --type <type>', 'Bridge type (webhook, websocket, grpc, custom)')
    .requiredOption('-e, --endpoint <url>', 'Bridge endpoint')
    .option('--events <types>', 'Comma-separated event types')
    .action(async (opts) => {
      const res = await network.post<NetworkBridge>('/api/registry/bridges', {
        name: opts.name,
        type: opts.type,
        endpoint: opts.endpoint,
        eventTypes: opts.events ? opts.events.split(',') : [],
      });

      if (!res.ok) {
        error(res.error || 'Failed to create bridge');
        process.exit(1);
      }

      success(`Created bridge: ${res.data?.name}`);
      detail('ID', res.data?.id);
    });

  bridges
    .command('activate <id>')
    .description('Activate a bridge')
    .action(async (id) => {
      const res = await network.patch<NetworkBridge>(`/api/registry/bridges/${id}`, { active: true });

      if (!res.ok) {
        error(res.error || 'Failed to activate bridge');
        process.exit(1);
      }

      success(`Activated bridge: ${id}`);
    });

  bridges
    .command('deactivate <id>')
    .description('Deactivate a bridge')
    .action(async (id) => {
      const res = await network.patch<NetworkBridge>(`/api/registry/bridges/${id}`, { active: false });

      if (!res.ok) {
        error(res.error || 'Failed to deactivate bridge');
        process.exit(1);
      }

      success(`Deactivated bridge: ${id}`);
    });

  bridges
    .command('delete <id>')
    .description('Delete a bridge')
    .action(async (id) => {
      const res = await network.delete(`/api/registry/bridges/${id}`);

      if (!res.ok) {
        error(res.error || 'Failed to delete bridge');
        process.exit(1);
      }

      success(`Deleted bridge: ${id}`);
    });

  // Events
  const events = net
    .command('events')
    .description('Manage network events');

  events
    .command('list')
    .description('List recent events')
    .option('-r, --run <runId>', 'Filter by run ID')
    .option('-l, --limit <n>', 'Maximum results', '100')
    .action(async (opts) => {
      const params: Record<string, string | number | undefined> = {
        limit: parseInt(opts.limit, 10),
      };
      if (opts.run) params.runId = opts.run;

      const res = await network.get<{ events: unknown[]; count: number }>('/api/events', params);

      if (!res.ok) {
        error(res.error || 'Failed to list events');
        process.exit(1);
      }

      output(res.data?.events || [], {
        columns: [
          { key: 'wrapper.id', header: 'ID' },
          { key: 'wrapper.source', header: 'Source' },
          { key: 'wrapper.target', header: 'Target' },
          { key: 'payload.type', header: 'Type' },
          { key: 'wrapper.timestamp', header: 'Time' },
        ],
      });
    });

  events
    .command('send')
    .description('Send an event')
    .requiredOption('-t, --type <type>', 'Event type')
    .requiredOption('-s, --source <nodeId>', 'Source node ID')
    .requiredOption('-r, --run <runId>', 'Run ID')
    .option('--target <nodeId>', 'Target node ID')
    .option('-d, --data <json>', 'Event data (JSON)')
    .option('-b, --boundary <boundary>', 'Boundary (intra, inter, extra)', 'intra')
    .action(async (opts) => {
      const res = await network.post<{ eventId: string }>('/api/events', {
        payload: {
          type: opts.type,
          data: opts.data ? JSON.parse(opts.data) : {},
        },
        source: opts.source,
        runId: opts.run,
        target: opts.target,
        boundary: opts.boundary,
      });

      if (!res.ok) {
        error(res.error || 'Failed to send event');
        process.exit(1);
      }

      success('Event sent');
      detail('Event ID', res.data?.eventId);
    });

  events
    .command('trace <eventId>')
    .description('Get event trace')
    .action(async (eventId) => {
      const res = await network.get<EventTrace>(`/api/events/${eventId}/trace`);

      if (!res.ok) {
        error(res.error || 'Trace not found');
        process.exit(1);
      }

      const trace = res.data!;
      detail('Event ID', trace.eventId);
      detail('Run ID', trace.runId);
      detail('Status', trace.status);
      detail('Duration', `${trace.totalDurationMs}ms`);
    });

  events
    .command('stats')
    .description('Get event statistics')
    .action(async () => {
      const res = await network.get<{
        totalEvents: number;
        deliveredCount: number;
        droppedCount: number;
        errorCount: number;
      }>('/api/events/stats');

      if (!res.ok) {
        error(res.error || 'Failed to get stats');
        process.exit(1);
      }

      const stats = res.data!;
      detail('Total Events', stats.totalEvents);
      detail('Delivered', stats.deliveredCount);
      detail('Dropped', stats.droppedCount);
      detail('Errors', stats.errorCount);
    });

  // Policies
  const policies = net
    .command('policies')
    .description('Manage routing policies');

  policies
    .command('list')
    .description('List routing policies')
    .action(async () => {
      const res = await network.get<{ policies: RoutingPolicy[]; count: number }>('/api/policies');

      if (!res.ok) {
        error(res.error || 'Failed to list policies');
        process.exit(1);
      }

      output(res.data?.policies || [], {
        columns: [
          { key: 'id', header: 'ID' },
          { key: 'name', header: 'Name' },
          { key: 'priority', header: 'Priority' },
          { key: 'enabled', header: 'Enabled' },
          { key: 'createdAt', header: 'Created' },
        ],
        idKey: 'id',
      });
    });

  policies
    .command('get <id>')
    .description('Get policy details')
    .action(async (id) => {
      const res = await network.get<RoutingPolicy & { conditions: unknown[]; action: unknown }>(`/api/policies/${id}`);

      if (!res.ok) {
        error(res.error || 'Policy not found');
        process.exit(1);
      }

      const policy = res.data!;
      detail('ID', policy.id);
      detail('Name', policy.name);
      detail('Priority', policy.priority);
      detail('Enabled', policy.enabled);
      detail('Created', policy.createdAt);
      console.log('\nConditions:');
      console.log(JSON.stringify(policy.conditions, null, 2));
      console.log('\nAction:');
      console.log(JSON.stringify(policy.action, null, 2));
    });

  policies
    .command('create')
    .description('Create a routing policy')
    .requiredOption('-n, --name <name>', 'Policy name')
    .requiredOption('-p, --priority <n>', 'Priority (lower = higher priority)')
    .requiredOption('--action <type>', 'Action type (allow, deny, route, transform, log)')
    .option('--conditions <json>', 'Conditions (JSON array)')
    .option('--action-config <json>', 'Action configuration (JSON)')
    .action(async (opts) => {
      const res = await network.post<RoutingPolicy>('/api/policies', {
        name: opts.name,
        priority: parseInt(opts.priority, 10),
        conditions: opts.conditions ? JSON.parse(opts.conditions) : [],
        action: {
          type: opts.action,
          ...(opts.actionConfig ? JSON.parse(opts.actionConfig) : {}),
        },
      });

      if (!res.ok) {
        error(res.error || 'Failed to create policy');
        process.exit(1);
      }

      success(`Created policy: ${res.data?.name}`);
      detail('ID', res.data?.id);
    });

  policies
    .command('update <id>')
    .description('Update a policy')
    .option('-n, --name <name>', 'New name')
    .option('-p, --priority <n>', 'New priority')
    .option('--enabled <bool>', 'Enable/disable')
    .action(async (id, opts) => {
      const updates: Record<string, unknown> = {};
      if (opts.name) updates.name = opts.name;
      if (opts.priority) updates.priority = parseInt(opts.priority, 10);
      if (opts.enabled !== undefined) updates.enabled = opts.enabled === 'true';

      const res = await network.patch<RoutingPolicy>(`/api/policies/${id}`, updates);

      if (!res.ok) {
        error(res.error || 'Failed to update policy');
        process.exit(1);
      }

      success(`Updated policy: ${res.data?.name}`);
    });

  policies
    .command('delete <id>')
    .description('Delete a policy')
    .action(async (id) => {
      const res = await network.delete(`/api/policies/${id}`);

      if (!res.ok) {
        error(res.error || 'Failed to delete policy');
        process.exit(1);
      }

      success(`Deleted policy: ${id}`);
    });

  policies
    .command('test')
    .description('Test a policy against a sample event')
    .requiredOption('-t, --type <type>', 'Event type')
    .requiredOption('-s, --source <nodeId>', 'Source node ID')
    .requiredOption('-r, --run <runId>', 'Run ID')
    .option('--target <nodeId>', 'Target node ID')
    .option('-b, --boundary <boundary>', 'Boundary', 'intra')
    .action(async (opts) => {
      const res = await network.post<{ result: { action: unknown; policyId: string } }>('/api/policies/test', {
        payload: { type: opts.type, data: {} },
        source: opts.source,
        runId: opts.run,
        target: opts.target,
        boundary: opts.boundary,
      });

      if (!res.ok) {
        error(res.error || 'Test failed');
        process.exit(1);
      }

      detail('Policy ID', res.data?.result.policyId);
      console.log('\nAction:');
      console.log(JSON.stringify(res.data?.result.action, null, 2));
    });

  // SDN (Network Observability)
  const sdn = net
    .command('sdn')
    .description('Network observability (SoftSDN)');

  sdn
    .command('topology')
    .description('Get network topology')
    .action(async () => {
      const res = await network.get<{ nodes: NetworkNode[]; contracts: NodeContract[]; bridges: NetworkBridge[] }>(
        '/api/sdn/topology'
      );

      if (!res.ok) {
        error(res.error || 'Failed to get topology');
        process.exit(1);
      }

      const data = res.data!;
      info(`Nodes: ${data.nodes?.length || 0}`);
      info(`Contracts: ${data.contracts?.length || 0}`);
      info(`Bridges: ${data.bridges?.length || 0}`);

      if (data.nodes?.length) {
        console.log('\nNodes:');
        output(data.nodes, {
          columns: [
            { key: 'id', header: 'ID' },
            { key: 'name', header: 'Name' },
            { key: 'type', header: 'Type' },
          ],
        });
      }
    });

  sdn
    .command('summary')
    .description('Get network summary')
    .action(async () => {
      const res = await network.get<NetworkSummary>('/api/sdn/summary');

      if (!res.ok) {
        error(res.error || 'Failed to get summary');
        process.exit(1);
      }

      const s = res.data!;
      detail('Total Nodes', s.nodes.total);
      detail('Connected Nodes', s.nodes.connected);
      detail('Contracts', s.contracts.total);
      detail('Bridges (active)', `${s.bridges.active}/${s.bridges.total}`);
      detail('Policies (enabled)', `${s.policies.enabled}/${s.policies.total}`);
    });

  sdn
    .command('flow <runId>')
    .description('Get event flow for a run')
    .option('-l, --limit <n>', 'Maximum events', '500')
    .action(async (runId, opts) => {
      const res = await network.get<{
        runId: string;
        nodes: Array<{ id: string; name: string; type: string }>;
        edges: Array<{ from: string; to: string; eventType: string; timestamp: string }>;
        eventCount: number;
      }>(`/api/sdn/flow/${runId}`, { limit: parseInt(opts.limit, 10) });

      if (!res.ok) {
        error(res.error || 'Failed to get flow');
        process.exit(1);
      }

      const flow = res.data!;
      detail('Run ID', flow.runId);
      detail('Event Count', flow.eventCount);

      if (flow.nodes?.length) {
        console.log('\nNodes:');
        output(flow.nodes, {
          columns: [
            { key: 'id', header: 'ID' },
            { key: 'name', header: 'Name' },
            { key: 'type', header: 'Type' },
          ],
        });
      }

      if (flow.edges?.length) {
        console.log('\nEdges:');
        output(flow.edges, {
          columns: [
            { key: 'from', header: 'From' },
            { key: 'to', header: 'To' },
            { key: 'eventType', header: 'Event Type' },
            { key: 'timestamp', header: 'Time' },
          ],
        });
      }
    });

  sdn
    .command('simulate')
    .description('Simulate routing an event (dry run)')
    .requiredOption('-t, --type <type>', 'Event type')
    .requiredOption('-s, --source <nodeId>', 'Source node ID')
    .requiredOption('-r, --run <runId>', 'Run ID')
    .option('--target <nodeId>', 'Target node ID')
    .option('-b, --boundary <boundary>', 'Boundary', 'intra')
    .action(async (opts) => {
      const res = await network.post<{
        wouldSucceed: boolean;
        reasons: string[];
      }>('/api/sdn/simulate', {
        payload: { type: opts.type, data: {} },
        source: opts.source,
        runId: opts.run,
        target: opts.target,
        boundary: opts.boundary,
      });

      if (!res.ok) {
        error(res.error || 'Simulation failed');
        process.exit(1);
      }

      const result = res.data!;
      detail('Would Succeed', result.wouldSucceed);
      if (result.reasons?.length) {
        console.log('\nReasons:');
        result.reasons.forEach(r => console.log(`  - ${r}`));
      }
    });

  sdn
    .command('graph')
    .description('Get network as adjacency graph')
    .action(async () => {
      const res = await network.get<{
        nodes: Array<{ id: string; name: string; type: string; connected: boolean }>;
        adjacency: Record<string, string[]>;
      }>('/api/sdn/graph');

      if (!res.ok) {
        error(res.error || 'Failed to get graph');
        process.exit(1);
      }

      const graph = res.data!;
      console.log('Nodes:');
      output(graph.nodes, {
        columns: [
          { key: 'id', header: 'ID' },
          { key: 'name', header: 'Name' },
          { key: 'type', header: 'Type' },
          { key: 'connected', header: 'Connected' },
        ],
      });

      console.log('\nAdjacency:');
      console.log(JSON.stringify(graph.adjacency, null, 2));
    });
}
