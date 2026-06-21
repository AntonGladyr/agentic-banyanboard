/**
 * client/src/api/errorCopy.ts — centralized, safe error copy (TASK-006 Phase 3; TASK-007 Phase 1).
 *
 * Maps a safe {@link ApiErrorCategory} to the exact user-facing heading + message strings defined in
 * the UI/UX creative phase (Decision Area 8). Keeping the copy here — keyed only on the category —
 * guarantees the UI never renders internal error detail (Guiding Principle 5 / NFR4) and keeps the
 * canonical strings in one place for both pages and their tests.
 *
 * Phase 3 defines the board-list copy; Phase 4 adds the board-view copy (`boardViewErrorCopy`);
 * Phase 1 of TASK-007 adds the write-error copy (`writeErrorCopy`) and the drag-revert copy
 * (`dragRevertErrorCopy`).
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

/**
 * Copy for a failed `GET /api/v1/boards/:id` (or its cards) on the board view page (AC-ERROR-2).
 * Unlike the list, `notFound` IS meaningful here — an id in the URL can reference a board that does
 * not exist. The board view always renders a back-nav recovery link alongside this copy.
 */
export function boardViewErrorCopy(category: ApiErrorCategory): ErrorCopy {
  switch (category) {
    case 'notFound':
      return {
        heading: 'Board not found',
        message: 'This board does not exist or may have been removed.',
      };
    case 'network':
      return {
        heading: 'Could not load board',
        message: 'The server is not reachable. Make sure it is running and try again.',
      };
    case 'server':
      return {
        heading: 'Something went wrong',
        message: 'An error occurred while loading this board. Please try again later.',
      };
  }
}

// ─── Write-error copy (TASK-007 Phase 1) ──────────────────────────────────────

/**
 * Copy for a failed create or edit write operation (AC-ERROR-3). `notFound` can theoretically
 * occur on a PATCH to a deleted resource — fold it into the generic server copy rather than
 * surfacing "not found" for an action the user just tried to perform.
 */
export function writeErrorCopy(category: ApiErrorCategory): ErrorCopy {
  switch (category) {
    case 'network':
      return {
        heading: 'Could not save changes',
        message: 'The server is not reachable. Check your connection and try again.',
      };
    // `notFound` on a write means the resource was deleted concurrently — treat as server error.
    case 'notFound':
    case 'server':
      return {
        heading: "Couldn't save changes",
        message: 'Something went wrong while saving. Please try again.',
      };
  }
}

/**
 * Static copy for the optimistic drag-and-drop rollback case (AC-ERROR-4): the card move was
 * attempted, the backend rejected it, and the UI has already reverted the card to its original
 * column. Copy conveys that the move failed and was undone, with encouragement to retry.
 */
export function dragRevertErrorCopy(): ErrorCopy {
  return {
    heading: 'Move could not be saved',
    message: 'The card has been returned to its original column. Please try moving it again.',
  };
}
