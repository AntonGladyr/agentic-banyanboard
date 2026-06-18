/**
 * src/routes/cards.test.ts — integration tests for the cards CRUD slice (TASK-005 Phase 3).
 *
 * Exercises all five board-scoped endpoints + error + observability ACs through the real Express
 * stack (`supertest(createApp())`), with the DB seam mocked at `src/db/pool.ts`. Per the Test
 * Strategy (§ Per-Phase Test Guidance, Phase 3) this covers:
 *   - AC-ENTRY-1 ........ GET /api/v1/boards/:boardId/cards mounted → 200 JSON
 *   - AC-HAPPY-1..5 ..... create / list / read-one / update / delete, incl. persistence +
 *                         stub-detection round-trips (two POSTs → distinct ids; read-back equality)
 *   - AC-HAPPY-2 ........ per-board isolation (card under board A absent when listing board B) +
 *                         ordering by `position ASC, id ASC`
 *   - pre-flight ........ POST to a non-existent boardId → 404, no card inserted
 *   - AC-ERROR-1 ........ invalid/missing/over-long title on POST → 400, no row inserted
 *   - AC-ERROR-2 ........ 404 for non-existent card on GET / PATCH / DELETE
 *   - AC-ERROR-3 ........ non-integer :id / :boardId → 400 before any DB query
 *   - AC-ERROR-4 ........ PATCH {} → 400, no DB update query
 *   - AC-ERROR-5 ........ invalid position on POST → 400, no row inserted
 *   - AC-OBS-1 .......... zero console.* across endpoints (all logging via req.log)
 *   - AC-OBS-2 .......... DB error → 500 with no internal detail in the body
 *
 * ── Why an in-memory fake behind the mocked seam ───────────────────────────────────────────
 * Per systemPatterns.md § Testing Patterns we mock at the module seam (`src/db/pool.ts`) — no
 * live PostgreSQL in the Jest run (the real migration round-trip is covered in CI per Phase 1).
 * The mocked `getPool().query` is backed by a tiny in-memory store interpreting the SQL emitted by
 * BOTH `src/db/cards.ts` (INSERT/SELECT-list/SELECT-by-id/UPDATE/DELETE on `cards`) and the
 * `findById` on `src/db/boards.ts` that the cards router calls for its pre-flight board-existence
 * check. Modelling both tables makes the persistence / stub-detection / isolation / pre-flight ACs
 * meaningful: a created card is genuinely retrievable later, two creates yield different ids, a
 * delete actually removes the row, cards are scoped per board, and POSTing under an unknown board
 * is rejected before any insert.
 */

import request from 'supertest';
import { createApp } from '../app';

/** A card row as the fake store holds it (timestamps are Date objects, like pg returns). */
interface FakeCard {
  id: number;
  board_id: number;
  title: string;
  description: string | null;
  position: number;
  created_at: Date;
  updated_at: Date;
}

/** A board row — only the columns the cards pre-flight `findById(boardId)` reads matter here. */
interface FakeBoard {
  id: number;
  name: string;
  description: string | null;
  created_at: Date;
  updated_at: Date;
}

/** In-memory tables backing the mocked pool. Reset before every test. */
const store: {
  boards: FakeBoard[];
  cards: FakeCard[];
  nextCardId: number;
} = { boards: [], cards: [], nextCardId: 1 };

/** Seed a board so the pre-flight existence check and board-scoped paths have a parent to find. */
function seedBoard(id: number): void {
  const now = new Date();
  store.boards.push({ id, name: `Board ${id}`, description: null, created_at: now, updated_at: now });
}

/**
 * Minimal SQL interpreter standing in for `pg.Pool.query`. Recognizes the exact statements emitted
 * by `src/db/cards.ts` and the board `findById` from `src/db/boards.ts`, operating on the
 * in-memory `store`. Returns the `{ rows, rowCount }` shape `pg` produces.
 */
