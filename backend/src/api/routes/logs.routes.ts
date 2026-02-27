import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { db } from '../../db/prisma.client';

export const logsRoutes = Router();

// -----------------------------------------------
// GET /api/logs — operational logs with filters + pagination
// -----------------------------------------------
logsRoutes.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const querySchema = z.object({
      agentId: z.string().uuid().optional(),
      level: z.enum(['info', 'warn', 'error', 'debug']).optional(),
      job: z.string().optional(),
      dateFrom: z.string().optional(),
      limit: z.coerce.number().int().min(1).max(500).default(100),
      offset: z.coerce.number().int().min(0).default(0),
    });

    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
      return;
    }

    const where: Record<string, unknown> = {};
    if (parsed.data.agentId) where.agentId = parsed.data.agentId;
    if (parsed.data.level) where.level = parsed.data.level;
    if (parsed.data.job) where.job = parsed.data.job;
    if (parsed.data.dateFrom) {
      where.createdAt = { gte: new Date(parsed.data.dateFrom) };
    }

    const [total, logs] = await Promise.all([
      db.operationLog.count({ where }),
      db.operationLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: parsed.data.limit,
        skip: parsed.data.offset,
      }),
    ]);

    res.json({
      data: logs,
      pagination: {
        limit: parsed.data.limit,
        offset: parsed.data.offset,
        total,
      },
    });
  } catch (err) {
    next(err);
  }
});

// -----------------------------------------------
// GET /api/logs/daily-reports — daily reports last 30 days
// -----------------------------------------------
logsRoutes.get('/daily-reports', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const querySchema = z.object({
      agentId: z.string().uuid().optional(),
      days: z.coerce.number().int().min(1).max(365).default(30),
    });

    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
      return;
    }

    const since = new Date(Date.now() - parsed.data.days * 24 * 60 * 60 * 1000);

    const where: Record<string, unknown> = { date: { gte: since } };
    if (parsed.data.agentId) where.agentId = parsed.data.agentId;

    const reports = await db.dailyLog.findMany({
      where,
      include: {
        agent: { select: { id: true, name: true, status: true } },
      },
      orderBy: [{ date: 'desc' }, { agentId: 'asc' }],
    });

    res.json(reports);
  } catch (err) {
    next(err);
  }
});
