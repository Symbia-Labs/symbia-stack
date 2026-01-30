import chalk from 'chalk';
import Table from 'cli-table3';

export type OutputFormat = 'table' | 'json' | 'yaml' | 'ids';

let globalQuiet = false;

export function setOutputFormat(format: OutputFormat): void {
  // Store in env var for consistency
  process.env.SYMBIA_OUTPUT_FORMAT = format;
}

export function setQuiet(quiet: boolean): void {
  globalQuiet = quiet;
}

export function getOutputFormat(): OutputFormat {
  const envFormat = process.env.SYMBIA_OUTPUT_FORMAT;
  if (envFormat && ['table', 'json', 'yaml', 'ids'].includes(envFormat)) {
    return envFormat as OutputFormat;
  }
  return 'table';
}

/**
 * Print success message
 */
export function success(message: string): void {
  if (!globalQuiet) {
    console.log(chalk.green('✓'), message);
  }
}

/**
 * Print error message
 */
export function error(message: string): void {
  console.error(chalk.red('✗'), message);
}

/**
 * Print warning message
 */
export function warn(message: string): void {
  if (!globalQuiet) {
    console.log(chalk.yellow('!'), message);
  }
}

/**
 * Print info message
 */
export function info(message: string): void {
  if (!globalQuiet) {
    console.log(chalk.blue('ℹ'), message);
  }
}

/**
 * Print data in the configured format
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function output(
  data: any | any[],
  options: {
    columns?: { key: string; header: string; width?: number }[];
    idKey?: string;
  } = {}
): void {
  const format = getOutputFormat();
  const items = Array.isArray(data) ? data : [data];

  if (items.length === 0) {
    if (!globalQuiet) {
      info('No results found');
    }
    return;
  }

  switch (format) {
    case 'json':
      console.log(JSON.stringify(data, null, 2));
      break;

    case 'yaml': {
      // Simple YAML output
      const yamlOutput = items.map((item: Record<string, unknown>) => {
        return Object.entries(item)
          .map(([key, value]) => {
            if (typeof value === 'object' && value !== null) {
              return `${key}: ${JSON.stringify(value)}`;
            }
            return `${key}: ${value}`;
          })
          .join('\n');
      }).join('\n---\n');
      console.log(yamlOutput);
      break;
    }

    case 'ids': {
      const idKey = options.idKey || 'id';
      items.forEach((item: Record<string, unknown>) => {
        if (idKey in item) {
          console.log(item[idKey]);
        }
      });
      break;
    }

    case 'table':
    default: {
      const columns = options.columns || inferColumns(items[0]);

      const table = new Table({
        head: columns.map(c => chalk.bold(c.header)),
        style: { head: [], border: [] },
        colWidths: columns.map(c => c.width ?? null),
      });

      items.forEach((item: Record<string, unknown>) => {
        const row = columns.map(col => {
          // Support nested keys like 'wrapper.id'
          const value = getNestedValue(item, col.key);
          if (value === null || value === undefined) {
            return chalk.dim('-');
          }
          if (typeof value === 'object') {
            return JSON.stringify(value);
          }
          return String(value);
        });
        table.push(row);
      });

      console.log(table.toString());
      break;
    }
  }
}

/**
 * Get a nested value from an object using dot notation
 */
function getNestedValue(obj: Record<string, unknown>, key: string): unknown {
  return key.split('.').reduce((o, k) => {
    return o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined;
  }, obj as unknown);
}

/**
 * Infer table columns from object keys
 */
function inferColumns(
  item: Record<string, unknown>
): { key: string; header: string; width?: number }[] {
  return Object.keys(item).map(key => ({
    key,
    header: key
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, str => str.toUpperCase())
      .trim(),
  }));
}

/**
 * Print a single key-value detail
 */
export function detail(label: string, value: unknown): void {
  if (globalQuiet) return;

  const formattedValue = typeof value === 'object' && value !== null
    ? JSON.stringify(value, null, 2)
    : String(value ?? '-');

  console.log(`${chalk.bold(label)}: ${formattedValue}`);
}

/**
 * Print a separator line
 */
export function separator(): void {
  if (!globalQuiet) {
    console.log(chalk.dim('─'.repeat(60)));
  }
}
