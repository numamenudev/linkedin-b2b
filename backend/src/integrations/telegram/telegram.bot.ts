/**
 * backend/src/integrations/telegram/telegram.bot.ts
 *
 * Telegram bot client — send-only mode (polling: false).
 *
 * Functions:
 *  sendAlert(message)                       — immediate generic alert
 *  sendResponse(agentName, name, preview)   — immediate: prospect replied
 *  sendDailyReport(data)                    — evening job
 *  sendMorningBriefing(data)                — morning job
 *  sendNetworkAnalysisReport(data)          — sunday job
 *  sendError(agentId, error)                — immediate: system error
 *
 * All messages use Telegram Markdown V2 formatting.
 * The bot never reads incoming messages (polling: false) — send-only.
 */

import TelegramBot from 'node-telegram-bot-api';
import { logger } from '../../utils/logger';
import {
  formatMorningReport,
  formatEveningReport,
  formatResponseAlert,
  formatErrorAlert,
  formatNetworkAnalysis,
} from './telegram.messages';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DailyReportData {
  date: string;
  agentReports: AgentDailyReport[];
  totalConnectionsSent: number;
  totalMessagesSent: number;
  totalResponses: number;
  totalAcceptances: number;
  overallAcceptanceRate: number;
  overallResponseRate: number;
}

export interface AgentDailyReport {
  agentName: string;
  agentId: string;
  connectionsSent: number;
  messagesSent: number;
  responses: number;
  acceptances: number;
}

export interface MorningBriefingData {
  date: string;
  activeAgents: number;
  pendingConnections: number;
  pendingMessages: number;
  newAcceptancesSince: number;
  newResponsesSince: number;
  todayBudget: {
    connections: number;
    messages: number;
  };
  scheduledJobs: string[];
  healthStatus: 'ok' | 'warning' | 'error';
  healthNotes?: string;
}

export interface NetworkAnalysisData {
  date: string;
  totalConnections: number;
  newConnectionsThisWeek: number;
  activeConversations: number;
  conversionFunnel: {
    sent: number;
    accepted: number;
    messaged: number;
    responded: number;
  };
  topPerformingAgent?: string;
  weeklyAcceptanceRate: number;
  weeklyResponseRate: number;
  rejectionRate: number;
  healthWarnings: string[];
}

// ---------------------------------------------------------------------------
// TelegramBotClient
// ---------------------------------------------------------------------------

class TelegramBotClient {
  private bot: TelegramBot | null = null;
  private readonly chatId: string;
  private readonly token: string;
  private initialized = false;

  constructor() {
    this.token = process.env.TELEGRAM_BOT_TOKEN ?? '';
    this.chatId = process.env.TELEGRAM_CHAT_ID ?? '';
  }

  private getBot(): TelegramBot {
    if (!this.bot) {
      if (!this.token) {
        throw new Error('[TelegramBot] TELEGRAM_BOT_TOKEN is not set');
      }
      if (!this.chatId) {
        throw new Error('[TelegramBot] TELEGRAM_CHAT_ID is not set');
      }
      // polling: false — send-only, we never read incoming messages
      this.bot = new TelegramBot(this.token, { polling: false });
      this.initialized = true;
      logger.info('[TelegramBot] Initialized in send-only mode');
    }
    return this.bot;
  }

  /**
   * Internal helper: send a Markdown message to the configured chat ID.
   * Silently logs errors — Telegram failures must NOT crash the automation pipeline.
   */
  private async send(text: string, parseMode: 'Markdown' | 'HTML' = 'Markdown'): Promise<void> {
    try {
      const bot = this.getBot();
      await bot.sendMessage(this.chatId, text, {
        parse_mode: parseMode,
        disable_web_page_preview: true,
      } as TelegramBot.SendMessageOptions);
    } catch (err) {
      // Deliberately non-throwing — Telegram is non-critical infrastructure
      logger.warn(`[TelegramBot] Failed to send message: ${(err as Error).message}`);
    }
  }

  // -------------------------------------------------------------------------
  // Public methods
  // -------------------------------------------------------------------------

  /**
   * Send a generic alert message (immediate).
   * Used by: circuit breaker alerts, DC-13 Claude failure alerts, etc.
   */
  async sendAlert(message: string): Promise<void> {
    const text = `*ALERT* ⚠️\n\n${escapeMarkdown(message)}`;
    await this.send(text);
  }

  /**
   * Send a response alert when a prospect replies on LinkedIn.
   * Immediate — highest priority notification.
   * C8: automation stops on response; this informs the user to take over.
   */
  async sendResponse(
    agentName: string,
    prospectName: string,
    preview: string,
  ): Promise<void> {
    const text = formatResponseAlert(agentName, prospectName, preview);
    await this.send(text);
  }

  /**
   * Send the evening daily report summary.
   */
  async sendDailyReport(data: DailyReportData): Promise<void> {
    const text = formatEveningReport(data);
    await this.send(text);
  }

  /**
   * Send the morning briefing — scheduled job summary for the day.
   */
  async sendMorningBriefing(data: MorningBriefingData): Promise<void> {
    const text = formatMorningReport(data);
    await this.send(text);
  }

  /**
   * Send the weekly network analysis report (Sunday job).
   */
  async sendNetworkAnalysisReport(data: NetworkAnalysisData): Promise<void> {
    const text = formatNetworkAnalysis(data);
    await this.send(text);
  }

  /**
   * Send an error alert for a system or agent failure.
   */
  async sendError(agentId: string, error: Error | string): Promise<void> {
    const errorMessage = error instanceof Error ? error.message : error;
    const text = formatErrorAlert(agentId, errorMessage);
    await this.send(text);
  }

  /**
   * Send a plain test message to verify bot configuration.
   * Used by Settings → test connection.
   */
  async sendTestMessage(): Promise<void> {
    const now = new Date().toLocaleString('it-IT', { timeZone: 'Europe/Rome' });
    await this.send(
      `*LinkedIn B2B Bot* — Test connessione riuscita ✅\n\n_${escapeMarkdown(now)}_`,
    );
  }

  isConfigured(): boolean {
    return Boolean(this.token && this.chatId);
  }
}

// ---------------------------------------------------------------------------
// Markdown escaping helpers
// ---------------------------------------------------------------------------

/**
 * Escape special characters for Telegram Markdown v1 (legacy mode).
 * We use legacy Markdown (not MarkdownV2) for simplicity —
 * it requires escaping _ * ` [ only.
 */
export function escapeMarkdown(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/\*/g, '\\*')
    .replace(/_/g, '\\_')
    .replace(/`/g, '\\`')
    .replace(/\[/g, '\\[');
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

export const telegramBot = new TelegramBotClient();
