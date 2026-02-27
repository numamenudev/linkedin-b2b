/**
 * backend/src/automation/deduplication.ts
 *
 * Anonymous profile detection + global cross-agent deduplication (DC-04).
 *
 * DC-04: Global-first-found uniqueness.
 * Before saving a new prospect, check if linkedinId exists in ANY agent.
 * If found in any agent (regardless of which one), skip the profile.
 *
 * Anonymous profile patterns are defined in helpers.ts (ANONYMOUS_NAME_PATTERNS).
 * We re-export the helpers.ts check and add the cross-agent DB lookup here.
 */

import { isAnonymousProfile as isAnonymousProfileHelper } from '../utils/helpers';
import { logger } from '../utils/logger';
import db from '../db/prisma.client';
import type { TargetConfig, LinkedInProfile, ScoreBreakdown } from '../types/agent-config.types';

// ---------------------------------------------------------------------------
// Anonymous profile detection
// ---------------------------------------------------------------------------

/**
 * Returns true if the profile appears to be anonymous / private.
 * Delegates to the shared helper in utils/helpers.ts which checks
 * name patterns and ID placeholders.
 */
export function isAnonymousProfile(profile: {
  linkedinId?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  fullName?: string | null;
  headline?: string | null;
}): boolean {
  return isAnonymousProfileHelper(profile);
}

// ---------------------------------------------------------------------------
// Cross-agent deduplication
// ---------------------------------------------------------------------------

/**
 * DC-04: Check whether a linkedinId already exists in the database for ANY agent.
 * Returns true if a duplicate is found (prospect should be skipped).
 */
export async function isDuplicate(linkedinId: string): Promise<boolean> {
  try {
    const existing = await db.prospect.findFirst({
      where: { linkedinId },
      select: { id: true },
    });
    return existing !== null;
  } catch (err) {
    logger.error('[deduplication] isDuplicate DB error — treating as non-duplicate to avoid data loss', {
      linkedinId,
      error: (err as Error).message,
    });
    // On DB error, fail-open (allow) to avoid silently skipping valid prospects.
    // A duplicate constraint at the DB level will prevent actual duplicates from being saved.
    return false;
  }
}

// ---------------------------------------------------------------------------
// Filter pipeline
// ---------------------------------------------------------------------------

export interface FilterResult {
  valid: Array<{ linkedinId: string; [key: string]: unknown }>;
  skippedAnonymous: number;
  skippedDuplicates: number;
}

/**
 * Run a batch of profiles through the full deduplication pipeline:
 *  1. Filter anonymous / private profiles
 *  2. Filter already-known profiles (global cross-agent check)
 *
 * Returns the valid profiles along with skip counts for reporting.
 */
export async function filterProfiles(
  profiles: Array<{
    linkedinId?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    fullName?: string | null;
    headline?: string | null;
    [key: string]: unknown;
  }>,
): Promise<FilterResult> {
  let skippedAnonymous = 0;
  let skippedDuplicates = 0;
  const valid: Array<{ linkedinId: string; [key: string]: unknown }> = [];

  for (const profile of profiles) {
    // Step 1: Anonymous check
    if (isAnonymousProfile(profile)) {
      skippedAnonymous++;
      logger.debug('[deduplication] Skipping anonymous profile', {
        linkedinId: profile.linkedinId ?? 'N/A',
      });
      continue;
    }

    // At this point we know linkedinId is non-null/non-empty (anonymous check guards it)
    const linkedinId = profile.linkedinId as string;

    // Step 2: Global duplicate check
    const duplicate = await isDuplicate(linkedinId);
    if (duplicate) {
      skippedDuplicates++;
      logger.debug('[deduplication] Skipping duplicate profile', { linkedinId });
      continue;
    }

    valid.push({ ...profile, linkedinId });
  }

  logger.info('[deduplication] filterProfiles complete', {
    total: profiles.length,
    valid: valid.length,
    skippedAnonymous,
    skippedDuplicates,
  });

  return { valid, skippedAnonymous, skippedDuplicates };
}

// ---------------------------------------------------------------------------
// Prospect scoring (DC-15)
// ---------------------------------------------------------------------------

/**
 * DC-15: Score a LinkedIn profile against an agent's TargetConfig.
 *
 * Weights:
 *   titleMatch        0-30
 *   locationMatch     0-15
 *   industryMatch     0-20
 *   profileComplete   0-15
 *   connectionCount   0-10
 *   mutualConnections 0-10
 *   ─────────────────────
 *   Total             0-100
 *
 * Threshold: >= 50 -> status='queued', < 50 -> status='found'
 */
