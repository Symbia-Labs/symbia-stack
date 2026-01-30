import { build as esbuild } from "esbuild";
import { rm, readFile } from "fs/promises";
import { generateDocs } from "@symbia/md";
import { openApiSpec } from "../server/src/openapi.js";

const allowlist = [
  "cookie-parser",
  "express",
  "jose",
  "socket.io",
  "uuid",
  "yaml",
];

async function buildAll() {
  await rm("dist", { recursive: true, force: true });

  // Generate documentation
  await generateDocs({
    spec: openApiSpec,
    serviceName: "Symbia Runtime Service",
    serviceDescription:
      "Graph execution engine for Symbia Script workflows with real-time WebSocket support.",
    overviewPoints: [
      "Load and execute Symbia Script graph definitions",
      "Built-in dataflow components (filter, map, merge, split, etc.)",
      "Real-time execution monitoring via WebSocket",
      "Backpressure management and flow control",
      "Custom component registration with JavaScript/TypeScript",
      "Execution lifecycle management (start, pause, resume, stop)",
    ],
    customHeaders: [
      {
        name: "X-Org-Id",
        description: "Organization ID for multi-tenant scoping",
      },
      {
        name: "X-Service-Id",
        description: "Service identifier for request routing",
      },
    ],
    authNotes: [
      "Bearer token authentication (Authorization: Bearer <token>)",
      "API key authentication (X-API-Key header)",
      "Cookie-based session authentication",
    ],
    additionalSections: [
      {
        title: "WebSocket Connection",
        content: `Connect to WebSocket at: ws://host/

**Client Events:**
- execution:subscribe - Subscribe to execution events
- execution:unsubscribe - Unsubscribe from execution events
- execution:start - Start a graph execution
- execution:pause - Pause a running execution
- execution:resume - Resume a paused execution
- execution:stop - Stop an execution
- execution:inject - Inject a message into an execution

**Server Events:**
- execution:started - Execution has started
- execution:paused - Execution paused
- execution:resumed - Execution resumed
- execution:completed - Execution completed
- execution:failed - Execution failed
- execution:state - Current execution state
- port:emit - Data emitted from component port
- component:invoked - Component was invoked
- metrics:update - Execution metrics updated
- error - Error occurred`,
      },
      {
        title: "Built-in Components",
        content: `The runtime includes these built-in components:

**Core:**
- symbia.core.passthrough - Forward input unchanged
- symbia.core.logger - Log and forward values
- symbia.core.delay - Delay messages
- symbia.core.filter - Filter values by predicate
- symbia.core.map - Transform values
- symbia.core.merge - Combine multiple inputs
- symbia.core.split - Route values conditionally
- symbia.core.accumulator - Batch values

**I/O:**
- symbia.io.http-request - Make HTTP requests

**Data:**
- symbia.data.json-transform - Extract data with path notation`,
      },
      {
        title: "Graph Definition Format",
        content: `Graphs are defined in YAML or JSON:

\`\`\`yaml
symbia: "1.0"
name: my-workflow
version: "1.0.0"

nodes:
  - id: input
    component: symbia.core.passthrough
  - id: transform
    component: symbia.core.map
    config:
      transform: "value * 2"
  - id: output
    component: symbia.core.logger

edges:
  - source: { node: input, port: output }
    target: { node: transform, port: input }
  - source: { node: transform, port: output }
    target: { node: output, port: input }
\`\`\``,
      },
    ],
    outputDir: "docs",
  });

  console.log("building server...");
  const pkg = JSON.parse(await readFile("package.json", "utf-8"));
  const allDeps = [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
  ];
  const externals = allDeps.filter(
    (dep) => !allowlist.includes(dep) && !dep.startsWith("@symbia/")
  );

  await esbuild({
    entryPoints: ["server/src/index.ts"],
    platform: "node",
    bundle: true,
    format: "cjs",
    outfile: "dist/index.cjs",
    define: {
      "process.env.NODE_ENV": '"production"',
    },
    minify: true,
    external: externals,
    logLevel: "info",
  });
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
