import { build as esbuild } from "esbuild";
import { rm, readFile } from "fs/promises";
import { generateDocs } from "@symbia/md";
import { openApiSpec } from "../server/src/openapi.js";

// server deps to bundle to reduce openat(2) syscalls
// which helps cold start times
const allowlist = [
  "@google/generative-ai",
  "axios",
  "connect-pg-simple",
  "cors",
  "date-fns",
  "drizzle-orm",
  "drizzle-zod",
  "express",
  "express-rate-limit",
  "express-session",
  "jsonwebtoken",
  "memorystore",
  "multer",
  "nanoid",
  "nodemailer",
  "openai",
  "passport",
  "passport-local",
  "pg",
  "stripe",
  "uuid",
  "ws",
  "xlsx",
  "zod",
  "zod-validation-error",
];

async function buildAll() {
  await rm("dist", { recursive: true, force: true });

  // Generate documentation
  await generateDocs({
    spec: openApiSpec,
    serviceName: "Symbia Logging Service",
    serviceDescription:
      "Comprehensive observability platform supporting Logs, Metrics, Traces, and Objects.",
    overviewPoints: [
      "Log stream and entry management with structured logging",
      "Metric definitions and time-series data point tracking",
      "Distributed tracing with span correlation",
      "Binary object and file management with metadata",
      "Multi-tenant scoping with organization, service, and environment isolation",
      "Data classification support (none|pii|phi|secret)",
    ],
    customHeaders: [
      {
        name: "X-Org-Id",
        description: "Organization ID (required for multi-org users)",
      },
      {
        name: "X-Service-Id",
        description: "Service identifier",
      },
      {
        name: "X-Env",
        description: "Environment (dev|stage|prod)",
      },
      {
        name: "X-Data-Class",
        description: "Data classification (none|pii|phi|secret)",
      },
      {
        name: "X-Policy-Ref",
        description: "Policy reference string",
      },
    ],
    authNotes: [
      "Cookie-based session authentication for browser clients",
      "JWT introspection with Identity Service",
    ],
    additionalSections: [
      {
        title: "Data Types",
        content: `The logging service supports four primary data types:

**Logs**: Structured log entries organized into streams
- Create streams to organize logs by application/component
- Ingest log entries with timestamp, level, message, and attributes
- Query logs by time range, level, search text, and stream

**Metrics**: Time-series numeric data points
- Define metrics with type (counter|gauge|histogram|summary)
- Ingest data points with labels for multi-dimensional analysis
- Query metrics with aggregation and grouping

**Traces**: Distributed tracing for request correlation
- Ingest spans with trace ID, parent relationships, and timing
- Query traces by service, operation, duration, and tags
- Retrieve all spans for a specific trace

**Objects**: Binary object and file storage references
- Create streams to organize objects by type
- Register object metadata including storage URL and checksum
- Query objects by time, content type, and size`,
      },
      {
        title: "Scoping Model",
        content: `All data is scoped by:
- **Organization ID** (orgId): Multi-tenant isolation
- **Service ID** (serviceId): Logical service grouping
- **Environment** (env): dev, stage, or prod
- **Data Class** (dataClass): Security classification
- **Policy Ref** (policyRef): Compliance policy reference

Queries automatically filter to the current scope based on headers.
Super-admin users can override scoping for cross-org queries.`,
      },
    ],
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
