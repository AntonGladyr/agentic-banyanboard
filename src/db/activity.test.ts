/**
 * src/db/activity.test.ts — unit tests for the activity-event DAL (TASK-008 Phase 1).
 *
 * Target contract (written test-first per TDD; src/db/activity.ts is implemented to satisfy these):
 *
 *   - insert(params): Promise<ActivityEvent>
 *       INSERTs one row into `activity_events` with bound parameters only (no string
 *       interpolation of caller data) and RETURNs the created row (id + server-assigned
 *       `occurred_at` populated). `actor` defaults to 'anonymous' when omitted (COALESCE on
 *       the bound param so the column default also applies). `card_title` is the caller-supplied
 *       snapshot (NOT a FK) so the row survives card rename/deletion.
 *
 *   - listByBoard(boardId): Promise<ActivityEvent[]>
 *       SELECTs the board's events ordered `occurred_at DESC, id DESC` with a `LIMIT 200`
 *       read bound (retention decision 4A — bound the read, not the store). Scopes strictly to
 *       `board_id = $1`; returns `[]` when none.
 *
 * ── Why an in-memory fake behind the mocked seam ───────────────────────────────────────────
 * Per systemPatterns.md § Testing Patterns and the cards-route precedent we mock at the module
 * seam (`src/db/pool.ts`) — no live PostgreSQL in the Jest run (the real migration round-trip is
 * exercised by the integration suite per Phase 1). The mocked `getPool().query` is backed by a
 * tiny in-memory store that interprets the exact SQL emitted by `src/db/activity.ts`, making the
 * ordering / board-scoping / snapshot-survives-delete / actor-default assertions meaningful.
 */

// ── Mock the DB seam (src/db/pool.ts) ──────────────────────────────────────────────────────
// A single `mockQuery` jest.fn backs `getPool().query`; the in-memory `store` is reset per test.
const mockQuery = jest.fn();

jest.mock('./pool', () => ({
  getPool: (): { query: typeof mockQuery } => ({ query: mockQuery }),
}));

import { insert, listByBoard, type ActivityEvent } from './activity';

/** A row as the fake store holds it (occurred_at is a Date, like pg returns for timestamptz). */
interface FakeActivityRow {
  id: number;
  board_id: number;
  card_id: number;
  card_title: string;
  from_status: string;
  to_status: string;
  actor: string;
  occurred_at: Date;
}

const store: { rows: FakeActivityRow[]; nextId: number } = { rows: [], nextId: 1 };

/**
 * Minimal SQL interpreter standing in for `pg.Pool.query`. Recognizes the INSERT and SELECT
 * statements emitted by `src/db/activity.ts`, operating on the in-memory `store`. Returns the
 * `{ rows, rowCount }` shape pg produces. The INSERT honors COALESCE($6, 'anonymous') for actor.
 */
function installInterpreter(): void {
  mockQuery.mockImplementation(
    async (sql: string, params: unknown[] = []): Promise<{ rows: unknown[]; rowCount: number }> => {
      const text = sql.trim();

      if (text.startsWith('INSERT INTO activity_events')) {
        const row: FakeActivityRow = {
          id: store.nextId++,
          board_id: params[0] as number,
          card_id: params[1] as number,
          card_title: params[2] as string,
          from_status: params[3] as string,
          to_status: params[4] as string,
          // Mirrors COALESCE($6, 'anonymous'): null/undefined bound value falls back to the default.
          actor: (params[5] ?? 'anonymous') as string,
          occurred_at: new Date(),
        };
        store.rows.push(row);
        return { rows: [row], rowCount: 1 };
      }

      // listByBoard: SELECT ... FROM activity_events WHERE board_id = $1
      //              ORDER BY occurred_at DESC, id DESC LIMIT 200
      if (
        text.startsWith('SELECT') &&
        /FROM activity_events/.test(text) &&
        /WHERE board_id = \$1/.test(text)
      ) {
        const boardId = params[0] as number;
        const ordered = store.rows
          .filter((r) => r.board_id === boardId)
          .sort(
            (a, b) => b.occurred_at.getTime() - a.occurred_at.getTime() || b.id - a.id,
          )
          .slice(0, 200);
        return { rows: ordered, rowCount: ordered.length };
      }

      throw new Error(`Unrecognized SQL in activity DAL test: ${text}`);
    },
  );
}

