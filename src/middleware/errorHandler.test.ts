/**
 * Integration/behavior tests for the centralized error handler (Phase 4 — final phase).
 *
 * Target contract (NOT yet implemented), per
 * memory-bank/creative/TASK-001-express-api-architecture.md
 * (Component table: `errorHandler.ts`; Observability Architecture — "logs via the logger
 * (warn for 4xx, error with message+stack for 5xx), never leaks stack to the client") and
 * TASK-001 AC-ERROR-2:
 *
 *   - `src/middleware/errorHandler.ts` exports an Express 4-arg error middleware
 *       `errorHandler(err, req, res, next)`.
 *   - For an unexpected thrown error → HTTP 500 with body
 *       `{ error: 'Internal Server Error', traceId: <req.traceId> }`.
 *       The response body NEVER contains `stack` or the raw `err.message` / internal detail
 *       (security-critical).
 *   - It logs via `req.log` / the logger (NOT `console.*`): `error` level for 5xx (with the
 *       error's message + stack captured SERVER-SIDE only), `warn` level for 4xx.
 *   - It keeps the process alive — a thrown error in one request must not crash the server,
 *       so subsequent requests still succeed.
 *
 * ── Why a throwaway app rather than createApp() ───────────────────────────────────────
 * To exercise the 500 path we need a route that throws. We must NOT add a throwing route to
 * the production app, and we cannot mount one on the app returned by `createApp()` because
 * `errorHandler` is registered LAST there — any route added afterward would sit AFTER the
 * handler and never funnel through it.
 *
 * So we compose a SMALL throwaway `express()` app that reuses the REAL middleware in the
 * SAME relevant order: `requestLogger` (so `req.traceId` / `req.log` exist exactly as in
 * production) → a deliberately-throwing route (test-only) AND a healthy route → the REAL
 * `errorHandler` registered LAST. This isolates the error handler's behavior without
 * touching production routes, and the request still flows through the genuine
 * trace-context + logging path.
 *
 * The 404 path (AC-ERROR-1) is covered by the real composed app in
 * src/routes/notFound.test.ts (no throwing route needed there).
 */

import express from 'express';
import type { Express, Request, Response, NextFunction } from 'express';
import request from 'supertest';

import { requestLogger } from './requestLogger';
import { errorHandler } from './errorHandler';

/** A unique secret embedded in the thrown error to prove it never leaks to the client. */
const SECRET_INTERNAL_MESSAGE =
  'boom: internal detail that must never reach the client';

/**
 * Build a throwaway Express app that reuses the REAL requestLogger + errorHandler, with a
 * test-only route that throws and a healthy route to prove the process survives.
 *
 * Composition mirrors production order: requestLogger FIRST, errorHandler LAST.
 */
function buildThrowingApp(): Express {
  const app = express();

  // requestLogger FIRST — establishes req.traceId / req.log exactly as in createApp().
  app.use(requestLogger);

  // Test-only route that throws synchronously — Express forwards thrown errors from a
  // sync handler straight to the 4-arg error middleware.
  app.get('/boom', (_req: Request, _res: Response, _next: NextFunction): void => {
    throw new Error(SECRET_INTERNAL_MESSAGE);
  });

  // Healthy route — used to prove the server is still responsive after a 500.
  app.get('/ok', (_req: Request, res: Response): void => {
    res.status(200).json({ status: 'ok' });
  });

  // errorHandler LAST — the 4-arg middleware all thrown errors funnel through.
  app.use(errorHandler);

  return app;
}

