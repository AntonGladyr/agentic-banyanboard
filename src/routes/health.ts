/**
 * src/routes/health.ts — health-probe route (Phase 3).
 *
 * Per memory-bank/creative/TASK-001-express-api-architecture.md (Component table:
 * routes/health.ts) and TASK-001 AC-HAPPY-1:
 *
 *   GET /health → 200 `{ status: 'ok', timestamp: <ISO8601> }`, Content-Type
 *   application/json.
 *
 * `res.json` is used so Express sets `application/json` and serializes the body. The
 * timestamp is a fresh `new Date().toISOString()` (round-trips through `Date.parse` and
 * re-`toISOString()`), satisfying the test's ISO-8601 assertions.
 *
 * Mounted at `/health` by `createApp()` (see src/app.ts).
 */

import { Router } from 'express';
import type { Request, Response } from 'express';

const healthRouter = Router();

/** Liveness probe: always 200 with a JSON status + current ISO-8601 timestamp. */
healthRouter.get('/', (_req: Request, res: Response): void => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

export { healthRouter };
