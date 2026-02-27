/**
 * backend/src/automation/outreach-agent.ts
 *
 * Message generation and sending for both cold and warm outreach paths.
 *
 * Cold path:  status='ready_for_outreach' -> intro_sent -> followup_1/2_queued
 * Warm path:  status='existing_queued' (discoveryMethod='existing_network')
 *
 * DC-13: NEVER send empty or fallback messages. If Claude fails, skip the prospect.
 * CONS-011: Prospect data wrapped in <prospect_data> XML tags.
 * C8: If a prospect has responded (inbound message), automation stops immediately.
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
import type { Prospect, Identity, Message } from '@prisma/client';
import type { MessagingConfig } from '../types/agent-config.types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Error sentinel returned by Claude when it cannot generate an appropriate message. */
const NO_MESSAGE_SENTINEL = 'ERROR_NO_MESSAGE';

/** Delay range between message sends (3-7 minutes). */
const MSG_DELAY_MIN_MS = 3 * 60 * 1_000;
const MSG_DELAY_MAX_MS = 7 * 60 * 1_000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildIdentityContext(identity: Identity): IdentityContext {
  const toneProfile = identity.toneProfile as Record<string, unknown>;
  const companyContext = identity.companyContext as Record<string, unknown>;

  return {
    name: identity.personaName,
    role: identity.role,
    company: identity.company,
    valueProposition: (companyContext?.valueProposition as string) ?? `${identity.personaName} di ${identity.company}`,
    tone: (toneProfile?.tone as string) ?? 'professionale ma amichevole',
    language: (toneProfile?.language as string) ?? 'it',
    fullContextPrompt: identity.fullContextPrompt,
  };
}

function buildMessagingConstraints(
  messagingConfig: MessagingConfig,
  identityContext: IdentityContext,
): MessagingConstraints {
  return {
    maxMessageLength: messagingConfig.maxMessageLength ?? 500,
    tone: messagingConfig.tone ?? identityContext.tone,
    language: messagingConfig.language ?? identityContext.language,
    coldIntroPrompt: messagingConfig.coldIntroPrompt,
    coldFollowup1Prompt: messagingConfig.coldFollowup1Prompt,
    coldFollowup2Prompt: messagingConfig.coldFollowup2Prompt,
    warmIntroPrompt: messagingConfig.warmIntroPrompt,
    warmFollowup1Prompt: messagingConfig.warmFollowup1Prompt,
    warmFollowup2Prompt: messagingConfig.warmFollowup2Prompt,
  };
}

function getAgentPromptForStep(
  config: MessagingConfig,
  sequenceNumber: 1 | 2 | 3,
  isWarm: boolean,
): string {
  if (isWarm) {
    return [config.warmIntroPrompt, config.warmFollowup1Prompt, config.warmFollowup2Prompt][sequenceNumber - 1] ?? '';
  }
  return [config.coldIntroPrompt, config.coldFollowup1Prompt, config.coldFollowup2Prompt][sequenceNumber - 1] ?? '';
}

// ---------------------------------------------------------------------------
// Message generation
// ---------------------------------------------------------------------------

/**
 * Generate a cold outreach message for a prospect using Claude Sonnet.
 *
 * @param prospect         The target prospect
 * @param identity         Agent identity
 * @param sequenceNumber   1 = intro, 2 = followup 1, 3 = followup 2
 * @param previousMessages Optional array of already-sent messages
 * @returns                Generated message text, or null on Claude failure
 */
