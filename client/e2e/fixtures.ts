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
