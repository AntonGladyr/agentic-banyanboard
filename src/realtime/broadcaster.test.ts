/**
 * src/realtime/broadcaster.test.ts — in-process pub/sub hub tests (TASK-007 Phase 5).
 *
 * The broadcaster is the only shared mutable state of the real-time tier (Architecture Decision 1):
 * a `Map<boardId, Set<subscriber>>`. It is deliberately HTTP-ignorant so it is unit-testable with a
 * fake `Subscriber` sink — no Express, no supertest. These tests pin the contract the SSE route and
 * the mutation broadcast hooks depend on:
 *   - publish delivers an event to every subscriber of that board (R1);
 *   - delivery is BOARD-SCOPED — a subscriber to board A never receives board B's events
 *     (AC-REALTIME-1 board-scoping / no cross-board leak — stub-detection);
 *   - unsubscribe removes a subscriber so a disconnected client stops receiving and the Set shrinks
 *     (prevents the dead-subscriber leak — Risk table);
 *   - connectionCount reflects per-board and total subscriber counts (future metrics accessor).
 */

import { subscribe, unsubscribe, publish, connectionCount, clear } from './broadcaster';
import type { Subscriber } from './broadcaster';
import type { CardEvent, RealtimeEvent } from './events';

/** A fake sink capturing every event sent to it — stands in for an SSE response. */
function fakeSubscriber(): Subscriber & { readonly received: RealtimeEvent[] } {
  const received: RealtimeEvent[] = [];
  return { received, send: (event) => received.push(event) };
}

function cardEvent(boardId: number, cardId: number): CardEvent {
  return {
    type: 'card:updated',
    boardId,
    emittedAt: '2026-06-21T10:00:00.000Z',
    card: {
      id: cardId,
      board_id: boardId,
      title: `Card ${cardId}`,
      description: null,
      position: 0,
      status: 'in_progress',
      created_at: new Date('2026-06-21T00:00:00.000Z'),
      updated_at: new Date('2026-06-21T10:00:00.000Z'),
    },
  };
}

afterEach(() => {
  // Reset the module-level channel map so each test starts from an empty hub.
  clear();
});

describe('broadcaster', () => {
  it('delivers a published event to every subscriber of that board (R1)', () => {
    const a = fakeSubscriber();
    const b = fakeSubscriber();
    subscribe(7, a);
    subscribe(7, b);

    const event = cardEvent(7, 100);
    const delivered = publish(7, event);

    expect(delivered).toBe(2);
    expect(a.received).toEqual([event]);
    expect(b.received).toEqual([event]);
  });

  it('scopes delivery to one board — a board-A subscriber never sees board-B events (no cross-board leak)', () => {
    const boardA = fakeSubscriber();
    const boardB = fakeSubscriber();
    subscribe(1, boardA);
    subscribe(2, boardB);

    publish(1, cardEvent(1, 10));

    expect(boardA.received).toHaveLength(1);
    expect(boardB.received).toHaveLength(0); // board 2 subscriber unaffected by a board-1 mutation
  });

  it('publishing to a board with no subscribers is a no-op (returns 0)', () => {
    expect(publish(999, cardEvent(999, 1))).toBe(0);
  });

  it('unsubscribe stops delivery and shrinks the connection count (no dead-subscriber leak)', () => {
    const sub = fakeSubscriber();
    subscribe(5, sub);
    expect(connectionCount(5)).toBe(1);

    unsubscribe(5, sub);
    expect(connectionCount(5)).toBe(0);

    publish(5, cardEvent(5, 1));
    expect(sub.received).toHaveLength(0);
  });

  it('connectionCount reports per-board and total subscriber counts', () => {
    subscribe(1, fakeSubscriber());
    subscribe(1, fakeSubscriber());
    subscribe(2, fakeSubscriber());

    expect(connectionCount(1)).toBe(2);
    expect(connectionCount(2)).toBe(1);
    expect(connectionCount()).toBe(3); // total across all boards
  });
});
