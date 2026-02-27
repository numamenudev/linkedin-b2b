/**
 * backend/src/agents/orchestrator.ts
 *
 * Platform orchestrator — manages execution across all active agents.
 *
 * DC-06: Zero-agents guard — every job must check for active agents before
 * proceeding. If none are active, log and return immediately.
 *
 * The orchestrator does not own business logic; it delegates to the individual
 * automation modules (search-engine, connection-sender, outreach-agent, etc.).
 */

import { logger } from '../utils/logger';
import db from '../db/prisma.client';
import type { Agent } from '@prisma/client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GlobalBudget {
  dailyConnectionsUsed: number;
  dailyConnectionsLimit: number;
  weeklyConnectionsUsed: number;
  weeklyConnectionsLimit: number;
  dailyMessagesUsed: number;
  dailyMessagesLimit: number;
  dailyConnectionsRemaining: number;
  weeklyConnectionsRemaining: number;
  dailyMessagesRemaining: number;
}

// ---------------------------------------------------------------------------
// Active agents
// ---------------------------------------------------------------------------

/**
 * Return all agents with status='active'.
 * Includes identity for prompt context.
 */
export async function getActiveAgents(): Promise<Agent[]> {
  const agents = await db.agent.findMany({
    where: { status: 'active' },
    orderBy: { priority: 'asc' },
  });
  return agents;
}

// ---------------------------------------------------------------------------
// Run for all active agents
// ---------------------------------------------------------------------------

/**
 * Execute an async function for each active agent.
 * DC-06: If no active agents, logs the guard message and returns immediately.
 *
 * Individual agent errors are caught so that one failure doesn't prevent
 * other agents from running.
 *
 * @param fn      Async function to run per agent; receives the Agent record
 * @param jobName Name of the job for logging (e.g., 'morning', 'afternoon')
 */
export async function runForAllActiveAgents(
  fn: (agent: Agent) => Promise<void>,
  jobName: string = 'unknown',
): Promise<void> {
  const agents = await getActiveAgents();

  // DC-06: Zero-agents guard
  if (agents.length === 0) {
    logger.info(`[orchestrator] No active agents — skipping ${jobName} job`);
    return;
  }

  logger.info(`[orchestrator] Running ${jobName} for ${agents.length} active agents`, {
    agentIds: agents.map((a) => a.id),
  });

  for (const agent of agents) {
    try {
      await fn(agent);
    } catch (err) {
      logger.error(`[orchestrator] Error running ${jobName} for agent ${agent.name}`, {
        agentId: agent.id,
        agentName: agent.name,
        error: (err as Error).message,
        stack: (err as Error).stack,
      });
      // Continue with next agent
    }
  }

  logger.info(`[orchestrator] ${jobName} complete for all active agents`);
}

// ---------------------------------------------------------------------------
// Global budget
// ---------------------------------------------------------------------------

/**
 * Read global connection and message budget from Redis counters and Settings.
 * Used by the afternoon job for DC-09 counter reconciliation.
 */
export async function getGlobalBudget(): Promise<GlobalBudget> {
  // Lazy import to avoid circular dependencies with queue.ts
  const { getDailyUsage } = await import('../utils/rate-limiter');
  const usage = await getDailyUsage();

  // Read limits from Settings DB (or use defaults)
  const settings = await db.settings.findUnique({
    where: { id: 'singleton' },
    select: {
      globalDailyConnectionLimit: true,
      globalWeeklyConnectionLimit: true,
      globalDailyMessageLimit: true,
    },
  });

  const dailyConnectionsLimit = settings?.globalDailyConnectionLimit ?? 21;
  const weeklyConnectionsLimit = settings?.globalWeeklyConnectionLimit ?? 150;
  const dailyMessagesLimit = settings?.globalDailyMessageLimit ?? 25;

  // Read weekly counter separately
  const { getRemainingLimit } = await import('../utils/rate-limiter');
  const weeklyRemaining = await getRemainingLimit('connectionRequestsWeekly');
  const weeklyConnectionsUsed = weeklyConnectionsLimit - weeklyRemaining;

  const dailyConnectionsUsed = usage['connectionRequestsDaily'] ?? 0;
  const dailyMessagesUsed = usage['messagesDaily'] ?? 0;

  return {
    dailyConnectionsUsed,
    dailyConnectionsLimit,
    weeklyConnectionsUsed,
    weeklyConnectionsLimit,
    dailyMessagesUsed,
    dailyMessagesLimit,
    dailyConnectionsRemaining: Math.max(0, dailyConnectionsLimit - dailyConnectionsUsed),
    weeklyConnectionsRemaining: Math.max(0, weeklyConnectionsLimit - weeklyConnectionsUsed),
    dailyMessagesRemaining: Math.max(0, dailyMessagesLimit - dailyMessagesUsed),
  };
}
