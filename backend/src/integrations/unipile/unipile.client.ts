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
 *
 * API Reference: https://developer.unipile.com/docs/getting-started
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
  // Downstream-compatible fields (populated by searchPeople mapping)
  linkedinId: string;
  fullName?: string;
  linkedinUrl?: string;
  companyName?: string;
  publicIdentifier?: string;
  networkDistance?: string;
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
// Raw Unipile search response item (as returned by the API)
// ---------------------------------------------------------------------------

interface UnipileSearchItem {
  type: string;
  id: string;                           // provider internal ID (ACoAAA...)
  name?: string;
  first_name?: string;
  last_name?: string;
  member_urn?: string;
  public_identifier?: string;
  profile_url?: string;
  public_profile_url?: string;
  profile_picture_url?: string;
  profile_picture_url_large?: string;
  network_distance?: string;
  location?: string;
  headline?: string;
  industry?: string;
  premium?: boolean;
  verified?: boolean;
  current_positions?: Array<{
    company?: string;
    role?: string;
    tenure_at_company?: unknown;
  }>;
  pending_invitation?: boolean;
  open_profile?: boolean;
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
  private readonly accountId: string;
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
    accountId: string,
    cbConfig: Partial<CircuitBreakerConfig> = {},
  ) {
    this.baseUrl = baseUrl.replace(/\/$/, ''); // strip trailing slash
    this.apiKey = apiKey;
    this.accountId = accountId;
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
  // Docs: https://developer.unipile.com/docs/linkedin-search
  // -------------------------------------------------------------------------

  /**
   * Search LinkedIn people by keyword(s).
   * Endpoint: POST /api/v1/linkedin/search?account_id={accountId}
   * Body: { api: "classic", category: "people", keyword: keywords }
   * Constraint C2: keyword-only search, ~10 results per query on LinkedIn Free.
   */
  async searchPeople(keywords: string, options: SearchOptions = {}): Promise<SearchResult> {
    const acct = encodeURIComponent(this.accountId);

    const body: Record<string, unknown> = {
      api: 'classic',
      category: 'people',
      keyword: keywords,
    };
    if (options.limit !== undefined) body.limit = options.limit;

    const data = await this.request<{
      object: string;
      items: UnipileSearchItem[];
      paging?: { start: number; page_count: number; total_count: number };
      cursor?: string | null;
    }>(
      'POST',
      `/api/v1/linkedin/search?account_id=${acct}`,
      body,
    );

    const items = data.items ?? [];

    // Map raw Unipile search items to UnipileProfile format
    const profiles: UnipileProfile[] = items
      .filter((item) => item.type === 'PEOPLE')
      .map((item) => {
        const nameParts = (item.name ?? '').split(' ');
        const firstName = item.first_name ?? nameParts[0] ?? '';
        const lastName = item.last_name ?? nameParts.slice(1).join(' ') ?? '';
        const fullName = item.name ?? `${firstName} ${lastName}`.trim();

        // Try to extract company from current_positions or headline
        let companyName: string | undefined;
        if (item.current_positions?.length) {
          companyName = item.current_positions[0]?.company ?? undefined;
        }
        if (!companyName && item.headline) {
          // Simple heuristic: "Role at Company" or "Role | Company"
          const atMatch = item.headline.match(/\bat\b\s+(.+)/i);
          const pipeMatch = item.headline.match(/\|\s*(.+)/);
          companyName = atMatch?.[1]?.trim() ?? pipeMatch?.[1]?.trim() ?? undefined;
        }

        const linkedinUrl = item.profile_url
          ?? item.public_profile_url
          ?? (item.public_identifier ? `https://www.linkedin.com/in/${item.public_identifier}` : '');

        return {
          // Core UnipileProfile fields
          id: item.id,
          providerId: item.id,
          firstName,
          lastName,
          headline: item.headline ?? undefined,
          location: item.location ?? undefined,
          industry: item.industry ?? undefined,
          profilePictureUrl: item.profile_picture_url ?? undefined,
          rawData: item as unknown as Record<string, unknown>,
          // Downstream-compatible fields for filterProfiles / midday job
          linkedinId: item.id,
          fullName,
          linkedinUrl,
          companyName,
          publicIdentifier: item.public_identifier ?? undefined,
          networkDistance: item.network_distance ?? undefined,
        };
      });

    return {
      profiles,
      total: data.paging?.total_count ?? profiles.length,
      hasMore: Boolean(data.cursor),
    };
  }

  /**
   * Fetch a full LinkedIn profile.
   * Endpoint: GET /api/v1/users/{identifier}?account_id={accountId}&linkedin_sections=*
   * Docs: https://developer.unipile.com/docs/retrieving-users
   * @param accountId  Unipile account ID for the LinkedIn account being used
   * @param linkedinId LinkedIn public_identifier or provider_id
   */
  async getProfile(accountId: string, linkedinId: string): Promise<UnipileProfile> {
    const params = new URLSearchParams({
      account_id: accountId,
      linkedin_sections: '*',
    });

    const data = await this.request<Record<string, unknown>>(
      'GET',
      `/api/v1/users/${encodeURIComponent(linkedinId)}?${params.toString()}`,
    );

    const firstName = (data.first_name as string) ?? '';
    const lastName = (data.last_name as string) ?? '';

    return {
      id: (data.id as string) ?? linkedinId,
      providerId: (data.provider_id as string) ?? (data.id as string) ?? linkedinId,
      firstName,
      lastName,
      headline: (data.headline as string) ?? undefined,
      location: (data.location as string) ?? undefined,
      industry: (data.industry as string) ?? undefined,
      summary: (data.summary as string) ?? undefined,
      profilePictureUrl: (data.profile_picture_url as string) ?? undefined,
      connectionsCount: (data.connections_count as number) ?? undefined,
      rawData: data,
      linkedinId: (data.provider_id as string) ?? (data.id as string) ?? linkedinId,
      fullName: (data.name as string) ?? `${firstName} ${lastName}`.trim(),
      linkedinUrl: (data.public_profile_url as string) ?? undefined,
      publicIdentifier: (data.public_identifier as string) ?? undefined,
    };
  }

  /**
   * Send a connection invitation WITHOUT a note.
   * Endpoint: POST /api/v1/users/invite
   * Body: { account_id, provider_id }
   * Docs: https://developer.unipile.com/docs/invite-users
   * Constraint C9: LinkedIn Free — invitations are sent WITHOUT message.
   * @param accountId  Unipile account ID
   * @param providerId LinkedIn provider_id (ACoAAA... format) of the target
   */
  async sendInvitation(accountId: string, providerId: string): Promise<InvitationResult> {
    try {
      const data = await this.request<{ object: string; account_id?: string }>(
        'POST',
        '/api/v1/users/invite',
        {
          account_id: accountId,
          provider_id: providerId,
          // Deliberately omitting `message` — C9: no note on LinkedIn Free
        },
      );
      return { success: true, invitationId: data.account_id ?? providerId };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }

  /**
   * Send a message to an existing chat.
   * Endpoint: POST /api/v1/chats/{chatId}/messages
   * Body: { text }
   * Docs: https://developer.unipile.com/docs/send-messages
   * @param _accountId Unipile account ID (unused — chat already scoped to account)
   * @param chatId    Unipile chat ID
   * @param text      Message body
   */
  async sendMessage(_accountId: string, chatId: string, text: string): Promise<MessageResult> {
    try {
      const data = await this.request<{ object: string; message_id?: string }>(
        'POST',
        `/api/v1/chats/${encodeURIComponent(chatId)}/messages`,
        { text },
      );
      return { success: true, messageId: data.message_id };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }

  /**
   * Get sent invitations for an account (pending).
   * Endpoint: GET /api/v1/users/invitations/sent?account_id={accountId}
   * Docs: https://developer.unipile.com/reference/userscontroller_listalluserinvitationssent
   * @param accountId Unipile account ID
   * @param _status   Unused — Unipile returns pending invitations only
   * @param _since    Unused — filter client-side if needed
   */
  async getInvitations(
    accountId: string,
    _status: 'pending' | 'accepted' | 'declined' | 'all' = 'all',
    _since?: string,
  ): Promise<UnipileInvitation[]> {
    const params = new URLSearchParams({ account_id: accountId });

    const data = await this.request<{ items: Array<Record<string, unknown>> }>(
      'GET',
      `/api/v1/users/invitations/sent?${params.toString()}`,
    );

    return (data.items ?? []).map((item) => ({
      id: (item.id as string) ?? '',
      providerId: (item.provider_id as string) ?? (item.id as string) ?? '',
      status: (item.status as string) ?? 'pending',
      sentAt: (item.sent_at as string) ?? (item.created_at as string) ?? '',
    }));
  }

  /**
   * Get messages across all chats.
   * Endpoint: GET /api/v1/messages?account_id={accountId}
   * Docs: https://developer.unipile.com/docs/get-messages
   * @param accountId Unipile account ID
   * @param since     ISO timestamp (optional) — not natively supported; filter client-side
   */
  async getMessages(accountId: string, since?: string): Promise<UnipileMessage[]> {
    const params = new URLSearchParams({ account_id: accountId });
    if (since) params.set('after', since);

    const data = await this.request<{ items: Array<Record<string, unknown>> }>(
      'GET',
      `/api/v1/messages?${params.toString()}`,
    );

    return (data.items ?? []).map((item) => ({
      id: (item.id as string) ?? '',
      chatId: (item.chat_id as string) ?? '',
      senderId: (item.sender_id as string) ?? '',
      text: (item.text as string) ?? (item.body as string) ?? '',
      sentAt: (item.timestamp as string) ?? (item.created_at as string) ?? '',
      isRead: (item.is_read as boolean) ?? false,
    }));
  }

  /**
   * List all first-degree connections (relations) for an account.
   * Endpoint: GET /api/v1/users/{accountId}/relations
   * Docs: https://developer.unipile.com/reference/userscontroller_getrelations
   */
  async listRelations(accountId: string): Promise<UnipileRelation[]> {
    const data = await this.request<{ items: Array<Record<string, unknown>> }>(
      'GET',
      `/api/v1/users/${encodeURIComponent(accountId)}/relations`,
    );

    return (data.items ?? []).map((item) => ({
      id: (item.id as string) ?? '',
      providerId: (item.provider_id as string) ?? (item.id as string) ?? '',
      firstName: (item.first_name as string) ?? undefined,
      lastName: (item.last_name as string) ?? undefined,
      headline: (item.headline as string) ?? undefined,
      connectedAt: (item.connected_at as string) ?? (item.created_at as string) ?? undefined,
    }));
  }

  /**
   * List all active chats/conversations for an account.
   * Endpoint: GET /api/v1/chats?account_id={accountId}
   * Docs: https://developer.unipile.com/reference/chatscontroller_listallchats
   */
  async listChats(accountId: string): Promise<UnipileChat[]> {
    const params = new URLSearchParams({ account_id: accountId });

    const data = await this.request<{ items: Array<Record<string, unknown>> }>(
      'GET',
      `/api/v1/chats?${params.toString()}`,
    );

    return (data.items ?? []).map((item) => ({
      id: (item.id as string) ?? '',
      participantId: (item.attendee_id as string) ?? '',
      participantProviderId: (item.attendee_provider_id as string) ?? '',
      lastMessageAt: (item.last_message_at as string) ?? undefined,
      lastMessagePreview: (item.last_message_preview as string) ?? undefined,
      unreadCount: (item.unread_count as number) ?? undefined,
    }));
  }

  /**
   * Get messages from a specific chat.
   * Endpoint: GET /api/v1/chats/{chatId}/messages?limit={limit}
   * Docs: https://developer.unipile.com/docs/get-messages
   * @param chatId  Unipile chat ID
   * @param limit   Maximum number of messages to return (default 50)
   */
  async getChatMessages(chatId: string, limit = 50): Promise<UnipileMessage[]> {
    const data = await this.request<{ items: Array<Record<string, unknown>> }>(
      'GET',
      `/api/v1/chats/${encodeURIComponent(chatId)}/messages?limit=${limit}`,
    );

    return (data.items ?? []).map((item) => ({
      id: (item.id as string) ?? '',
      chatId: (item.chat_id as string) ?? chatId,
      senderId: (item.sender_id as string) ?? '',
      text: (item.text as string) ?? (item.body as string) ?? '',
      sentAt: (item.timestamp as string) ?? (item.created_at as string) ?? '',
      isRead: (item.is_read as boolean) ?? false,
    }));
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

function createUnipileClient(): UnipileClient {
  const baseUrl = process.env.UNIPILE_BASE_URL ?? 'https://api.unipile.com';
  const apiKey = process.env.UNIPILE_API_KEY ?? '';
  const accountId = process.env.UNIPILE_ACCOUNT_ID ?? '';

  if (!apiKey) {
    logger.warn('[UnipileClient] UNIPILE_API_KEY is not set — client will fail on first use');
  }
  if (!accountId) {
    logger.warn('[UnipileClient] UNIPILE_ACCOUNT_ID is not set — search will fail');
  }

  return new UnipileClient(baseUrl, apiKey, accountId);
}

export const unipileClient: UnipileClient = createUnipileClient();
