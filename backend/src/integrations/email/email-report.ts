/**
 * backend/src/integrations/email/email-report.ts
 *
 * Daily email report generation and delivery via Resend.
 *
 * C14: API key read from env var RESEND_API_KEY (never from DB).
 * C15: Settings table provides reportEmail (recipient) — non-secret config.
 *
 * Functions:
 *   generateDailyReport(date)  — aggregate all metrics for the given date
 *   sendDailyReport(date)      — generate HTML report and send via Resend
 *
 * Sections in the report (per design doc 8.4):
 *   1. Responses received today (with message preview)
 *   2. Per-agent activity table (all DailyLog metrics)
 *   3. Cumulative counters — weekly (from Redis) + monthly (from DB)
 *   4. Network analysis summary (latest statsJson from agents)
 *   5. LinkedIn account health
 *   6. Dashboard link
 */

import { Resend } from 'resend';
import db from '../../db/prisma.client';
import { logger } from '../../utils/logger';
import {
  buildEmailHtml,
  type EmailReportData,
  type AgentActivityRow,
  type ResponsePreview,
  type CumulativeCounters,
  type NetworkSummary,
  type LinkedInHealthStatus,
} from './email-templates';
import { todayISO, currentWeekISO } from '../../utils/helpers';

// ---------------------------------------------------------------------------
// Re-export types from email-templates so callers only need one import path
// ---------------------------------------------------------------------------

export type {
  EmailReportData,
  AgentActivityRow,
  ResponsePreview,
  CumulativeCounters,
  NetworkSummary,
  LinkedInHealthStatus,
} from './email-templates';

// ---------------------------------------------------------------------------
// Lazy Resend client
// ---------------------------------------------------------------------------

let _resend: Resend | null = null;

function getResendClient(): Resend {
  if (!_resend) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error('[email-report] RESEND_API_KEY environment variable is not set');
    }
    _resend = new Resend(apiKey);
  }
  return _resend;
}

// ---------------------------------------------------------------------------
// Internal: load Settings (singleton row) — provides reportEmail
// ---------------------------------------------------------------------------

async function getSettings() {
  const settings = await db.settings.findUnique({ where: { id: 'singleton' } });
  if (!settings) {
    throw new Error('[email-report] Settings singleton not found in database');
  }
  return settings;
}

// ---------------------------------------------------------------------------
// generateDailyReport
// ---------------------------------------------------------------------------

/**
 * Aggregate all metrics needed for the daily email report.
 *
 * @param date  ISO date string (YYYY-MM-DD) for the report date.
 *              Defaults to today if not provided.
 */
