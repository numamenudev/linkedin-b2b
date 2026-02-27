/**
 * backend/src/automation/followup-manager.ts
 *
 * Follow-up timer management and message sending for cold and warm paths.
 *
 * Timer rules (from design section 7.1 Morning Job):
 *   intro_sent     + 3 days  -> followup_1_queued
 *   followup_1_sent + 7 days -> followup_2_queued
 *   followup_2_sent + 3 days -> archived
 *
 * Warm path follows the same timing pattern via existing_* statuses.
 *
 * C8: If a prospect has responded at any point, automation stops immediately.
 */

import { claudeClient } from '../integrations/claude/claude.client';
import { unipileClient } from '../integrations/unipile/unipile.client';
import {
  MESSAGE_GENERATION_SYSTEM_PROMPT,
  WARM_MESSAGE_SYSTEM_PROMPT,
  buildMessageGenerationUserPrompt,
  type IdentityContext,
  type MessagingConstraints,
} from '../integrations/claude/claude.prompts';
import { tryIncrementLimit } from '../utils/rate-limiter';
import { sleep } from '../utils/helpers';
import { logger, logOperation } from '../utils/logger';
import db from '../db/prisma.client';
import type { Prospect, Identity, Message } from '../generated/prisma/client.js';
import type { MessagingConfig } from '../types/agent-config.types';

type ProspectWithMessages = Prospect & { messages: Message[] };

// ---------------------------------------------------------------------------
// Timer thresholds
// ---------------------------------------------------------------------------

/** Days after intro_sent before follow-up 1 is queued. */
const FU1_DAYS = 3;

/** Days after followup_1_sent before follow-up 2 is queued. */
const FU2_DAYS = 7;

/** Days after followup_2_sent before prospect is archived. */
const ARCHIVE_DAYS = 3;

/** Delay between individual follow-up sends (3-7 minutes in ms). */
const SEND_DELAY_MIN_MS = 3 * 60 * 1_000;
const SEND_DELAY_MAX_MS = 7 * 60 * 1_000;

/** Error sentinel from Claude */
const NO_MESSAGE_SENTINEL = 'ERROR_NO_MESSAGE';

// ---------------------------------------------------------------------------
// Helper: days elapsed
// ---------------------------------------------------------------------------

function daysElapsed(since: Date | null): number {
  if (!since) return 0;
  return (Date.now() - since.getTime()) / (1_000 * 60 * 60 * 24);
}

// ---------------------------------------------------------------------------
// Timer checker
// ---------------------------------------------------------------------------

/**
 * Check follow-up timers and transition prospect statuses accordingly.
 *
 * Called by the morning job to advance prospects through the follow-up sequence.
 * Transitions statuses based on time elapsed since last activity:
 *
 *   intro_sent + 3d          -> followup_1_queued
 *   followup_1_sent + 7d     -> followup_2_queued
 *   followup_2_sent + 3d     -> archived
 *   existing_message_sent + 3d  -> existing_followup_1_queued
 *   existing_followup_1_sent + 7d -> existing_followup_2_queued
 *   existing_followup_2_sent + 3d -> archived
 *
 * @returns Count of prospects transitioned
 */
