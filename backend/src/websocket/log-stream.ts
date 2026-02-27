/**
 * backend/src/websocket/log-stream.ts
 *
 * WebSocket server for live log streaming to the frontend.
 *
 * DC-01: Authentication via short-lived single-use Redis ticket.
 * Client calls POST /api/auth/ws-ticket to obtain a 30-second nonce stored
 * in Redis as ws:ticket:<nonce> -> userId.
 * WS connects with: /ws/logs?ticket=<nonce>[&agentId=<id>][&level=<level>]
 *
 * Security:
 *   - Ticket read from query param, verified in Redis (key ws:ticket:<ticket>)
 *   - Ticket deleted immediately after validation (single-use / monouso)
 *   - Max MAX_CONNECTIONS simultaneous WebSocket connections
 *
 * Backpressure:
 *   - Each client has a send queue of up to MAX_BUFFER messages
 *   - When the queue is full, the oldest message is dropped (ring buffer)
 *   - If the underlying socket is not OPEN the entry is discarded
 *
 * Filtering:
 *   - agentId and level are read from query params at connect time
 *   - Client may send { type: 'setFilters', agentId?, level? } at any time
 *     to update filters without reconnecting
 *
 * Exports: setupWebSocket(server), broadcastLog(logEntry)
 * Alias:   initWebSocket(server) — kept for back-compat
 */

import { Server as HttpServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { logger } from '../utils/logger';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum simultaneous WebSocket connections. */
const MAX_CONNECTIONS = 10;

/** Maximum messages buffered per client before oldest are dropped. */
const MAX_BUFFER = 100;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LogEntry {
  agentId?: string | null;
  level: string;
  job?: string | null;
  action: string;
  message: string;
  meta?: Record<string, unknown> | null;
  createdAt?: Date;
}

interface ClientFilters {
  agentId: string | null;
  level: string | null;
}

interface ExtendedWebSocket extends WebSocket {
  /** Filters applied to incoming log entries. */
  filters: ClientFilters;
  /** Per-client outbound message queue (backpressure). */
  sendQueue: string[];
  /** Guard to prevent concurrent flushQueue calls. */
  isFlushing: boolean;
}

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

let wss: WebSocketServer | undefined;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Lazy import of the shared Redis connection.
 * Using require() keeps this synchronous and avoids circular-dep issues.
 */
function getRedis(): import('ioredis').default {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { getRedisConnection } = require('../queue/queue') as {
    getRedisConnection: () => import('ioredis').default;
  };
  return getRedisConnection();
}

/** Flush pending messages from the per-client queue. */
function flushQueue(client: ExtendedWebSocket): void {
  if (client.isFlushing) return;
  client.isFlushing = true;

  while (client.sendQueue.length > 0) {
    if (client.readyState !== WebSocket.OPEN) {
      client.sendQueue = [];
      break;
    }
    const msg = client.sendQueue.shift()!;
    client.send(msg, (err) => {
      if (err) {
        logger.warn('log-stream: send error', { error: err.message });
      }
    });
  }

  client.isFlushing = false;
}

/**
 * Enqueue a message for a client, dropping the oldest if the buffer is full.
 */
function enqueue(client: ExtendedWebSocket, data: string): void {
  if (client.readyState !== WebSocket.OPEN) return;

  if (client.sendQueue.length >= MAX_BUFFER) {
    // Drop oldest (ring-buffer behaviour)
    client.sendQueue.shift();
  }
  client.sendQueue.push(data);
  setImmediate(() => flushQueue(client));
}

/**
 * Returns true if the log entry matches the client's current filters.
 */
function matchesFilters(entry: object, filters: ClientFilters): boolean {
  const e = entry as Record<string, unknown>;
  if (filters.agentId !== null && e['agentId'] !== filters.agentId) return false;
  if (filters.level !== null && e['level'] !== filters.level) return false;
  return true;
}

// ---------------------------------------------------------------------------
// setupWebSocket
// ---------------------------------------------------------------------------

/**
 * Attach a WebSocket server to the given HTTP server.
 * Must be called once from server.ts / index.ts after `http.createServer(app)`.
 *
 * @param server  The Node.js HTTP server wrapping the Express app
 */
export function setupWebSocket(server: HttpServer): void {
  if (wss) {
    logger.warn('log-stream: setupWebSocket called more than once — ignoring');
    return;
  }

  wss = new WebSocketServer({ server, path: '/ws/logs' });
  logger.info('log-stream: WebSocket server attached at /ws/logs');

  wss.on('connection', async (rawWs, req) => {
    // ----------------------------------------------------------------
    // Connection-count guard
    // ----------------------------------------------------------------
    const currentCount = wss!.clients.size;
    if (currentCount > MAX_CONNECTIONS) {
      logger.warn('log-stream: max connections reached, rejecting', {
        max: MAX_CONNECTIONS,
        current: currentCount,
      });
      rawWs.close(4029, 'Too many connections');
      return;
    }

    // ----------------------------------------------------------------
    // Parse query parameters
    // ----------------------------------------------------------------
    let url: URL;
    try {
      url = new URL(req.url ?? '', `http://${req.headers.host ?? 'localhost'}`);
    } catch {
      rawWs.close(4000, 'Bad request');
      return;
    }

    const ticket = url.searchParams.get('ticket');
    if (!ticket) {
      rawWs.close(4001, 'Missing ticket');
      return;
    }

    // ----------------------------------------------------------------
    // DC-01: Ticket validation — single-use Redis nonce
    // ----------------------------------------------------------------
    try {
      const redis = getRedis();
      const userId = await redis.get(`ws:ticket:${ticket}`);

      if (!userId) {
        logger.warn('log-stream: invalid or expired ticket rejected', {
          ticketPrefix: ticket.slice(0, 8),
        });
        rawWs.close(4001, 'Invalid or expired ticket');
        return;
      }

      // Invalidate immediately (monouso / single-use)
      await redis.del(`ws:ticket:${ticket}`);
      logger.info('log-stream: client authenticated', { userId });
    } catch (err) {
      logger.error('log-stream: Redis error during ticket validation', {
        error: (err as Error).message,
      });
      rawWs.close(4001, 'Unauthorized');
      return;
    }

    // ----------------------------------------------------------------
    // Initialise extended client state with filters from query params
    // ----------------------------------------------------------------
    const client = rawWs as ExtendedWebSocket;
    client.filters = {
      agentId: url.searchParams.get('agentId'),
      level: url.searchParams.get('level'),
    };
    client.sendQueue = [];
    client.isFlushing = false;

    logger.info('log-stream: client connected', {
      filters: client.filters,
      totalClients: wss!.clients.size,
    });

    // Acknowledge successful connection
    client.send(JSON.stringify({ type: 'auth', status: 'ok' }));

    // ----------------------------------------------------------------
    // Heartbeat
    // ----------------------------------------------------------------
    client.on('ping', () => {
      client.pong();
    });

    // ----------------------------------------------------------------
    // Incoming messages — allow filter updates without reconnect
    // ----------------------------------------------------------------
    client.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as Record<string, unknown>;
        if (msg['type'] === 'setFilters') {
          client.filters = {
            agentId: typeof msg['agentId'] === 'string' ? msg['agentId'] : null,
            level: typeof msg['level'] === 'string' ? msg['level'] : null,
          };
          logger.debug('log-stream: client updated filters', { filters: client.filters });
        }
      } catch {
        // Ignore malformed client messages
      }
    });

    // ----------------------------------------------------------------
    // Cleanup on disconnect
    // ----------------------------------------------------------------
    client.on('close', (code, reason) => {
      client.sendQueue = [];
      logger.info('log-stream: client disconnected', {
        code,
        reason: reason.toString(),
        remainingClients: wss!.clients.size,
      });
    });

    client.on('error', (err) => {
      logger.warn('log-stream: client error', { error: err.message });
      client.sendQueue = [];
    });
  });

  wss.on('error', (err) => {
    logger.error('log-stream: server error', { error: err.message });
  });
}

