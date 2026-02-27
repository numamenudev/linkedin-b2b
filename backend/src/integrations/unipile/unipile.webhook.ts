/**
 * backend/src/integrations/unipile/unipile.webhook.ts
 *
 * Webhook event handler for Unipile callbacks.
 *
 * DC-02: Security
 *  - verifyUnipileSignature: validates HMAC-SHA256 using the X-Unipile-Signature header
 *    and the raw request body.  Rejects events that are > 5 minutes old (X-Unipile-Timestamp).
 *    Returns false (and logs the attempt) on any mismatch.
 *
 * Supported event types:
 *  - new_relation      : a connection request was accepted by the prospect
 *  - message_received  : inbound message from a prospect
 *  - invitation_accepted (alias for new_relation from some Unipile versions)
 *  - invitation_rejected: a sent invitation was declined
 */

import crypto from 'crypto';
import { logger } from '../../utils/logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UnipileWebhookPayload {
  type: string;
  account_id?: string;
  provider_id?: string;
  chat_id?: string;
  message_id?: string;
  invitation_id?: string;
  sender_id?: string;
  text?: string;
  timestamp?: string;
  data?: Record<string, unknown>;
}

// Minimal shape of Express-like request expected by verifyUnipileSignature
export interface WebhookRequest {
  headers: Record<string, string | string[] | undefined>;
  rawBody?: Buffer | string;
  body?: unknown;
}

// ---------------------------------------------------------------------------
// DC-02: HMAC-SHA256 signature verification
// ---------------------------------------------------------------------------

/**
 * Verifies the Unipile webhook signature.
 *
 * Unipile sends:
 *   X-Unipile-Signature: sha256=<hex_digest>
 *   X-Unipile-Timestamp: <unix_epoch_seconds>
 *
 * We compute HMAC-SHA256(secret, rawBody) and compare in constant time.
 * We also reject payloads older than 5 minutes to prevent replay attacks.
 *
 * @returns true if the signature is valid and the timestamp is fresh.
 */
export function verifyUnipileSignature(req: WebhookRequest): boolean {
  const secret = process.env.UNIPILE_WEBHOOK_SECRET;
  if (!secret) {
    logger.error('[UnipileWebhook] UNIPILE_WEBHOOK_SECRET is not configured');
    return false;
  }

  // ---- Retrieve headers (normalise to lowercase) --------------------------
  const getHeader = (name: string): string | undefined => {
    const value = req.headers[name] ?? req.headers[name.toLowerCase()];
    return Array.isArray(value) ? value[0] : value;
  };

  const signatureHeader = getHeader('x-unipile-signature');
  const timestampHeader = getHeader('x-unipile-timestamp');

  if (!signatureHeader || !timestampHeader) {
    logger.warn('[UnipileWebhook] Missing signature or timestamp header — request rejected');
    return false;
  }

  // ---- Timestamp freshness check (reject > 5 min old) ---------------------
  const eventTimestampSeconds = parseInt(timestampHeader, 10);
  if (isNaN(eventTimestampSeconds)) {
    logger.warn('[UnipileWebhook] Invalid timestamp header value — request rejected');
    return false;
  }
  const nowSeconds = Math.floor(Date.now() / 1000);
  const ageSeconds = nowSeconds - eventTimestampSeconds;
  if (ageSeconds > 300 || ageSeconds < -60) {
    logger.warn(
      `[UnipileWebhook] Timestamp out of window (age=${ageSeconds}s) — request rejected`,
    );
    return false;
  }

  // ---- Extract raw body ---------------------------------------------------
  const rawBody = req.rawBody ?? (req.body !== undefined ? JSON.stringify(req.body) : '');
  const bodyBuffer = Buffer.isBuffer(rawBody)
    ? rawBody
    : Buffer.from(typeof rawBody === 'string' ? rawBody : String(rawBody), 'utf8');

  // ---- Compute expected signature ----------------------------------------
  // Unipile signs: timestamp + '.' + rawBody  (same pattern as Stripe)
  const payload = Buffer.concat([
    Buffer.from(`${timestampHeader}.`, 'utf8'),
    bodyBuffer,
  ]);

  const expected = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  // Header may arrive as "sha256=<hex>" or just "<hex>"
  const received = signatureHeader.startsWith('sha256=')
    ? signatureHeader.slice(7)
    : signatureHeader;

  // ---- Constant-time comparison ------------------------------------------
  const expectedBuf = Buffer.from(expected, 'hex');
  const receivedBuf = Buffer.from(received, 'hex');

  if (
    expectedBuf.length !== receivedBuf.length ||
    !crypto.timingSafeEqual(expectedBuf, receivedBuf)
  ) {
    logger.warn('[UnipileWebhook] HMAC signature mismatch — request rejected');
    return false;
  }

  return true;
}

// ---------------------------------------------------------------------------
// Event dispatcher
// ---------------------------------------------------------------------------

/**
 * Dispatch a verified Unipile webhook event to the appropriate handler.
 * All heavy processing is done via lazy-loaded handlers to avoid circular deps.
 */
