import { build as esbuild } from "esbuild";
import { rm, readFile } from "fs/promises";
import { generateDocs } from "@symbia/md";
import { openApiSpec } from "../server/src/openapi.js";

const allowlist = [
  "compression",
  "cookie-parser",
  "cors",
  "drizzle-orm",
  "express",
  "helmet",
  "jsonwebtoken",
  "morgan",
  "pg",
  "uuid",
  "zod",
];

async function buildAll() {
  await rm("dist", { recursive: true, force: true });

  // Generate documentation
  await generateDocs({
    spec: openApiSpec,
    serviceName: "Symbia Assistants Backend",
    serviceDescription:
      "Backend APIs for prompt graphs, actor principals, and run orchestration used by Collaborate.",
    overviewPoints: [
      "Prompt graph CRUD and publishing workflow",
      "Actor principal management with webhook configuration",
      "Graph run history, logs, and execution tracking",
      "Messaging webhooks for message and control events",
      "Organization-scoped multi-tenancy",
    ],
    customHeaders: [
      {
        name: "orgId (query parameter)",
        description: "Organization ID required for most endpoints",
      },
    ],
    authNotes: [
      "Most endpoints require orgId as a query parameter",
      "Actor principals use webhook-based authentication",
    ],
    additionalSections: [
      {
        title: "Workflow",
        content: `Typical workflow for using the Assistants Backend:

1. **Create a Graph**: POST /api/v1/graphs with orgId, name, and graphJson
2. **Publish the Graph**: POST /api/v1/graphs/{id}/publish to make it available
3. **Create an Actor**: POST /api/v1/actors to create an actor principal linked to the graph
4. **Handle Messages**: POST /api/webhook/message when messages arrive for the actor
5. **Monitor Runs**: GET /api/v1/runs to track execution history
6. **View Logs**: GET /api/v1/runs/{id}/logs for detailed run diagnostics`,
      },
      {
        title: "Graph Structure",
        content: `Graphs are defined using JSON with:
- **Nodes**: Individual steps in the workflow
- **Edges**: Connections between nodes
- **Trigger Conditions**: When the graph should execute
- **Log Level**: Verbosity of execution logging

Graphs can be in draft or published state. Only published graphs can be executed.`,
      },
      {
        title: "Actor Principals",
        content: `Actors are principals that can:
- Receive messages via webhooks
- Execute associated graphs automatically
- Have configurable capabilities
- Be active or inactive

Each actor can have a default graph that executes when messages are received.`,
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
    format: "esm",
    outfile: "dist/index.mjs",
    banner: {
      js: `import { createRequire } from 'module'; const require = createRequire(import.meta.url);`,
    },
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
