/**
 * Log Broadcaster
 *
 * Event-driven system for broadcasting new log entries to SSE clients.
 * No polling - services emit events only when logs are ingested.
 */

import { EventEmitter } from 'events';
import type { Response } from 'express';

export interface LogBroadcastEntry {
  id: string;
  streamId: string;
  orgId: string;
  serviceId: string;
  env: string;
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  source?: string;
  tags?: Record<string, string>;
  metadata?: Record<string, unknown>;
  traceId?: string;
  spanId?: string;
}

interface SSEClient {
  id: string;
  res: Response;
  orgId: string;
  filters: {
    streamIds?: string[];
    level?: 'debug' | 'info' | 'warn' | 'error';
  };
}

class LogBroadcaster extends EventEmitter {
  private clients = new Map<string, SSEClient>();
  private clientIdCounter = 0;

  /**
   * Register an SSE client to receive log broadcasts
   */
  registerClient(
    res: Response,
    orgId: string,
    filters: SSEClient['filters'] = {}
  ): string {
    const clientId = `sse_client_${++this.clientIdCounter}`;

    const client: SSEClient = {
      id: clientId,
      res,
      orgId,
      filters,
    };

    this.clients.set(clientId, client);
    console.log(`[LogBroadcaster] Client ${clientId} registered (org: ${orgId}, total: ${this.clients.size})`);

    return clientId;
  }

  /**
   * Unregister an SSE client
   */
  unregisterClient(clientId: string): boolean {
    const removed = this.clients.delete(clientId);
    if (removed) {
      console.log(`[LogBroadcaster] Client ${clientId} unregistered (total: ${this.clients.size})`);
    }
    return removed;
  }

  /**
   * Broadcast new log entries to all matching clients
   * Called when logs are ingested
   */
  broadcast(entries: LogBroadcastEntry[]): void {
    if (entries.length === 0 || this.clients.size === 0) return;

    let broadcastCount = 0;

    for (const client of Array.from(this.clients.values())) {
      // Filter entries for this client
      const matchingEntries = entries.filter((entry) => {
        // Must match org
        if (entry.orgId !== client.orgId) return false;

        // Filter by streamIds if specified
        if (client.filters.streamIds?.length) {
          if (!client.filters.streamIds.includes(entry.streamId)) return false;
        }

        // Filter by level if specified
        if (client.filters.level) {
          const levelOrder = ['debug', 'info', 'warn', 'error'];
          const entryLevel = levelOrder.indexOf(entry.level);
          const filterLevel = levelOrder.indexOf(client.filters.level);
          if (entryLevel < filterLevel) return false;
        }

        return true;
      });

      if (matchingEntries.length > 0) {
        try {
          client.res.write(`event: logs\ndata: ${JSON.stringify(matchingEntries)}\n\n`);
          broadcastCount++;
        } catch (error) {
          // Client likely disconnected
          console.error(`[LogBroadcaster] Error writing to client ${client.id}:`, error);
          this.unregisterClient(client.id);
        }
      }
    }

    if (broadcastCount > 0) {
      console.log(`[LogBroadcaster] Broadcast ${entries.length} entries to ${broadcastCount} clients`);
    }
  }

  /**
   * Get current client count (for monitoring)
   */
  getClientCount(): number {
    return this.clients.size;
  }

  /**
   * Send heartbeat to all clients (call periodically to keep connections alive)
   */
  sendHeartbeats(): void {
    for (const client of Array.from(this.clients.values())) {
      try {
        client.res.write(`:heartbeat\n\n`);
      } catch (error) {
        // Client likely disconnected
        this.unregisterClient(client.id);
      }
    }
  }
}

// Singleton instance
export const logBroadcaster = new LogBroadcaster();

// Start heartbeat interval (every 30 seconds)
setInterval(() => {
  logBroadcaster.sendHeartbeats();
}, 30000);