export async function handleWebhookEvent(event: UnipileWebhookPayload): Promise<void> {
  logger.info(`[UnipileWebhook] Received event type="${event.type}"`, {
    account_id: event.account_id,
    provider_id: event.provider_id,
  });

  switch (event.type) {
    case 'new_relation':
    case 'invitation_accepted':
      await handleNewRelation(event);
      break;

    case 'message_received':
      await handleMessageReceived(event);
      break;

    case 'invitation_rejected':
      await handleInvitationRejected(event);
      break;

    default:
      logger.debug(`[UnipileWebhook] Unhandled event type="${event.type}" — ignored`);
  }
}

// ---------------------------------------------------------------------------
// Individual event handlers
// ---------------------------------------------------------------------------

/**
 * A connection request was accepted by the prospect.
 * Transitions the corresponding Prospect record from 'connection_sent' -> 'accepted'.
 */
async function handleNewRelation(event: UnipileWebhookPayload): Promise<void> {
  const providerId = event.provider_id;
  if (!providerId) {
    logger.warn('[UnipileWebhook] new_relation event missing provider_id — skipped');
    return;
  }

  try {
    const { getDb } = await import('../../db/prisma.client');
    const db = getDb();

    const prospect = await db.prospect.findFirst({
      where: {
        linkedinId: providerId,
        status: { in: ['connection_sent', 'found', 'queued'] },
      },
      include: { agent: true },
    });

    if (!prospect) {
      logger.debug(
        `[UnipileWebhook] new_relation: no prospect found for providerId=${providerId}`,
      );
      return;
    }

    await db.prospect.update({
      where: { id: prospect.id },
      data: {
        status: 'accepted',
        acceptedAt: new Date(),
        updatedAt: new Date(),
      },
    });

    logger.info(
      `[UnipileWebhook] Prospect ${prospect.id} (${providerId}) transitioned -> accepted`,
      { agentId: prospect.agentId },
    );
  } catch (err) {
    logger.error('[UnipileWebhook] Error handling new_relation event', {
      error: (err as Error).message,
      providerId,
    });
  }
}

/**
 * An inbound message was received from a prospect.
 * Rule C8: automation MUST stop immediately on any inbound message.
 */
async function handleMessageReceived(event: UnipileWebhookPayload): Promise<void> {
  const senderId = event.sender_id ?? event.provider_id;
  const chatId = event.chat_id;
  const messageText = event.text ?? '';

  if (!senderId) {
    logger.warn('[UnipileWebhook] message_received event missing sender_id — skipped');
    return;
  }

  try {
    const { getDb } = await import('../../db/prisma.client');
    const db = getDb();

    const prospect = await db.prospect.findFirst({
      where: { linkedinId: senderId },
      include: { agent: true },
    });

    if (!prospect) {
      logger.debug(
        `[UnipileWebhook] message_received: no prospect found for senderId=${senderId}`,
      );
      return;
    }

    // C8: stop automation immediately on any inbound message
    await db.prospect.update({
      where: { id: prospect.id },
      data: {
        status: 'responded',
        lastActivityAt: new Date(),
        updatedAt: new Date(),
      },
    });

    // Persist the inbound message
    await db.message.create({
      data: {
        prospectId: prospect.id,
        direction: 'inbound',
        text: messageText,
        chatId: chatId ?? undefined,
        sentAt: new Date(),
        createdAt: new Date(),
      },
    });

    logger.info(
      `[UnipileWebhook] Prospect ${prospect.id} responded — automation halted (C8)`,
      { agentId: prospect.agentId },
    );

    // Send Telegram alert
    const preview =
      messageText.length > 100 ? `${messageText.slice(0, 100)}…` : messageText;
    const agentName = prospect.agent?.name ?? 'Unknown Agent';
    const prospectName = `${prospect.firstName ?? ''} ${prospect.lastName ?? ''}`.trim();

    import('../telegram/telegram.bot')
      .then(({ telegramBot }) => {
        telegramBot
          .sendResponse(agentName, prospectName, preview)
          .catch(() => {});
      })
      .catch(() => {});
  } catch (err) {
    logger.error('[UnipileWebhook] Error handling message_received event', {
      error: (err as Error).message,
      senderId,
    });
  }
}

/**
 * A sent invitation was declined by the prospect.
 * Transitions the Prospect record to 'declined'.
 */
async function handleInvitationRejected(event: UnipileWebhookPayload): Promise<void> {
  const providerId = event.provider_id;
  if (!providerId) {
    logger.warn('[UnipileWebhook] invitation_rejected event missing provider_id — skipped');
    return;
  }

  try {
    const { getDb } = await import('../../db/prisma.client');
    const db = getDb();

    const prospect = await db.prospect.findFirst({
      where: { linkedinId: providerId, status: 'connection_sent' },
    });

    if (!prospect) {
      logger.debug(
        `[UnipileWebhook] invitation_rejected: no prospect found for providerId=${providerId}`,
      );
      return;
    }

    await db.prospect.update({
      where: { id: prospect.id },
      data: {
        status: 'declined',
        updatedAt: new Date(),
      },
    });

    logger.info(
      `[UnipileWebhook] Prospect ${prospect.id} (${providerId}) invitation rejected -> declined`,
    );
  } catch (err) {
    logger.error('[UnipileWebhook] Error handling invitation_rejected event', {
      error: (err as Error).message,
      providerId,
    });
  }
}
