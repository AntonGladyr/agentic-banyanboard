/**
 * src/routes/boards.test.ts — integration tests for the boards CRUD slice (TASK-004 Phase 3).
 *
 * Exercises all five endpoints + error + observability ACs through the real Express stack
 * (`supertest(createApp())`), with the DB seam mocked at `src/db/pool.ts`. Per the Test Strategy
 * (§ Per-Phase Test Guidance, Phase 3) this covers:
 *   - AC-ENTRY-1 ........ GET /api/v1/boards mounted → 200 JSON
 *   - AC-HAPPY-1..5 ..... create / list / read-one / update / delete, incl. persistence +
 *                         stub-detection round-trips (two POSTs → distinct ids; read-back equality)
 *   - AC-ERROR-1 ........ invalid/missing name on POST → 400, no row inserted
 *   - AC-ERROR-2 ........ 404 for non-existent board on GET / PATCH / DELETE
 *   - AC-ERROR-3 ........ non-integer / zero :id → 400 before any DB query
 *   - AC-ERROR-4 ........ PATCH {} → 400, no DB update query
 *   - AC-OBS-1 .......... zero console.* across endpoints (all logging via req.log)
 *   - AC-OBS-2 .......... DB error → 500 with no internal detail in the body
 *
 * ── Why an in-memory fake behind the mocked seam ───────────────────────────────────────────
 * Per systemPatterns.md § Testing Patterns we mock at the module seam (`src/db/pool.ts`) — no
 * live PostgreSQL in the Jest run (the real migration round-trip is covered in CI per Phase 1).
 * Rather than canning per-call responses, the mocked `getPool().query` is backed by a tiny
 * in-memory boards store that interprets the five SQL operations. This makes the persistence /
 * stub-detection ACs meaningful: a created board is genuinely retrievable on a later request,
 * two creates yield different ids, and a delete actually removes the row — exactly what the ACs
 * assert ("data is truly persisted, not stub output").
 */

import request from 'supertest';
import { createApp } from '../app';

/** A board row as the fake store holds it (timestamps are Date objects, like pg returns). */
interface FakeRow {
  id: number;
  name: string;
  description: string | null;
  created_at: Date;
  updated_at: Date;
}

/** In-memory boards table backing the mocked pool. Reset before every test. */
const store: { rows: FakeRow[]; nextId: number } = { rows: [], nextId: 1 };

/**
 * Minimal SQL interpreter standing in for `pg.Pool.query`. Recognizes the exact statements
 * emitted by `src/db/boards.ts` (INSERT/SELECT-all/SELECT-by-id/UPDATE/DELETE) and operates on
 * the in-memory `store`. Returns the `{ rows, rowCount }` shape `pg` produces.
 */
const mockQuery = jest.fn(
  async (
    sql: string,
    params: unknown[] = [],
  ): Promise<{ rows: FakeRow[]; rowCount: number }> => {
    const text = sql.trim();

    if (text.startsWith('INSERT INTO boards')) {
      const now = new Date();
      const row: FakeRow = {
        id: store.nextId++,
        name: params[0] as string,
        description: (params[1] ?? null) as string | null,
        created_at: now,
        updated_at: now,
      };
      store.rows.push(row);
      return { rows: [row], rowCount: 1 };
    }

    if (text.startsWith('SELECT') && /WHERE id = \$1/.test(text)) {
      const id = params[0] as number;
      const found = store.rows.find((r) => r.id === id);
      return { rows: found ? [found] : [], rowCount: found ? 1 : 0 };
    }

    if (text.startsWith('SELECT')) {
      // List: ordered by id ascending.
      const rows = [...store.rows].sort((a, b) => a.id - b.id);
      return { rows, rowCount: rows.length };
    }

    if (text.startsWith('UPDATE boards')) {
      // Map each `col = $n` assignment to its bound value; `id` (from WHERE) is the lookup key.
      const assignments = [...text.matchAll(/(\w+)\s*=\s*\$(\d+)/g)];
      const idMatch = assignments.find(([, col]) => col === 'id');
      const id = params[Number(idMatch![2]) - 1] as number;
      const target = store.rows.find((r) => r.id === id);
      if (target === undefined) {
        return { rows: [], rowCount: 0 };
      }
      for (const [, col, idx] of assignments) {
        if (col === 'id') {
          continue;
        }
        if (col === 'name') {
          target.name = params[Number(idx) - 1] as string;
        } else if (col === 'description') {
          target.description = params[Number(idx) - 1] as string | null;
        }
      }
      target.updated_at = new Date();
      return { rows: [target], rowCount: 1 };
    }

    if (text.startsWith('DELETE FROM boards')) {
      const id = params[0] as number;
      const idx = store.rows.findIndex((r) => r.id === id);
      if (idx === -1) {
        return { rows: [], rowCount: 0 };
      }
      store.rows.splice(idx, 1);
      return { rows: [], rowCount: 1 };
    }

    throw new Error(`fake pool received an unexpected query: ${text}`);
  },
);

