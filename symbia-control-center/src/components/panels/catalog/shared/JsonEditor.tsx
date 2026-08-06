/**
 * JSON Editor
 *
 * Monaco-based JSON editor with syntax highlighting and validation.
 */

import { useCallback, useMemo } from 'react';
import Editor, { OnChange } from '@monaco-editor/react';

interface JsonEditorProps {
  value: Record<string, unknown> | unknown[];
  onChange: (value: Record<string, unknown> | unknown[]) => void;
  height?: string | number;
  readOnly?: boolean;
  label?: string;
}

export function JsonEditor({
  value,
  onChange,
  height = 200,
  readOnly = false,
  label,
}: JsonEditorProps) {
  const stringValue = useMemo(() => {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return '{}';
    }
  }, [value]);

  const handleChange: OnChange = useCallback(
    (newValue) => {
      if (newValue === undefined) return;
      try {
        const parsed = JSON.parse(newValue);
        onChange(parsed);
      } catch {
        // Invalid JSON, don't update
      }
    },
    [onChange]
  );

  return (
    <div className="space-y-2">
      {label && (
        <label className="scc-label">{label}</label>
      )}
      <div className="border border-scc-border rounded-lg overflow-hidden">
        <Editor
          height={height}
          defaultLanguage="json"
          value={stringValue}
          onChange={handleChange}
          theme="vs-dark"
          options={{
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            fontSize: 13,
            fontFamily: 'JetBrains Mono, Menlo, Monaco, Consolas, monospace',
            lineNumbers: 'on',
            renderLineHighlight: 'line',
            tabSize: 2,
            readOnly,
            automaticLayout: true,
            padding: { top: 8, bottom: 8 },
            scrollbar: {
              verticalScrollbarSize: 8,
              horizontalScrollbarSize: 8,
            },
          }}
        />
      </div>
    </div>
  );
}

/**
 * Compact JSON display (read-only, no editor)
 */
export function JsonDisplay({
  value,
  maxHeight = 200,
}: {
  value: Record<string, unknown> | unknown[];
  maxHeight?: number;
}) {
  const formatted = useMemo(() => {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return '{}';
    }
  }, [value]);

  return (
    <div
      className="bg-scc-surface border border-scc-border rounded-lg p-3 overflow-auto"
      style={{ maxHeight }}
    >
      <pre className="text-xs text-slate-400 font-mono whitespace-pre-wrap">
        {formatted}
      </pre>
    </div>
  );
}
