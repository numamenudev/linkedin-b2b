import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { db } from '../../db/prisma.client';

export const agentsRoutes = Router();

// -----------------------------------------------
// Validation schemas
// -----------------------------------------------

const createAgentSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  identityId: z.string().uuid(),
  targetConfig: z.record(z.unknown()).default({}),
  messagingConfig: z.record(z.unknown()).default({}),
  weeklyConnectionRequests: z.number().int().min(1).max(150).default(60),
  dailyConnectionRequests: z.number().int().min(1).max(21).default(9),
  dailyMessages: z.number().int().min(1).max(25).default(8),
  priority: z.number().int().min(1).max(10).default(2),
  linkedinMode: z.enum(['free', 'sales_navigator']).default('free'),
});

const updateAgentSchema = createAgentSchema.partial().omit({ identityId: true }).extend({
  identityId: z.string().uuid().optional(),
});

// -----------------------------------------------
// GET /api/agents — list all agents with stats
// -----------------------------------------------
agentsRoutes.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const agents = await db.agent.findMany({
      where: { status: { not: 'archived' } },
      include: {
        identity: {
          select: { id: true, name: true, personaName: true },
        },
        _count: {
          select: { prospects: true },
        },
      },
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
    });

    res.json(agents);
  } catch (err) {
    next(err);
  }
});

// -----------------------------------------------
// GET /api/agents/:id — agent detail with identity + stats
// -----------------------------------------------
agentsRoutes.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const agent = await db.agent.findUnique({
      where: { id: req.params.id },
      include: {
        identity: true,
        _count: {
          select: { prospects: true, searchStructures: true },
        },
      },
    });

    if (!agent) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }

    res.json(agent);
  } catch (err) {
    next(err);
  }
});

// -----------------------------------------------
// POST /api/agents — create agent
// -----------------------------------------------
agentsRoutes.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = createAgentSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
      return;
    }

    const { name, description, identityId, targetConfig, messagingConfig,
            weeklyConnectionRequests, dailyConnectionRequests, dailyMessages,
            priority, linkedinMode } = parsed.data;

    const identity = await db.identity.findUnique({ where: { id: identityId } });
    if (!identity) {
      res.status(400).json({ error: 'Identity not found' });
      return;
    }

    const agent = await db.agent.create({
      data: {
        name,
        description,
        identityId,
        targetConfig,
        messagingConfig,
        weeklyConnectionRequests,
        dailyConnectionRequests,
        dailyMessages,
        priority,
        linkedinMode,
        status: 'paused',
      },
      include: { identity: { select: { id: true, name: true, personaName: true } } },
    });

    res.status(201).json(agent);
  } catch (err) {
    next(err);
  }
});

// -----------------------------------------------
// PUT /api/agents/:id — update agent
// -----------------------------------------------
agentsRoutes.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = updateAgentSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
      return;
    }

    const existing = await db.agent.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.status === 'archived') {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }

    if (parsed.data.identityId) {
      const identity = await db.identity.findUnique({ where: { id: parsed.data.identityId } });
      if (!identity) {
        res.status(400).json({ error: 'Identity not found' });
        return;
      }
    }

    const agent = await db.agent.update({
      where: { id: req.params.id },
      data: parsed.data,
      include: { identity: { select: { id: true, name: true, personaName: true } } },
    });

    res.json(agent);
  } catch (err) {
    next(err);
  }
});

// -----------------------------------------------
// DELETE /api/agents/:id — soft delete (archived)
// -----------------------------------------------
agentsRoutes.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await db.agent.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.status === 'archived') {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }

    await db.agent.update({
      where: { id: req.params.id },
      data: { status: 'archived' },
    });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// -----------------------------------------------
// POST /api/agents/:id/activate
// -----------------------------------------------
agentsRoutes.post('/:id/activate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await db.agent.findUnique({
      where: { id: req.params.id },
      include: { identity: { select: { approvedByUser: true } } },
    });
    if (!existing || existing.status === 'archived') {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }
    if (!existing.identity.approvedByUser) {
      res.status(400).json({ error: 'Identity must be approved before activating agent' });
      return;
    }

    const agent = await db.agent.update({
      where: { id: req.params.id },
      data: { status: 'active' },
    });

    res.json(agent);
  } catch (err) {
    next(err);
  }
});

// -----------------------------------------------
// POST /api/agents/:id/pause
// -----------------------------------------------
agentsRoutes.post('/:id/pause', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await db.agent.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.status === 'archived') {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }

    const agent = await db.agent.update({
      where: { id: req.params.id },
      data: { status: 'paused' },
    });

    res.json(agent);
  } catch (err) {
    next(err);
  }
});

// -----------------------------------------------
// GET /api/agents/:id/stats — detailed stats
// -----------------------------------------------
agentsRoutes.get('/:id/stats', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const agent = await db.agent.findUnique({ where: { id: req.params.id } });
    if (!agent || agent.status === 'archived') {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }

    // Funnel counts
    const funnelGroups = await db.prospect.groupBy({
      by: ['status'],
      where: { agentId: req.params.id },
      _count: { _all: true },
    });
    const funnel = funnelGroups.reduce<Record<string, number>>((acc, g) => {
      acc[g.status] = g._count._all;
      return acc;
    }, {});

    // 7-day acceptance rate
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [sent7d, accepted7d] = await Promise.all([
      db.prospect.count({
        where: { agentId: req.params.id, connectionRequestSentAt: { gte: sevenDaysAgo } },
      }),
      db.prospect.count({
        where: { agentId: req.params.id, connectionAcceptedAt: { gte: sevenDaysAgo } },
      }),
    ]);
    const acceptanceRate7d = sent7d > 0 ? Math.round((accepted7d / sent7d) * 100) : 0;

    // 7-day response rate
    const [introsSent7d, responsesReceived7d] = await Promise.all([
      db.message.count({
        where: { prospect: { agentId: req.params.id }, sequenceNumber: 1, sentAt: { gte: sevenDaysAgo } },
      }),
      db.message.count({
        where: { prospect: { agentId: req.params.id }, responded: true, responseReceivedAt: { gte: sevenDaysAgo } },
      }),
    ]);
    const responseRate7d = introsSent7d > 0 ? Math.round((responsesReceived7d / introsSent7d) * 100) : 0;

    // Weekly trend (last 7 days of DailyLog)
    const weeklyTrend = await db.dailyLog.findMany({
      where: { agentId: req.params.id, date: { gte: sevenDaysAgo } },
      orderBy: { date: 'asc' },
    });

    res.json({
      acceptanceRate7d,
      responseRate7d,
      funnel,
      weeklyTrend,
      statsJson: agent.statsJson,
    });
  } catch (err) {
    next(err);
  }
});

// -----------------------------------------------
// POST /api/agents/:id/run-now — dev-only trigger
// DC-12: Gated behind NODE_ENV !== 'production'
// -----------------------------------------------
agentsRoutes.post('/:id/run-now', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (process.env.NODE_ENV === 'production') {
      res.status(403).json({ error: 'run-now is not available in production' });
      return;
    }

    const jobSchema = z.object({
      job: z.enum(['morning', 'midday', 'afternoon', 'evening']),
    });
    const parsed = jobSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
      return;
    }

    const agent = await db.agent.findUnique({ where: { id: req.params.id } });
    if (!agent || agent.status === 'archived') {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }

    // Placeholder: actual job execution will be wired up in the automation engine
    res.json({ success: true, message: `Job '${parsed.data.job}' queued for agent ${req.params.id}` });
  } catch (err) {
    next(err);
  }
});
