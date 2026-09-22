import type { OpenAPISpec, DocGenerationConfig } from "./types.js";
/**
 * Generate short-form llms.txt documentation
 */
export declare function generateLlmsShort(spec: OpenAPISpec, config: DocGenerationConfig): string;
/**
 * Generate full-form llms-full.txt documentation
 */
export declare function generateLlmsFull(spec: OpenAPISpec, config: DocGenerationConfig): string;
