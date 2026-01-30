import { Command } from 'commander';
import { catalog, assistants } from '../client.js';
import { success, error, output, detail, info, warn } from '../output.js';
import { readFile, writeFile, watch } from 'fs/promises';
import { existsSync } from 'fs';
import { resolve, basename, dirname, join } from 'path';
import { parse as parseYAML, stringify as stringifyYAML } from 'yaml';
import { randomUUID } from 'crypto';

// =============================================================================
// SYMBIA SCRIPT TYPES
// =============================================================================

/** Symbia Script v1.0 schema */
interface SymbiaScript {
  graph_id: string;
  name: string;
  version: string;
  symbia_version: '1.0';
  description?: string;
  org_id?: string;
  tags?: string[];

  components: Record<string, ComponentInstance>;
  bindings: Record<string, Record<string, Binding>>;

  vars?: Record<string, unknown>;
  imports?: GraphImport[];
  inputs?: GraphPort[];
  outputs?: GraphPort[];

  metadata?: Record<string, unknown>;
}

interface ComponentInstance {
  uuid: string;
  type: string; // component@version
  config?: Record<string, unknown>;
  location?: string;
  description?: string;
  position?: { x: number; y: number };
}

interface Binding {
  input: InputSpec;
  fallback?: FallbackSpec;
}

type InputSpec =
  | { value: unknown; signature?: string }
  | { component: string; port: string }
  | { graph: string; port: string }
  | { network: string; component: string; port: string; protocol?: string }
  | { var: string }
  | { default: true };

interface FallbackSpec {
  value: unknown;
  signature?: string;
  signed_by?: {
    key_id: string;
    algorithm: string;
    timestamp: string;
  };
}

interface GraphImport {
  graph: string;
  uuid: string;
  expose: string[];
}

interface GraphPort {
  id: string;
  type: string;
  description?: string;
  default?: unknown;
  required?: boolean;
}

// =============================================================================
// CATALOG GRAPH PAYLOAD (output format)
// =============================================================================

interface CatalogGraphPayload {
  graphId: string;
  version: string;
  components: CatalogComponent[];
  edges: CatalogEdge[];
  constants: CatalogConstant[];
  metadata: Record<string, unknown>;
}

interface CatalogComponent {
  id: string;
  type: string;
  name?: string;
  config?: Record<string, unknown>;
  position?: { x: number; y: number };
  location?: string;
}

interface CatalogEdge {
  id: string;
  from: { component: string; port: string } | { network?: string; component: string; port: string };
  to: { component: string; port: string };
  fallback?: FallbackSpec;
}

interface CatalogConstant {
  id: string;
  target: { component: string; port: string };
  value: unknown;
  signature?: string;
}

// =============================================================================
// VALIDATION
// =============================================================================

interface ValidationError {
  type: string;
  message: string;
  location?: string;
}

interface ValidationWarning {
  type: string;
  message: string;
}

interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

function parseComponentRef(ref: string): { componentKey: string; version?: string } {
  const [componentKey, version] = ref.split('@');
  return { componentKey, version };
}