// ---------------------------------------------------------------------------
// broadcastLog
// ---------------------------------------------------------------------------

/**
 * Send a log entry to all connected WebSocket clients whose filters match.
 *
 * Backpressure: each client maintains a queue of up to MAX_BUFFER messages.
 * When the queue is full the oldest message is silently dropped.
 *
 * This function is intentionally non-throwing so it never disrupts the logger.
 *
 * @param logEntry  The structured log entry to broadcast
 */
export function broadcastLog(logEntry: LogEntry): void {
  if (!wss || wss.clients.size === 0) return;

  let serialized: string;
  try {
    serialized = JSON.stringify({
      type: 'log',
      ...logEntry,
      createdAt: logEntry.createdAt?.toISOString() ?? new Date().toISOString(),
    });
  } catch {
    return;
  }

  wss.clients.forEach((rawClient) => {
    try {
      const client = rawClient as ExtendedWebSocket;
      if (client.readyState !== WebSocket.OPEN) return;
      if (!matchesFilters(logEntry, client.filters ?? { agentId: null, level: null })) return;
      enqueue(client, serialized);
    } catch {
      // Never propagate broadcast errors
    }
  });
}

// ---------------------------------------------------------------------------
// Back-compat alias (referenced in design doc section 4.8 as initWebSocket)
// ---------------------------------------------------------------------------

/** @deprecated Prefer setupWebSocket — kept for back-compat with server.ts */
export const initWebSocket = setupWebSocket;
