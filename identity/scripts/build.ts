import { build as esbuild } from "esbuild";
import { rm, readFile } from "fs/promises";
import { generateDocs } from "@symbia/md";
import { apiDocumentation } from "../server/src/openapi.js";

// server deps to bundle to reduce openat(2) syscalls
// which helps cold start times
const allowlist = [
  "@google/generative-ai",
  "axios",
  "connect-pg-simple",
  "cookie-parser",
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
    spec: apiDocumentation,
    serviceName: "Symbia Identity Service",
    serviceDescription:
      "Authentication and authorization service with multi-tenant support.",
    overviewPoints: [
      "User authentication (register, login, password reset)",
      "Organization management with role-based access control",
      "Project, Application, and Service hierarchy",
      "Polymorphic scoped entitlements with quotas",
      "API key management for service-to-service auth",
      "Token introspection for service-to-service validation",
      "Audit logging",
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
      "Cookie-based session authentication (token cookie)",
      "Bearer token authentication (Authorization: Bearer <token>)",
      "API key authentication (X-API-Key header)",
    ],
    additionalSections: [
      {
        title: "Service-to-Service Auth",
        content: `For validating tokens from other services:
- POST /api/auth/introspect - Validate JWT tokens
- POST /api/auth/verify-api-key - Validate API keys`,
      },
      {
        title: "Organization Hierarchy",
        content: `Resources are organized in a hierarchy:
- **Organization**: Top-level tenant container
- **Project**: Logical grouping within an org
- **Application**: Deployable unit within a project
- **Service**: Runtime service instance`,
      },
      {
        title: "Entitlements",
        content: `Scoped permissions with optional quotas:
- Entitlements can be scoped to org, project, app, or service
- Quotas define usage limits (e.g., max API calls)
- Super-admin bypasses all entitlement checks`,
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
