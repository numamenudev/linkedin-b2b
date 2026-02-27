/**
 * backend/src/automation/search-engine.ts
 *
 * LinkedIn search execution logic.
 *
 * Supports both LinkedIn Free (keyword-only) and Sales Navigator query modes.
 * Called by the midday job to find new prospects per agent search structure.
 *
 * Constraint C2: LinkedIn Free returns ~10 results per keyword query.
 * Constraint C13: Sales Navigator support in code but not required at MVP.
 */

import { unipileClient } from '../integrations/unipile/unipile.client';
import { logger } from '../utils/logger';
import db from '../db/prisma.client';
import type { TargetConfig } from '../types/agent-config.types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Normalized search query structure built from a SearchStructure's queryConfig.
 */
export interface QueryStructure {
  titleKeywords: string[];
  locationKeywords: string[];
  industryKeywords: string[];
  modifiers: string[];          // Additional free-text modifiers
}

export interface SearchExecutionResult {
  structureId: string;
  profilesFound: number;
  query: string;
}

// ---------------------------------------------------------------------------
// Query builders
// ---------------------------------------------------------------------------

/**
 * Build a plain keyword query string for LinkedIn Free search.
 * Combines titleKeywords, locationKeywords, and modifiers with spaces.
 * LinkedIn Free supports keyword-only search (~10 results per query).
 */
export function buildFreeQuery(structure: QueryStructure): string {
  const parts: string[] = [
    ...structure.titleKeywords,
    ...structure.locationKeywords,
    ...structure.modifiers,
  ].filter(Boolean);

  return parts.join(' ').trim();
}

/**
 * Build a structured query object for Sales Navigator.
 * Separates fields so that Sales Navigator filters can be applied individually.
 * DC-13: Code ready but not exercised at MVP (linkedinMode='free' for all agents).
 */
export function buildSalesNavQuery(structure: QueryStructure): Record<string, unknown> {
  return {
    keywords: structure.titleKeywords.join(' '),
    location: structure.locationKeywords.join(', '),
    industry: structure.industryKeywords.join(', '),
    modifiers: structure.modifiers.join(' '),
  };
}

// ---------------------------------------------------------------------------
// Search execution
// ---------------------------------------------------------------------------

/**
 * Execute a LinkedIn search for a specific SearchStructure.
 * Uses the agent's linkedinMode to determine query style.
 *
 * @param structureId  ID of the SearchStructure row to execute
 * @param linkedinMode 'free' | 'sales_nav'
 * @returns            Raw profiles array from Unipile
 */
export async function executeSearch(
  structureId: string,
  linkedinMode: 'free' | 'sales_nav' = 'free',
): Promise<import('../integrations/unipile/unipile.client').UnipileProfile[]> {
  // Load the structure from DB
  const structure = await db.searchStructure.findUnique({
    where: { id: structureId },
  });

  if (!structure) {
    throw new Error(`[search-engine] SearchStructure not found: ${structureId}`);
  }

  const queryConfig = structure.queryConfig as QueryStructure;

  let query: string;
  if (linkedinMode === 'sales_nav') {
    // Sales Navigator: use structured query (build from config)
    const navQuery = buildSalesNavQuery(queryConfig);
    // For Unipile, combine into keyword string as well until SalesNav API is wired
    query = [navQuery.keywords, navQuery.location].filter(Boolean).join(' ');
    logger.info('[search-engine] Building Sales Navigator query', { structureId, navQuery });
  } else {
    // LinkedIn Free: keyword-only query
    query = structure.fullQueryString || buildFreeQuery(queryConfig);
  }

  if (!query.trim()) {
    logger.warn('[search-engine] Empty query — skipping search', { structureId });
    return [];
  }

  logger.info('[search-engine] Executing search', {
    structureId,
    query,
    linkedinMode,
  });

  try {
    const result = await unipileClient.searchPeople(query, { limit: 25 });

    logger.info('[search-engine] Search complete', {
      structureId,
      found: result.profiles.length,
      total: result.total,
    });

    // Update structure metrics in DB
    await db.searchStructure.update({
      where: { id: structureId },
      data: {
        lastExecutedAt: new Date(),
        timesExecuted: { increment: 1 },
        newResultsLastRun: result.profiles.length,
        totalResultsFound: { increment: result.profiles.length },
      },
    });

    return result.profiles;
  } catch (err) {
    logger.error('[search-engine] Search failed', {
      structureId,
      query,
      error: (err as Error).message,
    });
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Structure selector (round-robin by lastExecutedAt)
// ---------------------------------------------------------------------------

/**
 * Select the next SearchStructure for an agent to run.
 * Picks the enabled structure with the oldest lastExecutedAt (null = never run = highest priority).
 *
 * @param agentId Agent ID
 * @returns       The SearchStructure record, or null if no enabled structures exist
 */
export async function selectNextStructure(agentId: string): Promise<import('@prisma/client').SearchStructure | null> {
  const structure = await db.searchStructure.findFirst({
    where: {
      agentId,
      enabled: true,
    },
    orderBy: [
      { lastExecutedAt: 'asc' },  // null first (never executed = oldest)
    ],
  });

  return structure ?? null;
}
