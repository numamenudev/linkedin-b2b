/**
 * backend/src/automation/jobs/evening.job.ts
 *
 * Evening Job — runs at 18:30 +/- 15 minutes.
 *
 * DC-08: Acquire Redis SETNX lock 'job:lock:evening' (TTL 2h).
 *        Waits for afternoon lock to be released before running
 *        (polls every 5 min, max 2h wait).
 * DC-06: If no active agents, still run but send 'no activity today' summary.
 *
 * Steps:
 *   1. Compile DailyLog for each agent (aggregate today's metrics)
 *   2. Update Agent.statsJson with rates for the last 7 days
 *   3. Send Telegram evening summary report
 *   4. Send email daily report via Resend (email-report module)
 *   5. Maintenance: archive OperationLog entries older than 30 days
 */

import { acquireLock, releaseLock, isLockHeld } from '../../utils/job-lock';
import { logger, logOperation } from '../../utils/logger';
import { telegramBot } from '../../integrations/telegram/telegram.bot';
import db from '../../db/prisma.client';
import type { DailyReportData, AgentDailyReport } from '../../integrations/telegram/telegram.bot';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** TTL for the evening job lock (seconds) — 2 hours */
const EVENING_LOCK_TTL = 2 * 60 * 60;

/** Poll interval while waiting for afternoon lock (ms) — 5 minutes */
const AFTERNOON_POLL_INTERVAL_MS = 5 * 60 * 1_000;

/** Maximum wait time for afternoon lock to release (ms) — 2 hours */
const MAX_AFTERNOON_WAIT_MS = 2 * 60 * 60 * 1_000;

/** Retain OperationLog entries for this many days */
const OPERATION_LOG_RETENTION_DAYS = 30;

// ---------------------------------------------------------------------------
// Evening Job
// ---------------------------------------------------------------------------

/**
 * Execute the evening automation job.
 *
 * DC-08: Waits for afternoon job to finish before running.
 * DC-06: Always sends summary, even with zero agents (sends 'no activity' report).
 */
export async function runEveningJob(): Promise<void> {
  // DC-08: Wait for afternoon lock to be released before acquiring evening lock
  logger.info('[evening-job] Waiting for afternoon lock to release (DC-08)');
  await waitForAfternoonLockRelease();

  const lockAcquired = await acquireLock('evening', EVENING_LOCK_TTL);
  if (!lockAcquired) {
    logger.warn('[evening-job] Could not acquire lock — job already running, skipping');
    return;
  }

  logger.info('[evening-job] Starting evening job');

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];

    // Load all non-archived agents (including paused — they should still appear in reports)
    const agents = await db.agent.findMany({
      where: { status: { not: 'archived' } },
      orderBy: { priority: 'asc' },
    });

    logger.info('[evening-job] Processing evening cycle', {
      agentCount: agents.length,
    });

    // ── Step 1: Compile DailyLog for each agent ───────────────────────────────
    logger.info('[evening-job] Step 1: Compiling DailyLog records');
    const agentReports: AgentDailyReport[] = [];

    for (const agent of agents) {
      try {
        const dailyLog = await compileDailyLog(agent.id, today, todayStr);
        agentReports.push({
          agentName: agent.name,
          agentId: agent.id,
          connectionsSent: dailyLog.connectionRequestsSent,
          messagesSent: dailyLog.messagesSent,
          responses: dailyLog.responsesReceived,
          acceptances: dailyLog.connectionsAccepted,
        });
      } catch (err) {
        logger.error('[evening-job] Failed to compile DailyLog for agent', {
          agentId: agent.id,
          agentName: agent.name,
          error: (err as Error).message,
        });
      }
    }

    // ── Step 2: Update Agent.statsJson with 7-day rates ───────────────────────
    logger.info('[evening-job] Step 2: Updating agent stats (7d/30d rates)');
    for (const agent of agents) {
      try {
        await updateAgentStats(agent.id);
      } catch (err) {
        logger.error('[evening-job] Failed to update statsJson for agent', {
          agentId: agent.id,
          error: (err as Error).message,
        });
      }
    }

    // ── Step 3: Send Telegram evening summary report ───────────────────────────
    logger.info('[evening-job] Step 3: Sending Telegram evening report');
    await sendTelegramEveningReport(agentReports, todayStr);

    // ── Step 4: Send email daily report via Resend ────────────────────────────
    logger.info('[evening-job] Step 4: Sending email daily report');
    await sendEmailDailyReport(todayStr);

    // ── Step 5: Maintenance — archive old OperationLog entries ────────────────
    logger.info('[evening-job] Step 5: Archiving old OperationLog entries (>30d)');
    const deleted = await archiveOldOperationLogs();
    logger.info('[evening-job] OperationLog maintenance complete', { deleted });

    logger.info('[evening-job] Evening job complete', {
      agentsProcessed: agents.length,
      reportsSent: agentReports.length,
    });
  } catch (err) {
    logger.error('[evening-job] Evening job failed', {
      error: (err as Error).message,
      stack: (err as Error).stack,
    });
    throw err;
  } finally {
    await releaseLock('evening');
    logger.info('[evening-job] Lock released');
  }
}

