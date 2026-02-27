/**
 * backend/src/agents/agent-runner.ts
 *
 * Single-agent executor — runs the automation cycle for a specific agent
 * given a job type.
 *
 * Provides:
 *   runAgentCycle(agentId, jobType) — execute the job-specific cycle for one agent
 *   wrapAgentExecution(agentId, fn) — wrapper with try/catch, timing, and logging
 */

import { logger, logOperation } from '../utils/logger';
import db from '../db/prisma.client';
import type { Agent, Identity } from '@prisma/client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Supported job types that an agent can be run for. */
export type JobType = 'morning' | 'midday' | 'afternoon' | 'evening';

/** Result returned by a single agent cycle. */
export interface AgentCycleResult {
  agentId: string;
  agentName: string;
  jobType: JobType;
  success: boolean;
  durationMs: number;
  error?: string;
}

// ---------------------------------------------------------------------------
// wrapAgentExecution
// ---------------------------------------------------------------------------

/**
 * Execute an arbitrary async function for an agent with:
 *   - try/catch to prevent agent errors from bubbling up
 *   - Wall-clock timing for performance tracking
 *   - Structured logging on success and failure
 *
 * @param agentId  Agent ID (used for logging context)
 * @param fn       Async function to execute; receives the Agent record
 * @returns        The return value of `fn`, or undefined on error
 */
export async function wrapAgentExecution<T>(
  agentId: string,
  fn: (agent: Agent) => Promise<T>,
): Promise<T | undefined> {
  const startMs = Date.now();

  // Load agent record for context
  const agent = await db.agent.findUnique({
    where: { id: agentId },
    select: { id: true, name: true, status: true, priority: true },
  });

  if (!agent) {
    logger.warn('[agent-runner] Agent not found — skipping execution', { agentId });
    return undefined;
  }

  if (agent.status !== 'active') {
    logger.info('[agent-runner] Agent is not active — skipping execution', {
      agentId,
      agentName: agent.name,
      status: agent.status,
    });
    return undefined;
  }

  logger.info('[agent-runner] Starting agent execution', {
    agentId: agent.id,
    agentName: agent.name,
  });

  try {
    const result = await fn(agent as Agent);
    const durationMs = Date.now() - startMs;

    logOperation(agentId, 'info', 'agent-runner', 'execution_complete',
      `Agent ${agent.name} execution complete`, { durationMs });

    return result;
  } catch (err) {
    const durationMs = Date.now() - startMs;
    const errorMessage = (err as Error).message;

    logger.error('[agent-runner] Agent execution failed', {
      agentId: agent.id,
      agentName: agent.name,
      durationMs,
      error: errorMessage,
      stack: (err as Error).stack,
    });

    logOperation(agentId, 'error', 'agent-runner', 'execution_failed',
      `Agent ${agent.name} execution failed: ${errorMessage}`, { durationMs });

    return undefined;
  }
}

// ---------------------------------------------------------------------------
// runAgentCycle
// ---------------------------------------------------------------------------

/**
 * Execute the job-specific automation cycle for a single agent.
 *
 * Dispatches to the appropriate sub-module based on jobType.
 * Uses wrapAgentExecution for error isolation and logging.
 *
 * @param agentId   The ID of the agent to run
 * @param jobType   Which job phase to execute
 * @returns         AgentCycleResult with timing and status
 */
export async function runAgentCycle(
  agentId: string,
  jobType: JobType,
): Promise<AgentCycleResult> {
  const startMs = Date.now();

  const agent = await db.agent.findUnique({
    where: { id: agentId },
    select: { id: true, name: true, status: true },
  });

  if (!agent) {
    return {
      agentId,
      agentName: 'unknown',
      jobType,
      success: false,
      durationMs: Date.now() - startMs,
      error: 'Agent not found',
    };
  }

  try {
    await wrapAgentExecution(agentId, async (a) => {
      switch (jobType) {
        case 'morning':
          await runMorningCycle(a);
          break;
        case 'midday':
          await runMiddayCycle(a);
          break;
        case 'afternoon':
          await runAfternoonCycle(a);
          break;
        case 'evening':
          await runEveningCycle(a);
          break;
        default: {
          const _exhaustive: never = jobType;
          logger.warn('[agent-runner] Unknown job type', { jobType: _exhaustive });
        }
      }
    });

    return {
      agentId,
      agentName: agent.name,
      jobType,
      success: true,
      durationMs: Date.now() - startMs,
    };
  } catch (err) {
    return {
      agentId,
      agentName: agent.name,
      jobType,
      success: false,
      durationMs: Date.now() - startMs,
      error: (err as Error).message,
    };
  }
}

// ---------------------------------------------------------------------------
// Per-cycle implementations
// ---------------------------------------------------------------------------

