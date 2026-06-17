/**
 * src/routes/health.ts — health-probe route (liveness + PostgreSQL readiness).
 *
 * Extends the Phase-3 liveness stub (TASK-001) with DB-readiness (TASK-003 / FEAT-003).
 * `GET /health` reports both that the service is live AND whether PostgreSQL is reachable,
 * via three response contracts (all `application/json`, all carrying an ISO-8601 `timestamp`):
 *
 *   - DATABASE_URL set + DB reachable      → 200 `{ status:"ok",    db:"ok",          timestamp }`
 *   - DATABASE_URL set + DB unreachable    → 503 `{ status:"error", db:"error",       timestamp }`
 *   - DATABASE_URL unset                   → 200 `{ status:"ok",    db:"unconfigured", timestamp }`
 *
 * Design notes:
 *   - Readiness is probed with `checkConnection()` (acquire + release a client) from
 *     src/db/pool.ts — no `SELECT 1`, no schema probe. Expected < 5 ms on a healthy local DB,
 *     well within the 150 ms p95 read NFR (productBrief).
 *   - The "unconfigured" branch is guarded by `config.databaseUrl === undefined` BEFORE any
 *     `checkConnection()`/`getPool()` call, so we never hit pool.ts's
 *     `throw new Error('DATABASE_URL is not set …')` — an unconfigured service is LIVE, with DB
 *     readiness simply not applicable.
 *   - SECURITY (Guiding Principle 5): the 503 body NEVER carries internal error detail
 *     (no `err.message`, no stack). The DB error is logged SERVER-SIDE only, via `req.log`
 *     (the request-scoped pino child injected by requestLogger — carries traceId/spanId).
 *   - OBSERVABILITY (Guiding Principle 3): zero `console.*`; all logging flows through `req.log`.
 *
 * `res.json` sets `application/json` and serializes the body. The timestamp is a single
 * `new Date().toISOString()` (round-trips through `Date.parse` + re-`toISOString()`).
 *
 * Mounted at `/health` by `createApp()` (see src/app.ts).
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { config } from '../config/env';
import { checkConnection } from '../db/pool';

const healthRouter = Router();

/**
 * Liveness + readiness probe.
 *
 * Async because the readiness branch awaits `checkConnection()`. Errors are caught locally and
 * mapped to a 503 — none escape the handler, so there is no unhandled-rejection risk.
 */
healthRouter.get('/', async (req: Request, res: Response): Promise<void> => {
  const timestamp = new Date().toISOString();

  // Unconfigured: no DATABASE_URL → the service is live, DB readiness is not applicable. Guard
  // BEFORE touching the pool so we never reach pool.ts's "DATABASE_URL is not set" throw.
  if (config.databaseUrl === undefined) {
    res.status(200).json({ status: 'ok', db: 'unconfigured', timestamp });
    return;
  }

  try {
    // Readiness: acquire + release a pooled client. Resolves when PostgreSQL is reachable.
    await checkConnection();
    res.status(200).json({ status: 'ok', db: 'ok', timestamp });
  } catch (err) {
    // Readiness failed. Log the error SERVER-SIDE only (never in the response body — no internal
    // detail leak). `req.log` already carries this request's traceId/spanId.
    req.log.warn({ err }, 'health: database readiness check failed');
    res.status(503).json({ status: 'error', db: 'error', timestamp });
  }
});

export { healthRouter };