// ---------------------------------------------------------------------------
// DC-08: Wait for afternoon lock release
// ---------------------------------------------------------------------------

/**
 * DC-08: Poll until the afternoon job lock is released (or timeout).
 *
 * Polls every 5 minutes for up to 2 hours. If the afternoon lock is still
 * held after 2 hours, the evening job runs anyway — the report will reflect
 * data as-of report time.
 */
async function waitForAfternoonLockRelease(): Promise<void> {
  const startTime = Date.now();

  while (true) {
    const held = await isLockHeld('afternoon');
    if (!held) {
      logger.info('[evening-job] Afternoon lock released — proceeding');
      return;
    }

    const elapsed = Date.now() - startTime;
    if (elapsed >= MAX_AFTERNOON_WAIT_MS) {
      logger.warn('[evening-job] Afternoon lock still held after 2h wait — running evening job anyway', {
        elapsedMs: elapsed,
      });
      return;
    }

    logger.info('[evening-job] Afternoon lock still held — waiting 5 min', {
      elapsedMs: elapsed,
      remainingMs: MAX_AFTERNOON_WAIT_MS - elapsed,
    });

    await new Promise<void>((resolve) => setTimeout(resolve, AFTERNOON_POLL_INTERVAL_MS));
  }
}

// ---------------------------------------------------------------------------
// Step 1: Compile DailyLog
// ---------------------------------------------------------------------------

interface DailyLogData {
  connectionRequestsSent: number;
  connectionsAccepted: number;
  connectionsRejected: number;
  profilesAnalyzed: number;
  messagesSent: number;
  responsesReceived: number;
  searchStructuresRun: number;
  newProspectsFound: number;
}

/**
 * Aggregate today's metrics for an agent and upsert the DailyLog record.
 */
async function compileDailyLog(
  agentId: string,
  today: Date,
  todayStr: string,
): Promise<DailyLogData> {
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  // Aggregate metrics from DB
  const [
    connectionRequestsSent,
    connectionsAccepted,
    connectionsRejected,
    profilesAnalyzed,
    messagesSent,
    responsesReceived,
    newProspectsFound,
  ] = await Promise.all([
    db.prospect.count({
      where: {
        agentId,
        connectionRequestSentAt: { gte: today, lt: tomorrow },
      },
    }),
    db.prospect.count({
      where: {
        agentId,
        connectionAcceptedAt: { gte: today, lt: tomorrow },
      },
    }),
    db.prospect.count({
      where: {
        agentId,
        connectionRejectedAt: { gte: today, lt: tomorrow },
      },
    }),
    db.prospect.count({
      where: {
        agentId,
        profileAnalyzedAt: { gte: today, lt: tomorrow },
      },
    }),
    db.message.count({
      where: {
        prospect: { agentId },
        direction: 'outbound',
        sentAt: { gte: today, lt: tomorrow },
      },
    }),
    db.message.count({
      where: {
        prospect: { agentId },
        direction: 'inbound',
        createdAt: { gte: today, lt: tomorrow },
      },
    }),
    db.prospect.count({
      where: {
        agentId,
        createdAt: { gte: today, lt: tomorrow },
      },
    }),
  ]);

  // Upsert DailyLog
  await db.dailyLog.upsert({
    where: {
      agentId_date: {
        agentId,
        date: today,
      },
    },
    create: {
      agentId,
      date: today,
      connectionRequestsSent,
      connectionsAccepted,
      connectionsRejected,
      profilesAnalyzed,
      messagesSent,
      responsesReceived,
      newProspectsFound,
      searchStructuresRun: 1, // at most 1 per midday cycle
    },
    update: {
      connectionRequestsSent,
      connectionsAccepted,
      connectionsRejected,
      profilesAnalyzed,
      messagesSent,
      responsesReceived,
      newProspectsFound,
    },
  });

  logOperation(agentId, 'info', 'evening-job', 'daily_log_compiled',
    `DailyLog compiled for ${todayStr}`, {
      connectionRequestsSent,
      connectionsAccepted,
      messagesSent,
      responsesReceived,
    });

  return {
    connectionRequestsSent,
    connectionsAccepted,
    connectionsRejected,
    profilesAnalyzed,
    messagesSent,
    responsesReceived,
    searchStructuresRun: 1,
    newProspectsFound,
  };
}

// ---------------------------------------------------------------------------
// Step 2: Update Agent.statsJson
// ---------------------------------------------------------------------------

/**
 * Recalculate an agent's statsJson with 7-day and 30-day acceptance/response rates.
 */
