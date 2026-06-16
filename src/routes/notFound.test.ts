/**
 * Integration test for the terminal 404 path (Phase 4 — Centralized error handling).
 *
 * Target contract (NOT yet implemented), per
 * memory-bank/creative/TASK-001-express-api-architecture.md
 * (Component table: `notFound.ts` / `errorHandler.ts`; "App composition order" — the two
 * terminal middlewares are appended LAST in `createApp()`) and TASK-001 AC-ERROR-1:
 *
 *   - `src/middleware/notFound.ts` — a terminal catch-all that produces a JSON 404 for any
 *       route no router matched. The final client response is status 404 with body
 *       `{ error: 'Not Found', path: <req.originalUrl>, traceId: <req.traceId> }`.
 *       Whether `notFound` responds directly or forwards a 404 error to `errorHandler` is an
 *       implementation choice — this test asserts only the OBSERVABLE client contract, which
 *       is identical either way.
 *   - The response is ALWAYS JSON — never Express's default HTML 404 page.
 *   - No stack trace is exposed in the body (security-critical).
 *
 * ── Why supertest against createApp() (Decision 5) ────────────────────────────────────
 * This 404 path needs NO throwing route, so we exercise the REAL composed app: import
 * `createApp()` only (never src/index.ts) and pass it to `request(app)`. supertest manages
 * an ephemeral in-process server — no port bound, no process side effects. This proves the
 * Coding Agent wired `notFound` + `errorHandler` LAST in `createApp()` (after the routers),
 * which is the only registration order that lets an unknown route reach `notFound`.
 *
 * The 500 path (AC-ERROR-2) lives in src/middleware/errorHandler.test.ts, which mounts the
 * real `errorHandler` on a throwaway app with a deliberately-throwing route — because we may
 * not add a throwing route to the production app.
 */

import request from 'supertest';
import { createApp } from '../app';

describe('notFound middleware (integration via createApp)', () => {
  const app = createApp(); // pure factory — no listen, no port, no side effects

  it('AC-ERROR-1: unknown route returns a structured JSON 404 with error/path/traceId and no stack', async () => {
    // Arrange: a path that no router under createApp() handles.
    const unknownPath = '/api/v1/does-not-exist';

    // Act
    const res = await request(app).get(unknownPath);

    // Assert: status + JSON content-type (never Express default HTML).
    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toMatch(/application\/json/);

    // Body shape: exact error string, echoed path, and a non-empty traceId string.
    expect(res.body.error).toBe('Not Found');
    expect(res.body.path).toBe(unknownPath);
    expect(typeof res.body.traceId).toBe('string');
    expect(res.body.traceId.length).toBeGreaterThan(0);

    // Security-critical: no stack trace / internal error detail leaks to the client.
    expect(res.body).not.toHaveProperty('stack');
    expect(res.body).not.toHaveProperty('message');

    // Defense-in-depth: the raw payload must be JSON, not an HTML error page.
    expect(res.text).not.toMatch(/<!DOCTYPE html>/i);
    expect(res.text).not.toMatch(/<html/i);
    expect(res.text).not.toMatch(/Cannot GET/i); // Express's default 404 text
  });
});
