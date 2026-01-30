import { Command } from 'commander';
import { logging } from '../client.js';
import { success, error, output, detail, info } from '../output.js';

interface LogStream {
  id: string;
  name: string;
  createdAt: string;
}

interface LogEntry {
  id: string;
  level: string;
  message: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

interface Metric {
  id: string;
  name: string;
  type: string;
  description?: string;
}

export function registerLoggingCommands(program: Command): void {
  const logs = program
    .command('logging')
    .alias('logs')
    .description('Logs, metrics, and traces');

  // Streams
  const streams = logs
    .command('streams')
    .description('Manage log streams');

  streams
    .command('list')
    .description('List log streams')
    .action(async () => {
      const res = await logging.get<{ streams: LogStream[] }>('/api/logs/streams');

      if (!res.ok) {
        error(res.error || 'Failed to list streams');
        process.exit(1);
      }

      output(res.data?.streams || [], {
        columns: [
          { key: 'id', header: 'ID' },
          { key: 'name', header: 'Name' },
          { key: 'createdAt', header: 'Created' },
        ],
        idKey: 'id',
      });
    });

  streams
    .command('create <name>')
    .description('Create a new log stream')
    .action(async (name) => {
      const res = await logging.post<{ id: string; name: string }>('/api/logs/streams', { name });

      if (!res.ok) {
        error(res.error || 'Failed to create stream');
        process.exit(1);
      }

      success(`Created stream: ${res.data?.name} (${res.data?.id})`);
    });

  // Query logs
  logs
    .command('query [query]')
    .description('Query logs')
    .option('-s, --stream <stream>', 'Stream name or ID')
    .option('--last <duration>', 'Time range (e.g., 1h, 30m, 7d)', '1h')
    .option('--from <timestamp>', 'Start time (ISO 8601)')
    .option('--to <timestamp>', 'End time (ISO 8601)')
    .option('-l, --level <level>', 'Filter by level (debug, info, warn, error)')
    .option('-n, --limit <n>', 'Maximum results', '100')
    .action(async (query, opts) => {
      const params: Record<string, string | number | undefined> = {
        q: query,
        stream: opts.stream,
        level: opts.level,
        limit: parseInt(opts.limit, 10),
      };

      if (opts.from) {
        params.from = opts.from;
      } else if (opts.last) {
        // Parse duration like "1h", "30m", "7d"
        const match = opts.last.match(/^(\d+)([mhd])$/);
        if (match) {
          const value = parseInt(match[1], 10);
          const unit = match[2];
          const ms = unit === 'm' ? value * 60000 : unit === 'h' ? value * 3600000 : value * 86400000;
          params.from = new Date(Date.now() - ms).toISOString();
        }
      }

      if (opts.to) {
        params.to = opts.to;
      }

      const res = await logging.get<{ logs: LogEntry[] }>('/api/logs/query', params);

      if (!res.ok) {
        error(res.error || 'Query failed');
        process.exit(1);
      }

      const logs_data = res.data?.logs || [];

      if (logs_data.length === 0) {
        info('No logs found');
        return;
      }

      output(logs_data, {
        columns: [
          { key: 'timestamp', header: 'Time' },
          { key: 'level', header: 'Level' },
          { key: 'message', header: 'Message' },
        ],
      });
    });

  // Tail logs (follow mode)
  logs
    .command('tail [stream]')
    .description('Tail logs in real-time')
    .option('-f, --follow', 'Follow mode (continuous output)')
    .option('-l, --level <level>', 'Filter by level')
    .action(async (stream, opts) => {
      if (!opts.follow) {
        // Just show recent logs
        const res = await logging.get<{ logs: LogEntry[] }>('/api/logs/query', {
          stream,
          level: opts.level,
          limit: 50,
        });

        if (!res.ok) {
          error(res.error || 'Failed to fetch logs');
          process.exit(1);
        }

        const logs_data = res.data?.logs || [];
        logs_data.forEach(log => {
          const level = log.level.toUpperCase().padEnd(5);
          const time = new Date(log.timestamp).toLocaleTimeString();
          console.log(`${time} [${level}] ${log.message}`);
        });
        return;
      }

      // Follow mode - would use WebSocket in real implementation
      info('Follow mode requires WebSocket connection (not yet implemented)');
      info('Showing recent logs instead...');

      const res = await logging.get<{ logs: LogEntry[] }>('/api/logs/query', {
        stream,
        level: opts.level,
        limit: 50,
      });

      if (res.ok) {
        const logs_data = res.data?.logs || [];
        logs_data.forEach(log => {
          const level = log.level.toUpperCase().padEnd(5);
          const time = new Date(log.timestamp).toLocaleTimeString();
          console.log(`${time} [${level}] ${log.message}`);
        });
      }
    });

  // Metrics
  const metrics = logs
    .command('metrics')
    .description('Manage metrics');

  metrics
    .command('list')
    .description('List metric definitions')
    .action(async () => {
      const res = await logging.get<{ metrics: Metric[] }>('/api/metrics/definitions');

      if (!res.ok) {
        error(res.error || 'Failed to list metrics');
        process.exit(1);
      }

      output(res.data?.metrics || [], {
        columns: [
          { key: 'id', header: 'ID' },
          { key: 'name', header: 'Name' },
          { key: 'type', header: 'Type' },
          { key: 'description', header: 'Description' },
        ],
        idKey: 'id',
      });
    });

  metrics
    .command('query <name>')
    .description('Query metric data')
    .option('--last <duration>', 'Time range (e.g., 1h, 30m, 7d)', '1h')
    .option('--from <timestamp>', 'Start time')
    .option('--to <timestamp>', 'End time')
    .action(async (name, opts) => {
      const params: Record<string, string | number | undefined> = { name };

      if (opts.from) {
        params.from = opts.from;
      } else if (opts.last) {
        const match = opts.last.match(/^(\d+)([mhd])$/);
        if (match) {
          const value = parseInt(match[1], 10);
          const unit = match[2];
          const ms = unit === 'm' ? value * 60000 : unit === 'h' ? value * 3600000 : value * 86400000;
          params.from = new Date(Date.now() - ms).toISOString();
        }
      }

      if (opts.to) {
        params.to = opts.to;
      }

      const res = await logging.get<{ datapoints: Array<{ timestamp: string; value: number }> }>(
        '/api/metrics/query',
        params
      );

      if (!res.ok) {
        error(res.error || 'Query failed');
        process.exit(1);
      }

      output(res.data?.datapoints || [], {
        columns: [
          { key: 'timestamp', header: 'Time' },
          { key: 'value', header: 'Value' },
        ],
      });
    });

  // Traces
  const traces = logs
    .command('traces')
    .description('Distributed tracing');

  traces
    .command('get <traceId>')
    .description('Get trace details')
    .action(async (traceId) => {
      const res = await logging.get<{ trace: { id: string; spans: unknown[] } }>(`/api/traces/${traceId}`);

      if (!res.ok) {
        error(res.error || 'Trace not found');
        process.exit(1);
      }

      const trace = res.data?.trace;
      detail('Trace ID', trace?.id);
      detail('Spans', trace?.spans?.length || 0);

      // Output spans
      if (trace?.spans) {
        console.log('\nSpans:');
        output(trace.spans as Array<{ spanId: string; name: string; status: string; duration: number }>, {
          columns: [
            { key: 'spanId', header: 'Span ID' },
            { key: 'name', header: 'Name' },
            { key: 'status', header: 'Status' },
            { key: 'duration', header: 'Duration (ms)' },
          ],
        });
      }
    });
}
