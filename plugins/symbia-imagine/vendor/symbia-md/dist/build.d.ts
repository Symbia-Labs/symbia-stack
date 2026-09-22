import type { OpenAPISpec, DocGenerationConfig } from "./types.js";
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
export declare function generateDocs(config: BuildDocsConfig): Promise<void>;
