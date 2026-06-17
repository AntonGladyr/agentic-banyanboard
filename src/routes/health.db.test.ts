/**
 * src/routes/health.db.test.ts — DB-readiness tests for GET /health (TASK-003 Phase 1).
 *
 * Covers the readiness branches that require controlling the DB seam:
 *   - checkConnection() resolves → 200 `{ status:"ok", db:"ok", timestamp:<ISO8601> }`     (AC-LIVENESS-1)
 *   - checkConnection() rejects  → 503 `{ status:"error", db:"error", timestamp:<ISO8601> }` (AC-DB-UNHEALTHY-1)
 *       · the rejected error's message/stack NEVER appears in the response body (Guiding Principle 5)
 *       · a warn/error server-side log line carries the DB error (observability)
 *   - the handler branches purely on the mocked checkConnection outcome — no real DB        (AC-UNIT-1)
 *
 * ── Why mock the seam (Test Strategy) ──────────────────────────────────────────────────────
 * Per systemPatterns.md § Testing Patterns we mock at the module seam: `src/db/pool.ts` →
 * `checkConnection`. No live PostgreSQL is involved; behavior is driven entirely by the mock.
 * `DATABASE_URL` is set so `config.databaseUrl` is DEFINED and the handler takes the readiness
 * branch (not the "unconfigured" liveness branch).
 *
 * ── resetModules + require pattern (mirrors src/db/pool.test.ts) ─────────────────────────────
 * `config` reads `process.env` at import time and is frozen, so each test sets the env, calls
 * `jest.resetModules()`, and re-requires `../app` so the fresh app graph observes the current
 * env. The `checkConnection` jest.fn lives in this test module's scope, so the SAME reference
 * survives module-registry resets (the inline `jest.mock` factory re-runs on every re-require
 * but keeps closing over it).
 */

import request from 'supertest';
import type { Express } from 'express';

/** A syntactically valid DSN — never actually dialed; `checkConnection` is mocked. */
const VALID_DB_URL = 'postgres://user:pass@localhost:5432/banyanboard';

// Stable mock for the DB seam. The handler imports `{ checkConnection }` from '../db/pool'.
// The `mock`-prefixed name lets jest's hoisted `jest.mock` factory reference it. The const lives
// in THIS test module's scope, so the SAME jest.fn survives `jest.resetModules()` (only the
// required-module registry is reset, not this file's variables) — the factory re-runs on each
// re-require but keeps closing over `mockCheckConnection`. `getPool` is stubbed so an accidental
// call is observable rather than dialing a real pool.
const mockCheckConnection = jest.fn();

jest.mock('../db/pool', () => ({
  __esModule: true,
  checkConnection: (...args: unknown[]): unknown => mockCheckConnection(...args),
  getPool: jest.fn(),
}));

/** Load a fresh app graph so `config` re-reads the current `process.env`. */
function loadApp(): Express {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return (require('../app') as typeof import('../app')).createApp();
}

