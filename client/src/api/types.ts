/**
 * client/src/api/types.ts — shared API contract types (TASK-006 Phase 2).
 *
 * These mirror the backend row shapes returned by the Express CRUD API so the SPA consumes the
 * API in a type-safe way. They are the FRONTEND'S view of the contract — timestamps arrive as
 * ISO-8601 strings (the backend returns `Date` objects which `res.json` serializes to strings),
 * NOT as JS `Date`s. Keep these in sync with `src/db/boards.ts` (Board) and `src/db/cards.ts`
 * (Card, CardStatus) on the backend.
 */

/**
 * The three kanban columns a card can belong to. Single source of truth on the backend is
 * `src/validation/card.ts`; this union mirrors it for the read-only frontend (TASK-006 Phase 1
 * added the backing `status` column).
 */
export type CardStatus = 'todo' | 'in_progress' | 'done';

/** The ordered set of statuses, useful for partitioning cards into columns left-to-right. */
export const CARD_STATUSES: readonly CardStatus[] = ['todo', 'in_progress', 'done'];

/** A board as returned by `GET /api/v1/boards` and `GET /api/v1/boards/:id`. */
export interface Board {
  readonly id: number;
  readonly name: string;
  readonly description: string | null;
  /** ISO-8601 timestamp string (serialized from the backend `timestamptz`). */
  readonly created_at: string;
  /** ISO-8601 timestamp string. */
  readonly updated_at: string;
}

/** A card as returned by `GET /api/v1/boards/:boardId/cards`. */
export interface Card {
  readonly id: number;
  readonly board_id: number;
  readonly title: string;
  readonly description: string | null;
  readonly position: number;
  readonly status: CardStatus;
  /** ISO-8601 timestamp string. */
  readonly created_at: string;
  /** ISO-8601 timestamp string. */
  readonly updated_at: string;
}
