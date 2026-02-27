/**
 * backend/src/utils/scheduler.ts
 *
 * Wrapper around node-cron that:
 * - Registers named jobs with a human-readable label.
 * - Integrates with `randomizeJobTime` so daily automation jobs fire at
 *   base time ± 15 minutes (C16 — human-like scheduling).
 * - Integrates with `acquireJobLock` / `releaseLock` so each job is protected
 *   by a distributed Redis lock (DC-08).
 * - Re-reads job times from the Settings DB each day so the operator can
 *   change schedules without a redeploy.
 *
 * Usage:
 *   scheduleJob('morning', morningJob)           // named registration
 *   getScheduledJobs()                           // list registered jobs
 *   stopAll()                                    // graceful shutdown
 */

import cron, { ScheduledTask } from 'node-cron';
import { logger } from './logger';
import { randomizeJobTime, parseTimeToday, sleep } from './helpers';
import { withLock, isLockHeld } from './job-lock';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface JobRegistration {
  name: string;
  cronExpression: string;
  handler: () => Promise<void>;
  task: ScheduledTask;
  lastFiredAt?: Date;
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const registry: Map<string, JobRegistration> = new Map();

// ---------------------------------------------------------------------------
// scheduleJob
// ---------------------------------------------------------------------------

/**
 * Register and start a named cron job.
 *
 * If a job with the same `name` is already registered it will be stopped
 * first (allows hot-reload of schedules).
 *
 * @param name            Human-readable label, also used as the Redis lock key.
 * @param cronExpression  Standard cron expression (e.g. '0 9 * * *').
 * @param handler         Async function to run. Must not throw unhandled.
 * @param lockTtlSeconds  Redis lock TTL for this job (default 7200 = 2 hours).
 */
export function scheduleJob(
  name: string,
  cronExpression: string,
  handler: () => Promise<void>,
  lockTtlSeconds = 7_200,
): void {
  // Stop previous registration if it exists
  if (registry.has(name)) {
    registry.get(name)!.task.stop();
    logger.info('Scheduler: replaced existing job', { name });
  }

  const task = cron.schedule(cronExpression, async () => {
    logger.info('Scheduler: firing job', { name, cronExpression });

    await withLock(name, lockTtlSeconds, async () => {
      const reg = registry.get(name);
      if (reg) reg.lastFiredAt = new Date();
      await handler();
    }).catch((err) => {
      logger.error('Scheduler: job error', { name, error: (err as Error).message });
    });
  });

  registry.set(name, { name, cronExpression, handler, task });
  logger.info('Scheduler: job registered', { name, cronExpression });
}

// ---------------------------------------------------------------------------
// scheduleJobWithRandomization
// ---------------------------------------------------------------------------

/**
 * Schedule a job that fires at a randomized time each day.
 *
 * Because cron expressions are fixed, we implement randomization by:
 * 1. Scheduling a job every minute.
 * 2. At each tick, checking if the current time is within ±1 minute of the
 *    randomized target time computed at startup (or re-read from DB each day).
 *
 * Alternatively — and more simply — we schedule a "wrapper" job that runs at
 * the start of the cron window, then sleeps for a random offset before calling
 * the real handler.  This keeps the cron expression simple while still
 * achieving the ±15min spread.
 *
 * @param name          Human-readable label + Redis lock key.
 * @param baseHour      Intended hour (0-23).
 * @param baseMinute    Intended minute (0-59).
 * @param handler       Async function to execute.
 * @param lockTtlSeconds Redis lock TTL.
 */
export function scheduleJobWithRandomization(
  name: string,
  baseHour: number,
  baseMinute: number,
  handler: () => Promise<void>,
  lockTtlSeconds = 7_200,
): void {
  // Fire the outer cron 15 minutes BEFORE the earliest possible time
  const earliestMinute = Math.max(0, baseMinute - 15);
  const cronExpr = `${earliestMinute} ${baseHour} * * *`;

  scheduleJob(
    name,
    cronExpr,
    async () => {
      // Compute a random offset [0, 30] minutes to land in [base-15, base+15]
      const randomOffsetMs = Math.floor(Math.random() * 30 * 60 * 1_000);
      logger.info('Scheduler: randomized delay before job', {
        name,
        delayMs: randomOffsetMs,
      });
      await sleep(randomOffsetMs);
      await handler();
    },
    lockTtlSeconds,
  );
}

// ---------------------------------------------------------------------------
// scheduleNamedJob (convenience: uses DB-persisted times)
// ---------------------------------------------------------------------------

/**
 * Schedule one of the four daily automation jobs using the time stored in
 * the Settings table.  Re-reads from DB every time the schedule fires so
 * changes propagate without restart.
 *
 * @param jobName    One of 'morning' | 'midday' | 'afternoon' | 'evening'
 * @param handler    The job function.
 * @param lockTtl    Redis lock TTL for the job.
 */
export async function scheduleDailyJob(
  jobName: 'morning' | 'midday' | 'afternoon' | 'evening',
  handler: () => Promise<void>,
  lockTtl = 7_200,
): Promise<void> {
  // Read base time from Settings.  Default to a sensible time if DB is not yet
  // available (e.g. during cold start before migrations).
  const defaults: Record<string, string> = {
    morning: '09:00',
    midday: '11:30',
    afternoon: '14:00',
    evening: '18:30',
  };

  let baseTimeStr = defaults[jobName];

  try {
    const { getDb } = await import('../db/prisma.client');
    const db = getDb();
    const settings = await db.settings.findUnique({ where: { id: 'singleton' } });
    if (settings) {
      const fieldMap: Record<string, keyof typeof settings> = {
        morning: 'morningJobTime',
        midday: 'middayJobTime',
        afternoon: 'afternoonJobTime',
        evening: 'eveningJobTime',
      };
      const fieldValue = settings[fieldMap[jobName]];
      if (typeof fieldValue === 'string') {
        baseTimeStr = fieldValue;
      }
    }
  } catch (err) {
    logger.warn('Scheduler: could not read job time from DB, using default', {
      jobName,
      default: baseTimeStr,
      error: (err as Error).message,
    });
  }

  const [hourStr, minuteStr] = baseTimeStr.split(':');
  const baseHour = parseInt(hourStr, 10);
  const baseMinute = parseInt(minuteStr, 10);

  scheduleJobWithRandomization(jobName, baseHour, baseMinute, handler, lockTtl);
}

// ---------------------------------------------------------------------------
// getScheduledJobs
// ---------------------------------------------------------------------------

/**
 * Return a read-only list of all registered job registrations.
 */
export function getScheduledJobs(): ReadonlyArray<Omit<JobRegistration, 'task'>> {
  return Array.from(registry.values()).map(({ name, cronExpression, lastFiredAt }) => ({
    name,
    cronExpression,
    handler: registry.get(name)!.handler,
    lastFiredAt,
  }));
}

// ---------------------------------------------------------------------------
// stopAll
// ---------------------------------------------------------------------------

/**
 * Stop all registered cron tasks.  Called during graceful shutdown.
 */
export function stopAll(): void {
  for (const [name, reg] of registry.entries()) {
    reg.task.stop();
    logger.info('Scheduler: stopped job', { name });
  }
  registry.clear();
}

// ---------------------------------------------------------------------------
// initScheduler — wires up all system jobs
// ---------------------------------------------------------------------------

/**
 * Bootstrap the full scheduler.
 * Called once from app.ts after the database and Redis are ready.
 */
export async function initScheduler(): Promise<void> {
  // Lazy imports to avoid circular deps
  const [
    { runMorningJob: morningJob },
    { runMiddayJob: middayJob },
    { runAfternoonJob: afternoonJob },
    { runEveningJob: eveningJob },
    { acceptancePollingJob },
    { resetDailyCounters, resetWeeklyCounters },
  ] = await Promise.all([
    import('../automation/jobs/morning.job'),
    import('../automation/jobs/midday.job'),
    import('../automation/jobs/afternoon.job'),
    import('../automation/jobs/evening.job'),
    import('../automation/acceptance-monitor'),
    import('./rate-limiter'),
  ]);

  // Four daily jobs — times read from DB, each ±15min randomized
  await scheduleDailyJob('morning', morningJob, 2 * 3600);
  await scheduleDailyJob('midday', middayJob, 2 * 3600);
  await scheduleDailyJob('afternoon', afternoonJob, 5 * 3600);  // DC-08: TTL 5h
  await scheduleDailyJob('evening', eveningJob, 2 * 3600);

  // DC-16: Acceptance polling fallback every 4 hours
  scheduleJob(
    'acceptance-polling',
    '0 */4 * * *',
    async () => {
      await acceptancePollingJob();
    },
    3_600,
  );

  // Daily counter reset at midnight
  scheduleJob(
    'rate-limit-daily-reset',
    '0 0 * * *',
    async () => {
      await resetDailyCounters();
    },
    60,
  );

  // Weekly counter reset Monday midnight
  scheduleJob(
    'rate-limit-weekly-reset',
    '0 0 * * 1',
    async () => {
      await resetWeeklyCounters();
    },
    60,
  );

  logger.info('Scheduler initialized', {
    jobs: Array.from(registry.keys()),
  });
}

// ---------------------------------------------------------------------------
// Evening job polling helper (DC-08)
// ---------------------------------------------------------------------------

/**
 * Called by the evening job before running: poll until the afternoon lock is
 * released or the max wait time is exceeded.
 *
 * @param maxWaitMs  Maximum time to wait in ms (default 2 hours).
 * @param pollMs     Polling interval in ms (default 5 minutes).
 * @returns          `true` if the afternoon lock was released within `maxWaitMs`.
 */
export async function waitForAfternoonLockRelease(
  maxWaitMs = 2 * 3600 * 1_000,
  pollMs = 5 * 60 * 1_000,
): Promise<boolean> {
  const deadline = Date.now() + maxWaitMs;

  while (Date.now() < deadline) {
    const held = await isLockHeld('afternoon');
    if (!held) return true;

    logger.info('Scheduler: evening job waiting for afternoon lock to release', {
      remainingMs: deadline - Date.now(),
    });
    await sleep(pollMs);
  }

  logger.warn('Scheduler: evening job: afternoon lock still held after max wait — proceeding anyway');
  return false;
}
