/**
 * client/src/components/EmptyState/EmptyState.tsx — reusable empty-content placeholder (TASK-006 Phase 3).
 *
 * UI/UX creative Decision Area 7: text-only empty states with clear copy (no illustration). Used by
 * the board list (`No boards yet`) in Phase 3 and by empty kanban columns (`No cards yet`) in
 * Phase 4. The heading is a styled paragraph rather than a heading element so the component can be
 * dropped into any context without disturbing the page's heading hierarchy.
 */

import type { ReactNode } from 'react';
import styles from './EmptyState.module.css';

interface EmptyStateProps {
  readonly heading: string;
  readonly message?: string;
}

export function EmptyState({ heading, message }: EmptyStateProps): ReactNode {
  return (
    <div className={styles.container}>
      <p className={styles.heading}>{heading}</p>
      {message !== undefined ? <p className={styles.message}>{message}</p> : null}
    </div>
  );
}
