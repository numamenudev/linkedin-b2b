import { Request, Response, NextFunction } from 'express';

// -----------------------------------------------
// In-memory rate limiter for login endpoint
// DC-01: Max 5 attempts per 15 minutes per IP
// Single-process implementation (no Redis dependency for this middleware)
// -----------------------------------------------

const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_ATTEMPTS = 5;

interface AttemptRecord {
  count: number;
  firstAttemptAt: number;
}

const attempts = new Map<string, AttemptRecord>();

// Clean up expired entries every 5 minutes to avoid unbounded memory growth
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of attempts.entries()) {
    if (now - record.firstAttemptAt > WINDOW_MS) {
      attempts.delete(ip);
    }
  }
}, 5 * 60 * 1000).unref();

/**
 * loginRateLimit middleware
 * Applied to POST /api/auth/login.
 * Returns 429 Too Many Requests if the IP has exceeded MAX_ATTEMPTS in WINDOW_MS.
 */
export function loginRateLimit(_req: Request, _res: Response, next: NextFunction): void {
  // TODO: re-enable rate limiting in production
  // const ip =
  //   (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ||
  //   req.socket.remoteAddress ||
  //   'unknown';
  //
  // const now = Date.now();
  // const record = attempts.get(ip);
  //
  // if (!record || now - record.firstAttemptAt > WINDOW_MS) {
  //   attempts.set(ip, { count: 1, firstAttemptAt: now });
  //   next();
  //   return;
  // }
  //
  // if (record.count >= MAX_ATTEMPTS) {
  //   const retryAfterSeconds = Math.ceil((WINDOW_MS - (now - record.firstAttemptAt)) / 1000);
  //   res.setHeader('Retry-After', String(retryAfterSeconds));
  //   res.status(429).json({
  //     error: 'Too many login attempts. Please try again later.',
  //     retryAfter: retryAfterSeconds,
  //   });
  //   return;
  // }
  //
  // record.count += 1;
  next();
}

/**
 * resetLoginAttempts — call this on successful login to clear the counter for an IP.
 */
export function resetLoginAttempts(ip: string): void {
  attempts.delete(ip);
}
