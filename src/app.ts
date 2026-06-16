/**
 * src/app.ts — pure Express application factory (Phase 3).
 *
 * Per memory-bank/creative/TASK-001-express-api-architecture.md
 * ("App composition order (in createApp())" + the src/app.ts component responsibilities)
 * and TASK-001 AC-ENTRY-1 / AC-HAPPY-1 / AC-HAPPY-2:
 *
 *   `createApp(): Express` is a PURE factory. It registers middleware and routers in a
 *   fixed order and returns the configured app. It does NOT call `listen`, does NOT touch
 *   `process`, and reads no env beyond importing the validated `config` (transitively, via
 *   the logger). This keeps the app supertest-injectable with no port bound and no side
 *   effects — see Decision 5.
 *
 * ── Composition order (registered first → last; ORDER MATTERS) ─────────────────────────
 *   1. requestLogger        — FIRST, so trace context + `req.log` + the access-log line
 *                             exist for every route that follows.
 *   2. /health router       — liveness probe (AC-HAPPY-1).
 *   3. /api/v1 router        — versioned API scaffold (AC-HAPPY-2).
 *   4. [Phase 4] notFound + errorHandler — appended LAST (see marker below).
 */

import express from 'express';
import type { Express } from 'express';
import { requestLogger } from './middleware/requestLogger';
import { healthRouter } from './routes/health';
import { apiRouter } from './routes/index';
import { notFound } from './middleware/notFound';
import { errorHandler } from './middleware/errorHandler';

/**
 * Build and return a fully-composed Express app.
 *
 * Pure: no `listen`, no `process` access, no other side effects — safe to instantiate
 * repeatedly (e.g. once per test file) and to hand directly to `supertest(app)`.
 */
export function createApp(): Express {
  const app = express();

  // 1. Request logging FIRST — establishes trace context (req.traceId), the request-scoped
  //    child logger (req.log), and emits the access-log line on res.finish for everything
  //    registered after it.
  app.use(requestLogger);

  // 2. Health probe.
  app.use('/health', healthRouter);

  // 3. Versioned API scaffold.
  app.use('/api/v1', apiRouter);

  // 4. Terminal 404 catch-all — any request no router above matched falls through to here and
  //    receives a structured JSON 404 (never Express's default HTML page).
  app.use(notFound);

  // 5. Centralized error handler — 4-arg Express error middleware, registered LAST so every
  //    thrown/forwarded error funnels through it. Maps to JSON 404/500 with no stack leak and
  //    logs via the request-scoped logger (warn for 4xx, error for 5xx).
  app.use(errorHandler);

  return app;
}
