/**
 * backend/src/utils/job-lock.ts
 *
 * Distributed job locking via Redis SETNX (DC-08).
 *
 * Guarantees that a named job runs at most once at a time, even if multiple
 * processes or cron ticks race to start it (relevant for future horizontal
 * scaling, and for protecting against cron overlap in a single process restart
 * scenario).
 *
 * Lock key format: `job:lock:<jobName>`
 * Lock value: current process PID (as string) — stored so the release Lua
 * script can verify ownership before deleting.
 */

import IORedis from 'ioredis';
import { logger } from './logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LockResult = 'acquired' | 'already_held';

// ---------------------------------------------------------------------------
// Lua script — safe release
// Only deletes the key if the value matches the expected owner (PID).
// Prevents a process from accidentally releasing another process' lock.
// ---------------------------------------------------------------------------

const RELEASE_LOCK_LUA = `
local key   = KEYS[1]
local owner = ARGV[1]
local current = redis.call('GET', key)
if current == owner then
  redis.call('DEL', key)
  return 1
else
  return 0
end
`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function lockKey(jobName: string): string {
  return `job:lock:${jobName}`;
}

const OWNER_ID = String(process.pid);

// ---------------------------------------------------------------------------
// Get Redis connection
// ---------------------------------------------------------------------------

function getRedis(): IORedis {
  // Lazy import to avoid circular dep at startup
  const { getRedisConnection } = require('../queue/queue') as {
    getRedisConnection: () => IORedis;
  };
  return getRedisConnection();
}

// ---------------------------------------------------------------------------
// acquireLock
// ---------------------------------------------------------------------------

/**
 * Try to acquire an exclusive lock for `jobName`.
 *
 * Uses Redis SET NX EX (atomic set-if-not-exists with TTL) — the Redis 2.6+
 * variant that is safe against crash-after-SET-before-EXPIRE bugs.
 *
 * @param jobName     Unique identifier for the job (e.g. 'morning', 'afternoon')
 * @param ttlSeconds  Lock TTL in seconds. Should be safely larger than the
 *                    expected job duration so it self-expires on crash.
 * @returns           `true` if the lock was acquired, `false` if it is already held.
 */
export async function acquireLock(jobName: string, ttlSeconds: number): Promise<boolean> {
  try {
    const redis = getRedis();
    const key = lockKey(jobName);
    // SET key value NX EX ttl — returns 'OK' or null
    const result = await redis.set(key, OWNER_ID, 'EX', ttlSeconds, 'NX');
    if (result === 'OK') {
      logger.info('JobLock: acquired', { jobName, ttlSeconds, owner: OWNER_ID });
      return true;
    }
    logger.warn('JobLock: already held, skipping', { jobName });
    return false;
  } catch (err) {
    logger.error('JobLock.acquireLock: Redis error', {
      jobName,
      error: (err as Error).message,
    });
    // Fail-safe: if we cannot check the lock, refuse to run the job
    return false;
  }
}

// ---------------------------------------------------------------------------
// releaseLock
// ---------------------------------------------------------------------------

/**
 * Release the lock for `jobName`.
 *
 * The Lua script ensures we only delete the key if it still contains our PID,
 * preventing a long-running job from accidentally releasing a lock that was
 * re-acquired by another process after the TTL expired.
 *
 * @param jobName  Name of the job whose lock should be released.
 */
export async function releaseLock(jobName: string): Promise<void> {
  try {
    const redis = getRedis();
    const key = lockKey(jobName);
    const released = await redis.eval(
      RELEASE_LOCK_LUA,
      1,        // numkeys
      key,      // KEYS[1]
      OWNER_ID, // ARGV[1]
    ) as number;

    if (released === 1) {
      logger.info('JobLock: released', { jobName });
    } else {
      logger.warn('JobLock: lock was not ours or already expired', { jobName });
    }
  } catch (err) {
    logger.error('JobLock.releaseLock: Redis error', {
      jobName,
      error: (err as Error).message,
    });
  }
}

// ---------------------------------------------------------------------------
// isLockHeld
// ---------------------------------------------------------------------------

/**
 * Check whether a lock is currently held by any owner.
 * Useful for the evening job polling loop (DC-08).
 *
 * @param jobName  Name of the job to check.
 * @returns        `true` if the lock key exists, `false` otherwise.
 */
export async function isLockHeld(jobName: string): Promise<boolean> {
  try {
    const redis = getRedis();
    const exists = await redis.exists(lockKey(jobName));
    return exists === 1;
  } catch (err) {
    logger.error('JobLock.isLockHeld: Redis error', {
      jobName,
      error: (err as Error).message,
    });
    return false;
  }
}

// ---------------------------------------------------------------------------
// withLock — convenience wrapper
// ---------------------------------------------------------------------------

/**
 * Acquire the lock, execute `fn`, then release the lock.
 *
 * If the lock cannot be acquired (already held), `fn` is NOT called and the
 * function returns `null`. This is the recommended way to guard cron jobs.
 *
 * On uncaught exception from `fn`, the lock is still released so subsequent
 * runs are not blocked.
 *
 * @param jobName     Unique job identifier.
 * @param ttlSeconds  Lock TTL — should exceed the maximum expected job duration.
 * @param fn          Async function to execute while holding the lock.
 * @returns           The return value of `fn`, or `null` if lock was not acquired.
 */
export async function withLock<T>(
  jobName: string,
  ttlSeconds: number,
  fn: () => Promise<T>,
): Promise<T | null> {
  const acquired = await acquireLock(jobName, ttlSeconds);
  if (!acquired) {
    logger.info('JobLock: skipping execution (lock held)', { jobName });
    return null;
  }

  try {
    const result = await fn();
    return result;
  } catch (err) {
    logger.error('JobLock.withLock: job threw an error', {
      jobName,
      error: (err as Error).message,
    });
    throw err;
  } finally {
    await releaseLock(jobName);
  }
}

// ---------------------------------------------------------------------------
// Aliases kept for backward compatibility with scheduler.ts
// ---------------------------------------------------------------------------

export const acquireJobLock = acquireLock;
export const releaseJobLock = releaseLock;