export async function checkFollowupTimers(): Promise<number> {
  const thresholdFU1 = new Date(Date.now() - FU1_DAYS * 24 * 60 * 60 * 1_000);
  const thresholdFU2 = new Date(Date.now() - FU2_DAYS * 24 * 60 * 60 * 1_000);
  const thresholdArchive = new Date(Date.now() - ARCHIVE_DAYS * 24 * 60 * 60 * 1_000);

  let transitioned = 0;

  // ── intro_sent -> followup_1_queued (3 days) ───────────────────────────────
  const introReady = await db.prospect.findMany({
    where: {
      status: 'intro_sent',
      lastActivityAt: { lte: thresholdFU1 },
    },
    select: { id: true, agentId: true, fullName: true },
  });

  for (const p of introReady) {
    await db.prospect.update({
      where: { id: p.id },
      data: { status: 'followup_1_queued' },
    });
    logOperation(p.agentId, 'info', 'followup-manager', 'timer_transition',
      `${p.fullName}: intro_sent -> followup_1_queued`, { prospectId: p.id });
    transitioned++;
  }

  // ── followup_1_sent -> followup_2_queued (7 days) ─────────────────────────
  const fu1Ready = await db.prospect.findMany({
    where: {
      status: 'followup_1_sent',
      lastActivityAt: { lte: thresholdFU2 },
    },
    select: { id: true, agentId: true, fullName: true },
  });

  for (const p of fu1Ready) {
    await db.prospect.update({
      where: { id: p.id },
      data: { status: 'followup_2_queued' },
    });
    logOperation(p.agentId, 'info', 'followup-manager', 'timer_transition',
      `${p.fullName}: followup_1_sent -> followup_2_queued`, { prospectId: p.id });
    transitioned++;
  }

  // ── followup_2_sent -> archived (3 days) ──────────────────────────────────
  const fu2Ready = await db.prospect.findMany({
    where: {
      status: 'followup_2_sent',
      lastActivityAt: { lte: thresholdArchive },
    },
    select: { id: true, agentId: true, fullName: true },
  });

  for (const p of fu2Ready) {
    await db.prospect.update({
      where: { id: p.id },
      data: { status: 'archived' },
    });
    logOperation(p.agentId, 'info', 'followup-manager', 'timer_transition',
      `${p.fullName}: followup_2_sent -> archived`, { prospectId: p.id });
    transitioned++;
  }

  // ── Warm path: existing_message_sent -> existing_followup_1_queued (3 days)
  const warmFu1Ready = await db.prospect.findMany({
    where: {
      status: 'existing_message_sent',
      lastActivityAt: { lte: thresholdFU1 },
    },
    select: { id: true, agentId: true, fullName: true },
  });

  for (const p of warmFu1Ready) {
    await db.prospect.update({
      where: { id: p.id },
      data: { status: 'existing_followup_1_queued' },
    });
    transitioned++;
  }

  // ── Warm: existing_followup_1_sent -> existing_followup_2_queued (7 days) ─
  const warmFu2Ready = await db.prospect.findMany({
    where: {
      status: 'existing_followup_1_sent',
      lastActivityAt: { lte: thresholdFU2 },
    },
    select: { id: true, agentId: true, fullName: true },
  });

  for (const p of warmFu2Ready) {
    await db.prospect.update({
      where: { id: p.id },
      data: { status: 'existing_followup_2_queued' },
    });
    transitioned++;
  }

  // ── Warm: existing_followup_2_sent -> archived (3 days) ───────────────────
  const warmArchiveReady = await db.prospect.findMany({
    where: {
      status: 'existing_followup_2_sent',
      lastActivityAt: { lte: thresholdArchive },
    },
    select: { id: true, agentId: true, fullName: true },
  });

  for (const p of warmArchiveReady) {
    await db.prospect.update({
      where: { id: p.id },
      data: { status: 'archived' },
    });
    transitioned++;
  }

  logger.info('[followup-manager] checkFollowupTimers complete', { transitioned });
  return transitioned;
}

// ---------------------------------------------------------------------------
// Follow-up message generation helper
// ---------------------------------------------------------------------------

async function generateFollowupText(
  prospect: Prospect,
  identity: Identity,
  sequenceNumber: 1 | 2 | 3,
  isWarm: boolean,
  previousMessages: Array<{ direction: 'outbound'; text: string; sentAt: string }>,
): Promise<string | null> {
  const messagingConfig = (await db.agent.findUnique({
    where: { id: prospect.agentId },
    select: { messagingConfig: true },
  }))?.messagingConfig as MessagingConfig | undefined;

  if (!messagingConfig) return null;

  const toneProfile = identity.toneProfile as Record<string, unknown>;
  const companyContext = identity.companyContext as Record<string, unknown>;

  const identityCtx: IdentityContext = {
    name: identity.personaName,
    role: identity.role,
    company: identity.company,
    valueProposition: (companyContext?.valueProposition as string) ?? `${identity.personaName} di ${identity.company}`,
    tone: (toneProfile?.tone as string) ?? 'professionale ma amichevole',
    language: (toneProfile?.language as string) ?? 'it',
    fullContextPrompt: identity.fullContextPrompt,
  };

  const constraints: MessagingConstraints = {
    maxMessageLength: messagingConfig.maxMessageLength ?? 500,
    tone: messagingConfig.tone ?? identityCtx.tone,
    language: messagingConfig.language ?? identityCtx.language,
  };

  const agentPromptForStep = isWarm
    ? [messagingConfig.warmFollowup1Prompt, messagingConfig.warmFollowup2Prompt][sequenceNumber - 2] ?? ''
    : [messagingConfig.coldFollowup1Prompt, messagingConfig.coldFollowup2Prompt][sequenceNumber - 2] ?? '';

  const prospectData: Record<string, unknown> = {
    fullName: prospect.fullName,
    firstName: prospect.firstName,
    headline: prospect.headline,
    location: prospect.location,
    companyName: prospect.companyName,
    profileAnalysis: prospect.profileAnalysis,
  };

  const systemPrompt = isWarm
    ? WARM_MESSAGE_SYSTEM_PROMPT(identityCtx, constraints)
    : MESSAGE_GENERATION_SYSTEM_PROMPT(identityCtx, constraints);

  const userPrompt = buildMessageGenerationUserPrompt({
    prospectData,
    sequenceNumber,
    previousMessages,
    agentPromptForStep,
    isWarm,
    hasPriorConversation: prospect.hasPriorConversation,
    conversationSummary: prospect.priorConversationSummary ?? '',
  });

  try {
    const text = await claudeClient.generateMessage(systemPrompt, userPrompt);
    if (!text || text.trim() === NO_MESSAGE_SENTINEL) return null;
    return text.trim();
  } catch (err) {
    logger.error('[followup-manager] generateFollowupText failed', {
      prospectId: prospect.id,
      error: (err as Error).message,
    });
    return null;
  }
}

