/**
 * src/realtime/mutationBroadcast.test.ts — mutation→broadcast hook integration (TASK-007 Phase 5).
 *
 * Verifies that a successful CRUD mutation publishes the matching real-time event to subscribers of
 * THAT board, carrying the originating tab's `X-Client-Id` as `originId` so the frontend can
 * echo-deduplicate its own change (Architecture Decision 3 / R5). Runs the real Express stack via
 * `supertest(createApp())` with the DB seam mocked at `src/db/pool.ts` (systemPatterns § Testing
 * Patterns); a fake subscriber is registered on the broadcaster singleton to observe the fire-and-
 * forget publish that the handlers perform after `res.json()`.
 *
 * Covers (Test Strategy § Phase 5, backend):
 *   - POST a card → `card:created` published to that board's subscribers with the card + originId;
 *   - PATCH a card → `card:updated` published (covers edit AND drag status change);
 *   - PATCH a board → `board:updated` published;
 *   - board-scoping — a subscriber to another board receives nothing (no cross-board leak).
 */

import request from 'supertest';
import { createApp } from '../app';
import { subscribe, clear } from './broadcaster';
import type { Subscriber } from './broadcaster';
import type { RealtimeEvent } from './events';

interface FakeCard {
  id: number;
  board_id: number;
  title: string;
  description: string | null;
  position: number;
  status: string;
  created_at: Date;
  updated_at: Date;
}
interface FakeBoard {
  id: number;
  name: string;
  description: string | null;
  created_at: Date;
  updated_at: Date;
}

interface FakeActivity {
  id: number;
  board_id: number;
  card_id: number;
  card_title: string;
  from_status: string;
  to_status: string;
  actor: string;
  occurred_at: Date;
}

const store: {
  boards: FakeBoard[];
  cards: FakeCard[];
  activity: FakeActivity[];
  nextCardId: number;
  nextActivityId: number;
} = {
  boards: [],
  cards: [],
  activity: [],
  nextCardId: 1,
  nextActivityId: 1,
};

function seedBoard(id: number): void {
  const now = new Date();
  store.boards.push({ id, name: `Board ${id}`, description: null, created_at: now, updated_at: now });
}
function seedCard(id: number, boardId: number): void {
  const now = new Date();
  store.cards.push({
    id,
    board_id: boardId,
    title: `Card ${id}`,
    description: null,
    position: 0,
    status: 'todo',
    created_at: now,
    updated_at: now,
  });
}

