/**
 * Context Schema Section
 *
 * Editor for context resource schemas with visual field builder
 * and default values configuration.
 */

import { useState, useCallback } from 'react';
import type { CatalogResource, ContextResource } from '@/types/catalog';
import { JsonEditor } from '../shared/JsonEditor';

interface ContextSchemaSectionProps {
  resource: CatalogResource;
  onUpdateMetadata: (metadata: Record<string, unknown>) => void;
}

// Schema field types
type FieldType = 'string' | 'number' | 'boolean' | 'object' | 'array';

interface SchemaField {
  id: string;
  name: string;
  type: FieldType;
  required: boolean;
  description?: string;
  defaultValue?: unknown;
  // Type-specific constraints
  enum?: string[];
  pattern?: string;
  minimum?: number;
  maximum?: number;
}

const FIELD_TYPES: { value: FieldType; label: string; icon: string }[] = [
  { value: 'string', label: 'String', icon: 'Aa' },
  { value: 'number', label: 'Number', icon: '#' },
  { value: 'boolean', label: 'Boolean', icon: '⊘' },
  { value: 'object', label: 'Object', icon: '{}' },
  { value: 'array', label: 'Array', icon: '[]' },
];

export function ContextSchemaSection({
  resource,
  onUpdateMetadata,
}: ContextSchemaSectionProps) {
  const contextResource = resource as ContextResource;
  const schema = (contextResource.metadata?.schema as unknown as Record<string, unknown>) || {};
  const defaults = (contextResource.metadata?.defaults as unknown as Record<string, unknown>) || {};

  // Parse existing schema into fields
  const [fields, setFields] = useState<SchemaField[]>(() => {
    const properties = (schema.properties || {}) as Record<string, Record<string, unknown>>;
    const required = (schema.required || []) as string[];

    return Object.entries(properties).map(([name, prop], index) => ({
      id: `field-${index}`,
      name,
      type: (prop.type as FieldType) || 'string',
      required: required.includes(name),
      description: prop.description as string | undefined,
      defaultValue: defaults[name],
      enum: prop.enum as string[] | undefined,
      pattern: prop.pattern as string | undefined,
      minimum: prop.minimum as number | undefined,
      maximum: prop.maximum as number | undefined,
    }));
  });

  const [showAddField, setShowAddField] = useState(false);

  // Convert fields back to JSON schema format
  const fieldsToSchema = useCallback((fields: SchemaField[]) => {
    const properties: Record<string, Record<string, unknown>> = {};
    const required: string[] = [];

    for (const field of fields) {
      const prop: Record<string, unknown> = {
        type: field.type,
      };
      if (field.description) prop.description = field.description;
      if (field.enum?.length) prop.enum = field.enum;
      if (field.pattern) prop.pattern = field.pattern;
      if (field.minimum !== undefined) prop.minimum = field.minimum;
      if (field.maximum !== undefined) prop.maximum = field.maximum;

      properties[field.name] = prop;
      if (field.required) required.push(field.name);
    }

    return {
      type: 'object',
      properties,
      required: required.length > 0 ? required : undefined,
    };
  }, []);

  // Convert fields to defaults object
  const fieldsToDefaults = useCallback((fields: SchemaField[]) => {
    const result: Record<string, unknown> = {};
    for (const field of fields) {
      if (field.defaultValue !== undefined) {
        result[field.name] = field.defaultValue;
      }
    }
    return result;
  }, []);

  // Update metadata when fields change
  const updateFields = useCallback((newFields: SchemaField[]) => {
    setFields(newFields);
    onUpdateMetadata({
      schema: fieldsToSchema(newFields),
      defaults: fieldsToDefaults(newFields),
    });
  }, [onUpdateMetadata, fieldsToSchema, fieldsToDefaults]);

  // Add a new field
  const addField = useCallback(() => {
    const newField: SchemaField = {
      id: `field-${Date.now()}`,
      name: '',
      type: 'string',
      required: false,
    };
    updateFields([...fields, newField]);
    setShowAddField(false);
  }, [fields, updateFields]);

  // Update a field
  const updateField = useCallback((id: string, updates: Partial<SchemaField>) => {
    updateFields(fields.map(f => f.id === id ? { ...f, ...updates } : f));
  }, [fields, updateFields]);

  // Remove a field
  const removeField = useCallback((id: string) => {
    updateFields(fields.filter(f => f.id !== id));
  }, [fields, updateFields]);

  return (
    <div className="space-y-6">
      {/* Schema Fields */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-slate-300 uppercase tracking-wider">
            Schema Fields
          </h3>
          <button
            onClick={() => setShowAddField(true)}
            className="scc-button-ghost text-sm flex items-center gap-1"
          >
            <span>+</span>
            <span>Add Field</span>
          </button>
        </div>

        {fields.length === 0 && !showAddField ? (
          <div className="scc-card p-8 border-dashed text-center">
            <p className="text-slate-400 mb-4">No schema fields defined yet.</p>
            <button
              onClick={() => setShowAddField(true)}
              className="scc-button text-sm"
            >
              Add First Field
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {fields.map((field) => (
              <SchemaFieldEditor
                key={field.id}
                field={field}
                onUpdate={(updates) => updateField(field.id, updates)}
                onRemove={() => removeField(field.id)}
              />
            ))}

            {showAddField && (
              <div className="scc-card p-4 border-dashed flex items-center justify-between">
                <span className="text-sm text-slate-400">Add a new field</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowAddField(false)}
                    className="scc-button-ghost text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={addField}
                    className="scc-button text-sm"
                  >
                    Add
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Default Values */}
      <section className="space-y-4">
        <h3 className="text-sm font-medium text-slate-300 uppercase tracking-wider">
          Default Values
        </h3>
        <JsonEditor
          value={defaults}
          onChange={(value) => onUpdateMetadata({ ...contextResource.metadata, defaults: value })}
          height={150}
          label="Default context values applied when initializing"
        />
      </section>

      {/* Generated Schema Preview */}
      <section className="space-y-4">
        <h3 className="text-sm font-medium text-slate-300 uppercase tracking-wider">
          Generated Schema
        </h3>
        <div className="scc-card p-4 bg-scc-surface/50">
          <pre className="text-xs text-slate-400 font-mono overflow-x-auto">
            {JSON.stringify(fieldsToSchema(fields), null, 2)}
          </pre>
        </div>
      </section>
    </div>
  );
}

/**
 * Individual schema field editor
 */
function SchemaFieldEditor({
  field,
  onUpdate,
  onRemove,
}: {
  field: SchemaField;
  onUpdate: (updates: Partial<SchemaField>) => void;
  onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="scc-card border border-scc-border">
      {/* Collapsed view */}
      <div className="p-3 flex items-center gap-4">
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-slate-400 hover:text-slate-200 transition-colors"
        >
          <svg
            className={`w-4 h-4 transition-transform ${expanded ? 'rotate-90' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>

        <input
          type="text"
          value={field.name}
          onChange={(e) => onUpdate({ name: e.target.value })}
          placeholder="field_name"
          className="bg-transparent text-slate-200 text-sm font-mono focus:outline-none flex-1 min-w-0"
        />

        <select
          value={field.type}
          onChange={(e) => onUpdate({ type: e.target.value as FieldType })}
          className="bg-scc-surface border border-scc-border rounded px-2 py-1 text-xs text-slate-300"
        >
          {FIELD_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.icon} {t.label}
            </option>
          ))}
        </select>

        <label className="flex items-center gap-1.5 text-xs text-slate-400">
          <input
            type="checkbox"
            checked={field.required}
            onChange={(e) => onUpdate({ required: e.target.checked })}
            className="rounded border-scc-border"
          />
          Required
        </label>

        <button
          onClick={onRemove}
          className="p-1 text-slate-500 hover:text-red-400 transition-colors"
          title="Remove field"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Expanded view with constraints */}
      {expanded && (
        <div className="px-3 pb-3 pt-0 border-t border-scc-border/50 mt-0">
          <div className="pt-3 grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-500 block mb-1">Description</label>
              <input
                type="text"
                value={field.description || ''}
                onChange={(e) => onUpdate({ description: e.target.value || undefined })}
                placeholder="Field description"
                className="scc-input text-sm"
              />
            </div>

            <div>
              <label className="text-xs text-slate-500 block mb-1">Default Value</label>
              <input
                type="text"
                value={field.defaultValue !== undefined ? String(field.defaultValue) : ''}
                onChange={(e) => {
                  const val = e.target.value;
                  let parsed: unknown = val;
                  if (field.type === 'number') parsed = Number(val) || 0;
                  else if (field.type === 'boolean') parsed = val === 'true';
                  onUpdate({ defaultValue: val ? parsed : undefined });
                }}
                placeholder="Default value"
                className="scc-input text-sm"
              />
            </div>

            {field.type === 'string' && (
              <>
                <div>
                  <label className="text-xs text-slate-500 block mb-1">
                    Enum Values (comma-separated)
                  </label>
                  <input
                    type="text"
                    value={field.enum?.join(', ') || ''}
                    onChange={(e) => {
                      const vals = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
                      onUpdate({ enum: vals.length > 0 ? vals : undefined });
                    }}
                    placeholder="value1, value2, value3"
                    className="scc-input text-sm"
                  />
                </div>

                <div>
                  <label className="text-xs text-slate-500 block mb-1">Pattern (regex)</label>
                  <input
                    type="text"
                    value={field.pattern || ''}
                    onChange={(e) => onUpdate({ pattern: e.target.value || undefined })}
                    placeholder="^[a-z]+$"
                    className="scc-input text-sm font-mono"
                  />
                </div>
              </>
            )}

            {field.type === 'number' && (
              <>
                <div>
                  <label className="text-xs text-slate-500 block mb-1">Minimum</label>
                  <input
                    type="number"
                    value={field.minimum ?? ''}
                    onChange={(e) => onUpdate({ minimum: e.target.value ? Number(e.target.value) : undefined })}
                    placeholder="No minimum"
                    className="scc-input text-sm"
                  />
                </div>

                <div>
                  <label className="text-xs text-slate-500 block mb-1">Maximum</label>
                  <input
                    type="number"
                    value={field.maximum ?? ''}
                    onChange={(e) => onUpdate({ maximum: e.target.value ? Number(e.target.value) : undefined })}
                    placeholder="No maximum"
                    className="scc-input text-sm"
                  />
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