// ---------------------------------------------------------------------------
// Follow-up processor
// ---------------------------------------------------------------------------

/**
 * Process all queued follow-ups for a specific agent.
 *
 * Handles both cold and warm follow-up paths.
 * Fetches previous messages for context, generates new message via Claude,
 * sends via Unipile, updates status, and applies 3-7 minute delays.
 *
 * @param agentId  Agent ID to process
 * @returns        Number of follow-ups sent
 */
export async function processFollowups(agentId: string): Promise<number> {
  const agent = await db.agent.findUnique({
    where: { id: agentId },
    include: { identity: true },
  });

  if (!agent) {
    logger.warn('[followup-manager] Agent not found', { agentId });
    return 0;
  }

  const identity = agent.identity;
  const accountId = process.env.UNIPILE_ACCOUNT_ID ?? '';
  let totalSent = 0;

  // Statuses to process and their corresponding next statuses + sequence numbers
  const followupMatrix: Array<{
    fromStatus: string;
    toStatus: string;
    sequenceNumber: 1 | 2 | 3;
    isWarm: boolean;
  }> = [
    { fromStatus: 'followup_1_queued', toStatus: 'followup_1_sent', sequenceNumber: 2, isWarm: false },
    { fromStatus: 'followup_2_queued', toStatus: 'followup_2_sent', sequenceNumber: 3, isWarm: false },
    { fromStatus: 'existing_followup_1_queued', toStatus: 'existing_followup_1_sent', sequenceNumber: 2, isWarm: true },
    { fromStatus: 'existing_followup_2_queued', toStatus: 'existing_followup_2_sent', sequenceNumber: 3, isWarm: true },
  ];

  for (const { fromStatus, toStatus, sequenceNumber, isWarm } of followupMatrix) {
    const prospects = await db.prospect.findMany({
      where: { agentId, status: fromStatus },
      orderBy: { score: 'desc' },
      take: agent.dailyMessages,
      include: { messages: { orderBy: { sentAt: 'asc' } } },
    });

    for (let i = 0; i < prospects.length; i++) {
      const prospect = prospects[i] as ProspectWithMessages;

      // C8: Stop if prospect has responded
      if (prospect.status === 'responded') continue;

      // Build previous messages context
      const prevMessages = prospect.messages
        .filter((m: Message) => m.direction === 'outbound')
        .map((m: Message) => ({
          direction: 'outbound' as const,
          text: m.content,
          sentAt: (m.sentAt ?? m.createdAt).toISOString(),
        }));

      // Generate follow-up content
      const content = await generateFollowupText(
        prospect,
        identity,
        sequenceNumber,
        isWarm,
        prevMessages,
      );

      if (!content) continue;

      // Check message budget
      const budgetOk = await tryIncrementLimit('messagesDaily');
      if (!budgetOk) {
        logger.info('[followup-manager] Daily message limit reached', { agentId });
        break;
      }

      // Send via Unipile
      const chatId = prospect.existingChatId;
      if (!chatId) {
        logger.warn('[followup-manager] No chatId for prospect — skipping followup', {
          prospectId: prospect.id,
        });
        continue;
      }

      const result = await unipileClient.sendMessage(accountId, chatId, content);

      if (!result.success) {
        logger.warn('[followup-manager] Unipile sendMessage failed', {
          prospectId: prospect.id,
          error: result.error,
        });
        continue;
      }

      // Create message record
      await db.message.create({
        data: {
          prospectId: prospect.id,
          sequenceNumber,
          direction: 'outbound',
          content,
          unipileMessageId: result.messageId,
          sentAt: new Date(),
          status: 'sent',
        },
      });

      // Update prospect status
      await db.prospect.update({
        where: { id: prospect.id },
        data: { status: toStatus, lastActivityAt: new Date() },
      });

      logOperation(agentId, 'info', 'followup-manager', 'followup_sent',
        `Follow-up sent to ${prospect.fullName} (seq ${sequenceNumber})`, {
          prospectId: prospect.id,
          sequenceNumber,
        });

      totalSent++;

      // Delay between sends
      if (i < prospects.length - 1) {
        const delay = SEND_DELAY_MIN_MS + Math.random() * (SEND_DELAY_MAX_MS - SEND_DELAY_MIN_MS);
        await sleep(Math.round(delay));
      }
    }
  }

  logOperation(agentId, 'info', 'followup-manager', 'followups_complete',
    `Follow-up cycle complete for agent ${agent.name}`, { totalSent });

  return totalSent;
}
