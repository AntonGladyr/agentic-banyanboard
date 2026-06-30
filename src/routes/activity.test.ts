/**
 * src/routes/activity.test.ts — integration tests for the activity-feed read slice (TASK-008 Phase 2).
 *
 * Exercises `GET /api/v1/boards/:boardId/activity` through the real Express stack
 * (`supertest(createApp())`) with the DB seam mocked at `src/db/pool.ts` (systemPatterns § Testing
 * Patterns) — no live PostgreSQL in the Jest run. Per the Test Strategy (§ Per-Phase Test Guidance,
 * Phase 2) this covers:
 *   - AC-HAPPY-3 ...... 200 application/json; body is the board's events ordered occurred_at DESC,
 *                       id DESC (newest-first); each object carries the documented shape with
 *                       occurred_at as an ISO-8601 string; count + ordering match what was recorded
 *   - AC-EMPTY ........ a board with no activity → 200 []
 *   - AC-SCOPED-1 ..... only events with board_id = the requested board are returned (no leak)
 *   - AC-ERROR-1 ...... a non-existent board → 404 standard {error, path, traceId} shape, no leak
 *   - AC-ERROR-2 ...... a non-integer :boardId → 400 before any activity query
 *
 * ── Why an in-memory fake behind the mocked seam ───────────────────────────────────────────
 * The mocked `getPool().query` is backed by a tiny in-memory store interpreting the SQL emitted by
 * the board `findById` (pre-flight existence check the activity router performs) and by
 * `src/db/activity.ts`'s `listByBoard` (SELECT … WHERE board_id = $1 ORDER BY occurred_at DESC,
 * id DESC LIMIT 200). Modelling both makes the ordering / board-scoping / 404-pre-flight ACs
 * meaningful against the real router + DAL code paths.
 */

import request from 'supertest';
import { createApp } from '../app';

/** A board row — only the columns the pre-flight `findById(boardId)` reads matter here. */
interface FakeBoard {
  id: number;
  name: string;
  description: string | null;
  created_at: Date;
  updated_at: Date;
}

/** An activity-event row as the fake store holds it (occurred_at is a Date, like pg's timestamptz). */
interface FakeActivity {
  id: number;
  board_id: number;
  card_id: number;
  card_title: string;
  from_status: string;
  to_status: string;
  actor: string;
  occurred_at: Date;
}

const store: { boards: FakeBoard[]; activity: FakeActivity[] } = { boards: [], activity: [] };

function seedBoard(id: number): void {
  const now = new Date();
  store.boards.push({ id, name: `Board ${id}`, description: null, created_at: now, updated_at: now });
}

/** Seed an activity row directly (the recording path is covered in cards.test.ts / mutationBroadcast). */
function seedActivity(row: Partial<FakeActivity> & { id: number; board_id: number; occurred_at: Date }): void {
  store.activity.push({
    card_id: 1,
    card_title: 'Card',
    from_status: 'todo',
    to_status: 'in_progress',
    actor: 'anonymous',
    ...row,
  });
}

/** Minimal SQL interpreter standing in for `pg.Pool.query` over the in-memory store. */
const mockQuery = jest.fn(
  async (sql: string, params: unknown[] = []): Promise<{ rows: unknown[]; rowCount: number }> => {
    const text = sql.trim();

    // Pre-flight board existence: ... FROM boards WHERE id = $1.
    if (text.startsWith('SELECT') && /FROM boards/.test(text) && /WHERE id = \$1/.test(text)) {
      const found = store.boards.find((b) => b.id === (params[0] as number));
      return { rows: found ? [found] : [], rowCount: found ? 1 : 0 };
    }

    // listByBoard: ... FROM activity_events WHERE board_id = $1 ORDER BY occurred_at DESC, id DESC LIMIT 200.
    if (
      text.startsWith('SELECT') &&
      /FROM activity_events/.test(text) &&
      /WHERE board_id = \$1/.test(text)
    ) {
      const boardId = params[0] as number;
      const rows = store.activity
        .filter((a) => a.board_id === boardId)
        .sort((a, b) => b.occurred_at.getTime() - a.occurred_at.getTime() || b.id - a.id)
        .slice(0, 200);
      return { rows, rowCount: rows.length };
    }

    throw new Error(`fake pool received an unexpected query: ${text}`);
  },
);

