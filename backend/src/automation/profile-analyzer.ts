/**
 * backend/src/automation/profile-analyzer.ts
 *
 * AI-powered profile analysis using Claude Sonnet.
 *
 * DC-13: On Claude failure, retry once after 5s. On second failure, skip prospect
 * (prospect remains in current status for next day). Never store empty analysis.
 *
 * profileAnalysisAttempts counter prevents infinite retries:
 * max 3 attempts, then mark as 'analysis_failed' in profileAnalysis field.
 *
 * CONS-011: Prospect data is wrapped in <prospect_data> XML tags in the prompt.
 */

import { claudeClient } from '../integrations/claude/claude.client';
import {
  PROFILE_ANALYSIS_SYSTEM_PROMPT,
  buildProfileAnalysisUserPrompt,
  type IdentityContext,
} from '../integrations/claude/claude.prompts';
import { logger, logOperation } from '../utils/logger';
import { sleep } from '../utils/helpers';
import db from '../db/prisma.client';
import type { Prospect, Identity } from '@prisma/client';
import type { TargetConfig } from '../types/agent-config.types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum number of profile analysis attempts before giving up. */
const MAX_ANALYSIS_ATTEMPTS = 3;

/** Delay in ms between batch analysis items (3-5 seconds). */
const BATCH_DELAY_MIN_MS = 3_000;
const BATCH_DELAY_MAX_MS = 5_000;

// ---------------------------------------------------------------------------
// Single profile analysis
// ---------------------------------------------------------------------------

/**
 * Analyse a single LinkedIn prospect's profile using Claude Sonnet.
 *
 * Saves the analysis as JSON in prospect.profileAnalysis and sets profileAnalyzedAt.
 * Increments a profileAnalysisAttempts counter stored in profileAnalysis.
 *
 * @param prospect   The Prospect record to analyse
 * @param identity   The Identity (agent persona) context
 * @returns          true if analysis succeeded, false otherwise
 */
export async function analyzeProfile(
  prospect: Prospect,
  identity: Identity,
): Promise<boolean> {
  // Check attempt counter
  const currentAnalysis = prospect.profileAnalysis as Record<string, unknown> | null;
  const attempts = (currentAnalysis?.analysisAttempts as number) ?? 0;

  if (attempts >= MAX_ANALYSIS_ATTEMPTS) {
    logger.warn('[profile-analyzer] Max analysis attempts reached — marking as failed', {
      prospectId: prospect.id,
      attempts,
    });
    await db.prospect.update({
      where: { id: prospect.id },
      data: {
        profileAnalysis: {
          ...currentAnalysis,
          status: 'analysis_failed',
          analysisAttempts: attempts,
          failedAt: new Date().toISOString(),
        },
      },
    });
    return false;
  }

  // Build identity context from Identity record
  const toneProfile = identity.toneProfile as Record<string, unknown>;
  const companyContext = identity.companyContext as Record<string, unknown>;

  const identityContext: IdentityContext = {
    name: identity.personaName,
    role: identity.role,
    company: identity.company,
    valueProposition: (companyContext?.valueProposition as string) ?? `${identity.personaName} di ${identity.company}`,
    tone: (toneProfile?.tone as string) ?? 'professionale ma amichevole',
    language: (toneProfile?.language as string) ?? 'it',
    fullContextPrompt: identity.fullContextPrompt,
  };

  // Get agent's target config to build analysis criteria
  const agent = await db.agent.findFirst({
    where: { identityId: identity.id },
    select: { targetConfig: true },
  });

  const targetConfig = (agent?.targetConfig ?? {
    targetTitles: [],
    targetIndustries: [],
    targetLocations: [],
    excludeTitles: [],
    keywords: [],
  }) as TargetConfig;

  // Build prospect data object for the prompt
  const prospectData: Record<string, unknown> = {
    fullName: prospect.fullName,
    firstName: prospect.firstName,
    lastName: prospect.lastName,
    headline: prospect.headline,
    location: prospect.location,
    companyName: prospect.companyName,
    restaurantName: prospect.restaurantName,
    restaurantType: prospect.restaurantType,
    estimatedSize: prospect.estimatedSize,
    rawProfile: prospect.rawProfileData,
  };

  const systemPrompt = PROFILE_ANALYSIS_SYSTEM_PROMPT(identityContext);
  const userPrompt = buildProfileAnalysisUserPrompt(prospectData, {
    targetTitles: targetConfig.targetTitles,
    targetIndustries: targetConfig.targetIndustries,
    targetLocations: targetConfig.targetLocations,
    excludeTitles: targetConfig.excludeTitles,
  });

  try {
    const rawResponse = await claudeClient.analyzeProfile(systemPrompt, userPrompt);

    // Parse the JSON response
    let analysis: Record<string, unknown>;
    try {
      analysis = JSON.parse(rawResponse);
    } catch {
      // Try to extract JSON from response
      const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('[profile-analyzer] Claude returned non-JSON response');
      }
      analysis = JSON.parse(jsonMatch[0]);
    }

    // Save analysis + update attempt counter
    await db.prospect.update({
      where: { id: prospect.id },
      data: {
        profileAnalysis: {
          ...analysis,
          status: 'analyzed',
          analysisAttempts: attempts + 1,
          analyzedAt: new Date().toISOString(),
        },
        profileAnalyzedAt: new Date(),
        lastActivityAt: new Date(),
      },
    });

    logOperation(prospect.agentId, 'info', 'profile-analyzer', 'profile_analyzed',
      `Profile analyzed for ${prospect.fullName}`, {
        prospectId: prospect.id,
        relevanceScore: analysis.relevanceScore,
      });

    return true;
  } catch (err) {
    // Increment attempt counter on failure
    await db.prospect.update({
      where: { id: prospect.id },
      data: {
        profileAnalysis: {
          ...(currentAnalysis ?? {}),
          status: 'analysis_error',
          analysisAttempts: attempts + 1,
          lastError: (err as Error).message,
        },
      },
    });

    logger.error('[profile-analyzer] analyzeProfile failed', {
      prospectId: prospect.id,
      fullName: prospect.fullName,
      attempts: attempts + 1,
      error: (err as Error).message,
    });

    return false;
  }
}

// ---------------------------------------------------------------------------
// Batch analysis
// ---------------------------------------------------------------------------

/**
 * Analyse a batch of prospects for a given identity.
 * Applies a 3-5 second delay between each analysis to avoid Claude rate limits.
 *
 * @param prospects  Array of Prospect records to analyse
 * @param identity   Agent identity context
 * @param maxCount   Maximum number of profiles to analyse in this batch
 * @returns          Number of successfully analysed profiles
 */
export async function analyzeBatch(
  prospects: Prospect[],
  identity: Identity,
  maxCount: number = 20,
): Promise<number> {
  const batch = prospects.slice(0, maxCount);
  let successCount = 0;

  for (let i = 0; i < batch.length; i++) {
    const prospect = batch[i];

    const success = await analyzeProfile(prospect, identity);
    if (success) successCount++;

    // Delay between analyses (skip after last)
    if (i < batch.length - 1) {
      const delayMs = BATCH_DELAY_MIN_MS + Math.random() * (BATCH_DELAY_MAX_MS - BATCH_DELAY_MIN_MS);
      await sleep(Math.round(delayMs));
    }
  }

  logger.info('[profile-analyzer] analyzeBatch complete', {
    attempted: batch.length,
    succeeded: successCount,
    identityId: identity.id,
  });

  return successCount;
}
