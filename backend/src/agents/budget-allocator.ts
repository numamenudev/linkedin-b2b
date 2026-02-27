/**
 * backend/src/agents/budget-allocator.ts
 *
 * Distributes daily/weekly LinkedIn budget across active agents.
 *
 * Allocation is proportional to each agent's dailyConnectionRequests setting
 * and respects global limits (Settings.globalDailyConnectionLimit, etc.).
 *
 * DC-06: Returns empty array when agents = [].
 * DC-09: Uses reconciled Redis counters (caller should reconcile before calling).
 */

import { logger } from '../utils/logger';
import db from '../db/prisma.client';
import type { Agent } from '@prisma/client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BudgetAllocation {
  agentId: string;
  agentName: string;
  connectionsAllowed: number;   // How many connection requests this agent may send today
  messagesAllowed: number;      // How many messages this agent may send today
}

// ---------------------------------------------------------------------------
// Calculate daily budget (global remaining)
// ---------------------------------------------------------------------------

/**
 * Calculate the remaining global budget for today.
 *
 * Reads Redis counters for already-consumed slots and subtracts from global limits.
 *
 * @returns Object with remaining connections (daily + weekly) and messages
 */
export async function calculateDailyBudget(): Promise<{
  connectionsRemainingDaily: number;
  connectionsRemainingWeekly: number;
  messagesRemainingDaily: number;
}> {
  const { getRemainingLimit } = await import('../utils/rate-limiter');

  const [dailyConns, weeklyConns, dailyMsgs] = await Promise.all([
    getRemainingLimit('connectionRequestsDaily'),
    getRemainingLimit('connectionRequestsWeekly'),
    getRemainingLimit('messagesDaily'),
  ]);

  return {
    connectionsRemainingDaily: dailyConns,
    connectionsRemainingWeekly: weeklyConns,
    messagesRemainingDaily: dailyMsgs,
  };
}

// ---------------------------------------------------------------------------
// Allocate budget across agents
// ---------------------------------------------------------------------------

/**
 * Distribute the remaining global budget proportionally across agents.
 *
 * Distribution algorithm:
 *   1. Sum all agents' dailyConnectionRequests to get the total weight.
 *   2. Each agent's share = (agent.dailyConnectionRequests / totalWeight) * globalRemaining
 *   3. Floor the share, then distribute any remainder to highest-priority agents.
 *   4. Cap each agent's share at their own dailyConnectionRequests setting.
 *
 * The same proportional approach applies to message budgets.
 *
 * DC-06: Returns [] if agents is empty.
 *
 * @param agents  Active agents (caller should filter to active only)
 * @returns       Per-agent budget allocation
 */
