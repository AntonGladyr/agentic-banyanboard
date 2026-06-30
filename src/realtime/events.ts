/**
 * src/realtime/events.ts — the board-scoped real-time event contract (TASK-007 Phase 5).
 *
 * This is the shared envelope the backend emits over SSE and the frontend's `useRealtimeBoard`
 * consumes (Architecture Decision 2 — full-entity, board-scoped events). Each event carries the FULL
 * updated entity so a subscriber can swap it into local state by `id` (satisfying AC-REALTIME-1's
 * "only the moved card changes" stub-detection without delta/merge complexity).
 *
 * The frontend mirrors these shapes in `client/src/api/types.ts` (timestamps arrive there as ISO
 * strings — `res.json` serializes the `Date`s below). Keep the two in sync.
 */

import type { Card } from '../db/cards';
import type { Board } from '../db/boards';
import type { ActivityEvent } from '../db/activity';

/** The set of mutations broadcast to a board's subscribers. */
export type RealtimeEventType =
  | 'card:created'
  | 'card:updated' // covers card edit AND drag-and-drop status change
  | 'card:deleted' // emitted by the DELETE path for multi-tab correctness (UI delete is out of scope)
  | 'board:updated'
  | 'activity:card_moved'; // TASK-008 — a recorded card move, delivered to ALL tabs (no echo de-dup)

interface RealtimeEventBase {
  readonly type: RealtimeEventType;
  /** The board whose channel this event is delivered on. */
  readonly boardId: number;
  /**
   * Opaque origin token (the mutating request's `X-Client-Id`) echoed back so the originating tab
   * can drop its own event and avoid double-applying its optimistic update (Decision 3 / R5).
   * Undefined for server-internal mutations.
   */
  readonly originId?: string;
  /** Server-side emission timestamp (ISO-8601); also used as the SSE event id. */
  readonly emittedAt: string;
  /** Trace id of the mutation request that caused this event (logged, never surfaced — GP5). */
  readonly traceId?: string;
}

/** A card create/update/delete event carrying the full card entity. */
export interface CardEvent extends RealtimeEventBase {
  readonly type: 'card:created' | 'card:updated' | 'card:deleted';
  readonly card: Card;
}

/** A board update event carrying the full board entity. */
export interface BoardEvent extends RealtimeEventBase {
  readonly type: 'board:updated';
  readonly board: Board;
}

/**
 * A recorded card move (TASK-008). Carries the full persisted activity row. Deliberately has NO
 * `originId`: unlike `card:updated` (which the originating tab echo-drops because it already applied
 * its optimistic move), the originating tab MUST see its own activity entry appear in the feed
 * (AC-HAPPY-2.2). Designing the absence of `originId` into the envelope makes "never echo-deduped" a
 * structural property — the de-dup guard in `useRealtimeBoard` is never satisfied for it — rather
 * than a fragile type-specific exception (Architecture creative Q3 / Option 3A).
 */
export interface ActivityCardMovedEvent extends RealtimeEventBase {
  readonly type: 'activity:card_moved';
  readonly activity: ActivityEvent;
  // originId intentionally never set — never echo-deduped (delivered to every tab, incl. the mover).
}

/** Any board-scoped real-time event (the SSE `data:` payload, JSON-serialized). */
export type RealtimeEvent = CardEvent | BoardEvent | ActivityCardMovedEvent;
