import { Command } from 'commander';
import { server } from '../client.js';
import { success, error, output, detail, info } from '../output.js';

interface Build {
  id: string;
  name: string;
  status: 'building' | 'ready' | 'failed';
  isActive: boolean;
  createdAt: string;
}

interface BuildArtifact {
  name: string;
  type: 'page' | 'asset';
  size: number;
  hash: string;
}

interface ExternalSource {
  sourceId: string;
  sourceType: 'llm' | 'api' | 'user_input';
  trusted: boolean;
  trustLevel: number;
  totalCalls: number;
  totalCost: number;
  errorRate: number;
}

interface ProxiedOperation {
  inputHash: string;
  source: string;
  type: string;
  cached: boolean;
  cacheHits: number;
  createdAt: string;
}

export function registerServerCommands(program: Command): void {
  const srv = program
    .command('server')
    .alias('srv')
    .description('Build management and proxy operations');

  // Health
  srv
    .command('health')
    .description('Check server health')
    .action(async () => {
      const res = await server.get<{ status: string; currentBuildId?: string; uptime: number }>('/api/health');

      if (!res.ok) {
        error(res.error || 'Health check failed');
        process.exit(1);
      }

      const health = res.data!;
      detail('Status', health.status);
      detail('Current Build', health.currentBuildId || 'none');
      detail('Uptime', `${Math.floor(health.uptime / 1000)}s`);
    });

  // Builds
  const builds = srv
    .command('builds')
    .description('Manage builds');

  builds
    .command('list')
    .description('List all builds')
    .action(async () => {
      const res = await server.get<{ builds?: Build[] }>('/api/builds');

      if (!res.ok) {
        error(res.error || 'Failed to list builds');
        process.exit(1);
      }

      output(res.data?.builds || [], {
        columns: [
          { key: 'id', header: 'ID' },
          { key: 'name', header: 'Name' },
          { key: 'status', header: 'Status' },
          { key: 'isActive', header: 'Active' },
          { key: 'createdAt', header: 'Created' },
        ],
        idKey: 'id',
      });
    });

  builds
    .command('get <buildId>')
    .description('Get build details')
    .action(async (buildId) => {
      const res = await server.get<Build>(`/api/builds/${buildId}`);

      if (!res.ok) {
        error(res.error || 'Build not found');
        process.exit(1);
      }

      const build = res.data!;
      detail('ID', build.id);
      detail('Name', build.name);
      detail('Status', build.status);
      detail('Active', build.isActive);
      detail('Created', build.createdAt);
    });

  builds
    .command('create')
    .description('Create a new build')
    .option('-n, --name <name>', 'Build name')
    .action(async (opts) => {
      const res = await server.post<Build>('/api/builds', {
        name: opts.name,
      });

      if (!res.ok) {
        error(res.error || 'Failed to create build');
        process.exit(1);
      }

      success(`Created build: ${res.data?.name || res.data?.id}`);
      detail('ID', res.data?.id);
      detail('Status', res.data?.status);
      info('Build is running asynchronously. Check status with: symbia server builds get <id>');
    });

  builds
    .command('delete <buildId>')
    .description('Delete a build')
    .option('-f, --force', 'Skip confirmation')
    .action(async (buildId, opts) => {
      if (!opts.force) {
        error('Use --force to confirm deletion');
        process.exit(1);
      }

      const res = await server.delete(`/api/builds/${buildId}`);

      if (!res.ok) {
        error(res.error || 'Failed to delete build (cannot delete active builds)');
        process.exit(1);
      }

      success(`Deleted build: ${buildId}`);
    });

  builds
    .command('promote <buildId>')
    .description('Promote a build to active')
    .action(async (buildId) => {
      const res = await server.post<Build>(`/api/builds/${buildId}/promote`, {});

      if (!res.ok) {
        error(res.error || 'Failed to promote build (must have status "ready")');
        process.exit(1);
      }

      success(`Promoted build: ${res.data?.name || buildId}`);
      detail('Status', 'active');
    });

  builds
    .command('artifacts <buildId>')
    .description('Get build artifacts')
    .action(async (buildId) => {
      const res = await server.get<{ artifacts?: BuildArtifact[] }>(`/api/builds/${buildId}/artifacts`);

      if (!res.ok) {
        error(res.error || 'Failed to get artifacts');
        process.exit(1);
      }

      output(res.data?.artifacts || [], {
        columns: [
          { key: 'name', header: 'Name' },
          { key: 'type', header: 'Type' },
          { key: 'size', header: 'Size' },
          { key: 'hash', header: 'Hash' },
        ],
      });
    });

  // Inputs
  srv
    .command('inputs')
    .description('Get input files (design.md, llms.txt, openapi.json)')
    .action(async () => {
      const res = await server.get<{ inputs?: Record<string, string> }>('/api/inputs');

      if (!res.ok) {
        error(res.error || 'Failed to get inputs');
        process.exit(1);
      }

      const inputs = res.data?.inputs || {};
      Object.entries(inputs).forEach(([name, content]) => {
        info(`--- ${name} ---`);
        console.log(content);
        console.log();
      });
    });

  // Proxy
  const proxy = srv
    .command('proxy')
    .description('Manage proxy operations');

  proxy
    .command('execute')
    .description('Execute an external operation')
    .requiredOption('-t, --type <type>', 'Operation type (llm, api, file_gen, external)')
    .requiredOption('-s, --source <source>', 'Source identifier')
    .option('-p, --params <json>', 'Parameters (JSON)')
    .option('--cacheable', 'Allow caching')
    .option('--ttl <seconds>', 'Cache TTL in seconds')
    .action(async (opts) => {
      const res = await server.post<{
        value: unknown;
        trusted: boolean;
        trustLevel: number;
        metadata: { source: string; cached: boolean; operationId: string };
      }>('/api/proxy/execute', {
        type: opts.type,
        source: opts.source,
        params: opts.params ? JSON.parse(opts.params) : {},
        cacheable: opts.cacheable || false,
        ttl: opts.ttl ? parseInt(opts.ttl, 10) : undefined,
      });

      if (!res.ok) {
        error(res.error || 'Operation failed');
        process.exit(1);
      }

      const result = res.data!;
      detail('Trusted', result.trusted);
      detail('Trust Level', result.trustLevel);
      detail('Cached', result.metadata?.cached);
      detail('Operation ID', result.metadata?.operationId);
      console.log('\nResult:');
      console.log(JSON.stringify(result.value, null, 2));
    });

  proxy
    .command('operations')
    .description('List proxied operations')
    .option('-s, --source <source>', 'Filter by source')
    .option('-t, --trusted', 'Show only trusted operations')
    .option('-l, --limit <n>', 'Maximum results', '50')
    .action(async (opts) => {
      const params: Record<string, string | number | boolean | undefined> = {
        limit: parseInt(opts.limit, 10),
      };
      if (opts.source) params.source = opts.source;
      if (opts.trusted) params.trusted = true;

      const res = await server.get<{ operations?: ProxiedOperation[] }>('/api/proxy/operations', params);

      if (!res.ok) {
        error(res.error || 'Failed to list operations');
        process.exit(1);
      }

      output(res.data?.operations || [], {
        columns: [
          { key: 'inputHash', header: 'Hash' },
          { key: 'source', header: 'Source' },
          { key: 'type', header: 'Type' },
          { key: 'cached', header: 'Cached' },
          { key: 'cacheHits', header: 'Cache Hits' },
        ],
      });
    });

  proxy
    .command('operation <inputHash>')
    .description('Get specific operation')
    .action(async (inputHash) => {
      const res = await server.get<ProxiedOperation>(`/api/proxy/operations/${inputHash}`);

      if (!res.ok) {
        error(res.error || 'Operation not found');
        process.exit(1);
      }

      const op = res.data!;
      detail('Input Hash', op.inputHash);
      detail('Source', op.source);
      detail('Type', op.type);
      detail('Cached', op.cached);
      detail('Cache Hits', op.cacheHits);
      detail('Created', op.createdAt);
    });

  // Sources
  const sources = srv
    .command('sources')
    .description('Manage external sources');

  sources
    .command('list')
    .description('List external sources')
    .action(async () => {
      const res = await server.get<{ sources?: ExternalSource[] }>('/api/proxy/sources');

      if (!res.ok) {
        error(res.error || 'Failed to list sources');
        process.exit(1);
      }

      output(res.data?.sources || [], {
        columns: [
          { key: 'sourceId', header: 'ID' },
          { key: 'sourceType', header: 'Type' },
          { key: 'trusted', header: 'Trusted' },
          { key: 'trustLevel', header: 'Trust Level' },
          { key: 'totalCalls', header: 'Calls' },
          { key: 'errorRate', header: 'Error Rate' },
        ],
        idKey: 'sourceId',
      });
    });

  sources
    .command('get <sourceId>')
    .description('Get source details')
    .action(async (sourceId) => {
      const res = await server.get<ExternalSource>(`/api/proxy/sources/${sourceId}`);

      if (!res.ok) {
        error(res.error || 'Source not found');
        process.exit(1);
      }

      const src = res.data!;
      detail('ID', src.sourceId);
      detail('Type', src.sourceType);
      detail('Trusted', src.trusted);
      detail('Trust Level', src.trustLevel);
      detail('Total Calls', src.totalCalls);
      detail('Total Cost', src.totalCost);
      detail('Error Rate', `${(src.errorRate * 100).toFixed(1)}%`);
    });

  sources
    .command('create')
    .description('Create an external source')
    .requiredOption('-i, --id <id>', 'Source ID')
    .requiredOption('-t, --type <type>', 'Source type (llm, api, user_input)')
    .option('--trusted', 'Mark as trusted')
    .option('--trust-level <n>', 'Trust level (0-100)', '50')
    .action(async (opts) => {
      const res = await server.post<ExternalSource>('/api/proxy/sources', {
        sourceId: opts.id,
        sourceType: opts.type,
        trusted: opts.trusted || false,
        trustLevel: parseInt(opts.trustLevel, 10),
      });

      if (!res.ok) {
        error(res.error || 'Failed to create source');
        process.exit(1);
      }

      success(`Created source: ${res.data?.sourceId}`);
    });

  sources
    .command('update <sourceId>')
    .description('Update an external source')
    .option('--trusted <bool>', 'Set trusted status')
    .option('--trust-level <n>', 'Set trust level')
    .action(async (sourceId, opts) => {
      const updates: Record<string, unknown> = {};
      if (opts.trusted !== undefined) updates.trusted = opts.trusted === 'true';
      if (opts.trustLevel) updates.trustLevel = parseInt(opts.trustLevel, 10);

      const res = await server.patch<ExternalSource>(`/api/proxy/sources/${sourceId}`, updates);

      if (!res.ok) {
        error(res.error || 'Failed to update source');
        process.exit(1);
      }

      success(`Updated source: ${sourceId}`);
    });
}
