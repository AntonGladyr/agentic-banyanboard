/**
 * client/src/realtime/useRealtimeBoard.test.ts — real-time subscription hook tests (TASK-007 Phase 5).
 *
 * `useRealtimeBoard` opens an `EventSource` to the board's SSE channel and routes inbound events to
 * the page's handlers, DROPPING the current tab's own echo (Architecture Decision 3 / R5 — the
 * originating tab already applied its mutation optimistically). jsdom has no `EventSource`, so a fake
 * is stubbed globally; tests emit named SSE events through it and assert handler routing + de-dup.
 *
 * Covers (Test Strategy § Phase 5, frontend):
 *   - a remote `card:created` / `card:updated` event routes to `onCardEvent`;
 *   - a remote `board:updated` event routes to `onBoardEvent`;
 *   - an event whose `originId` equals this tab's origin is dropped (no double-apply);
 *   - the EventSource is closed on unmount (no connection leak).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useRealtimeBoard } from './useRealtimeBoard';
import type { RealtimeHandlers } from './useRealtimeBoard';
import type { BoardRealtimeEvent, CardRealtimeEvent } from '../api/types';

/** A minimal EventSource stand-in that records instances and lets tests emit named events. */
class FakeEventSource {
  static instances: FakeEventSource[] = [];
  readonly url: string;
  readonly listeners = new Map<string, Set<(event: MessageEvent) => void>>();
  closed = false;

  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, cb: (event: MessageEvent) => void): void {
    const set = this.listeners.get(type) ?? new Set();
    set.add(cb);
    this.listeners.set(type, set);
  }

  removeEventListener(type: string, cb: (event: MessageEvent) => void): void {
    this.listeners.get(type)?.delete(cb);
  }

  close(): void {
    this.closed = true;
  }

  /** Dispatch a named SSE event carrying a JSON-serialized payload, like the server does. */
  emit(type: string, payload: unknown): void {
    const event = { data: JSON.stringify(payload) } as MessageEvent;
    this.listeners.get(type)?.forEach((cb) => cb(event));
  }
}

function cardEvent(type: CardRealtimeEvent['type'], overrides: Partial<CardRealtimeEvent> = {}): CardRealtimeEvent {
  return {
    type,
    boardId: 1,
    emittedAt: '2026-06-21T10:00:00.000Z',
    card: {
      id: 99,
      board_id: 1,
      title: 'Remote card',
      description: null,
      position: 0,
      status: 'todo',
      created_at: '2026-06-21T00:00:00.000Z',
      updated_at: '2026-06-21T10:00:00.000Z',
    },
    ...overrides,
  };
}

function makeHandlers(): RealtimeHandlers & {
  onCardEvent: ReturnType<typeof vi.fn>;
  onBoardEvent: ReturnType<typeof vi.fn>;
} {
  return { onCardEvent: vi.fn(), onBoardEvent: vi.fn() };
}

beforeEach(() => {
  FakeEventSource.instances = [];
  vi.stubGlobal('EventSource', FakeEventSource as unknown as typeof EventSource);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useRealtimeBoard', () => {
  it('opens an EventSource for the board scoped to the tab origin', () => {
    renderHook(() => useRealtimeBoard(7, 'tab-origin', makeHandlers()));
    expect(FakeEventSource.instances).toHaveLength(1);
    expect(FakeEventSource.instances[0]?.url).toContain('/api/v1/boards/7/events');
  });

  it('routes a remote card:created event to onCardEvent (AC-REALTIME-2)', () => {
    const handlers = makeHandlers();
    renderHook(() => useRealtimeBoard(1, 'tab-origin', handlers));

    const source = FakeEventSource.instances[0]!;
    const event = cardEvent('card:created', { originId: 'other-tab' });
    source.emit('card:created', event);

    expect(handlers.onCardEvent).toHaveBeenCalledWith(event);
    expect(handlers.onBoardEvent).not.toHaveBeenCalled();
  });

  it('routes a remote board:updated event to onBoardEvent', () => {
    const handlers = makeHandlers();
    renderHook(() => useRealtimeBoard(1, 'tab-origin', handlers));

    const source = FakeEventSource.instances[0]!;
    const event: BoardRealtimeEvent = {
      type: 'board:updated',
      boardId: 1,
      emittedAt: '2026-06-21T10:00:00.000Z',
      originId: 'other-tab',
      board: {
        id: 1,
        name: 'Renamed remotely',
        description: null,
        created_at: '2026-06-21T00:00:00.000Z',
        updated_at: '2026-06-21T10:00:00.000Z',
      },
    };
    source.emit('board:updated', event);

    expect(handlers.onBoardEvent).toHaveBeenCalledWith(event);
    expect(handlers.onCardEvent).not.toHaveBeenCalled();
  });

  it("drops this tab's own echo (originId === origin) so it is not double-applied (R5)", () => {
    const handlers = makeHandlers();
    renderHook(() => useRealtimeBoard(1, 'my-tab', handlers));

    const source = FakeEventSource.instances[0]!;
    source.emit('card:updated', cardEvent('card:updated', { originId: 'my-tab' }));

    expect(handlers.onCardEvent).not.toHaveBeenCalled();
    expect(handlers.onBoardEvent).not.toHaveBeenCalled();
  });

  it('closes the EventSource on unmount (no connection leak)', () => {
    const { unmount } = renderHook(() => useRealtimeBoard(1, 'tab-origin', makeHandlers()));
    const source = FakeEventSource.instances[0]!;
    unmount();
    expect(source.closed).toBe(true);
  });
});
