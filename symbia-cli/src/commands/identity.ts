import { Command } from 'commander';
import { createInterface } from 'readline';
import { login, loginWithApiKey, logout, checkAuth } from '../auth.js';
import { identity } from '../client.js';
import { success, error, info, output, detail, separator } from '../output.js';
import { loadConfig, saveConfig, listContexts, setCurrentContext, addContext, getCurrentContext } from '../config.js';

function prompt(question: string, hidden = false): Promise<string> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise(resolve => {
    if (hidden) {
      process.stdout.write(question);
      let input = '';
      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.on('data', (char) => {
        const c = char.toString();
        if (c === '\n' || c === '\r') {
          process.stdin.setRawMode(false);
          process.stdin.pause();
          console.log();
          rl.close();
          resolve(input);
        } else if (c === '\u0003') {
          process.exit();
        } else if (c === '\u007F') {
          input = input.slice(0, -1);
        } else {
          input += c;
        }
      });
    } else {
      rl.question(question, answer => {
        rl.close();
        resolve(answer);
      });
    }
  });
}

export function registerIdentityCommands(program: Command): void {
  const identity_cmd = program
    .command('identity')
    .alias('auth')
    .description('Authentication and identity management');

  // Login
  identity_cmd
    .command('login')
    .description('Authenticate with Symbia')
    .option('-e, --email <email>', 'Email address')
    .option('-k, --api-key <key>', 'API key for authentication')
    .action(async (opts) => {
      if (opts.apiKey) {
        const result = await loginWithApiKey(opts.apiKey);
        if (result.success) {
          success('Authenticated with API key');
        } else {
          error(result.error || 'Authentication failed');
          process.exit(1);
        }
        return;
      }

      const email = opts.email || await prompt('Email: ');
      const password = await prompt('Password: ', true);

      const result = await login(email, password);
      if (result.success) {
        success(`Authenticated as ${email}`);
      } else {
        error(result.error || 'Authentication failed');
        process.exit(1);
      }
    });

  // Logout
  identity_cmd
    .command('logout')
    .description('Clear authentication credentials')
    .action(() => {
      logout();
      success('Logged out');
    });

  // Whoami
  identity_cmd
    .command('whoami')
    .description('Show current authenticated user')
    .action(async () => {
      const state = await checkAuth();
      if (!state.authenticated) {
        error('Not authenticated. Run: symbia auth login');
        process.exit(1);
      }

      detail('User ID', state.user?.id);
      detail('Email', state.user?.email);
      detail('Name', state.user?.name);
      if (state.expiresAt) {
        detail('Token Expires', new Date(state.expiresAt).toLocaleString());
      }
    });

  // Organizations
  const orgs = identity_cmd
    .command('orgs')
    .description('Manage organizations');

  orgs
    .command('list')
    .description('List organizations')
    .action(async () => {
      const res = await identity.get<{ orgs: Array<{ id: string; name: string; role: string }> }>('/api/orgs');
      if (!res.ok) {
        error(res.error || 'Failed to list organizations');
        process.exit(1);
      }

      output(res.data?.orgs || [], {
        columns: [
          { key: 'id', header: 'ID' },
          { key: 'name', header: 'Name' },
          { key: 'role', header: 'Role' },
        ],
        idKey: 'id',
      });
    });

  orgs
    .command('create <name>')
    .description('Create a new organization')
    .action(async (name) => {
      const res = await identity.post<{ id: string; name: string }>('/api/orgs', { name });
      if (!res.ok) {
        error(res.error || 'Failed to create organization');
        process.exit(1);
      }

      success(`Created organization: ${res.data?.name} (${res.data?.id})`);
    });

  // Users
  const users = identity_cmd
    .command('users')
    .description('Manage users');

  users
    .command('list')
    .description('List users')
    .option('--org <orgId>', 'Filter by organization')
    .action(async (opts) => {
      const res = await identity.get<{ users: Array<{ id: string; email: string; name: string }> }>(
        '/api/users',
        { orgId: opts.org }
      );
      if (!res.ok) {
        error(res.error || 'Failed to list users');
        process.exit(1);
      }

      output(res.data?.users || [], {
        columns: [
          { key: 'id', header: 'ID' },
          { key: 'email', header: 'Email' },
          { key: 'name', header: 'Name' },
        ],
        idKey: 'id',
      });
    });

  // API Keys
  const keys = identity_cmd
    .command('keys')
    .description('Manage API keys');

  keys
    .command('list')
    .description('List API keys')
    .action(async () => {
      const res = await identity.get<{ keys: Array<{ id: string; name: string; createdAt: string; expiresAt?: string }> }>(
        '/api/api-keys'
      );
      if (!res.ok) {
        error(res.error || 'Failed to list API keys');
        process.exit(1);
      }

      output(res.data?.keys || [], {
        columns: [
          { key: 'id', header: 'ID' },
          { key: 'name', header: 'Name' },
          { key: 'createdAt', header: 'Created' },
          { key: 'expiresAt', header: 'Expires' },
        ],
        idKey: 'id',
      });
    });

  keys
    .command('create <name>')
    .description('Create a new API key')
    .option('-s, --scopes <scopes>', 'Comma-separated list of scopes')
    .option('-e, --expires <days>', 'Expiration in days', '365')
    .action(async (name, opts) => {
      const scopes = opts.scopes ? opts.scopes.split(',').map((s: string) => s.trim()) : undefined;
      const expiresInDays = parseInt(opts.expires, 10);

      const res = await identity.post<{ id: string; key: string }>('/api/api-keys', {
        name,
        scopes,
        expiresInDays,
      });

      if (!res.ok) {
        error(res.error || 'Failed to create API key');
        process.exit(1);
      }

      success(`Created API key: ${name}`);
      separator();
      info('Save this key - it will not be shown again:');
      console.log(res.data?.key);
    });

  keys
    .command('revoke <id>')
    .description('Revoke an API key')
    .action(async (id) => {
      const res = await identity.delete(`/api/api-keys/${id}`);
      if (!res.ok) {
        error(res.error || 'Failed to revoke API key');
        process.exit(1);
      }

      success(`Revoked API key: ${id}`);
    });

  // Config commands (part of auth/identity for convenience)
  const config = identity_cmd
    .command('config')
    .description('Manage CLI configuration');

  config
    .command('view')
    .description('View current configuration')
    .action(() => {
      const cfg = loadConfig();
      const context = getCurrentContext();

      detail('Current Context', cfg['current-context']);
      separator();
      detail('Endpoint', context.endpoint);
      detail('Organization', context.org || '(not set)');
    });

  config
    .command('set <key> <value>')
    .description('Set a configuration value')
    .action((key, value) => {
      const cfg = loadConfig();
      const contextName = cfg['current-context'];

      if (key === 'endpoint') {
        cfg.contexts[contextName].endpoint = value;
      } else if (key === 'org') {
        cfg.contexts[contextName].org = value;
      } else {
        error(`Unknown config key: ${key}`);
        process.exit(1);
      }

      saveConfig(cfg);
      success(`Set ${key} = ${value}`);
    });

  config
    .command('use-context <name>')
    .description('Switch to a different context')
    .action((name) => {
      if (setCurrentContext(name)) {
        success(`Switched to context: ${name}`);
      } else {
        error(`Context not found: ${name}`);
        process.exit(1);
      }
    });

  config
    .command('contexts')
    .description('List available contexts')
    .action(() => {
      const cfg = loadConfig();
      const contexts = listContexts();

      output(contexts.map(c => ({
        name: c.name,
        endpoint: c.endpoint,
        org: c.org || '-',
        current: c.name === cfg['current-context'] ? '●' : '',
      })), {
        columns: [
          { key: 'current', header: '' },
          { key: 'name', header: 'Name' },
          { key: 'endpoint', header: 'Endpoint' },
          { key: 'org', header: 'Org' },
        ],
      });
    });

  config
    .command('add-context <name>')
    .description('Add a new context')
    .requiredOption('-e, --endpoint <url>', 'Base URL for services')
    .option('-o, --org <orgId>', 'Default organization')
    .action((name, opts) => {
      addContext({
        name,
        endpoint: opts.endpoint,
        org: opts.org,
      });
      success(`Added context: ${name}`);
    });
}
