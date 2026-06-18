/**
 * src/routes/boards.ts — boards CRUD router (TASK-004 Phase 3).
 *
 * Implements the five `/api/v1/boards` endpoints, composing the Phase-2 validation layer
 * (src/validation/board.ts) and data-access layer (src/db/boards.ts) into observable HTTP
 * behavior. Mounted at `/api/v1/boards` by the api router (src/routes/index.ts).
 *
 *   | Method | Path        | Operation       | Success |
 *   |--------|-------------|-----------------|---------|
 *   | POST   | /           | create a board  | 201     |
 *   | GET    | /           | list all boards | 200     |
 *   | GET    | /:id        | read one board  | 200     |
 *   | PATCH  | /:id        | update a board  | 200     |
 *   | DELETE | /:id        | delete a board  | 204     |
 *
 * Handler discipline (per spec § Input Validation Rules + § Structured Error Response Shape):
 *   - VALIDATE BEFORE DB: validators run first and `throw` an `HttpError` (status 400) on bad
 *     input, short-circuiting before any pool query (AC-ERROR-1/3/4).
 *   - MISSING ROW → 404: read/update/delete map an absent row to `notFoundError` (404) so the
 *     centralized errorHandler renders the standard `{ error: "Not Found", path, traceId }`
 *     shape (AC-ERROR-2) — no internal DB detail ever reaches the client.
 *   - ALL ERRORS → next(err): every handler body is wrapped in try/catch and forwards to
 *     `next(err)`, funnelling validation errors, 404s, and unexpected DB failures through the
 *     single errorHandler (DB faults become a 500 with no leak — AC-OBS-2).
 *
 * OBSERVABILITY (Guiding Principle 3): business events (board created/updated/deleted) are logged
 * via `req.log` (the request-scoped pino child carrying traceId/spanId). Zero `console.*`
 * (AC-OBS-1). The per-request access-log line is emitted by `requestLogger`.
 *
 * Body parsing: `express.json()` is mounted on THIS router (not globally) — only the boards
 * endpoints accept request bodies, so JSON parsing stays scoped here and the documented
 * app-composition order in src/app.ts is unchanged.
 */

import express, { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { validateCreate, validateUpdate, validateId } from '../validation/board';
import { notFoundError } from '../errors';
import { create, list, findById, update, remove } from '../db/boards';

const boardsRouter = Router();

// Parse JSON request bodies for the create/update endpoints. Scoped to the boards router so the
// rest of the app (e.g. /health) is unaffected. Malformed JSON yields a 400 via errorHandler.
boardsRouter.use(express.json());

/** POST /api/v1/boards — create a board (201). */
boardsRouter.post(
  '/',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = validateCreate(req.body);
      const board = await create(input);
      req.log.info({ boardId: board.id }, 'board created');
      res.status(201).json(board);
    } catch (err) {
      next(err);
    }
  },
);

/** GET /api/v1/boards — list all boards (200; empty list → []). */
boardsRouter.get(
  '/',
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const boards = await list();
      res.status(200).json(boards);
    } catch (err) {
      next(err);
    }
  },
);

/** GET /api/v1/boards/:id — read one board (200; absent → 404). */
boardsRouter.get(
  '/:id',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = validateId(req.params.id ?? '');
      const board = await findById(id);
      if (board === null) {
        throw notFoundError(`board ${id} not found`);
      }
      res.status(200).json(board);
    } catch (err) {
      next(err);
    }
  },
);

/** PATCH /api/v1/boards/:id — update a board (200; absent → 404; empty body → 400). */
boardsRouter.patch(
  '/:id',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = validateId(req.params.id ?? '');
      const input = validateUpdate(req.body);
      const board = await update(id, input);
      if (board === null) {
        throw notFoundError(`board ${id} not found`);
      }
      req.log.info({ boardId: id }, 'board updated');
      res.status(200).json(board);
    } catch (err) {
      next(err);
    }
  },
);

/** DELETE /api/v1/boards/:id — delete a board (204; absent → 404). */
boardsRouter.delete(
  '/:id',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = validateId(req.params.id ?? '');
      const deleted = await remove(id);
      if (!deleted) {
        throw notFoundError(`board ${id} not found`);
      }
      req.log.info({ boardId: id }, 'board deleted');
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },
);

export { boardsRouter };
