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

import type { Board, Card } from './types';

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
