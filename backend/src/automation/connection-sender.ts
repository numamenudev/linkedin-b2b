/**
 * backend/src/automation/connection-sender.ts
 *
 * Sends LinkedIn connection requests WITHOUT a note (C9: LinkedIn Free limitation).
 *
 * DC-09: Correct operation order — Unipile send -> Postgres write -> Redis increment.
 * DC-12: Hard safety cap: refuse to send if >25 connections today (regardless of counter).
 * C10:   Random delay of 600-1800 seconds (10-30 min) between each invitation.
 */

import { unipileClient } from '../integrations/unipile/unipile.client';
import { tryIncrementLimit, getRemaining } from '../utils/rate-limiter';
import { sleep } from '../utils/helpers';
import { logger, logOperation } from '../utils/logger';
import db from '../db/prisma.client';
import type { Prospect } from '../generated/prisma/client.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Hard safety cap: never send more than this many connections per day (DC-12). */
const HARD_DAILY_CAP = 25;

/** Minimum delay between connection requests (seconds): 10 min */
const MIN_DELAY_SECONDS = 600;

/** Maximum delay between connection requests (seconds): 30 min */
const MAX_DELAY_SECONDS = 1800;

// ---------------------------------------------------------------------------
// Single invitation
// ---------------------------------------------------------------------------

/**
 * Send a single connection request to a prospect.
 * Invitations are sent WITHOUT a note (C9: LinkedIn Free).
 *
 * DC-09 order of operations:
 *   1. Call Unipile sendInvitation
 *   2. Write status to Postgres
 *   3. Increment Redis counter
 *
 * @returns true if sent successfully, false on error
 */
export async function sendConnectionRequest(prospect: Prospect): Promise<boolean> {
  const accountId = process.env.UNIPILE_ACCOUNT_ID ?? '';

  try {
    // Step 1: Send via Unipile (no note — C9)
    const result = await unipileClient.sendInvitation(accountId, prospect.linkedinId);

    if (!result.success) {
      logger.warn('[connection-sender] Unipile sendInvitation failed', {
        prospectId: prospect.id,
        linkedinId: prospect.linkedinId,
        error: result.error,
      });
      return false;
    }

    // Step 2: Update Postgres
    await db.prospect.update({
      where: { id: prospect.id },
      data: {
        status: 'connection_sent',
        connectionRequestSentAt: new Date(),
        lastActivityAt: new Date(),
      },
    });

    // Step 3: Increment Redis counters
    await tryIncrementLimit('connectionRequestsDaily');
    await tryIncrementLimit('connectionRequestsWeekly');

    logOperation(prospect.agentId, 'info', 'connection-sender', 'connection_sent',
      `Connection request sent to ${prospect.fullName}`, {
        prospectId: prospect.id,
        linkedinId: prospect.linkedinId,
        invitationId: result.invitationId,
      });

    return true;
  } catch (err) {
    logger.error('[connection-sender] sendConnectionRequest failed', {
      prospectId: prospect.id,
      linkedinId: prospect.linkedinId,
      error: (err as Error).message,
    });
    return false;
  }
}

// ---------------------------------------------------------------------------
// Batch sender
// ---------------------------------------------------------------------------

/**
 * Send batch connection requests for an agent.
 * Picks queued prospects ordered by score DESC up to `limit`,
 * checks budget before each send, and applies 10-30 min delays.
 *
 * @param agentId  Agent ID to process
 * @param limit    Maximum connections to send in this batch
 * @returns        Number of connections actually sent
 */
export async function sendBatchConnectionRequests(
  agentId: string,
  limit: number,
): Promise<number> {
  if (limit <= 0) {
    logger.info('[connection-sender] Limit is 0 — no connections to send', { agentId });
    return 0;
  }

  // DC-12: Hard safety cap regardless of limit or counter
  const todaySentCount = await db.prospect.count({
    where: {
      agentId,
      status: 'connection_sent',
      connectionRequestSentAt: {
        gte: new Date(new Date().setHours(0, 0, 0, 0)),
      },
    },
  });

  if (todaySentCount >= HARD_DAILY_CAP) {
    logger.warn('[connection-sender] Hard daily cap reached — no more connections today', {
      agentId,
      todaySentCount,
      cap: HARD_DAILY_CAP,
    });
    return 0;
  }

  const remainingCap = HARD_DAILY_CAP - todaySentCount;
  const effectiveLimit = Math.min(limit, remainingCap);

  // Fetch queued prospects ordered by score DESC
  const prospects = await db.prospect.findMany({
    where: {
      agentId,
      status: 'queued',
    },
    orderBy: { score: 'desc' },
    take: effectiveLimit,
  });

  if (prospects.length === 0) {
    logger.info('[connection-sender] No queued prospects found', { agentId });
    return 0;
  }

  let sent = 0;

  for (let i = 0; i < prospects.length; i++) {
    const prospect = prospects[i];

    // Check budget before each send
    const dailyOk = await getRemaining('connectionRequestsDaily') > 0;
    const weeklyOk = await getRemaining('connectionRequestsWeekly') > 0;

    if (!dailyOk) {
      logger.info('[connection-sender] Daily connection budget exhausted', { agentId, sent });
      break;
    }
    if (!weeklyOk) {
      logger.info('[connection-sender] Weekly connection budget exhausted', { agentId, sent });
      break;
    }

    const success = await sendConnectionRequest(prospect);
    if (success) {
      sent++;
    }

    // Apply random delay between invitations (skip after last one)
    if (i < prospects.length - 1) {
      const delaySec = MIN_DELAY_SECONDS + Math.random() * (MAX_DELAY_SECONDS - MIN_DELAY_SECONDS);
      logger.debug('[connection-sender] Waiting before next connection request', {
        agentId,
        delaySeconds: Math.round(delaySec),
      });
      await sleep(Math.round(delaySec) * 1_000);
    }
  }

  logOperation(agentId, 'info', 'connection-sender', 'batch_complete',
    `Sent ${sent}/${prospects.length} connection requests`, { sent, attempted: prospects.length });

  return sent;
}
