import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { db } from '../../db/prisma.client';

export const searchStructuresRoutes = Router();

// -----------------------------------------------
// Validation schemas
// -----------------------------------------------

const createSearchStructureSchema = z.object({
  name: z.string().min(1).max(100),
  queryConfig: z.record(z.unknown()).default({}),
  fullQueryString: z.string().min(1),
  linkedinMode: z.enum(['free', 'sales_navigator']).default('free'),
  enabled: z.boolean().default(true),
});

const updateSearchStructureSchema = createSearchStructureSchema.partial();

const bulkImportSchema = z.object({
  structures: z.array(
    z.object({
      name: z.string().min(1).max(100),
      queryConfig: z.record(z.unknown()).default({}),
      fullQueryString: z.string().min(1),
      linkedinMode: z.enum(['free', 'sales_navigator']).default('free'),
      enabled: z.boolean().default(true),
    }),
  ).min(1).max(50),
});

// -----------------------------------------------
// Helper: verify agent exists and is not archived
// -----------------------------------------------
async function getAgentOrFail(agentId: string, res: Response): Promise<boolean> {
  const agent = await db.agent.findUnique({ where: { id: agentId } });
  if (!agent || agent.status === 'archived') {
    res.status(404).json({ error: 'Agent not found' });
    return false;
  }
  return true;
}

// -----------------------------------------------
// GET /api/search-structures/:agentId
// -----------------------------------------------
searchStructuresRoutes.get('/:agentId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!(await getAgentOrFail(req.params.agentId, res))) return;

    const structures = await db.searchStructure.findMany({
      where: { agentId: req.params.agentId },
      orderBy: { createdAt: 'asc' },
    });

    res.json(structures);
  } catch (err) {
    next(err);
  }
});

// -----------------------------------------------
// POST /api/search-structures/:agentId/bulk — import bulk
// -----------------------------------------------
searchStructuresRoutes.post('/:agentId/bulk', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!(await getAgentOrFail(req.params.agentId, res))) return;

    const parsed = bulkImportSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
      return;
    }

    await db.searchStructure.createMany({
      data: parsed.data.structures.map((s) => ({
        agentId: req.params.agentId,
        name: s.name,
        queryConfig: s.queryConfig,
        fullQueryString: s.fullQueryString,
        linkedinMode: s.linkedinMode,
        enabled: s.enabled,
      })),
    });

    const created = await db.searchStructure.findMany({
      where: { agentId: req.params.agentId },
      orderBy: { createdAt: 'desc' },
      take: parsed.data.structures.length,
    });

    res.status(201).json({ created: created.length, structures: created });
  } catch (err) {
    next(err);
  }
});

// -----------------------------------------------
// POST /api/search-structures/:agentId — create
// -----------------------------------------------
searchStructuresRoutes.post('/:agentId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!(await getAgentOrFail(req.params.agentId, res))) return;

    const parsed = createSearchStructureSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
      return;
    }

    const structure = await db.searchStructure.create({
      data: {
        agentId: req.params.agentId,
        name: parsed.data.name,
        queryConfig: parsed.data.queryConfig,
        fullQueryString: parsed.data.fullQueryString,
        linkedinMode: parsed.data.linkedinMode,
        enabled: parsed.data.enabled,
      },
    });

    res.status(201).json(structure);
  } catch (err) {
    next(err);
  }
});

// -----------------------------------------------
// PUT /api/search-structures/:agentId/:id — update
// -----------------------------------------------
searchStructuresRoutes.put('/:agentId/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!(await getAgentOrFail(req.params.agentId, res))) return;

    const parsed = updateSearchStructureSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
      return;
    }

    const existing = await db.searchStructure.findFirst({
      where: { id: req.params.id, agentId: req.params.agentId },
    });
    if (!existing) {
      res.status(404).json({ error: 'Search structure not found' });
      return;
    }

    const structure = await db.searchStructure.update({
      where: { id: req.params.id },
      data: parsed.data,
    });

    res.json(structure);
  } catch (err) {
    next(err);
  }
});

// -----------------------------------------------
// DELETE /api/search-structures/:agentId/:id — hard delete
// -----------------------------------------------
searchStructuresRoutes.delete('/:agentId/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!(await getAgentOrFail(req.params.agentId, res))) return;

    const existing = await db.searchStructure.findFirst({
      where: { id: req.params.id, agentId: req.params.agentId },
    });
    if (!existing) {
      res.status(404).json({ error: 'Search structure not found' });
      return;
    }

    await db.searchStructure.delete({ where: { id: req.params.id } });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// -----------------------------------------------
// POST /api/search-structures/:agentId/:id/run — test execution
// -----------------------------------------------
searchStructuresRoutes.post('/:agentId/:id/run', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!(await getAgentOrFail(req.params.agentId, res))) return;

    const structure = await db.searchStructure.findFirst({
      where: { id: req.params.id, agentId: req.params.agentId },
    });
    if (!structure) {
      res.status(404).json({ error: 'Search structure not found' });
      return;
    }

    // Update lastExecutedAt for tracking
    await db.searchStructure.update({
      where: { id: req.params.id },
      data: {
        lastExecutedAt: new Date(),
        timesExecuted: { increment: 1 },
      },
    });

    // Note: actual search execution is delegated to search-engine.ts
    // This endpoint returns a placeholder response until the automation engine is wired up
    res.json({
      success: true,
      message: 'Search queued for execution',
      structureId: req.params.id,
      queryString: structure.fullQueryString,
      // found, new, duplicates, anonymous will be populated after real execution
    });
  } catch (err) {
    next(err);
  }
});
