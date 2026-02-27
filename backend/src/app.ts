/**
 * backend/src/app.ts
 *
 * Express application entry point.
 *
 * Responsibilities:
 *  - Bootstrap global middleware (helmet, compression, cors, body parsers, cookies)
 *  - Mount all API routes (public + protected)
 *  - Register the Unipile webhook route with HMAC signature validation (DC-02)
 *  - Serve the frontend SPA in production
 *  - Provide a real health endpoint that probes Postgres + Redis (DC-07)
 *  - Attach the WebSocket log-stream server
 *  - Initialise the cron scheduler after DB + Redis are confirmed ready
 *  - Graceful shutdown on SIGTERM / SIGINT
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import compression from 'compression';
import { createServer } from 'http';
import path from 'path';
import IORedis from 'ioredis';

// ---------------------------------------------------------------------------
// Route imports — named exports from each route module
// ---------------------------------------------------------------------------
import { authRoutes } from './api/routes/auth.routes';
import { agentsRoutes } from './api/routes/agents.routes';
import { identitiesRoutes } from './api/routes/identities.routes';
import { prospectsRoutes } from './api/routes/prospects.routes';
import { searchStructuresRoutes } from './api/routes/search-structures.routes';
import { analyticsRoutes } from './api/routes/analytics.routes';
import { logsRoutes } from './api/routes/logs.routes';
import { settingsRoutes } from './api/routes/settings.routes';

// ---------------------------------------------------------------------------
// Middleware imports
// ---------------------------------------------------------------------------
import { authMiddleware } from './api/middleware/auth.middleware';
import { validateUnipileSignature } from './api/middleware/webhook-signature.middleware';
import { loginRateLimit } from './api/middleware/rateLimit.middleware';

// ---------------------------------------------------------------------------
// Integration / utility imports
// ---------------------------------------------------------------------------
import { handleWebhookEvent, UnipileWebhookPayload } from './integrations/unipile/unipile.webhook';
import { setupWebSocket } from './websocket/log-stream';
import { initScheduler } from './utils/scheduler';
import { logger } from './utils/logger';

// ---------------------------------------------------------------------------
// Prisma client (simple singleton — no initPrisma wrapper needed)
// ---------------------------------------------------------------------------
import { db } from './db/prisma.client';

// ---------------------------------------------------------------------------
// Redis health singleton (lazy, used only by /api/health)
// ---------------------------------------------------------------------------

let _healthRedis: IORedis | null = null;

function getHealthRedis(): IORedis {
  if (!_healthRedis) {
    _healthRedis = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
      lazyConnect: true,
      // Single attempt — health check must not block the response
      maxRetriesPerRequest: 1,
      connectTimeout: 3_000,
    });
    _healthRedis.on('error', () => {
      // Suppress uncaught errors; the health endpoint handles them explicitly
    });
  }
  return _healthRedis;
}

// ---------------------------------------------------------------------------
// App factory
// ---------------------------------------------------------------------------

const app = express();
const PORT = Number(process.env.PORT) || 3001;

// ── Global middleware ────────────────────────────────────────────────────────

app.use(helmet());
app.use(compression() as express.RequestHandler);
app.use(
  cors({
    // In production the frontend is served from the same origin, so reflect
    // the request origin only in development.
    origin:
      process.env.NODE_ENV === 'production'
        ? false
        : (process.env.CORS_ORIGIN ?? process.env.DASHBOARD_URL ?? 'http://localhost:3000'),
    credentials: true, // DC-01: required for HttpOnly cookie auth
  }),
);

// DC-02: The webhook route needs the raw body for HMAC verification.
// We capture it into req.rawBody via the `verify` callback on express.json,
// and also register express.raw as a fallback for that specific path.
app.use(
  express.json({
    limit: '1mb', // DC: reduced from 10 mb — API payloads are small
    verify: (req: Request & { rawBody?: Buffer }, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

// express.raw for the webhook path so the signature middleware always has
// a Buffer regardless of Content-Type.
app.use(
  '/api/webhooks',
  express.raw({
    type: '*/*',
    limit: '1mb',
    verify: (req: Request & { rawBody?: Buffer }, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(cookieParser()); // DC-01: parse HttpOnly JWT cookie

// ── DC-07: Health endpoint (unauthenticated) ────────────────────────────────

app.get('/api/health', async (_req: Request, res: Response) => {
  const startTime = process.hrtime.bigint();

  // Probe Postgres
  let postgresOk = false;
  try {
    await db.$queryRaw`SELECT 1`;
    postgresOk = true;
  } catch (err) {
    logger.warn('Health check: Postgres probe failed', {
      error: (err as Error).message,
    });
  }

  // Probe Redis
  let redisOk = false;
  try {
    const redis = getHealthRedis();
    const pong = await redis.ping();
    redisOk = pong === 'PONG';
  } catch (err) {
    logger.warn('Health check: Redis probe failed', {
      error: (err as Error).message,
    });
  }

  const healthy = postgresOk && redisOk;
  const durationMs = Number(process.hrtime.bigint() - startTime) / 1_000_000;

  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'ok' : 'degraded',
    postgres: postgresOk,
    redis: redisOk,
    uptime: Math.floor(process.uptime()),
    responseTimeMs: Math.round(durationMs),
  });
});

