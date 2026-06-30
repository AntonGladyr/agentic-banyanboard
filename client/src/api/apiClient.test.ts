/**
 * client/src/api/apiClient.test.ts — typed API client tests (TASK-006 Phase 2; TASK-007 Phase 1).
 *
 * Verifies the contract the pages depend on (Test Strategy: success path maps JSON; failure path
 * surfaces a safe error the UI can render with NO internal detail — Guiding Principle 5):
 *   - success → parsed JSON of the expected type;
 *   - 404 → ApiError category 'notFound';
 *   - other non-2xx (500 / 400) → ApiError category 'server';
 *   - fetch rejection (server unreachable) → ApiError category 'network';
 *   - the surfaced error never carries the raw response body.
 *
 * TASK-007 Phase 1 adds:
 *   - sendJson helper: correct method + path + body + headers (Content-Type + Accept);
 *   - X-Client-Id header sent when originId provided, absent when not;
 *   - 400 (validation) → category 'server' (body never read — GP5);
 *   - write wrappers (createBoard / updateBoard / createCard / updateCard / updateCardStatus)
 *     route to the correct method + path + body shape.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ApiError,
  createBoard,
  createCard,
  getActivity,
  getBoard,
  getBoards,
  getCards,
  updateBoard,
  updateCard,
  updateCardStatus,
} from './apiClient';
import type { ActivityEvent, Board, Card } from './types';
import type { CreateBoardInput, CreateCardInput, UpdateBoardInput, UpdateCardInput } from './types';

function mockFetchResolves(status: number, body: unknown): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    } as Response),
  );
}

/**
 * Like mockFetchResolves but also captures the URL and RequestInit passed to fetch so tests can
 * assert on method, headers, and body without separate fetch-spy calls.
 */
function mockFetchCaptures(
  status: number,
  body: unknown,
): { getCall: () => { url: string; init: RequestInit } } {
  let capturedUrl = '';
  let capturedInit: RequestInit = {};
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
      capturedUrl = url;
      capturedInit = init ?? {};
      return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => body,
      } as Response;
    }),
  );
  return { getCall: () => ({ url: capturedUrl, init: capturedInit }) };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('apiClient — success paths', () => {
  it('getBoards maps the JSON array of boards', async () => {
    const boards: Board[] = [
      {
        id: 1,
        name: 'Alpha',
        description: 'first',
        created_at: '2026-06-20T00:00:00.000Z',
        updated_at: '2026-06-20T00:00:00.000Z',
      },
    ];
    mockFetchResolves(200, boards);

    await expect(getBoards()).resolves.toEqual(boards);
    expect(fetch).toHaveBeenCalledWith('/api/v1/boards', expect.any(Object));
  });

  it('getCards maps the JSON array of cards (including status)', async () => {
    const cards: Card[] = [
      {
        id: 10,
        board_id: 1,
        title: 'Fix login',
        description: null,
        position: 0,
        status: 'in_progress',
        created_at: '2026-06-20T00:00:00.000Z',
        updated_at: '2026-06-20T00:00:00.000Z',
      },
    ];
    mockFetchResolves(200, cards);

    await expect(getCards(1)).resolves.toEqual(cards);
    expect(fetch).toHaveBeenCalledWith('/api/v1/boards/1/cards', expect.any(Object));
  });

  it('getActivity maps the JSON array of activity events from the board-scoped path (TASK-008)', async () => {
    const events: ActivityEvent[] = [
      {
        id: 5,
        board_id: 1,
        card_id: 10,
        card_title: 'Fix login bug',
        from_status: 'todo',
        to_status: 'in_progress',
        actor: 'anonymous',
        occurred_at: '2026-06-30T11:59:30.000Z',
      },
    ];
    mockFetchResolves(200, events);

    await expect(getActivity(1)).resolves.toEqual(events);
    expect(fetch).toHaveBeenCalledWith('/api/v1/boards/1/activity', expect.any(Object));
  });
});

