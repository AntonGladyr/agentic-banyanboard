/**
 * client/src/api/labels.ts — human-readable display labels for API enum values (TASK-008 Phase 3).
 *
 * The card `status` values are stored on the backend as `'todo' | 'in_progress' | 'done'` (single
 * source of truth in `src/validation/card.ts`). The activity feed renders the from/to columns of a
 * move, so it needs the human-facing column names. Keeping this map here (alongside the `CARD_STATUSES`
 * constant in `types.ts`) gives both the feed and its tests one source of truth for the labels.
 */

/** Display labels for each card status, keyed by the stored DB value. */
const STATUS_LABELS: Record<string, string> = {
  todo: 'To Do',
  in_progress: 'In Progress',
  done: 'Done',
};

/**
 * Map a stored card status (`'todo' | 'in_progress' | 'done'`) to its human-readable column label
 * ("To Do" / "In Progress" / "Done"). Falls back to the raw value for any unknown status so a future
 * column never renders as blank.
 */
export function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}
