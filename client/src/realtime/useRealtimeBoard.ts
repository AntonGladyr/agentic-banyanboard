/**
 * client/src/realtime/useRealtimeBoard.ts — board real-time subscription hook (TASK-007 Phase 5).
 *
 * Opens a native `EventSource` to the board's SSE channel (`GET /api/v1/boards/:id/events`) and routes
 * inbound events to the page's handlers. The transport is plain HTTP, so it rides the existing Vite
 * `/api/v1` proxy in dev and Express single-origin serving in prod with no extra config (Architecture
 * Decision 1); `EventSource` auto-reconnects, so there is no backoff code here.
 *
 * Echo de-duplication (Architecture Decision 3 / R5): every write the SPA makes sends its per-tab
 * `originId` as `X-Client-Id`; the server echoes it back on the resulting event. This hook DROPS any
 * event whose `originId` matches this tab — the originating tab already applied that change
 * optimistically, so re-applying it would double-apply and re-trigger the highlight on its own action.
 * Remote tabs (different `originId`) apply events normally.
 *
 * The hook keeps the latest handlers in a ref so the `EventSource` is opened once per `boardId`/`originId`
 * and is not torn down on every render. It closes the connection on unmount (no leak).
 */

import { useEffect, useRef } from 'react';
import type {
  ActivityRealtimeEvent,
  BoardRealtimeEvent,
  CardRealtimeEvent,
  RealtimeEvent,
  RealtimeEventType,
} from '../api/types';

/** The named SSE events this hook listens for (each requires its own `addEventListener`). */
const REALTIME_EVENT_TYPES: readonly RealtimeEventType[] = [
  'card:created',
  'card:updated',
  'card:deleted',
  'board:updated',
  'activity:card_moved',
];

/** Page-supplied handlers the hook routes de-duplicated remote events to. */
export interface RealtimeHandlers {
  /** A remote card create/update/delete arrived — apply the full entity to local state. */
  readonly onCardEvent: (event: CardRealtimeEvent) => void;
  /** A remote board update arrived — apply the full board to local state. */
  readonly onBoardEvent: (event: BoardRealtimeEvent) => void;
  /**
   * A card move was recorded (TASK-008) — prepend the activity entry to the feed. Activity events
   * carry NO `originId`, so the echo-drop below never suppresses them: the originating tab sees its
   * own move appear in the feed (AC-HAPPY-2.2). Optional so existing callers stay source-compatible.
   */
  readonly onActivityEvent?: (event: ActivityRealtimeEvent) => void;
}

/**
 * Subscribe to a board's live event stream. No-ops when `boardId` is undefined or `EventSource` is
 * unavailable (e.g. jsdom without a stub), so it is safe to call unconditionally from the page.
 */
export function useRealtimeBoard(
  boardId: string | number | undefined,
  originId: string,
  handlers: RealtimeHandlers,
): void {
  // Keep handlers current without making them an effect dependency (avoids reopening the stream).
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (boardId === undefined || typeof EventSource === 'undefined') {
      return;
    }
    // The origin token rides a query param (EventSource cannot set custom headers) — used for server logs.
    const source = new EventSource(
      `/api/v1/boards/${boardId}/events?clientId=${encodeURIComponent(originId)}`,
    );

    function handle(raw: MessageEvent): void {
      let event: RealtimeEvent;
      try {
        event = JSON.parse(raw.data as string) as RealtimeEvent;
      } catch {
        return; // ignore a malformed frame rather than crash the stream
      }
      // Drop this tab's own echo — it already applied the change optimistically (R5). Activity
      // events carry no `originId`, so this guard never matches them (AC-HAPPY-2.2 — by design).
      if (event.originId !== undefined && event.originId === originId) {
        return;
      }
      if (event.type === 'activity:card_moved') {
        handlersRef.current.onActivityEvent?.(event);
      } else if (event.type === 'board:updated') {
        handlersRef.current.onBoardEvent(event);
      } else {
        handlersRef.current.onCardEvent(event);
      }
    }

    for (const type of REALTIME_EVENT_TYPES) {
      source.addEventListener(type, handle as EventListener);
    }

    return () => source.close();
  }, [boardId, originId]);
}
