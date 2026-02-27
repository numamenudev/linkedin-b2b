/**
 * backend/src/agents/agent-lifecycle.ts
 *
 * Agent lifecycle management — state transitions for agents.
 *
 * Valid status transitions:
 *   paused   -> active   (activateAgent)
 *   active   -> paused   (pauseAgent)
 *   active   -> archived (archiveAgent)
 *   paused   -> archived (archiveAgent)
 *
 * Activation requires the associated Identity to be approved (approvedByUser=true).
 * Archiving an agent does NOT delete data — it stops automation and hides
 * the agent from active queries.
 */

import { logger, logOperation } from '../utils/logger';
import db from '../db/prisma.client';
import type { Agent } from '@prisma/client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Valid agent status values. */
export type AgentStatus = 'active' | 'paused' | 'archived';

/** Full agent status snapshot returned by getAgentStatus. */
export interface AgentStatusSnapshot {
  agentId: string;
  agentName: string;
  status: AgentStatus;
  identityApproved: boolean;
  identityName: string;
  statsJson: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  activeProspects: number;
  totalProspects: number;
  connectionsToday: number;
  messagesToday: number;
}

// ---------------------------------------------------------------------------
// activateAgent
// ---------------------------------------------------------------------------

/**
 * Activate an agent — set status='active'.
 *
 * Requirements:
 *   - Agent must exist
 *   - Agent must not already be active
 *   - Associated Identity must be approved (approvedByUser=true)
 *
 * @param agentId  ID of the agent to activate
 * @returns        Updated Agent record
 * @throws         Error if agent not found, already active, or identity not approved
 */
export async function activateAgent(agentId: string): Promise<Agent> {
  const agent = await db.agent.findUnique({
    where: { id: agentId },
    include: { identity: true },
  });

  if (!agent) {
    throw new Error(`[agent-lifecycle] Agent not found: ${agentId}`);
  }

  if (agent.status === 'active') {
    logger.warn('[agent-lifecycle] Agent is already active', {
      agentId,
      agentName: agent.name,
    });
    return agent;
  }

  if (agent.status === 'archived') {
    throw new Error(
      `[agent-lifecycle] Cannot activate archived agent ${agent.name} — create a new agent instead`,
    );
  }

  // Verify identity is approved
  if (!agent.identity.approvedByUser) {
    throw new Error(
      `[agent-lifecycle] Cannot activate agent ${agent.name}: identity "${agent.identity.name}" is not yet approved. ` +
      `Approve the identity first via Settings -> Identities.`,
    );
  }

  const updated = await db.agent.update({
    where: { id: agentId },
    data: { status: 'active' },
  });

  logOperation(agentId, 'info', 'agent-lifecycle', 'agent_activated',
    `Agent ${agent.name} activated`, {
      previousStatus: agent.status,
      identityId: agent.identityId,
    });

  logger.info('[agent-lifecycle] Agent activated', {
    agentId,
    agentName: agent.name,
  });

  return updated;
}

// ---------------------------------------------------------------------------
// pauseAgent
// ---------------------------------------------------------------------------

/**
 * Pause an agent — set status='paused'.
 *
 * Pausing stops automation but retains all data. The agent can be reactivated.
 * Pausing an already-paused agent is a no-op (idempotent).
 *
 * @param agentId  ID of the agent to pause
 * @returns        Updated Agent record
 * @throws         Error if agent not found or archived
 */
export async function pauseAgent(agentId: string): Promise<Agent> {
  const agent = await db.agent.findUnique({
    where: { id: agentId },
    select: { id: true, name: true, status: true },
  });

  if (!agent) {
    throw new Error(`[agent-lifecycle] Agent not found: ${agentId}`);
  }

  if (agent.status === 'paused') {
    logger.warn('[agent-lifecycle] Agent is already paused', {
      agentId,
      agentName: agent.name,
    });
    return db.agent.findUnique({ where: { id: agentId } }) as Promise<Agent>;
  }

  if (agent.status === 'archived') {
    throw new Error(`[agent-lifecycle] Cannot pause archived agent ${agent.name}`);
  }

  const updated = await db.agent.update({
    where: { id: agentId },
    data: { status: 'paused' },
  });

  logOperation(agentId, 'info', 'agent-lifecycle', 'agent_paused',
    `Agent ${agent.name} paused`, { previousStatus: agent.status });

  logger.info('[agent-lifecycle] Agent paused', {
    agentId,
    agentName: agent.name,
  });

  return updated;
}

// ---------------------------------------------------------------------------
// archiveAgent
// ---------------------------------------------------------------------------

/**
 * Archive an agent — set status='archived'.
 *
 * Archiving permanently stops automation for this agent.
 * All data (prospects, messages, logs) is retained.
 * An archived agent cannot be reactivated — create a new agent instead.
 *
 * Archiving an already-archived agent is a no-op (idempotent).
 *
 * @param agentId  ID of the agent to archive
 * @returns        Updated Agent record
 * @throws         Error if agent not found
 */
export async function archiveAgent(agentId: string): Promise<Agent> {
  const agent = await db.agent.findUnique({
    where: { id: agentId },
    select: { id: true, name: true, status: true },
  });

  if (!agent) {
    throw new Error(`[agent-lifecycle] Agent not found: ${agentId}`);
  }

  if (agent.status === 'archived') {
    logger.warn('[agent-lifecycle] Agent is already archived', {
      agentId,
      agentName: agent.name,
    });
    return db.agent.findUnique({ where: { id: agentId } }) as Promise<Agent>;
  }

  const updated = await db.agent.update({
    where: { id: agentId },
    data: { status: 'archived' },
  });

  logOperation(agentId, 'info', 'agent-lifecycle', 'agent_archived',
    `Agent ${agent.name} archived`, { previousStatus: agent.status });

  logger.info('[agent-lifecycle] Agent archived', {
    agentId,
    agentName: agent.name,
  });

  return updated;
}

// ---------------------------------------------------------------------------
// getAgentStatus
// ---------------------------------------------------------------------------

/**
 * Return the current status snapshot for an agent, including stats and
 * today's activity counters.
 *
 * @param agentId  ID of the agent to query
 * @returns        Full status snapshot
 * @throws         Error if agent not found
 */
export async function getAgentStatus(agentId: string): Promise<AgentStatusSnapshot> {
  const agent = await db.agent.findUnique({
    where: { id: agentId },
    include: { identity: true },
  });

  if (!agent) {
    throw new Error(`[agent-lifecycle] Agent not found: ${agentId}`);
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Today's activity counters
  const [connectionsToday, messagesToday, activeProspects, totalProspects] = await Promise.all([
    db.prospect.count({
      where: {
        agentId,
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
    db.prospect.count({
      where: {
        agentId,
        status: {
          notIn: ['archived', 'opted_out', 'connection_rejected', 'connection_expired',
                  'responded', 'active_conversation', 'responded_manually'],
        },
      },
    }),
    db.prospect.count({ where: { agentId } }),
  ]);

  return {
    agentId: agent.id,
    agentName: agent.name,
    status: agent.status as AgentStatus,
    identityApproved: agent.identity.approvedByUser,
    identityName: agent.identity.name,
    statsJson: (agent.statsJson ?? {}) as Record<string, unknown>,
    createdAt: agent.createdAt,
    updatedAt: agent.updatedAt,
    activeProspects,
    totalProspects,
    connectionsToday,
    messagesToday,
  };
}
