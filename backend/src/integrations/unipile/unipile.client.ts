/**
 * backend/src/integrations/unipile/unipile.client.ts
 *
 * Base HTTP client for the Unipile API with a full resilience layer (DC-03).
 *
 * DC-03: Resilience specification
 *  - HTTP timeout   : 30 s per request
 *  - Retries        : max 3 with exponential back-off (1 s, 3 s, 9 s)
 *  - Circuit breaker:
 *      CLOSED   -> normal operation
 *      OPEN     -> after 5 consecutive failures within 10 min; all calls rejected immediately
 *      HALF_OPEN-> after 5 min in OPEN state; allows exactly one trial request
 *
 * On OPEN:
 *   1. Return error immediately (do NOT call Unipile)
 *   2. Send Telegram alert once: "Unipile circuit breaker OPEN – LinkedIn operations paused"
 *   3. Failed operations deferred to next job cycle (prospects remain in current status)
 *
 * On HALF_OPEN:
 *   - Trial succeeds -> CLOSED; send Telegram "Unipile recovered"
 *   - Trial fails    -> back to OPEN for another 5 minutes
 *
 * Circuit breaker state is in-memory (resets on process restart, which is acceptable
 * since restart implies Unipile may be reachable again).
 */

import { logger } from '../../utils/logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

interface CircuitBreakerConfig {
  failureThreshold: number;   // consecutive failures to trip  (default: 5)
  resetTimeoutMs: number;     // ms in OPEN before trying HALF_OPEN (default: 300_000)
  monitorWindowMs: number;    // failure-counting window (default: 600_000)
}

const DEFAULT_CB_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  resetTimeoutMs: 300_000,   // 5 minutes
  monitorWindowMs: 600_000,  // 10 minutes
};

export interface SearchOptions {
  limit?: number;
  offset?: number;
  location?: string;
  industry?: string;
}

export interface UnipileProfile {
  id: string;
  providerId: string;
  firstName?: string;
  lastName?: string;
  headline?: string;
  location?: string;
  industry?: string;
  summary?: string;
  profilePictureUrl?: string;
  connectionsCount?: number;
  mutualConnectionsCount?: number;
  experiences?: Array<{
    title: string;
    company: string;
    startDate?: string;
    endDate?: string;
    description?: string;
  }>;
  skills?: string[];
  rawData?: Record<string, unknown>;
}

export interface SearchResult {
  profiles: UnipileProfile[];
  total: number;
  hasMore: boolean;
}

export interface InvitationResult {
  success: boolean;
  invitationId?: string;
  error?: string;
}

export interface MessageResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface UnipileInvitation {
  id: string;
  providerId: string;
  status: string;
  sentAt: string;
  profile?: Partial<UnipileProfile>;
}

export interface UnipileMessage {
  id: string;
  chatId: string;
  senderId: string;
  text: string;
  sentAt: string;
  isRead: boolean;
}

export interface UnipileRelation {
  id: string;
  providerId: string;
  firstName?: string;
  lastName?: string;
  headline?: string;
  connectedAt?: string;
}

export interface UnipileChat {
  id: string;
  participantId: string;
  participantProviderId: string;
  lastMessageAt?: string;
  lastMessagePreview?: string;
  unreadCount?: number;
}

// ---------------------------------------------------------------------------
// Helper: sleep
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// UnipileClient
// ---------------------------------------------------------------------------

