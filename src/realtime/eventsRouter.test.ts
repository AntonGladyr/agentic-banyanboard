/**
 * src/realtime/eventsRouter.test.ts — SSE transport endpoint tests (TASK-007 Phase 5).
 *
 * `GET /api/v1/boards/:boardId/events` is the long-lived `text/event-stream` channel mounted INSIDE
 * `createApp()` (Architecture Decision 1 — preserves the supertest seam). Because the response never
 * ends, the streaming assertions bind a real ephemeral-port server and drive it with a raw Node HTTP
 * client (supertest's `.expect()` would hang waiting for `res.finish`); the non-streaming guards
 * (disabled → 404, bad id → 400) use supertest, which completes normally.
 *
 * Covers (Test Strategy § Phase 5, backend):
 *   - a subscribed client receives SSE-framed events published for its board, and is removed from the
 *     broadcaster's connection set when it disconnects (connection lifecycle; no leak);
 *   - the response carries `Content-Type: text/event-stream`;
 *   - `REALTIME_ENABLED=false` → 404 with no internal detail (GP5);
 *   - a non-integer :boardId → 400 before any subscription.
 */

import http from 'node:http';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { createApp } from '../app';
import { connectionCount, publish, clear } from './broadcaster';
import type { CardEvent } from './events';

function cardCreated(boardId: number, cardId: number): CardEvent {
  return {
    type: 'card:created',
    boardId,
    emittedAt: '2026-06-21T10:00:00.000Z',
    card: {
      id: cardId,
      board_id: boardId,
      title: `Card ${cardId}`,
      description: null,
      position: 0,
      status: 'todo',
      created_at: new Date('2026-06-21T00:00:00.000Z'),
      updated_at: new Date('2026-06-21T00:00:00.000Z'),
    },
  };
}

afterEach(() => {
  clear();
});

describe('eventsRouter (SSE transport)', () => {
  it('streams SSE-framed events to a subscribed client and cleans up on disconnect', async () => {
    const server = http.createServer(createApp());
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const { port } = server.address() as AddressInfo;

    // Open the long-lived SSE request and collect streamed chunks.
    const chunks: string[] = [];
    const clientReq = http.request(
      { port, path: '/api/v1/boards/7/events', method: 'GET' },
      (res) => {
        expect(res.statusCode).toBe(200);
        expect(res.headers['content-type']).toContain('text/event-stream');
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => chunks.push(chunk));
      },
    );
    clientReq.end();

    // Wait until the server has registered this connection as a board-7 subscriber.
    await waitFor(() => connectionCount(7) === 1);

    // Publish through the broadcaster as a mutation handler would; the frame should reach the client.
    publish(7, cardCreated(7, 42));
    await waitFor(() => chunks.join('').includes('card:created'));

    const wire = chunks.join('');
    expect(wire).toContain('event: card:created');
    expect(wire).toContain('"id":42');

    // Disconnecting the client must unsubscribe it from the broadcaster (no dead-subscriber leak).
    clientReq.destroy();
    await waitFor(() => connectionCount(7) === 0);

    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('returns 404 when REALTIME_ENABLED is false (no internal detail — GP5)', async () => {
    jest.resetModules();
    const prev = process.env.REALTIME_ENABLED;
    process.env.REALTIME_ENABLED = 'false';
    try {
      // Re-require the app with the disabled flag so config picks it up at import time (fail-fast pattern).
      const { createApp: createAppDisabled } = require('../app') as typeof import('../app');
      const res = await request(createAppDisabled()).get('/api/v1/boards/7/events');
      expect(res.status).toBe(404);
      expect(JSON.stringify(res.body)).not.toMatch(/realtime|disabled/i);
    } finally {
      if (prev === undefined) {
        delete process.env.REALTIME_ENABLED;
      } else {
        process.env.REALTIME_ENABLED = prev;
      }
      jest.resetModules();
    }
  });

  it('returns 400 for a non-integer boardId before subscribing', async () => {
    const res = await request(createApp()).get('/api/v1/boards/not-a-number/events');
    expect(res.status).toBe(400);
    expect(connectionCount()).toBe(0); // no subscription was registered for an invalid id
  });
});

/** Poll `predicate` until true or a short timeout elapses — for asserting on async stream state. */
async function waitFor(predicate: () => boolean, timeoutMs = 1000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('waitFor timed out');
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
