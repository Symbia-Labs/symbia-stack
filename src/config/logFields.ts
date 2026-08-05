/**
 * Log Field Registry
 *
 * Defines known fields for log entries, organized by category.
 * Used for field extraction, filtering, and display in the log search UI.
 */

export type FieldType = 'string' | 'number' | 'boolean' | 'timestamp' | 'enum' | 'object';

export type FieldCategory = 'common' | 'envelope' | 'trace' | 'payload';

export interface FieldDefinition {
  /** Field key/path (e.g., 'level', 'metadata.requestId') */
  key: string;
  /** Human-readable label */
  label: string;
  /** Field description */
  description: string;
  /** Data type */
  type: FieldType;
  /** Category for grouping */
  category: FieldCategory;
  /** Whether this field is filterable in the sidebar */
  filterable: boolean;
  /** Whether to show in results table by default */
  defaultVisible: boolean;
  /** For enum types, the possible values */
  enumValues?: string[];
  /** Path to extract from log entry (defaults to key) */
  path?: string;
}

/**
 * Common fields present in all log entries
 */
export const COMMON_FIELDS: FieldDefinition[] = [
  {
    key: 'level',
    label: 'Level',
    description: 'Log severity level',
    type: 'enum',
    category: 'common',
    filterable: true,
    defaultVisible: true,
    enumValues: ['debug', 'info', 'warn', 'error'],
  },
  {
    key: 'timestamp',
    label: 'Timestamp',
    description: 'When the log entry was created',
    type: 'timestamp',
    category: 'common',
    filterable: false,
    defaultVisible: true,
  },
  {
    key: 'message',
    label: 'Message',
    description: 'Log message content',
    type: 'string',
    category: 'common',
    filterable: false,
    defaultVisible: true,
  },
  {
    key: 'source',
    label: 'Source',
    description: 'Service or component that generated the log',
    type: 'string',
    category: 'common',
    filterable: true,
    defaultVisible: true,
  },
];

/**
 * Envelope fields from the log entry wrapper
 */
export const ENVELOPE_FIELDS: FieldDefinition[] = [
  {
    key: 'id',
    label: 'Entry ID',
    description: 'Unique identifier for the log entry',
    type: 'string',
    category: 'envelope',
    filterable: false,
    defaultVisible: false,
  },
  {
    key: 'streamId',
    label: 'Stream ID',
    description: 'Log stream this entry belongs to',
    type: 'string',
    category: 'envelope',
    filterable: true,
    defaultVisible: false,
  },
];

/**
 * Distributed tracing fields
 */
export const TRACE_FIELDS: FieldDefinition[] = [
  {
    key: 'traceId',
    label: 'Trace ID',
    description: 'Distributed trace identifier',
    type: 'string',
    category: 'trace',
    filterable: true,
    defaultVisible: false,
  },
  {
    key: 'spanId',
    label: 'Span ID',
    description: 'Span identifier within the trace',
    type: 'string',
    category: 'trace',
    filterable: true,
    defaultVisible: false,
  },
];

/**
 * Known payload/metadata fields from Symbia events
 */