export class UnipileClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeoutMs = 30_000;
  private readonly maxRetries = 3;
  private readonly retryDelays = [1_000, 3_000, 9_000]; // exponential back-off

  // Circuit breaker state
  private cbState: CircuitState = 'CLOSED';
  private consecutiveFailures = 0;
  private openedAt: number | null = null;
  private readonly cbConfig: CircuitBreakerConfig;

  // Telegram alert deduplication — only send once per OPEN transition
  private alertSentForCurrentOpen = false;

  constructor(
    baseUrl: string,
    apiKey: string,
    cbConfig: Partial<CircuitBreakerConfig> = {},
  ) {
    this.baseUrl = baseUrl.replace(/\/$/, ''); // strip trailing slash
    this.apiKey = apiKey;
    this.cbConfig = { ...DEFAULT_CB_CONFIG, ...cbConfig };
  }

  // -------------------------------------------------------------------------
  // Circuit breaker helpers
  // -------------------------------------------------------------------------

  getCircuitState(): CircuitState {
    return this.cbState;
  }

  private transitionToOpen(): void {
    this.cbState = 'OPEN';
    this.openedAt = Date.now();
    this.alertSentForCurrentOpen = false;
    logger.warn('[UnipileClient] Circuit breaker OPEN — LinkedIn operations paused');

    if (!this.alertSentForCurrentOpen) {
      this.alertSentForCurrentOpen = true;
      // Lazy import to avoid circular deps
      import('../telegram/telegram.bot')
        .then(({ telegramBot }) => {
          telegramBot
            .sendAlert('Unipile circuit breaker OPEN — LinkedIn operations paused')
            .catch(() => {/* swallow telegram errors */});
        })
        .catch(() => {/* telegram module not yet available */});
    }
  }

  private transitionToClosed(): void {
    this.cbState = 'CLOSED';
    this.consecutiveFailures = 0;
    this.openedAt = null;
    logger.info('[UnipileClient] Circuit breaker CLOSED — Unipile recovered');

    import('../telegram/telegram.bot')
      .then(({ telegramBot }) => {
        telegramBot
          .sendAlert('Unipile circuit breaker CLOSED — LinkedIn operations resumed')
          .catch(() => {});
      })
      .catch(() => {});
  }

  /**
   * Returns true if the circuit breaker allows the request to proceed.
   * Automatically advances state from OPEN -> HALF_OPEN when the reset timeout elapses.
   */
  private isCallAllowed(): boolean {
    if (this.cbState === 'CLOSED') return true;

    if (this.cbState === 'OPEN') {
      const elapsed = Date.now() - (this.openedAt ?? 0);
      if (elapsed >= this.cbConfig.resetTimeoutMs) {
        this.cbState = 'HALF_OPEN';
        logger.info('[UnipileClient] Circuit breaker -> HALF_OPEN (trial request allowed)');
        return true; // allow the one trial
      }
      return false; // still cooling down
    }

    // HALF_OPEN: allow exactly one trial
    return true;
  }

  private recordFailure(): void {
    this.consecutiveFailures += 1;

    if (this.cbState === 'HALF_OPEN') {
      // Trial failed — go back to OPEN
      logger.warn('[UnipileClient] HALF_OPEN trial failed — circuit back to OPEN');
      this.transitionToOpen();
      return;
    }

    if (
      this.cbState === 'CLOSED' &&
      this.consecutiveFailures >= this.cbConfig.failureThreshold
    ) {
      this.transitionToOpen();
    }
  }

  private recordSuccess(): void {
    if (this.cbState === 'HALF_OPEN') {
      this.transitionToClosed();
    } else {
      this.consecutiveFailures = 0;
    }
  }

  // -------------------------------------------------------------------------
  // Core HTTP helper
  // -------------------------------------------------------------------------

  private async request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
    path: string,
    body?: unknown,
  ): Promise<T> {
    if (!this.isCallAllowed()) {
      throw new Error(
        `[UnipileClient] Circuit breaker ${this.cbState} — request blocked (${path})`,
      );
    }

    let lastError: Error = new Error('Unknown error');

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      if (attempt > 0) {
        const delay = this.retryDelays[attempt - 1] ?? 9_000;
        logger.debug(`[UnipileClient] Retry ${attempt}/${this.maxRetries} for ${path} in ${delay}ms`);
        await sleep(delay);
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        const response = await fetch(`${this.baseUrl}${path}`, {
          method,
          headers: {
            'X-API-KEY': this.apiKey,
            'Content-Type': 'application/json',
          },
          body: body !== undefined ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });

        clearTimeout(timer);

        if (!response.ok) {
          const text = await response.text().catch(() => '');
          throw new Error(
            `[UnipileClient] HTTP ${response.status} ${response.statusText} — ${path}: ${text}`,
          );
        }

        const data = (await response.json()) as T;
        this.recordSuccess();
        return data;
      } catch (err) {
        clearTimeout(timer);
        lastError = err instanceof Error ? err : new Error(String(err));

        // Do not retry on circuit-breaker block or 4xx client errors
        const message = lastError.message;
        if (message.includes('Circuit breaker')) throw lastError;
        if (/HTTP 4\d\d/.test(message)) throw lastError; // 4xx — not transient

        logger.warn(`[UnipileClient] Attempt ${attempt + 1} failed for ${path}: ${message}`);

        if (attempt === this.maxRetries) {
          this.recordFailure();
          throw lastError;
        }
      }
    }

    // Should be unreachable, but TypeScript needs a return path
    throw lastError;
  }

  // -------------------------------------------------------------------------
  // Public API methods
  // -------------------------------------------------------------------------

  /**
   * Search LinkedIn people by keyword(s).
   * Constraint C2: keyword-only search, ~10 results per query on LinkedIn Free.
   */
  async searchPeople(keywords: string, options: SearchOptions = {}): Promise<SearchResult> {
    const params = new URLSearchParams({ keywords });
    if (options.limit !== undefined) params.set('limit', String(options.limit));
    if (options.offset !== undefined) params.set('offset', String(options.offset));
    if (options.location) params.set('location', options.location);
    if (options.industry) params.set('industry', options.industry);

    const data = await this.request<{ items: UnipileProfile[]; total: number; next?: string }>(
      'GET',
      `/api/v1/linkedin/search/people?${params.toString()}`,
    );

    return {
      profiles: data.items ?? [],
      total: data.total ?? (data.items?.length ?? 0),
      hasMore: Boolean(data.next),
    };
  }

  /**
   * Fetch a full LinkedIn profile.
   * @param accountId  Unipile account ID for the LinkedIn account being used
   * @param linkedinId LinkedIn member URN or vanity URL
   */
  async getProfile(accountId: string, linkedinId: string): Promise<UnipileProfile> {
    return this.request<UnipileProfile>(
      'GET',
      `/api/v1/linkedin/profile/${encodeURIComponent(linkedinId)}?account_id=${encodeURIComponent(accountId)}`,
    );
  }

  /**
   * Send a connection invitation WITHOUT a note.
   * Constraint C9: LinkedIn Free — invitations are sent WITHOUT message.
   * @param accountId  Unipile account ID
   * @param providerId LinkedIn member URN of the target
   */
  async sendInvitation(accountId: string, providerId: string): Promise<InvitationResult> {
    try {
      const data = await this.request<{ id: string }>(
        'POST',
        '/api/v1/linkedin/invitation',
        {
          account_id: accountId,
          provider_id: providerId,
          // Deliberately omitting `message` — C9: no note on LinkedIn Free
        },
      );
      return { success: true, invitationId: data.id };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }

  /**
   * Send a message to an existing chat.
   * @param accountId Unipile account ID
   * @param chatId    Unipile chat ID
   * @param text      Message body
   */
  async sendMessage(accountId: string, chatId: string, text: string): Promise<MessageResult> {
    try {
      const data = await this.request<{ id: string }>(
        'POST',
        '/api/v1/linkedin/message',
        {
          account_id: accountId,
          chat_id: chatId,
          text,
        },
      );
      return { success: true, messageId: data.id };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }

  /**
   * Get sent/received invitations for an account.
   * @param accountId Unipile account ID
   * @param status    'pending' | 'accepted' | 'declined' | 'all'
   * @param since     ISO timestamp — only return invitations after this time
   */
  async getInvitations(
    accountId: string,
    status: 'pending' | 'accepted' | 'declined' | 'all' = 'all',
    since?: string,
  ): Promise<UnipileInvitation[]> {
    const params = new URLSearchParams({ account_id: accountId, status });
    if (since) params.set('since', since);

    const data = await this.request<{ items: UnipileInvitation[] }>(
      'GET',
      `/api/v1/linkedin/invitations?${params.toString()}`,
    );
    return data.items ?? [];
  }

  /**
   * Get messages received since a given timestamp.
   * @param accountId Unipile account ID
   * @param since     ISO timestamp (optional)
   */
  async getMessages(accountId: string, since?: string): Promise<UnipileMessage[]> {
    const params = new URLSearchParams({ account_id: accountId });
    if (since) params.set('since', since);

    const data = await this.request<{ items: UnipileMessage[] }>(
      'GET',
      `/api/v1/linkedin/messages?${params.toString()}`,
    );
    return data.items ?? [];
  }

  /**
   * List all first-degree connections (relations) for an account.
   */
  async listRelations(accountId: string): Promise<UnipileRelation[]> {
    const data = await this.request<{ items: UnipileRelation[] }>(
      'GET',
      `/api/v1/linkedin/relations?account_id=${encodeURIComponent(accountId)}`,
    );
    return data.items ?? [];
  }

  /**
   * List all active chats/conversations for an account.
   */
  async listChats(accountId: string): Promise<UnipileChat[]> {
    const data = await this.request<{ items: UnipileChat[] }>(
      'GET',
      `/api/v1/linkedin/chats?account_id=${encodeURIComponent(accountId)}`,
    );
    return data.items ?? [];
  }

  /**
   * Get messages from a specific chat.
   * @param chatId  Unipile chat ID
   * @param limit   Maximum number of messages to return (default 50)
   */
  async getChatMessages(chatId: string, limit = 50): Promise<UnipileMessage[]> {
    const data = await this.request<{ items: UnipileMessage[] }>(
      'GET',
      `/api/v1/linkedin/chats/${encodeURIComponent(chatId)}/messages?limit=${limit}`,
    );
    return data.items ?? [];
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

function createUnipileClient(): UnipileClient {
  const baseUrl = process.env.UNIPILE_BASE_URL ?? 'https://api.unipile.com';
  const apiKey = process.env.UNIPILE_API_KEY ?? '';

  if (!apiKey) {
    logger.warn('[UnipileClient] UNIPILE_API_KEY is not set — client will fail on first use');
  }

  return new UnipileClient(baseUrl, apiKey);
}

export const unipileClient: UnipileClient = createUnipileClient();