describe('errorHandler middleware (Phase 4 — centralized error handling)', () => {
  describe('AC-ERROR-2: thrown errors map to a clean JSON 500', () => {
    const app = buildThrowingApp();

    it('returns 500 with {error:"Internal Server Error", traceId} and leaks no stack or internal detail', async () => {
      // Act: hit the throwing route.
      const res = await request(app).get('/boom');

      // Assert: status + JSON content-type (never Express default HTML).
      expect(res.status).toBe(500);
      expect(res.headers['content-type']).toMatch(/application\/json/);

      // Body shape: exact generic error string + a non-empty traceId string.
      expect(res.body.error).toBe('Internal Server Error');
      expect(typeof res.body.traceId).toBe('string');
      expect(res.body.traceId.length).toBeGreaterThan(0);

      // Security-critical: NO stack and NO raw error message / internal detail in the body.
      expect(res.body).not.toHaveProperty('stack');
      expect(res.body).not.toHaveProperty('message');
      expect(JSON.stringify(res.body)).not.toContain(SECRET_INTERNAL_MESSAGE);
      expect(JSON.stringify(res.body)).not.toContain('Error:');
      expect(res.text).not.toContain(SECRET_INTERNAL_MESSAGE);
      expect(res.text).not.toMatch(/at .+\(.+:\d+:\d+\)/); // V8 stack frame shape
    });
  });

  describe('AC-ERROR-2: server stays responsive after a thrown error', () => {
    const app = buildThrowingApp();

    it('handles a 500 then still serves a subsequent healthy request (process did not crash)', async () => {
      // Act 1: trigger the error path — must be HANDLED, not fatal.
      const errRes = await request(app).get('/boom');
      expect(errRes.status).toBe(500);

      // Act 2: a fresh request to a healthy route on the SAME app instance.
      const okRes = await request(app).get('/ok');

      // Assert: the app is still alive and serving normally.
      expect(okRes.status).toBe(200);
      expect(okRes.headers['content-type']).toMatch(/application\/json/);
      expect(okRes.body.status).toBe('ok');
    });
  });

  describe('observability: errors are logged via the logger (not console) at the right level', () => {
    const app = buildThrowingApp();

    // pino numeric level for `error` (verified: trace=10 … error=50 … fatal=60).
    const PINO_ERROR_LEVEL = 50;

    let stdoutSpy: jest.SpyInstance;
    let captured: string[];
    let consoleErrorSpy: jest.SpyInstance;
    let consoleLogSpy: jest.SpyInstance;

    beforeEach(() => {
      // Capture stdout (the project's established log-capture pattern — see
      // src/routes/health.test.ts). The pino logger writes newline-delimited JSON to
      // `process.stdout`, so `req.log.error(...)` from the handler is captured here. We
      // swallow the actual write so test output stays clean.
      captured = [];
      stdoutSpy = jest
        .spyOn(process.stdout, 'write')
        .mockImplementation((chunk: string | Uint8Array): boolean => {
          captured.push(
            typeof chunk === 'string'
              ? chunk
              : Buffer.from(chunk).toString('utf8'),
          );
          return true;
        });

      // Guard: the handler must NOT use console.* (BLOCKING per CLAUDE.md observability).
      consoleErrorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation((): void => undefined);
      consoleLogSpy = jest
        .spyOn(console, 'log')
        .mockImplementation((): void => undefined);
    });

    afterEach(() => {
      stdoutSpy.mockRestore();
      consoleErrorSpy.mockRestore();
      consoleLogSpy.mockRestore();
    });

    /** Parse captured stdout writes into JSON log objects (one per line). */
    function parsedLines(): Array<Record<string, unknown>> {
      return captured
        .join('')
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .map((line) => JSON.parse(line) as Record<string, unknown>);
    }

    it('logs a 5xx at error level (message/stack captured server-side) and never via console', async () => {
      // Act: trigger the 500 path.
      const res = await request(app).get('/boom');
      expect(res.status).toBe(500);

      // The error log is emitted while handling the request; yield a tick for safety.
      await new Promise((resolve) => setImmediate(resolve));

      const lines = parsedLines();

      // Assert: an `error`-level (50) log line was emitted via the logger abstraction.
      // (warn is 40; we require >= error for a 5xx per the observability contract.)
      const errorLine = lines.find(
        (entry) =>
          typeof entry.level === 'number' && entry.level >= PINO_ERROR_LEVEL,
      );
      expect(errorLine).toBeDefined();

      // ...and NOT via console.* (BLOCKING observability rule).
      expect(consoleErrorSpy).not.toHaveBeenCalled();
      expect(consoleLogSpy).not.toHaveBeenCalled();

      // Tolerant contract: the internal detail (message/stack) is captured SERVER-SIDE in
      // the log output, NOT in the response body. We assert the secret appears somewhere in
      // the captured stdout without over-constraining the exact log object shape.
      const loggedServerSide = captured
        .join('')
        .includes(SECRET_INTERNAL_MESSAGE);
      expect(loggedServerSide).toBe(true);

      // And it stays out of the client body — re-assert the security boundary here.
      expect(res.text).not.toContain(SECRET_INTERNAL_MESSAGE);
    });
  });
});
