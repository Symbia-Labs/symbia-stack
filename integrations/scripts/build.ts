import { build as esbuild } from "esbuild";
import { rm, readFile } from "fs/promises";
import { generateDocs } from "@symbia/md";
import { apiDocumentation } from "../server/src/openapi.js";

// Dependencies to bundle for faster cold starts
const allowlist = [
  "drizzle-orm",
  "express",
  "pg",
  "zod",
  "zod-validation-error",
];

async function buildAll() {
  await rm("dist", { recursive: true, force: true });

  await generateDocs({
    spec: apiDocumentation,
    serviceName: "Symbia Integrations Service",
    serviceDescription: "Centralized gateway for third-party API traffic including LLM providers.",
    overviewPoints: [
      "Execute LLM operations (chat completions, text generation, embeddings)",
      "Supports OpenAI and HuggingFace providers",
      "Normalized response format across all providers",
      "Credential management via Identity service",
      "Provider configuration via Catalog service",
      "Execution logging and usage tracking",
    ],
    customHeaders: [
      {
        name: "Authorization",
        description: "Bearer token for authentication",
      },
      {
        name: "X-Org-Id",
        description: "Organization ID for credential scoping",
      },
    ],
    authNotes: [
      "Bearer token authentication (Authorization: Bearer <token>)",
      "Cookie-based session authentication (token cookie)",
    ],
    additionalSections: [
      {
        title: "Supported Providers",
        content: `Currently supported LLM providers:
- **OpenAI**: chat.completions, embeddings
- **HuggingFace**: text.generation, chat.completions, embeddings

More providers coming soon: Anthropic, Google Gemini, Cohere`,
      },
      {
        title: "Response Normalization",
        content: `All provider responses are normalized to a common schema:
- provider: The provider name
- model: The model used
- content: The generated content
- usage: Token counts (prompt, completion, total)
- finishReason: Why generation stopped (stop, length, content_filter, etc.)`,
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
