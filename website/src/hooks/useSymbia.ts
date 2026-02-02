/**
 * Symbia Platform Hooks
 *
 * React hooks for interacting with live Symbia services
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { createCatalogClient, type AssistantResource, type CatalogStats } from '@symbia/catalog-client';

// Types
export interface ServiceHealth {
  name: string;
  port: number;
  healthy: boolean;
  latency?: number;
  error?: string;
}

export interface PlatformStatus {
  connected: boolean;
  services: ServiceHealth[];
  stats?: CatalogStats;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  streaming?: boolean;
}

// Service definitions
const SERVICES = [
  { name: 'identity', port: 5001 },
  { name: 'logging', port: 5002 },
  { name: 'catalog', port: 5003 },
  { name: 'assistants', port: 5004 },
  { name: 'messaging', port: 5005 },
  { name: 'runtime', port: 5006 },
  { name: 'integrations', port: 5007 },
  { name: 'network', port: 5054 },
];

/**
 * Hook to check platform connection status
 */
export function usePlatformStatus(pollInterval = 10000): PlatformStatus {
  const [status, setStatus] = useState<PlatformStatus>({
    connected: false,
    services: [],
  });

  useEffect(() => {
    let mounted = true;

    async function checkHealth() {
      const results: ServiceHealth[] = await Promise.all(
        SERVICES.map(async ({ name, port }) => {
          const start = Date.now();
          try {
            // Use /svc/{service}/health to hit the root /health endpoint
            const res = await fetch(`/svc/${name}/health`, {
              signal: AbortSignal.timeout(2000),
            });
            const latency = Date.now() - start;
            return {
              name,
              port,
              healthy: res.ok,
              latency,
            };
          } catch (e) {
            return {
              name,
              port,
              healthy: false,
              error: e instanceof Error ? e.message : 'Unknown error',
            };
          }
        })
      );

      if (!mounted) return;

      const connected = results.some(s => s.healthy);
      setStatus(prev => ({ ...prev, connected, services: results }));

      // If connected, fetch catalog stats
      if (connected) {
        try {
          const catalog = createCatalogClient({ endpoint: '/svc/catalog' });
          const stats = await catalog.getStats();
          if (mounted) {
            setStatus(prev => ({ ...prev, stats }));
          }
        } catch (e) {
          // Stats not available
        }
      }
    }

    checkHealth();
    const interval = setInterval(checkHealth, pollInterval);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [pollInterval]);

  return status;
}

/**
 * Hook to fetch live assistants from catalog
 */
export function useAssistants() {
  const [assistants, setAssistants] = useState<AssistantResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let mounted = true;

    async function fetchAssistants() {
      try {
        const catalog = createCatalogClient({ endpoint: '/svc/catalog' });
        // Use public bootstrap endpoint (no auth required) and filter for assistants
        const allResources = await catalog.getBootstrap();
        const assistantResources = allResources.filter(r => r.type === 'assistant') as AssistantResource[];
        if (mounted) {
          setAssistants(assistantResources);
          setLoading(false);
        }
      } catch (e) {
        if (mounted) {
          setError(e instanceof Error ? e : new Error('Failed to fetch assistants'));
          setLoading(false);
        }
      }
    }

    fetchAssistants();
    return () => { mounted = false; };
  }, []);

  return { assistants, loading, error };
}

/**
 * Hook for chat (simplified - no WebSocket for now)
 */
export function useChat(assistantKey = 'coordinator') {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(async (content: string) => {
    if (isStreaming) return;

    // Add user message
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content,
      timestamp: Date.now(),
    };
    setMessages(prev => [...prev, userMsg]);

    // Create placeholder for assistant response
    const assistantMsgId = `assistant-${Date.now()}`;
    const assistantMsg: ChatMessage = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      streaming: true,
    };
    setMessages(prev => [...prev, assistantMsg]);
    setIsStreaming(true);

    try {
      abortControllerRef.current = new AbortController();

      // Use the messaging API to send and stream response
      const response = await fetch('/api/messaging/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: 'website-demo',
          content,
          assistant: assistantKey,
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      // Handle streaming response
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (reader) {
        let buffer = '';
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.content) {
                  setMessages(prev =>
                    prev.map(m =>
                      m.id === assistantMsgId
                        ? { ...m, content: m.content + data.content }
                        : m
                    )
                  );
                }
              } catch {
                // Invalid JSON, skip
              }
            }
          }
        }
      }

      // Mark streaming complete
      setMessages(prev =>
        prev.map(m =>
          m.id === assistantMsgId
            ? { ...m, streaming: false }
            : m
        )
      );
    } catch (e) {
      // On error, show fallback message
      const errorMessage = e instanceof Error && e.name === 'AbortError'
        ? 'Message cancelled.'
        : 'Platform not connected. Start Symbia to enable live chat.';

      setMessages(prev =>
        prev.map(m =>
          m.id === assistantMsgId
            ? { ...m, content: errorMessage, streaming: false }
            : m
        )
      );
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  }, [assistantKey, isStreaming]);

  const cancelStream = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  return {
    messages,
    isStreaming,
    sendMessage,
    cancelStream,
    clearMessages,
  };
}

/**
 * Hook to fetch graphs/workflows from catalog
 */
export function useGraphs() {
  const [graphs, setGraphs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let mounted = true;

    async function fetchGraphs() {
      try {
        const catalog = createCatalogClient({ endpoint: '/svc/catalog' });
        const result = await catalog.listResources({ type: 'graph', status: 'published' });
        if (mounted) {
          setGraphs(result || []);
          setLoading(false);
        }
      } catch (e) {
        if (mounted) {
          setError(e instanceof Error ? e : new Error('Failed to fetch graphs'));
          setLoading(false);
        }
      }
    }

    fetchGraphs();
    return () => { mounted = false; };
  }, []);

  return { graphs, loading, error };
}