export async function generateMessage(
  prospect: Prospect,
  identity: Identity,
  sequenceNumber: 1 | 2 | 3,
  previousMessages: Message[] = [],
): Promise<string | null> {
  const messagingConfig = (await db.agent.findUnique({
    where: { id: prospect.agentId },
    select: { messagingConfig: true },
  }))?.messagingConfig as MessagingConfig | undefined;

  if (!messagingConfig) {
    logger.warn('[outreach-agent] No messagingConfig for agent', { agentId: prospect.agentId });
    return null;
  }

  const identityCtx = buildIdentityContext(identity);
  const constraints = buildMessagingConstraints(messagingConfig, identityCtx);
  const agentPromptForStep = getAgentPromptForStep(messagingConfig, sequenceNumber, false);

  const prospectData: Record<string, unknown> = {
    fullName: prospect.fullName,
    firstName: prospect.firstName,
    headline: prospect.headline,
    location: prospect.location,
    companyName: prospect.companyName,
    restaurantName: prospect.restaurantName,
    restaurantType: prospect.restaurantType,
    profileAnalysis: prospect.profileAnalysis,
  };

  const prevMsgContext = previousMessages.map((m) => ({
    direction: 'outbound' as const,
    text: m.content,
    sentAt: m.sentAt?.toISOString() ?? m.createdAt.toISOString(),
  }));

  const systemPrompt = MESSAGE_GENERATION_SYSTEM_PROMPT(identityCtx, constraints);
  const userPrompt = buildMessageGenerationUserPrompt({
    prospectData,
    sequenceNumber,
    previousMessages: prevMsgContext,
    agentPromptForStep,
    profileAnalysis: prospect.profileAnalysis as Record<string, unknown> | undefined,
    isWarm: false,
  });

  try {
    const text = await claudeClient.generateMessage(systemPrompt, userPrompt);

    // DC-13: Never send the sentinel or empty responses
    if (!text || text.trim() === NO_MESSAGE_SENTINEL) {
      logger.warn('[outreach-agent] Claude returned ERROR_NO_MESSAGE sentinel', {
        prospectId: prospect.id, sequenceNumber,
      });
      return null;
    }

    return text.trim();
  } catch (err) {
    logger.error('[outreach-agent] generateMessage failed', {
      prospectId: prospect.id,
      sequenceNumber,
      error: (err as Error).message,
    });
    return null;
  }
}

/**
 * Generate a warm outreach message for a prospect already in the network.
 * Used for status='existing_queued', discoveryMethod='existing_network'.
 */
export async function generateWarmMessage(
  prospect: Prospect,
  identity: Identity,
): Promise<string | null> {
  const messagingConfig = (await db.agent.findUnique({
    where: { id: prospect.agentId },
    select: { messagingConfig: true },
  }))?.messagingConfig as MessagingConfig | undefined;

  if (!messagingConfig) {
    logger.warn('[outreach-agent] No messagingConfig for warm message', { agentId: prospect.agentId });
    return null;
  }

  const identityCtx = buildIdentityContext(identity);
  const constraints = buildMessagingConstraints(messagingConfig, identityCtx);
  const agentPromptForStep = messagingConfig.warmIntroPrompt ?? '';

  const prospectData: Record<string, unknown> = {
    fullName: prospect.fullName,
    firstName: prospect.firstName,
    headline: prospect.headline,
    location: prospect.location,
    companyName: prospect.companyName,
    profileAnalysis: prospect.profileAnalysis,
  };

  const systemPrompt = WARM_MESSAGE_SYSTEM_PROMPT(identityCtx, constraints);
  const userPrompt = buildMessageGenerationUserPrompt({
    prospectData,
    sequenceNumber: 1,
    agentPromptForStep,
    isWarm: true,
    hasPriorConversation: prospect.hasPriorConversation,
    conversationSummary: prospect.priorConversationSummary ?? '',
  });

  try {
    const text = await claudeClient.generateMessage(systemPrompt, userPrompt);
    if (!text || text.trim() === NO_MESSAGE_SENTINEL) return null;
    return text.trim();
  } catch (err) {
    logger.error('[outreach-agent] generateWarmMessage failed', {
      prospectId: prospect.id,
      error: (err as Error).message,
    });
    return null;
  }
}

/**
 * Generate a warm message with prior conversation context.
 * Used when hasPriorConversation=true.
 */
export async function generateWarmMessageWithContext(
  prospect: Prospect,
  identity: Identity,
): Promise<string | null> {
  // This calls the same function but with hasPriorConversation=true (already set on prospect)
  return generateWarmMessage(prospect, identity);
}

// ---------------------------------------------------------------------------
// Message sending
// ---------------------------------------------------------------------------

/**
 * Send a message to a prospect via Unipile and record it in the DB.
 *
 * Requires prospect.existingChatId for direct messages.
 * If no chatId is available, attempts to locate the chat via LinkedIn ID.
 *
 * @param prospect        Target prospect
 * @param content         Message text to send
 * @param sequenceNumber  Sequence position for tracking
 * @returns               The created Message record, or null on failure
 */
