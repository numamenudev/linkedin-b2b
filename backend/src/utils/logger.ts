/**
 * backend/src/utils/logger.ts
 * Winston logger with JSON formatting, console transport, file transports,
 * and a buffered custom transport that persists logs to the OperationLog DB table.
 */

import winston from 'winston';
import path from 'path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LogOperationParams {
  agentId?: string | null;
  level: string;
  job?: string | null;
  action: string;
  message: string;
  meta?: Record<string, unknown> | null;
}

// ---------------------------------------------------------------------------
// Log directory
// ---------------------------------------------------------------------------

const LOG_DIR = path.resolve(process.cwd(), 'logs');

// ---------------------------------------------------------------------------
// DB-buffered custom transport
// ---------------------------------------------------------------------------

/**
 * Buffered DB transport.
 * Collects log entries and flushes them to the OperationLog table in batches
 * so that DB writes do not block the hot path.
 *
 * We use a lazy import for the Prisma client to avoid circular-dependency
 * issues during startup.
 */

interface BufferedEntry {
  agentId?: string | null;
  level: string;
  job?: string | null;
  action: string;
  message: string;
  meta?: Record<string, unknown> | null;
  createdAt: Date;
}

const DB_BUFFER: BufferedEntry[] = [];
const FLUSH_INTERVAL_MS = 2_000; // flush every 2 seconds
const FLUSH_BATCH_SIZE = 50;     // or when batch reaches this size

let flushTimer: ReturnType<typeof setInterval> | null = null;
let dbAvailable = true;

async function flushBuffer(): Promise<void> {
  if (DB_BUFFER.length === 0 || !dbAvailable) return;

  const batch = DB_BUFFER.splice(0, FLUSH_BATCH_SIZE);
  try {
    // Lazy import to avoid circular deps at startup
    const { getDb } = await import('../db/prisma.client');
    const db = getDb();
    await db.operationLog.createMany({
      data: batch.map((entry) => ({
        agentId: entry.agentId ?? null,
        level: entry.level,
        job: entry.job ?? null,
        action: entry.action,
        message: entry.message,
        meta: entry.meta ?? undefined,
        createdAt: entry.createdAt,
      })),
      skipDuplicates: true,
    });

    // Broadcast to any connected WebSocket clients
    try {
      const { broadcastLog } = await import('../websocket/log-stream');
      for (const entry of batch) {
        broadcastLog(entry);
      }
    } catch {
      // WebSocket not yet initialised — silently ignore
    }
  } catch (err) {
    // Push back the batch so we don't lose the entries, but cap total buffer size
    if (DB_BUFFER.length < 500) {
      DB_BUFFER.unshift(...batch);
    }
    // Avoid log loops: write directly to stderr
    process.stderr.write(`[logger] DB flush failed: ${(err as Error).message}\n`);
  }
}

function ensureFlushTimer(): void {
  if (flushTimer) return;
  flushTimer = setInterval(() => {
    flushBuffer().catch(() => {});
  }, FLUSH_INTERVAL_MS);
  // Don't prevent Node from exiting
  if (flushTimer.unref) flushTimer.unref();
}

/**
 * Push a structured entry into the in-memory buffer.
 * Called both from the public `logOperation` helper and from the custom
 * Winston transport below.
 */
function bufferEntry(entry: BufferedEntry): void {
  ensureFlushTimer();
  DB_BUFFER.push(entry);
  if (DB_BUFFER.length >= FLUSH_BATCH_SIZE) {
    flushBuffer().catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// Custom Winston Transport
// ---------------------------------------------------------------------------

class DbTransport extends winston.transports.Stream {
  constructor() {
    // Pipe to a null-sink stream; we handle writes ourselves
    const { Writable } = require('stream');
    const sink = new Writable({ write: (_c: unknown, _e: unknown, cb: () => void) => cb() });
    super({ stream: sink });
    this.level = 'info';
  }

  override log(info: winston.Logform.TransformableInfo, callback: () => void): void {
    setImmediate(() => {
      try {
        bufferEntry({
          agentId: (info as Record<string, unknown>).agentId as string | undefined,
          level: info.level,
          job: (info as Record<string, unknown>).job as string | undefined,
          action: ((info as Record<string, unknown>).action as string) || 'log',
          message: info.message,
          meta: (info as Record<string, unknown>).meta as Record<string, unknown> | undefined,
          createdAt: new Date(),
        });
      } catch {
        // never throw from transport
      }
    });
    callback();
  }
}

// ---------------------------------------------------------------------------
// Winston logger instance
// ---------------------------------------------------------------------------

const { combine, timestamp, json, colorize, printf } = winston.format;

const isDev = process.env.NODE_ENV !== 'production';

const consoleFormat = combine(
  colorize({ all: true }),
  timestamp({ format: 'HH:mm:ss' }),
  printf(({ timestamp: ts, level, message, ...rest }) => {
    const extra = Object.keys(rest).length ? ` ${JSON.stringify(rest)}` : '';
    return `${ts} [${level}] ${message}${extra}`;
  }),
);

const jsonFormat = combine(timestamp(), json());

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  defaultMeta: { service: 'linkedin-b2b' },
  transports: [
    // Console — colorized in dev, plain JSON in prod
    new winston.transports.Console({
      format: isDev ? consoleFormat : jsonFormat,
    }),
    // File: errors only
    new winston.transports.File({
      filename: path.join(LOG_DIR, 'error.log'),
      level: 'error',
      format: jsonFormat,
      maxsize: 10 * 1024 * 1024,  // 10 MB
      maxFiles: 5,
    }),
    // File: all levels combined
    new winston.transports.File({
      filename: path.join(LOG_DIR, 'combined.log'),
      format: jsonFormat,
      maxsize: 20 * 1024 * 1024,  // 20 MB
      maxFiles: 5,
    }),
    // DB buffered transport
    new DbTransport(),
  ],
  exceptionHandlers: [
    new winston.transports.File({ filename: path.join(LOG_DIR, 'exceptions.log') }),
  ],
  rejectionHandlers: [
    new winston.transports.File({ filename: path.join(LOG_DIR, 'rejections.log') }),
  ],
});

// ---------------------------------------------------------------------------
// Public helper: logOperation
// ---------------------------------------------------------------------------

/**
 * Structured log helper used by agents and automation jobs.
 * Writes to Winston (and thus to console + files + DB buffer).
 */
export function logOperation(
  agentId: string | null | undefined,
  level: 'info' | 'warn' | 'error' | 'debug',
  job: string | null | undefined,
  action: string,
  message: string,
  meta?: Record<string, unknown> | null,
): void {
  logger.log(level, message, {
    agentId: agentId ?? undefined,
    job: job ?? undefined,
    action,
    meta: meta ?? undefined,
  });
}

// ---------------------------------------------------------------------------
// Expose control hooks (used in tests / graceful shutdown)
// ---------------------------------------------------------------------------

export function setDbAvailable(available: boolean): void {
  dbAvailable = available;
}

export async function flushLogs(): Promise<void> {
  await flushBuffer();
}
