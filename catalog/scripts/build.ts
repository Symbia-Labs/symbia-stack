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

  await generateDocs({
    spec: openApiSpec,
    serviceName: "Symbia Catalog Service",
    serviceDescription:
      "Component registry and resource management with versioning support.",
    overviewPoints: [
      "Full CRUD operations on resources",
      "Version control with publish workflow",
      "Bootstrap resources for system initialization",
      "Keyword and natural language search",
      "Resource metadata and organization scoping",
      "Allowlist-based access control with entitlements",
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
        description: "Policy reference for compliance",
      },
    ],
    authNotes: [
      "Bearer token authentication (Authorization: Bearer <token>)",
      "API key authentication (X-API-Key header)",
      "Session cookie authentication (symbia_session)",
    ],
    additionalSections: [
      {
        title: "Resource Types",
        content: `Supported resource types:
- **component**: Reusable components
- **context**: Context definitions
- **integration**: External integrations
- **graph**: Workflow graphs
- **executor**: Execution engines`,
      },
      {
        title: "Resource Statuses",
        content: `Resource lifecycle statuses:
- **draft**: Work in progress, not visible to consumers
- **published**: Active and available for use
- **deprecated**: Marked for removal, still accessible`,
      },
      {
        title: "Rate Limits",
        content: `All authenticated endpoints are rate limited:
- Write operations: 30 requests per minute
- Search operations: 60 requests per minute
- Artifact uploads: 10 requests per minute`,
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
      // Preserve rate limit env vars for runtime configuration
      "process.env.RATE_LIMIT_WINDOW_MS": "process.env.RATE_LIMIT_WINDOW_MS",
      "process.env.RATE_LIMIT_WRITE_MAX": "process.env.RATE_LIMIT_WRITE_MAX",
      "process.env.RATE_LIMIT_SEARCH_MAX": "process.env.RATE_LIMIT_SEARCH_MAX",
      "process.env.RATE_LIMIT_UPLOAD_MAX": "process.env.RATE_LIMIT_UPLOAD_MAX",
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
