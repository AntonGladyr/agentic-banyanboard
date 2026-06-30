/**
 * client/src/api/apiClient.ts — typed API client for the Express backend (TASK-006 Phase 2).
 *
 * The single integration point between the SPA and `/api/v1`. Every backend call goes through the
 * `getJson` wrapper, which:
 *   - calls the RELATIVE path `/api/v1/...` (single-origin in dev via the Vite proxy and in prod
 *     via Express static serving — Architecture creative Q1c/Q1e), so no absolute base URL is
 *     baked into the bundle;
 *   - maps every failure mode to a typed {@link ApiError} carrying a SAFE category
 *     (`network` | `notFound` | `server`) and a generic developer-facing message — it NEVER reads
 *     the raw error response body or carries a stack into user-visible space (Guiding Principle 5 /
 *     NFR4: users see category-driven copy chosen by the UI, never internal detail).
 *
 * Pages render error copy keyed on `ApiError.category` (UI/UX creative Decision Area 8). Aborted
 * requests (component unmount via `AbortController`) rethrow the native `AbortError` unchanged so
 * callers can ignore them rather than render a spurious error state.
 */

import type {
  ActivityEvent,
  Board,
  Card,
  CreateBoardInput,
  CreateCardInput,
  UpdateBoardInput,
  UpdateCardInput,
} from './types';
import type { CardStatus } from './types';

/**
 * Relative API base — single-origin in both dev (Vite proxy) and prod (Express static serving), so
 * no host is hardcoded (Guiding Principle 1; Architecture creative Q1e).
 */
export const API_BASE = '/api/v1';

/** Safe, user-facing error categories. UI copy is keyed on these — never on raw server detail. */
export type ApiErrorCategory = 'network' | 'notFound' | 'server';

/**
 * A typed, safe-to-surface error. `category` drives the UI copy; `message` is a generic,
 * client-constructed string for the console/error reporter only (carries no server body or stack).
 */
export class ApiError extends Error {
  readonly category: ApiErrorCategory;

  constructor(category: ApiErrorCategory, message: string) {
    super(message);
    this.name = 'ApiError';
    this.category = category;
    // Restore the prototype chain when targeting older transpilation (safe no-op otherwise).
    Object.setPrototypeOf(this, ApiError.prototype);
  }
}

/** True when an unknown thrown value is a fetch abort (component unmount / cancelled request). */
function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError';
}

/**
 * Fetch JSON from a backend path, mapping every failure to a safe {@link ApiError}. The raw error
 * response body is deliberately never read into the error (Guiding Principle 5). Aborts rethrow
 * the native `AbortError` so callers can distinguish cancellation from a real failure.
 */
async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      headers: { Accept: 'application/json' },
      signal,
    });
  } catch (err) {
    if (isAbortError(err)) {
      throw err; // cancellation, not a failure — caller ignores it
    }
    // fetch rejects (TypeError) when the server is unreachable / connection refused.
    throw new ApiError('network', `Network request to ${path} failed`);
  }

  if (!response.ok) {
    if (response.status === 404) {
      throw new ApiError('notFound', `Resource ${path} was not found`);
    }
    // Status code is standard HTTP metadata (not internal server detail); the body is never read.
    throw new ApiError('server', `Request to ${path} failed with status ${response.status}`);
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new ApiError('server', `Response from ${path} was not valid JSON`);
  }
}

/** GET /api/v1/boards — list all boards (empty array when none exist). */
export function getBoards(signal?: AbortSignal): Promise<Board[]> {
  return getJson<Board[]>('/boards', signal);
}

/** GET /api/v1/boards/:id — read one board (`notFound` category when the id does not exist). */
export function getBoard(id: number | string, signal?: AbortSignal): Promise<Board> {
  return getJson<Board>(`/boards/${id}`, signal);
}

/** GET /api/v1/boards/:boardId/cards — list a board's cards (empty array when none exist). */
export function getCards(boardId: number | string, signal?: AbortSignal): Promise<Card[]> {
  return getJson<Card[]>(`/boards/${boardId}/cards`, signal);
}

/**
 * GET /api/v1/boards/:boardId/activity — list a board's activity events, newest first (TASK-008
 * Phase 3). Returns an empty array when the board has no recorded moves; surfaces a `notFound`
 * {@link ApiError} when the board id does not exist (AC-ERROR-1).
 */
export function getActivity(
  boardId: number | string,
  signal?: AbortSignal,
): Promise<ActivityEvent[]> {
  return getJson<ActivityEvent[]>(`/boards/${boardId}/activity`, signal);
}

// ─── Write helpers (TASK-007 Phase 1) ─────────────────────────────────────────

/**
 * POST/PATCH JSON to a backend path, mapping every failure to a safe {@link ApiError}. Mirrors
 * `getJson` for write operations. The raw error response body is deliberately never read
 * (Guiding Principle 5). Aborts rethrow the native `AbortError` unchanged.
 *
 * The optional `originId` is an opaque per-tab UUID used for echo-deduplication of SSE events in
 * Phase 5 (not auth/secret — safe to send as `X-Client-Id`).
 */
async function sendJson<T>(
  method: string,
  path: string,
  body: unknown,
  originId?: string,
  signal?: AbortSignal,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(originId ? { 'X-Client-Id': originId } : {}),
      },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (isAbortError(err)) {
      throw err; // cancellation, not a failure — caller ignores it
    }
    // fetch rejects (TypeError) when the server is unreachable / connection refused.
    throw new ApiError('network', `Network request to ${path} failed`);
  }

  if (!response.ok) {
    if (response.status === 404) {
      throw new ApiError('notFound', `Resource ${path} was not found`);
    }
    // Status code is standard HTTP metadata; the body is never read (GP5).
    throw new ApiError('server', `Request to ${path} failed with status ${response.status}`);
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new ApiError('server', `Response from ${path} was not valid JSON`);
  }
}

/** POST /api/v1/boards — create a new board. */
export function createBoard(
  input: CreateBoardInput,
  originId?: string,
  signal?: AbortSignal,
): Promise<Board> {
  return sendJson<Board>('POST', '/boards', input, originId, signal);
}

/** PATCH /api/v1/boards/:id — partial update of a board. */
export function updateBoard(
  id: number | string,
  input: UpdateBoardInput,
  originId?: string,
  signal?: AbortSignal,
): Promise<Board> {
  return sendJson<Board>('PATCH', `/boards/${id}`, input, originId, signal);
}

/** POST /api/v1/boards/:boardId/cards — create a new card on a board. */
export function createCard(
  boardId: number | string,
  input: CreateCardInput,
  originId?: string,
  signal?: AbortSignal,
): Promise<Card> {
  return sendJson<Card>('POST', `/boards/${boardId}/cards`, input, originId, signal);
}

/** PATCH /api/v1/boards/:boardId/cards/:id — partial update of a card. */
export function updateCard(
  boardId: number | string,
  cardId: number | string,
  input: UpdateCardInput,
  originId?: string,
  signal?: AbortSignal,
): Promise<Card> {
  return sendJson<Card>('PATCH', `/boards/${boardId}/cards/${cardId}`, input, originId, signal);
}

/**
 * PATCH /api/v1/boards/:boardId/cards/:id — update only the `status` field of a card.
 * Convenience wrapper used by drag-and-drop column moves (Phase 5).
 */
export function updateCardStatus(
  boardId: number | string,
  cardId: number | string,
  status: CardStatus,
  originId?: string,
  signal?: AbortSignal,
): Promise<Card> {
  return sendJson<Card>(
    'PATCH',
    `/boards/${boardId}/cards/${cardId}`,
    { status },
    originId,
    signal,
  );
}
