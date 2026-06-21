/**
 * client/src/api/apiClient.test.ts — typed API client tests (TASK-006 Phase 2).
 *
 * Verifies the contract the pages depend on (Test Strategy: success path maps JSON; failure path
 * surfaces a safe error the UI can render with NO internal detail — Guiding Principle 5):
 *   - success → parsed JSON of the expected type;
 *   - 404 → ApiError category 'notFound';
 *   - other non-2xx (500) → ApiError category 'server';
 *   - fetch rejection (server unreachable) → ApiError category 'network';
 *   - the surfaced error never carries the raw response body.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, getBoard, getBoards, getCards } from './apiClient';
import type { Board, Card } from './types';

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
