/**
 * backend/src/utils/rate-limiter.ts
 *
 * LinkedIn rate limiter backed by Redis.
 *
 * Design decisions (DC-12, DC-07):
 * - Atomic check-and-increment via Redis Lua script to prevent race conditions.
 * - FAIL-CLOSED: if Redis is unreachable, check() returns false and ALL LinkedIn
 *   operations are blocked. Safety comes before availability when ban risk is high.
 * - Keys are namespaced by date/week so counters self-expire automatically.
 *
 * Redis key patterns:
 *   linkedin:daily:connections:<YYYY-MM-DD>   TTL 48h
 *   linkedin:weekly:connections:<YYYY-WNN>    TTL 8d
 *   linkedin:daily:messages:<YYYY-MM-DD>      TTL 48h
 *   linkedin:daily:profileViews:<YYYY-MM-DD>  TTL 48h
 *   linkedin:daily:searches:<YYYY-MM-DD>      TTL 48h
 */

import IORedis from 'ioredis';
import { todayISO, currentWeekISO } from './helpers';
import { logger } from './logger';

// ---------------------------------------------------------------------------
// Limits
// ---------------------------------------------------------------------------

interface RateLimits {
  connectionRequestsDaily: number;   // 21  (conservative: 150/week ÷ 7 ≈ 21)
  connectionRequestsWeekly: number;  // 150 (LinkedIn hard limit)
  messagesDaily: number;             // 25
  profileViewsDaily: number;         // 80
  searchesDaily: number;             // 10  (LinkedIn Free: ~10 results/query)
}

const LIMITS: RateLimits = {
  connectionRequestsDaily: 21,
  connectionRequestsWeekly: 150,
  messagesDaily: 25,
  profileViewsDaily: 80,
  searchesDaily: 10,
};

// TTLs (seconds)
const TTL_DAILY = 48 * 3600;    // 48 hours — survives midnight by a day
const TTL_WEEKLY = 8 * 86400;   // 8 days   — survives end-of-week by a day

// ---------------------------------------------------------------------------
// Action → key mapping
// ---------------------------------------------------------------------------

type Action =
  | 'connectionRequestsDaily'
  | 'connectionRequestsWeekly'
  | 'messagesDaily'
  | 'profileViewsDaily'
  | 'searchesDaily';

function buildKey(action: Action): string {
  switch (action) {
    case 'connectionRequestsDaily':
      return `linkedin:daily:connections:${todayISO()}`;
    case 'connectionRequestsWeekly':
      return `linkedin:weekly:connections:${currentWeekISO()}`;
    case 'messagesDaily':
      return `linkedin:daily:messages:${todayISO()}`;
    case 'profileViewsDaily':
      return `linkedin:daily:profileViews:${todayISO()}`;
    case 'searchesDaily':
      return `linkedin:daily:searches:${todayISO()}`;
  }
}

function getTTL(action: Action): number {
  return action === 'connectionRequestsWeekly' ? TTL_WEEKLY : TTL_DAILY;
}

function getLimit(action: Action): number {
  return LIMITS[action];
}

// ---------------------------------------------------------------------------
// Lua script — atomic check-and-increment
// ---------------------------------------------------------------------------

/**
 * Atomically checks the current value against the limit and, if under,
 * increments it and sets the TTL on first write.
 *
 * Returns:
 *   1  -> increment succeeded (was under limit)
 *   0  -> limit exceeded; value not changed
 */
const CHECK_AND_INCREMENT_LUA = `
local key   = KEYS[1]
local limit = tonumber(ARGV[1])
local ttl   = tonumber(ARGV[2])

local current = redis.call('GET', key)

if current and tonumber(current) >= limit then
  return 0
end

local new_val = redis.call('INCR', key)
if new_val == 1 then
  redis.call('EXPIRE', key, ttl)
end

return 1
`;

// ---------------------------------------------------------------------------
// LinkedInRateLimiter class
// ---------------------------------------------------------------------------

export class LinkedInRateLimiter {
  private redis: IORedis;

  constructor(redisInstance: IORedis) {
    this.redis = redisInstance;
  }

  // -------------------------------------------------------------------------
  // check(action)
  // Verify whether we are below the limit WITHOUT incrementing.
  // Returns false on Redis failure (FAIL-CLOSED, DC-07).
  // -------------------------------------------------------------------------
  async check(action: Action): Promise<boolean> {
    try {
      const key = buildKey(action);
      const limit = getLimit(action);
      const raw = await this.redis.get(key);
      const current = raw ? parseInt(raw, 10) : 0;
      return current < limit;
    } catch (err) {
      logger.error('RateLimiter.check: Redis error — blocking operation (fail-closed)', {
        action,
        error: (err as Error).message,
      });
      return false;  // FAIL-CLOSED
    }
  }

  // -------------------------------------------------------------------------
  // increment(action)
  // Increment the counter by 1. Does NOT check the limit.
  // Use tryIncrement() for atomic check+increment.
  // -------------------------------------------------------------------------
  async increment(action: Action): Promise<void> {
    try {
      const key = buildKey(action);
      const ttl = getTTL(action);
      const newVal = await this.redis.incr(key);
      if (newVal === 1) {
        await this.redis.expire(key, ttl);
      }
    } catch (err) {
      logger.error('RateLimiter.increment: Redis error', {
        action,
        error: (err as Error).message,
      });
    }
  }

