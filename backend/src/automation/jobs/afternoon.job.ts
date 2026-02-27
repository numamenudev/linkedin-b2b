/**
 * backend/src/automation/jobs/afternoon.job.ts
 *
 * Afternoon Job — runs at 14:00 +/- 15 minutes.
 *
 * DC-06: Guard — if no active agents, log and return early.
 * DC-08: Acquire Redis SETNX lock 'job:lock:afternoon' (TTL 5h) — long job.
 * DC-09: Reconcile Redis counters from Postgres BEFORE budget calculation.
 *
 * Steps per agent (ordered by priority ASC):
 *   a. CONNECTION REQUESTS: sendBatchConnectionRequests with allocated budget
 *   b. INTRO MESSAGES: processReadyForOutreach (cold path)
 *   c. WARM MESSAGES: processReadyForOutreach (warm path, discoveryMethod='existing_network')
 *   d. FOLLOW-UP MESSAGES: processFollowups
 */

import { acquireLock, releaseLock } from '../../utils/job-lock';
import { logger, logOperation } from '../../utils/logger';
import { getActiveAgents } from '../../agents/orchestrator';
import { calculateDailyBudget, allocateBudget } from '../../agents/budget-allocator';
import { sendBatchConnectionRequests } from '../connection-sender';
import { processReadyForOutreach } from '../outreach-agent';
import { processFollowups } from '../followup-manager';
import db from '../../db/prisma.client';
import type { Agent } from '../../generated/prisma/client.js';
import type { BudgetAllocation } from '../../agents/budget-allocator';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** TTL for the afternoon job lock (seconds) — 5 hours (long job) */
const AFTERNOON_LOCK_TTL = 5 * 60 * 60;

// ---------------------------------------------------------------------------
// Afternoon Job
// ---------------------------------------------------------------------------

/**
 * Execute the afternoon automation job.
 *
 * DC-06: Returns early if no active agents.
 * DC-08: Uses Redis SETNX lock (TTL 5h) to prevent concurrent execution.
 * DC-09: Reconciles Redis counters from Postgres before budget calculation.
 */
export async function runAfternoonJob(): Promise<void> {
  const lockAcquired = await acquireLock('afternoon', AFTERNOON_LOCK_TTL);
  if (!lockAcquired) {
    logger.warn('[afternoon-job] Could not acquire lock — job already running, skipping');
    return;
  }

  logger.info('[afternoon-job] Starting afternoon job');

  try {
    // DC-06: Guard — if no active agents, log and return early
    const activeAgents = await getActiveAgents();
    if (activeAgents.length === 0) {
      logger.info('[afternoon-job] No active agents, skipping afternoon job');
      return;
    }

    // ── DC-09: Reconcile Redis counters from Postgres ─────────────────────────
    logger.info('[afternoon-job] Step 1: Reconciling Redis counters from Postgres (DC-09)');
    await reconcileCounters();

    // ── Budget calculation ────────────────────────────────────────────────────
    logger.info('[afternoon-job] Step 2: Calculating and allocating daily budget');
    const budget = await calculateDailyBudget();

    logger.info('[afternoon-job] Daily budget calculated', {
      connectionsRemainingDaily: budget.connectionsRemainingDaily,
      connectionsRemainingWeekly: budget.connectionsRemainingWeekly,
      messagesRemainingDaily: budget.messagesRemainingDaily,
    });

    // Agents are already sorted by priority ASC (from getActiveAgents)
    const allocations = await allocateBudget(activeAgents);

    if (allocations.length === 0) {
      logger.info('[afternoon-job] No budget allocated — nothing to do');
      return;
    }

    // ── Per-agent processing ──────────────────────────────────────────────────
    logger.info('[afternoon-job] Step 3: Processing agents', {
      agentCount: activeAgents.length,
    });

    let totalConnectionsSent = 0;
    let totalMessagesSent = 0;

    for (const agent of activeAgents) {
      const allocation = allocations.find((a) => a.agentId === agent.id);
      if (!allocation) continue;

      try {
        const result = await processAgent(agent, allocation);
        totalConnectionsSent += result.connectionsSent;
        totalMessagesSent += result.messagesSent;
      } catch (err) {
        logger.error('[afternoon-job] Agent processing failed', {
          agentId: agent.id,
          agentName: agent.name,
          error: (err as Error).message,
          stack: (err as Error).stack,
        });
        // Continue with other agents
      }
    }

    logger.info('[afternoon-job] Afternoon job complete', {
      activeAgents: activeAgents.length,
      totalConnectionsSent,
      totalMessagesSent,
    });
  } catch (err) {
    logger.error('[afternoon-job] Afternoon job failed', {
      error: (err as Error).message,
      stack: (err as Error).stack,
    });
    throw err;
  } finally {
    await releaseLock('afternoon');
    logger.info('[afternoon-job] Lock released');
  }
}

// ---------------------------------------------------------------------------
// DC-09: Counter reconciliation
// ---------------------------------------------------------------------------

/**
 * DC-09: Reconcile Redis connection/message counters from Postgres counts.
 *
 * Counts today's connection_sent rows in Postgres and sets the Redis counter
 * to match, ensuring the Redis counter reflects actual operations even after
 * restarts or Redis flushes.
 *
 * Operation order throughout the afternoon job:
 *   (1) Unipile send -> (2) Postgres write -> (3) Redis increment
 *
 * This reconciliation re-aligns Redis from Postgres before the budget
 * calculation, so the budget reflects reality.
 */
