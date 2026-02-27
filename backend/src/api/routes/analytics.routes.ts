import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { db } from '../../db/prisma.client';

export const analyticsRoutes = Router();

// -----------------------------------------------
// GET /api/analytics/overview — aggregated KPIs all agents
// -----------------------------------------------
analyticsRoutes.get('/overview', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const [
      totalProspects,
      totalConnected,
      totalResponded,
      totalConnectionRequestsSent,
      activeAgentsCount,
      agents,
    ] = await Promise.all([
      db.prospect.count(),
      db.prospect.count({ where: { status: 'connection_accepted' } }),
      db.prospect.count({ where: { status: 'responded' } }),
      db.prospect.count({ where: { connectionRequestSentAt: { not: null } } }),
      db.agent.count({ where: { status: 'active' } }),
      db.agent.findMany({
        where: { status: { not: 'archived' } },
        include: { _count: { select: { prospects: true } } },
        orderBy: { priority: 'asc' },
      }),
    ]);

    const acceptanceRate =
      totalConnectionRequestsSent > 0
        ? Math.round((totalConnected / totalConnectionRequestsSent) * 100)
        : 0;

    const introsSent = await db.message.count({
      where: { sequenceNumber: 1, status: 'sent' },
    });
    const responseRate =
      introsSent > 0 ? Math.round((totalResponded / introsSent) * 100) : 0;

    const agentSummaries = agents.map((a) => ({
      id: a.id,
      name: a.name,
      status: a.status,
      priority: a.priority,
      prospectsCount: a._count.prospects,
      statsJson: a.statsJson,
    }));

    res.json({
      totalProspects,
      totalConnected,
      totalResponded,
      totalConnectionRequestsSent,
      acceptanceRate,
      responseRate,
      activeAgents: activeAgentsCount,
      agentSummaries,
    });
  } catch (err) {
    next(err);
  }
});

// -----------------------------------------------
// GET /api/analytics/agents/:id — single agent KPIs
// -----------------------------------------------
analyticsRoutes.get('/agents/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const agent = await db.agent.findUnique({ where: { id: req.params.id } });
    if (!agent || agent.status === 'archived') {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }

    const agentId = req.params.id;

    // Funnel counts
    const funnelGroups = await db.prospect.groupBy({
      by: ['status'],
      where: { agentId },
      _count: { _all: true },
    });
    const funnel = funnelGroups.reduce<Record<string, number>>((acc, g) => {
      acc[g.status] = g._count._all;
      return acc;
    }, {});

    // Overall rates
    const [sentTotal, acceptedTotal, introsSentTotal, respondedTotal] = await Promise.all([
      db.prospect.count({ where: { agentId, connectionRequestSentAt: { not: null } } }),
      db.prospect.count({ where: { agentId, connectionAcceptedAt: { not: null } } }),
      db.message.count({ where: { prospect: { agentId }, sequenceNumber: 1, status: 'sent' } }),
      db.prospect.count({ where: { agentId, status: 'responded' } }),
    ]);

    const acceptanceRate = sentTotal > 0 ? Math.round((acceptedTotal / sentTotal) * 100) : 0;
    const responseRate = introsSentTotal > 0 ? Math.round((respondedTotal / introsSentTotal) * 100) : 0;

    // 30-day daily trend
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const trends = await db.dailyLog.findMany({
      where: { agentId, date: { gte: thirtyDaysAgo } },
      orderBy: { date: 'asc' },
    });

    res.json({
      agent: { id: agent.id, name: agent.name, status: agent.status, statsJson: agent.statsJson },
      funnel,
      rates: { acceptanceRate, responseRate, sentTotal, acceptedTotal, introsSentTotal, respondedTotal },
      trends,
    });
  } catch (err) {
    next(err);
  }
});

// -----------------------------------------------
// GET /api/analytics/funnel/:agentId — funnel stages
// -----------------------------------------------
analyticsRoutes.get('/funnel/:agentId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const agent = await db.agent.findUnique({ where: { id: req.params.agentId } });
    if (!agent || agent.status === 'archived') {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }

    const groups = await db.prospect.groupBy({
      by: ['status'],
      where: { agentId: req.params.agentId },
      _count: { _all: true },
      orderBy: { _count: { status: 'desc' } },
    });

    const stages = groups.map((g) => ({
      name: g.status,
      count: g._count._all,
    }));

    res.json({ agentId: req.params.agentId, stages });
  } catch (err) {
    next(err);
  }
});

// -----------------------------------------------
// GET /api/analytics/daily — daily data from DailyLog
// -----------------------------------------------
analyticsRoutes.get('/daily', async (req: Request, res: Response, next: NextFunction) => {
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

    const logs = await db.dailyLog.findMany({
      where,
      include: { agent: { select: { id: true, name: true } } },
      orderBy: [{ date: 'asc' }, { agentId: 'asc' }],
    });

    res.json(logs);
  } catch (err) {
    next(err);
  }
});

// -----------------------------------------------
// GET /api/analytics/messages — message stats by sequence number
// -----------------------------------------------
analyticsRoutes.get('/messages', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const querySchema = z.object({
      agentId: z.string().uuid().optional(),
    });
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
      return;
    }

    const prospectFilter = parsed.data.agentId ? { agentId: parsed.data.agentId } : {};

    // Aggregate sent + responded counts per sequence number
    const sentBySeq = await db.message.groupBy({
      by: ['sequenceNumber'],
      where: {
        prospect: prospectFilter,
        direction: 'outbound',
        status: 'sent',
      },
      _count: { _all: true },
      orderBy: { sequenceNumber: 'asc' },
    });

    const respondedBySeq = await db.message.groupBy({
      by: ['sequenceNumber'],
      where: {
        prospect: prospectFilter,
        direction: 'outbound',
        responded: true,
      },
      _count: { _all: true },
      orderBy: { sequenceNumber: 'asc' },
    });

    const respondedMap = respondedBySeq.reduce<Record<number, number>>((acc, r) => {
      acc[r.sequenceNumber] = r._count._all;
      return acc;
    }, {});

    const bySequence = sentBySeq.reduce<
      Record<string, { sent: number; responded: number; rate: number }>
    >((acc, s) => {
      const seq = s.sequenceNumber;
      const sent = s._count._all;
      const responded = respondedMap[seq] || 0;
      acc[`seq${seq}`] = {
        sent,
        responded,
        rate: sent > 0 ? Math.round((responded / sent) * 100) : 0,
      };
      return acc;
    }, {});

    res.json({ bySequence });
  } catch (err) {
    next(err);
  }
});
