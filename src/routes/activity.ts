/**
 * src/routes/activity.ts — activity-feed read router (TASK-008 Phase 2).
 *
 * Implements the single board-scoped read endpoint that backs the activity feed:
 *
 *   | Method | Path | Operation                       | Success |
 *   |--------|------|---------------------------------|---------|
 *   | GET    | /    | list a board's card-move events | 200     |
 *
 * Mounted at `/api/v1/boards/:boardId/activity` by the api router (src/routes/index.ts). Activity is
 * a CHILD resource of boards, so the router is created with `{ mergeParams: true }` — without it
 * `req.params.boardId` (captured by the parent mount path) would not be visible here. Mirrors the
 * read-handler discipline of the cards/boards routers exactly:
 *
 *   - VALIDATE BEFORE DB: `validateId(:boardId)` runs first and throws `badRequest` (400) on a
 *     non-integer id, short-circuiting before any pool query (AC-ERROR-2 → 400 for `/boards/abc/...`).
 *   - PRE-FLIGHT BOARD CHECK: verify the parent board exists via `findBoardById(boardId)`; an absent
 *     board → `notFoundError` (404) so the client gets the standard 404 for the board-scoped path
 *     (AC-ERROR-1 → 404 for a non-existent board), rather than a misleading empty `[]`.
 *   - ALL ERRORS → next(err): the handler body is wrapped in try/catch and forwards to `next(err)`,
 *     funnelling validation errors, 404s, and unexpected DB failures through the single errorHandler
 *     (no internal DB detail ever reaches the client — GP5).
 *
 * Read shape: `listByBoard` returns the board's events ordered `occurred_at DESC, id DESC` (newest
 * first), capped at the DAL's read LIMIT (retention decision 4A). The `Date` `occurred_at` serializes
 * to an ISO-8601 string via `res.json` (AC-HAPPY-3.3). No body parsing (GET only, no `express.json()`).
 *
 * OBSERVABILITY (Guiding Principle 3): the per-request access-log line is emitted by `requestLogger`;
 * this read path needs no extra business log. Zero `console.*`.
 */

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { validateId } from '../validation/card';
import { notFoundError } from '../errors';
import { findById as findBoardById } from '../db/boards';
import { listByBoard } from '../db/activity';

// mergeParams: true exposes the parent-mount `:boardId` param to this handler.
const activityRouter = Router({ mergeParams: true });

/** GET /api/v1/boards/:boardId/activity — list a board's card-move events, newest-first (200). */
activityRouter.get(
  '/',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const boardId = validateId(req.params.boardId ?? '');
      // Pre-flight: the parent board must exist, so a non-existent board is a 404 (not an empty list).
      const board = await findBoardById(boardId);
      if (board === null) {
        throw notFoundError(`board ${boardId} not found`);
      }
      const events = await listByBoard(boardId);
      res.status(200).json(events);
    } catch (err) {
      next(err);
    }
  },
);

export { activityRouter };
