/**
 * client/src/components/ErrorMessage/ErrorMessage.tsx — error display block (TASK-006 Phase 3).
 *
 * UI/UX creative Decision Area 8: an inline, page-level error block with category-driven copy and
 * an optional recovery affordance. The copy itself is chosen by the caller from the centralized
 * `errorCopy` helper, keyed on the safe `ApiError.category` — this component never receives or shows
 * internal error detail (Guiding Principle 5 / NFR4).
 *
 * Accessibility: `role="alert"` so assistive tech announces the error on render without user action.
 * The heading is an `<h2>` to preserve the page heading hierarchy (page `<h1>` → error `<h2>`). When
 * `backLink` is set, a `← Back to boards` link to `/` is rendered as a recovery affordance.
 */

import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import styles from './ErrorMessage.module.css';

interface ErrorMessageProps {
  readonly heading: string;
  readonly message: string;
  /** When true, render a `← Back to boards` recovery link to `/` (board view error states). */
  readonly backLink?: boolean;
}

export function ErrorMessage({ heading, message, backLink = false }: ErrorMessageProps): ReactNode {
  return (
    <div className={styles.container} role="alert">
      <h2 className={styles.heading}>{heading}</h2>
      <p className={styles.message}>{message}</p>
      {backLink ? (
        <Link to="/" className={styles.recovery}>
          ← Back to boards
        </Link>
      ) : null}
    </div>
  );
}