export const PAYLOAD_FIELDS: FieldDefinition[] = [
  // HTTP/Request fields (actual field names from symbia-http telemetry)
  {
    key: 'metadata.method',
    label: 'HTTP Method',
    description: 'HTTP request method (GET, POST, etc.)',
    type: 'enum',
    category: 'payload',
    filterable: true,
    defaultVisible: false,
    enumValues: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'],
    path: 'metadata.method',
  },
  {
    key: 'metadata.endpoint',
    label: 'Endpoint',
    description: 'HTTP endpoint path',
    type: 'string',
    category: 'payload',
    filterable: true,
    defaultVisible: false,
    path: 'metadata.endpoint',
  },
  {
    key: 'metadata.status',
    label: 'Status Code',
    description: 'HTTP response status code',
    type: 'number',
    category: 'payload',
    filterable: true,
    defaultVisible: false,
    path: 'metadata.status',
  },
  {
    key: 'metadata.duration',
    label: 'Duration (ms)',
    description: 'Request/operation duration in milliseconds',
    type: 'number',
    category: 'payload',
    filterable: false,
    defaultVisible: false,
    path: 'metadata.duration',
  },
  // Event fields
  {
    key: 'metadata.eventType',
    label: 'Event Type',
    description: 'Type of event (e.g., message.sent, task.completed)',
    type: 'string',
    category: 'payload',
    filterable: true,
    defaultVisible: false,
    path: 'metadata.eventType',
  },
  {
    key: 'metadata.action',
    label: 'Action',
    description: 'Action performed',
    type: 'string',
    category: 'payload',
    filterable: true,
    defaultVisible: false,
    path: 'metadata.action',
  },
  // Routing/Addressing fields (actual fields from telemetry service)
  {
    key: 'metadata.source',
    label: 'Event Source',
    description: 'Source node ID in event routing',
    type: 'string',
    category: 'payload',
    filterable: true,
    defaultVisible: false,
    path: 'metadata.source',
  },
  {
    key: 'metadata.target',
    label: 'Event Target',
    description: 'Target node ID in event routing',
    type: 'string',
    category: 'payload',
    filterable: true,
    defaultVisible: false,
    path: 'metadata.target',
  },
  {
    key: 'metadata.direction',
    label: 'Direction',
    description: 'HTTP request direction (inbound/outbound)',
    type: 'enum',
    category: 'payload',
    filterable: true,
    defaultVisible: false,
    enumValues: ['inbound', 'outbound'],
    path: 'metadata.direction',
  },
  {
    key: 'metadata.boundary',
    label: 'Boundary',
    description: 'Event boundary type (intra/inter)',
    type: 'enum',
    category: 'payload',
    filterable: true,
    defaultVisible: false,
    enumValues: ['intra', 'inter'],
    path: 'metadata.boundary',
  },
  // Node/Entity fields
  {
    key: 'metadata.nodeId',
    label: 'Node ID',
    description: 'Network node identifier',
    type: 'string',
    category: 'payload',
    filterable: true,
    defaultVisible: false,
    path: 'metadata.nodeId',
  },
  {
    key: 'metadata.nodeType',
    label: 'Node Type',
    description: 'Type of network node (service, agent, etc.)',
    type: 'string',
    category: 'payload',
    filterable: true,
    defaultVisible: false,
    path: 'metadata.nodeType',
  },
  {
    key: 'metadata.nodeName',
    label: 'Node Name',
    description: 'Human-readable node name',
    type: 'string',
    category: 'payload',
    filterable: true,
    defaultVisible: false,
    path: 'metadata.nodeName',
  },
  {
    key: 'metadata.entityId',
    label: 'Entity ID',
    description: 'Entity UUID for entity-based routing',
    type: 'string',
    category: 'payload',
    filterable: true,
    defaultVisible: false,
    path: 'metadata.entityId',
  },
  // Contract/Bridge fields
  {
    key: 'metadata.contractId',
    label: 'Contract ID',
    description: 'Network contract identifier',
    type: 'string',
    category: 'payload',
    filterable: true,
    defaultVisible: false,
    path: 'metadata.contractId',
  },
  {
    key: 'metadata.bridgeId',
    label: 'Bridge ID',
    description: 'Network bridge identifier',
    type: 'string',
    category: 'payload',
    filterable: true,
    defaultVisible: false,
    path: 'metadata.bridgeId',
  },
  // Event routing context
  {
    key: 'metadata.reason',
    label: 'Reason',
    description: 'Reason for event drop or routing decision',
    type: 'string',
    category: 'payload',
    filterable: true,
    defaultVisible: false,
    path: 'metadata.reason',
  },
  {
    key: 'metadata.runId',
    label: 'Run ID',
    description: 'Execution run identifier',
    type: 'string',
    category: 'payload',
    filterable: true,
    defaultVisible: false,
    path: 'metadata.runId',
  },
  // Actor/User fields
  {
    key: 'metadata.userId',
    label: 'User ID',
    description: 'User identifier',
    type: 'string',
    category: 'payload',
    filterable: true,
    defaultVisible: false,
    path: 'metadata.userId',
  },
  {
    key: 'metadata.actorId',
    label: 'Actor ID',
    description: 'Actor/assistant identifier',
    type: 'string',
    category: 'payload',
    filterable: true,
    defaultVisible: false,
    path: 'metadata.actorId',
  },
  {
    key: 'metadata.principalId',
    label: 'Principal ID',
    description: 'Principal/identity identifier',
    type: 'string',
    category: 'payload',
    filterable: true,
    defaultVisible: false,
    path: 'metadata.principalId',
  },
  // Resource fields
  {
    key: 'metadata.resourceType',
    label: 'Resource Type',
    description: 'Type of resource being accessed',
    type: 'string',
    category: 'payload',
    filterable: true,
    defaultVisible: false,
    path: 'metadata.resourceType',
  },
  {
    key: 'metadata.resourceId',
    label: 'Resource ID',
    description: 'Identifier of the resource',
    type: 'string',
    category: 'payload',
    filterable: true,
    defaultVisible: false,
    path: 'metadata.resourceId',
  },
  // Error fields
  {
    key: 'metadata.errorCode',
    label: 'Error Code',
    description: 'Error code if applicable',
    type: 'string',
    category: 'payload',
    filterable: true,
    defaultVisible: false,
    path: 'metadata.errorCode',
  },
  {
    key: 'metadata.errorMessage',
    label: 'Error Message',
    description: 'Error message if applicable',
    type: 'string',
    category: 'payload',
    filterable: false,
    defaultVisible: false,
    path: 'metadata.errorMessage',
  },
];

