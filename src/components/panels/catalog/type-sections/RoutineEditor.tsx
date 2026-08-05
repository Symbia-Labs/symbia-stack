/**
 * Routine Editor
 *
 * Plain English editor for assistant behavior using named routines,
 * sub-routines, and simple primitives.
 */

import { useState, useCallback } from 'react';
import { ReferenceInput } from '../shared/ReferenceInput';

// Step types - plain English primitives
export type StepType =
  | 'say'           // Output text to user
  | 'ask'           // Ask user a question and wait
  | 'think'         // Internal reasoning/analysis
  | 'remember'      // Store something in context
  | 'recall'        // Retrieve from context
  | 'wait'          // Delay/timing
  | 'check'         // Conditional check
  | 'call'          // Call a sub-routine
  | 'repeat'        // Loop/iterate
  | 'stop';         // End routine

export interface Step {
  id: string;
  type: StepType;
  description: string;      // Plain English description
  params?: {
    duration?: number;      // For 'wait' - ms
    condition?: string;     // For 'check' - plain English condition
    routineName?: string;   // For 'call' - sub-routine to run
    contextKey?: string;    // For 'remember'/'recall'
    times?: number;         // For 'repeat'
  };
  indent?: number;          // For visual nesting (after check/repeat)
}

export interface Routine {
  id: string;
  name: string;
  description?: string;
  trigger?: string;         // When does this routine run?
  steps: Step[];
  isMain?: boolean;         // Is this the main entry routine?
}

const STEP_META: Record<StepType, { label: string; icon: string; placeholder: string; examples: string[] }> = {
  say: {
    label: 'Say',
    icon: '💬',
    placeholder: 'What should I say to the user?',
    examples: ['Summarize the findings with recommendations', 'Present the results in a table format', 'Explain what went wrong and suggest fixes']
  },
  ask: {
    label: 'Ask',
    icon: '❓',
    placeholder: 'What question should I ask?',
    examples: ['What time period would you like to analyze?', 'Would you like me to investigate further?', 'Which format do you prefer?']
  },
  think: {
    label: 'Think',
    icon: '🧠',
    placeholder: 'What should I analyze or reason about?',
    examples: ['Analyze the patterns and identify anomalies', 'Determine the root cause of the issue', 'Rank results by relevance to user intent']
  },
  remember: {
    label: 'Remember',
    icon: '📝',
    placeholder: 'key: value to store',
    examples: ['searchResults: the filtered entries', 'rootCause: the identified issue', 'userPreference: their chosen format']
  },
  recall: {
    label: 'Recall',
    icon: '🔍',
    placeholder: 'Use @context.property to fetch data',
    examples: ['@logs.recent to get latest entries', '@user.preferences for settings', '@metrics.summary for the time period']
  },
  wait: {
    label: 'Wait',
    icon: '⏱️',
    placeholder: 'Duration in ms',
    examples: ['1000', '3000', '500']
  },
  check: {
    label: 'If',
    icon: '🔀',
    placeholder: 'Condition to check (plain English)',
    examples: ['user mentioned a specific error', 'results were found', 'there are critical alerts']
  },
  call: {
    label: 'Run',
    icon: '▶️',
    placeholder: 'Select a sub-routine',
    examples: []
  },
  repeat: {
    label: 'Repeat',
    icon: '🔄',
    placeholder: 'What to repeat (plain English)',
    examples: ['for each result in searchResults', 'until all items are processed', '3 times with increasing detail']
  },
  stop: {
    label: 'Stop',
    icon: '⏹️',
    placeholder: 'Reason (optional)',
    examples: ['Task complete', 'User cancelled', 'Error threshold reached']
  },
};

interface RoutineEditorProps {
  routines: Routine[];
  onChange: (routines: Routine[]) => void;
}

