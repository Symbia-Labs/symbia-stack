#!/usr/bin/env node

import { Command } from 'commander';
import { registerIdentityCommands } from './commands/identity.js';
import { registerCatalogCommands } from './commands/catalog.js';
import { registerLoggingCommands } from './commands/logging.js';
import { registerMessagingCommands } from './commands/messaging.js';
import { registerAssistantsCommands } from './commands/assistants.js';
import { registerNetworkCommands } from './commands/network.js';
import { registerServerCommands } from './commands/server.js';
import { registerScriptCommands } from './commands/script.js';
import { getCurrentContextName, getContextConfig } from './config.js';
import { info, warn } from './output.js';

const program = new Command();

program
  .name('symbia')
  .description('Symbia CLI - Unified interface to all Symbia services')
  .version('1.0.0')
  .option('-c, --context <name>', 'Use a specific context')
  .option('-o, --output <format>', 'Output format (table, json, yaml, ids)', 'table')
  .option('--no-color', 'Disable colored output')
  .hook('preAction', (thisCommand) => {
    // Set context from CLI flag if provided
    const opts = thisCommand.opts();
    if (opts.context) {
      process.env.SYMBIA_CONTEXT = opts.context;
    }
    // Set output format
    if (opts.output) {
      process.env.SYMBIA_OUTPUT_FORMAT = opts.output;
    }
  });

// Register all service commands
registerIdentityCommands(program);
registerCatalogCommands(program);
registerLoggingCommands(program);
registerMessagingCommands(program);
registerAssistantsCommands(program);
registerNetworkCommands(program);
registerServerCommands(program);
registerScriptCommands(program);

// Version command with more details
program
  .command('version')
  .description('Show version and context information')
  .action(() => {
    console.log('Symbia CLI v1.0.0');
    console.log();

    try {
      const contextName = getCurrentContextName();
      const contextConfig = getContextConfig(contextName);
      info(`Context: ${contextName}`);
      if (contextConfig) {
        info(`Endpoint: ${contextConfig.endpoint || 'not set'}`);
      }
    } catch {
      warn('No configuration found. Run: symbia identity config add-context');
    }
  });

// Status command to check connectivity
program
  .command('status')
  .description('Check connectivity to Symbia services')
  .action(async () => {
    const { identity, catalog, messaging, logging, assistants, network, server } = await import('./client.js');
    const { ServicePorts, ServiceId } = await import('@symbia/sys');

    console.log('Checking Symbia services...\n');

    const services = [
      { name: 'Identity', client: identity, id: ServiceId.IDENTITY },
      { name: 'Catalog', client: catalog, id: ServiceId.CATALOG },
      { name: 'Messaging', client: messaging, id: ServiceId.MESSAGING },
      { name: 'Logging', client: logging, id: ServiceId.LOGGING },
      { name: 'Assistants', client: assistants, id: ServiceId.ASSISTANTS },
      { name: 'Network', client: network, id: ServiceId.NETWORK },
      { name: 'Server', client: server, id: ServiceId.SERVER },
    ];

    for (const svc of services) {
      try {
        const port = ServicePorts[svc.id];
        const res = await svc.client.get<{ status?: string }>('/health');

        if (res.ok) {
          console.log(`  ✓ ${svc.name.padEnd(12)} (port ${port})`);
        } else {
          console.log(`  ✗ ${svc.name.padEnd(12)} - ${res.error}`);
        }
      } catch {
        console.log(`  ✗ ${svc.name.padEnd(12)} - unreachable`);
      }
    }
  });

// Docs command
program
  .command('docs')
  .description('Show CLI documentation')
  .action(() => {
    console.log(`
Symbia CLI - Service-namespaced commands

USAGE
  symbia <service> <command> [subcommand] [args] [flags]

SERVICES
  identity (id)      User authentication, organizations, API keys
  catalog (cat)      Resource catalog management
  logging (logs)     Logs, metrics, and traces
  messaging (msg)    Real-time messaging and conversations
  assistants (ast)   AI assistants, graphs, rules, actors
  network (net)      Network routing, policies, observability
  server (srv)       Build management and proxy operations
  script (graph)     Symbia Script - .symbia graph definitions

GLOBAL FLAGS
  -c, --context      Use a specific context
  -o, --output       Output format (table, json, yaml, ids)
  --no-color         Disable colored output

EXAMPLES
  symbia identity login
  symbia catalog list --limit 10
  symbia logs query --last 1h --level error
  symbia msg conversations list
  symbia ast graphs list
  symbia net nodes list
  symbia srv builds list
  symbia script new my-workflow --template audio
  symbia script compile my-workflow.symbia

CONFIGURATION
  Config file: ~/.symbia/config.yaml
  Credentials: ~/.symbia/credentials.json

  Add a new context:
    symbia identity config add-context local --network http://localhost:5010

  Switch contexts:
    symbia identity config use-context production

For service-specific help:
  symbia <service> --help
  symbia <service> <command> --help
`);
  });

// Parse and execute
program.parse();
