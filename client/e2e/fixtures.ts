/**
 * client/e2e/fixtures.ts — deterministic API fixtures + mocking helper for the E2E journeys
 * (TASK-006 Phase 5).
 *
 * The specs never touch a real database: `seedApi(page, data)` installs a single `**​/api/v1/**`
 * route that fulfills these fixtures, so each journey is hermetic and the document/asset requests
 * still flow through the real Express SPA serving (see playwright.config.ts).
 *
 * The fixture shapes mirror the backend row contract (src/db/boards.ts / src/db/cards.ts), including
 * the `status` field added in Phase 1 — timestamps are ISO-8601 strings as the API serializes them.
 */

import type { Page, Route } from '@playwright/test';

export interface BoardFixture {
  id: number;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface CardFixture {
  id: number;
  board_id: number;
  title: string;
  description: string | null;
  position: number;
  status: 'todo' | 'in_progress' | 'done';
  created_at: string;
  updated_at: string;
}

const TS = '2026-06-21T10:00:00.000Z';

/** Build a board fixture with uniform ISO timestamps. */
export function makeBoard(id: number, name: string, description: string | null): BoardFixture {
  return { id, name, description, created_at: TS, updated_at: TS };
}

function card(
  id: number,
  board_id: number,
  title: string,
  status: CardFixture['status'],
  description: string | null = null,
): CardFixture {
  return { id, board_id, title, description, position: id, status, created_at: TS, updated_at: TS };
}

/** Two boards with distinctive names so list rendering and navigation are unambiguous. */
export const BOARDS: BoardFixture[] = [
  makeBoard(1, 'Sprint Board', 'Current sprint work'),
  makeBoard(2, 'Personal Tasks', null),
];

/**
 * Cards keyed by board id. Board 1 and board 2 carry DELIBERATELY DIFFERENT card titles spread
 * across all three statuses — this powers the "different board → different cards" stub-detection
 * check (AC-HAPPY-1) and the partition-by-status assertions.
 */
export const CARDS_BY_BOARD: Record<number, CardFixture[]> = {
  1: [
    card(11, 1, 'Design login screen', 'todo', 'Wireframe the auth flow'),
    card(12, 1, 'Implement API client', 'in_progress'),
    card(13, 1, 'Write smoke tests', 'done'),
  ],
  2: [
    card(21, 2, 'Buy groceries', 'todo'),
    card(22, 2, 'Renew passport', 'in_progress'),
  ],
};

/** Shape of the per-test seed: which boards exist and which cards each board has. */
export interface ApiSeed {
  boards: BoardFixture[];
  cardsByBoard: Record<number, CardFixture[]>;
}

/** The default happy-path seed used by most journeys. */
export const HAPPY_PATH_SEED: ApiSeed = { boards: BOARDS, cardsByBoard: CARDS_BY_BOARD };

function fulfillJson(route: Route, body: unknown, status = 200): Promise<void> {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

function notFound(route: Route, path: string): Promise<void> {
  return fulfillJson(route, { error: 'Not Found', path }, 404);
}

/**
 * Install a deterministic mock of the read API the SPA consumes:
 *   - GET /api/v1/boards            → the seed's board list
 *   - GET /api/v1/boards/:id        → the matching board, or JSON 404
 *   - GET /api/v1/boards/:id/cards  → that board's cards, or JSON 404 when the board is unknown
 * Any other /api/v1 path resolves to a JSON 404, mirroring the backend's notFound contract.
 */
export async function seedApi(page: Page, seed: ApiSeed = HAPPY_PATH_SEED): Promise<void> {
  await page.route('**/api/v1/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname;

    if (pathname === '/api/v1/boards') {
      await fulfillJson(route, seed.boards);
      return;
    }

    const cardsMatch = pathname.match(/^\/api\/v1\/boards\/(\d+)\/cards$/);
    if (cardsMatch) {
      const id = Number(cardsMatch[1]);
      const cards = seed.cardsByBoard[id];
      if (cards === undefined) {
        await notFound(route, pathname);
        return;
      }
      await fulfillJson(route, cards);
      return;
    }

    const boardMatch = pathname.match(/^\/api\/v1\/boards\/(\d+)$/);
    if (boardMatch) {
      const id = Number(boardMatch[1]);
      const found = seed.boards.find((b) => b.id === id);
      if (found === undefined) {
        await notFound(route, pathname);
        return;
      }
      await fulfillJson(route, found);
      return;
    }

    await notFound(route, pathname);
  });
}

// ─── Write-aware stateful mock (TASK-007 Phase 6) ──────────────────────────────
//
// The single-tab interactive journeys (create/edit board, create/edit card, drag, cancel) need the
// mock to ACCEPT writes and reflect them on subsequent reads, so an optimistic UI change can be
// confirmed against the "server" and a post-drag reload shows the persisted status. `seedWritableApi`
// installs ONE `**​/api/v1/**` route over a per-test in-memory store (cloned from the seed so tests
// never share state) that interprets the same REST contract the backend implements:
//   GET    /boards                         → board list
//   GET    /boards/:id                     → one board (404 when unknown)
//   GET    /boards/:id/cards               → that board's cards (404 when board unknown)
//   GET    /boards/:id/events              → a benign one-shot SSE frame (no cross-tab broadcast here;
//                                            real-time is covered by the `realtime` project's real backend)
//   POST   /boards                         → 201 created board (server-assigned id)
//   PATCH  /boards/:id                     → 200 updated board
//   POST   /boards/:id/cards               → 201 created card (status from body, default 'todo')
//   PATCH  /boards/:id/cards/:id           → 200 updated card (title/description/status as supplied)
// It returns a {@link WriteLog} so a test can assert that a cancelled form issued NO write (AC-NAV-1).

/** Records every write the SPA issues, so a test can assert a cancel made none (AC-NAV-1). */
export interface WriteLog {
  readonly writes: { readonly method: string; readonly pathname: string }[];
}

interface MutableStore {
  boards: BoardFixture[];
  cards: CardFixture[];
  nextBoardId: number;
  nextCardId: number;
}

/** Deep-clone the seed into a mutable store with id counters seeded past the highest existing id. */
function cloneToStore(seed: ApiSeed): MutableStore {
  const boards = seed.boards.map((b) => ({ ...b }));
  const cards = Object.values(seed.cardsByBoard).flatMap((list) => list.map((c) => ({ ...c })));
  const maxBoardId = boards.reduce((max, b) => Math.max(max, b.id), 0);
  const maxCardId = cards.reduce((max, c) => Math.max(max, c.id), 0);
  return { boards, cards, nextBoardId: maxBoardId + 1, nextCardId: maxCardId + 1 };
}

export async function seedWritableApi(page: Page, seed: ApiSeed = HAPPY_PATH_SEED): Promise<WriteLog> {
  const store = cloneToStore(seed);
  const log: WriteLog = { writes: [] };

  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const method = request.method();
    const pathname = new URL(request.url()).pathname;

    if (method !== 'GET') {
      log.writes.push({ method, pathname });
    }

    // Real-time channel: a single benign frame keeps EventSource from erroring loudly. The mocked
    // project never asserts on live updates — that is the `realtime` project's job against a real server.
    if (/^\/api\/v1\/boards\/\d+\/events$/.test(pathname)) {
      await route.fulfill({ status: 200, contentType: 'text/event-stream', body: ': mocked\n\n' });
      return;
    }

    // ── boards collection ──
    if (pathname === '/api/v1/boards') {
      if (method === 'POST') {
        const body = (request.postDataJSON() ?? {}) as { name: string; description?: string | null };
        const board = makeBoard(store.nextBoardId++, body.name, body.description ?? null);
        store.boards.push(board);
        await fulfillJson(route, board, 201);
        return;
      }
      await fulfillJson(route, store.boards);
      return;
    }

    // ── cards collection (must be checked before the single-board match) ──
    const cardsMatch = pathname.match(/^\/api\/v1\/boards\/(\d+)\/cards$/);
    if (cardsMatch) {
      const boardId = Number(cardsMatch[1]);
      const board = store.boards.find((b) => b.id === boardId);
      if (board === undefined) {
        await notFound(route, pathname);
        return;
      }
      if (method === 'POST') {
        const body = (request.postDataJSON() ?? {}) as {
          title: string;
          description?: string | null;
          status?: CardFixture['status'];
        };
        const created = card(
          store.nextCardId++,
          boardId,
          body.title,
          body.status ?? 'todo',
          body.description ?? null,
        );
        store.cards.push(created);
        await fulfillJson(route, created, 201);
        return;
      }
      // Returned in insertion order — no test asserts intra-column `position` ordering (out of scope:
      // reordering within a column is a future enhancement), so a position-sort would be inert here.
      await fulfillJson(route, store.cards.filter((c) => c.board_id === boardId));
      return;
    }

    // ── single card ──
    const cardMatch = pathname.match(/^\/api\/v1\/boards\/(\d+)\/cards\/(\d+)$/);
    if (cardMatch) {
      const cardId = Number(cardMatch[2]);
      const existing = store.cards.find((c) => c.id === cardId);
      if (existing === undefined) {
        await notFound(route, pathname);
        return;
      }
      if (method === 'PATCH') {
        const body = (request.postDataJSON() ?? {}) as Partial<
          Pick<CardFixture, 'title' | 'description' | 'status'>
        >;
        if (body.title !== undefined) existing.title = body.title;
        if (body.description !== undefined) existing.description = body.description;
        if (body.status !== undefined) existing.status = body.status;
        existing.updated_at = TS;
        await fulfillJson(route, existing);
        return;
      }
      await fulfillJson(route, existing);
      return;
    }

    // ── single board ──
    const boardMatch = pathname.match(/^\/api\/v1\/boards\/(\d+)$/);
    if (boardMatch) {
      const boardId = Number(boardMatch[1]);
      const board = store.boards.find((b) => b.id === boardId);
      if (board === undefined) {
        await notFound(route, pathname);
        return;
      }
      if (method === 'PATCH') {
        const body = (request.postDataJSON() ?? {}) as Partial<
          Pick<BoardFixture, 'name' | 'description'>
        >;
        if (body.name !== undefined) board.name = body.name;
        if (body.description !== undefined) board.description = body.description;
        board.updated_at = TS;
        await fulfillJson(route, board);
        return;
      }
      await fulfillJson(route, board);
      return;
    }

    await notFound(route, pathname);
  });

  return log;
}

