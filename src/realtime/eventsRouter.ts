/**
 * src/realtime/eventsRouter.ts — Server-Sent Events transport endpoint (TASK-007 Phase 5).
 *
 * Implements `GET /api/v1/boards/:boardId/events` — the long-lived `text/event-stream` channel a board
 * view subscribes to for live updates. Mounted INSIDE `createApp()` (via src/routes/index.ts) so it
 * preserves the supertest-injectable factory seam and rides the existing `/api/v1` Vite HTTP proxy with
 * NO `ws: true` change (Architecture Decision 1). The browser consumes it with the native `EventSource`,
 * which auto-reconnects — so there is no client backoff code.
 *
 * Flow per connection:
 *   - validate `:boardId` (400 on a non-integer, before any subscription);
 *   - 404 when `config.realtimeEnabled` is false (master switch; GP5-safe — no detail leaked);
 *   - write SSE headers, register the response as a {@link broadcaster} subscriber, and emit a
 *     trace-correlated `realtime connection opened` log (`req.log` is already bound by requestLogger);
 *   - send keep-alive comment frames every `REALTIME_KEEPALIVE_MS` to defeat idle-proxy timeouts;
 *   - on `req` close, clear the keep-alive, unsubscribe (no dead-subscriber leak), and log the close
 *     with the connection duration.
 *
 * No `express.json()` here (GET only, no body). The subscriber's `send` swallows write errors so a dead
 * socket never throws into the broadcaster's fan-out.
 */

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { validateId } from '../validation/card';
import { notFoundError } from '../errors';
import { config } from '../config/env';
import { subscribe, unsubscribe, connectionCount } from './broadcaster';
import type { Subscriber } from './broadcaster';
import type { RealtimeEvent } from './events';

/** Milliseconds per nanosecond — converts `process.hrtime.bigint()` deltas to ms (mirrors requestLogger). */
const NS_PER_MS = 1_000_000;

// mergeParams: true so `:boardId` captured by the parent mount path is visible here.
const eventsRouter = Router({ mergeParams: true });

/** Serialize one event as an SSE frame: `id:` (for Last-Event-ID), named `event:`, JSON `data:`. */
function frame(event: RealtimeEvent): string {
  return `id: ${event.emittedAt}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

/** GET /api/v1/boards/:boardId/events — subscribe to a board's live event stream. */
eventsRouter.get('/', (req: Request, res: Response, next: NextFunction): void => {
  try {
    const boardId = validateId(req.params.boardId ?? '');
    if (!config.realtimeEnabled) {
      // Master switch off: behave as if the route does not exist (GP5 — no "disabled" detail leaked).
      throw notFoundError(`realtime disabled (board ${boardId})`);
    }

    // EventSource cannot set custom headers, so the origin token rides a query param for logging only.
    const clientId = typeof req.query.clientId === 'string' ? req.query.clientId : undefined;

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.flushHeaders();
    // An initial comment opens the stream promptly before the first real event.
    res.write(': connected\n\n');

    const startedAt = process.hrtime.bigint();
    const subscriber: Subscriber = {
      send(event: RealtimeEvent): void {
        try {
          res.write(frame(event));
        } catch {
          // Writing to an already-closed socket — drop quietly; cleanup runs via the close handler.
          req.log.warn({ boardId }, 'realtime write failed');
        }
      },
    };

    subscribe(boardId, subscriber);
    req.log.info(
      { boardId, clientId, connections: connectionCount(boardId) },
      'realtime connection opened',
    );

    const keepAlive = setInterval(() => {
      try {
        res.write(': keep-alive\n\n');
      } catch {
        // Closed socket — the close handler will clear this interval.
      }
    }, config.realtimeKeepaliveMs);
    // Don't let the keep-alive timer keep the event loop alive on its own.
    if (typeof keepAlive.unref === 'function') {
      keepAlive.unref();
    }

    req.on('close', () => {
      clearInterval(keepAlive);
      unsubscribe(boardId, subscriber);
      const durationMs = Number(process.hrtime.bigint() - startedAt) / NS_PER_MS;
      req.log.info({ boardId, clientId, durationMs }, 'realtime connection closed');
    });
  } catch (err) {
    next(err);
  }
});

export { eventsRouter };