async function validateScript(script: SymbiaScript, strictMode: boolean): Promise<ValidationResult> {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // Schema validation
  if (!script.graph_id) {
    errors.push({ type: 'MISSING_FIELD', message: 'graph_id is required' });
  }
  if (!script.name) {
    errors.push({ type: 'MISSING_FIELD', message: 'name is required' });
  }
  if (!script.version) {
    errors.push({ type: 'MISSING_FIELD', message: 'version is required' });
  }
  if (script.symbia_version !== '1.0') {
    errors.push({ type: 'UNSUPPORTED_VERSION', message: `Unsupported symbia_version: ${script.symbia_version}` });
  }
  if (!script.components || Object.keys(script.components).length === 0) {
    errors.push({ type: 'MISSING_FIELD', message: 'components is required and must not be empty' });
  }

  // Component validation
  const componentUUIDs = new Map<string, string>();
  for (const [instanceId, instance] of Object.entries(script.components || {})) {
    if (!instance.uuid) {
      errors.push({
        type: 'MISSING_UUID',
        message: `Component ${instanceId} is missing uuid`,
        location: `components.${instanceId}`
      });
    } else {
      componentUUIDs.set(instance.uuid, instanceId);
    }

    if (!instance.type) {
      errors.push({
        type: 'MISSING_TYPE',
        message: `Component ${instanceId} is missing type`,
        location: `components.${instanceId}`
      });
    }

    // Validate component exists in catalog (optional, non-blocking in non-strict mode)
    if (instance.type) {
      const { componentKey, version } = parseComponentRef(instance.type);
      try {
        const res = await catalog.get(`/api/resources/by-key/${componentKey}`);
        if (!res.ok) {
          if (strictMode) {
            errors.push({
              type: 'COMPONENT_NOT_FOUND',
              message: `Component ${instance.type} not found in catalog`,
              location: `components.${instanceId}`
            });
          } else {
            warnings.push({
              type: 'COMPONENT_NOT_FOUND',
              message: `Component ${instance.type} not found in catalog (will resolve at runtime)`
            });
          }
        }
      } catch {
        warnings.push({
          type: 'CATALOG_UNREACHABLE',
          message: `Could not reach catalog to validate ${instance.type}`
        });
      }
    }
  }

  // Binding validation
  for (const [targetUUID, portBindings] of Object.entries(script.bindings || {})) {
    if (!componentUUIDs.has(targetUUID)) {
      errors.push({
        type: 'BINDING_TARGET_NOT_FOUND',
        message: `Binding target ${targetUUID} does not match any component UUID`,
        location: `bindings.${targetUUID}`
      });
      continue;
    }

    for (const [portId, binding] of Object.entries(portBindings)) {
      // Validate input reference
      const input = binding.input;
      if ('component' in input && input.component) {
        if (!componentUUIDs.has(input.component) && input.component !== 'self') {
          errors.push({
            type: 'BINDING_SOURCE_NOT_FOUND',
            message: `Binding source component ${input.component} not found`,
            location: `bindings.${targetUUID}.${portId}`
          });
        }
      }

      // Validate fallback signature in strict mode
      if (strictMode && binding.fallback && !binding.fallback.signature) {
        errors.push({
          type: 'SIGNATURE_MISSING',
          message: `Fallback for ${targetUUID}.${portId} must be signed in strict mode`,
          location: `bindings.${targetUUID}.${portId}`
        });
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

// =============================================================================
// COMPILER
// =============================================================================

function transformToCatalogPayload(script: SymbiaScript): CatalogGraphPayload {
  const components: CatalogComponent[] = [];
  const edges: CatalogEdge[] = [];
  const constants: CatalogConstant[] = [];
  let edgeCounter = 0;
  let constantCounter = 0;

  // Build UUID to instance name map
  const uuidToName = new Map<string, string>();
  for (const [instanceId, instance] of Object.entries(script.components)) {
    uuidToName.set(instance.uuid, instanceId);
  }

  // Transform components
  for (const [instanceId, instance] of Object.entries(script.components)) {
    const { componentKey } = parseComponentRef(instance.type);

    components.push({
      id: instance.uuid,
      type: componentKey,
      name: instanceId,
      config: instance.config,
      position: instance.position,
      location: instance.location
    });
  }

  // Transform bindings
  for (const [targetUUID, portBindings] of Object.entries(script.bindings)) {
    for (const [portId, binding] of Object.entries(portBindings)) {
      const input = binding.input;

      if ('value' in input) {
        // Literal value → constant
        constants.push({
          id: `const_${constantCounter++}`,
          target: { component: targetUUID, port: portId },
          value: input.value,
          signature: input.signature
        });

      } else if ('component' in input && !('network' in input)) {
        // Component reference → edge
        edges.push({
          id: `edge_${edgeCounter++}`,
          from: {
            component: input.component,
            port: input.port
          },
          to: {
            component: targetUUID,
            port: portId
          },
          fallback: binding.fallback
        });

      } else if ('network' in input) {
        // Network reference → cross-network edge
        edges.push({
          id: `edge_${edgeCounter++}`,
          from: {
            network: input.network,
            component: input.component,
            port: input.port
          },
          to: {
            component: targetUUID,
            port: portId
          },
          fallback: binding.fallback
        });

      } else if ('var' in input) {
        // Variable reference → resolve and create constant
        const varValue = script.vars?.[input.var];
        if (varValue !== undefined) {
          constants.push({
            id: `const_${constantCounter++}`,
            target: { component: targetUUID, port: portId },
            value: varValue
          });
        }
      }
    }
  }

  return {
    graphId: script.graph_id,
    version: script.version,
    components,
    edges,
    constants,
    metadata: {
      symbia_version: script.symbia_version,
      name: script.name,
      description: script.description,
      tags: script.tags,
      ...script.metadata
    }
  };
}

// =============================================================================
// DECOMPILER (Catalog JSON → Symbia Script)
// =============================================================================

function decompileToScript(graphId: string, payload: CatalogGraphPayload): SymbiaScript {
  const components: Record<string, ComponentInstance> = {};
  const bindings: Record<string, Record<string, Binding>> = {};

  // Transform components
  for (const comp of payload.components) {
    const instanceName = comp.name || comp.id;
    components[instanceName] = {
      uuid: comp.id,
      type: comp.type,
      config: comp.config,
      position: comp.position,
      location: comp.location
    };
  }

  // Transform edges to bindings
  for (const edge of payload.edges) {
    const targetUUID = edge.to.component;
    const targetPort = edge.to.port;

    if (!bindings[targetUUID]) {
      bindings[targetUUID] = {};
    }

    if ('network' in edge.from && edge.from.network) {
      bindings[targetUUID][targetPort] = {
        input: {
          network: edge.from.network,
          component: edge.from.component,
          port: edge.from.port
        },
        fallback: edge.fallback
      };
    } else {
      bindings[targetUUID][targetPort] = {
        input: {
          component: edge.from.component,
          port: edge.from.port
        },
        fallback: edge.fallback
      };
    }
  }

  // Transform constants to bindings
  for (const constant of payload.constants) {
    const targetUUID = constant.target.component;
    const targetPort = constant.target.port;

    if (!bindings[targetUUID]) {
      bindings[targetUUID] = {};
    }

    bindings[targetUUID][targetPort] = {
      input: {
        value: constant.value,
        signature: constant.signature
      }
    };
  }

  return {
    graph_id: payload.graphId,
    name: (payload.metadata?.name as string) || payload.graphId,
    version: payload.version,
    symbia_version: '1.0',
    description: payload.metadata?.description as string,
    tags: payload.metadata?.tags as string[],
    components,
    bindings,
    metadata: payload.metadata
  };
}

// =============================================================================
// UUID MANAGEMENT
// =============================================================================

interface UUIDMapping {
  graph_id: string;
  components: Record<string, string>; // instance name → UUID
}

async function loadOrCreateUUIDs(scriptPath: string, script: SymbiaScript): Promise<SymbiaScript> {
  const dir = dirname(scriptPath);
  const mappingDir = join(dir, '.symbia');
  const mappingFile = join(mappingDir, 'uuid-mapping.yaml');

  let mapping: UUIDMapping | null = null;

  // Try to load existing mapping
  if (existsSync(mappingFile)) {
    try {
      const content = await readFile(mappingFile, 'utf-8');
      mapping = parseYAML(content) as UUIDMapping;
    } catch {
      // Ignore, will create new mapping
    }
  }

  // Assign UUIDs to components that don't have them
  let modified = false;
  for (const [instanceId, instance] of Object.entries(script.components)) {
    if (!instance.uuid) {
      // Check mapping first
      if (mapping?.components[instanceId]) {
        instance.uuid = mapping.components[instanceId];
      } else {
        instance.uuid = randomUUID();
        modified = true;
      }
    }
  }

  // Save updated mapping if needed
  if (modified) {
    const newMapping: UUIDMapping = {
      graph_id: script.graph_id,
      components: {}
    };
    for (const [instanceId, instance] of Object.entries(script.components)) {
      newMapping.components[instanceId] = instance.uuid;
    }

    // Create .symbia directory if needed
    const { mkdir } = await import('fs/promises');
    try {
      await mkdir(mappingDir, { recursive: true });
      await writeFile(mappingFile, stringifyYAML(newMapping));
    } catch {
      // Ignore write errors
    }
  }

  return script;
}

// =============================================================================
// CLI COMMANDS
// =============================================================================

export function registerScriptCommands(program: Command): void {
  const script = program
    .command('script')
    .alias('graph')
    .description('Symbia Script - compile and manage .symbia graph definitions');

  // COMPILE - .symbia → catalog JSON
  script
    .command('compile <file>')
    .description('Compile .symbia file to catalog graph format')
    .option('-o, --output <file>', 'Output file path (default: stdout)')
    .option('--validate', 'Validate against catalog', true)
    .option('--strict', 'Strict mode (fail on warnings)', false)
    .option('--no-uuid-persist', 'Do not persist generated UUIDs')
    .action(async (file, opts) => {
      const filePath = resolve(file);

      if (!existsSync(filePath)) {
        error(`File not found: ${filePath}`);
        process.exit(1);
      }

      try {
        const content = await readFile(filePath, 'utf-8');
        let script = parseYAML(content) as SymbiaScript;

        // Handle UUID generation
        if (opts.uuidPersist !== false) {
          script = await loadOrCreateUUIDs(filePath, script);
        } else {
          // Generate ephemeral UUIDs
          for (const instance of Object.values(script.components)) {
            if (!instance.uuid) {
              instance.uuid = randomUUID();
            }
          }
        }

        // Validate if requested
        if (opts.validate) {
          const validation = await validateScript(script, opts.strict);

          if (!validation.valid) {
            error('Validation failed:');
            for (const err of validation.errors) {
              console.error(`  ✗ [${err.type}] ${err.message}${err.location ? ` at ${err.location}` : ''}`);
            }
            process.exit(1);
          }

          if (validation.warnings.length > 0) {
            warn('Warnings:');
            for (const w of validation.warnings) {
              console.warn(`  ⚠ [${w.type}] ${w.message}`);
            }
          }
        }

        // Compile
        const payload = transformToCatalogPayload(script);

        const output = JSON.stringify({
          key: script.graph_id,
          name: script.name,
          description: script.description,
          type: 'graph',
          tags: script.tags,
          payload
        }, null, 2);

        if (opts.output) {
          await writeFile(opts.output, output);
          success(`Compiled to ${opts.output}`);
        } else {
          console.log(output);
        }

      } catch (e) {
        error(`Failed to compile: ${e instanceof Error ? e.message : e}`);
        process.exit(1);
      }
    });

  // VALIDATE - Check syntax & catalog references
  script
    .command('validate <file>')
    .description('Validate .symbia file without compiling')
    .option('--strict', 'Fail on warnings', false)
    .action(async (file, opts) => {
      const filePath = resolve(file);

      if (!existsSync(filePath)) {
        error(`File not found: ${filePath}`);
        process.exit(1);
      }

      try {
        const content = await readFile(filePath, 'utf-8');
        const script = parseYAML(content) as SymbiaScript;

        const validation = await validateScript(script, opts.strict);

        if (validation.valid) {
          success('Validation passed');
          detail('Components', Object.keys(script.components).length);
          detail('Bindings', Object.keys(script.bindings || {}).length);

          if (validation.warnings.length > 0) {
            console.log();
            warn('Warnings:');
            for (const w of validation.warnings) {
              console.warn(`  ⚠ [${w.type}] ${w.message}`);
            }
          }
        } else {
          error('Validation failed:');
          for (const err of validation.errors) {
            console.error(`  ✗ [${err.type}] ${err.message}${err.location ? ` at ${err.location}` : ''}`);
          }
          process.exit(1);
        }

      } catch (e) {
        error(`Failed to validate: ${e instanceof Error ? e.message : e}`);
        process.exit(1);
      }
    });

  // PUBLISH - Compile + upload to catalog/assistants
  script
    .command('publish <file>')
    .description('Compile and publish graph to assistants service')
    .option('--org <orgId>', 'Organization ID')
    .option('--dry-run', 'Preview without publishing', false)
    .option('--strict', 'Strict validation mode', true)
    .action(async (file, opts) => {
      const filePath = resolve(file);

      if (!existsSync(filePath)) {
        error(`File not found: ${filePath}`);
        process.exit(1);
      }

      try {
        const content = await readFile(filePath, 'utf-8');
        let script = parseYAML(content) as SymbiaScript;

        // Handle UUID generation
        script = await loadOrCreateUUIDs(filePath, script);

        // Validate
        const validation = await validateScript(script, opts.strict);

        if (!validation.valid) {
          error('Validation failed, cannot publish:');
          for (const err of validation.errors) {
            console.error(`  ✗ [${err.type}] ${err.message}`);
          }
          process.exit(1);
        }

        // Compile
        const payload = transformToCatalogPayload(script);

        if (opts.dryRun) {
          info('DRY RUN - would publish:');
          console.log(JSON.stringify({
            name: script.name,
            description: script.description,
            graphJson: payload
          }, null, 2));
          return;
        }

        // Publish to assistants service
        const res = await assistants.post<{ id: string; name: string; version: number }>('/api/graphs', {
          orgId: opts.org || script.org_id,
          name: script.name,
          description: script.description,
          graphJson: payload
        });

        if (!res.ok) {
          error(res.error || 'Failed to publish graph');
          process.exit(1);
        }

        success(`Published: ${script.name}`);
        detail('Graph ID', res.data?.id);
        detail('Version', res.data?.version);

      } catch (e) {
        error(`Failed to publish: ${e instanceof Error ? e.message : e}`);
        process.exit(1);
      }
    });

  // DECOMPILE - Catalog graph → .symbia
  script
    .command('decompile <graphId>')
    .description('Convert existing graph to .symbia format')
    .option('-o, --output <file>', 'Output file path')
    .action(async (graphId, opts) => {
      try {
        // Fetch graph from assistants service
        const res = await assistants.get<{
          id: string;
          name: string;
          description?: string;
          graphJson: CatalogGraphPayload;
        }>(`/api/graphs/${graphId}`);

        if (!res.ok) {
          error(res.error || 'Graph not found');
          process.exit(1);
        }

        const graph = res.data!;
        const script = decompileToScript(graph.id, graph.graphJson);

        const yaml = stringifyYAML(script, {
          lineWidth: 120,
          defaultStringType: 'QUOTE_DOUBLE',
          defaultKeyType: 'PLAIN'
        });

        if (opts.output) {
          await writeFile(opts.output, yaml);
          success(`Decompiled to ${opts.output}`);
        } else {
          console.log(yaml);
        }

      } catch (e) {
        error(`Failed to decompile: ${e instanceof Error ? e.message : e}`);
        process.exit(1);
      }
    });

  // NEW - Create from template
  script
    .command('new <name>')
    .description('Create a new .symbia file from template')
    .option('-t, --template <type>', 'Template: blank, math, audio, iot, analytics', 'blank')
    .option('-o, --output <file>', 'Output file path')
    .action(async (name, opts) => {
      const templates: Record<string, SymbiaScript> = {
        blank: {
          graph_id: name,
          name: name,
          version: '1.0.0',
          symbia_version: '1.0',
          description: 'A new Symbia Script graph',
          components: {
            example_component: {
              uuid: randomUUID(),
              type: 'example-component@1.0',
              config: {}
            }
          },
          bindings: {}
        },

        math: {
          graph_id: name,
          name: name,
          version: '1.0.0',
          symbia_version: '1.0',
          description: 'Math operations graph',
          components: {
            add: {
              uuid: randomUUID(),
              type: 'math-add@2.0',
              config: { precision: 2 }
            },
            multiply: {
              uuid: randomUUID(),
              type: 'math-multiply@2.0',
              config: {}
            }
          },
          bindings: {}
        },

        audio: {
          graph_id: name,
          name: name,
          version: '1.0.0',
          symbia_version: '1.0',
          description: 'Audio processing chain',
          components: {
            input: {
              uuid: randomUUID(),
              type: 'audio-input-device@3.1',
              config: { sample_rate: 44100 }
            },
            filter: {
              uuid: randomUUID(),
              type: 'audio-filter-lowpass@2.0',
              config: { order: 4, cutoff_hz: 8000 }
            },
            output: {
              uuid: randomUUID(),
              type: 'audio-output-device@3.1',
              config: { device: 'default' }
            }
          },
          bindings: {}
        },

        iot: {
          graph_id: name,
          name: name,
          version: '1.0.0',
          symbia_version: '1.0',
          description: 'IoT sensor monitoring',
          components: {
            sensor: {
              uuid: randomUUID(),
              type: 'modbus-tcp-reader@2.0',
              config: {
                host: '192.168.1.100',
                port: 502,
                register: 40001
              }
            },
            processor: {
              uuid: randomUUID(),
              type: 'signal-processor@1.0',
              config: {}
            },
            alerter: {
              uuid: randomUUID(),
              type: 'slack-notify@2.0',
              config: { channel: '#alerts' }
            }
          },
          bindings: {}
        },

        analytics: {
          graph_id: name,
          name: name,
          version: '1.0.0',
          symbia_version: '1.0',
          description: 'Real-time analytics pipeline',
          components: {
            stream: {
              uuid: randomUUID(),
              type: 'kafka-consumer@3.0',
              config: { topic: 'events', consumer_group: 'analytics' }
            },
            transform: {
              uuid: randomUUID(),
              type: 'json-transform@1.0',
              config: {}
            },
            model: {
              uuid: randomUUID(),
              type: 'ml-inference@2.0',
              config: { model_uri: 'catalog://my-model' }
            },
            sink: {
              uuid: randomUUID(),
              type: 'influxdb-writer@3.0',
              config: { database: 'analytics' }
            }
          },
          bindings: {}
        }
      };

      const template = templates[opts.template];
      if (!template) {
        error(`Unknown template: ${opts.template}`);
        info(`Available templates: ${Object.keys(templates).join(', ')}`);
        process.exit(1);
      }

      const yaml = stringifyYAML(template, {
        lineWidth: 120,
        defaultStringType: 'QUOTE_DOUBLE',
        defaultKeyType: 'PLAIN'
      });

      const outputPath = opts.output || `${name}.symbia`;

      if (existsSync(outputPath)) {
        error(`File already exists: ${outputPath}`);
        process.exit(1);
      }

      await writeFile(outputPath, yaml);
      success(`Created: ${outputPath}`);
      info(`Edit the file and run: symbia script validate ${outputPath}`);
    });

  // WATCH - Watch file for changes and validate
  script
    .command('watch <file>')
    .description('Watch .symbia file and validate on changes')
    .option('--strict', 'Strict validation mode', false)
    .action(async (file, opts) => {
      const filePath = resolve(file);

      if (!existsSync(filePath)) {
        error(`File not found: ${filePath}`);
        process.exit(1);
      }

      info(`Watching ${filePath} for changes...`);
      info('Press Ctrl+C to stop');

      const validateFile = async () => {
        try {
          const content = await readFile(filePath, 'utf-8');
          const script = parseYAML(content) as SymbiaScript;
          const validation = await validateScript(script, opts.strict);

          console.log('\n' + '─'.repeat(50));
          console.log(new Date().toLocaleTimeString());

          if (validation.valid) {
            success('✓ Valid');
            detail('Components', Object.keys(script.components).length);
          } else {
            error('✗ Invalid');
            for (const err of validation.errors) {
              console.error(`  [${err.type}] ${err.message}`);
            }
          }

          if (validation.warnings.length > 0) {
            for (const w of validation.warnings) {
              console.warn(`  ⚠ ${w.message}`);
            }
          }
        } catch (e) {
          error(`Parse error: ${e instanceof Error ? e.message : e}`);
        }
      };

      // Initial validation
      await validateFile();

      // Watch for changes
      const watcher = watch(filePath);
      for await (const event of watcher) {
        if (event.eventType === 'change') {
          await validateFile();
        }
      }
    });

  // SIGN - Sign a fallback value
  script
    .command('sign')
    .description('Sign a fallback value')
    .requiredOption('--value <json>', 'Value to sign (JSON)')
    .option('--key <keyId>', 'Signing key ID', 'local-dev-key')
    .action(async (opts) => {
      try {
        const value = JSON.parse(opts.value);
        const { createHash } = await import('crypto');

        // Create deterministic hash
        const canonical = JSON.stringify(value, Object.keys(value).sort(), 0);
        const hash = createHash('sha256').update(canonical).digest('hex');

        info('Fallback Signature (development mode):');
        detail('Value', opts.value);
        detail('Signature', `sha256:${hash}`);
        detail('Key ID', opts.key);

        console.log('\nAdd to your .symbia file:');
        console.log(stringifyYAML({
          fallback: {
            value,
            signature: `sha256:${hash}`,
            signed_by: {
              key_id: opts.key,
              algorithm: 'sha256',
              timestamp: new Date().toISOString()
            }
          }
        }));

        warn('Note: Production signatures require proper Ed25519 key management');

      } catch (e) {
        error(`Failed to sign: ${e instanceof Error ? e.message : e}`);
        process.exit(1);
      }
    });

  // REF - Show Symbia Script reference syntax
  script
    .command('ref')
    .description('Show Symbia Script reference syntax documentation')
    .action(() => {
      console.log(`
╔═══════════════════════════════════════════════════════════════════════════════╗
║                   SYMBIA SCRIPT - REFERENCE SYNTAX                            ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║                                                                               ║
║  Symbia Script provides a unified syntax for referencing data across the      ║
║  platform. Use @namespace.path to access context, users, services, etc.       ║
║                                                                               ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║  SYNTAX                                                                       ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║                                                                               ║
║  Bare reference:      @namespace.path                                         ║
║  In templates:        "Hello {{@user.displayName}}"                           ║
║  With query params:   @service.logging./logs?limit=10                         ║
║                                                                               ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║  NAMESPACES                                                                   ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║                                                                               ║
║  @context       Execution context data                                        ║
║                 @context.conversationId, @context.customData                  ║
║                                                                               ║
║  @message       Current message                                               ║
║                 @message.content, @message.id, @message.role                  ║
║                                                                               ║
║  @user          Current user                                                  ║
║                 @user.id, @user.email, @user.displayName                      ║
║                                                                               ║
║  @org           Current organization                                          ║
║                 @org.id, @org.name, @org.metadata                             ║
║                                                                               ║
║  @service       Internal service calls (async)                                ║
║                 @service.logging./logs/query                                  ║
║                 @service.catalog./resources?limit=20                          ║
║                                                                               ║
║  @integration   External API integrations (async)                             ║
║                 @integration.openai.chat.completions.create                   ║
║                 @integration.slack.chat.postMessage                           ║
║                                                                               ║
║  @var           Script/routine variables                                      ║
║                 @var.myVariable, @var.config.apiKey                           ║
║                                                                               ║
║  @env           Environment variables                                         ║
║                 @env.NODE_ENV, @env.API_KEY                                   ║
║                                                                               ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║  TEMPLATE INTERPOLATION                                                       ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║                                                                               ║
║  Use {{@ref}} in strings to interpolate values:                               ║
║                                                                               ║
║  "Hello {{@user.displayName}}, your order {{@context.orderId}} is ready"      ║
║                                                                               ║
║  Legacy syntax (deprecated):                                                  ║
║  "Hello {{user.displayName}}" → use "Hello {{@user.displayName}}"             ║
║                                                                               ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║  EXAMPLES IN .SYMBIA FILES                                                    ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║                                                                               ║
║  bindings:                                                                    ║
║    550e8400...:                                                               ║
║      message:                                                                 ║
║        input:                                                                 ║
║          value: "Hello {{@user.displayName}}"                                 ║
║      api_key:                                                                 ║
║        input:                                                                 ║
║          var: api_key                                                         ║
║                                                                               ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║  EXAMPLES IN ACTIONS                                                          ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║                                                                               ║
║  message.send:                                                                ║
║    contentTemplate: "Hi {{@user.displayName}}, {{@message.content}}"          ║
║                                                                               ║
║  webhook.call:                                                                ║
║    url: "https://api.example.com/users/{{@user.id}}"                          ║
║    bodyTemplate: |                                                            ║
║      {"message": "{{@message.content}}", "org": "{{@org.id}}"}                ║
║                                                                               ║
║  integration.invoke:                                                          ║
║    operation: integrations.openai.chat.completions.create                     ║
║    bodyTemplate: |                                                            ║
║      {"messages": [{"role": "user", "content": "{{@message.content}}"}]}      ║
║                                                                               ║
╚═══════════════════════════════════════════════════════════════════════════════╝
`);
    });

  // INFO - Show Symbia Script schema info
  script
    .command('info')
    .description('Show Symbia Script schema information')
    .action(() => {
      console.log(`
╔═══════════════════════════════════════════════════════════════════════════════╗
║                          SYMBIA SCRIPT v1.0                                   ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║                                                                               ║
║  File Extension:     .symbia                                                  ║
║  Schema Version:     symbia_version: "1.0"                                    ║
║  Format:             YAML                                                     ║
║                                                                               ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║  REQUIRED FIELDS                                                              ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║                                                                               ║
║  graph_id          Unique identifier (DNS-style recommended)                  ║
║  name              Human-readable name                                        ║
║  version           Semantic version (1.0.0)                                   ║
║  symbia_version    Must be "1.0"                                              ║
║  components        Map of component instances                                 ║
║  bindings          Map of UUID → port → binding                               ║
║                                                                               ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║  COMPONENT INSTANCE                                                           ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║                                                                               ║
║  uuid              Immutable UUID (v4)                                        ║
║  type              Catalog component key@version                              ║
║  config            Component configuration (optional)                         ║
║  location          Network location (optional)                                ║
║  position          Visual editor hint {x, y} (optional)                       ║
║                                                                               ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║  BINDING TYPES                                                                ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║                                                                               ║
║  Literal:          {value: 42, signature: "sha256:..."}                       ║
║  Component:        {component: "<uuid>", port: "output"}                      ║
║  Network:          {network: "host:port", component: "<uuid>", port: "out"}   ║
║  Variable:         {var: "my_variable"}                                       ║
║                                                                               ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║  COMMANDS                                                                     ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║                                                                               ║
║  symbia script new <name>           Create from template                      ║
║  symbia script validate <file>      Validate syntax and references            ║
║  symbia script compile <file>       Compile to catalog JSON                   ║
║  symbia script publish <file>       Publish to assistants service             ║
║  symbia script decompile <id>       Convert existing graph to .symbia         ║
║  symbia script watch <file>         Watch and validate on changes             ║
║  symbia script sign --value <json>  Sign a fallback value                     ║
║                                                                               ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║  EXAMPLE                                                                      ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║                                                                               ║
║  graph_id: my-workflow                                                        ║
║  name: My Workflow                                                            ║
║  version: 1.0.0                                                               ║
║  symbia_version: "1.0"                                                        ║
║                                                                               ║
║  components:                                                                  ║
║    adder:                                                                     ║
║      uuid: 550e8400-e29b-41d4-a716-446655440000                               ║
║      type: math-add@2.0                                                       ║
║      config:                                                                  ║
║        precision: 2                                                           ║
║                                                                               ║
║  bindings:                                                                    ║
║    550e8400-e29b-41d4-a716-446655440000:                                      ║
║      a:                                                                       ║
║        input: {value: 10}                                                     ║
║      b:                                                                       ║
║        input: {value: 20}                                                     ║
║                                                                               ║
╚═══════════════════════════════════════════════════════════════════════════════╝
`);
    });
}