const mockQuery = jest.fn(
  async (
    sql: string,
    params: unknown[] = [],
  ): Promise<{ rows: unknown[]; rowCount: number }> => {
    const text = sql.trim();

    if (text.startsWith('INSERT INTO cards')) {
      const now = new Date();
      const row: FakeCard = {
        id: store.nextCardId++,
        board_id: params[0] as number,
        title: params[1] as string,
        description: (params[2] ?? null) as string | null,
        position: params[3] as number,
        created_at: now,
        updated_at: now,
      };
      store.cards.push(row);
      return { rows: [row], rowCount: 1 };
    }

    // List cards for a board: ... FROM cards WHERE board_id = $1 ORDER BY position ASC, id ASC.
    if (text.startsWith('SELECT') && /FROM cards/.test(text) && /WHERE board_id = \$1/.test(text)) {
      const boardId = params[0] as number;
      const rows = store.cards
        .filter((c) => c.board_id === boardId)
        .sort((a, b) => a.position - b.position || a.id - b.id);
      return { rows, rowCount: rows.length };
    }

    // Read one card: ... FROM cards WHERE id = $1.
    if (text.startsWith('SELECT') && /FROM cards/.test(text) && /WHERE id = \$1/.test(text)) {
      const id = params[0] as number;
      const found = store.cards.find((c) => c.id === id);
      return { rows: found ? [found] : [], rowCount: found ? 1 : 0 };
    }

    // Pre-flight board existence: ... FROM boards WHERE id = $1.
    if (text.startsWith('SELECT') && /FROM boards/.test(text) && /WHERE id = \$1/.test(text)) {
      const id = params[0] as number;
      const found = store.boards.find((b) => b.id === id);
      return { rows: found ? [found] : [], rowCount: found ? 1 : 0 };
    }

    if (text.startsWith('UPDATE cards')) {
      // Map each `col = $n` assignment to its bound value; `id` (from WHERE) is the lookup key.
      const assignments = [...text.matchAll(/(\w+)\s*=\s*\$(\d+)/g)];
      const idMatch = assignments.find(([, col]) => col === 'id');
      const id = params[Number(idMatch![2]) - 1] as number;
      const target = store.cards.find((c) => c.id === id);
      if (target === undefined) {
        return { rows: [], rowCount: 0 };
      }
      for (const [, col, idx] of assignments) {
        if (col === 'id') {
          continue;
        }
        if (col === 'title') {
          target.title = params[Number(idx) - 1] as string;
        } else if (col === 'description') {
          target.description = params[Number(idx) - 1] as string | null;
        } else if (col === 'position') {
          target.position = params[Number(idx) - 1] as number;
        }
      }
      target.updated_at = new Date();
      return { rows: [target], rowCount: 1 };
    }

    if (text.startsWith('DELETE FROM cards')) {
      const id = params[0] as number;
      const idx = store.cards.findIndex((c) => c.id === id);
      if (idx === -1) {
        return { rows: [], rowCount: 0 };
      }
      store.cards.splice(idx, 1);
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

describe('cards slice (integration, mocked pool seam)', () => {
  beforeEach(() => {
    store.boards = [];
    store.cards = [];
    store.nextCardId = 1;
    mockQuery.mockClear();
    // Two boards exist for the happy-path / isolation ACs.
    seedBoard(1);
    seedBoard(2);
  });

  // ── AC-ENTRY-1 ────────────────────────────────────────────────────────────────────────────
  it('AC-ENTRY-1: GET /api/v1/boards/:boardId/cards is mounted → 200 application/json', async () => {
    const res = await request(app).get('/api/v1/boards/1/cards');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(Array.isArray(res.body)).toBe(true);
  });

  // ── AC-HAPPY-1: create ─────────────────────────────────────────────────────────────────────
  it('AC-HAPPY-1: POST creates a card with the documented shape and persists it', async () => {
    const res = await request(app)
      .post('/api/v1/boards/1/cards')
      .send({ title: 'Implement login' });

    expect(res.status).toBe(201);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body).toEqual({
      id: expect.any(Number),
      board_id: 1,
      title: 'Implement login',
      description: null,
      position: 0,
      created_at: expect.any(String),
      updated_at: expect.any(String),
    });
    expect(res.body.id).toBeGreaterThan(0);
    // Timestamps round-trip as ISO-8601.
    expect(new Date(res.body.created_at).toISOString()).toBe(res.body.created_at);

    // Persistence: reading it back by id returns the same card (not stub output).
    const readBack = await request(app).get(`/api/v1/boards/1/cards/${res.body.id}`);
    expect(readBack.status).toBe(200);
    expect(readBack.body).toEqual(res.body);
  });

  it('AC-HAPPY-1: two POSTs produce different ids (stub detection)', async () => {
    const first = await request(app).post('/api/v1/boards/1/cards').send({ title: 'A' });
    const second = await request(app).post('/api/v1/boards/1/cards').send({ title: 'B' });

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(first.body.id).not.toBe(second.body.id);
  });

  it('AC-HAPPY-1: accepts optional description and position', async () => {
    const res = await request(app)
      .post('/api/v1/boards/1/cards')
      .send({ title: 'Implement login', description: 'A description', position: 5 });

    expect(res.status).toBe(201);
    expect(res.body.description).toBe('A description');
    expect(res.body.position).toBe(5);
  });

  // ── pre-flight board existence ─────────────────────────────────────────────────────────────
  it('POST to a non-existent boardId → 404 and inserts no card', async () => {
    const res = await request(app).post('/api/v1/boards/999/cards').send({ title: 'Orphan' });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Not Found');
    expect(store.cards).toHaveLength(0);
  });

  // ── AC-HAPPY-2: list ───────────────────────────────────────────────────────────────────────
  it('AC-HAPPY-2: GET returns [] when empty, and reflects newly created cards', async () => {
    const empty = await request(app).get('/api/v1/boards/1/cards');
    expect(empty.status).toBe(200);
    expect(empty.body).toEqual([]);

    const created = await request(app).post('/api/v1/boards/1/cards').send({ title: 'Card 1' });
    const listed = await request(app).get('/api/v1/boards/1/cards');

    expect(listed.status).toBe(200);
    expect(listed.body).toHaveLength(1);
    expect(listed.body[0]).toEqual(created.body);
  });

  it('AC-HAPPY-2: list is scoped per board (card under board 1 absent when listing board 2)', async () => {
    await request(app).post('/api/v1/boards/1/cards').send({ title: 'On board 1' });
    await request(app).post('/api/v1/boards/2/cards').send({ title: 'On board 2' });

    const board1 = await request(app).get('/api/v1/boards/1/cards');
    const board2 = await request(app).get('/api/v1/boards/2/cards');

    expect(board1.body).toHaveLength(1);
    expect(board1.body[0].title).toBe('On board 1');
    expect(board1.body[0].board_id).toBe(1);
    expect(board2.body).toHaveLength(1);
    expect(board2.body[0].title).toBe('On board 2');
    expect(board2.body[0].board_id).toBe(2);
  });

  it('AC-HAPPY-2: cards are ordered by position ASC, id ASC', async () => {
    await request(app).post('/api/v1/boards/1/cards').send({ title: 'third', position: 2 });
    await request(app).post('/api/v1/boards/1/cards').send({ title: 'first', position: 0 });
    await request(app).post('/api/v1/boards/1/cards').send({ title: 'second', position: 1 });

    const listed = await request(app).get('/api/v1/boards/1/cards');
    expect(listed.body.map((c: { title: string }) => c.title)).toEqual(['first', 'second', 'third']);
  });

  // ── AC-HAPPY-3: read one ───────────────────────────────────────────────────────────────────
  it('AC-HAPPY-3: GET /:id returns the full card with values matching what was inserted', async () => {
    const created = await request(app)
      .post('/api/v1/boards/1/cards')
      .send({ title: 'Specific Title', description: 'Specific Desc', position: 3 });

    const res = await request(app).get(`/api/v1/boards/1/cards/${created.body.id}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: created.body.id,
      board_id: 1,
      title: 'Specific Title',
      description: 'Specific Desc',
      position: 3,
      created_at: expect.any(String),
      updated_at: expect.any(String),
    });
  });

  // ── AC-HAPPY-4: update ─────────────────────────────────────────────────────────────────────
  it('AC-HAPPY-4: PATCH updates the title durably and bumps updated_at', async () => {
    const created = await request(app).post('/api/v1/boards/1/cards').send({ title: 'Original' });

    const patched = await request(app)
      .patch(`/api/v1/boards/1/cards/${created.body.id}`)
      .send({ title: 'Renamed' });

    expect(patched.status).toBe(200);
    expect(patched.body.title).toBe('Renamed');
    expect(
      new Date(patched.body.updated_at).getTime(),
    ).toBeGreaterThanOrEqual(new Date(patched.body.created_at).getTime());

    // Durable: a subsequent read reflects the new title.
    const readBack = await request(app).get(`/api/v1/boards/1/cards/${created.body.id}`);
    expect(readBack.body.title).toBe('Renamed');
  });

  it('AC-HAPPY-4: PATCH can update position and clear description to null', async () => {
    const created = await request(app)
      .post('/api/v1/boards/1/cards')
      .send({ title: 'Has Desc', description: 'remove me', position: 0 });

    const patched = await request(app)
      .patch(`/api/v1/boards/1/cards/${created.body.id}`)
      .send({ description: null, position: 7 });

    expect(patched.status).toBe(200);
    expect(patched.body.description).toBeNull();
    expect(patched.body.position).toBe(7);
  });

  // ── AC-HAPPY-5: delete ─────────────────────────────────────────────────────────────────────
  it('AC-HAPPY-5: DELETE removes the card (204), and a subsequent GET is 404', async () => {
    const created = await request(app).post('/api/v1/boards/1/cards').send({ title: 'To Delete' });

    const del = await request(app).delete(`/api/v1/boards/1/cards/${created.body.id}`);
    expect(del.status).toBe(204);
    expect(del.body).toEqual({});

    const readBack = await request(app).get(`/api/v1/boards/1/cards/${created.body.id}`);
    expect(readBack.status).toBe(404);
  });

  // ── AC-ERROR-1: validation on POST (title) ─────────────────────────────────────────────────
  it('AC-ERROR-1: POST with missing title → 400 standard shape, no row inserted', async () => {
    const res = await request(app).post('/api/v1/boards/1/cards').send({});

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: 'Bad Request',
      path: '/api/v1/boards/1/cards',
      traceId: expect.any(String),
    });
    expect(store.cards).toHaveLength(0);
  });

  it('AC-ERROR-1: POST with empty-string title → 400, no row inserted', async () => {
    const res = await request(app).post('/api/v1/boards/1/cards').send({ title: '' });
    expect(res.status).toBe(400);
    expect(store.cards).toHaveLength(0);
  });

  it('AC-ERROR-1: POST with title > 255 chars → 400, no row inserted', async () => {
    const res = await request(app)
      .post('/api/v1/boards/1/cards')
      .send({ title: 'a'.repeat(256) });
    expect(res.status).toBe(400);
    expect(store.cards).toHaveLength(0);
  });

  // ── AC-ERROR-2: 404 for non-existent card ──────────────────────────────────────────────────
  it('AC-ERROR-2: GET / PATCH / DELETE on a non-existent card id → 404 standard shape, no leak', async () => {
    const getRes = await request(app).get('/api/v1/boards/1/cards/99999');
    expect(getRes.status).toBe(404);
    expect(getRes.body).toEqual({
      error: 'Not Found',
      path: '/api/v1/boards/1/cards/99999',
      traceId: expect.any(String),
    });

    const patchRes = await request(app)
      .patch('/api/v1/boards/1/cards/99999')
      .send({ title: 'X' });
    expect(patchRes.status).toBe(404);
    expect(patchRes.body.error).toBe('Not Found');

    const delRes = await request(app).delete('/api/v1/boards/1/cards/99999');
    expect(delRes.status).toBe(404);
    expect(delRes.body.error).toBe('Not Found');

    // No internal detail in any 404 body.
    for (const body of [getRes.body, patchRes.body, delRes.body]) {
      const serialized = JSON.stringify(body);
      expect(serialized).not.toMatch(/stack|at Object|node_modules|postgres|ECONN/i);
    }
  });

  // ── AC-ERROR-3: non-integer :id / :boardId ─────────────────────────────────────────────────
  it('AC-ERROR-3: GET with a non-integer :boardId → 400 before any DB query', async () => {
    const res = await request(app).get('/api/v1/boards/abc/cards');

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Bad Request');
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('AC-ERROR-3: GET /:id with a non-integer card :id → 400 before any DB query', async () => {
    const res = await request(app).get('/api/v1/boards/1/cards/xyz');

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Bad Request');
    expect(mockQuery).not.toHaveBeenCalled();
  });

  // ── AC-ERROR-4: PATCH empty body ───────────────────────────────────────────────────────────
  it('AC-ERROR-4: PATCH with {} → 400 and no DB update query', async () => {
    const created = await request(app).post('/api/v1/boards/1/cards').send({ title: 'Exists' });
    mockQuery.mockClear();

    const res = await request(app).patch(`/api/v1/boards/1/cards/${created.body.id}`).send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Bad Request');
    expect(mockQuery).not.toHaveBeenCalled();
  });

  // ── AC-ERROR-5: invalid position on POST ───────────────────────────────────────────────────
  it('AC-ERROR-5: POST with a negative position → 400, no row inserted', async () => {
    const res = await request(app)
      .post('/api/v1/boards/1/cards')
      .send({ title: 'X', position: -1 });
    expect(res.status).toBe(400);
    expect(store.cards).toHaveLength(0);
  });

  it('AC-ERROR-5: POST with a non-numeric position → 400, no row inserted', async () => {
    const res = await request(app)
      .post('/api/v1/boards/1/cards')
      .send({ title: 'X', position: 'top' });
    expect(res.status).toBe(400);
    expect(store.cards).toHaveLength(0);
  });

  // ── AC-OBS-1: no console.* ──────────────────────────────────────────────────────────────────
  it('AC-OBS-1: exercising the endpoints emits zero console.* calls', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    try {
      const created = await request(app).post('/api/v1/boards/1/cards').send({ title: 'Logged' });
      await request(app).get('/api/v1/boards/1/cards');
      await request(app).get(`/api/v1/boards/1/cards/${created.body.id}`);
      await request(app).patch(`/api/v1/boards/1/cards/${created.body.id}`).send({ title: 'Renamed' });
      await request(app).delete(`/api/v1/boards/1/cards/${created.body.id}`);
      await request(app).get('/api/v1/boards/1/cards/abc'); // a validation error path too

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

    const res = await request(app).get('/api/v1/boards/1/cards');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      error: 'Internal Server Error',
      traceId: expect.any(String),
    });
    expect(JSON.stringify(res.body)).not.toContain(secret);
  });
});
