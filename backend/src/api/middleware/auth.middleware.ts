/**
 * backend/src/api/middleware/auth.middleware.ts
 *
 * DC-01: JWT authentication via HttpOnly cookie.
 *
 * - Reads JWT from the 'token' cookie (never from Authorization header).
 * - Verifies the token with jsonwebtoken.
 * - Checks a Redis blacklist to reject invalidated tokens (logout / refresh).
 * - Attaches the decoded user payload to req.user on success.
 *
 * Exports:
 *   authMiddleware  — fails with 401 if cookie is absent or token is invalid.
 *   optionalAuth    — same pipeline, but calls next() silently when no cookie is present.
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import IORedis from 'ioredis';
import { logger } from '../../utils/logger';

// ---------------------------------------------------------------------------
// Augment Express Request to carry the authenticated user
// ---------------------------------------------------------------------------

export interface AuthUser {
  userId: string;
  email: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

// ---------------------------------------------------------------------------
// Redis client (lazy singleton — reuses instance across imports)
// ---------------------------------------------------------------------------

let _redis: IORedis | null = null;

function getRedis(): IORedis {
  if (!_redis) {
    _redis = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
    });

    _redis.on('error', (err) => {
      logger.warn('auth.middleware: Redis connection error', { error: err.message });
    });
  }
  return _redis;
}

// ---------------------------------------------------------------------------
// Exported singleton for use in auth.routes (blacklisting, ws-ticket)
// ---------------------------------------------------------------------------

export function getAuthRedis(): IORedis {
  return getRedis();
}

// ---------------------------------------------------------------------------
// Blacklist helpers
// ---------------------------------------------------------------------------

/** Redis key for a blacklisted JWT JTI or full token hash. */
function blacklistKey(token: string): string {
  return `jwt:blacklist:${token}`;
}

/**
 * Check whether a raw token string has been blacklisted.
 * Returns false on Redis error (fail-open for auth checks — a brief Redis
 * outage should not lock all users out; logout tokens re-expire anyway).
 */
async function isBlacklisted(token: string): Promise<boolean> {
  try {
    const redis = getRedis();
    const val = await redis.get(blacklistKey(token));
    return val !== null;
  } catch (err) {
    logger.warn('auth.middleware: Redis error checking blacklist — allowing request', {
      error: (err as Error).message,
    });
    return false;
  }
}

/**
 * Add a token to the Redis blacklist with the given TTL (seconds).
 * Used by auth.routes for logout and token refresh.
 */
export async function blacklistToken(token: string, ttlSeconds: number): Promise<void> {
  if (ttlSeconds <= 0) return;
  try {
    const redis = getRedis();
    await redis.set(blacklistKey(token), '1', 'EX', ttlSeconds);
  } catch (err) {
    logger.warn('auth.middleware: Redis error blacklisting token', {
      error: (err as Error).message,
    });
  }
}

// ---------------------------------------------------------------------------
// Core verification logic
// ---------------------------------------------------------------------------

interface VerifyResult {
  user: AuthUser;
  token: string;
}

async function verifyRequest(req: Request): Promise<VerifyResult | null> {
  const token: string | undefined = req.cookies?.token;

  if (!token) return null;

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    logger.error('auth.middleware: JWT_SECRET is not configured');
    return null;
  }

  let decoded: jwt.JwtPayload;
  try {
    decoded = jwt.verify(token, secret) as jwt.JwtPayload;
  } catch (err) {
    logger.debug('auth.middleware: JWT verification failed', {
      error: (err as Error).message,
    });
    return null;
  }

  if (!decoded.userId || !decoded.email) {
    logger.debug('auth.middleware: JWT payload missing required fields');
    return null;
  }

  const blacklisted = await isBlacklisted(token);
  if (blacklisted) {
    logger.debug('auth.middleware: token is blacklisted');
    return null;
  }

  return {
    user: { userId: decoded.userId as string, email: decoded.email as string },
    token,
  };
}

// ---------------------------------------------------------------------------
// Exported middleware
// ---------------------------------------------------------------------------

/**
 * authMiddleware
 * Requires a valid JWT in the 'token' HttpOnly cookie.
 * Returns 401 if the cookie is absent, the token is invalid, or it has been
 * blacklisted (e.g. after logout or refresh).
 */
export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const result = await verifyRequest(req);

  if (!result) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  req.user = result.user;
  next();
}

/**
 * optionalAuth
 * Same as authMiddleware, but silently continues when no cookie is present.
 * Useful for endpoints that behave differently for authenticated vs anonymous
 * callers (e.g. public health-check with optional user context).
 */
export async function optionalAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const result = await verifyRequest(req);

  if (result) {
    req.user = result.user;
  }

  next();
}
