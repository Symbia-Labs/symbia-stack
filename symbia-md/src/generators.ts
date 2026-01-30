import type { OpenAPISpec, DocGenerationConfig } from "./types.js";

/**
 * Generate short-form llms.txt documentation
 */
export function generateLlmsShort(
  spec: OpenAPISpec,
  config: DocGenerationConfig
): string {
  const lines: string[] = [];

  lines.push(`# ${spec.info.title}`);
  lines.push("");
  lines.push(
    `> ${spec.info.description?.split("\n")[0] || "API Documentation"}`
  );
  lines.push("");

  // Overview section with custom points
  if (config.overviewPoints && config.overviewPoints.length > 0) {
    lines.push("## Overview");
    lines.push("");
    lines.push(`${config.serviceDescription}`);
    lines.push("");
    for (const point of config.overviewPoints) {
      lines.push(`- ${point}`);
    }
    lines.push("");
  }

  // API Base URL
  lines.push("## API Base URL");
  lines.push("");
  lines.push(
    `Use ${spec.servers?.[0]?.url || "/api"} as the base path for all endpoints.`
  );
  lines.push("");

  // Quick Reference - list all endpoints
  lines.push("## Quick Reference");
  lines.push("");

  for (const [path, methods] of Object.entries(spec.paths || {})) {
    for (const [method, details] of Object.entries(
      methods as Record<string, any>
    )) {
      if (method === "parameters") continue;
      const summary = (details as any).summary || "";
      lines.push(`- ${method.toUpperCase()} /api${path} - ${summary}`);
    }
  }

  lines.push("");

  // Authentication
  lines.push("## Authentication");
  lines.push("");
  lines.push("Methods supported:");
  lines.push("- Bearer token (Authorization: Bearer <token>)");
  lines.push("- API key (X-API-Key header)");
  lines.push("- Session cookie");

  if (config.authNotes && config.authNotes.length > 0) {
    lines.push("");
    for (const note of config.authNotes) {
      lines.push(`- ${note}`);
    }
  }

  lines.push("");

  // Custom headers
  if (config.customHeaders && config.customHeaders.length > 0) {
    lines.push("## Custom Headers");
    lines.push("");
    for (const header of config.customHeaders) {
      lines.push(`- ${header.name}: ${header.description}`);
    }
    lines.push("");
  }

  // Rate limits
  if (config.rateLimits && config.rateLimits.length > 0) {
    lines.push("## Rate Limits");
    lines.push("");
    for (const limit of config.rateLimits) {
      lines.push(`- ${limit.category}: ${limit.limit}`);
    }
    lines.push("");
  }

  // Documentation links
  lines.push("## Documentation");
  lines.push("");
  lines.push("- OpenAPI: /docs/openapi.json");
  lines.push("- Full docs: /docs/llms-full.txt");

  return lines.join("\n");
}

/**
 * Generate full-form llms-full.txt documentation
 */