export async function generateDailyReport(date?: string): Promise<EmailReportData> {
  const reportDate = date ?? todayISO();
  const startOfDay = new Date(`${reportDate}T00:00:00.000Z`);
  const endOfDay = new Date(`${reportDate}T23:59:59.999Z`);

  // ----------------------------------------------------------------
  // 1. Per-agent DailyLog rows for the given date
  // ----------------------------------------------------------------
  const dailyLogs = await db.dailyLog.findMany({
    where: {
      date: {
        gte: startOfDay,
        lte: endOfDay,
      },
    },
    include: {
      agent: {
        select: { id: true, name: true, status: true, statsJson: true },
      },
    },
  });

  const agentActivity: AgentActivityRow[] = dailyLogs.map((log) => {
    const acceptanceRate =
      log.connectionRequestsSent > 0
        ? Math.round((log.connectionsAccepted / log.connectionRequestsSent) * 100)
        : 0;
    const responseRate =
      log.messagesSent > 0
        ? Math.round((log.responsesReceived / log.messagesSent) * 100)
        : 0;

    return {
      agentId: log.agentId,
      agentName: log.agent.name,
      searchStructuresRun: log.searchStructuresRun,
      newProspectsFound: log.newProspectsFound,
      connectionRequestsSent: log.connectionRequestsSent,
      connectionsAccepted: log.connectionsAccepted,
      connectionsRejected: log.connectionsRejected,
      profilesAnalyzed: log.profilesAnalyzed,
      messagesSent: log.messagesSent,
      responsesReceived: log.responsesReceived,
      acceptanceRate,
      responseRate,
    };
  });

  // ----------------------------------------------------------------
  // 2. Responses received today (inbound messages with preview)
  // ----------------------------------------------------------------
  const inboundMessages = await db.message.findMany({
    where: {
      direction: 'inbound',
      responseReceivedAt: {
        gte: startOfDay,
        lte: endOfDay,
      },
    },
    include: {
      prospect: {
        include: {
          agent: { select: { name: true } },
        },
      },
    },
    orderBy: { responseReceivedAt: 'desc' },
  });

  const responsePreviews: ResponsePreview[] = inboundMessages.map((msg) => ({
    prospectName: msg.prospect.fullName,
    agentName: msg.prospect.agent.name,
    prospectLinkedinUrl: msg.prospect.linkedinUrl,
    messagePreview: (msg.responseContent ?? '').slice(0, 200),
    respondedAt: msg.responseReceivedAt ?? msg.createdAt,
  }));

  // ----------------------------------------------------------------
  // 3. Weekly cumulative counters from Redis
  // ----------------------------------------------------------------
  const weeklyCounters = await getWeeklyCountersFromRedis(reportDate);

  // ----------------------------------------------------------------
  // 4. Monthly cumulative counters from DB
  // ----------------------------------------------------------------
  const monthlyCounters = await getMonthlyCountersFromDb(reportDate);

  const cumulative: CumulativeCounters = {
    weekly: weeklyCounters,
    monthly: monthlyCounters,
  };

  // ----------------------------------------------------------------
  // 5. Network analysis summary (from agent statsJson)
  // ----------------------------------------------------------------
  const allAgents = await db.agent.findMany({
    where: { status: 'active' },
    select: { id: true, name: true, statsJson: true, updatedAt: true },
    orderBy: { updatedAt: 'desc' },
  });

  const networkSummary = buildNetworkSummary(allAgents, dailyLogs);

  // ----------------------------------------------------------------
  // 6. LinkedIn account health
  // ----------------------------------------------------------------
  const linkedInHealth = await buildLinkedInHealth(reportDate);

  return {
    date: reportDate,
    agentActivity,
    responsePreviews,
    cumulative,
    networkSummary,
    linkedInHealth,
    dashboardUrl: process.env.DASHBOARD_URL ?? 'http://localhost:5173',
    generatedAt: new Date(),
  };
}

// ---------------------------------------------------------------------------
// sendDailyReport
// ---------------------------------------------------------------------------

/**
 * Generate the HTML email and deliver it via Resend to the address configured
 * in Settings.reportEmail.
 *
 * Failures are logged but never thrown — email delivery is non-critical
 * infrastructure (same pattern as Telegram bot).
 *
 * @param date  ISO date string (YYYY-MM-DD). Defaults to today.
 */
