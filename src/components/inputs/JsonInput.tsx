/**
 * JsonInput
 *
 * Textarea with JSON syntax highlighting.
 * Uses a highlighted overlay behind a transparent textarea.
 */
import { useState, useRef, useEffect, useCallback } from 'react';

interface JsonInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  className?: string;
  label?: string;
}

// Token types for JSON syntax highlighting
type TokenType = 'string' | 'number' | 'boolean' | 'null' | 'key' | 'punctuation' | 'error';

interface Token {
  type: TokenType;
  value: string;
}

// Simple JSON tokenizer for syntax highlighting
function tokenizeJson(json: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  const skipWhitespace = () => {
    while (i < json.length && /\s/.test(json[i])) {
      tokens.push({ type: 'punctuation', value: json[i] });
      i++;
    }
  };

  const readString = (): string => {
    let str = json[i]; // Opening quote
    i++;
    while (i < json.length && json[i] !== '"') {
      if (json[i] === '\\' && i + 1 < json.length) {
        str += json[i] + json[i + 1];
        i += 2;
      } else {
        str += json[i];
        i++;
      }
    }
    if (i < json.length) {
      str += json[i]; // Closing quote
      i++;
    }
    return str;
  };

  const readNumber = (): string => {
    let num = '';
    while (i < json.length && /[0-9.eE+\-]/.test(json[i])) {
      num += json[i];
      i++;
    }
    return num;
  };

  const readWord = (): string => {
    let word = '';
    while (i < json.length && /[a-zA-Z]/.test(json[i])) {
      word += json[i];
      i++;
    }
    return word;
  };

  while (i < json.length) {
    skipWhitespace();
    if (i >= json.length) break;

    const char = json[i];

    // String
    if (char === '"') {
      const str = readString();

      // Check if this is a key (followed by :)
      const savedI = i;
      skipWhitespace();
      if (json[i] === ':') {
        tokens.pop(); // Remove the whitespace token we just added
        i = savedI;
        tokens.push({ type: 'key', value: str });
      } else {
        // Restore position and add as string
        while (tokens.length > 0 && tokens[tokens.length - 1].type === 'punctuation' && /\s/.test(tokens[tokens.length - 1].value)) {
          tokens.pop();
        }
        i = savedI;
        tokens.push({ type: 'string', value: str });
      }
      continue;
    }

    // Number
    if (/[0-9\-]/.test(char)) {
      const num = readNumber();
      tokens.push({ type: 'number', value: num });
      continue;
    }

    // Boolean or null
    if (/[a-z]/.test(char)) {
      const word = readWord();
      if (word === 'true' || word === 'false') {
        tokens.push({ type: 'boolean', value: word });
      } else if (word === 'null') {
        tokens.push({ type: 'null', value: word });
      } else {
        tokens.push({ type: 'error', value: word });
      }
      continue;
    }

    // Punctuation
    if (/[{}\[\]:,]/.test(char)) {
      tokens.push({ type: 'punctuation', value: char });
      i++;
      continue;
    }

    // Unknown character
    tokens.push({ type: 'error', value: char });
    i++;
  }

  return tokens;
}

// Get color class for token type
function getTokenColor(type: TokenType): string {
  switch (type) {
    case 'key':
      return 'text-blue-400';
    case 'string':
      return 'text-emerald-400';
    case 'number':
      return 'text-orange-400';
    case 'boolean':
      return 'text-purple-400';
    case 'null':
      return 'text-slate-500';
    case 'punctuation':
      return 'text-slate-400';
    case 'error':
      return 'text-red-400';
    default:
      return 'text-slate-300';
  }
}

export function JsonInput({
  value,
  onChange,
  placeholder = '{}',
  rows = 4,
  className = '',
  label,
}: JsonInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const highlightRef = useRef<HTMLPreElement>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [isValid, setIsValid] = useState(true);

  // Sync scroll between textarea and highlight
  const syncScroll = useCallback(() => {
    if (textareaRef.current && highlightRef.current) {
      highlightRef.current.scrollTop = textareaRef.current.scrollTop;
      highlightRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
  }, []);

  // Validate JSON
  useEffect(() => {
    if (!value || value.trim() === '') {
      setIsValid(true);
      return;
    }
    try {
      JSON.parse(value);
      setIsValid(true);
    } catch {
      setIsValid(false);
    }
  }, [value]);

  // Render highlighted JSON
  const renderHighlighted = () => {
    if (!value) {
      return <span className="text-slate-600">{placeholder}</span>;
    }

    const tokens = tokenizeJson(value);
    return tokens.map((token, idx) => (
      <span key={idx} className={getTokenColor(token.type)}>
        {token.value}
      </span>
    ));
  };

  return (
    <div className={className}>
      {label && (
        <div className="flex items-center justify-between mb-1">
          <label className="block text-xs text-slate-400">{label}</label>
          {!isValid && value && (
            <span className="text-xs text-red-400">Invalid JSON</span>
          )}
        </div>
      )}
      <div
        className={`
          relative rounded-lg border transition-colors
          ${isFocused
            ? 'border-scc-primary/50 ring-1 ring-scc-primary/20'
            : isValid
              ? 'border-scc-border'
              : 'border-red-500/50'
          }
          bg-scc-bg
        `}
      >
        {/* Highlighted layer */}
        <pre
          ref={highlightRef}
          className="absolute inset-0 p-3 font-mono text-sm overflow-hidden whitespace-pre-wrap break-words pointer-events-none"
          aria-hidden="true"
        >
          <code>{renderHighlighted()}</code>
        </pre>

        {/* Actual textarea */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={e => onChange(e.target.value)}
          onScroll={syncScroll}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          rows={rows}
          placeholder=""
          className="w-full p-3 font-mono text-sm bg-transparent text-transparent caret-slate-200 resize-none relative z-10 outline-none"
          spellCheck={false}
        />
      </div>
    </div>
  );
}
