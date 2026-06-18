/**
 * src/db/boards.ts — board data-access layer (TASK-004 Phase 2).
 *
 * Parameterized CRUD query functions over the `boards` table (created by the Phase-1 migration),
 * built on the lazy singleton `pg.Pool` from `./pool` (`getPool()`). Every query uses bound
 * parameters (`$1`, `$2`, …) — never string interpolation of caller data — so the layer is
 * SQL-injection-safe by construction (Security by Design).
 *
 * This module performs NO validation and NO HTTP concerns: callers (Phase-3 route handlers)
 * validate input first (src/validation/board.ts) and translate results/absence into HTTP
 * responses. Read/look-ups return `null` when no row matches; `remove` returns whether a row was
 * deleted — letting handlers map "not found" to a 404 without leaking DB detail.
 *
 * Timestamps come back from pg as JavaScript `Date` objects (timestamptz); `res.json` serializes
 * them to ISO-8601 strings, matching the API response shapes in the spec.
 */

import { getPool } from './pool';

/** A board row as stored/returned by the database. */
export interface Board {
  readonly id: number;
  readonly name: string;
  readonly description: string | null;
  readonly created_at: Date;
  readonly updated_at: Date;
}

/** Fields accepted when inserting a board (validated upstream). */
export interface CreateBoardParams {
  readonly name: string;
  readonly description: string | null;
}

/** Fields accepted when updating a board (validated upstream; at least one present). */
export interface UpdateBoardParams {
  readonly name?: string;
  readonly description?: string | null;
}

/** Column list returned by every read/RETURNING clause — keeps the API row shape consistent. */
const RETURNING_COLUMNS = 'id, name, description, created_at, updated_at';

/** Insert a board and return the created row (id and server-managed timestamps populated). */
export async function create(params: CreateBoardParams): Promise<Board> {
  const result = await getPool().query<Board>(
    `INSERT INTO boards (name, description) VALUES ($1, $2) RETURNING ${RETURNING_COLUMNS}`,
    [params.name, params.description],
  );
  const row = result.rows[0];
  if (row === undefined) {
    // INSERT ... RETURNING always yields exactly one row; absence indicates a driver/DB fault.
    throw new Error('INSERT into boards returned no row');
  }
  return row;
}

/** Return all boards ordered by id ascending (empty array when none exist — never an error). */
export async function list(): Promise<Board[]> {
  const result = await getPool().query<Board>(
    `SELECT ${RETURNING_COLUMNS} FROM boards ORDER BY id ASC`,
  );
  return result.rows;
}

/** Return the board with the given id, or `null` if no such row exists. */
export async function findById(id: number): Promise<Board | null> {
  const result = await getPool().query<Board>(
    `SELECT ${RETURNING_COLUMNS} FROM boards WHERE id = $1`,
    [id],
  );
  return result.rows[0] ?? null;
}

/**
 * Update the provided fields of a board and return the updated row, or `null` if no board with
 * the given id exists. `updated_at` is always bumped to `NOW()`. The SET clause is built only
 * from a fixed set of recognized columns with bound parameter placeholders — caller values are
 * never interpolated into SQL.
 */
export async function update(id: number, params: UpdateBoardParams): Promise<Board | null> {
  const assignments: string[] = [];
  const values: unknown[] = [];

  if (params.name !== undefined) {
    values.push(params.name);
    assignments.push(`name = $${values.length}`);
  }
  if (params.description !== undefined) {
    values.push(params.description);
    assignments.push(`description = $${values.length}`);
  }
  // Always refresh the server-managed update timestamp.
  assignments.push('updated_at = NOW()');

  values.push(id);
  const result = await getPool().query<Board>(
    `UPDATE boards SET ${assignments.join(', ')} WHERE id = $${values.length} RETURNING ${RETURNING_COLUMNS}`,
    values,
  );
  return result.rows[0] ?? null;
}

/** Delete the board with the given id. Returns `true` if a row was deleted, `false` otherwise. */
export async function remove(id: number): Promise<boolean> {
  const result = await getPool().query('DELETE FROM boards WHERE id = $1', [id]);
  return (result.rowCount ?? 0) > 0;
}
