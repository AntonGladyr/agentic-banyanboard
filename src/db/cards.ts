/**
 * src/db/cards.ts — card data-access layer (TASK-005 Phase 2).
 *
 * Parameterized CRUD query functions over the `cards` table (created by the Phase-1 migration),
 * built on the lazy singleton `pg.Pool` from `./pool` (`getPool()`). Every query uses bound
 * parameters (`$1`, `$2`, …) — never string interpolation of caller data — so the layer is
 * SQL-injection-safe by construction (Security by Design). Mirrors `src/db/boards.ts`.
 *
 * This module performs NO validation and NO HTTP concerns: callers (Phase-3 route handlers)
 * validate input first (src/validation/card.ts) and translate results/absence into HTTP
 * responses. Read/look-ups return `null` when no row matches; `remove` returns whether a row was
 * deleted — letting handlers map "not found" to a 404 without leaking DB detail.
 *
 * Cards are a child resource of boards: `board_id` (NOT NULL FK, ON DELETE CASCADE) scopes every
 * card to a single board. `listByBoard` filters by `board_id`; the route layer additionally
 * verifies board existence (pre-flight check) before `create`.
 *
 * Timestamps come back from pg as JavaScript `Date` objects (timestamptz); `res.json` serializes
 * them to ISO-8601 strings, matching the API response shapes in the spec.
 */

import { getPool } from './pool';

/** A card row as stored/returned by the database. */
export interface Card {
  readonly id: number;
  readonly board_id: number;
  readonly title: string;
  readonly description: string | null;
  readonly position: number;
  readonly created_at: Date;
  readonly updated_at: Date;
}

/** Fields accepted when inserting a card (validated upstream; `board_id` from the path param). */
export interface CreateCardParams {
  readonly board_id: number;
  readonly title: string;
  readonly description: string | null;
  readonly position: number;
}

/** Fields accepted when updating a card (validated upstream; at least one present). */
export interface UpdateCardParams {
  readonly title?: string;
  readonly description?: string | null;
  readonly position?: number;
}

/** Column list returned by every read/RETURNING clause — keeps the API row shape consistent. */
const RETURNING_COLUMNS = 'id, board_id, title, description, position, created_at, updated_at';

/** Insert a card and return the created row (id and server-managed timestamps populated). */
export async function create(params: CreateCardParams): Promise<Card> {
  const result = await getPool().query<Card>(
    `INSERT INTO cards (board_id, title, description, position)
     VALUES ($1, $2, $3, $4) RETURNING ${RETURNING_COLUMNS}`,
    [params.board_id, params.title, params.description, params.position],
  );
  const row = result.rows[0];
  if (row === undefined) {
    // INSERT ... RETURNING always yields exactly one row; absence indicates a driver/DB fault.
    throw new Error('INSERT into cards returned no row');
  }
  return row;
}

/**
 * Return all cards for a board ordered by `position ASC, id ASC` (empty array when none exist —
 * never an error). Scopes results to the given `boardId` so cards from other boards never leak.
 */
export async function listByBoard(boardId: number): Promise<Card[]> {
  const result = await getPool().query<Card>(
    `SELECT ${RETURNING_COLUMNS} FROM cards WHERE board_id = $1 ORDER BY position ASC, id ASC`,
    [boardId],
  );
  return result.rows;
}

/** Return the card with the given id, or `null` if no such row exists. */
export async function findById(id: number): Promise<Card | null> {
  const result = await getPool().query<Card>(
    `SELECT ${RETURNING_COLUMNS} FROM cards WHERE id = $1`,
    [id],
  );
  return result.rows[0] ?? null;
}

/**
 * Update the provided fields of a card and return the updated row, or `null` if no card with the
 * given id exists. `updated_at` is always bumped to `NOW()`. The SET clause is built only from a
 * fixed set of recognized columns with bound parameter placeholders — caller values are never
 * interpolated into SQL.
 */
export async function update(id: number, params: UpdateCardParams): Promise<Card | null> {
  const assignments: string[] = [];
  const values: unknown[] = [];

  if (params.title !== undefined) {
    values.push(params.title);
    assignments.push(`title = $${values.length}`);
  }
  if (params.description !== undefined) {
    values.push(params.description);
    assignments.push(`description = $${values.length}`);
  }
  if (params.position !== undefined) {
    values.push(params.position);
    assignments.push(`position = $${values.length}`);
  }
  // Always refresh the server-managed update timestamp.
  assignments.push('updated_at = NOW()');

  values.push(id);
  const result = await getPool().query<Card>(
    `UPDATE cards SET ${assignments.join(', ')} WHERE id = $${values.length} RETURNING ${RETURNING_COLUMNS}`,
    values,
  );
  return result.rows[0] ?? null;
}

/** Delete the card with the given id. Returns `true` if a row was deleted, `false` otherwise. */
export async function remove(id: number): Promise<boolean> {
  const result = await getPool().query('DELETE FROM cards WHERE id = $1', [id]);
  return (result.rowCount ?? 0) > 0;
}