jest.mock('../db/pool', () => ({
  __esModule: true,
  getPool: () => ({ query: mockQuery }),
  checkConnection: jest.fn(),
}));

const app = createApp();

describe('activity read slice (integration, mocked pool seam)', () => {
  beforeEach(() => {
    store.boards = [];
    store.activity = [];
    mockQuery.mockClear();
    seedBoard(1);
    seedBoard(2);
  });

  // ── AC-EMPTY ────────────────────────────────────────────────────────────────────────────────
  it('GET returns 200 application/json with [] when the board has no activity', async () => {
    const res = await request(app).get('/api/v1/boards/1/activity');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body).toEqual([]);
  });

  // ── AC-HAPPY-3 ────────────────────────────────────────────────────────────────────────────────
  it('AC-HAPPY-3: GET returns the board events newest-first with the documented shape', async () => {
    const t0 = new Date('2026-06-30T10:00:00.000Z');
    const t1 = new Date('2026-06-30T10:01:00.000Z');
    const t2 = new Date('2026-06-30T10:02:00.000Z');
    seedActivity({ id: 1, board_id: 1, card_id: 10, card_title: 'A', from_status: 'todo', to_status: 'in_progress', occurred_at: t0 });
    seedActivity({ id: 2, board_id: 1, card_id: 11, card_title: 'B', from_status: 'in_progress', to_status: 'done', occurred_at: t1 });
    seedActivity({ id: 3, board_id: 1, card_id: 12, card_title: 'C', from_status: 'todo', to_status: 'done', occurred_at: t2 });

    const res = await request(app).get('/api/v1/boards/1/activity');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    // Newest-first: t2 (id 3), t1 (id 2), t0 (id 1).
    expect(res.body.map((e: { id: number }) => e.id)).toEqual([3, 2, 1]);

    // Documented object shape; occurred_at round-trips as ISO-8601.
    const newest = res.body[0];
    expect(newest).toEqual({
      id: 3,
      board_id: 1,
      card_id: 12,
      card_title: 'C',
      from_status: 'todo',
      to_status: 'done',
      actor: 'anonymous',
      occurred_at: t2.toISOString(),
    });
    expect(new Date(newest.occurred_at).toISOString()).toBe(newest.occurred_at);
  });

  it('AC-HAPPY-3: id DESC breaks ties when two events share an occurred_at', async () => {
    const t = new Date('2026-06-30T12:00:00.000Z');
    seedActivity({ id: 5, board_id: 1, occurred_at: t });
    seedActivity({ id: 6, board_id: 1, occurred_at: t });

    const res = await request(app).get('/api/v1/boards/1/activity');
    expect(res.body.map((e: { id: number }) => e.id)).toEqual([6, 5]);
  });

  // ── AC-SCOPED-1 ──────────────────────────────────────────────────────────────────────────────
  it('AC-SCOPED-1: only the requested board\'s events are returned (board 2 absent from board 1)', async () => {
    seedActivity({ id: 1, board_id: 1, card_id: 10, occurred_at: new Date('2026-06-30T10:00:00Z') });
    seedActivity({ id: 2, board_id: 2, card_id: 20, occurred_at: new Date('2026-06-30T10:00:00Z') });

    const board1 = await request(app).get('/api/v1/boards/1/activity');
    const board2 = await request(app).get('/api/v1/boards/2/activity');

    expect(board1.body).toHaveLength(1);
    expect(board1.body[0].board_id).toBe(1);
    expect(board2.body).toHaveLength(1);
    expect(board2.body[0].board_id).toBe(2);
  });

  // ── AC-ERROR-1 ───────────────────────────────────────────────────────────────────────────────
  it('AC-ERROR-1: a non-existent board → 404 standard shape, no internal detail', async () => {
    const res = await request(app).get('/api/v1/boards/99999/activity');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: 'Not Found',
      path: '/api/v1/boards/99999/activity',
      traceId: expect.any(String),
    });
    expect(JSON.stringify(res.body)).not.toMatch(/stack|at Object|node_modules|postgres|ECONN/i);
  });

  // ── AC-ERROR-2 ───────────────────────────────────────────────────────────────────────────────
  it('AC-ERROR-2: a non-integer :boardId → 400 before any DB query', async () => {
    const res = await request(app).get('/api/v1/boards/abc/activity');

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Bad Request');
    expect(mockQuery).not.toHaveBeenCalled();
  });
});