  // -------------------------------------------------------------------------
  // tryIncrement(action)  — DC-12: atomic check-and-increment via Lua script
  // Returns true  if the operation was allowed and counter was incremented.
  // Returns false if the limit was already reached, or on Redis failure.
  // -------------------------------------------------------------------------
  async tryIncrement(action: Action): Promise<boolean> {
    try {
      const key = buildKey(action);
      const limit = getLimit(action);
      const ttl = getTTL(action);

      const result = await this.redis.eval(
        CHECK_AND_INCREMENT_LUA,
        1,       // numkeys
        key,     // KEYS[1]
        String(limit),  // ARGV[1]
        String(ttl),    // ARGV[2]
      ) as number;

      return result === 1;
    } catch (err) {
      logger.error('RateLimiter.tryIncrement: Redis error — blocking operation (fail-closed)', {
        action,
        error: (err as Error).message,
      });
      return false;  // FAIL-CLOSED
    }
  }

  // -------------------------------------------------------------------------
  // getRemaining(action)
  // Returns how many operations are still available for this period.
  // Returns 0 on Redis failure (fail-closed).
  // -------------------------------------------------------------------------
  async getRemaining(action: Action): Promise<number> {
    try {
      const key = buildKey(action);
      const limit = getLimit(action);
      const raw = await this.redis.get(key);
      const current = raw ? parseInt(raw, 10) : 0;
      return Math.max(0, limit - current);
    } catch (err) {
      logger.error('RateLimiter.getRemaining: Redis error', {
        action,
        error: (err as Error).message,
      });
      return 0;
    }
  }

  // -------------------------------------------------------------------------
  // getDailyUsage()
  // Returns a snapshot of all daily counters (for reporting / reconciliation).
  // -------------------------------------------------------------------------
  async getDailyUsage(): Promise<Record<string, number>> {
    const actions: Action[] = [
      'connectionRequestsDaily',
      'messagesDaily',
      'profileViewsDaily',
      'searchesDaily',
    ];

    const result: Record<string, number> = {};

    for (const action of actions) {
      try {
        const key = buildKey(action);
        const raw = await this.redis.get(key);
        result[action] = raw ? parseInt(raw, 10) : 0;
      } catch {
        result[action] = -1; // sentinel: unknown due to error
      }
    }

    return result;
  }

  // -------------------------------------------------------------------------
  // resetDaily()
  // Delete all daily keys. Called by cron job at midnight (00:00 daily).
  // -------------------------------------------------------------------------
  async resetDaily(): Promise<void> {
    const date = todayISO();
    const keys = [
      `linkedin:daily:connections:${date}`,
      `linkedin:daily:messages:${date}`,
      `linkedin:daily:profileViews:${date}`,
      `linkedin:daily:searches:${date}`,
    ];

    try {
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
      logger.info('RateLimiter: daily counters reset', { date });
    } catch (err) {
      logger.error('RateLimiter.resetDaily: failed', { error: (err as Error).message });
    }
  }

  // -------------------------------------------------------------------------
  // resetWeekly()
  // Delete the weekly connections key. Called by cron job every Monday 00:00.
  // -------------------------------------------------------------------------
  async resetWeekly(): Promise<void> {
    const week = currentWeekISO();
    const key = `linkedin:weekly:connections:${week}`;
    try {
      await this.redis.del(key);
      logger.info('RateLimiter: weekly counters reset', { week });
    } catch (err) {
      logger.error('RateLimiter.resetWeekly: failed', { error: (err as Error).message });
    }
  }

  // -------------------------------------------------------------------------
  // isHealthy()
  // Returns true if Redis is reachable. Used by health-check endpoint (DC-07).
  // -------------------------------------------------------------------------
  async isHealthy(): Promise<boolean> {
    try {
      const pong = await this.redis.ping();
      return pong === 'PONG';
    } catch {
      return false;
    }
  }
}

// ---------------------------------------------------------------------------
// Module-level singleton helpers
// These thin wrappers use the shared Redis connection exposed by queue.ts
// and are the entry points called by automation jobs.
// ---------------------------------------------------------------------------

let _limiter: LinkedInRateLimiter | null = null;

function getLimiter(): LinkedInRateLimiter {
  if (!_limiter) {
    // Lazy init: queue.ts must have been initialised before this is called.
    const { getRedisConnection } = require('../queue/queue') as {
      getRedisConnection: () => IORedis;
    };
    _limiter = new LinkedInRateLimiter(getRedisConnection());
  }
  return _limiter;
}

export async function checkLimit(action: Action): Promise<boolean> {
  return getLimiter().check(action);
}

export async function tryIncrementLimit(action: Action): Promise<boolean> {
  return getLimiter().tryIncrement(action);
}

export async function getRemainingLimit(action: Action): Promise<number> {
  return getLimiter().getRemaining(action);
}

export async function getDailyUsage(): Promise<Record<string, number>> {
  return getLimiter().getDailyUsage();
}

export async function resetDailyCounters(): Promise<void> {
  return getLimiter().resetDaily();
}

export async function resetWeeklyCounters(): Promise<void> {
  return getLimiter().resetWeekly();
}

export async function isRateLimiterHealthy(): Promise<boolean> {
  return getLimiter().isHealthy();
}