export function RoutineEditor({ routines, onChange }: RoutineEditorProps) {
  const [selectedRoutineId, setSelectedRoutineId] = useState<string | null>(
    routines.find(r => r.isMain)?.id || routines[0]?.id || null
  );
  const [isAddingRoutine, setIsAddingRoutine] = useState(false);
  const [newRoutineName, setNewRoutineName] = useState('');

  const selectedRoutine = routines.find(r => r.id === selectedRoutineId);

  // Add a new routine
  const addRoutine = useCallback(() => {
    if (!newRoutineName.trim()) return;

    const newRoutine: Routine = {
      id: `routine-${Date.now()}`,
      name: newRoutineName.trim(),
      steps: [],
      isMain: routines.length === 0,
    };

    onChange([...routines, newRoutine]);
    setSelectedRoutineId(newRoutine.id);
    setNewRoutineName('');
    setIsAddingRoutine(false);
  }, [newRoutineName, routines, onChange]);

  // Delete a routine
  const deleteRoutine = useCallback((id: string) => {
    const updated = routines.filter(r => r.id !== id);
    onChange(updated);
    if (selectedRoutineId === id) {
      setSelectedRoutineId(updated[0]?.id || null);
    }
  }, [routines, selectedRoutineId, onChange]);

  // Update a routine
  const updateRoutine = useCallback((id: string, updates: Partial<Routine>) => {
    onChange(routines.map(r => r.id === id ? { ...r, ...updates } : r));
  }, [routines, onChange]);

  // Add a step to the selected routine
  const addStep = useCallback((type: StepType) => {
    if (!selectedRoutine) return;

    const newStep: Step = {
      id: `step-${Date.now()}`,
      type,
      description: '',
    };

    updateRoutine(selectedRoutine.id, {
      steps: [...selectedRoutine.steps, newStep],
    });
  }, [selectedRoutine, updateRoutine]);

  // Update a step
  const updateStep = useCallback((stepId: string, updates: Partial<Step>) => {
    if (!selectedRoutine) return;

    updateRoutine(selectedRoutine.id, {
      steps: selectedRoutine.steps.map(s =>
        s.id === stepId ? { ...s, ...updates } : s
      ),
    });
  }, [selectedRoutine, updateRoutine]);

  // Delete a step
  const deleteStep = useCallback((stepId: string) => {
    if (!selectedRoutine) return;

    updateRoutine(selectedRoutine.id, {
      steps: selectedRoutine.steps.filter(s => s.id !== stepId),
    });
  }, [selectedRoutine, updateRoutine]);

  // Move step up/down
  const moveStep = useCallback((stepId: string, direction: 'up' | 'down') => {
    if (!selectedRoutine) return;

    const steps = [...selectedRoutine.steps];
    const index = steps.findIndex(s => s.id === stepId);
    if (index === -1) return;

    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= steps.length) return;

    [steps[index], steps[newIndex]] = [steps[newIndex], steps[index]];
    updateRoutine(selectedRoutine.id, { steps });
  }, [selectedRoutine, updateRoutine]);

  // Get other routine names for sub-routine calls
  const otherRoutineNames = routines
    .filter(r => r.id !== selectedRoutineId)
    .map(r => r.name);

  return (
    <div className="space-y-6">
      {/* Routine Tabs */}
      <div className="flex items-center gap-2 flex-wrap">
        {routines.map(routine => (
          <button
            key={routine.id}
            onClick={() => setSelectedRoutineId(routine.id)}
            className={`
              px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-2
              ${selectedRoutineId === routine.id
                ? 'bg-scc-primary/20 text-scc-primary border border-scc-primary/50'
                : 'bg-scc-surface border border-scc-border text-slate-400 hover:text-slate-200'
              }
            `}
          >
            {routine.isMain && <span className="text-xs">★</span>}
            {routine.name}
          </button>
        ))}

        {isAddingRoutine ? (
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newRoutineName}
              onChange={(e) => setNewRoutineName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') addRoutine();
                if (e.key === 'Escape') setIsAddingRoutine(false);
              }}
              placeholder="Routine name..."
              className="scc-input text-sm py-1 w-40"
              autoFocus
            />
            <button onClick={addRoutine} className="text-green-400 hover:text-green-300">✓</button>
            <button onClick={() => setIsAddingRoutine(false)} className="text-slate-500 hover:text-slate-400">✕</button>
          </div>
        ) : (
          <button
            onClick={() => setIsAddingRoutine(true)}
            className="px-3 py-1.5 rounded-lg text-sm border border-dashed border-scc-border text-slate-500 hover:text-slate-300 hover:border-slate-500 transition-colors"
          >
            + New Routine
          </button>
        )}
      </div>

      {/* Selected Routine Editor */}
      {selectedRoutine ? (
        <div className="space-y-4">
          {/* Routine Header */}
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 space-y-2">
              <input
                type="text"
                value={selectedRoutine.name}
                onChange={(e) => updateRoutine(selectedRoutine.id, { name: e.target.value })}
                className="scc-input text-lg font-medium"
              />
              <input
                type="text"
                value={selectedRoutine.trigger || ''}
                onChange={(e) => updateRoutine(selectedRoutine.id, { trigger: e.target.value })}
                placeholder="When should this run? (e.g., 'When user sends a message')"
                className="scc-input text-sm"
              />
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => updateRoutine(selectedRoutine.id, { isMain: !selectedRoutine.isMain })}
                className={`p-2 rounded transition-colors ${
                  selectedRoutine.isMain
                    ? 'text-yellow-400 bg-yellow-400/10'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
                title={selectedRoutine.isMain ? 'Main routine' : 'Set as main routine'}
              >
                ★
              </button>
              <button
                onClick={() => deleteRoutine(selectedRoutine.id)}
                className="p-2 text-slate-500 hover:text-red-400 transition-colors"
                title="Delete routine"
              >
                🗑️
              </button>
            </div>
          </div>

          {/* Steps */}
          <div className="scc-card p-4 space-y-2">
            {selectedRoutine.steps.length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                <p className="mb-4">No steps yet. Add steps to define what this routine does.</p>
              </div>
            ) : (
              selectedRoutine.steps.map((step, index) => (
                <StepRow
                  key={step.id}
                  step={step}
                  index={index}
                  isFirst={index === 0}
                  isLast={index === selectedRoutine.steps.length - 1}
                  otherRoutines={otherRoutineNames}
                  onUpdate={(updates) => updateStep(step.id, updates)}
                  onDelete={() => deleteStep(step.id)}
                  onMoveUp={() => moveStep(step.id, 'up')}
                  onMoveDown={() => moveStep(step.id, 'down')}
                />
              ))
            )}
          </div>

          {/* Add Step Buttons */}
          <div className="flex flex-wrap gap-2">
            {(Object.entries(STEP_META) as [StepType, typeof STEP_META[StepType]][]).map(([type, meta]) => (
              <button
                key={type}
                onClick={() => addStep(type)}
                className="px-3 py-1.5 rounded-lg text-sm bg-scc-surface border border-scc-border text-slate-400 hover:text-slate-200 hover:border-slate-500 transition-colors flex items-center gap-1.5"
              >
                <span>{meta.icon}</span>
                <span>{meta.label}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="scc-card p-8 text-center text-slate-500">
          <p>Create a routine to define assistant behavior.</p>
          <button
            onClick={() => setIsAddingRoutine(true)}
            className="scc-button mt-4"
          >
            + Create First Routine
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Individual step row with example suggestions
 */
function StepRow({
  step,
  index,
  isFirst,
  isLast,
  otherRoutines,
  onUpdate,
  onDelete,
  onMoveUp,
  onMoveDown,
}: {
  step: Step;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  otherRoutines: string[];
  onUpdate: (updates: Partial<Step>) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const [showExamples, setShowExamples] = useState(false);
  const meta = STEP_META[step.type];
  const indent = step.indent || 0;

  // Show examples when description is empty and step is focused
  const hasExamples = meta.examples.length > 0;
  const isEmpty = !step.description && step.type !== 'call' && step.type !== 'wait';

  return (
    <div
      className="flex items-start gap-2 group relative"
      style={{ paddingLeft: `${indent * 24}px` }}
    >
      {/* Step number */}
      <span className="w-6 text-xs text-slate-500 text-right shrink-0 pt-2">
        {index + 1}.
      </span>

      {/* Step type badge */}
      <span
        className="w-20 shrink-0 px-2 py-1.5 rounded text-xs font-medium bg-scc-elevated flex items-center gap-1"
        title={meta.label}
      >
        <span>{meta.icon}</span>
        <span className="text-slate-400">{meta.label}</span>
      </span>

      {/* Step content - varies by type */}
      <div className="flex-1 relative">
        {step.type === 'call' ? (
          <select
            value={step.params?.routineName || ''}
            onChange={(e) => onUpdate({ params: { ...step.params, routineName: e.target.value } })}
            className="scc-input text-sm w-full"
          >
            <option value="">Select routine...</option>
            {otherRoutines.map(name => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        ) : step.type === 'wait' ? (
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={step.params?.duration || ''}
              onChange={(e) => onUpdate({ params: { ...step.params, duration: parseInt(e.target.value) || 0 } })}
              placeholder="1000"
              className="scc-input text-sm w-24"
            />
            <span className="text-slate-500 text-sm">ms</span>
            <ReferenceInput
              value={step.description}
              onChange={(value) => onUpdate({ description: value })}
              placeholder="(optional reason)"
            />
          </div>
        ) : (
          <div className="relative">
            <ReferenceInput
              value={step.description}
              onChange={(value) => onUpdate({ description: value })}
              placeholder={meta.placeholder}
              className={isEmpty && hasExamples ? 'pr-16' : ''}
            />
            {/* Example button for empty steps */}
            {isEmpty && hasExamples && (
              <button
                onClick={() => setShowExamples(!showExamples)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-scc-primary/70 hover:text-scc-primary transition-colors"
              >
                Examples
              </button>
            )}
          </div>
        )}

        {/* Examples dropdown */}
        {showExamples && hasExamples && (
          <div className="absolute left-0 right-0 top-full mt-1 bg-scc-elevated border border-scc-border rounded-lg shadow-lg z-30 overflow-hidden">
            <div className="p-1">
              <div className="px-2 py-1 text-xs text-slate-500 border-b border-scc-border mb-1">
                Click an example to use it
              </div>
              {meta.examples.map((example, i) => (
                <button
                  key={i}
                  onClick={() => {
                    onUpdate({ description: example });
                    setShowExamples(false);
                  }}
                  className="w-full text-left px-3 py-2 text-sm text-slate-300 hover:bg-scc-surface rounded transition-colors"
                >
                  {example}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity pt-1">
        <button
          onClick={onMoveUp}
          disabled={isFirst}
          className="p-1 text-slate-500 hover:text-slate-300 disabled:opacity-30"
          title="Move up"
        >
          ↑
        </button>
        <button
          onClick={onMoveDown}
          disabled={isLast}
          className="p-1 text-slate-500 hover:text-slate-300 disabled:opacity-30"
          title="Move down"
        >
          ↓
        </button>
        <button
          onClick={onDelete}
          className="p-1 text-slate-500 hover:text-red-400"
          title="Delete step"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
