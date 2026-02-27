/**
 * backend/src/automation/jobs/midday.job.ts
 *
 * Midday Job — runs at 11:30 +/- 15 minutes.
 *
 * DC-06: Guard — if no active agents, log and return early.
 * DC-08: Acquire Redis SETNX lock 'job:lock:midday' (TTL 2h) before running.
 * DC-04: Global-first-found deduplication — filterProfiles checks linkedinId
 *        across ALL agents before saving.
 *
 * Steps per agent:
 *   1. Select least-recently-run search structure (round-robin)
 *   2. Execute LinkedIn search via Unipile
 *   3. Filter anonymous profiles + global cross-agent deduplication
 *   4. Score profiles and create prospects in DB
 *      (score >= 50 -> status='queued', score < 50 -> status='found')
 *   5. Update search structure metrics
 */

import { acquireLock, releaseLock } from '../../utils/job-lock';
import { logger, logOperation } from '../../utils/logger';
import { getActiveAgents } from '../../agents/orchestrator';
import { selectNextStructure, executeSearch } from '../search-engine';
import { filterProfiles, scoreProspect } from '../deduplication';
import db from '../../db/prisma.client';
import type { Agent } from '@prisma/client';
import type { TargetConfig, LinkedInProfile } from '../../types/agent-config.types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** TTL for the midday job lock (seconds) — 2 hours */
const MIDDAY_LOCK_TTL = 2 * 60 * 60;

/** Score threshold to place a prospect in the 'queued' state */
const QUEUE_SCORE_THRESHOLD = 50;

// ---------------------------------------------------------------------------
// Midday Job
// ---------------------------------------------------------------------------

/**
 * Execute the midday automation job.
 *
 * DC-06: Returns early if no active agents.
 * DC-08: Uses Redis SETNX lock to prevent concurrent execution.
 */
export async function runMiddayJob(): Promise<void> {
  const lockAcquired = await acquireLock('midday', MIDDAY_LOCK_TTL);
  if (!lockAcquired) {
    logger.warn('[midday-job] Could not acquire lock — job already running, skipping');
    return;
  }

  logger.info('[midday-job] Starting midday job');

  try {
    // DC-06: Guard — if no active agents, log and return early
    const activeAgents = await getActiveAgents();
    if (activeAgents.length === 0) {
      logger.info('[midday-job] No active agents, skipping midday job');
      return;
    }

    logger.info('[midday-job] Processing midday search cycle', {
      agentCount: activeAgents.length,
    });

    let totalNewProspects = 0;
    let totalQueued = 0;

    for (const agent of activeAgents) {
      try {
        const result = await processAgentSearch(agent);
        totalNewProspects += result.newProspects;
        totalQueued += result.queued;
      } catch (err) {
        logger.error('[midday-job] Search failed for agent', {
          agentId: agent.id,
          agentName: agent.name,
          error: (err as Error).message,
        });
        // Continue with other agents
      }
    }

    logger.info('[midday-job] Midday job complete', {
      activeAgents: activeAgents.length,
      totalNewProspects,
      totalQueued,
    });
  } catch (err) {
    logger.error('[midday-job] Midday job failed', {
      error: (err as Error).message,
      stack: (err as Error).stack,
    });
    throw err;
  } finally {
    await releaseLock('midday');
    logger.info('[midday-job] Lock released');
  }
}

// ---------------------------------------------------------------------------
// Per-agent search processing
// ---------------------------------------------------------------------------

interface AgentSearchResult {
  newProspects: number;
  queued: number;
  skippedAnonymous: number;
  skippedDuplicates: number;
}

/**
 * Run the full search-score-save pipeline for a single agent.
 *
 * Step 1: Select least-recently-run search structure
 * Step 2: Execute LinkedIn search via Unipile
 * Step 3: Filter anonymous + deduplicate cross-agent (DC-04)
 * Step 4: Score profiles and save to DB
 */
