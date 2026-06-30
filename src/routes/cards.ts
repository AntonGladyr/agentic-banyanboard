/**
 * src/routes/cards.ts — cards CRUD router (TASK-005 Phase 3).
 *
 * Implements the five board-scoped `/api/v1/boards/:boardId/cards` endpoints, composing the
 * Phase-2 validation layer (src/validation/card.ts) and data-access layer (src/db/cards.ts) into
 * observable HTTP behavior. Mounted at `/api/v1/boards/:boardId/cards` by the api router
 * (src/routes/index.ts).
 *
 *   | Method | Path        | Operation         | Success |
 *   |--------|-------------|-------------------|---------|
 *   | POST   | /           | create a card     | 201     |
 *   | GET    | /           | list board cards  | 200     |
 *   | GET    | /:id        | read one card     | 200     |
 *   | PATCH  | /:id        | update a card     | 200     |
 *   | DELETE | /:id        | delete a card     | 204     |
 *
 * Cards are a CHILD resource of boards, so the router is created with `{ mergeParams: true }` —
 * without it `req.params.boardId` (captured by the parent mount path) would not be visible inside
 * these handlers. Every endpoint validates `:boardId` as a positive integer (reusing the
 * domain-agnostic `validateId`).
 *
 * Handler discipline (per spec § Input Validation Rules + § Structured Error Response Shape):
 *   - VALIDATE BEFORE DB: validators run first and `throw` an `HttpError` (status 400) on bad
 *     input, short-circuiting before any pool query (AC-ERROR-1/3/4/5).
 *   - PRE-FLIGHT BOARD CHECK (POST only): before inserting, verify the parent board exists via
 *     `findBoardById(boardId)`; an absent board → `notFoundError` (404) so no orphan card is
 *     created and the client gets the standard 404 for the board-scoped resource path. This
 *     upholds the validate-before-DB principle and avoids interpreting pg FK error codes (23503)
 *     in the route layer; the DB-level ON DELETE CASCADE still guarantees referential integrity.
 *   - MISSING ROW → 404: read/update/delete map an absent card to `notFoundError` (404) so the
 *     centralized errorHandler renders the standard `{ error: "Not Found", path, traceId }` shape
 *     (AC-ERROR-2) — no internal DB detail ever reaches the client.
 *   - ALL ERRORS → next(err): every handler body is wrapped in try/catch and forwards to
 *     `next(err)`, funnelling validation errors, 404s, and unexpected DB failures through the
 *     single errorHandler (DB faults become a 500 with no leak — AC-OBS-2).
 *
 * OBSERVABILITY (Guiding Principle 3): business events (card created/updated/deleted) are logged
 * via `req.log` (the request-scoped pino child carrying traceId/spanId). Zero `console.*`
 * (AC-OBS-1). The per-request access-log line is emitted by `requestLogger`.
 *
 * Body parsing: `express.json()` is mounted on THIS router (not globally) — only the cards
 * endpoints accept request bodies, so JSON parsing stays scoped here and the documented
 * app-composition order in src/app.ts is unchanged.
 */

import express, { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { validateCreate, validateUpdate, validateId } from '../validation/card';
import { notFoundError } from '../errors';
import { create, listByBoard, findById, update, remove } from '../db/cards';
import { findById as findBoardById } from '../db/boards';
import { insert as insertActivity } from '../db/activity';
import { notifyCardChange, notifyCardMoved } from '../realtime/notify';

// mergeParams: true exposes the parent-mount `:boardId` param to these handlers.
const cardsRouter = Router({ mergeParams: true });

// Parse JSON request bodies for the create/update endpoints. Scoped to the cards router so the
// rest of the app (e.g. /health) is unaffected. Malformed JSON yields a 400 via errorHandler.
cardsRouter.use(express.json());

/** POST /api/v1/boards/:boardId/cards — create a card (201; absent board → 404). */
cardsRouter.post(
  '/',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const boardId = validateId(req.params.boardId ?? '');
      const input = validateCreate(req.body);
      // Pre-flight: the parent board must exist before we insert a card under it.
      const board = await findBoardById(boardId);
      if (board === null) {
        throw notFoundError(`board ${boardId} not found`);
      }
      const card = await create({ board_id: boardId, ...input });
      req.log.info({ cardId: card.id, boardId }, 'card created');
      res.status(201).json(card);
      // Fire-and-forget real-time broadcast AFTER the response (off the critical path; never fails it).
      notifyCardChange('card:created', boardId, card, req);
    } catch (err) {
      next(err);
    }
  },
);

