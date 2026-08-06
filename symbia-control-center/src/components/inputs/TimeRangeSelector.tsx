/**
 * Time Range Selector
 *
 * Dropdown for selecting log search time ranges with presets and custom picker.
 */
import { useState, useRef, useEffect } from 'react';
import { type TimeRangePreset, type TimeRange } from '@/stores/logSearchStore';

const PRESETS: { label: string; value: TimeRangePreset }[] = [
  { label: 'Last 15 minutes', value: '15m' },
  { label: 'Last 1 hour', value: '1h' },
  { label: 'Last 4 hours', value: '4h' },
  { label: 'Last 24 hours', value: '24h' },
  { label: 'Last 7 days', value: '7d' },
  { label: 'Custom range', value: 'custom' },
];

interface TimeRangeSelectorProps {
  value: TimeRange;
  onChange: (range: TimeRange) => void;
  onSearch?: () => void;
  compact?: boolean;
}

export function TimeRangeSelector({
  value,
  onChange,
  onSearch,
  compact = false,
}: TimeRangeSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showCustomPicker, setShowCustomPicker] = useState(false);
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setShowCustomPicker(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getDisplayLabel = () => {
    if (value.preset === 'custom' && value.startTime && value.endTime) {
      const start = value.startTime.toLocaleDateString() + ' ' + value.startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const end = value.endTime.toLocaleDateString() + ' ' + value.endTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      return `${start} - ${end}`;
    }
    return PRESETS.find((p) => p.value === value.preset)?.label || 'Last 1 hour';
  };

  const handlePresetClick = (preset: TimeRangePreset) => {
    if (preset === 'custom') {
      setShowCustomPicker(true);
      // Initialize custom inputs with current values or defaults
      const now = new Date();
      const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      setCustomStart(formatDateTimeLocal(value.startTime || hourAgo));
      setCustomEnd(formatDateTimeLocal(value.endTime || now));
    } else {
      onChange({ preset });
      setIsOpen(false);
      setShowCustomPicker(false);
      onSearch?.();
    }
  };

  const handleCustomApply = () => {
    const startTime = new Date(customStart);
    const endTime = new Date(customEnd);

    if (startTime >= endTime) {
      return; // Invalid range
    }

    onChange({
      preset: 'custom',
      startTime,
      endTime,
    });
    setIsOpen(false);
    setShowCustomPicker(false);
    onSearch?.();
  };

  const formatDateTimeLocal = (date: Date) => {
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`
          flex items-center gap-2 rounded transition-all border
          ${compact
            ? 'px-2 py-1 text-xs'
            : 'px-3 py-1.5 text-sm'
          }
          bg-slate-700 text-slate-200 border-slate-600 hover:bg-slate-600 hover:border-slate-500
        `}
      >
        <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span className={compact ? 'max-w-32 truncate' : ''}>{getDisplayLabel()}</span>
        <svg
          className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-scc-surface border border-scc-border rounded-lg shadow-xl min-w-48">
          {!showCustomPicker ? (
            // Preset list
            <div className="py-1">
              {PRESETS.map((preset) => (
                <button
                  key={preset.value}
                  onClick={() => handlePresetClick(preset.value)}
                  className={`
                    w-full text-left px-3 py-2 text-sm transition-colors
                    ${value.preset === preset.value && preset.value !== 'custom'
                      ? 'bg-scc-primary/20 text-scc-primary'
                      : 'text-slate-300 hover:bg-slate-700'
                    }
                  `}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          ) : (
            // Custom range picker
            <div className="p-4 space-y-4">
              <div className="text-sm font-medium text-slate-300 mb-3">Custom Time Range</div>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Start</label>
                  <input
                    type="datetime-local"
                    value={customStart}
                    onChange={(e) => setCustomStart(e.target.value)}
                    className="w-full px-2 py-1.5 text-sm bg-slate-700 border border-slate-600 rounded text-slate-200 focus:border-scc-primary focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs text-slate-500 mb-1">End</label>
                  <input
                    type="datetime-local"
                    value={customEnd}
                    onChange={(e) => setCustomEnd(e.target.value)}
                    className="w-full px-2 py-1.5 text-sm bg-slate-700 border border-slate-600 rounded text-slate-200 focus:border-scc-primary focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  onClick={() => setShowCustomPicker(false)}
                  className="flex-1 px-3 py-1.5 text-sm bg-slate-700 text-slate-300 rounded hover:bg-slate-600 transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={handleCustomApply}
                  className="flex-1 px-3 py-1.5 text-sm bg-scc-primary text-slate-900 rounded hover:bg-scc-primary/90 transition-colors font-medium"
                >
                  Apply
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