// Mock the DB seam: getPool() returns an object whose `query` is our interpreter. The
// `mock`-prefixed `mockQuery` may be referenced from the hoisted factory.
jest.mock('../db/pool', () => ({
  __esModule: true,
  getPool: () => ({ query: mockQuery }),
  checkConnection: jest.fn(),
}));

const app = createApp(); // pure factory — pool is mocked, so no real DB is ever dialed

describe('boards slice (integration, mocked pool seam)', () => {
  beforeEach(() => {
    store.rows = [];
    store.nextId = 1;
    mockQuery.mockClear();
  });

  // ── AC-ENTRY-1 ────────────────────────────────────────────────────────────────────────────
  it('AC-ENTRY-1: GET /api/v1/boards is mounted → 200 application/json', async () => {
    const res = await request(app).get('/api/v1/boards');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(Array.isArray(res.body)).toBe(true);
  });

  // ── AC-HAPPY-1: create ─────────────────────────────────────────────────────────────────────
  it('AC-HAPPY-1: POST creates a board with the documented shape and persists it', async () => {
    const res = await request(app).post('/api/v1/boards').send({ name: 'Sprint 1' });

    expect(res.status).toBe(201);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body).toEqual({
      id: expect.any(Number),
      name: 'Sprint 1',
      description: null,
      created_at: expect.any(String),
      updated_at: expect.any(String),
    });
    expect(res.body.id).toBeGreaterThan(0);
    // Timestamps round-trip as ISO-8601.
    expect(new Date(res.body.created_at).toISOString()).toBe(res.body.created_at);

    // Persistence: reading it back by id returns the same board (not stub output).
    const readBack = await request(app).get(`/api/v1/boards/${res.body.id}`);
    expect(readBack.status).toBe(200);
    expect(readBack.body).toEqual(res.body);
  });

  it('AC-HAPPY-1: two POSTs produce different ids (stub detection)', async () => {
    const first = await request(app).post('/api/v1/boards').send({ name: 'A' });
    const second = await request(app).post('/api/v1/boards').send({ name: 'B' });

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(first.body.id).not.toBe(second.body.id);
  });

  it('AC-HAPPY-1: accepts an optional description', async () => {
    const res = await request(app)
      .post('/api/v1/boards')
      .send({ name: 'Sprint 1', description: 'A description' });

    expect(res.status).toBe(201);
    expect(res.body.description).toBe('A description');
  });

  // ── AC-HAPPY-2: list ───────────────────────────────────────────────────────────────────────
  it('AC-HAPPY-2: GET returns [] when empty, and reflects newly created boards', async () => {
    const empty = await request(app).get('/api/v1/boards');
    expect(empty.status).toBe(200);
    expect(empty.body).toEqual([]);

    const created = await request(app).post('/api/v1/boards').send({ name: 'Sprint 1' });
    const listed = await request(app).get('/api/v1/boards');

    expect(listed.status).toBe(200);
    expect(listed.body).toHaveLength(1);
    expect(listed.body[0]).toEqual(created.body);
  });

  // ── AC-HAPPY-3: read one ───────────────────────────────────────────────────────────────────
  it('AC-HAPPY-3: GET /:id returns the full board with values matching what was inserted', async () => {
    const created = await request(app)
      .post('/api/v1/boards')
      .send({ name: 'Specific Name', description: 'Specific Desc' });

    const res = await request(app).get(`/api/v1/boards/${created.body.id}`);

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Specific Name');
    expect(res.body.description).toBe('Specific Desc');
    expect(res.body).toEqual({
      id: created.body.id,
      name: 'Specific Name',
      description: 'Specific Desc',
      created_at: expect.any(String),
      updated_at: expect.any(String),
    });
  });

  // ── AC-HAPPY-4: update ─────────────────────────────────────────────────────────────────────
  it('AC-HAPPY-4: PATCH updates the name durably and bumps updated_at', async () => {
    const created = await request(app).post('/api/v1/boards').send({ name: 'Original' });

    const patched = await request(app)
      .patch(`/api/v1/boards/${created.body.id}`)
      .send({ name: 'Renamed' });

    expect(patched.status).toBe(200);
    expect(patched.body.name).toBe('Renamed');
    expect(
      new Date(patched.body.updated_at).getTime(),
    ).toBeGreaterThanOrEqual(new Date(patched.body.created_at).getTime());

    // Durable: a subsequent read reflects the new name.
    const readBack = await request(app).get(`/api/v1/boards/${created.body.id}`);
    expect(readBack.body.name).toBe('Renamed');
  });

  it('AC-HAPPY-4: PATCH can clear the description to null', async () => {
    const created = await request(app)
      .post('/api/v1/boards')
      .send({ name: 'Has Desc', description: 'remove me' });

    const patched = await request(app)
      .patch(`/api/v1/boards/${created.body.id}`)
      .send({ description: null });

    expect(patched.status).toBe(200);
    expect(patched.body.description).toBeNull();
  });

  // ── AC-HAPPY-5: delete ─────────────────────────────────────────────────────────────────────
  it('AC-HAPPY-5: DELETE removes the board (204), and a subsequent GET is 404', async () => {
    const created = await request(app).post('/api/v1/boards').send({ name: 'To Delete' });

    const del = await request(app).delete(`/api/v1/boards/${created.body.id}`);
    expect(del.status).toBe(204);
    expect(del.body).toEqual({});

    const readBack = await request(app).get(`/api/v1/boards/${created.body.id}`);
    expect(readBack.status).toBe(404);
  });

  // ── AC-ERROR-1: validation on POST ─────────────────────────────────────────────────────────
  it('AC-ERROR-1: POST with missing name → 400 standard shape, no row inserted', async () => {
    const res = await request(app).post('/api/v1/boards').send({});

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: 'Bad Request',
      path: '/api/v1/boards',
      traceId: expect.any(String),
    });
    expect(store.rows).toHaveLength(0);
  });

  it('AC-ERROR-1: POST with empty-string name → 400, no row inserted', async () => {
    const res = await request(app).post('/api/v1/boards').send({ name: '' });
    expect(res.status).toBe(400);
    expect(store.rows).toHaveLength(0);
  });

  it('AC-ERROR-1: POST with name > 255 chars → 400, no row inserted', async () => {
    const res = await request(app)
      .post('/api/v1/boards')
      .send({ name: 'a'.repeat(256) });
    expect(res.status).toBe(400);
    expect(store.rows).toHaveLength(0);
  });

  // ── AC-ERROR-2: 404 for non-existent board ─────────────────────────────────────────────────
  it('AC-ERROR-2: GET / PATCH / DELETE on a non-existent id → 404 standard shape, no detail leak', async () => {
    const getRes = await request(app).get('/api/v1/boards/99999');
    expect(getRes.status).toBe(404);
    expect(getRes.body).toEqual({
      error: 'Not Found',
      path: '/api/v1/boards/99999',
      traceId: expect.any(String),
    });

    const patchRes = await request(app)
      .patch('/api/v1/boards/99999')
      .send({ name: 'X' });
    expect(patchRes.status).toBe(404);
    expect(patchRes.body.error).toBe('Not Found');

    const delRes = await request(app).delete('/api/v1/boards/99999');
    expect(delRes.status).toBe(404);
    expect(delRes.body.error).toBe('Not Found');

    // No internal detail in any 404 body.
    for (const body of [getRes.body, patchRes.body, delRes.body]) {
      const serialized = JSON.stringify(body);
      expect(serialized).not.toMatch(/stack|at Object|node_modules|postgres|ECONN/i);
    }
  });

  // ── AC-ERROR-3: non-integer :id ────────────────────────────────────────────────────────────
  it('AC-ERROR-3: GET /:id with a non-integer id → 400 before any DB query', async () => {
    const res = await request(app).get('/api/v1/boards/abc');

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Bad Request');
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('AC-ERROR-3: DELETE /:id with id=0 → 400 before any DB query', async () => {
    const res = await request(app).delete('/api/v1/boards/0');

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Bad Request');
    expect(mockQuery).not.toHaveBeenCalled();
  });

  // ── AC-ERROR-4: PATCH empty body ───────────────────────────────────────────────────────────
  it('AC-ERROR-4: PATCH with {} → 400 and no DB update query', async () => {
    const created = await request(app).post('/api/v1/boards').send({ name: 'Exists' });
    mockQuery.mockClear();

    const res = await request(app).patch(`/api/v1/boards/${created.body.id}`).send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Bad Request');
    expect(mockQuery).not.toHaveBeenCalled();
  });

  // ── AC-OBS-1: no console.* ──────────────────────────────────────────────────────────────────
  it('AC-OBS-1: exercising the endpoints emits zero console.* calls', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    try {
      const created = await request(app).post('/api/v1/boards').send({ name: 'Logged' });
      await request(app).get('/api/v1/boards');
      await request(app).get(`/api/v1/boards/${created.body.id}`);
      await request(app).patch(`/api/v1/boards/${created.body.id}`).send({ name: 'Renamed' });
      await request(app).delete(`/api/v1/boards/${created.body.id}`);
      await request(app).get('/api/v1/boards/abc'); // a validation error path too

      expect(logSpy).not.toHaveBeenCalled();
      expect(errSpy).not.toHaveBeenCalled();
      expect(warnSpy).not.toHaveBeenCalled();
    } finally {
      logSpy.mockRestore();
      errSpy.mockRestore();
      warnSpy.mockRestore();
    }
  });

  // ── AC-OBS-2: DB error → 500 with no internal detail ───────────────────────────────────────
  it('AC-OBS-2: a DB error → 500 with only {error, traceId}; no internal detail leaks', async () => {
    const secret = 'ECONNREFUSED 10.1.2.3:5432 secret-dsn-fragment';
    mockQuery.mockRejectedValueOnce(new Error(secret));

    const res = await request(app).get('/api/v1/boards');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      error: 'Internal Server Error',
      traceId: expect.any(String),
    });
    expect(JSON.stringify(res.body)).not.toContain(secret);
  });
});