export function generateLlmsFull(
  spec: OpenAPISpec,
  config: DocGenerationConfig
): string {
  const lines: string[] = [];

  lines.push(`# ${spec.info.title} - Complete Documentation`);
  lines.push("");
  lines.push(`> ${spec.info.description || ""}`);
  lines.push("");

  // Overview
  lines.push("## Overview");
  lines.push("");
  lines.push(config.serviceDescription);
  lines.push("");

  if (config.overviewPoints && config.overviewPoints.length > 0) {
    for (const point of config.overviewPoints) {
      lines.push(`- ${point}`);
    }
    lines.push("");
  }

  // Custom headers
  if (config.customHeaders && config.customHeaders.length > 0) {
    lines.push("## Custom Headers (optional)");
    lines.push("");
    for (const header of config.customHeaders) {
      lines.push(`- **${header.name}**: ${header.description}`);
    }
    lines.push("");
  }

  // API Reference
  lines.push("## API Reference");
  lines.push("");
  lines.push(`Base URL: ${spec.servers?.[0]?.url || "/api"}`);
  lines.push("");

  // Group endpoints by tag
  const taggedPaths: Record<
    string,
    Array<{ path: string; method: string; details: any }>
  > = {};

  for (const [path, methods] of Object.entries(spec.paths || {})) {
    for (const [method, details] of Object.entries(
      methods as Record<string, any>
    )) {
      if (method === "parameters") continue;
      const tags = (details as any).tags || ["Other"];
      for (const tag of tags) {
        if (!taggedPaths[tag]) taggedPaths[tag] = [];
        taggedPaths[tag].push({ path, method, details });
      }
    }
  }

  // Sort tags for consistent output
  const sortedTags = spec.tags?.map((t) => t.name) || Object.keys(taggedPaths).sort();

  for (const tag of sortedTags) {
    const endpoints = taggedPaths[tag] || [];
    if (endpoints.length === 0) continue;

    lines.push(`### ${tag}`);
    lines.push("");

    // Add tag description if available
    const tagInfo = spec.tags?.find((t) => t.name === tag);
    if (tagInfo?.description) {
      lines.push(tagInfo.description);
      lines.push("");
    }

    for (const { path, method, details } of endpoints) {
      lines.push(`#### ${method.toUpperCase()} /api${path}`);
      if (details.summary) lines.push(details.summary);
      if (details.description) lines.push(details.description);
      lines.push("");

      // Parameters
      if (details.parameters?.length) {
        const pathParams = details.parameters.filter((p: any) => p.in === "path");
        const queryParams = details.parameters.filter((p: any) => p.in === "query");

        if (pathParams.length) {
          lines.push("Path Parameters:");
          for (const p of pathParams) {
            lines.push(
              `- ${p.name}: ${p.description || p.schema?.type || "string"}`
            );
          }
          lines.push("");
        }

        if (queryParams.length) {
          lines.push("Query Parameters:");
          for (const p of queryParams) {
            lines.push(
              `- ${p.name} (optional): ${p.description || p.schema?.type || "string"}`
            );
          }
          lines.push("");
        }
      }

      // Request body
      if (details.requestBody?.content?.["application/json"]?.schema) {
        lines.push("Request Body:");
        lines.push("```json");
        const schema = details.requestBody.content["application/json"].schema;
        if (schema.$ref) {
          const refName = schema.$ref.split("/").pop();
          lines.push(`// See ${refName} schema`);
        } else if (schema.properties) {
          const example: Record<string, any> = {};
          for (const [key, val] of Object.entries(
            schema.properties as Record<string, any>
          )) {
            example[key] =
              val.type === "string"
                ? "string"
                : val.type === "boolean"
                ? false
                : val.type === "array"
                ? []
                : {};
          }
          lines.push(JSON.stringify(example, null, 2));
        }
        lines.push("```");
        lines.push("");
      }

      // Responses
      const successResponse =
        details.responses?.["200"] ||
        details.responses?.["201"] ||
        details.responses?.["204"];
      if (successResponse) {
        lines.push(`Response: ${successResponse.description}`);
        lines.push("");
      }
    }
  }

  // Data Models
  if (spec.components?.schemas) {
    lines.push("## Data Models");
    lines.push("");

    for (const [name, schema] of Object.entries(spec.components.schemas)) {
      lines.push(`### ${name}`);
      const s = schema as any;
      if (s.description) {
        lines.push(s.description);
        lines.push("");
      }
      lines.push("```typescript");
      lines.push("{");
      if (s.properties) {
        for (const [prop, propSchema] of Object.entries(
          s.properties as Record<string, any>
        )) {
          const required = s.required?.includes(prop) ? "" : "?";
          const type = propSchema.enum
            ? propSchema.enum.join("|")
            : propSchema.type || "any";
          const desc = propSchema.description
            ? `  // ${propSchema.description}`
            : "";
          lines.push(`  ${prop}${required}: ${type};${desc}`);
        }
      }
      lines.push("}");
      lines.push("```");
      lines.push("");
    }
  }

  // Rate Limits
  if (config.rateLimits && config.rateLimits.length > 0) {
    lines.push("## Rate Limits");
    lines.push("");
    for (const limit of config.rateLimits) {
      lines.push(`- **${limit.category}**: ${limit.limit}`);
    }
    lines.push("");
  }

  // Authentication
  lines.push("## Authentication");
  lines.push("");
  lines.push("All authenticated endpoints require one of:");
  lines.push("- Cookie: Session cookie (set automatically after login)");
  lines.push("- Header: `Authorization: Bearer <token>`");
  lines.push("- Header: `X-API-Key: <api-key>`");

  if (config.authNotes && config.authNotes.length > 0) {
    lines.push("");
    for (const note of config.authNotes) {
      lines.push(`- ${note}`);
    }
  }

  lines.push("");

  // Additional sections
  if (config.additionalSections && config.additionalSections.length > 0) {
    for (const section of config.additionalSections) {
      lines.push(`## ${section.title}`);
      lines.push("");
      lines.push(section.content);
      lines.push("");
    }
  }

  // Documentation
  lines.push("## Documentation");
  lines.push("");
  lines.push("- OpenAPI: /docs/openapi.json");
  lines.push("- LLM summary: /docs/llms.txt");

  return lines.join("\n");
}
