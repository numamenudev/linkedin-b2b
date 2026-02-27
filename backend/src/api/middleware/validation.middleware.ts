/**
 * backend/src/api/middleware/validation.middleware.ts
 *
 * Zod-based request validation middleware factory.
 *
 * Exports:
 *   validate(schema)        — validates req.body (generic alias for validateBody)
 *   validateBody(schema)    — validates req.body
 *   validateQuery(schema)   — validates req.query
 *   validateParams(schema)  — validates req.params
 *
 * On validation failure returns HTTP 400 with a structured error body:
 *   { error: 'Validation failed', issues: ZodIssue[] }
 */

import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RequestField = 'body' | 'query' | 'params';

// ---------------------------------------------------------------------------
// Internal factory
// ---------------------------------------------------------------------------

/**
 * Create an Express middleware that validates a specific part of the request
 * against the given Zod schema.
 *
 * Parsed (coerced) values are written back to the request field so that
 * downstream handlers receive the correctly-typed data.
 */
function createValidator(field: RequestField) {
  return function <T>(schema: ZodSchema<T>) {
    return (req: Request, res: Response, next: NextFunction): void => {
      const result = schema.safeParse(req[field]);

      if (!result.success) {
        const issues = (result.error as ZodError).issues.map((issue) => ({
          path: issue.path,
          message: issue.message,
          code: issue.code,
        }));

        res.status(400).json({
          error: 'Validation failed',
          issues,
        });
        return;
      }

      // Write coerced/transformed values back to the request object
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (req as any)[field] = result.data;
      next();
    };
  };
}

// ---------------------------------------------------------------------------
// Exported middleware factories
// ---------------------------------------------------------------------------

/** Validate req.body against the given Zod schema. */
export const validateBody = createValidator('body');

/** Validate req.query against the given Zod schema. */
export const validateQuery = createValidator('query');

/** Validate req.params against the given Zod schema. */
export const validateParams = createValidator('params');

/**
 * Generic alias for validateBody.
 * Use this when the context is clearly a body validation (e.g. POST/PUT routes).
 */
export const validate = validateBody;