// ── Public auth routes (with login rate limiting) ────────────────────────────

app.use('/api/auth', loginRateLimit, authRoutes);

// ── DC-02: Unipile webhook (HMAC-SHA256 validated) ───────────────────────────

app.post(
  '/api/webhooks/unipile',
  validateUnipileSignature,
  async (req: Request, res: Response) => {
    try {
      await handleWebhookEvent(req.body as UnipileWebhookPayload);
      res.json({ ok: true });
    } catch (err) {
      logger.error('Webhook handler error', {
        action: 'webhook_handler_error',
        error: (err as Error).message,
      });
      res.status(500).json({ error: 'Webhook processing failed' });
    }
  },
);

// ── Protected API routes (require valid JWT cookie) ─────────────────────────

app.use('/api/agents', authMiddleware, agentsRoutes);
app.use('/api/identities', authMiddleware, identitiesRoutes);
app.use('/api/prospects', authMiddleware, prospectsRoutes);
app.use('/api/search-structures', authMiddleware, searchStructuresRoutes);
app.use('/api/analytics', authMiddleware, analyticsRoutes);
app.use('/api/logs', authMiddleware, logsRoutes);
app.use('/api/settings', authMiddleware, settingsRoutes);

// ── Serve frontend SPA in production ────────────────────────────────────────

if (process.env.NODE_ENV === 'production') {
  const distPath = path.join(__dirname, '../../frontend/dist');
  app.use(express.static(distPath));

  // SPA fallback: all non-API GET requests return index.html
  app.get('*', (req: Request, res: Response) => {
    // Don't override API 404s
    if (req.path.startsWith('/api/')) {
      res.status(404).json({ error: 'API endpoint not found' });
      return;
    }
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// ── Global error handler (must be last middleware) ──────────────────────────

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error('Unhandled error', {
    action: 'unhandled_error',
    error: err.message,
    stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined,
  });
  res.status(500).json({ error: 'Internal server error' });
});

// ---------------------------------------------------------------------------
// HTTP server + WebSocket
// ---------------------------------------------------------------------------

const server = createServer(app);

// Attach WebSocket log-stream server (DC-01: ticket-based WS auth)
setupWebSocket(server);

// ---------------------------------------------------------------------------
// Bootstrap: start listening + initialise scheduler
// ---------------------------------------------------------------------------

async function bootstrap(): Promise<void> {
  // DC-07: Verify Postgres is reachable before accepting traffic
  try {
    await db.$queryRaw`SELECT 1`;
    logger.info('Postgres connection verified');
  } catch (err) {
    logger.error('Postgres connection failed on startup', {
      error: (err as Error).message,
    });
    process.exit(1);
  }

  // DC-07: Verify Redis is reachable (10s startup timeout)
  try {
    await Promise.race<unknown>([
      getHealthRedis().ping(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Redis connection timeout after 10s')), 10_000),
      ),
    ]);
    logger.info('Redis connection verified');
  } catch (err) {
    logger.error('Redis startup failed', {
      error: (err as Error).message,
    });

    // Attempt Telegram alert (non-fatal if Telegram is not configured)
    try {
      const { telegramBot } = await import('./integrations/telegram/telegram.bot');
      await telegramBot
        .sendAlert(`Redis startup failed: ${(err as Error).message}`)
        .catch(() => {});
    } catch {
      // Telegram not configured — ignore
    }

    process.exit(1);
  }

  server.listen(PORT, async () => {
    logger.info(`Server running on port ${PORT}`, {
      action: 'server_start',
      port: PORT,
      env: process.env.NODE_ENV ?? 'development',
    });

    try {
      await initScheduler();
      logger.info('Scheduler initialized');
    } catch (err) {
      // A scheduler init failure is logged but does not crash the server —
      // the HTTP API must remain available even if cron setup fails.
      logger.error('Scheduler initialization failed', {
        action: 'scheduler_init_error',
        error: (err as Error).message,
      });
    }
  });
}

bootstrap().catch((err: unknown) => {
  logger.error('Fatal error during bootstrap', {
    action: 'bootstrap_fatal',
    error: (err as Error).message,
    stack: (err as Error).stack,
  });
  process.exit(1);
});

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

function shutdown(signal: string): void {
  logger.info(`${signal} received — shutting down gracefully`);

  server.close((err) => {
    if (err) {
      logger.error('Error during server close', { error: (err as Error).message });
      process.exit(1);
    }

    // Flush any buffered logs before exit
    import('./utils/logger')
      .then(({ flushLogs }) => flushLogs())
      .catch(() => {})
      .finally(() => {
        logger.info('Server shut down cleanly');
        process.exit(0);
      });
  });

  // Force-exit if graceful shutdown stalls beyond 15 seconds
  setTimeout(() => {
    logger.warn('Graceful shutdown timed out — forcing exit');
    process.exit(1);
  }, 15_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// ---------------------------------------------------------------------------
// Export app for testing
// ---------------------------------------------------------------------------

export default app;
