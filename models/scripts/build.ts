import { build as esbuild } from "esbuild";
import { rm, readFile } from "fs/promises";
import { generateDocs } from "@symbia/md";
import { apiDocumentation } from "../server/src/openapi.js";

const allowlist = [
  "express",
  "zod",
];

async function buildAll() {
  await rm("dist", { recursive: true, force: true });

  // Generate documentation
  await generateDocs({
    spec: apiDocumentation,
    serviceName: "Symbia Models Service",
    serviceDescription: "Local LLM inference using node-llama-cpp with HuggingFace integration.",
    overviewPoints: [
      "OpenAI-compatible /v1/chat/completions endpoint",
      "Automatic model discovery from /data/models directory",
      "LRU caching with configurable max loaded models",
      "Streaming support via Server-Sent Events",
      "Catalog integration for model registry",
      "Provider name: symbia-labs",
    ],
    customHeaders: [
      {
        name: "Authorization",
        description: "Bearer token for authenticated endpoints",
      },
      {
        name: "X-Service-Auth",
        description: "Internal service authentication header",
      },
    ],
    authNotes: [
      "OpenAI-compatible endpoints (/v1/*) are unauthenticated for local inference",
      "Management endpoints require Bearer token authentication",
      "Internal service-to-service calls use X-Service-Auth header",
    ],
    additionalSections: [
      {
        title: "Model Discovery",
        content: `Models are automatically discovered from the MODELS_PATH directory (default: /data/models).

Supported formats:
- GGUF files (.gguf) - Quantized models for llama.cpp

Model IDs are derived from filenames by:
1. Removing the .gguf extension
2. Converting to lowercase
3. Replacing non-alphanumeric characters with hyphens

Example: \`Llama-3.2-3B-Q4_K_M.gguf\` → \`llama-3-2-3b-q4-k-m\``,
      },
      {
        title: "Memory Management",
        content: `The service uses LRU (Least Recently Used) caching for loaded models:

- **MAX_LOADED_MODELS**: Maximum models in memory (default: 2)
- **IDLE_TIMEOUT_MS**: Auto-unload after idle period (default: 5 minutes)
- **DEFAULT_GPU_LAYERS**: GPU layers for acceleration (default: 0)
- **DEFAULT_THREADS**: CPU threads for inference (default: 4)

When a new model is requested and the limit is reached, the least recently used model is automatically unloaded.`,
      },
      {
        title: "Catalog Registration",
        content: `Models are registered in the Catalog service for discovery:

- Key pattern: \`integrations/symbia-labs/models/{modelId}\`
- Type: integration
- Tags: ai, llm, symbia-labs, local, model, gguf

Assistants can query the Catalog to discover available local models.`,
      },
      {
        title: "Using via Integrations Service",
        content: `To use local models through the Integrations service:

\`\`\`json
{
  "provider": "symbia-labs",
  "operation": "chat.completions",
  "params": {
    "model": "llama-3-2-3b-q4-k-m",
    "messages": [
      {"role": "user", "content": "Hello!"}
    ]
  }
}
\`\`\``,
      },
    ],
  });

  console.log("building server...");
  const pkg = JSON.parse(await readFile("package.json", "utf-8"));
  const allDeps = [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
  ];

  // Externalize native modules and non-bundled deps
  const externals = allDeps.filter(
    (dep) => !allowlist.includes(dep) && !dep.startsWith("@symbia/")
  );
  // Always externalize node-llama-cpp (has native bindings)
  externals.push("node-llama-cpp");

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
