import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { db } from '../../db/prisma.client';

export const settingsRoutes = Router();

// -----------------------------------------------
// Helper: mask API key (show last 4 chars only)
// -----------------------------------------------
function maskApiKey(key: string | undefined): string {
  if (!key) return '';
  if (key.length <= 4) return '****';
  return `${'*'.repeat(key.length - 4)}${key.slice(-4)}`;
}

// -----------------------------------------------
// Validation schema
// -----------------------------------------------

const updateSettingsSchema = z.object({
  reportEmail: z.string().email().optional(),
  reportEmailTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  linkedinMode: z.enum(['free', 'sales_navigator']).optional(),
  timezone: z.string().optional(),
  morningJobTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  middayJobTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  afternoonJobTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  eveningJobTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  globalWeeklyConnectionLimit: z.number().int().min(1).max(150).optional(),
  globalDailyConnectionLimit: z.number().int().min(1).max(25).optional(),
  globalDailyMessageLimit: z.number().int().min(1).max(50).optional(),
});

// -----------------------------------------------
// GET /api/settings — read settings (API keys masked)
// -----------------------------------------------
settingsRoutes.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const settings = await db.settings.upsert({
      where: { id: 'singleton' },
      update: {},
      create: { id: 'singleton' },
    });

    // Mask environment-based API keys for display
    const maskedConfig = {
      ...settings,
      unipileApiKey: maskApiKey(process.env.UNIPILE_API_KEY),
      claudeApiKey: maskApiKey(process.env.CLAUDE_API_KEY),
      telegramBotToken: maskApiKey(process.env.TELEGRAM_BOT_TOKEN),
      resendApiKey: maskApiKey(process.env.RESEND_API_KEY),
    };

    res.json(maskedConfig);
  } catch (err) {
    next(err);
  }
});

// -----------------------------------------------
// PUT /api/settings — update settings
// -----------------------------------------------
settingsRoutes.put('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = updateSettingsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
      return;
    }

    const settings = await db.settings.upsert({
      where: { id: 'singleton' },
      update: parsed.data,
      create: { id: 'singleton', ...parsed.data },
    });

    res.json(settings);
  } catch (err) {
    next(err);
  }
});

// -----------------------------------------------
// POST /api/settings/test-unipile — test Unipile connection
// -----------------------------------------------
settingsRoutes.post('/test-unipile', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const apiKey = process.env.UNIPILE_API_KEY;
    const accountId = process.env.UNIPILE_ACCOUNT_ID;

    if (!apiKey || !accountId) {
      res.status(400).json({ success: false, error: 'UNIPILE_API_KEY or UNIPILE_ACCOUNT_ID not configured' });
      return;
    }

    // Perform a lightweight test call to Unipile (account info endpoint)
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    try {
      const response = await fetch(`https://api2.unipile.com:13465/api/v1/accounts/${accountId}`, {
        headers: {
          'X-API-KEY': apiKey,
          'accept': 'application/json',
        },
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (response.ok) {
        const accountInfo = await response.json();
        res.json({ success: true, accountInfo });
      } else {
        const body = await response.text();
        res.json({ success: false, error: `Unipile API returned ${response.status}: ${body}` });
      }
    } catch (fetchErr: unknown) {
      clearTimeout(timeout);
      const message = fetchErr instanceof Error ? fetchErr.message : 'Unknown error';
      res.json({ success: false, error: message });
    }
  } catch (err) {
    next(err);
  }
});

// -----------------------------------------------
// POST /api/settings/test-claude — test Claude API
// -----------------------------------------------
settingsRoutes.post('/test-claude', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const apiKey = process.env.CLAUDE_API_KEY;

    if (!apiKey) {
      res.status(400).json({ success: false, error: 'CLAUDE_API_KEY not configured' });
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 10,
          messages: [{ role: 'user', content: 'Reply with "ok"' }],
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (response.ok) {
        const data = await response.json();
        res.json({ success: true, model: data.model || 'claude-3-5-sonnet-20241022' });
      } else {
        const body = await response.text();
        res.json({ success: false, error: `Claude API returned ${response.status}: ${body}` });
      }
    } catch (fetchErr: unknown) {
      clearTimeout(timeout);
      const message = fetchErr instanceof Error ? fetchErr.message : 'Unknown error';
      res.json({ success: false, error: message });
    }
  } catch (err) {
    next(err);
  }
});

// -----------------------------------------------
// POST /api/settings/test-telegram — send test message
// -----------------------------------------------
settingsRoutes.post('/test-telegram', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!token || !chatId) {
      res.status(400).json({ success: false, error: 'TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not configured' });
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    try {
      const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: '✅ LinkedIn B2B Platform — Telegram connection test successful.',
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (response.ok) {
        res.json({ success: true });
      } else {
        const body = await response.text();
        res.json({ success: false, error: `Telegram API returned ${response.status}: ${body}` });
      }
    } catch (fetchErr: unknown) {
      clearTimeout(timeout);
      const message = fetchErr instanceof Error ? fetchErr.message : 'Unknown error';
      res.json({ success: false, error: message });
    }
  } catch (err) {
    next(err);
  }
});

// -----------------------------------------------
// GET /api/settings/linkedin-health — LinkedIn account health
// -----------------------------------------------
settingsRoutes.get('/linkedin-health', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const now = new Date();
    // Start of current week (Monday)
    const startOfWeek = new Date(now);
    const dayOfWeek = now.getDay(); // 0=Sun
    const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    startOfWeek.setDate(now.getDate() - daysToMonday);
    startOfWeek.setHours(0, 0, 0, 0);

    // Start of today
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);

    const [weeklyConnectionsSent, todayConnectionsSent, recentAccepted, recentRejected] = await Promise.all([
      db.prospect.count({ where: { connectionRequestSentAt: { gte: startOfWeek } } }),
      db.prospect.count({ where: { connectionRequestSentAt: { gte: startOfDay } } }),
      db.prospect.count({ where: { connectionAcceptedAt: { gte: startOfWeek } } }),
      db.prospect.count({ where: { connectionRejectedAt: { gte: startOfWeek } } }),
    ]);

    const settings = await db.settings.findUnique({ where: { id: 'singleton' } });
    const weeklyLimit = settings?.globalWeeklyConnectionLimit ?? 150;
    const dailyLimit = settings?.globalDailyConnectionLimit ?? 21;

    const totalResponded = recentAccepted + recentRejected;
    const acceptanceRate = totalResponded > 0 ? Math.round((recentAccepted / totalResponded) * 100) : 0;
    const rejectionRate = totalResponded > 0 ? Math.round((recentRejected / totalResponded) * 100) : 0;

    res.json({
      weeklyUsage: {
        sent: weeklyConnectionsSent,
        limit: weeklyLimit,
        remaining: Math.max(0, weeklyLimit - weeklyConnectionsSent),
        percentUsed: Math.round((weeklyConnectionsSent / weeklyLimit) * 100),
      },
      dailyUsage: {
        sent: todayConnectionsSent,
        limit: dailyLimit,
        remaining: Math.max(0, dailyLimit - todayConnectionsSent),
      },
      acceptanceRate,
      rejectionRate,
    });
  } catch (err) {
    next(err);
  }
});
