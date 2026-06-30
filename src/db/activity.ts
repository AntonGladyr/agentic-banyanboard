/**
 * src/db/activity.ts — activity-event data-access layer (TASK-008 Phase 1).
 *
 * Parameterized read/write query functions over the `activity_events` table (created by the
 * Phase-1 migration), built on the lazy singleton `pg.Pool` from `./pool` (`getPool()`). Every
 * query uses bound parameters (`$1`, `$2`, …) — never string interpolation of caller data — so the
 * layer is SQL-injection-safe by construction (Security by Design). Mirrors `src/db/cards.ts`.
 *
 * This module performs NO validation and NO HTTP concerns: callers (the cards PATCH handler that
 * records moves, and the Phase-2 activity read router) validate input first and translate
 * results/absence into HTTP responses. `listByBoard` returns `[]` when no row matches.
 *
 * Activity events materialize the project's Domain Event Pattern: each row captures the before/after
 * state of a card move (`from_status` → `to_status`), the `actor` (the fixed 'anonymous' stub in v1
 * — see TASK-008 § Actor Identity), the `card_id`, and a `card_title` SNAPSHOT taken at move time.
 * The snapshot (and the deliberate absence of a FK on `card_id`) is what lets the feed stay readable
 * after the underlying card is renamed or deleted (AC-PERSIST-CARD-DELETE-1).
 *
 * Retention (Architecture creative Q4 / decision 4A): the STORE is unbounded in v1 (no pruning),
 * but the READ is bounded — `listByBoard` applies `LIMIT 200` and is backed by the
 * `(board_id, occurred_at DESC, id DESC)` index so the read NFR (p95 < 150 ms) holds regardless of
 * total table size. Forward-compatible with a later time-based purge against the indexed
 * `occurred_at` (no schema change).
 *
 * `occurred_at` comes back from pg as a JavaScript `Date` (timestamptz); `res.json` serializes it to
 * an ISO-8601 string, matching the API response shape in the spec.
 */

import { getPool } from './pool';

/** The read bound applied to `listByBoard` (retention decision 4A — bound the read, not the store). */
const ACTIVITY_READ_LIMIT = 200;

/** An activity-event row as stored/returned by the database. */
export interface ActivityEvent {
  readonly id: number;
  readonly board_id: number;
  readonly card_id: number;
  readonly card_title: string;
  readonly from_status: string;
  readonly to_status: string;
  readonly actor: string;
  readonly occurred_at: Date;
}

/**
 * Fields accepted when recording an activity event. `actor` is optional — when omitted the column
 * default ('anonymous') applies via COALESCE, keeping the schema forward-compatible for when auth
 * lands (TASK-008 § Actor Identity). `occurred_at` is server-assigned (column default `now()`).
 */
export interface InsertActivityParams {
  readonly board_id: number;
  readonly card_id: number;
  readonly card_title: string;
  readonly from_status: string;
  readonly to_status: string;
  readonly actor?: string;
}

/** Column list returned by every read/RETURNING clause — keeps the API row shape consistent. */
const RETURNING_COLUMNS =
  'id, board_id, card_id, card_title, from_status, to_status, actor, occurred_at';

/**
 * Insert an activity event and return the created row (id and server-assigned `occurred_at`
 * populated). `actor` falls back to 'anonymous' via COALESCE when not supplied.
 */
export async function insert(params: InsertActivityParams): Promise<ActivityEvent> {
  const result = await getPool().query<ActivityEvent>(
    `INSERT INTO activity_events
       (board_id, card_id, card_title, from_status, to_status, actor)
     VALUES ($1, $2, $3, $4, $5, COALESCE($6, 'anonymous'))
     RETURNING ${RETURNING_COLUMNS}`,
    [
      params.board_id,
      params.card_id,
      params.card_title,
      params.from_status,
      params.to_status,
      params.actor,
    ],
  );
  const row = result.rows[0];
  if (row === undefined) {
    // INSERT ... RETURNING always yields exactly one row; absence indicates a driver/DB fault.
    throw new Error('INSERT into activity_events returned no row');
  }
  return row;
}

/**
 * Return a board's activity events ordered `occurred_at DESC, id DESC` (newest first), capped at
 * `ACTIVITY_READ_LIMIT`. The `id DESC` tie-break orders events deterministically when two share an
 * `occurred_at`. Empty array when none exist — never an error. Scopes results to the given
 * `boardId` so events from other boards never leak (AC-SCOPED-1).
 */
export async function listByBoard(boardId: number): Promise<ActivityEvent[]> {
  const result = await getPool().query<ActivityEvent>(
    `SELECT ${RETURNING_COLUMNS} FROM activity_events
     WHERE board_id = $1
     ORDER BY occurred_at DESC, id DESC
     LIMIT ${ACTIVITY_READ_LIMIT}`,
    [boardId],
  );
  return result.rows;
}