/**
 * Tag fields (dynamic, extracted from tags object)
 */
export const TAG_FIELD_PREFIX = 'tags.';

/**
 * All known fields combined
 */
export const ALL_FIELDS: FieldDefinition[] = [
  ...COMMON_FIELDS,
  ...ENVELOPE_FIELDS,
  ...TRACE_FIELDS,
  ...PAYLOAD_FIELDS,
];

/**
 * Fields that should be shown in the sidebar by default
 */
export const DEFAULT_SIDEBAR_FIELDS = ALL_FIELDS.filter((f) => f.filterable);

/**
 * Fields that should be shown in the results table by default
 */
export const DEFAULT_TABLE_COLUMNS = ALL_FIELDS.filter((f) => f.defaultVisible).map((f) => f.key);

/**
 * Get a field definition by key
 */
export function getFieldDefinition(key: string): FieldDefinition | undefined {
  return ALL_FIELDS.find((f) => f.key === key);
}

/**
 * Get fields by category
 */
export function getFieldsByCategory(category: FieldCategory): FieldDefinition[] {
  return ALL_FIELDS.filter((f) => f.category === category);
}

/**
 * Extract a field value from a log entry using the field path
 */
export function extractFieldValue(entry: Record<string, unknown>, field: FieldDefinition): unknown {
  const path = field.path || field.key;
  const parts = path.split('.');

  let value: unknown = entry;
  for (const part of parts) {
    if (value && typeof value === 'object' && part in value) {
      value = (value as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }

  return value;
}

/**
 * Category display info
 */
export const CATEGORY_INFO: Record<FieldCategory, { label: string; description: string }> = {
  common: {
    label: 'Common',
    description: 'Standard log entry fields',
  },
  envelope: {
    label: 'Envelope',
    description: 'Log entry metadata and identifiers',
  },
  trace: {
    label: 'Tracing',
    description: 'Distributed tracing fields',
  },
  payload: {
    label: 'Payload',
    description: 'Event and request payload fields',
  },
};
