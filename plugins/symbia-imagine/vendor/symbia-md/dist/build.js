import { writeFile, mkdir } from "fs/promises";
import { generateLlmsShort, generateLlmsFull } from "./generators.js";
/**
 * Generate all documentation files at build time
 */
export async function generateDocs(config) {
    const outputDir = config.outputDir || "docs";
    const verbose = config.verbose !== false;
    if (verbose) {
        console.log("generating documentation...");
    }
    // Ensure output directory exists
    await mkdir(outputDir, { recursive: true });
    // Generate openapi.json
    await writeFile(`${outputDir}/openapi.json`, JSON.stringify(config.spec, null, 2));
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
