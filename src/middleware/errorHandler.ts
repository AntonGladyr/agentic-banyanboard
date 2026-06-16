/**
 * src/middleware/errorHandler.ts — centralized Express error handler (Phase 4 — final phase).
 *
 * Per memory-bank/creative/TASK-001-express-api-architecture.md
 * (Component table: `errorHandler.ts`; Observability Architecture — "logs via the logger
 * (warn for 4xx, error with message+stack for 5xx), never leaks stack to the client") and
 * TASK-001 AC-ERROR-2:
 *
 *   A TRUE Express 4-arg error middleware — Express detects error handlers by arity (`.length`
 *   === 4), so ALL FOUR parameters MUST be present even if `next` is only used on the
 *   headers-already-sent path. Registered LAST in `createApp()` so every thrown/forwarded error
 *   funnels through it.
 *
 *   Status mapping:
 *     - A carried numeric `status`/`statusCode` in the 4xx range → that status (e.g. a forwarded
 *       404), with body `{ error: <safe label>, path, traceId }`.
 *     - Anything else (including 5xx or no status) → 500 with body
 *       `{ error: 'Internal Server Error', traceId }`.
 *
 *   SECURITY-CRITICAL: the response body NEVER contains `err.message`, `err.stack`, or any other
 *   internal detail. The message + stack are captured SERVER-SIDE in the log only (pino serializes
 *   the `err` object, including its stack, into the log line — never the HTTP response).
 *
 *   Logging via `req.log` (falls back to the base `logger` if absent): 5xx → `error`, 4xx → `warn`.
 *   Never `console.*`. The process is kept alive — errors are handled, never rethrown.
 */

import type { Request, Response, NextFunction } from 'express';
import { logger } from '../observability/logger';

/** Lower/upper bounds of the HTTP 4xx client-error range (inclusive lower, exclusive upper). */
const CLIENT_ERROR_MIN = 400;
const CLIENT_ERROR_MAX = 500;

/** Generic, safe client-facing label for any non-4xx (server) error — never leaks detail. */
const INTERNAL_ERROR_LABEL = 'Internal Server Error';

/** Minimal safe view of an unknown thrown value — only the fields we read, all optional. */
interface ErrorLike {
  status?: unknown;
  statusCode?: unknown;
  message?: unknown;
}

/**
 * Extract a 4xx status code carried on the error (via `status` or `statusCode`), or `undefined`
 * if neither is a numeric value inside the client-error range. Anything outside 4xx (including
 * 5xx) is treated as a 500 by the caller, so it is intentionally not surfaced here.
 */
function clientErrorStatus(err: ErrorLike): number | undefined {
  const raw = typeof err.status === 'number' ? err.status : err.statusCode;
  if (
    typeof raw === 'number' &&
    Number.isInteger(raw) &&
    raw >= CLIENT_ERROR_MIN &&
    raw < CLIENT_ERROR_MAX
  ) {
    return raw;
  }
  return undefined;
}

/**
 * Map a known 4xx status to a safe, generic client-facing label. We deliberately do NOT echo
 * `err.message` for the body (it could carry internal detail) — only a fixed, safe string per
 * status, defaulting to a neutral 'Client Error' for any other 4xx.
 */
function clientErrorLabel(status: number): string {
  switch (status) {
    case 400:
      return 'Bad Request';
    case 401:
      return 'Unauthorized';
    case 403:
      return 'Forbidden';
    case 404:
      return 'Not Found';
    default:
      return 'Client Error';
  }
}

/**
 * Centralized Express error middleware (4-arg). MUST be registered last in `createApp()`.
 *
 * `_next` is required so Express recognizes this as an error handler (arity 4); it is only used
 * to delegate when the response has already started, which avoids a double-send.
 */
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  // Prefer the request-scoped child logger (carries traceId/spanId); fall back to the base
  // logger if it is somehow absent (e.g. an error before requestLogger ran).
  const log = req.log ?? logger;

  const e = (err ?? {}) as ErrorLike;
  const clientStatus = clientErrorStatus(e);

  // If the response has already started streaming, we cannot send a new body — delegate to
  // Express's default handler to close the connection and avoid "headers already sent".
  if (res.headersSent) {
    _next(err);
    return;
  }

  if (clientStatus !== undefined) {
    // 4xx → WARN. The full error (incl. message/stack) is captured server-side only.
    log.warn(
      { err, statusCode: clientStatus, path: req.originalUrl },
      'request failed with client error',
    );

    res.status(clientStatus).json({
      error: clientErrorLabel(clientStatus),
      path: req.originalUrl,
      traceId: req.traceId,
    });
    return;
  }

  // 5xx (and anything without a usable 4xx status) → ERROR. pino serializes `err` (message +
  // stack) into the LOG line for server-side diagnosis — it never reaches the response body.
  const message =
    typeof e.message === 'string' && e.message.length > 0
      ? e.message
      : INTERNAL_ERROR_LABEL;
  log.error({ err }, message);

  res.status(500).json({
    error: INTERNAL_ERROR_LABEL,
    traceId: req.traceId,
  });
}