/** Minimal SQL interpreter for the statements the boards/cards data layers emit in these flows. */
const mockQuery = jest.fn(
  async (sql: string, params: unknown[] = []): Promise<{ rows: unknown[]; rowCount: number }> => {
    const text = sql.trim();

    if (text.startsWith('SELECT') && text.includes('FROM boards WHERE id')) {
      const row = store.boards.find((b) => b.id === (params[0] as number)) ?? null;
      return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
    }
    // Pre-flight findById on the cards PATCH path (TASK-008) — capture the pre-update status. Return a
    // COPY (pg yields a fresh row per query) so this snapshot is not an alias of the row the later
    // UPDATE mutates in place; otherwise before/after status would compare equal and skip recording.
    if (text.startsWith('SELECT') && text.includes('FROM cards WHERE id')) {
      const row = store.cards.find((c) => c.id === (params[0] as number)) ?? null;
      return { rows: row ? [{ ...row }] : [], rowCount: row ? 1 : 0 };
    }
    // Activity recording on a status change (TASK-008) — return the created row so notifyCardMoved fires.
    if (text.startsWith('INSERT INTO activity_events')) {
      const row: FakeActivity = {
        id: store.nextActivityId++,
        board_id: params[0] as number,
        card_id: params[1] as number,
        card_title: params[2] as string,
        from_status: params[3] as string,
        to_status: params[4] as string,
        actor: (params[5] ?? 'anonymous') as string,
        occurred_at: new Date(),
      };
      store.activity.push(row);
      return { rows: [row], rowCount: 1 };
    }
    if (text.startsWith('INSERT INTO cards')) {
      const now = new Date();
      const row: FakeCard = {
        id: store.nextCardId++,
        board_id: params[0] as number,
        title: params[1] as string,
        description: (params[2] ?? null) as string | null,
        position: params[3] as number,
        status: params[4] as string,
        created_at: now,
        updated_at: now,
      };
      store.cards.push(row);
      return { rows: [row], rowCount: 1 };
    }
    if (text.startsWith('UPDATE cards SET')) {
      const id = params[params.length - 1] as number;
      const row = store.cards.find((c) => c.id === id);
      if (row === undefined) {
        return { rows: [], rowCount: 0 };
      }
      // The status PATCH binds a single `status = $1` then `id` last — apply it loosely for the test.
      if (text.includes('status =')) {
        row.status = params[0] as string;
      }
      if (text.includes('title =')) {
        row.title = params[0] as string;
      }
      row.updated_at = new Date();
      return { rows: [row], rowCount: 1 };
    }
    if (text.startsWith('UPDATE boards SET')) {
      const id = params[params.length - 1] as number;
      const row = store.boards.find((b) => b.id === id);
      if (row === undefined) {
        return { rows: [], rowCount: 0 };
      }
      if (text.includes('name =')) {
        row.name = params[0] as string;
      }
      row.updated_at = new Date();
      return { rows: [row], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  },
);

jest.mock('../db/pool', () => ({
  getPool: () => ({ query: mockQuery }),
}));

/** A fake subscriber capturing every event delivered to it. */
function fakeSubscriber(): Subscriber & { readonly received: RealtimeEvent[] } {
  const received: RealtimeEvent[] = [];
  return { received, send: (event) => received.push(event) };
}

/**
 * The activity broadcast (TASK-008) fires AFTER res.json() and after an awaited insert, so it has not
 * settled when supertest resolves the response. Flush the event loop once before asserting on it.
 */
const flushAsync = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

beforeEach(() => {
  store.boards = [];
  store.cards = [];
  store.activity = [];
  store.nextCardId = 1;
  store.nextActivityId = 1;
  mockQuery.mockClear();
  clear();
});

describe('mutation → broadcast hooks', () => {
  it('POST card publishes card:created to that board with the originId from X-Client-Id', async () => {
    seedBoard(1);
    const sub = fakeSubscriber();
    subscribe(1, sub);

    const res = await request(createApp())
      .post('/api/v1/boards/1/cards')
      .set('X-Client-Id', 'tab-abc')
      .send({ title: 'New realtime card' });

    expect(res.status).toBe(201);
    expect(sub.received).toHaveLength(1);
    const event = sub.received[0];
    expect(event?.type).toBe('card:created');
    expect(event?.boardId).toBe(1);
    expect(event?.originId).toBe('tab-abc');
    expect(event?.type === 'card:created' ? event.card.title : null).toBe('New realtime card');
  });

  it('PATCH card publishes card:updated (covers edit and drag status change)', async () => {
    seedBoard(1);
    seedCard(10, 1);
    const sub = fakeSubscriber();
    subscribe(1, sub);

    const res = await request(createApp())
      .patch('/api/v1/boards/1/cards/10')
      .set('X-Client-Id', 'tab-xyz')
      .send({ status: 'in_progress' });

    expect(res.status).toBe(200);
    // A status change emits BOTH card:updated and (TASK-008) activity:card_moved — assert the
    // card:updated event specifically rather than the total count.
    const updated = sub.received.find((e) => e.type === 'card:updated');
    expect(updated).toBeDefined();
    expect(updated?.originId).toBe('tab-xyz');
    expect(updated?.type === 'card:updated' ? updated.card.status : null).toBe('in_progress');
  });

  // ── TASK-008 Phase 2: activity:card_moved broadcast (AC-HAPPY-2 backend half, AC-HAPPY-2.2) ──
  it('PATCH that changes status publishes activity:card_moved carrying the full activity row', async () => {
    seedBoard(1);
    seedCard(10, 1); // seeded status 'todo'
    const sub = fakeSubscriber();
    subscribe(1, sub);

    const res = await request(createApp())
      .patch('/api/v1/boards/1/cards/10')
      .set('X-Client-Id', 'tab-mover')
      .send({ status: 'in_progress' });
    await flushAsync();

    expect(res.status).toBe(200);
    const activity = sub.received.find((e) => e.type === 'activity:card_moved');
    expect(activity).toBeDefined();
    expect(activity?.boardId).toBe(1);
    if (activity?.type === 'activity:card_moved') {
      expect(activity.activity.card_id).toBe(10);
      expect(activity.activity.from_status).toBe('todo');
      expect(activity.activity.to_status).toBe('in_progress');
      expect(activity.activity.actor).toBe('anonymous');
    }
  });

  it('activity:card_moved carries NO originId so the originating tab is NOT echo-deduped (AC-HAPPY-2.2)', async () => {
    seedBoard(1);
    seedCard(10, 1);
    const sub = fakeSubscriber();
    subscribe(1, sub);

    await request(createApp())
      .patch('/api/v1/boards/1/cards/10')
      .set('X-Client-Id', 'tab-mover')
      .send({ status: 'done' });
    await flushAsync();

    const activity = sub.received.find((e) => e.type === 'activity:card_moved');
    expect(activity).toBeDefined();
    // The card:updated event DOES carry the originId; the activity event deliberately does not.
    expect(activity?.originId).toBeUndefined();
  });

  it('a non-status PATCH (title only) publishes card:updated but NO activity:card_moved', async () => {
    seedBoard(1);
    seedCard(10, 1);
    const sub = fakeSubscriber();
    subscribe(1, sub);

    const res = await request(createApp())
      .patch('/api/v1/boards/1/cards/10')
      .send({ title: 'Renamed, not moved' });
    await flushAsync();

    expect(res.status).toBe(200);
    expect(sub.received.some((e) => e.type === 'card:updated')).toBe(true);
    expect(sub.received.some((e) => e.type === 'activity:card_moved')).toBe(false);
  });

  it('PATCH board publishes board:updated', async () => {
    seedBoard(1);
    const sub = fakeSubscriber();
    subscribe(1, sub);

    const res = await request(createApp())
      .patch('/api/v1/boards/1')
      .send({ name: 'Renamed Board' });

    expect(res.status).toBe(200);
    expect(sub.received).toHaveLength(1);
    const event = sub.received[0];
    expect(event?.type).toBe('board:updated');
    expect(event?.type === 'board:updated' ? event.board.name : null).toBe('Renamed Board');
  });

  it('does not deliver a board-1 mutation to a board-2 subscriber (no cross-board leak)', async () => {
    seedBoard(1);
    const board2 = fakeSubscriber();
    subscribe(2, board2);

    await request(createApp()).post('/api/v1/boards/1/cards').send({ title: 'Scoped card' });

    expect(board2.received).toHaveLength(0);
  });
});
