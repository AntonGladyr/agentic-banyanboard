/**
 * Integration test for the /api/v1 router scaffold (Phase 3 — Express app & health slice).
 *
 * Target contract (NOT yet implemented), per
 * memory-bank/creative/TASK-001-express-api-architecture.md (Component table: routes/index.ts;
 * App composition order) and TASK-001 Acceptance Criterion AC-HAPPY-2:
 *
 *   - `src/routes/index.ts` mounts the `/api/v1` router. To satisfy AC-HAPPY-2
 *       ("always JSON") in THIS phase — BEFORE the Phase 4 notFound/errorHandler exist —
 *       the `/api/v1` root has a small JSON stub handler:
 *         `GET /api/v1` → 200 + a JSON object (e.g. { api: 'v1', status: 'ok' }).
 *
 * ── Assumed /api/v1 stub-body contract ────────────────────────────────────────────────
 * We assert ONLY that the root is reachable (2xx — 200 expected) AND returns a JSON object
 * with `application/json` content-type. We deliberately do NOT over-constrain the exact body
 * keys (per the build instructions): any small JSON OBJECT satisfies the contract. This keeps
 * the test resilient to the Coding Agent's exact stub payload while still proving
 * "the /api/v1 router is registered and always returns JSON, never Express default HTML".
 *
 * Imports `createApp()` ONLY (never src/index.ts) so no port is bound.
 */

import request from 'supertest';
import { createApp } from '../app';

describe('/api/v1 router scaffold (integration)', () => {
  const app = createApp(); // pure factory — no listen, no port, no side effects

  it('AC-HAPPY-2: GET /api/v1 is reachable and returns a JSON object', async () => {
    // Act
    const res = await request(app).get('/api/v1');

    // Assert: reachable (2xx — stub root returns 200), always JSON, body is an object.
    expect(res.status).toBeGreaterThanOrEqual(200);
    expect(res.status).toBeLessThan(300);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(typeof res.body).toBe('object');
    expect(res.body).not.toBeNull();
  });
});
