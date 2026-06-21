/**
 * client/src/api/errorCopy.ts — centralized, safe error copy (TASK-006 Phase 3).
 *
 * Maps a safe {@link ApiErrorCategory} to the exact user-facing heading + message strings defined in
 * the UI/UX creative phase (Decision Area 8). Keeping the copy here — keyed only on the category —
 * guarantees the UI never renders internal error detail (Guiding Principle 5 / NFR4) and keeps the
 * canonical strings in one place for both pages and their tests.
 *
 * Phase 3 defines the board-list copy; Phase 4 adds the board-view copy (`boardViewErrorCopy`).
 */

import type { ApiErrorCategory } from './apiClient';

export interface ErrorCopy {
  readonly heading: string;
  readonly message: string;
}

/**
 * Copy for a failed `GET /api/v1/boards` on the board list page (AC-ERROR-1). `notFound` is not a
 * meaningful outcome for the list (there is no id), so it falls through to the generic server copy.
 */
export function boardListErrorCopy(category: ApiErrorCategory): ErrorCopy {
  switch (category) {
    case 'network':
      return {
        heading: 'Could not load boards',
        message: 'The server is not reachable. Make sure it is running and try again.',
      };
    // `notFound` cannot occur for the list (no id is requested) — fold it into the generic copy.
    case 'notFound':
    case 'server':
      return {
        heading: 'Something went wrong',
        message: 'An error occurred while loading boards. Please try again later.',
      };
  }
}
