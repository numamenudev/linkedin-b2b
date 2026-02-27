/**
 * backend/src/automation/jobs/morning.job.ts
 *
 * Morning Job — runs at 09:00 +/- 15 minutes.
 *
 * DC-06: Guard — if no active agents, log and return early.
 * DC-08: Acquire Redis SETNX lock 'job:lock:morning' (TTL 2h) before running.
 *
 * Steps:
 *   1. acceptance-monitor: check Unipile for accepted/rejected invitations
 *   2. Profile analysis queue: find connection_accepted prospects without profileAnalysis,
 *      analyze in batch (max 20 per cycle)
 *   3. followup-manager: check timers and transition statuses
 *   4. Send Telegram morning briefing
 *
 * Lock is always released in the finally block.
 */

import { acquireLock, releaseLock } from '../../utils/job-lock';
import { logger } from '../../utils/logger';
import { getActiveAgents } from '../../agents/orchestrator';
import { runAcceptanceCheck } from '../acceptance-monitor';
import { analyzeBatch } from '../profile-analyzer';
import { checkFollowupTimers } from '../followup-manager';
import { telegramBot } from '../../integrations/telegram/telegram.bot';
import db from '../../db/prisma.client';
import type { Identity } from '@prisma/client';
import type { MorningBriefingData } from '../../integrations/telegram/telegram.bot';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** TTL for the morning job lock (seconds) — 2 hours */
const MORNING_LOCK_TTL = 2 * 60 * 60;

/** Maximum profiles to analyze in one morning cycle */
const MAX_PROFILES_PER_CYCLE = 20;

// ---------------------------------------------------------------------------
// Morning Job
// ---------------------------------------------------------------------------

/**
 * Execute the morning automation job.
 *
 * DC-06: Returns early if no active agents.
 * DC-08: Uses Redis SETNX lock to prevent concurrent execution.
 */
export async function runMorningJob(): Promise<void> {
  const lockAcquired = await acquireLock('morning', MORNING_LOCK_TTL);
  if (!lockAcquired) {
    logger.warn('[morning-job] Could not acquire lock — job already running, skipping');
    return;
  }

  logger.info('[morning-job] Starting morning job');

  try {
    // DC-06: Guard — if no active agents, log and return early
    const activeAgents = await getActiveAgents();
    if (activeAgents.length === 0) {
      logger.info('[morning-job] No active agents, skipping morning job');
      return;
    }

    logger.info('[morning-job] Processing morning cycle', {
      agentCount: activeAgents.length,
    });

    // ── Step 1: Acceptance monitor — check for accepted/rejected invitations ──
    logger.info('[morning-job] Step 1: Running acceptance check');
    await runAcceptanceCheck();

    // ── Step 2: Profile analysis for newly accepted connections ───────────────
    logger.info('[morning-job] Step 2: Queuing profile analysis for accepted connections');
    let totalAnalyzed = 0;

    for (const agent of activeAgents) {
      try {
        // Find connection_accepted prospects that have no profileAnalysis yet
        const pendingProspects = await db.prospect.findMany({
          where: {
            agentId: agent.id,
            status: 'connection_accepted',
            profileAnalyzedAt: null,
          },
          orderBy: { connectionAcceptedAt: 'asc' },
          take: MAX_PROFILES_PER_CYCLE,
          include: { agent: { include: { identity: true } } },
        });

        if (pendingProspects.length === 0) {
          logger.debug('[morning-job] No pending profiles for analysis', { agentId: agent.id });
          continue;
        }

        logger.info('[morning-job] Analyzing profiles for agent', {
          agentId: agent.id,
          agentName: agent.name,
          count: pendingProspects.length,
        });

        const identity = (pendingProspects[0] as { agent: { identity: Identity } }).agent.identity;
        const analyzed = await analyzeBatch(pendingProspects, identity, MAX_PROFILES_PER_CYCLE);
        totalAnalyzed += analyzed;

        // Transition analyzed profiles to ready_for_outreach
        const analyzedIds = pendingProspects.slice(0, analyzed).map((p) => p.id);
        if (analyzedIds.length > 0) {
          await db.prospect.updateMany({
            where: {
              id: { in: analyzedIds },
              status: 'connection_accepted',
            },
            data: {
              status: 'ready_for_outreach',
              lastActivityAt: new Date(),
            },
          });
        }
      } catch (err) {
        logger.error('[morning-job] Profile analysis failed for agent', {
          agentId: agent.id,
          agentName: agent.name,
          error: (err as Error).message,
        });
        // Continue with other agents
      }
    }

    logger.info('[morning-job] Profile analysis complete', { totalAnalyzed });

    // ── Step 3: Follow-up timer check — transition statuses ───────────────────
    logger.info('[morning-job] Step 3: Checking follow-up timers');
    const transitioned = await checkFollowupTimers();
    logger.info('[morning-job] Follow-up timer check complete', { transitioned });

    // ── Step 4: Send Telegram morning briefing ────────────────────────────────
    logger.info('[morning-job] Step 4: Sending Telegram morning briefing');
    await sendMorningTelegramReport(activeAgents.length);

    logger.info('[morning-job] Morning job complete', {
      activeAgents: activeAgents.length,
      profilesAnalyzed: totalAnalyzed,
      followupTransitions: transitioned,
    });
  } catch (err) {
    logger.error('[morning-job] Morning job failed', {
      error: (err as Error).message,
      stack: (err as Error).stack,
    });
    throw err;
  } finally {
    await releaseLock('morning');
    logger.info('[morning-job] Lock released');
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Compile and send the Telegram morning briefing.
 */
async function sendMorningTelegramReport(activeAgentCount: number): Promise<void> {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Aggregate pending connection requests and messages
    const [pendingConnections, pendingMessages, newAcceptances, newResponses] = await Promise.all([
      db.prospect.count({ where: { status: 'queued' } }),
      db.prospect.count({
        where: {
          status: {
            in: ['ready_for_outreach', 'followup_1_queued', 'followup_2_queued',
                 'existing_queued', 'existing_followup_1_queued', 'existing_followup_2_queued'],
          },
        },
      }),
      db.prospect.count({
        where: { connectionAcceptedAt: { gte: today } },
      }),
      db.prospect.count({
        where: { status: 'responded', lastActivityAt: { gte: today } },
      }),
    ]);

    // Get today's budget from rate limiter
    const { getRemainingLimit } = await import('../../utils/rate-limiter');
    const [connectionsRemaining, messagesRemaining] = await Promise.all([
      getRemainingLimit('connectionRequestsDaily'),
      getRemainingLimit('messagesDaily'),
    ]);

    const data: MorningBriefingData = {
      date: new Date().toISOString().split('T')[0],
      activeAgents: activeAgentCount,
      pendingConnections,
      pendingMessages,
      newAcceptancesSince: newAcceptances,
      newResponsesSince: newResponses,
      todayBudget: {
        connections: connectionsRemaining,
        messages: messagesRemaining,
      },
      scheduledJobs: ['midday (11:30)', 'afternoon (14:00)', 'evening (18:30)'],
      healthStatus: 'ok',
    };

    await telegramBot.sendMorningBriefing(data);
  } catch (err) {
    logger.warn('[morning-job] Failed to send Telegram morning report', {
      error: (err as Error).message,
    });
    // Non-critical — do not rethrow
  }
}
