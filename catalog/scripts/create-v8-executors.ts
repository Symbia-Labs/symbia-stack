#!/usr/bin/env npx tsx
/**
 * Create V8 isolate executors for pure components that don't have executors.
 */

const CATALOG_URL = process.env.LOCAL_CATALOG_URL || 'http://localhost:5052';

interface Port {
  id: string;
  label: string;
  type: string;
}

interface ExecutorMetadata {
  componentKey: string;
  componentVersion: string;
  runtimeType: string;
  runtimeVersion: string;
  environment: string[];
  language: string;
  entrypoint: string;
  determinism: string;
  capabilities: string[];
  ports: {
    inputs: Port[];
    outputs: Port[];
    configs: Port[];
  };
}

interface Executor {
  key: string;
  name: string;
  description: string;
  type: 'executor';
  status: 'draft';
  isBootstrap: boolean;
  tags: string[];
  accessPolicy: {
    visibility: string;
    actions: Record<string, { anyOf: string[] }>;
  };
  metadata: ExecutorMetadata;
}

// Components to create V8 executors for
const V8_CANDIDATES = [
  {
    componentKey: 'parse/CSVParse',
    name: 'CSV Parse',
    description: 'Parse CSV text into rows',
    category: 'parse',
    inputs: [{ id: 'text', label: 'text', type: 'string' }],
    outputs: [
      { id: 'rows', label: 'rows', type: 'array' },
      { id: 'error', label: 'error', type: 'string' },
    ],
    configs: [
      { id: 'hasHeader', label: 'hasHeader', type: 'boolean' },
      { id: 'delimiter', label: 'delimiter', type: 'string' },
    ],
  },
  {
    componentKey: 'parse/CSVStringify',
    name: 'CSV Stringify',
    description: 'Convert rows into CSV text',
    category: 'parse',
    inputs: [{ id: 'rows', label: 'rows', type: 'array' }],
    outputs: [{ id: 'text', label: 'text', type: 'string' }],
    configs: [
      { id: 'includeHeader', label: 'includeHeader', type: 'boolean' },
      { id: 'delimiter', label: 'delimiter', type: 'string' },
    ],
  },
  {
    componentKey: 'parse/YAMLParse',
    name: 'YAML Parse',
    description: 'Parse YAML text into JSON',
    category: 'parse',
    inputs: [{ id: 'text', label: 'text', type: 'string' }],
    outputs: [
      { id: 'json', label: 'json', type: 'object' },
      { id: 'error', label: 'error', type: 'string' },
    ],
    configs: [{ id: 'schema', label: 'schema', type: 'string' }],
  },
  {
    componentKey: 'validate/JSONSchema',
    name: 'JSON Schema Validate',
    description: 'Validate JSON against a schema',
    category: 'validate',
    inputs: [{ id: 'input', label: 'input', type: 'object' }],
    outputs: [
      { id: 'valid', label: 'valid', type: 'boolean' },
      { id: 'errors', label: 'errors', type: 'array' },
    ],
    configs: [{ id: 'schema', label: 'schema', type: 'object' }],
  },
  {
    componentKey: 'validate/RequiredFields',
    name: 'Required Fields Validate',
    description: 'Ensure required fields are present',
    category: 'validate',
    inputs: [{ id: 'input', label: 'input', type: 'object' }],
    outputs: [
      { id: 'valid', label: 'valid', type: 'boolean' },
      { id: 'missing', label: 'missing', type: 'array' },
    ],
    configs: [{ id: 'fields', label: 'fields', type: 'array' }],
  },
  {
    componentKey: 'http/BuildUrl',
    name: 'Build URL',
    description: 'Construct a URL from base, path, and query',
    category: 'http',
    inputs: [
      { id: 'base', label: 'base', type: 'string' },
      { id: 'path', label: 'path', type: 'string' },
      { id: 'query', label: 'query', type: 'object' },
    ],
    outputs: [{ id: 'url', label: 'url', type: 'string' }],
    configs: [{ id: 'encode', label: 'encode', type: 'boolean' }],
  },
  {
    componentKey: 'secrets/Redact',
    name: 'Secrets Redact',
    description: 'Redact sensitive fields from objects',
    category: 'secrets',
    inputs: [{ id: 'input', label: 'input', type: 'object' }],
    outputs: [{ id: 'output', label: 'output', type: 'object' }],
    configs: [
      { id: 'policyRef', label: 'policyRef', type: 'string' },
      { id: 'mask', label: 'mask', type: 'string' },
    ],
  },
];

function createExecutor(candidate: (typeof V8_CANDIDATES)[0]): Executor {
  const keyParts = candidate.componentKey.split('/');
  const componentName = keyParts[keyParts.length - 1];

  return {
    key: `executor/v8-isolate/${candidate.componentKey}`,
    name: `${candidate.name} (V8 Isolate)`,
    description: `V8 isolate executor for ${candidate.name}: ${candidate.description}`,
    type: 'executor',
    status: 'draft',
    isBootstrap: true,
    tags: [
      `category:${candidate.category}`,
      'pack:Core',
      'group:build',
      'runtime:v8-isolate',
      'tier:1',
      'determinism:pure',
    ],
    accessPolicy: {
      visibility: 'public',
      actions: {
        read: { anyOf: ['public'] },
        write: { anyOf: ['cap:registry.write', 'role:admin'] },
        publish: { anyOf: ['cap:registry.publish', 'role:publisher', 'role:admin'] },
        sign: { anyOf: ['cap:registry.sign', 'role:admin'] },
        certify: { anyOf: ['cap:registry.certify', 'role:admin'] },
        delete: { anyOf: ['role:admin'] },
      },
    },
    metadata: {
      componentKey: candidate.componentKey,
      componentVersion: '1.0.0',
      runtimeType: 'v8-isolate',
      runtimeVersion: '1.0.0',
      environment: ['browser', 'edge', 'server'],
      language: 'javascript',
      entrypoint: `@symbia/runtime-v8/components/${candidate.componentKey}`,
      determinism: 'deterministic',
      capabilities: [],
      ports: {
        inputs: candidate.inputs,
        outputs: candidate.outputs,
        configs: candidate.configs,
      },
    },
  };
}

async function main() {
  console.log('Creating V8 isolate executors for pure components...\n');

  let created = 0;
  let failed = 0;

  for (const candidate of V8_CANDIDATES) {
    const executor = createExecutor(candidate);

    try {
      const response = await fetch(`${CATALOG_URL}/api/resources`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(executor),
      });

      if (response.ok) {
        created++;
        console.log(`✓ Created ${executor.key}`);
      } else {
        const error = await response.text();
        if (error.includes('already exists')) {
          console.log(`○ Skipped ${executor.key} (already exists)`);
        } else {
          failed++;
          console.log(`✗ Failed ${executor.key}: ${error}`);
        }
      }
    } catch (error) {
      failed++;
      console.log(`✗ Error creating ${executor.key}:`, error);
    }
  }

  console.log(`\nDone! Created ${created}, failed ${failed}`);

  // Verify
  const response = await fetch(`${CATALOG_URL}/api/resources`);
  const resources = (await response.json()) as { type: string }[];
  const executorCount = resources.filter((r) => r.type === 'executor').length;
  console.log(`Total executors now: ${executorCount}`);
}

main().catch(console.error);
