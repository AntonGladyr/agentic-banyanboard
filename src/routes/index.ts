/**
 * src/routes/index.ts — `/api/v1` router scaffold (Phase 3).
 *
 * Per memory-bank/creative/TASK-001-express-api-architecture.md (Component table:
 * routes/index.ts; Decision 1 — this is the composition root that future CRUD domains
 * graduate into) and TASK-001 AC-HAPPY-2.
 *
 * The versioned API router composes the domain routers. A small JSON stub handler on the root
 * keeps AC-HAPPY-2 ("always JSON, never Express default HTML") holding for `/api/v1` itself.
 *
 * Mounted at `/api/v1` by `createApp()` (see src/app.ts). Domain routers mount here — the boards
 * CRUD router (TASK-004) via `apiRouter.use('/boards', boardsRouter)`, and the board-scoped cards
 * CRUD router (TASK-005) via `apiRouter.use('/boards/:boardId/cards', cardsRouter)`.
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { boardsRouter } from './boards';
import { cardsRouter } from './cards';

const apiRouter = Router();

/** Versioned-API root stub: reachable + always JSON. */
apiRouter.get('/', (_req: Request, res: Response): void => {
  res.status(200).json({ api: 'v1', status: 'ok' });
});

// Boards CRUD domain (TASK-004) — five endpoints under /api/v1/boards.
apiRouter.use('/boards', boardsRouter);

// Cards CRUD domain (TASK-005) — five board-scoped endpoints under /api/v1/boards/:boardId/cards.
// The cards router uses { mergeParams: true } so it can read :boardId from this mount path.
apiRouter.use('/boards/:boardId/cards', cardsRouter);

export { apiRouter };
