import { build as esbuild } from 'esbuild';
import { rm, readFile } from 'fs/promises';
import { generateDocs } from '@symbia/md';
import { apiDocumentation } from '../server/src/openapi.js';

const allowlist = [
  'cookie-parser',
  'cors',
  'express',
  'jose',
  'socket.io',
  'uuid',
];

async function buildAll() {
  await rm('dist', { recursive: true, force: true });

  await generateDocs({
    spec: apiDocumentation,
    serviceName: 'Symbia Network Service',
    serviceDescription:
      'Event routing, policy enforcement, and SoftSDN observability for the Symbia ecosystem.',
    overviewPoints: [
      'Node registration and service discovery',
      'Contract-based event routing between nodes',
      'Policy-driven event filtering (allow/deny/route/transform)',
      'Hash-based security policy commitment',
      'Bridge management for external system integration',
      'SoftSDN observability API for assistants',
      'WebSocket support for real-time event delivery',
    ],
    customHeaders: [
      {
        name: 'X-Org-Id',
        description: 'Organization ID for multi-tenant scoping',
      },
      {
        name: 'X-Service-Id',
        description: 'Service identifier for request routing',
      },
    ],
    authNotes: [
      'Bearer token authentication (Authorization: Bearer <token>)',
      'API key authentication (X-API-Key header)',
      'WebSocket authentication via handshake',
    ],
    additionalSections: [
      {
        title: 'Event Primitive',
        content: `Events consist of three parts:
- **Payload**: { type: string, data: any } - what happened
- **Wrapper**: { id, runId, timestamp, source, target, causedBy, path[], boundary } - routing metadata
- **Hash**: SHA-256 hash for security policy commitment`,
      },
      {
        title: 'Boundary Types',
        content: `Events are classified by boundary:
- **intra**: Within a sandbox (internal communication)
- **inter**: Between sandboxes (service-to-service)
- **extra**: External systems (via bridges)`,
      },
      {
        title: 'Node Types',
        content: `Four types of nodes can register:
- **service**: Backend services (identity, catalog, etc.)
- **assistant**: AI assistants
- **sandbox**: Workflow execution sandboxes
- **bridge**: External system connectors`,
      },
      {
        title: 'Policy Actions',
        content: `Routing policies support these actions:
- **allow**: Allow event to proceed
- **deny**: Block event (optional reason)
- **route**: Redirect to different target
- **transform**: Transform event data
- **log**: Log event at specified level`,
      },
      {
        title: 'WebSocket Events',
        content: `Client events:
- node:register, node:heartbeat, node:unregister
- event:send
- contract:create
- sdn:watch, sdn:unwatch, sdn:topology

Server events:
- network:node:joined, network:node:left
- event:received
- sdn:event`,
      },
      {
        title: 'Telemetry',
        content: `The Network Service emits comprehensive telemetry via @symbia/logging-client:

**Metrics:**
- Event routing: network.event.routed, network.event.dropped, network.event.latency_ms
- Node lifecycle: network.node.registered, network.node.unregistered, network.node.heartbeat
- Contracts: network.contract.created, network.contract.deleted, network.contract.expired
- Bridges: network.bridge.registered, network.bridge.deleted, network.bridge.active_count
- Policies: network.policy.evaluated, network.policy.denied, network.policy.evaluation_latency_ms
- WebSocket: network.socket.connected, network.socket.disconnected
- SDN: network.sdn.watch.subscribed, network.sdn.watch.active_count

**Events:**
- Lifecycle: network.service.started, network.service.stopped
- Routing: network.event.routed, network.event.dropped, network.event.delivery_failed
- Security: network.security.hash_failed, network.agent.authenticated`,
      },
    ],
  });

  console.log('building server...');
  const pkg = JSON.parse(await readFile('package.json', 'utf-8'));
  const allDeps = [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
  ];
  const externals = allDeps.filter(
    (dep) => !allowlist.includes(dep) && !dep.startsWith('@symbia/')
  );

  await esbuild({
    entryPoints: ['server/src/index.ts'],
    platform: 'node',
    bundle: true,
    format: 'esm',
    outfile: 'dist/index.mjs',
    banner: {
      js: `import { createRequire } from 'module'; const require = createRequire(import.meta.url);`,
    },
    define: {
      'process.env.NODE_ENV': '"production"',
    },
    minify: true,
    external: externals,
    logLevel: 'info',
  });
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