export async function allocateBudget(agents: Agent[]): Promise<BudgetAllocation[]> {
  // DC-06: Guard for zero agents
  if (agents.length === 0) {
    logger.info('[budget-allocator] No agents provided — returning empty allocation');
    return [];
  }

  const budget = await calculateDailyBudget();

  // The effective daily remaining is the min of daily and weekly remaining
  const effectiveConnectionBudget = Math.min(
    budget.connectionsRemainingDaily,
    budget.connectionsRemainingWeekly,
  );
  const effectiveMessageBudget = budget.messagesRemainingDaily;

  if (effectiveConnectionBudget <= 0 && effectiveMessageBudget <= 0) {
    logger.warn('[budget-allocator] Global budget exhausted — all allocations are 0');
    return agents.map((a) => ({
      agentId: a.id,
      agentName: a.name,
      connectionsAllowed: 0,
      messagesAllowed: 0,
    }));
  }

  // Calculate total weight for proportional distribution
  const totalConnectionWeight = agents.reduce((sum, a) => sum + (a.dailyConnectionRequests || 1), 0);
  const totalMessageWeight = agents.reduce((sum, a) => sum + (a.dailyMessages || 1), 0);

  // First pass: calculate floor allocations
  const allocations: BudgetAllocation[] = agents.map((agent) => {
    const connectionShare = Math.floor(
      (agent.dailyConnectionRequests / totalConnectionWeight) * effectiveConnectionBudget,
    );
    const messageShare = Math.floor(
      (agent.dailyMessages / totalMessageWeight) * effectiveMessageBudget,
    );

    return {
      agentId: agent.id,
      agentName: agent.name,
      // Cap at agent's own limit
      connectionsAllowed: Math.min(connectionShare, agent.dailyConnectionRequests),
      messagesAllowed: Math.min(messageShare, agent.dailyMessages),
    };
  });

  // Second pass: distribute remainder to highest-priority agents (lowest priority number = highest priority)
  const connectionRemainder =
    effectiveConnectionBudget - allocations.reduce((sum, a) => sum + a.connectionsAllowed, 0);
  const messageRemainder =
    effectiveMessageBudget - allocations.reduce((sum, a) => sum + a.messagesAllowed, 0);

  // Sort by priority (ascending = highest priority first)
  const sortedIndices = agents
    .map((a, i) => ({ index: i, priority: a.priority }))
    .sort((a, b) => a.priority - b.priority)
    .map((x) => x.index);

  // Distribute connection remainder
  let connRemaining = connectionRemainder;
  for (const idx of sortedIndices) {
    if (connRemaining <= 0) break;
    const agent = agents[idx];
    const canAdd = agent.dailyConnectionRequests - allocations[idx].connectionsAllowed;
    const add = Math.min(1, canAdd, connRemaining);
    allocations[idx].connectionsAllowed += add;
    connRemaining -= add;
  }

  // Distribute message remainder
  let msgRemaining = messageRemainder;
  for (const idx of sortedIndices) {
    if (msgRemaining <= 0) break;
    const agent = agents[idx];
    const canAdd = agent.dailyMessages - allocations[idx].messagesAllowed;
    const add = Math.min(1, canAdd, msgRemaining);
    allocations[idx].messagesAllowed += add;
    msgRemaining -= add;
  }

  logger.info('[budget-allocator] Budget allocated', {
    effectiveConnectionBudget,
    effectiveMessageBudget,
    allocations: allocations.map((a) => ({
      agentName: a.agentName,
      connections: a.connectionsAllowed,
      messages: a.messagesAllowed,
    })),
  });

  return allocations;
}

// ---------------------------------------------------------------------------
// Per-agent remaining budget
// ---------------------------------------------------------------------------

/**
 * Get the remaining budget for a specific agent today.
 *
 * Calculates from global remaining budget divided by active agent count,
 * then caps at the agent's own dailyConnectionRequests setting.
 *
 * @param agentId  Agent ID to query
 * @returns        Remaining connections and messages allowed for this agent today
 */
export async function getRemainingBudget(agentId: string): Promise<{
  connectionsRemaining: number;
  messagesRemaining: number;
}> {
  const agent = await db.agent.findUnique({
    where: { id: agentId },
    select: {
      dailyConnectionRequests: true,
      dailyMessages: true,
    },
  });

  if (!agent) {
    logger.warn('[budget-allocator] Agent not found', { agentId });
    return { connectionsRemaining: 0, messagesRemaining: 0 };
  }

  const { getRemainingLimit } = await import('../utils/rate-limiter');

  // Count how many connections this agent has sent today
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [agentConnectionsSentToday, agentMessagesSentToday] = await Promise.all([
    db.prospect.count({
      where: {
        agentId,
        status: 'connection_sent',
        connectionRequestSentAt: { gte: today },
      },
    }),
    db.message.count({
      where: {
        prospect: { agentId },
        direction: 'outbound',
        sentAt: { gte: today },
      },
    }),
  ]);

  // Global remaining
  const globalDailyConnsRemaining = await getRemainingLimit('connectionRequestsDaily');
  const globalWeeklyConnsRemaining = await getRemainingLimit('connectionRequestsWeekly');
  const globalMsgsRemaining = await getRemainingLimit('messagesDaily');

  // Agent's own remaining (capped at global)
  const agentConnsRemaining = Math.max(
    0,
    Math.min(
      agent.dailyConnectionRequests - agentConnectionsSentToday,
      globalDailyConnsRemaining,
      globalWeeklyConnsRemaining,
    ),
  );

  const agentMsgsRemaining = Math.max(
    0,
    Math.min(
      agent.dailyMessages - agentMessagesSentToday,
      globalMsgsRemaining,
    ),
  );

  return {
    connectionsRemaining: agentConnsRemaining,
    messagesRemaining: agentMsgsRemaining,
  };
}