export function scoreProspect(
  profile: LinkedInProfile,
  targetConfig: TargetConfig,
): ScoreBreakdown {
  // ── 0. Exclude check ───────────────────────────────────────────────────────
  const headline = (profile.headline ?? '').toLowerCase();
  for (const excludeTitle of targetConfig.excludeTitles) {
    if (headline.includes(excludeTitle.toLowerCase())) {
      return {
        titleMatch: 0,
        locationMatch: 0,
        industryMatch: 0,
        profileCompleteness: 0,
        connectionCount: 0,
        mutualConnections: 0,
        total: 0,
      };
    }
  }

  // ── 1. Title Match (0-30) ──────────────────────────────────────────────────
  let titleMatch = 0;
  const lowerHeadline = headline;

  // Check exact match (all keywords from a target title present in headline)
  const hasExactMatch = targetConfig.targetTitles.some((t) =>
    lowerHeadline.includes(t.toLowerCase()),
  );

  if (hasExactMatch) {
    titleMatch = 30;
  } else {
    // Partial: any keyword from keywords array found in headline
    const hasKeywordMatch = targetConfig.keywords.some((kw) =>
      lowerHeadline.includes(kw.toLowerCase()),
    );
    if (hasKeywordMatch) {
      titleMatch = 20;
    } else {
      // Adjacent: any fragment of any target title found
      const hasAdjacentMatch = targetConfig.targetTitles.some((t) => {
        const words = t.toLowerCase().split(/\s+/);
        return words.some((w) => w.length > 3 && lowerHeadline.includes(w));
      });
      titleMatch = hasAdjacentMatch ? 10 : 0;
    }
  }

  // ── 2. Location Match (0-15) ───────────────────────────────────────────────
  let locationMatch = 0;
  const profileLocation = (profile.location ?? '').toLowerCase();
  if (profileLocation) {
    const hasExactCity = targetConfig.targetLocations.some((loc) =>
      profileLocation.includes(loc.toLowerCase()),
    );
    if (hasExactCity) {
      locationMatch = 15;
    } else {
      // Region heuristic: first word of location
      const profileRegion = profileLocation.split(/[\s,]+/)[0];
      const hasRegion = targetConfig.targetLocations.some((loc) =>
        loc.toLowerCase().includes(profileRegion) || profileRegion.includes(loc.toLowerCase().split(/[\s,]+/)[0]),
      );
      locationMatch = hasRegion ? 10 : 5; // At minimum 5 for any non-empty location (same country assumption)
    }
  }

  // ── 3. Industry Match (0-20) ───────────────────────────────────────────────
  let industryMatch = 0;
  const profileIndustry = (profile.industry ?? '').toLowerCase();
  if (profileIndustry) {
    const hasExactIndustry = targetConfig.targetIndustries.some((ind) =>
      profileIndustry.includes(ind.toLowerCase()) || ind.toLowerCase().includes(profileIndustry),
    );
    if (hasExactIndustry) {
      industryMatch = 20;
    } else {
      // Related: hospitality / food adjacency keywords
      const RELATED_KEYWORDS = ['food', 'beverage', 'hospitality', 'restaurant', 'catering',
        'ristorazione', 'albergo', 'hotel', 'bar', 'cucina'];
      const isRelated = RELATED_KEYWORDS.some((kw) => profileIndustry.includes(kw));
      industryMatch = isRelated ? 12 : 0;
    }
  }

  // ── 4. Profile Completeness (0-15) ────────────────────────────────────────
  let profileCompleteness = 0;
  if (profile.profilePictureUrl) profileCompleteness += 5;
  if (profile.headline && profile.headline.trim()) profileCompleteness += 5;
  if (profile.hasExperience) profileCompleteness += 5;

  // ── 5. Connection Count (0-10) ────────────────────────────────────────────
  let connectionCount = 0;
  const connections = profile.connectionCount ?? 0;
  if (connections > 500) {
    connectionCount = 10;
  } else if (connections > 200) {
    connectionCount = 5;
  }

  // ── 6. Mutual Connections (0-10) ──────────────────────────────────────────
  let mutualConnections = 0;
  const mutual = profile.mutualConnections ?? 0;
  if (mutual > 10) {
    mutualConnections = 10;
  } else if (mutual > 3) {
    mutualConnections = 5;
  }

  const total = titleMatch + locationMatch + industryMatch + profileCompleteness + connectionCount + mutualConnections;

  return {
    titleMatch,
    locationMatch,
    industryMatch,
    profileCompleteness,
    connectionCount,
    mutualConnections,
    total,
  };
}
