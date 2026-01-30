import { writeFile, mkdir } from "fs/promises";
import type { OpenAPISpec, DocGenerationConfig } from "./types.js";
import { generateLlmsShort, generateLlmsFull } from "./generators.js";

/**
 * Configuration for build-time documentation generation
 */
export interface BuildDocsConfig extends DocGenerationConfig {
  /** OpenAPI specification object */
  spec: OpenAPISpec;

  /** Output directory for generated files (default: docs) */
  outputDir?: string;

  /** Whether to log progress (default: true) */
  verbose?: boolean;
}

/**
 * Generate all documentation files at build time
 */
export async function generateDocs(config: BuildDocsConfig): Promise<void> {
  const outputDir = config.outputDir || "docs";
  const verbose = config.verbose !== false;

  if (verbose) {
    console.log("generating documentation...");
  }

  // Ensure output directory exists
  await mkdir(outputDir, { recursive: true });

  // Generate openapi.json
  await writeFile(
    `${outputDir}/openapi.json`,
    JSON.stringify(config.spec, null, 2)
  );
  if (verbose) {
    console.log("  ✓ openapi.json");
  }

  // Generate llms.txt (short summary)
  const llmsShort = generateLlmsShort(config.spec, config);
  await writeFile(`${outputDir}/llms.txt`, llmsShort);
  if (verbose) {
    console.log("  ✓ llms.txt");
  }

  // Generate llms-full.txt (complete documentation)
  const llmsFull = generateLlmsFull(config.spec, config);
  await writeFile(`${outputDir}/llms-full.txt`, llmsFull);
  if (verbose) {
    console.log("  ✓ llms-full.txt");
  }
}