/** GET /api/v1/boards/:boardId/cards — list a board's cards (200; empty list → []). */
cardsRouter.get(
  '/',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const boardId = validateId(req.params.boardId ?? '');
      const cards = await listByBoard(boardId);
      res.status(200).json(cards);
    } catch (err) {
      next(err);
    }
  },
);

/** GET /api/v1/boards/:boardId/cards/:id — read one card (200; absent → 404). */
cardsRouter.get(
  '/:id',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      validateId(req.params.boardId ?? '');
      const id = validateId(req.params.id ?? '');
      const card = await findById(id);
      if (card === null) {
        throw notFoundError(`card ${id} not found`);
      }
      res.status(200).json(card);
    } catch (err) {
      next(err);
    }
  },
);

/** PATCH /api/v1/boards/:boardId/cards/:id — update a card (200; absent → 404; empty body → 400). */
cardsRouter.patch(
  '/:id',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const boardId = validateId(req.params.boardId ?? '');
      const id = validateId(req.params.id ?? '');
      const input = validateUpdate(req.body);
      // Pre-flight read to capture the pre-update status for the activity feed (TASK-008). Mirrors the
      // DELETE handler's pre-flight read below; `findById` already exists, so no new DAL query. The
      // existing update()→null→404 path is unaffected (both reads agree on an absent card).
      const before = await findById(id);
      const card = await update(id, input);
      if (card === null) {
        throw notFoundError(`card ${id} not found`);
      }
      req.log.info({ cardId: id }, 'card updated');
      res.status(200).json(card);
      // Broadcast covers edit AND drag-and-drop status change (Architecture Decision 2).
      notifyCardChange('card:updated', boardId, card, req);
      // Record + broadcast the move ONLY on a real status change (TASK-008 — AC-ACTIVITY-ONLY-MOVES-1),
      // AFTER the response so a recording failure can never corrupt the already-sent 200 (fire-and-
      // forget posture). `before !== null` guards the race where the row vanished between read and update.
      if (input.status !== undefined && before !== null && before.status !== card.status) {
        const activity = await insertActivity({
          board_id: boardId,
          card_id: id,
          card_title: card.title, // snapshot at move time — survives later rename/delete
          from_status: before.status,
          to_status: card.status,
        });
        req.log.info(
          { cardId: id, boardId, fromStatus: before.status, toStatus: card.status },
          'card moved',
        ); // AC-OBS-1
        notifyCardMoved(boardId, activity, req);
      }
    } catch (err) {
      next(err);
    }
  },
);

/** DELETE /api/v1/boards/:boardId/cards/:id — delete a card (204; absent → 404). */
cardsRouter.delete(
  '/:id',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const boardId = validateId(req.params.boardId ?? '');
      const id = validateId(req.params.id ?? '');
      // Read the card before deleting so the real-time event can carry the full entity (Decision 2).
      // Observable behavior is unchanged: an absent card still maps to 404 (no row to delete).
      const card = await findById(id);
      if (card === null) {
        throw notFoundError(`card ${id} not found`);
      }
      await remove(id);
      req.log.info({ cardId: id }, 'card deleted');
      res.status(204).send();
      // UI delete is out of scope, but broadcasting keeps other tabs correct (forward-compat).
      notifyCardChange('card:deleted', boardId, card, req);
    } catch (err) {
      next(err);
    }
  },
);

export { cardsRouter };
