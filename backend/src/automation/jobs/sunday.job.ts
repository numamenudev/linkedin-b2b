/**
 * backend/src/automation/jobs/sunday.job.ts
 *
 * Sunday Network Analysis Job — runs every Sunday at 08:00 +/- 15 minutes.
 *
 * DC-06: Guard — if no active agents, log and return early.
 * DC-08: Acquire Redis SETNX lock 'job:lock:sunday' (TTL 2h) before running.
 *
 * Steps (PRD §23b):
 *   1. Fetch existing LinkedIn network (listRelations)
 *   2. Filter: remove anonymous profiles + already-known profiles (deduplication)
 *   3. Fetch full profiles for new connections (batch, max 20 per cycle)
 *   4. Score each profile against every active agent's TargetConfig
 *   5. Check for existing conversations (listChats + getChatMessages)
 *   6. Save as Prospect with discoveryMethod='existing_network'
 *   7. Send Telegram network analysis report
 */

import { acquireLock, releaseLock } from '../../utils/job-lock';
import { logger } from '../../utils/logger';
import { randomDelay, todayISO } from '../../utils/helpers';
import { getActiveAgents } from '../../agents/orchestrator';
import { filterProfiles, scoreProspect } from '../deduplication';
import { unipileClient } from '../../integrations/unipile/unipile.client';
import { telegramBot } from '../../integrations/telegram/telegram.bot';
import type { NetworkAnalysisData } from '../../integrations/telegram/telegram.bot';
import db from '../../db/prisma.client';
import type { TargetConfig } from '../../types/agent-config.types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** TTL for the sunday job lock (seconds) — 2 hours */
const SUNDAY_LOCK_TTL = 2 * 60 * 60;

/** Maximum new profiles to fetch full details for per cycle */
const MAX_PROFILES_PER_CYCLE = 20;


// ---------------------------------------------------------------------------
// Sunday Job
// ---------------------------------------------------------------------------