// ─── Shared interaction helpers (TASK-007 Phase 6) ─────────────────────────────

/**
 * Drag a card to another column via real pointer events. The board uses `@dnd-kit`'s PointerSensor with
 * an 8px activation distance, so the gesture must press on the card's grip handle, move past the
 * threshold, traverse to the target column's centre in steps (so `@dnd-kit` sees intermediate
 * pointermove events), then release. Asserting the observable outcome — not pixel coordinates — keeps
 * tests robust (Test Strategy § What NOT to Test). Shared by the single-tab and two-tab specs.
 */
export async function pointerDragCardToColumn(
  page: Page,
  cardTitle: string,
  targetColumnLabel: string,
): Promise<void> {
  const handle = page.getByRole('button', { name: `Reorder card: ${cardTitle}` });
  const target = page.getByRole('region', { name: targetColumnLabel });
  const handleBox = await handle.boundingBox();
  const targetBox = await target.boundingBox();
  if (handleBox === null || targetBox === null) {
    throw new Error('Could not resolve drag source or target bounding box');
  }

  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  // Exceed the 8px activation distance before heading for the target so the drag actually starts.
  await page.mouse.move(handleBox.x + handleBox.width / 2 + 24, handleBox.y + handleBox.height / 2, {
    steps: 6,
  });
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, {
    steps: 12,
  });
  await page.mouse.up();
}