describe('getActivity — failure mapping', () => {
  it('maps a 404 (board not found) to ApiError category "notFound" (AC-ERROR-1)', async () => {
    mockFetchResolves(404, { error: 'Not Found', path: '/api/v1/boards/999/activity' });

    const error = (await getActivity(999).catch((e: unknown) => e)) as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error.category).toBe('notFound');
  });
});

describe('apiClient — failure paths map to safe ApiError categories', () => {
  it('maps a 404 to category "notFound"', async () => {
    mockFetchResolves(404, { error: 'Not Found', path: '/api/v1/boards/999', traceId: 'abc' });

    const error = await getBoard(999).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).category).toBe('notFound');
  });

  it('maps a 500 to category "server"', async () => {
    mockFetchResolves(500, { error: 'Internal Server Error', traceId: 'abc' });

    const error = await getBoards().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).category).toBe('server');
  });

  it('maps a fetch rejection (server unreachable) to category "network"', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    const error = await getBoards().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).category).toBe('network');
  });

  it('never leaks the raw error response body into the surfaced error', async () => {
    const secretBody = { error: 'stack trace: at db.query (secret-internal-detail)' };
    mockFetchResolves(500, secretBody);

    const error = (await getBoards().catch((e: unknown) => e)) as ApiError;
    expect(error.message).not.toContain('secret-internal-detail');
    expect(error.message).not.toContain('stack trace');
  });
});

// ─── TASK-007 Phase 1: sendJson helper + write wrappers ───────────────────────

describe('sendJson — request shape and failure mapping', () => {
  it('sends the correct method, path, JSON body, and Content-Type/Accept headers', async () => {
    const board: Board = {
      id: 42,
      name: 'Sprint 42',
      description: null,
      created_at: '2026-06-21T00:00:00.000Z',
      updated_at: '2026-06-21T00:00:00.000Z',
    };
    const capture = mockFetchCaptures(201, board);

    const input: CreateBoardInput = { name: 'Sprint 42' };
    await createBoard(input);

    const { url, init } = capture.getCall();
    expect(url).toBe('/api/v1/boards');
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify(input));
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    expect((init.headers as Record<string, string>)['Accept']).toBe('application/json');
  });

  it('includes X-Client-Id header when originId is provided, omits it when not', async () => {
    const board: Board = {
      id: 1,
      name: 'Board',
      description: null,
      created_at: '2026-06-21T00:00:00.000Z',
      updated_at: '2026-06-21T00:00:00.000Z',
    };

    // With originId: header must be present
    const captureWith = mockFetchCaptures(201, board);
    await createBoard({ name: 'Board' }, 'client-abc-123');
    const withHeaders = captureWith.getCall().init.headers as Record<string, string>;
    expect(withHeaders['X-Client-Id']).toBe('client-abc-123');

    vi.unstubAllGlobals();

    // Without originId: header must be absent
    const captureWithout = mockFetchCaptures(201, board);
    await createBoard({ name: 'Board' });
    const withoutHeaders = captureWithout.getCall().init.headers as Record<string, string>;
    expect(withoutHeaders['X-Client-Id']).toBeUndefined();
  });

  it('maps a 400 (validation failure) to ApiError category "server" without reading the body', async () => {
    // The body is never read for non-2xx (GP5) — use a secret payload to prove it is not surfaced.
    mockFetchResolves(400, { error: 'validation-secret-detail: name is required' });

    const error = (await createBoard({ name: '' }).catch((e: unknown) => e)) as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error.category).toBe('server');
    expect(error.message).not.toContain('validation-secret-detail');
  });

  it('maps a fetch rejection on a write to ApiError category "network"', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    const error = (await createBoard({ name: 'X' }).catch((e: unknown) => e)) as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error.category).toBe('network');
  });

  it('rethrows a native AbortError unchanged (does not wrap it in ApiError)', async () => {
    const abortError = new DOMException('Aborted', 'AbortError');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abortError));

    const thrown = await createBoard({ name: 'X' }).catch((e: unknown) => e);
    expect(thrown).toBe(abortError);
    expect(thrown).not.toBeInstanceOf(ApiError);
  });
});