async function reconcileCounters(): Promise<void> {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Count actual connections sent today from Postgres
    const [actualConnectionsToday, actualMessagesToday] = await Promise.all([
      db.prospect.count({
        where: {
          connectionRequestSentAt: { gte: today },
          status: {
            in: ['connection_sent', 'connection_accepted', 'connection_rejected',
                 'connection_expired', 'ready_for_outreach', 'intro_sent',
                 'followup_1_queued', 'followup_1_sent', 'followup_2_queued',
                 'followup_2_sent', 'responded', 'archived'],
          },
        },
      }),
      db.message.count({
        where: {
          direction: 'outbound',
          sentAt: { gte: today },
        },
      }),
    ]);

    // Set Redis counters to match Postgres reality
    const { getRedisConnection } = await import('../../queue/queue');
    const { todayISO } = await import('../../utils/helpers');
    const redis = getRedisConnection();
    const today_iso = todayISO();

    // Only set if the Postgres count is higher than current Redis value
    // (Redis could be ahead if there are pending operations in-flight)
    const dailyConnKey = `linkedin:daily:connections:${today_iso}`;
    const dailyMsgKey = `linkedin:daily:messages:${today_iso}`;

    const [redisConns, redisMsgs] = await Promise.all([
      redis.get(dailyConnKey),
      redis.get(dailyMsgKey),
    ]);

    const redisConnCount = redisConns ? parseInt(redisConns, 10) : 0;
    const redisMsgCount = redisMsgs ? parseInt(redisMsgs, 10) : 0;

    if (actualConnectionsToday > redisConnCount) {
      await redis.set(dailyConnKey, actualConnectionsToday, 'KEEPTTL');
      logger.info('[afternoon-job] DC-09: Corrected daily connection counter', {
        postgres: actualConnectionsToday,
        redis: redisConnCount,
      });
    }

    if (actualMessagesToday > redisMsgCount) {
      await redis.set(dailyMsgKey, actualMessagesToday, 'KEEPTTL');
      logger.info('[afternoon-job] DC-09: Corrected daily message counter', {
        postgres: actualMessagesToday,
        redis: redisMsgCount,
      });
    }

    logger.info('[afternoon-job] DC-09: Counter reconciliation complete', {
      actualConnectionsToday,
      actualMessagesToday,
      redisConnCountBefore: redisConnCount,
      redisMsgCountBefore: redisMsgCount,
    });
  } catch (err) {
    logger.error('[afternoon-job] DC-09: Counter reconciliation failed', {
      error: (err as Error).message,
    });
    // Non-fatal: continue with potentially stale counters
  }
}

// ---------------------------------------------------------------------------
// Per-agent processing
// ---------------------------------------------------------------------------

interface AgentProcessingResult {
  connectionsSent: number;
  messagesSent: number;
}

/**
 * Process a single agent through the full afternoon sequence.
 *
 * a. Connection requests with allocated budget
 * b. Cold intro messages (status='ready_for_outreach')
 * c. Warm messages (status='existing_queued', discoveryMethod='existing_network')
 * d. Follow-up messages (all follow-up queued statuses)
 */
async function processAgent(
  agent: Agent,
  allocation: BudgetAllocation,
): Promise<AgentProcessingResult> {
  let connectionsSent = 0;
  let messagesSent = 0;

  logger.info('[afternoon-job] Processing agent', {
    agentId: agent.id,
    agentName: agent.name,
    priority: agent.priority,
    connectionsAllowed: allocation.connectionsAllowed,
    messagesAllowed: allocation.messagesAllowed,
  });

  // ── a. Connection requests ────────────────────────────────────────────────
  if (allocation.connectionsAllowed > 0) {
    logger.info('[afternoon-job] Sending connection requests', {
      agentId: agent.id,
      limit: allocation.connectionsAllowed,
    });
    connectionsSent = await sendBatchConnectionRequests(agent.id, allocation.connectionsAllowed);
    logger.info('[afternoon-job] Connection requests complete', {
      agentId: agent.id,
      sent: connectionsSent,
    });
  } else {
    logger.info('[afternoon-job] No connection budget — skipping connections', {
      agentId: agent.id,
    });
  }

  // ── b. Cold intro messages (status='ready_for_outreach') ─────────────────
  logger.info('[afternoon-job] Processing cold intro messages', { agentId: agent.id });
  const coldSent = await processReadyForOutreach(agent.id);
  messagesSent += coldSent;

  // ── c. Warm messages (existing network) ──────────────────────────────────
  // processReadyForOutreach handles both cold and warm paths internally
  // The warm path targets status='existing_queued' + discoveryMethod='existing_network'
  // It is already called within processReadyForOutreach above.
  // Log for visibility:
  logger.info('[afternoon-job] Cold + warm outreach complete', {
    agentId: agent.id,
    totalSent: coldSent,
  });

  // ── d. Follow-up messages ─────────────────────────────────────────────────
  logger.info('[afternoon-job] Processing follow-up messages', { agentId: agent.id });
  const followupSent = await processFollowups(agent.id);
  messagesSent += followupSent;

  logOperation(agent.id, 'info', 'afternoon-job', 'agent_complete',
    `Afternoon cycle complete for agent ${agent.name}`, {
      connectionsSent,
      coldMessagesSent: coldSent,
      followupsSent: followupSent,
      totalMessagesSent: messagesSent,
    });

  return { connectionsSent, messagesSent };
}
