/**
 * useLiveLog — WebSocket hook for real-time log streaming.
 *
 * Security (DC-01):
 *   - Does NOT pass the JWT in the URL or headers.
 *   - Requests a short-lived single-use ticket via POST /api/auth/ws-ticket
 *     (the HttpOnly auth cookie is sent automatically by the browser).
 *   - The ticket is a 30-second nonce stored in Redis; the server deletes it
 *     immediately after first use.
 *
 * Reconnection:
 *   - Up to MAX_RETRIES attempts with exponential back-off (1s, 2s, 4s).
 *   - Reconnect is aborted if the component unmounts.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '@/lib/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  agentId?: string;
  jobId?: string;
  action?: string;
  message: string;
  meta?: Record<string, unknown>;
}

export interface LiveLogFilters {
  agentId?: string;
  jobId?: string;
  level?: LogLevel;
}

export interface UseLiveLogReturn {
  logs: LogEntry[];
  isConnected: boolean;
  connect: () => void;
  disconnect: () => void;
  clear: () => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_LOG_BUFFER = 500;
const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 1000;

function getWsBaseUrl(): string {
  const apiUrl = import.meta.env.VITE_API_URL as string | undefined;
  if (apiUrl) {
    // Convert http(s):// to ws(s)://
    return apiUrl.replace(/^http/, 'ws').replace(/\/api$/, '');
  }
  // Derive from current window location
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${window.location.host}`;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useLiveLog(
  filters: LiveLogFilters = {},
  autoConnect = false,
): UseLiveLogReturn {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isConnected, setIsConnected] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const shouldConnectRef = useRef(autoConnect);

  // Keep a stable reference to filters for reconnect logic
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  const clearRetryTimer = () => {
    if (retryTimerRef.current !== null) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  };

  const closeSocket = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.onclose = null; // prevent reconnect loop
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsConnected(false);
  }, []);

  const openSocket = useCallback(async () => {
    if (!mountedRef.current) return;

    // Acquire a single-use WebSocket ticket
    let ticket: string;
    try {
      const res = await api.post<{ ticket: string }>('/auth/ws-ticket');
      ticket = res.ticket;
    } catch {
      // Auth failed or server unreachable — schedule retry
      if (retryCountRef.current < MAX_RETRIES && mountedRef.current) {
        const delay = BASE_BACKOFF_MS * Math.pow(2, retryCountRef.current);
        retryCountRef.current += 1;
        retryTimerRef.current = setTimeout(() => {
          void openSocket();
        }, delay);
      }
      return;
    }

    if (!mountedRef.current) return;

    const params = new URLSearchParams({ ticket });
    const f = filtersRef.current;
    if (f.agentId) params.set('agentId', f.agentId);
    if (f.jobId) params.set('jobId', f.jobId);
    if (f.level) params.set('level', f.level);

    const url = `${getWsBaseUrl()}/ws/logs?${params.toString()}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      if (!mountedRef.current) {
        ws.close();
        return;
      }
      retryCountRef.current = 0;
      setIsConnected(true);
    };

    ws.onmessage = (event: MessageEvent) => {
      if (!mountedRef.current) return;
      try {
        const entry: LogEntry = JSON.parse(event.data as string);
        setLogs((prev) => [entry, ...prev].slice(0, MAX_LOG_BUFFER));
      } catch {
        // Ignore malformed messages
      }
    };

    ws.onerror = () => {
      // onerror is always followed by onclose; handle reconnect there
    };

    ws.onclose = () => {
      if (!mountedRef.current) return;
      setIsConnected(false);
      wsRef.current = null;

      if (shouldConnectRef.current && retryCountRef.current < MAX_RETRIES) {
        const delay = BASE_BACKOFF_MS * Math.pow(2, retryCountRef.current);
        retryCountRef.current += 1;
        retryTimerRef.current = setTimeout(() => {
          void openSocket();
        }, delay);
      }
    };
  }, []);

  const connect = useCallback(() => {
    shouldConnectRef.current = true;
    retryCountRef.current = 0;
    clearRetryTimer();
    closeSocket();
    void openSocket();
  }, [closeSocket, openSocket]);

  const disconnect = useCallback(() => {
    shouldConnectRef.current = false;
    clearRetryTimer();
    closeSocket();
  }, [closeSocket]);

  const clear = useCallback(() => {
    setLogs([]);
  }, []);

  // Auto-connect on mount if requested
  useEffect(() => {
    mountedRef.current = true;

    if (autoConnect) {
      void openSocket();
    }

    return () => {
      mountedRef.current = false;
      shouldConnectRef.current = false;
      clearRetryTimer();
      closeSocket();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reconnect when filters change (only if currently connected)
  useEffect(() => {
    if (isConnected) {
      connect();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.agentId, filters.jobId, filters.level]);

  return { logs, isConnected, connect, disconnect, clear };
}
