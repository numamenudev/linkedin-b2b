import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { z } from 'zod';
import { db } from '../../db/prisma.client';

export const identitiesRoutes = Router();

// -----------------------------------------------
// Multer configuration
// -----------------------------------------------

const UPLOAD_DIR = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
];

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}${path.extname(file.originalname)}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF, PPTX, and TXT files are allowed'));
    }
  },
});

// -----------------------------------------------
// Validation schemas
// -----------------------------------------------

const createIdentitySchema = z.object({
  name: z.string().min(1).max(100),
  personaName: z.string().min(1).max(100),
  role: z.string().min(1).max(100),
  company: z.string().min(1).max(100),
  location: z.string().max(100).optional(),
  fullContextPrompt: z.string().default(''),
  toneProfile: z.record(z.unknown()).default({}),
  companyContext: z.record(z.unknown()).default({}),
  credibilityMarkers: z.record(z.unknown()).default({}),
  doNotSay: z.record(z.unknown()).default({}),
  parentId: z.string().uuid().optional(),
});

const updateIdentitySchema = createIdentitySchema.partial();

// -----------------------------------------------
// GET /api/identities
// -----------------------------------------------
identitiesRoutes.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const identities = await db.identity.findMany({
      include: {
        _count: { select: { documents: true, agents: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(identities);
  } catch (err) {
    next(err);
  }
});

// -----------------------------------------------
// GET /api/identities/:id — detail with documents
// -----------------------------------------------
identitiesRoutes.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const identity = await db.identity.findUnique({
      where: { id: req.params.id },
      include: {
        documents: { orderBy: { createdAt: 'asc' } },
        agents: { select: { id: true, name: true, status: true } },
      },
    });

    if (!identity) {
      res.status(404).json({ error: 'Identity not found' });
      return;
    }

    res.json(identity);
  } catch (err) {
    next(err);
  }
});

// -----------------------------------------------
// POST /api/identities — create (conversational mode)
// -----------------------------------------------
identitiesRoutes.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = createIdentitySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
      return;
    }

    if (parsed.data.parentId) {
      const parent = await db.identity.findUnique({ where: { id: parsed.data.parentId } });
      if (!parent) {
        res.status(400).json({ error: 'Parent identity not found' });
        return;
      }
    }

    const identity = await db.identity.create({ data: parsed.data });
    res.status(201).json(identity);
  } catch (err) {
    next(err);
  }
});

// -----------------------------------------------
// POST /api/identities/from-documents — create from file upload
// -----------------------------------------------
identitiesRoutes.post(
  '/from-documents',
  upload.array('files', 10),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const bodySchema = z.object({
        name: z.string().min(1),
        agentContext: z.string().optional(),
        personaName: z.string().min(1),
        role: z.string().min(1),
        company: z.string().min(1),
      });

      const parsed = bodySchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
        return;
      }

      const identity = await db.identity.create({
        data: {
          name: parsed.data.name,
          personaName: parsed.data.personaName,
          role: parsed.data.role,
          company: parsed.data.company,
          fullContextPrompt: '',
          toneProfile: {},
          companyContext: {},
          credibilityMarkers: {},
          doNotSay: {},
          approvedByUser: false,
        },
      });

      const files = req.files as Express.Multer.File[];
      if (files && files.length > 0) {
        await db.identityDocument.createMany({
          data: files.map((f) => ({
            identityId: identity.id,
            filename: f.filename,
            originalName: f.originalname,
            fileType: f.mimetype,
            filePath: f.path,
            extractionStatus: 'pending',
          })),
        });
      }

      const result = await db.identity.findUnique({
        where: { id: identity.id },
        include: { documents: true },
      });

      // Note: document processing (text extraction + Claude Opus generation)
      // is handled asynchronously by the identity-builder pipeline.

      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  },
);

// -----------------------------------------------
// PUT /api/identities/:id — update (creates new version)
// -----------------------------------------------
identitiesRoutes.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = updateIdentitySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
      return;
    }

    const existing = await db.identity.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      res.status(404).json({ error: 'Identity not found' });
      return;
    }

    const identity = await db.identity.update({
      where: { id: req.params.id },
      data: {
        ...parsed.data,
        version: existing.version + 1,
        approvedByUser: false, // reset approval on update
        approvedAt: null,
      },
    });

    res.json(identity);
  } catch (err) {
    next(err);
  }
});

// -----------------------------------------------
// POST /api/identities/:id/approve
// -----------------------------------------------
identitiesRoutes.post('/:id/approve', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await db.identity.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      res.status(404).json({ error: 'Identity not found' });
      return;
    }

    const identity = await db.identity.update({
      where: { id: req.params.id },
      data: { approvedByUser: true, approvedAt: new Date() },
    });

    res.json(identity);
  } catch (err) {
    next(err);
  }
});

// -----------------------------------------------
// POST /api/identities/:id/regenerate
// -----------------------------------------------
identitiesRoutes.post('/:id/regenerate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const identity = await db.identity.findUnique({
      where: { id: req.params.id },
      include: { documents: true },
    });
    if (!identity) {
      res.status(404).json({ error: 'Identity not found' });
      return;
    }

    // Reset approval and mark for regeneration
    const updated = await db.identity.update({
      where: { id: req.params.id },
      data: { approvedByUser: false, approvedAt: null },
    });

    // Note: actual Claude Opus regeneration is handled by identity-builder pipeline
    res.json({ success: true, identity: updated, message: 'Regeneration queued' });
  } catch (err) {
    next(err);
  }
});

// -----------------------------------------------
// GET /api/identities/:id/documents
// -----------------------------------------------
identitiesRoutes.get('/:id/documents', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const identity = await db.identity.findUnique({ where: { id: req.params.id } });
    if (!identity) {
      res.status(404).json({ error: 'Identity not found' });
      return;
    }

    const documents = await db.identityDocument.findMany({
      where: { identityId: req.params.id },
      orderBy: { createdAt: 'asc' },
    });

    res.json(documents);
  } catch (err) {
    next(err);
  }
});

// -----------------------------------------------
// POST /api/identities/:id/documents — upload single file
// -----------------------------------------------
identitiesRoutes.post(
  '/:id/documents',
  upload.single('file'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const identity = await db.identity.findUnique({ where: { id: req.params.id } });
      if (!identity) {
        res.status(404).json({ error: 'Identity not found' });
        return;
      }

      if (!req.file) {
        res.status(400).json({ error: 'No file uploaded' });
        return;
      }

      const document = await db.identityDocument.create({
        data: {
          identityId: req.params.id,
          filename: req.file.filename,
          originalName: req.file.originalname,
          fileType: req.file.mimetype,
          filePath: req.file.path,
          extractionStatus: 'pending',
        },
      });

      res.status(201).json(document);
    } catch (err) {
      next(err);
    }
  },
);

// -----------------------------------------------
// DELETE /api/identities/:id/documents/:docId
// -----------------------------------------------
identitiesRoutes.delete('/:id/documents/:docId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const document = await db.identityDocument.findFirst({
      where: { id: req.params.docId, identityId: req.params.id },
    });

    if (!document) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }

    // Delete file from disk
    if (document.filePath && fs.existsSync(document.filePath)) {
      fs.unlinkSync(document.filePath);
    }

    await db.identityDocument.delete({ where: { id: req.params.docId } });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});
