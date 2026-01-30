import { Command } from 'commander';
import { readFileSync } from 'fs';
import { catalog } from '../client.js';
import { success, error, output, detail, separator } from '../output.js';

interface Resource {
  id: string;
  name: string;
  type: string;
  status: string;
  version?: string;
  createdAt: string;
  updatedAt: string;
}

export function registerCatalogCommands(program: Command): void {
  const cat = program
    .command('catalog')
    .alias('cat')
    .description('Resource catalog management');

  // List resources
  cat
    .command('list')
    .description('List resources')
    .option('-t, --type <type>', 'Filter by type (context, integration, graph, assistant)')
    .option('-s, --status <status>', 'Filter by status (draft, published, deprecated)')
    .option('--org <orgId>', 'Filter by organization')
    .option('-l, --limit <n>', 'Maximum number of results', '50')
    .action(async (opts) => {
      const res = await catalog.get<{ resources: Resource[] }>('/api/resources', {
        type: opts.type,
        status: opts.status,
        orgId: opts.org,
        limit: parseInt(opts.limit, 10),
      });

      if (!res.ok) {
        error(res.error || 'Failed to list resources');
        process.exit(1);
      }

      output(res.data?.resources || [], {
        columns: [
          { key: 'id', header: 'ID' },
          { key: 'name', header: 'Name' },
          { key: 'type', header: 'Type' },
          { key: 'status', header: 'Status' },
          { key: 'version', header: 'Version' },
        ],
        idKey: 'id',
      });
    });

  // Get resource details
  cat
    .command('get <id>')
    .description('Get resource details')
    .action(async (id) => {
      const res = await catalog.get<Resource>(`/api/resources/${id}`);

      if (!res.ok) {
        error(res.error || 'Resource not found');
        process.exit(1);
      }

      const resource = res.data!;
      detail('ID', resource.id);
      detail('Name', resource.name);
      detail('Type', resource.type);
      detail('Status', resource.status);
      detail('Version', resource.version);
      detail('Created', resource.createdAt);
      detail('Updated', resource.updatedAt);
    });

  // Create resource
  cat
    .command('create <type>')
    .description('Create a new resource')
    .requiredOption('-n, --name <name>', 'Resource name')
    .option('-d, --description <desc>', 'Resource description')
    .option('-f, --file <path>', 'Load spec from file')
    .action(async (type, opts) => {
      let spec = {};
      if (opts.file) {
        try {
          const content = readFileSync(opts.file, 'utf-8');
          spec = JSON.parse(content);
        } catch (err) {
          error(`Failed to read file: ${opts.file}`);
          process.exit(1);
        }
      }

      const res = await catalog.post<{ id: string; name: string }>('/api/resources', {
        type,
        name: opts.name,
        description: opts.description,
        ...spec,
      });

      if (!res.ok) {
        error(res.error || 'Failed to create resource');
        process.exit(1);
      }

      success(`Created ${type}: ${res.data?.name} (${res.data?.id})`);
    });

  // Update resource
  cat
    .command('update <id>')
    .description('Update a resource')
    .option('-n, --name <name>', 'New name')
    .option('-d, --description <desc>', 'New description')
    .option('-f, --file <path>', 'Load spec from file')
    .action(async (id, opts) => {
      let spec = {};
      if (opts.file) {
        try {
          const content = readFileSync(opts.file, 'utf-8');
          spec = JSON.parse(content);
        } catch (err) {
          error(`Failed to read file: ${opts.file}`);
          process.exit(1);
        }
      }

      const body: Record<string, unknown> = { ...spec };
      if (opts.name) body.name = opts.name;
      if (opts.description) body.description = opts.description;

      const res = await catalog.patch(`/api/resources/${id}`, body);

      if (!res.ok) {
        error(res.error || 'Failed to update resource');
        process.exit(1);
      }

      success(`Updated resource: ${id}`);
    });

  // Delete resource
  cat
    .command('delete <id>')
    .description('Delete a resource')
    .option('-f, --force', 'Skip confirmation')
    .action(async (id, opts) => {
      if (!opts.force) {
        // In a real CLI, we'd prompt for confirmation
        // For now, require --force
        error('Use --force to confirm deletion');
        process.exit(1);
      }

      const res = await catalog.delete(`/api/resources/${id}`);

      if (!res.ok) {
        error(res.error || 'Failed to delete resource');
        process.exit(1);
      }

      success(`Deleted resource: ${id}`);
    });

  // Publish resource
  cat
    .command('publish <id>')
    .description('Publish a resource')
    .action(async (id) => {
      const res = await catalog.post(`/api/resources/${id}/publish`);

      if (!res.ok) {
        error(res.error || 'Failed to publish resource');
        process.exit(1);
      }

      success(`Published resource: ${id}`);
    });

  // Search resources
  cat
    .command('search <query>')
    .description('Search resources')
    .option('-t, --type <type>', 'Filter by type')
    .option('-l, --limit <n>', 'Maximum results', '20')
    .action(async (query, opts) => {
      const res = await catalog.get<{ results: Resource[] }>('/api/search', {
        q: query,
        type: opts.type,
        limit: parseInt(opts.limit, 10),
      });

      if (!res.ok) {
        error(res.error || 'Search failed');
        process.exit(1);
      }

      output(res.data?.results || [], {
        columns: [
          { key: 'id', header: 'ID' },
          { key: 'name', header: 'Name' },
          { key: 'type', header: 'Type' },
          { key: 'status', header: 'Status' },
        ],
        idKey: 'id',
      });
    });

  // List versions
  cat
    .command('versions <id>')
    .description('List resource versions')
    .action(async (id) => {
      const res = await catalog.get<{ versions: Array<{ version: string; status: string; createdAt: string }> }>(
        `/api/resources/${id}/versions`
      );

      if (!res.ok) {
        error(res.error || 'Failed to list versions');
        process.exit(1);
      }

      output(res.data?.versions || [], {
        columns: [
          { key: 'version', header: 'Version' },
          { key: 'status', header: 'Status' },
          { key: 'createdAt', header: 'Created' },
        ],
      });
    });
}
