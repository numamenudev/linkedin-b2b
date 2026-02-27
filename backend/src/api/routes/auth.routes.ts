/**
 * backend/src/api/routes/auth.routes.ts
 *
 * DC-01: Auth endpoints.
 *
 * POST /login      — verify credentials, issue JWT in HttpOnly cookie
 * POST /refresh    — rotate token: blacklist old, issue new
 * POST /logout     — blacklist token, clear cookie
 * POST /ws-ticket  — issue a 30-second single-use WebSocket nonce
 * GET  /me         — return current user from JWT
 *
 * Cookie settings (DC-01):
 *   name:     auth_token
 *   HttpOnly: true
 *   Secure:   true in production
 *   SameSite: Strict
 *   Path:     /api
 *   Max-Age:  28800 (8 hours)
 *
 * Note: the cookie name exposed to callers is 'token' (per auth.middleware.ts).
 * We keep 'auth_token' as the cookie name sent to the browser per the design spec.
 */

import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';

import db from '../../db/prisma.client';
import { authMiddleware, blacklistToken, getAuthRedis } from '../middleware/auth.middleware';
import { validateBody } from '../middleware/validation.middleware';
import { logger } from '../../utils/logger';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const COOKIE_NAME = 'token';         // must match auth.middleware.ts cookie read
const JWT_EXPIRY_SECONDS = 8 * 3600; // 8 hours
const WS_TICKET_TTL = 30;            // seconds

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const loginSchema = z.object({
  email: z.string().email({ message: 'Invalid email address' }),
  password: z.string().min(1, { message: 'Password is required' }),
});

// ---------------------------------------------------------------------------
// Cookie helper
// ---------------------------------------------------------------------------

/**
 * Set the JWT auth cookie on the response.
 * DC-01: HttpOnly, Secure (prod), SameSite=Strict, Path=/api, Max-Age=8h.
 */
function setAuthCookie(res: Response, token: string): void {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/api',
    maxAge: JWT_EXPIRY_SECONDS * 1000, // ms
  });
}

/**
 * Clear the auth cookie.
 */
function clearAuthCookie(res: Response): void {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/api',
  });
}

// ---------------------------------------------------------------------------
// JWT helpers
// ---------------------------------------------------------------------------

function signToken(payload: { userId: string; email: string }): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is not configured');

  return jwt.sign(payload, secret, {
    expiresIn: JWT_EXPIRY_SECONDS,
  });
}

/**
 * Decode a token WITHOUT verifying signature (used to read exp after the token
 * has already been verified by authMiddleware).
 */
function getRemainingTtl(token: string): number {
  try {
    const decoded = jwt.decode(token) as jwt.JwtPayload | null;
    if (!decoded?.exp) return 0;
    const remaining = decoded.exp - Math.floor(Date.now() / 1000);
    return Math.max(0, remaining);
  } catch {
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const authRoutes = Router();

// ---------------------------------------------------------------------------
// POST /login
// ---------------------------------------------------------------------------

authRoutes.post(
  '/login',
  validateBody(loginSchema),
  async (req: Request, res: Response): Promise<void> => {
    const { email, password } = req.body as z.infer<typeof loginSchema>;

    try {
      const user = await db.user.findUnique({ where: { email } });

      if (!user) {
        res.status(401).json({ error: 'Invalid credentials' });
        return;
      }

      const passwordValid = await bcrypt.compare(password, user.passwordHash);
      if (!passwordValid) {
        res.status(401).json({ error: 'Invalid credentials' });
        return;
      }

      const token = signToken({ userId: user.id, email: user.email });
      setAuthCookie(res, token);

      logger.info('auth: user logged in', { userId: user.id, email: user.email });

      res.json({
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
        },
      });
    } catch (err) {
      logger.error('auth: login error', { error: (err as Error).message });
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// ---------------------------------------------------------------------------
// POST /refresh
// ---------------------------------------------------------------------------

authRoutes.post(
  '/refresh',
  authMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    const oldToken: string = req.cookies?.[COOKIE_NAME];

    try {
      // DC-01: blacklist old token IMMEDIATELY before issuing new one
      const ttl = getRemainingTtl(oldToken);
      await blacklistToken(oldToken, ttl);

      const newToken = signToken({
        userId: req.user!.userId,
        email: req.user!.email,
      });

      setAuthCookie(res, newToken);

      logger.info('auth: token refreshed', { userId: req.user!.userId });

      res.json({ success: true });
    } catch (err) {
      logger.error('auth: refresh error', { error: (err as Error).message });
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// ---------------------------------------------------------------------------
// POST /logout
// ---------------------------------------------------------------------------

authRoutes.post(
  '/logout',
  authMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    const token: string = req.cookies?.[COOKIE_NAME];

    try {
      const ttl = getRemainingTtl(token);
      await blacklistToken(token, ttl);

      clearAuthCookie(res);

      logger.info('auth: user logged out', { userId: req.user!.userId });

      res.json({ success: true });
    } catch (err) {
      logger.error('auth: logout error', { error: (err as Error).message });
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// ---------------------------------------------------------------------------
// POST /ws-ticket
// DC-01: Issues a 30-second single-use nonce for WebSocket authentication.
// Key: ws:ticket:<nonce>  Value: userId  TTL: 30s
// ---------------------------------------------------------------------------

authRoutes.post(
  '/ws-ticket',
  authMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const ticket = uuidv4();
      const redis = getAuthRedis();

      await redis.set(`ws:ticket:${ticket}`, req.user!.userId, 'EX', WS_TICKET_TTL);

      logger.debug('auth: ws-ticket issued', {
        userId: req.user!.userId,
        ticket: ticket.slice(0, 8) + '...',
      });

      res.json({ ticket });
    } catch (err) {
      logger.error('auth: ws-ticket error', { error: (err as Error).message });
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// ---------------------------------------------------------------------------
// GET /me
// ---------------------------------------------------------------------------

authRoutes.get(
  '/me',
  authMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const user = await db.user.findUnique({
        where: { id: req.user!.userId },
        select: { id: true, email: true, name: true, createdAt: true },
      });

      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      res.json({ user });
    } catch (err) {
      logger.error('auth: /me error', { error: (err as Error).message });
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);
