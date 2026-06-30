/**
 * client/src/components/ActivityFeed/ActivityFeed.tsx — read-only realtime activity feed (TASK-008 Phase 3).
 *
 * Renders the board-scoped activity feed panel decided in the UI/UX creative (Option 4 — right sidebar
 * on desktop, stacked below the kanban on tablet via the `.boardLayout` grid in `BoardViewPage`). The
 * component is self-contained and renders one of three mutually-exclusive content states beneath an
 * always-present "Activity" heading:
 *   - loading → <Spinner>                                   (AC-LOADING-1)
 *   - error   → compact <ErrorMessage> (non-fatal — board still renders) (UI/UX § Error State)
 *   - success → empty state ("No activity yet", AC-EMPTY-1) OR an ordered <ul> of move entries
 *               (newest first — AC-LOAD-1; each shows title, from → to, relative timestamp — AC-ENTRY-1)
 *
 * Live entries: the page prepends new SSE `activity:card_moved` entries and passes the new row's id as
 * `newestEntryId`; that entry gets the `.newEntry` highlight class for one animation cycle (UI/UX
 * § Decision Area 4). Accessibility (UI/UX § Decision Area 5): `<aside>` landmark, `role="list"` +
 * `aria-live="polite"` on the list (announces additions without interrupting), a natural-language
 * `aria-label` per entry, and a keyboard-scrollable container. No interactive controls in v1.
 */

import type { ReactNode } from 'react';
import type { ActivityEvent } from '../../api/types';
import { statusLabel } from '../../api/labels';
import { formatRelative } from '../../api/formatRelative';
import { EmptyState } from '../EmptyState/EmptyState';
import { ErrorMessage } from '../ErrorMessage/ErrorMessage';
import { Spinner } from '../Spinner/Spinner';
import styles from './ActivityFeed.module.css';

/** Load state of the feed's own data fetch — independent of the board/cards fetch (non-fatal). */
export type ActivityFeedLoadState = 'loading' | 'success' | 'error';

interface ActivityFeedProps {
  /** Activity entries, already ordered newest-first by the caller. */
  readonly entries: readonly ActivityEvent[];
  /** State of the `getActivity` fetch driving this panel. */
  readonly loadState: ActivityFeedLoadState;
  /** Id of the most recently prepended live entry, briefly highlighted; `null` when none. */
  readonly newestEntryId: number | null;
}

/** Canonical empty-state copy (AC-EMPTY-1 assertion target). */
export const EMPTY_COPY = 'No activity yet';
/** Canonical feed-error copy (non-fatal; the board still renders — UI/UX § Error State). */
export const ERROR_COPY = {
  heading: 'Could not load activity',
  message: 'Try reloading the page.',
} as const;

/** Render one activity entry as an accessible `<li>` (title / from → to / relative timestamp). */
function renderEntry(entry: ActivityEvent, isNew: boolean): ReactNode {
  const fromLabel = statusLabel(entry.from_status);
  const toLabel = statusLabel(entry.to_status);
  // Natural-language label so screen readers convey the move despite the abbreviated visual layout.
  const ariaLabel = `${entry.card_title} moved from ${fromLabel} to ${toLabel} ${formatRelative(
    entry.occurred_at,
  )}`;
  return (
    <li
      key={entry.id}
      className={isNew ? `${styles.entry} ${styles.newEntry}` : styles.entry}
      aria-label={ariaLabel}
    >
      <span className={styles.entryTitle}>{entry.card_title}</span>
      <span className={styles.entryMove}>
        {/* Arrow is decorative — the move direction is also in the entry's aria-label. */}
        {fromLabel} <span aria-hidden="true">→</span> {toLabel}
      </span>
      <span className={styles.entryTimestamp} title={new Date(entry.occurred_at).toISOString()}>
        {formatRelative(entry.occurred_at)}
      </span>
    </li>
  );
}

export function ActivityFeed({ entries, loadState, newestEntryId }: ActivityFeedProps): ReactNode {
  return (
    <aside className={styles.panel} aria-labelledby="activity-heading">
      <h2 id="activity-heading" className={styles.heading}>
        Activity
      </h2>
      {renderContent(entries, loadState, newestEntryId)}
    </aside>
  );
}

/** Pick the mutually-exclusive content state for the panel body. */
function renderContent(
  entries: readonly ActivityEvent[],
  loadState: ActivityFeedLoadState,
  newestEntryId: number | null,
): ReactNode {
  if (loadState === 'loading') {
    return <Spinner />;
  }
  if (loadState === 'error') {
    return <ErrorMessage heading={ERROR_COPY.heading} message={ERROR_COPY.message} />;
  }
  if (entries.length === 0) {
    return <EmptyState heading={EMPTY_COPY} />;
  }
  return (
    <div
      className={styles.feedScroller}
      tabIndex={0}
      role="group"
      aria-label="Activity history, scroll to see more"
    >
      <ul
        className={styles.list}
        role="list"
        aria-live="polite"
        aria-atomic="false"
        aria-relevant="additions"
      >
        {entries.map((entry) => renderEntry(entry, entry.id === newestEntryId))}
      </ul>
    </div>
  );
}
