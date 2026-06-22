/**
 * src/realtime/notify.ts — mutation→broadcast bridge (TASK-007 Phase 5).
 *
 * The thin seam the boards/cards routers call after a successful mutation to push a real-time event to
 * subscribers of that board. It builds the full-entity event envelope (Architecture Decision 2),
 * stamps it with the mutating request's origin token (`X-Client-Id`) so the originating tab can drop
 * its own echo (Decision 3 / R5) and its `traceId` (for cross-boundary correlation, logged only — GP5),
 * then publishes via the in-process {@link broadcaster}.
 *
 * It is FIRE-AND-FORGET and defensive (NFR1): the publish is synchronous and off the response critical
 * path (callers invoke it after `res.json()`), gated by `config.realtimeEnabled`, and wrapped so a
 * broadcaster failure is logged at warn via `req.log` and can NEVER fail the HTTP mutation (the request
 * has already responded 2xx).
 */

import type { Request } from 'express';
import type { Card } from '../db/cards';
import type { Board } from '../db/boards';
import { config } from '../config/env';
import { publish } from './broadcaster';
import type { BoardEvent, CardEvent, RealtimeEvent } from './events';

/** Publish an event for `boardId`, guarded so it never throws into the request path (logs via req.log). */
function publishSafely(boardId: number, event: RealtimeEvent, req: Request): void {
  if (!config.realtimeEnabled) {
    return;
  }
  try {
    const subscribers = publish(boardId, event);
    req.log.info({ boardId, type: event.type, subscribers }, 'realtime event published');
  } catch {
    // The request already responded 2xx — a broadcast failure must never surface to the client (GP5).
    req.log.warn({ boardId, type: event.type }, 'realtime publish failed');
  }
}

/** Broadcast a card mutation (create/update/delete) to the card's board channel. */
export function notifyCardChange(
  type: CardEvent['type'],
  boardId: number,
  card: Card,
  req: Request,
): void {
  const event: CardEvent = {
    type,
    boardId,
    card,
    originId: req.get('X-Client-Id') ?? undefined,
    emittedAt: new Date().toISOString(),
    traceId: req.traceId,
  };
  publishSafely(boardId, event, req);
}

/** Broadcast a board update to the board's channel. */
export function notifyBoardChange(boardId: number, board: Board, req: Request): void {
  const event: BoardEvent = {
    type: 'board:updated',
    boardId,
    board,
    originId: req.get('X-Client-Id') ?? undefined,
    emittedAt: new Date().toISOString(),
    traceId: req.traceId,
  };
  publishSafely(boardId, event, req);
}