export async function sendDailyReport(date?: string): Promise<void> {
  const reportDate = date ?? todayISO();

  try {
    const settings = await getSettings();
    const recipientEmail = settings.reportEmail;

    if (!recipientEmail) {
      logger.warn('[email-report] reportEmail not configured in Settings — skipping send');
      return;
    }

    logger.info('[email-report] Generating daily report', { date: reportDate });
    const data = await generateDailyReport(reportDate);

    const html = buildEmailHtml(data);

    const resend = getResendClient();
    const fromAddress =
      process.env.RESEND_FROM_ADDRESS ?? 'LinkedIn Report <onboarding@resend.dev>';

    const { error } = await resend.emails.send({
      from: fromAddress,
      to: [recipientEmail],
      subject: `LinkedIn Report — ${reportDate}`,
      html,
    });

    if (error) {
      logger.error('[email-report] Resend API error', {
        error: error.message,
        date: reportDate,
      });
      return;
    }

    logger.info('[email-report] Daily report sent successfully', {
      to: recipientEmail,
      date: reportDate,
    });
  } catch (err) {
    // Non-throwing — email is non-critical
    logger.error('[email-report] Failed to send daily report', {
      date: reportDate,
      error: (err as Error).message,
    });
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Read weekly LinkedIn counters from Redis.
 * Keys are set by rate-limiter.ts using the patterns:
 *   linkedin:weekly:connections:<YYYY-WNN>
 *   linkedin:daily:messages:<YYYY-MM-DD>   (aggregated over 7 days)
 *
 * We read the weekly connection key directly and sum the last 7 days
 * for messages / responses (stored in daily keys).
 */
async function getWeeklyCountersFromRedis(reportDate: string): Promise<CumulativeCounters['weekly']> {
  const defaultResult = { connectionsSent: 0, messagesDelivered: 0, responsesReceived: 0 };

  try {
    // Lazy import to avoid circular deps
    const { getRedisConnection } = require('../../queue/queue') as {
      getRedisConnection: () => import('ioredis').default;
    };
    const redis = getRedisConnection();

    // Weekly connection counter (from rate-limiter key)
    const weekKey = currentWeekISO();
    const weeklyConnRaw = await redis.get(`linkedin:weekly:connections:${weekKey}`);
    const connectionsSent = weeklyConnRaw ? parseInt(weeklyConnRaw, 10) : 0;

    // Messages: sum daily keys for the last 7 days
    const msgsKeys: string[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(reportDate);
      d.setUTCDate(d.getUTCDate() - i);
      msgsKeys.push(`linkedin:daily:messages:${d.toISOString().slice(0, 10)}`);
    }
    const msgValues = await redis.mget(...msgsKeys);
    const messagesDelivered = msgValues.reduce(
      (sum, v) => sum + (v ? parseInt(v, 10) : 0),
      0,
    );

    // Responses received: aggregate from DB for last 7 days (not in Redis)
    const weekStart = new Date(reportDate);
    weekStart.setUTCDate(weekStart.getUTCDate() - 6);
    weekStart.setUTCHours(0, 0, 0, 0);

    const weekEnd = new Date(`${reportDate}T23:59:59.999Z`);

    const weeklyLogs = await db.dailyLog.aggregate({
      _sum: { responsesReceived: true },
      where: {
        date: { gte: weekStart, lte: weekEnd },
      },
    });
    const responsesReceived = weeklyLogs._sum.responsesReceived ?? 0;

    return { connectionsSent, messagesDelivered, responsesReceived };
  } catch (err) {
    logger.warn('[email-report] Could not read weekly counters from Redis', {
      error: (err as Error).message,
    });
    return defaultResult;
  }
}

/**
 * Aggregate monthly DailyLog totals from PostgreSQL.
 */
async function getMonthlyCountersFromDb(reportDate: string): Promise<CumulativeCounters['monthly']> {
  const defaultResult = {
    connectionsSent: 0,
    messagesDelivered: 0,
    responsesReceived: 0,
    newProspectsFound: 0,
  };

  try {
    const monthStart = new Date(`${reportDate.slice(0, 7)}-01T00:00:00.000Z`);
    const monthEnd = new Date(`${reportDate}T23:59:59.999Z`);

    const agg = await db.dailyLog.aggregate({
      _sum: {
        connectionRequestsSent: true,
        messagesSent: true,
        responsesReceived: true,
        newProspectsFound: true,
      },
      where: {
        date: { gte: monthStart, lte: monthEnd },
      },
    });

    return {
      connectionsSent: agg._sum.connectionRequestsSent ?? 0,
      messagesDelivered: agg._sum.messagesSent ?? 0,
      responsesReceived: agg._sum.responsesReceived ?? 0,
      newProspectsFound: agg._sum.newProspectsFound ?? 0,
    };
  } catch (err) {
    logger.warn('[email-report] Could not aggregate monthly counters from DB', {
      error: (err as Error).message,
    });
    return defaultResult;
  }
}

/**
 * Derive a network summary from agent statsJson fields.
 * statsJson is a free-form JSON updated by the evening job with 7d/30d rates.
 */
function buildNetworkSummary(
  agents: Array<{ id: string; name: string; statsJson: unknown; updatedAt: Date }>,
  dailyLogs: Array<{ agentId: string; connectionsAccepted: number; connectionRequestsSent: number; messagesSent: number; responsesReceived: number }>,
): NetworkSummary {
  const lastAnalysisAt =
    agents.length > 0
      ? agents.reduce((latest, a) =>
          a.updatedAt > latest ? a.updatedAt : latest,
          agents[0].updatedAt,
        )
      : null;

  // Best agent today by acceptance rate
  let topAgent: string | null = null;
  let topRate = 0;

  for (const log of dailyLogs) {
    if (log.connectionRequestsSent > 0) {
      const rate = log.connectionsAccepted / log.connectionRequestsSent;
      if (rate > topRate) {
        topRate = rate;
        const agent = agents.find((a) => a.id === log.agentId);
        topAgent = agent?.name ?? null;
      }
    }
  }

  const totalSent = dailyLogs.reduce((s, l) => s + l.connectionRequestsSent, 0);
  const totalAccepted = dailyLogs.reduce((s, l) => s + l.connectionsAccepted, 0);
  const totalMsgs = dailyLogs.reduce((s, l) => s + l.messagesSent, 0);
  const totalResponses = dailyLogs.reduce((s, l) => s + l.responsesReceived, 0);

  return {
    totalActiveAgents: agents.length,
    topAgent,
    topAgentAcceptanceRate: topAgent !== null ? Math.round(topRate * 100) : null,
    overallWeeklyAcceptanceRate: totalSent > 0 ? Math.round((totalAccepted / totalSent) * 100) : 0,
    overallWeeklyResponseRate: totalMsgs > 0 ? Math.round((totalResponses / totalMsgs) * 100) : 0,
    lastNetworkAnalysisAt: lastAnalysisAt,
  };
}

/**
 * Derive LinkedIn account health from rate-limiter counters.
 */
async function buildLinkedInHealth(reportDate: string): Promise<LinkedInHealthStatus> {
  const settings = await db.settings.findUnique({ where: { id: 'singleton' } });
  const weeklyLimit = settings?.globalWeeklyConnectionLimit ?? 150;
  const dailyLimit = settings?.globalDailyConnectionLimit ?? 21;

  let weeklyUsed = 0;
  let dailyUsed = 0;

  try {
    const { getRedisConnection } = require('../../queue/queue') as {
      getRedisConnection: () => import('ioredis').default;
    };
    const redis = getRedisConnection();

    const weekKey = currentWeekISO();
    const weeklyRaw = await redis.get(`linkedin:weekly:connections:${weekKey}`);
    weeklyUsed = weeklyRaw ? parseInt(weeklyRaw, 10) : 0;

    const dailyRaw = await redis.get(`linkedin:daily:connections:${reportDate}`);
    dailyUsed = dailyRaw ? parseInt(dailyRaw, 10) : 0;
  } catch {
    // Redis unreachable — report unknown state
  }

  const notes: string[] = [];
  let status: LinkedInHealthStatus['status'] = 'healthy';

  const weeklyPct = (weeklyUsed / weeklyLimit) * 100;
  const dailyPct = (dailyUsed / dailyLimit) * 100;

  if (weeklyPct >= 90 || dailyPct >= 90) {
    status = 'critical';
    notes.push('Approaching LinkedIn connection limits — automation may slow down');
  } else if (weeklyPct >= 70 || dailyPct >= 70) {
    status = 'warning';
    notes.push('Connection limits at 70%+ — monitor closely');
  }

  if (weeklyUsed === 0 && dailyUsed === 0) {
    notes.push('No activity recorded today — verify automation is running');
  }

  return {
    status,
    weeklyConnectionsUsed: weeklyUsed,
    weeklyConnectionsLimit: weeklyLimit,
    dailyConnectionsUsed: dailyUsed,
    dailyConnectionsLimit: dailyLimit,
    notes,
  };
}
