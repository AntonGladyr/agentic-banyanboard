/**
 * src/middleware/notFound.ts — terminal 404 catch-all (Phase 4).
 *
 * Per memory-bank/creative/TASK-001-express-api-architecture.md
 * (Component table: `notFound.ts`; "App composition order" — registered after all routers,
 * just before `errorHandler`) and TASK-001 AC-ERROR-1:
 *
 *   Any request that no router matched falls through to this middleware. It responds with a
 *   structured JSON 404 — never Express's default HTML "Cannot GET" page — and logs the miss
 *   at WARN level via the request-scoped logger so the trace correlation is preserved.
 *
 * The client contract is exactly:
 *   status 404, body `{ error: 'Not Found', path: <req.originalUrl>, traceId: <req.traceId> }`.
 *
 * We respond directly (rather than forwarding a 404 error to `errorHandler`) — the observable
 * client contract is identical either way, and a direct `res.status(404).json(...)` guarantees
 * the `application/json` content-type and keeps no internal detail (no `stack`/`message`) in the
 * body. `errorHandler` still handles thrown/forwarded errors registered after this.
 */

import type { Request, Response } from 'express';

/**
 * Express terminal middleware for unmatched routes.
 *
 * Logs the miss at WARN (4xx convention) and sends the structured JSON 404. No `next` is needed
 * because this is the catch-all — there is no further route to defer to.
 */
export function notFound(req: Request, res: Response): void {
  // WARN level for a 4xx miss (per the Observability Architecture: 4xx → warn).
  req.log.warn(
    { method: req.method, path: req.originalUrl, statusCode: 404 },
    'route not found',
  );

  // `res.status(404).json(...)` sets application/json and serializes the body — never HTML.
  res.status(404).json({
    error: 'Not Found',
    path: req.originalUrl,
    traceId: req.traceId,
  });
}