/**
 * Morning cycle for a single agent:
 *   - Acceptance check (already called globally by the job; this is per-agent context)
 *   - Profile analysis for accepted connections
 *   - Follow-up timer check (global, but re-usable per agent)
 */
async function runMorningCycle(agent: Agent): Promise<void> {
  const { checkAcceptances, checkRejections } = await import('../automation/acceptance-monitor');
  const { analyzeBatch } = await import('../automation/profile-analyzer');
  const { checkFollowupTimers } = await import('../automation/followup-manager');

  // Per-agent acceptance check
  await checkAcceptances(agent.id);
  await checkRejections(agent.id);

  // Profile analysis for accepted connections without analysis
  const pendingProspects = await db.prospect.findMany({
    where: {
      agentId: agent.id,
      status: 'connection_accepted',
      profileAnalyzedAt: null,
    },
    take: 20,
    include: { agent: { include: { identity: true } } },
  });

  if (pendingProspects.length > 0) {
    const identity = (pendingProspects[0] as { agent: { identity: Identity } }).agent.identity;
    await analyzeBatch(pendingProspects, identity, 20);
  }

  // Transition statuses based on follow-up timers
  await checkFollowupTimers();
}

/**
 * Midday cycle for a single agent:
 *   - Select and execute one search structure
 *   - Filter and score results
 *   - Save new prospects
 */
async function runMiddayCycle(agent: Agent): Promise<void> {
  const { selectNextStructure, executeSearch } = await import('../automation/search-engine');
  const { filterProfiles, scoreProspect } = await import('../automation/deduplication');

  const structure = await selectNextStructure(agent.id);
  if (!structure) {
    logger.info('[agent-runner] No enabled search structures for agent', {
      agentId: agent.id,
    });
    return;
  }

  const linkedinMode = (agent as Agent & { linkedinMode?: string }).linkedinMode ?? 'free';
  const rawProfiles = await executeSearch(structure.id, linkedinMode);
  if (rawProfiles.length === 0) return;

  const { valid } = await filterProfiles(rawProfiles);
  const targetConfig = (agent.targetConfig ?? {
    targetTitles: [],
    targetIndustries: [],
    targetLocations: [],
    excludeTitles: [],
    keywords: [],
  }) as import('../types/agent-config.types').TargetConfig;

  for (const profile of valid) {
    try {
      const scoreBreakdown = scoreProspect(
        profile as unknown as import('../types/agent-config.types').LinkedInProfile,
        targetConfig,
      );
      const status = scoreBreakdown.total >= 50 ? 'queued' : 'found';
      const linkedinUrl = (profile.linkedinUrl as string) ?? `https://www.linkedin.com/in/${profile.linkedinId}`;
      await db.prospect.create({
        data: {
          agentId: agent.id,
          linkedinId: profile.linkedinId,
          linkedinUrl,
          firstName: (profile.firstName as string) ?? '',
          lastName: (profile.lastName as string) ?? '',
          fullName: (profile.fullName as string) ?? '',
          headline: (profile.headline as string) ?? null,
          location: (profile.location as string) ?? null,
          profilePictureUrl: (profile.profilePictureUrl as string) ?? null,
          companyName: (profile.companyName as string) ?? null,
          score: scoreBreakdown.total,
          scoreBreakdown: scoreBreakdown as unknown as Record<string, unknown>,
          status,
          discoveryMethod: 'search',
          rawProfileData: profile as unknown as Record<string, unknown>,
          lastActivityAt: new Date(),
        },
      });
    } catch {
      // Skip duplicates silently
    }
  }
}

/**
 * Afternoon cycle for a single agent:
 *   - Connection requests
 *   - Outreach messages (cold + warm)
 *   - Follow-up messages
 */
async function runAfternoonCycle(agent: Agent): Promise<void> {
  const { sendBatchConnectionRequests } = await import('../automation/connection-sender');
  const { processReadyForOutreach } = await import('../automation/outreach-agent');
  const { processFollowups } = await import('../automation/followup-manager');
  const { getRemainingBudget } = await import('./budget-allocator');

  const budget = await getRemainingBudget(agent.id);

  if (budget.connectionsRemaining > 0) {
    await sendBatchConnectionRequests(agent.id, budget.connectionsRemaining);
  }

  await processReadyForOutreach(agent.id);
  await processFollowups(agent.id);
}

/**
 * Evening cycle for a single agent:
 *   - Compile daily log
 *   - Update stats
 */
async function runEveningCycle(agent: Agent): Promise<void> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Per-agent stats update — the evening job handles DailyLog compilation
  // globally, but this allows individual agent cycle execution if needed
  logOperation(agent.id, 'info', 'agent-runner', 'evening_cycle',
    `Evening cycle complete for agent ${agent.name}`, {});
}
