/**
 * src/middleware/requestLogger.ts — request/response logging middleware.
 *
 * Per memory-bank/creative/TASK-001-express-api-architecture.md
 * ("requestLogger.ts" guideline + App composition order):
 *
 *   1. Derive the trace context from the incoming `traceparent` header
 *      (or mint a fresh root id) via `extractTraceContext`.
 *   2. Attach a request-scoped child logger (`req.log`) bound to that traceId/spanId, and
 *      expose `req.traceId` for the downstream error handler (Phase 4).
 *   3. Time the request and, on `res.finish`, emit ONE structured JSON line with
 *      `method`, `path`, `statusCode`, and `durationMs`. Non-blocking — no heavy work in
 *      the finish handler.
 *
 * Registered first in `createApp()` so trace context + `req.log` exist for everything after.
 * The `req.log` / `req.traceId` types come from src/types/express.d.ts.
 */

import type { Request, Response, NextFunction } from 'express';
import { logger } from '../observability/logger';
import { extractTraceContext } from '../observability/tracing';

/** Milliseconds per nanosecond — converts `process.hrtime.bigint()` deltas to ms. */
const NS_PER_MS = 1_000_000;

/**
 * Express middleware that establishes per-request trace context and emits a single
 * structured access-log line when the response finishes.
 */
export function requestLogger(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const { traceId, spanId } = extractTraceContext(req.headers);

  req.traceId = traceId;
  req.log = logger.child({ traceId, spanId });

  const startedAt = process.hrtime.bigint();

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / NS_PER_MS;
    req.log.info(
      {
        method: req.method,
        path: req.originalUrl || req.url,
        statusCode: res.statusCode,
        durationMs,
      },
      'request completed',
    );
  });

  next();
}