async function processAgentSearch(agent: Agent): Promise<AgentSearchResult> {
  // Step 1: Select next search structure (round-robin by lastExecutedAt)
  const structure = await selectNextStructure(agent.id);
  if (!structure) {
    logger.info('[midday-job] No enabled search structures found for agent', {
      agentId: agent.id,
      agentName: agent.name,
    });
    return { newProspects: 0, queued: 0, skippedAnonymous: 0, skippedDuplicates: 0 };
  }

  logger.info('[midday-job] Running search for agent', {
    agentId: agent.id,
    agentName: agent.name,
    structureId: structure.id,
  });

  // Step 2: Execute LinkedIn search
  const linkedinMode = (agent as Agent & { linkedinMode?: string }).linkedinMode ?? 'free';
  const rawProfiles = await executeSearch(structure.id, linkedinMode);

  if (rawProfiles.length === 0) {
    logger.info('[midday-job] No profiles returned from search', {
      agentId: agent.id,
      structureId: structure.id,
    });
    return { newProspects: 0, queued: 0, skippedAnonymous: 0, skippedDuplicates: 0 };
  }

  // Step 3: Filter anonymous profiles + cross-agent deduplication (DC-04)
  const { valid, skippedAnonymous, skippedDuplicates } = await filterProfiles(rawProfiles);

  logger.info('[midday-job] Filter complete', {
    agentId: agent.id,
    total: rawProfiles.length,
    valid: valid.length,
    skippedAnonymous,
    skippedDuplicates,
  });

  if (valid.length === 0) {
    return { newProspects: 0, queued: 0, skippedAnonymous, skippedDuplicates };
  }

  // Step 4: Score profiles and save to DB
  const targetConfig = (agent.targetConfig ?? {
    targetTitles: [],
    targetIndustries: [],
    targetLocations: [],
    excludeTitles: [],
    keywords: [],
  }) as TargetConfig;

  let saved = 0;
  let queued = 0;

  for (const profile of valid) {
    try {
      const linkedInProfile: LinkedInProfile = {
        linkedinId: profile.linkedinId,
        firstName: (profile.firstName as string) ?? '',
        lastName: (profile.lastName as string) ?? '',
        fullName: (profile.fullName as string) ?? `${profile.firstName ?? ''} ${profile.lastName ?? ''}`.trim(),
        headline: (profile.headline as string) ?? null,
        location: (profile.location as string) ?? null,
        profilePictureUrl: (profile.profilePictureUrl as string) ?? null,
        industry: (profile.industry as string) ?? null,
        connectionCount: (profile.connectionCount as number) ?? 0,
        mutualConnections: (profile.mutualConnections as number) ?? 0,
        hasExperience: (profile.hasExperience as boolean) ?? false,
        companyName: (profile.companyName as string) ?? null,
      };

      const scoreBreakdown = scoreProspect(linkedInProfile, targetConfig);
      const status = scoreBreakdown.total >= QUEUE_SCORE_THRESHOLD ? 'queued' : 'found';

      // Build LinkedIn URL from ID (Unipile returns public LinkedIn IDs)
      const linkedinUrl = (profile.linkedinUrl as string) ?? `https://www.linkedin.com/in/${profile.linkedinId}`;

      // Upsert prospect — skip if already exists (DB unique constraint on linkedinId)
      await db.prospect.create({
        data: {
          agentId: agent.id,
          linkedinId: profile.linkedinId,
          linkedinUrl,
          firstName: linkedInProfile.firstName,
          lastName: linkedInProfile.lastName,
          fullName: linkedInProfile.fullName,
          headline: linkedInProfile.headline,
          location: linkedInProfile.location,
          profilePictureUrl: linkedInProfile.profilePictureUrl,
          companyName: linkedInProfile.companyName,
          score: scoreBreakdown.total,
          scoreBreakdown: scoreBreakdown as unknown as Record<string, unknown>,
          status,
          discoveryMethod: 'search',
          rawProfileData: profile as unknown as Record<string, unknown>,
          lastActivityAt: new Date(),
        },
      });

      saved++;
      if (status === 'queued') queued++;
    } catch (err) {
      // Unique constraint violation = already exists in another agent (DC-04 race condition)
      // Log at debug level and continue
      logger.debug('[midday-job] Prospect already exists (race condition or constraint) — skipping', {
        linkedinId: profile.linkedinId,
        error: (err as Error).message,
      });
    }
  }

  logOperation(agent.id, 'info', 'midday-job', 'search_complete',
    `Search complete for agent ${agent.name}: ${saved} new prospects (${queued} queued)`, {
      structureId: structure.id,
      rawFound: rawProfiles.length,
      skippedAnonymous,
      skippedDuplicates,
      saved,
      queued,
    });

  return { newProspects: saved, queued, skippedAnonymous, skippedDuplicates };
}
