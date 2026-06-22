/**
 * src/realtime/broadcaster.ts — in-process pub/sub hub for the real-time tier (TASK-007 Phase 5).
 *
 * Architecture Decision 1: a single-host, ≤ 20-user deployment needs no external broker (Redis) — an
 * in-process `Map<boardId, Set<subscriber>>` is sufficient and correct. This module is the only shared
 * mutable state of the real-time tier and is deliberately HTTP-IGNORANT: the SSE route adapts an
 * Express `res` into a {@link Subscriber} sink (`send`), and the mutation routers call {@link publish}.
 * Keeping HTTP out of here keeps the hub unit-testable with a fake sink and keeps `createApp()` pure.
 *
 * Delivery is board-scoped: an event published for board X reaches only that board's subscribers, so a
 * viewer of board Y never sees board X's mutations (AC-REALTIME-1 board-scoping). Empty channel Sets
 * are pruned so a board with no current viewers holds no memory.
 */

import type { RealtimeEvent } from './events';

/** A delivery sink for one connected client. The SSE route implements this over an Express `res`. */
export interface Subscriber {
  /** Deliver one event to this client. Implementations must not throw — they swallow write errors. */
  send(event: RealtimeEvent): void;
}

/** The board channels. Module-level singleton — exactly one hub per process. */
const channels = new Map<number, Set<Subscriber>>();

/** Register a subscriber on a board's channel (creating the channel Set on first subscribe). */
export function subscribe(boardId: number, subscriber: Subscriber): void {
  let set = channels.get(boardId);
  if (set === undefined) {
    set = new Set();
    channels.set(boardId, set);
  }
  set.add(subscriber);
}

/** Remove a subscriber from a board's channel, pruning the channel when it becomes empty. */
export function unsubscribe(boardId: number, subscriber: Subscriber): void {
  const set = channels.get(boardId);
  if (set === undefined) {
    return;
  }
  set.delete(subscriber);
  if (set.size === 0) {
    channels.delete(boardId);
  }
}

/**
 * Deliver an event to every subscriber of `boardId`. Returns the number of subscribers it was sent
 * to (0 when the board has no current viewers — a harmless no-op). Each `send` is guarded so one dead
 * sink never blocks delivery to the others.
 */
export function publish(boardId: number, event: RealtimeEvent): number {
  const set = channels.get(boardId);
  if (set === undefined) {
    return 0;
  }
  let delivered = 0;
  for (const subscriber of set) {
    try {
      subscriber.send(event);
    } catch {
      // A Subscriber is contracted not to throw; guard anyway so one bad sink can't break the fan-out.
    }
    delivered += 1;
  }
  return delivered;
}

/**
 * Current subscriber count for one board, or the total across all boards when `boardId` is omitted.
 * Exposed so a future `/metrics` endpoint can surface a `banyanboard_realtime_connections` gauge
 * without rework (Architecture Decision 5 — metrics deferred, accessor ready).
 */
export function connectionCount(boardId?: number): number {
  if (boardId !== undefined) {
    return channels.get(boardId)?.size ?? 0;
  }
  let total = 0;
  for (const set of channels.values()) {
    total += set.size;
  }
  return total;
}

/** Test support: drop all channels so each test starts from an empty hub. Not used in production. */
export function clear(): void {
  channels.clear();
}
