import { build as esbuild } from "esbuild";
import { rm, readFile } from "fs/promises";
import { generateDocs } from "@symbia/md";
import { openApiSpec } from "../server/src/openapi.js";

const allowlist = [
  "cookie-parser",
  "cors",
  "express",
  "jose",
  "pg",
  "socket.io",
  "uuid",
];

async function buildAll() {
  await rm("dist", { recursive: true, force: true });

  // Generate documentation
  await generateDocs({
    spec: openApiSpec,
    serviceName: "Symbia Messaging Service",
    serviceDescription:
      "Real-time messaging bus for users, agents, and services with WebSocket support.",
    overviewPoints: [
      "Real-time conversation management with WebSocket support",
      "Message creation, editing, and deletion with full history",
      "Control events for stream management (pause, resume, preempt, route)",
      "Participant management with role-based permissions",
      "Typing indicators and presence tracking",
      "Multi-tenant scoping with organization and service isolation",
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
      "Cookie-based session authentication",
    ],
    additionalSections: [
      {
        title: "WebSocket Connection",
        content: `Connect to WebSocket at: ws://host/api/ws

**Client Events:**
- join:conversation - Join a conversation
- leave:conversation - Leave a conversation
- message:send - Send a new message
- message:edit - Edit an existing message
- message:delete - Delete a message
- control:send - Send a control event
- typing:start - Start typing indicator
- typing:stop - Stop typing indicator
- presence:update - Update presence status

**Server Events:**
- message:new - New message received
- message:updated - Message was updated
- message:deleted - Message was deleted
- typing:started - User started typing
- typing:stopped - User stopped typing
- presence:changed - Presence status changed
- stream.pause - Stream paused
- stream.resume - Stream resumed
- stream.preempt - Stream preempted
- stream.route - Stream routed
- stream.handoff - Stream handed off
- stream.cancel - Stream cancelled
- stream.priority - Priority changed`,
      },
      {
        title: "Message Structure",
        content: `Messages support:
- **Content Types**: text/plain, text/markdown, application/json
- **Metadata**: Custom key-value pairs for extensibility
- **Threading**: Parent message references for conversation threading
- **Versioning**: Full edit history with timestamps
- **Sequences**: Ordered message delivery with sequence numbers
- **Priority**: Message priority levels (low, normal, high, critical)`,
      },
      {
        title: "Control Events",
        content: `Control events enable stream management:
- **pause**: Temporarily pause a stream
- **resume**: Resume a paused stream
- **preempt**: Preempt current stream with higher priority
- **route**: Route stream to different handler
- **handoff**: Hand off stream to another participant
- **cancel**: Cancel an active stream
- **priority**: Change stream priority level`,
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
