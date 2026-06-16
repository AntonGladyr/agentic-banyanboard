/**
 * Integration tests for the health slice (Phase 3 — Express app & health slice).
 *
 * Target contract (NOT yet implemented), per
 * memory-bank/creative/TASK-001-express-api-architecture.md (Decision 5 — the authoritative
 * supertest pattern + "App composition order") and TASK-001 Acceptance Criteria
 * AC-ENTRY-1 / AC-HAPPY-1 / AC-HAPPY-2:
 *
 *   - `src/app.ts` exports `createApp(): Express` — a PURE factory that registers
 *       `requestLogger` first, then the `/health` router, then the `/api/v1` router.
 *       NO `listen`, NO process side effects. (notFound + errorHandler are Phase 4 and are
 *       NOT assumed to exist here.)
 *   - `src/routes/health.ts` — `GET /health` → 200 JSON
 *       `{ status: 'ok', timestamp: <ISO8601 string> }`, Content-Type application/json.
 *   - `src/routes/index.ts` — `/api/v1` router scaffold whose root has a small JSON stub
 *       handler so AC-HAPPY-2 ("always JSON") holds in THIS phase, before the Phase 4
 *       notFound/errorHandler exist.
 *
 * ── Why supertest against createApp() (Decision 5) ────────────────────────────────────
 * Tests import `createApp()` ONLY (never src/index.ts) and pass the app to `request(app)`,
 * so supertest manages an ephemeral in-process server — no port is bound and no
 * SIGTERM/process side effects occur.
 *
 * ── Request-log capture contract (authoritative for the Coding Agent) ──────────────────
 * The request logger (src/middleware/requestLogger.ts, Phase 2) emits ONE structured JSON
 * line on `res.finish` via the pino logger, which writes to `process.stdout`. To assert the
 * access log (AC-HAPPY-1), we follow Decision 5: install a capturing transport — here a spy
 * on `process.stdout.write` — parse the captured JSON, and find the request-completed line
 * (identified by the presence of `durationMs`/`statusCode`). We assert that line carries:
 *   - `traceId` equal to the incoming `traceparent` trace id,
 *   - `method`, `path`, `statusCode`, `durationMs`.
 * The spy is restored in afterEach.
 *
 * The Coding Agent MUST keep the request logger writing structured JSON to `process.stdout`
 * with those exact field names so this contract is satisfiable.
 */

import request from 'supertest';
import { createApp } from '../app';

/** W3C traceparent whose embedded trace id the request log must echo. */
const TRACEPARENT =
  '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01';
const EXPECTED_TRACE_ID = '0af7651916cd43dd8448eb211c80319c';

/** True when a parsed log object is the access-log line emitted on res.finish. */
function isRequestCompletedLine(
  entry: Record<string, unknown>,
): boolean {
  return (
    Object.prototype.hasOwnProperty.call(entry, 'durationMs') &&
    Object.prototype.hasOwnProperty.call(entry, 'statusCode')
  );
}

describe('health slice (integration)', () => {
  const app = createApp(); // pure factory — no listen, no port, no side effects

  describe('GET /health', () => {
    it('AC-HAPPY-1: returns 200 with {status:"ok", timestamp:<ISO8601>} as JSON', async () => {
      // Act
      const res = await request(app).get('/health');

      // Assert: status, content-type, and exact body shape.
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/application\/json/);
      expect(res.body.status).toBe('ok');

      // timestamp must be a valid ISO-8601 string (round-trips through Date).
      expect(typeof res.body.timestamp).toBe('string');
      expect(Number.isNaN(Date.parse(res.body.timestamp))).toBe(false);
      expect(new Date(res.body.timestamp).toISOString()).toBe(
        res.body.timestamp,
      );
    });

    describe('request-log trace propagation', () => {
      let stdoutSpy: jest.SpyInstance;
      let captured: string[];

      beforeEach(() => {
        // Capture every line the pino logger writes to stdout; swallow the actual
        // write so test output stays clean. Returns true per Writable#write.
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
      });

      afterEach(() => {
        stdoutSpy.mockRestore();
      });

      /** Parse captured stdout writes into JSON objects (one line per log). */
      function parsedLines(): Array<Record<string, unknown>> {
        return captured
          .join('')
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line.length > 0)
          .map((line) => JSON.parse(line) as Record<string, unknown>);
      }

      it('AC-HAPPY-1: logs a structured request line with traceId from traceparent + method/path/statusCode/durationMs', async () => {
        // Act: supply a W3C traceparent so the request log must echo its trace id.
        const res = await request(app)
          .get('/health')
          .set('traceparent', TRACEPARENT);

        expect(res.status).toBe(200);

        // The access log is emitted on res.finish; supertest awaits the full response,
        // but yield one tick to be safe against finish-handler timing.
        await new Promise((resolve) => setImmediate(resolve));

        // Find the request-completed line among the captured JSON output.
        const requestLine = parsedLines().find(isRequestCompletedLine);
        expect(requestLine).toBeDefined();

        const entry = requestLine!;
        expect(entry.traceId).toBe(EXPECTED_TRACE_ID);
        expect(entry.method).toBe('GET');
        expect(entry.path).toBe('/health');
        expect(entry.statusCode).toBe(200);
        expect(typeof entry.durationMs).toBe('number');
      });
    });
  });
});