export async function runSundayJob(): Promise<void> {
  const lockAcquired = await acquireLock('sunday', SUNDAY_LOCK_TTL);
  if (!lockAcquired) {
    logger.warn('[sunday-job] Could not acquire lock — job already running, skipping');
    return;
  }

  logger.info('[sunday-job] Starting sunday network analysis job');

  try {
    // DC-06: Guard — if no active agents, log and return early
    const activeAgents = await getActiveAgents();
    if (activeAgents.length === 0) {
      logger.info('[sunday-job] No active agents, skipping sunday job');
      return;
    }

    // Get the Unipile account ID from env
    const accountId = process.env.UNIPILE_ACCOUNT_ID ?? '';
    if (!accountId) {
      logger.error('[sunday-job] UNIPILE_ACCOUNT_ID not set — cannot run network analysis');
      return;
    }

    logger.info('[sunday-job] Processing network analysis', {
      agentCount: activeAgents.length,
    });

    // ── Step 1: Fetch existing LinkedIn network ─────────────────────────────
    logger.info('[sunday-job] Step 1: Fetching LinkedIn relations');
    const relations = await unipileClient.listRelations(accountId);
    logger.info('[sunday-job] Fetched relations', { total: relations.length });

    // ── Step 2: Filter anonymous + duplicates ───────────────────────────────
    logger.info('[sunday-job] Step 2: Filtering profiles');
    const profilesForFilter = relations.map((r) => ({
      linkedinId: r.providerId || r.id,
      firstName: r.firstName ?? null,
      lastName: r.lastName ?? null,
      fullName: r.firstName && r.lastName ? `${r.firstName} ${r.lastName}` : null,
      headline: r.headline ?? null,
    }));

    const filterResult = await filterProfiles(profilesForFilter);
    logger.info('[sunday-job] Filter result', {
      valid: filterResult.valid.length,
      skippedAnonymous: filterResult.skippedAnonymous,
      skippedDuplicates: filterResult.skippedDuplicates,
    });

    // ── Step 3: Fetch full profiles (batch, max 20) ─────────────────────────
    const toFetch = filterResult.valid.slice(0, MAX_PROFILES_PER_CYCLE);
    logger.info('[sunday-job] Step 3: Fetching full profiles', { count: toFetch.length });

    let savedCount = 0;
    const agentTargetConfigs = activeAgents.map((agent) => ({
      agent,
      targetConfig: (agent.targetConfig ?? {}) as TargetConfig,
    }));

    // Prefetch chats once for conversation checking
    logger.info('[sunday-job] Step 4: Fetching chats for conversation check');
    const chats = await unipileClient.listChats(accountId);
    const chatByProviderId = new Map(chats.map((c) => [c.participantProviderId, c]));

    // Pre-compute the 30-day cutoff once outside the loop
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    for (const profileRef of toFetch) {
      try {
        const linkedinId = profileRef.linkedinId;
        const profile = await unipileClient.getProfile(accountId, linkedinId);

        // ── Step 4: Score against every active agent ──────────────────────────
        let bestAgentId: string | null = null;
        let bestScore = 0;
        let bestPriority = Infinity;

        for (const { agent, targetConfig } of agentTargetConfigs) {
          // Ensure targetConfig has the required fields
          if (!targetConfig.targetTitles || !targetConfig.keywords) continue;

          const score = scoreProspect(
            {
              linkedinId: profile.linkedinId,
              linkedinUrl: profile.linkedinUrl ?? '',
              fullName: profile.fullName ?? `${profile.firstName} ${profile.lastName}`.trim(),
              firstName: profile.firstName ?? '',
              lastName: profile.lastName ?? '',
              headline: profile.headline,
              location: profile.location,
              profilePictureUrl: profile.profilePictureUrl,
              industry: profile.industry,
              connectionCount: profile.connectionsCount,
              hasExperience: (profile.experiences?.length ?? 0) > 0,
              rawData: profile.rawData,
            },
            targetConfig,
          );

          // Assign to agent with highest score (>= 50); ties broken by priority
          if (score.total >= 50) {
            if (score.total > bestScore || (score.total === bestScore && agent.priority < bestPriority)) {
              bestAgentId = agent.id;
              bestScore = score.total;
              bestPriority = agent.priority;
            }
          }
        }

        // Skip profiles that don't score >= 50 for any agent
        if (!bestAgentId) {
          logger.debug('[sunday-job] Profile did not meet threshold for any agent', { linkedinId });
          continue;
        }

        // ── Step 5: Check for existing conversations ────────────────────────
        let hasPriorConversation = false;
        let priorConversationSummary: string | null = null;
        let existingChatId: string | null = null;
        let lastConversationDate: Date | null = null;
        let status = 'existing_queued';

        const chat = chatByProviderId.get(linkedinId);
        if (chat) {
          existingChatId = chat.id;
          const messages = await unipileClient.getChatMessages(chat.id, 10);

          if (messages.length > 0) {
            // Check if there are recent messages (last 30 days)
            const recentMessages = messages.filter(
              (m) => new Date(m.sentAt) > thirtyDaysAgo,
            );

            if (recentMessages.length > 0) {
              // Check if the user (not our account) has replied
              const userReplies = recentMessages.filter(
                (m) => m.senderId !== accountId,
              );

              if (userReplies.length > 0) {
                // User has responded manually — do NOT contact
                status = 'responded_manually';
              } else {
                // Active conversation but no user reply — still active
                status = 'active_conversation';
              }
            } else {
              // Only old messages without recent response — can re-engage
              hasPriorConversation = true;
              const latestMsg = messages[0];
              lastConversationDate = new Date(latestMsg.sentAt);
              priorConversationSummary = messages
                .slice(0, 3)
                .map((m) => m.text.slice(0, 100))
                .join(' | ');
            }
          }
        }

        // Skip active_conversation and responded_manually — don't save as prospects
        if (status === 'active_conversation' || status === 'responded_manually') {
          logger.debug('[sunday-job] Skipping — active/responded conversation', {
            linkedinId,
            status,
          });
          continue;
        }

        // ── Step 6: Save Prospect ───────────────────────────────────────────
        await db.prospect.create({
          data: {
            agentId: bestAgentId,
            linkedinId: profile.linkedinId,
            linkedinUrl: profile.linkedinUrl ?? '',
            fullName: profile.fullName ?? `${profile.firstName} ${profile.lastName}`.trim(),
            firstName: profile.firstName ?? '',
            lastName: profile.lastName ?? '',
            headline: profile.headline,
            location: profile.location,
            profilePictureUrl: profile.profilePictureUrl,
            companyName: profile.companyName,
            rawProfileData: profile.rawData ?? undefined,
            score: bestScore,
            status: 'existing_queued',
            discoveryMethod: 'existing_network',
            hasPriorConversation,
            priorConversationSummary,
            lastConversationDate,
            existingChatId,
          },
        });

        savedCount++;
        logger.info('[sunday-job] Saved prospect from existing network', {
          linkedinId,
          agentId: bestAgentId,
          score: bestScore,
          hasPriorConversation,
        });

        // Random delay between fetches for human-like behaviour
        await randomDelay();
      } catch (err) {
        logger.error('[sunday-job] Error processing relation', {
          linkedinId: profileRef.linkedinId,
          error: (err as Error).message,
        });
        // Continue with next profile
      }
    }

    logger.info('[sunday-job] Network analysis complete', {
      totalRelations: relations.length,
      filteredNew: filterResult.valid.length,
      profilesFetched: toFetch.length,
      prospectsSaved: savedCount,
    });

    // ── Step 7: Send Telegram report ────────────────────────────────────────
    logger.info('[sunday-job] Step 7: Sending Telegram network analysis report');
    await sendSundayTelegramReport(relations.length, savedCount, activeAgents.length);

    logger.info('[sunday-job] Sunday job complete');
  } catch (err) {
    logger.error('[sunday-job] Sunday job failed', {
      error: (err as Error).message,
      stack: (err as Error).stack,
    });
    throw err;
  } finally {
    await releaseLock('sunday');
    logger.info('[sunday-job] Lock released');
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function sendSundayTelegramReport(
  totalConnections: number,
  newProspectsSaved: number,
  activeAgentCount: number,
): Promise<void> {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);

    const [
      newConnectionsThisWeek,
      activeConversations,
      weekSent,
      weekAccepted,
      weekMessaged,
      weekResponded,
      weekRejected,
      topAgentResult,
    ] = await Promise.all([
      db.prospect.count({
        where: { discoveredAt: { gte: weekAgo } },
      }),
      db.prospect.count({
        where: {
          status: {
            in: [
              'ready_for_outreach',
              'cold_intro_sent',
              'followup_1_sent',
              'followup_2_sent',
              'existing_queued',
              'warm_intro_sent',
            ],
          },
        },
      }),
      db.prospect.count({
        where: { connectionRequestSentAt: { gte: weekAgo } },
      }),
      db.prospect.count({
        where: { connectionAcceptedAt: { gte: weekAgo } },
      }),
      db.prospect.count({
        where: {
          status: {
            in: [
              'cold_intro_sent',
              'followup_1_sent',
              'followup_2_sent',
              'warm_intro_sent',
            ],
          },
          lastActivityAt: { gte: weekAgo },
        },
      }),
      db.prospect.count({
        where: { status: 'responded', lastActivityAt: { gte: weekAgo } },
      }),
      db.prospect.count({
        where: { connectionRejectedAt: { gte: weekAgo } },
      }),
      // Top performing agent — single query with orderBy instead of groupBy + N+1
      db.agent.findFirst({
        where: {
          prospects: {
            some: { status: 'responded', lastActivityAt: { gte: weekAgo } },
          },
        },
        select: { name: true },
        orderBy: { prospects: { _count: 'desc' } },
      }),
    ]);

    const topPerformingAgent = topAgentResult?.name;

    const weeklyAcceptanceRate = weekSent > 0
      ? Math.round((weekAccepted / weekSent) * 100)
      : 0;
    const weeklyResponseRate = weekAccepted > 0
      ? Math.round((weekResponded / weekAccepted) * 100)
      : 0;
    const rejectionRate = weekSent > 0
      ? Math.round((weekRejected / weekSent) * 100)
      : 0;

    const healthWarnings: string[] = [];
    if (weeklyAcceptanceRate < 20 && weekSent > 10) {
      healthWarnings.push('Acceptance rate basso — valutare targeting');
    }
    if (rejectionRate > 30) {
      healthWarnings.push('Rejection rate alto — ridurre volume inviti');
    }
    if (activeAgentCount === 0) {
      healthWarnings.push('Nessun agente attivo');
    }

    const data: NetworkAnalysisData = {
      date: todayISO(),
      totalConnections,
      newConnectionsThisWeek,
      activeConversations,
      conversionFunnel: {
        sent: weekSent,
        accepted: weekAccepted,
        messaged: weekMessaged,
        responded: weekResponded,
      },
      topPerformingAgent,
      weeklyAcceptanceRate,
      weeklyResponseRate,
      rejectionRate,
      healthWarnings,
    };

    await telegramBot.sendNetworkAnalysisReport(data);
  } catch (err) {
    logger.warn('[sunday-job] Failed to send Telegram network analysis report', {
      error: (err as Error).message,
    });
  }
}
