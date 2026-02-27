/**
 * DC-02: webhook-signature.middleware.ts
 * Validates incoming Unipile webhook requests using HMAC-SHA256 signature verification.
 *
 * Expected headers from Unipile:
 *   X-Unipile-Signature  — hex-encoded HMAC-SHA256(rawBody, UNIPILE_WEBHOOK_SECRET)
 *   X-Unipile-Timestamp  — Unix timestamp (seconds) of when the request was sent
 *
 * Rejects with 401 on:
 *   - Missing signature or timestamp header
 *   - Timestamp older than 5 minutes (replay attack prevention)
 *   - Signature mismatch
 */

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { logger } from '../../utils/logger';

const TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Express middleware that verifies the Unipile HMAC-SHA256 webhook signature.
 *
 * IMPORTANT: This middleware requires the raw request body to be available on
 * `req.rawBody` (Buffer). Register it with `express.raw({ type: '*\/*' })` or
 * configure the body-parser to expose `rawBody` before this middleware runs.
 */
export function validateUnipileSignature(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const secret = process.env.UNIPILE_WEBHOOK_SECRET;

  if (!secret) {
    logger.error('UNIPILE_WEBHOOK_SECRET is not set — rejecting webhook', {
      action: 'webhook_signature_no_secret',
      meta: { path: req.path },
    });
    res.status(401).json({ error: 'Webhook secret not configured' });
    return;
  }

  // ── 1. Read headers ──────────────────────────────────────────────────────
  const signatureHeader = req.headers['x-unipile-signature'] as string | undefined;
  const timestampHeader = req.headers['x-unipile-timestamp'] as string | undefined;

  if (!signatureHeader || !timestampHeader) {
    logger.warn('Webhook rejected: missing signature or timestamp header', {
      action: 'webhook_signature_missing_headers',
      meta: {
        ip: req.ip,
        path: req.path,
        hasSignature: !!signatureHeader,
        hasTimestamp: !!timestampHeader,
      },
    });
    res.status(401).json({ error: 'Missing webhook signature headers' });
    return;
  }

  // ── 2. Validate timestamp (replay attack prevention) ────────────────────
  const timestampSeconds = parseInt(timestampHeader, 10);
  if (isNaN(timestampSeconds)) {
    logger.warn('Webhook rejected: invalid timestamp header value', {
      action: 'webhook_signature_invalid_timestamp',
      meta: { ip: req.ip, path: req.path, timestampHeader },
    });
    res.status(401).json({ error: 'Invalid webhook timestamp' });
    return;
  }

  const requestTimeMs = timestampSeconds * 1000;
  const nowMs = Date.now();
  const ageDeltaMs = Math.abs(nowMs - requestTimeMs);

  if (ageDeltaMs > TIMESTAMP_TOLERANCE_MS) {
    logger.warn('Webhook rejected: timestamp outside 5-minute tolerance window', {
      action: 'webhook_signature_stale_timestamp',
      meta: {
        ip: req.ip,
        path: req.path,
        timestampSeconds,
        ageDeltaMs,
      },
    });
    res.status(401).json({ error: 'Webhook timestamp out of range' });
    return;
  }

  // ── 3. Retrieve raw body ─────────────────────────────────────────────────
  // express.raw() or a custom middleware must populate req.rawBody.
  // Fall back to req.body if it is already a Buffer (e.g., from body-parser verify).
  const rawBody: Buffer | undefined =
    (req as Request & { rawBody?: Buffer }).rawBody ??
    (Buffer.isBuffer(req.body) ? req.body : undefined);

  if (!rawBody) {
    logger.warn('Webhook rejected: raw body not available for signature verification', {
      action: 'webhook_signature_no_raw_body',
      meta: { ip: req.ip, path: req.path },
    });
    res.status(401).json({ error: 'Raw body unavailable for signature verification' });
    return;
  }

  // ── 4. Compute expected HMAC-SHA256 ──────────────────────────────────────
  // Some providers prepend the timestamp to the payload before signing.
  // Unipile signs the raw body directly; adjust if the spec changes.
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(rawBody);
  const expectedSignature = hmac.digest('hex');

  // ── 5. Timing-safe comparison ────────────────────────────────────────────
  let signaturesMatch = false;
  try {
    const expectedBuffer = Buffer.from(expectedSignature, 'hex');
    const receivedBuffer = Buffer.from(signatureHeader, 'hex');

    // Buffers must be the same length for timingSafeEqual
    if (expectedBuffer.length === receivedBuffer.length) {
      signaturesMatch = crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
    }
  } catch {
    // Malformed hex string in the header — treat as mismatch
    signaturesMatch = false;
  }

  if (!signaturesMatch) {
    logger.warn('Webhook rejected: signature mismatch', {
      action: 'webhook_signature_mismatch',
      meta: {
        ip: req.ip,
        path: req.path,
        receivedSignature: signatureHeader.substring(0, 8) + '…', // partial, never log full sig
      },
    });
    res.status(401).json({ error: 'Invalid webhook signature' });
    return;
  }

  // ── 6. Signature valid — proceed ─────────────────────────────────────────
  next();
}