export async function sendMessage(
  prospect: Prospect,
  content: string,
  sequenceNumber: 1 | 2 | 3,
): Promise<Message | null> {
  // DC-13: Never send empty messages
  if (!content || !content.trim()) {
    logger.warn('[outreach-agent] Attempted to send empty message — skipping', {
      prospectId: prospect.id,
    });
    return null;
  }

  const accountId = process.env.UNIPILE_ACCOUNT_ID ?? '';
  const chatId = prospect.existingChatId;

  if (!chatId) {
    logger.warn('[outreach-agent] No chatId for prospect — cannot send message', {
      prospectId: prospect.id,
      fullName: prospect.fullName,
    });
    return null;
  }

  try {
    // Check message budget
    const budgetOk = await tryIncrementLimit('messagesDaily');
    if (!budgetOk) {
      logger.warn('[outreach-agent] Daily message limit reached — skipping', { prospectId: prospect.id });
      return null;
    }

    const result = await unipileClient.sendMessage(accountId, chatId, content);

    if (!result.success) {
      logger.warn('[outreach-agent] Unipile sendMessage failed', {
        prospectId: prospect.id,
        error: result.error,
      });
      return null;
    }

    // Create Message record
    const message = await db.message.create({
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

    // Update prospect last activity
    await db.prospect.update({
      where: { id: prospect.id },
      data: { lastActivityAt: new Date() },
    });

    logOperation(prospect.agentId, 'info', 'outreach-agent', 'message_sent',
      `Message sent to ${prospect.fullName} (seq ${sequenceNumber})`, {
        prospectId: prospect.id,
        messageId: message.id,
        sequenceNumber,
      });

    return message;
  } catch (err) {
    logger.error('[outreach-agent] sendMessage failed', {
      prospectId: prospect.id,
      error: (err as Error).message,
    });
    return null;
  }
}

// ---------------------------------------------------------------------------
// Batch outreach processor
// ---------------------------------------------------------------------------

/**
 * Process all prospects ready for outreach (cold and warm) for a given agent.
 *
 * Cold prospects (status='ready_for_outreach'):
 *   -> Generate intro message -> send -> update status='intro_sent'
 *
 * Warm prospects (status='existing_queued', discoveryMethod='existing_network'):
 *   -> Generate warm message -> send -> update status='existing_message_sent'
 *
 * Applies 3-7 minute delays between each message.
 *
 * @param agentId  Agent ID to process
 * @returns        Number of messages sent
 */
export async function processReadyForOutreach(agentId: string): Promise<number> {
  const agent = await db.agent.findUnique({
    where: { id: agentId },
    include: { identity: true },
  });

  if (!agent) {
    logger.warn('[outreach-agent] Agent not found', { agentId });
    return 0;
  }

  const identity = agent.identity;
  let totalSent = 0;

  // ── Cold prospects ─────────────────────────────────────────────────────────
  const coldProspects = await db.prospect.findMany({
    where: { agentId, status: 'ready_for_outreach' },
    orderBy: { score: 'desc' },
    take: agent.dailyMessages,
  });

  for (let i = 0; i < coldProspects.length; i++) {
    const prospect = coldProspects[i];

    // C8: Skip if prospect has responded
    if (prospect.status === 'responded') continue;

    const content = await generateMessage(prospect, identity, 1);
    if (!content) continue;

    const message = await sendMessage(prospect, content, 1);
    if (!message) continue;

    // Update status to intro_sent
    await db.prospect.update({
      where: { id: prospect.id },
      data: { status: 'intro_sent', lastActivityAt: new Date() },
    });

    totalSent++;

    if (i < coldProspects.length - 1) {
      const delay = MSG_DELAY_MIN_MS + Math.random() * (MSG_DELAY_MAX_MS - MSG_DELAY_MIN_MS);
      await sleep(Math.round(delay));
    }
  }

  // ── Warm prospects ─────────────────────────────────────────────────────────
  const warmProspects = await db.prospect.findMany({
    where: {
      agentId,
      status: 'existing_queued',
      discoveryMethod: 'existing_network',
    },
    orderBy: { score: 'desc' },
    take: Math.max(0, agent.dailyMessages - totalSent),
  });

  for (let i = 0; i < warmProspects.length; i++) {
    const prospect = warmProspects[i];

    if (prospect.status === 'responded') continue;

    const content = prospect.hasPriorConversation
      ? await generateWarmMessageWithContext(prospect, identity)
      : await generateWarmMessage(prospect, identity);

    if (!content) continue;

    const message = await sendMessage(prospect, content, 1);
    if (!message) continue;

    // Update status to existing_message_sent
    await db.prospect.update({
      where: { id: prospect.id },
      data: { status: 'existing_message_sent', lastActivityAt: new Date() },
    });

    totalSent++;

    if (i < warmProspects.length - 1) {
      const delay = MSG_DELAY_MIN_MS + Math.random() * (MSG_DELAY_MAX_MS - MSG_DELAY_MIN_MS);
      await sleep(Math.round(delay));
    }
  }

  logOperation(agentId, 'info', 'outreach-agent', 'outreach_complete',
    `Outreach cycle complete for agent ${agent.name}`, {
      coldSent: Math.min(totalSent, coldProspects.length),
      warmSent: Math.max(0, totalSent - coldProspects.length),
      totalSent,
    });

  return totalSent;
}
