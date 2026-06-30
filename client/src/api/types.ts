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

/**
 * An activity event as returned by `GET /api/v1/boards/:boardId/activity` and carried on the
 * `activity:card_moved` SSE event (TASK-008 Phase 3). Mirrors the backend `ActivityEvent` row
 * (`src/db/activity.ts`); `occurred_at` arrives as an ISO-8601 string (the backend `Date` is
 * serialized by `res.json` / the SSE `data:` JSON), NOT a JS `Date`. `card_title` is a snapshot
 * taken at move time so the feed stays readable after the card is renamed or deleted.
 */
export interface ActivityEvent {
  readonly id: number;
  readonly board_id: number;
  readonly card_id: number;
  /** Card title snapshot at the moment of the move (survives later rename/deletion). */
  readonly card_title: string;
  /** Source column status (`'todo' | 'in_progress' | 'done'` — typed loosely to match the row). */
  readonly from_status: string;
  /** Target column status. */
  readonly to_status: string;
  /** The fixed `'anonymous'` stub in v1 (TASK-008 § Actor Identity). */
  readonly actor: string;
  /** ISO-8601 timestamp string (server-assigned). */
  readonly occurred_at: string;
}

// ─── Write-side input types (TASK-007 Phase 1) ────────────────────────────────
//
// These are the FRONTEND's write-side contract, mirroring the backend validators
// (`src/validation/board.ts` and `src/validation/card.ts`). Fields the user may
// omit are optional. Keep in sync with the backend if new required fields are
// added to the validators.

/** Input for `POST /api/v1/boards` — create a new board. */
export interface CreateBoardInput {
  /** Board display name (required). */
  readonly name: string;
  /** Optional freeform description; `null` clears an existing value. */
  readonly description?: string | null;
}

/** Input for `PATCH /api/v1/boards/:id` — partial update of a board. */
export interface UpdateBoardInput {
  /** New display name; omit to leave unchanged. */
  readonly name?: string;
  /** New description; `null` clears; omit to leave unchanged. */
  readonly description?: string | null;
}

/** Input for `POST /api/v1/boards/:boardId/cards` — create a new card. */
export interface CreateCardInput {
  /** Card title (required). */
  readonly title: string;
  /** Optional freeform description; `null` clears an existing value. */
  readonly description?: string | null;
  /** Initial kanban status; defaults to `'todo'` when omitted. */
  readonly status?: CardStatus;
  /** Initial sort position; backend assigns one when omitted. */
  readonly position?: number;
}

/** Input for `PATCH /api/v1/boards/:boardId/cards/:id` — partial update of a card. */
export interface UpdateCardInput {
  /** New card title; omit to leave unchanged. */
  readonly title?: string;
  /** New description; `null` clears; omit to leave unchanged. */
  readonly description?: string | null;
  /** New kanban status; omit to leave unchanged. */
  readonly status?: CardStatus;
  /** New sort position; omit to leave unchanged. */
  readonly position?: number;
}

// ─── Real-time event contract (TASK-007 Phase 5) ──────────────────────────────
//
// The frontend's view of the SSE event envelope the backend broadcasts (mirrors
// `src/realtime/events.ts`). Each event carries the FULL updated entity so the
// subscription hook swaps it into local state by `id`. Timestamps are ISO strings here
// (the backend `Date`s are serialized by `res.json` / the SSE `data:` JSON).

/** The set of mutations pushed to a board's subscribers. */
export type RealtimeEventType =
  | 'card:created'
  | 'card:updated'
  | 'card:deleted'
  | 'board:updated'
  | 'activity:card_moved'; // TASK-008 — a recorded card move (no originId; delivered to ALL tabs)

interface RealtimeEventBase {
  readonly type: RealtimeEventType;
  readonly boardId: number;
  /** Origin token of the mutating tab, echoed back so that tab can drop its own event (echo de-dup). */
  readonly originId?: string;
  /** Server-side emission timestamp (ISO-8601). */
  readonly emittedAt: string;
  /** Trace id of the originating request (diagnostic only — never surfaced to the user). */
  readonly traceId?: string;
}

/** A card create/update/delete event carrying the full card entity. */
export interface CardRealtimeEvent extends RealtimeEventBase {
  readonly type: 'card:created' | 'card:updated' | 'card:deleted';
  readonly card: Card;
}

/** A board update event carrying the full board entity. */
export interface BoardRealtimeEvent extends RealtimeEventBase {
  readonly type: 'board:updated';
  readonly board: Board;
}

/**
 * A recorded card move (TASK-008) carrying the full persisted activity row. Deliberately has NO
 * `originId` (mirrors `src/realtime/events.ts` `ActivityCardMovedEvent`): unlike `card:updated`,
 * the originating tab MUST see its own activity entry appear in the feed (AC-HAPPY-2.2), so the
 * echo-drop in `useRealtimeBoard` never suppresses it.
 */
export interface ActivityRealtimeEvent extends RealtimeEventBase {
  readonly type: 'activity:card_moved';
  readonly activity: ActivityEvent;
}

/** Any board-scoped real-time event (the parsed SSE `data:` payload). */
export type RealtimeEvent = CardRealtimeEvent | BoardRealtimeEvent | ActivityRealtimeEvent;