describe('write wrappers — method, path, and body routing', () => {
  it('createBoard POSTs to /boards with { name, description }', async () => {
    const board: Board = {
      id: 7,
      name: 'New Board',
      description: 'A description',
      created_at: '2026-06-21T00:00:00.000Z',
      updated_at: '2026-06-21T00:00:00.000Z',
    };
    const capture = mockFetchCaptures(201, board);

    const input: CreateBoardInput = { name: 'New Board', description: 'A description' };
    const result = await createBoard(input);

    const { url, init } = capture.getCall();
    expect(url).toBe('/api/v1/boards');
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify(input));
    expect(result).toEqual(board);
  });

  it('updateBoard PATCHes to /boards/:id with partial input', async () => {
    const board: Board = {
      id: 3,
      name: 'Renamed',
      description: null,
      created_at: '2026-06-21T00:00:00.000Z',
      updated_at: '2026-06-21T00:00:00.000Z',
    };
    const capture = mockFetchCaptures(200, board);

    const input: UpdateBoardInput = { name: 'Renamed' };
    const result = await updateBoard(3, input);

    const { url, init } = capture.getCall();
    expect(url).toBe('/api/v1/boards/3');
    expect(init.method).toBe('PATCH');
    expect(init.body).toBe(JSON.stringify(input));
    expect(result).toEqual(board);
  });

  it('createCard POSTs to /boards/:boardId/cards with title, status, and optional fields', async () => {
    const card: Card = {
      id: 99,
      board_id: 5,
      title: 'Implement websocket handler',
      description: null,
      position: 0,
      status: 'in_progress',
      created_at: '2026-06-21T00:00:00.000Z',
      updated_at: '2026-06-21T00:00:00.000Z',
    };
    const capture = mockFetchCaptures(201, card);

    const input: CreateCardInput = { title: 'Implement websocket handler', status: 'in_progress' };
    const result = await createCard(5, input);

    const { url, init } = capture.getCall();
    expect(url).toBe('/api/v1/boards/5/cards');
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify(input));
    expect(result).toEqual(card);
  });

  it('updateCard PATCHes to /boards/:boardId/cards/:id with partial input', async () => {
    const card: Card = {
      id: 12,
      board_id: 5,
      title: 'Fix login redirect bug',
      description: 'POST /login should redirect',
      position: 0,
      status: 'todo',
      created_at: '2026-06-21T00:00:00.000Z',
      updated_at: '2026-06-21T00:00:00.000Z',
    };
    const capture = mockFetchCaptures(200, card);

    const input: UpdateCardInput = {
      title: 'Fix login redirect bug',
      description: 'POST /login should redirect',
    };
    const result = await updateCard(5, 12, input);

    const { url, init } = capture.getCall();
    expect(url).toBe('/api/v1/boards/5/cards/12');
    expect(init.method).toBe('PATCH');
    expect(init.body).toBe(JSON.stringify(input));
    expect(result).toEqual(card);
  });

  it('updateCardStatus PATCHes to /boards/:boardId/cards/:id with { status } only', async () => {
    const card: Card = {
      id: 12,
      board_id: 5,
      title: 'Fix login bug',
      description: null,
      position: 0,
      status: 'in_progress',
      created_at: '2026-06-21T00:00:00.000Z',
      updated_at: '2026-06-21T00:00:00.000Z',
    };
    const capture = mockFetchCaptures(200, card);

    const result = await updateCardStatus(5, 12, 'in_progress');

    const { url, init } = capture.getCall();
    expect(url).toBe('/api/v1/boards/5/cards/12');
    expect(init.method).toBe('PATCH');
    expect(init.body).toBe(JSON.stringify({ status: 'in_progress' }));
    expect(result).toEqual(card);
  });
});
