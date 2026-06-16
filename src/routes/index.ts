/**
 * src/routes/index.ts — `/api/v1` router scaffold (Phase 3).
 *
 * Per memory-bank/creative/TASK-001-express-api-architecture.md (Component table:
 * routes/index.ts; Decision 1 — this is the composition root that future CRUD domains
 * graduate into) and TASK-001 AC-HAPPY-2.
 *
 * The versioned API router carries NO business handlers yet — it is registered so the
 * `/api/v1` namespace exists. A small JSON stub handler on the root keeps AC-HAPPY-2
 * ("always JSON, never Express default HTML") holding in THIS phase, before the Phase 4
 * notFound/errorHandler middleware exist.
 *
 * Mounted at `/api/v1` by `createApp()` (see src/app.ts). Future domains add their routers
 * here, e.g. `apiRouter.use('/boards', boardsRouter)`.
 */

import { Router } from 'express';
import type { Request, Response } from 'express';

const apiRouter = Router();

/** Versioned-API root stub: reachable + always JSON until real handlers land. */
apiRouter.get('/', (_req: Request, res: Response): void => {
  res.status(200).json({ api: 'v1', status: 'ok' });
});

export { apiRouter };