describe('health slice — DB readiness (integration, mocked checkConnection)', () => {
  const ORIGINAL_DB_URL = process.env.DATABASE_URL;

  beforeEach(() => {
    jest.resetModules();
    mockCheckConnection.mockReset();
    process.env.DATABASE_URL = VALID_DB_URL;
  });

  afterEach(() => {
    if (ORIGINAL_DB_URL === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = ORIGINAL_DB_URL;
    }
  });

  it('AC-LIVENESS-1: checkConnection resolves → 200 {status:"ok", db:"ok", timestamp:<ISO8601>} as JSON', async () => {
    // Arrange: DB reachable.
    mockCheckConnection.mockResolvedValue(undefined);
    const app = loadApp();

    // Act
    const res = await request(app).get('/health');

    // Assert: status, content-type, exact body shape, round-tripping timestamp.
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body).toEqual({
      status: 'ok',
      db: 'ok',
      timestamp: expect.any(String),
    });
    expect(new Date(res.body.timestamp).toISOString()).toBe(res.body.timestamp);
    expect(mockCheckConnection).toHaveBeenCalledTimes(1);
  });

  it('AC-DB-UNHEALTHY-1: checkConnection rejects → 503 {status:"error", db:"error", timestamp:<ISO8601>} as JSON', async () => {
    // Arrange: DB unreachable.
    mockCheckConnection.mockRejectedValue(new Error('Connection refused'));
    const app = loadApp();

    // Act
    const res = await request(app).get('/health');

    // Assert
    expect(res.status).toBe(503);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body).toEqual({
      status: 'error',
      db: 'error',
      timestamp: expect.any(String),
    });
    expect(new Date(res.body.timestamp).toISOString()).toBe(res.body.timestamp);
  });

  it('AC-DB-UNHEALTHY-1: the 503 response body leaks NO internal error detail (message/stack)', async () => {
    // Arrange: an error whose message + stack carry distinctive internal detail.
    const secret = 'ECONNREFUSED 10.1.2.3:5432 internal-host secret-dsn-fragment';
    const dbError = new Error(secret);
    mockCheckConnection.mockRejectedValue(dbError);
    const app = loadApp();

    // Act
    const res = await request(app).get('/health');

    // Assert: the body is exactly the safe shape and contains none of the error internals.
    expect(res.status).toBe(503);
    expect(res.body).toEqual({
      status: 'error',
      db: 'error',
      timestamp: expect.any(String),
    });
    const serializedBody = JSON.stringify(res.body);
    expect(serializedBody).not.toContain(secret);
    if (dbError.stack !== undefined) {
      expect(serializedBody).not.toContain(dbError.stack);
    }
  });

  it('AC-DB-UNHEALTHY-1: emits a warn/error server-side log line carrying the DB error', async () => {
    // Capture every line pino writes to stdout; swallow the actual write to keep output clean.
    const captured: string[] = [];
    const stdoutSpy = jest
      .spyOn(process.stdout, 'write')
      .mockImplementation((chunk: string | Uint8Array): boolean => {
        captured.push(
          typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'),
        );
        return true;
      });

    try {
      // Arrange
      const dbError = new Error('db down for log assertion');
      mockCheckConnection.mockRejectedValue(dbError);
      const app = loadApp();

      // Act
      await request(app).get('/health');
      // The access log is emitted on res.finish; yield a tick to be safe.
      await new Promise((resolve) => setImmediate(resolve));

      // Parse captured JSON lines (pino emits one line per log).
      const lines = captured
        .join('')
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .map((line) => JSON.parse(line) as Record<string, unknown>);

      // Find the DB-failure line: pino levels warn=40 / error=50, carrying the serialized `err`.
      const failureLine = lines.find(
        (l) =>
          (l.level === 40 || l.level === 50) &&
          typeof l.err === 'object' &&
          l.err !== null,
      );
      expect(failureLine).toBeDefined();
      const errObj = failureLine!.err as { message?: unknown };
      expect(errObj.message).toBe('db down for log assertion');
    } finally {
      stdoutSpy.mockRestore();
    }
  });

  it('AC-UNIT-1: handler branches purely on the mocked checkConnection outcome (no real DB)', async () => {
    // Success outcome → 200 ok/ok.
    mockCheckConnection.mockResolvedValueOnce(undefined);
    const okRes = await request(loadApp()).get('/health');
    expect(okRes.status).toBe(200);
    expect(okRes.body.db).toBe('ok');

    // Failure outcome → 503 error/error (rebuild the graph so config is re-read deterministically).
    jest.resetModules();
    process.env.DATABASE_URL = VALID_DB_URL;
    mockCheckConnection.mockReset();
    mockCheckConnection.mockRejectedValueOnce(new Error('down'));
    const badRes = await request(loadApp()).get('/health');
    expect(badRes.status).toBe(503);
    expect(badRes.body.db).toBe('error');

    expect(mockCheckConnection).toHaveBeenCalled();
  });
});
