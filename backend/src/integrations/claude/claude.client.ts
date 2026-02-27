/**
 * backend/src/integrations/claude/claude.client.ts
 *
 * Anthropic SDK wrapper with resilience (DC-13).
 *
 * DC-13: Failure handling
 *  - On timeout or API error: retry ONCE after 5 seconds
 *  - If still failing after retry: skip prospect (remains in current status for next day)
 *  - NEVER send empty or fallback messages — if generation fails, do not send
 *  - Track consecutive failure counter (in-memory):
 *      If 3+ consecutive Claude failures: send Telegram alert and pause
 *      Claude-dependent operations for 15 minutes
 *  - profileAnalysisAttempts counter on Prospect prevents infinite retries
 *    (max 3 analysis attempts, then mark as 'analysis_failed')
 *
 * Model tiers:
 *  - OPUS   : identity building (critical, one-time per identity)
 *  - SONNET : profile analysis + message generation (frequent)
 */

import Anthropic from '@anthropic-ai/sdk';
import { logger } from '../../utils/logger';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SONNET_MODEL = 'claude-sonnet-4-5';
const OPUS_MODEL = 'claude-opus-4-5';

const RETRY_DELAY_MS = 5_000;  // DC-13: retry after 5s
const MAX_RETRIES = 1;         // DC-13: retry exactly once
const CONSECUTIVE_FAILURE_ALERT_THRESHOLD = 3;  // DC-13: 3+ consecutive -> alert
const PAUSE_AFTER_ALERT_MS = 15 * 60 * 1_000;  // 15 minutes

const MAX_TOKENS_ANALYSIS = 1_024;
const MAX_TOKENS_MESSAGE = 512;
const MAX_TOKENS_IDENTITY = 4_096;

// ---------------------------------------------------------------------------
// Helper: sleep
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// ClaudeClient
// ---------------------------------------------------------------------------

export class ClaudeClient {
  private readonly client: Anthropic;

  /** Count of consecutive Claude API failures (in-memory, resets on success). */
  private consecutiveFailures = 0;

  /** Timestamp (ms) until which Claude-dependent operations are paused. null = not paused. */
  private pausedUntil: number | null = null;

  constructor(apiKey?: string) {
    this.client = new Anthropic({
      apiKey: apiKey ?? process.env.ANTHROPIC_API_KEY,
    });
  }

  // -------------------------------------------------------------------------
  // Pause / alert management (DC-13)
  // -------------------------------------------------------------------------

  private isPaused(): boolean {
    if (this.pausedUntil === null) return false;
    if (Date.now() >= this.pausedUntil) {
      // Pause expired
      this.pausedUntil = null;
      this.consecutiveFailures = 0;
      logger.info('[ClaudeClient] Pause expired — resuming Claude operations');
      return false;
    }
    return true;
  }

  private recordSuccess(): void {
    this.consecutiveFailures = 0;
  }

  private async recordFailure(): Promise<void> {
    this.consecutiveFailures += 1;

    if (this.consecutiveFailures >= CONSECUTIVE_FAILURE_ALERT_THRESHOLD) {
      const pauseUntilDate = new Date(Date.now() + PAUSE_AFTER_ALERT_MS);
      this.pausedUntil = pauseUntilDate.getTime();

      logger.error(
        `[ClaudeClient] ${this.consecutiveFailures} consecutive failures — pausing until ${pauseUntilDate.toISOString()}`,
      );

      try {
        const { telegramBot } = await import('../telegram/telegram.bot');
        await telegramBot
          .sendAlert(
            `Claude API: ${this.consecutiveFailures} consecutive failures detected.\n` +
              `Operations paused for 15 minutes (until ${pauseUntilDate.toLocaleTimeString('it-IT')}).`,
          )
          .catch(() => {});
      } catch {
        // Telegram not available — log only
      }
    }
  }

  // -------------------------------------------------------------------------
  // Core request helper
  // -------------------------------------------------------------------------

  private async callClaude(
    model: string,
    systemPrompt: string,
    userPrompt: string,
    maxTokens: number,
  ): Promise<string> {
    if (this.isPaused()) {
      const remaining = Math.ceil(((this.pausedUntil ?? 0) - Date.now()) / 1_000);
      throw new Error(
        `[ClaudeClient] Operations paused due to consecutive failures (${remaining}s remaining)`,
      );
    }

    let lastError: Error = new Error('Unknown Claude error');

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        logger.debug(`[ClaudeClient] Retry attempt ${attempt}/${MAX_RETRIES} after ${RETRY_DELAY_MS}ms`);
        await sleep(RETRY_DELAY_MS);
      }

      try {
        const response = await this.client.messages.create({
          model,
          max_tokens: maxTokens,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
        });

        const content = response.content[0];
        if (!content || content.type !== 'text' || !content.text.trim()) {
          throw new Error('[ClaudeClient] Empty or non-text response from Claude');
        }

        this.recordSuccess();
        return content.text.trim();
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        logger.warn(
          `[ClaudeClient] Attempt ${attempt + 1} failed: ${lastError.message}`,
        );
      }
    }

    // All retries exhausted
    await this.recordFailure();
    throw lastError;
  }

  // -------------------------------------------------------------------------
  // Public methods
  // -------------------------------------------------------------------------

  /**
   * Analyse a LinkedIn prospect profile using Claude Sonnet.
   * Used by profile-analyzer.ts.
   *
   * @param systemPrompt  Fully rendered system prompt (from claude.prompts.ts)
   * @param userPrompt    Fully rendered user prompt containing <prospect_data> XML block
   * @returns             Raw text response (JSON string) to be parsed by claude.parsers.ts
   */
  async analyzeProfile(systemPrompt: string, userPrompt: string): Promise<string> {
    return this.callClaude(SONNET_MODEL, systemPrompt, userPrompt, MAX_TOKENS_ANALYSIS);
  }

  /**
   * Generate an outreach or follow-up message using Claude Sonnet.
   * DC-13: NEVER return an empty or fallback string — callers MUST handle thrown errors
   * by skipping the prospect (not sending a message).
   *
   * @param systemPrompt  Fully rendered system prompt
   * @param userPrompt    Fully rendered user prompt
   * @returns             Generated message text
   */
  async generateMessage(systemPrompt: string, userPrompt: string): Promise<string> {
    return this.callClaude(SONNET_MODEL, systemPrompt, userPrompt, MAX_TOKENS_MESSAGE);
  }

  /**
   * Build an identity package using Claude Opus (highest quality, one-time per identity).
   * Used by identity-builder.ts.
   *
   * @param systemPrompt  Fully rendered identity builder system prompt
   * @param userPrompt    Fully rendered user prompt containing uploaded document texts
   * @returns             Raw text response (JSON string with IdentityPackage)
   */
  async buildIdentity(systemPrompt: string, userPrompt: string): Promise<string> {
    return this.callClaude(OPUS_MODEL, systemPrompt, userPrompt, MAX_TOKENS_IDENTITY);
  }

  // -------------------------------------------------------------------------
  // Diagnostics
  // -------------------------------------------------------------------------

  getConsecutiveFailures(): number {
    return this.consecutiveFailures;
  }

  getPausedUntil(): Date | null {
    return this.pausedUntil !== null ? new Date(this.pausedUntil) : null;
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

function createClaudeClient(): ClaudeClient {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    logger.warn('[ClaudeClient] ANTHROPIC_API_KEY is not set — client will fail on first use');
  }
  return new ClaudeClient(apiKey);
}

export const claudeClient: ClaudeClient = createClaudeClient();
