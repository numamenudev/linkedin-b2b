/**
 * backend/src/automation/acceptance-monitor.ts
 *
 * Monitors LinkedIn invitation acceptances and rejections via Unipile polling.
 *
 * DC-16: Polling fallback every 4 hours to supplement webhook delivery.
 * Deduplicates events already processed via webhook by checking prospect status.
 *
 * When a connection is accepted:
 *   - Prospect status: connection_sent -> connection_accepted -> ready_for_outreach
 *   - Sets connectionAcceptedAt, queues for profile analysis
 *
 * When a connection is rejected/declined:
 *   - Prospect status: connection_sent -> connection_rejected
 *   - Sets connectionRejectedAt
 */

import { unipileClient } from '../integrations/unipile/unipile.client';
import { logger, logOperation } from '../utils/logger';
import db from '../db/prisma.client';

// ---------------------------------------------------------------------------
// Per-agent check functions
// ---------------------------------------------------------------------------

/**
 * Check for accepted invitations for a specific agent.
 * Calls Unipile for invitations accepted since yesterday,
 * updates matching prospect records.
 *
 * @param agentId  Agent ID to check
 */
export async function checkAcceptances(agentId: string): Promise<number> {
  const since = new Date();
  since.setDate(since.getDate() - 1); // yesterday
  const sinceISO = since.toISOString();

  const accountId = process.env.UNIPILE_ACCOUNT_ID ?? '';

  let processed = 0;
  try {
    const invitations = await unipileClient.getInvitations(accountId, 'accepted', sinceISO);

    for (const inv of invitations) {
      const linkedinId = inv.providerId;
      if (!linkedinId) continue;

      // Find prospect in this agent that is still in 'connection_sent' status
      const prospect = await db.prospect.findFirst({
        where: {
          agentId,
          linkedinId,
          status: 'connection_sent',
        },
      });

      if (!prospect) {
        // Already processed via webhook or not found — skip silently
        continue;
      }

      // Transition: connection_sent -> connection_accepted -> ready_for_outreach
      await db.prospect.update({
        where: { id: prospect.id },
        data: {
          status: 'ready_for_outreach',
          connectionAcceptedAt: new Date(),
          lastActivityAt: new Date(),
        },
      });

      logOperation(agentId, 'info', 'acceptance-monitor', 'connection_accepted',
        `Connection accepted by ${prospect.fullName}`, { prospectId: prospect.id });

      processed++;
    }
  } catch (err) {
    logger.error('[acceptance-monitor] checkAcceptances failed', {
      agentId,
      error: (err as Error).message,
    });
    throw err;
  }

  return processed;
}

/**
 * Check for rejected/declined invitations for a specific agent.
 * Calls Unipile for declined invitations since yesterday,
 * updates matching prospect records.
 *
 * @param agentId  Agent ID to check
 */
export async function checkRejections(agentId: string): Promise<number> {
  const since = new Date();
  since.setDate(since.getDate() - 1); // yesterday
  const sinceISO = since.toISOString();

  const accountId = process.env.UNIPILE_ACCOUNT_ID ?? '';

  let processed = 0;
  try {
    const invitations = await unipileClient.getInvitations(accountId, 'declined', sinceISO);

    for (const inv of invitations) {
      const linkedinId = inv.providerId;
      if (!linkedinId) continue;

      const prospect = await db.prospect.findFirst({
        where: {
          agentId,
          linkedinId,
          status: 'connection_sent',
        },
      });

      if (!prospect) continue;

      await db.prospect.update({
        where: { id: prospect.id },
        data: {
          status: 'connection_rejected',
          connectionRejectedAt: new Date(),
          lastActivityAt: new Date(),
        },
      });

      logOperation(agentId, 'info', 'acceptance-monitor', 'connection_rejected',
        `Connection rejected by ${prospect.fullName}`, { prospectId: prospect.id });

      processed++;
    }
  } catch (err) {
    logger.error('[acceptance-monitor] checkRejections failed', {
      agentId,
      error: (err as Error).message,
    });
    throw err;
  }

  return processed;
}

// ---------------------------------------------------------------------------
// Batch run across all active agents
// ---------------------------------------------------------------------------

/**
 * DC-16: Run acceptance + rejection checks for every active agent.
 * Called by the morning job and by the 4-hour polling cron fallback.
 */
export async function runAcceptanceCheck(): Promise<void> {
  const agents = await db.agent.findMany({
    where: { status: 'active' },
    select: { id: true, name: true },
  });

  if (agents.length === 0) {
    logger.info('[acceptance-monitor] No active agents — skipping acceptance check');
    return;
  }

  for (const agent of agents) {
    try {
      const accepted = await checkAcceptances(agent.id);
      const rejected = await checkRejections(agent.id);

      logOperation(agent.id, 'info', 'acceptance-monitor', 'run_complete',
        `Acceptance check complete for agent ${agent.name}`, { accepted, rejected });
    } catch (err) {
      logger.error('[acceptance-monitor] runAcceptanceCheck failed for agent', {
        agentId: agent.id,
        agentName: agent.name,
        error: (err as Error).message,
      });
      // Continue with other agents even if one fails
    }
  }
}

/**
 * DC-16: Alias used by the scheduler's 4-hour polling cron.
 */
export async function acceptancePollingJob(): Promise<void> {
  logger.info('[acceptance-monitor] Running 4-hour acceptance polling fallback');
  await runAcceptanceCheck();
}