const baseInsert = {
  board_id: 1,
  card_id: 10,
  card_title: 'Fix login redirect bug',
  from_status: 'todo',
  to_status: 'in_progress',
};

describe('db/activity', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    store.rows = [];
    store.nextId = 1;
    installInterpreter();
  });

  // ── insert() ─────────────────────────────────────────────────────────────────────────────

  it('insert() returns the created row with id, occurred_at, and all snapshot fields', async () => {
    const row = await insert(baseInsert);

    expect(row.id).toBeGreaterThan(0);
    expect(row.board_id).toBe(1);
    expect(row.card_id).toBe(10);
    expect(row.card_title).toBe('Fix login redirect bug');
    expect(row.from_status).toBe('todo');
    expect(row.to_status).toBe('in_progress');
    expect(row.occurred_at).toBeInstanceOf(Date);
  });

  it('insert() defaults actor to "anonymous" when not supplied', async () => {
    const row = await insert(baseInsert);
    expect(row.actor).toBe('anonymous');
  });

  it('insert() persists an explicitly supplied actor (forward-compatible with auth)', async () => {
    const row = await insert({ ...baseInsert, actor: 'alex' });
    expect(row.actor).toBe('alex');
  });

  it('insert() uses bound parameters only (no caller data interpolated into SQL)', async () => {
    await insert(baseInsert);
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/\$1/);
    expect(sql).not.toContain('Fix login redirect bug'); // value travels as a bound param, not inline
    expect(params).toEqual([1, 10, 'Fix login redirect bug', 'todo', 'in_progress', undefined]);
  });

  // ── listByBoard() ────────────────────────────────────────────────────────────────────────

  it('listByBoard() returns [] when the board has no activity', async () => {
    const rows = await listByBoard(999);
    expect(rows).toEqual([]);
  });

  it('listByBoard() returns events newest-first (occurred_at DESC, id DESC tie-break)', async () => {
    const first = await insert(baseInsert);
    const second = await insert({ ...baseInsert, card_id: 11, to_status: 'done', from_status: 'in_progress' });
    const third = await insert({ ...baseInsert, card_id: 12 });

    const rows = await listByBoard(1);
    const ids = rows.map((r: ActivityEvent) => r.id);
    // Inserted first, second, third → newest-first should be third, second, first.
    expect(ids).toEqual([third.id, second.id, first.id]);
  });

  it('listByBoard() is board-scoped — events from other boards do not appear (AC-SCOPED-1)', async () => {
    await insert({ ...baseInsert, board_id: 1, card_id: 10 });
    await insert({ ...baseInsert, board_id: 2, card_id: 20 });

    const board1 = await listByBoard(1);
    const board2 = await listByBoard(2);

    expect(board1.every((r: ActivityEvent) => r.board_id === 1)).toBe(true);
    expect(board2.every((r: ActivityEvent) => r.board_id === 2)).toBe(true);
    expect(board1).toHaveLength(1);
    expect(board2).toHaveLength(1);
  });

  it('listByBoard() bounds the read with LIMIT 200 (retention 4A — bound read, not store)', async () => {
    await listByBoard(1);
    const [sql] = mockQuery.mock.calls[0] as [string];
    expect(sql).toMatch(/ORDER BY occurred_at DESC, id DESC/i);
    expect(sql).toMatch(/LIMIT 200/i);
  });

  it('listByBoard() returns the card_title snapshot intact after the card would be deleted (AC-PERSIST-CARD-DELETE-1)', async () => {
    // The DAL stores card_title as a snapshot (no FK to cards). Deleting the card never touches
    // activity_events, so the recorded title remains readable. Modelled here: the row is present
    // and its title is the snapshot, independent of any cards table.
    await insert({ ...baseInsert, card_id: 77, card_title: 'Card that will be deleted' });
    const rows = await listByBoard(1);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.card_id).toBe(77);
    expect(rows[0]!.card_title).toBe('Card that will be deleted');
  });
});
