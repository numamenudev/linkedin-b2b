import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { db } from '../../db/prisma.client';

export const prospectsRoutes = Router();

// -----------------------------------------------
// Validation schemas
// -----------------------------------------------

const listQuerySchema = z.object({
  agentId: z.string().uuid().optional(),
  status: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  minScore: z.coerce.number().int().min(0).max(100).optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

const updateProspectSchema = z.object({
  status: z.string().optional(),
  notes: z.string().optional(),
});

// -----------------------------------------------
// Helper: build where clause from filters
// -----------------------------------------------
function buildWhereClause(filters: z.infer<typeof listQuerySchema>) {
  const where: Record<string, unknown> = {};

  if (filters.agentId) where.agentId = filters.agentId;
  if (filters.status) where.status = filters.status;
  if (filters.minScore !== undefined) where.score = { gte: filters.minScore };

  if (filters.dateFrom || filters.dateTo) {
    where.discoveredAt = {
      ...(filters.dateFrom ? { gte: new Date(filters.dateFrom) } : {}),
      ...(filters.dateTo ? { lte: new Date(filters.dateTo) } : {}),
    };
  }

  if (filters.search) {
    where.OR = [
      { fullName: { contains: filters.search, mode: 'insensitive' } },
      { firstName: { contains: filters.search, mode: 'insensitive' } },
      { lastName: { contains: filters.search, mode: 'insensitive' } },
    ];
  }

  return where;
}

// -----------------------------------------------
// GET /api/prospects/export — CSV export (must be before /:id routes)
// -----------------------------------------------
prospectsRoutes.get('/export', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
      return;
    }

    const where = buildWhereClause(parsed.data);

    const prospects = await db.prospect.findMany({
      where,
      include: {
        agent: { select: { name: true } },
        _count: { select: { messages: true } },
      },
      orderBy: { discoveredAt: 'desc' },
    });

    const headers = [
      'id', 'fullName', 'linkedinUrl', 'status', 'score', 'agentName',
      'location', 'headline', 'companyName', 'discoveredAt',
      'connectionRequestSentAt', 'connectionAcceptedAt', 'notes',
    ];

    const csvRows = [
      headers.join(','),
      ...prospects.map((p) => [
        p.id,
        `"${(p.fullName || '').replace(/"/g, '""')}"`,
        `"${(p.linkedinUrl || '').replace(/"/g, '""')}"`,
        p.status,
        p.score,
        `"${(p.agent?.name || '').replace(/"/g, '""')}"`,
        `"${(p.location || '').replace(/"/g, '""')}"`,
        `"${(p.headline || '').replace(/"/g, '""')}"`,
        `"${(p.companyName || '').replace(/"/g, '""')}"`,
        p.discoveredAt?.toISOString() || '',
        p.connectionRequestSentAt?.toISOString() || '',
        p.connectionAcceptedAt?.toISOString() || '',
        `"${(p.notes || '').replace(/"/g, '""')}"`,
      ].join(',')),
    ];

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="prospects-${Date.now()}.csv"`);
    res.send(csvRows.join('\n'));
  } catch (err) {
    next(err);
  }
});

// -----------------------------------------------
// GET /api/prospects — paginated list with filters
// -----------------------------------------------
prospectsRoutes.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
      return;
    }

    const { page, limit } = parsed.data;
    const skip = (page - 1) * limit;
    const where = buildWhereClause(parsed.data);

    const [total, prospects] = await Promise.all([
      db.prospect.count({ where }),
      db.prospect.findMany({
        where,
        include: {
          agent: { select: { id: true, name: true } },
          _count: { select: { messages: true } },
        },
        orderBy: { discoveredAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    res.json({
      data: prospects,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    next(err);
  }
});

// -----------------------------------------------
// GET /api/prospects/:id — detail with messages
// -----------------------------------------------
prospectsRoutes.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const prospect = await db.prospect.findUnique({
      where: { id: req.params.id },
      include: {
        agent: { select: { id: true, name: true, identityId: true } },
        messages: { orderBy: { createdAt: 'asc' } },
      },
    });

    if (!prospect) {
      res.status(404).json({ error: 'Prospect not found' });
      return;
    }

    res.json(prospect);
  } catch (err) {
    next(err);
  }
});

// -----------------------------------------------
// PUT /api/prospects/:id — manual update (notes/status)
// -----------------------------------------------
prospectsRoutes.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = updateProspectSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
      return;
    }

    const existing = await db.prospect.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      res.status(404).json({ error: 'Prospect not found' });
      return;
    }

    const prospect = await db.prospect.update({
      where: { id: req.params.id },
      data: {
        ...(parsed.data.status !== undefined ? { status: parsed.data.status } : {}),
        ...(parsed.data.notes !== undefined ? { notes: parsed.data.notes } : {}),
        lastActivityAt: new Date(),
      },
    });

    res.json(prospect);
  } catch (err) {
    next(err);
  }
});

// -----------------------------------------------
// DELETE /api/prospects/:id — hard delete (GDPR)
// -----------------------------------------------
prospectsRoutes.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await db.prospect.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      res.status(404).json({ error: 'Prospect not found' });
      return;
    }

    // onDelete: Cascade on Message model handles child records
    await db.prospect.delete({ where: { id: req.params.id } });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// -----------------------------------------------
// GET /api/prospects/:id/messages
// -----------------------------------------------
prospectsRoutes.get('/:id/messages', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const prospect = await db.prospect.findUnique({ where: { id: req.params.id } });
    if (!prospect) {
      res.status(404).json({ error: 'Prospect not found' });
      return;
    }

    const messages = await db.message.findMany({
      where: { prospectId: req.params.id },
      orderBy: { createdAt: 'asc' },
    });

    res.json(messages);
  } catch (err) {
    next(err);
  }
});

// -----------------------------------------------
// POST /api/prospects/:id/opt-out
// -----------------------------------------------
prospectsRoutes.post('/:id/opt-out', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await db.prospect.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      res.status(404).json({ error: 'Prospect not found' });
      return;
    }

    const prospect = await db.prospect.update({
      where: { id: req.params.id },
      data: { status: 'opted_out', lastActivityAt: new Date() },
    });

    res.json(prospect);
  } catch (err) {
    next(err);
  }
});