async function updateAgentStats(agentId: string): Promise<void> {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  sevenDaysAgo.setHours(0, 0, 0, 0);

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  thirtyDaysAgo.setHours(0, 0, 0, 0);

  // 7-day stats
  const [sent7d, accepted7d, responded7d] = await Promise.all([
    db.prospect.count({
      where: { agentId, connectionRequestSentAt: { gte: sevenDaysAgo } },
    }),
    db.prospect.count({
      where: { agentId, connectionAcceptedAt: { gte: sevenDaysAgo } },
    }),
    db.prospect.count({
      where: { agentId, status: 'responded', lastActivityAt: { gte: sevenDaysAgo } },
    }),
  ]);

  // 30-day stats
  const [sent30d, accepted30d, responded30d, messages30d] = await Promise.all([
    db.prospect.count({
      where: { agentId, connectionRequestSentAt: { gte: thirtyDaysAgo } },
    }),
    db.prospect.count({
      where: { agentId, connectionAcceptedAt: { gte: thirtyDaysAgo } },
    }),
    db.prospect.count({
      where: { agentId, status: 'responded', lastActivityAt: { gte: thirtyDaysAgo } },
    }),
    db.message.count({
      where: {
        prospect: { agentId },
        direction: 'outbound',
        sentAt: { gte: thirtyDaysAgo },
      },
    }),
  ]);

  const acceptanceRate7d = sent7d > 0 ? Math.round((accepted7d / sent7d) * 100) : 0;
  const responseRate7d = accepted7d > 0 ? Math.round((responded7d / accepted7d) * 100) : 0;
  const acceptanceRate30d = sent30d > 0 ? Math.round((accepted30d / sent30d) * 100) : 0;
  const responseRate30d = accepted30d > 0 ? Math.round((responded30d / accepted30d) * 100) : 0;

  const statsJson = {
    updatedAt: new Date().toISOString(),
    last7d: {
      connectionsSent: sent7d,
      connectionsAccepted: accepted7d,
      responses: responded7d,
      acceptanceRate: acceptanceRate7d,
      responseRate: responseRate7d,
    },
    last30d: {
      connectionsSent: sent30d,
      connectionsAccepted: accepted30d,
      responses: responded30d,
      messagesSent: messages30d,
      acceptanceRate: acceptanceRate30d,
      responseRate: responseRate30d,
    },
  };

  await db.agent.update({
    where: { id: agentId },
    data: { statsJson },
  });
}

// ---------------------------------------------------------------------------
// Step 3: Telegram evening report
// ---------------------------------------------------------------------------

/**
 * Compile and send Telegram evening summary report.
 * DC-06: If no agent reports, sends 'no activity today' summary.
 */
async function sendTelegramEveningReport(
  agentReports: AgentDailyReport[],
  dateStr: string,
): Promise<void> {
  try {
    const totalConnectionsSent = agentReports.reduce((s, a) => s + a.connectionsSent, 0);
    const totalMessagesSent = agentReports.reduce((s, a) => s + a.messagesSent, 0);
    const totalResponses = agentReports.reduce((s, a) => s + a.responses, 0);
    const totalAcceptances = agentReports.reduce((s, a) => s + a.acceptances, 0);

    const overallAcceptanceRate = totalConnectionsSent > 0
      ? Math.round((totalAcceptances / totalConnectionsSent) * 100)
      : 0;
    const overallResponseRate = totalAcceptances > 0
      ? Math.round((totalResponses / totalAcceptances) * 100)
      : 0;

    const data: DailyReportData = {
      date: dateStr,
      agentReports,
      totalConnectionsSent,
      totalMessagesSent,
      totalResponses,
      totalAcceptances,
      overallAcceptanceRate,
      overallResponseRate,
    };

    await telegramBot.sendDailyReport(data);
    logger.info('[evening-job] Telegram evening report sent');
  } catch (err) {
    logger.warn('[evening-job] Failed to send Telegram evening report', {
      error: (err as Error).message,
    });
    // Non-critical — do not rethrow
  }
}

// ---------------------------------------------------------------------------
// Step 4: Email daily report
// ---------------------------------------------------------------------------

/**
 * Send the full daily report via email (Resend).
 * Delegates to the email-report module.
 */
async function sendEmailDailyReport(dateStr: string): Promise<void> {
  try {
    // Lazy import to keep dependencies isolated
    const { sendDailyReport } = await import('../../integrations/email/email-report');
    await sendDailyReport(dateStr);
    logger.info('[evening-job] Email daily report sent', { date: dateStr });
  } catch (err) {
    logger.warn('[evening-job] Failed to send email daily report', {
      error: (err as Error).message,
    });
    // Non-critical — do not rethrow
  }
}

// ---------------------------------------------------------------------------
// Step 5: Maintenance — archive old OperationLog entries
// ---------------------------------------------------------------------------

/**
 * Delete OperationLog entries older than 30 days.
 * Returns the number of deleted records.
 */
async function archiveOldOperationLogs(): Promise<number> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - OPERATION_LOG_RETENTION_DAYS);

  try {
    const { count } = await db.operationLog.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    logger.info('[evening-job] OperationLog cleanup: deleted old entries', {
      cutoff: cutoff.toISOString(),
      deleted: count,
    });
    return count;
  } catch (err) {
    logger.error('[evening-job] OperationLog cleanup failed', {
      error: (err as Error).message,
    });
    return 0;
  }
}
