/**
 * client/src/components/Spinner/Spinner.tsx — loading indicator (TASK-006 Phase 3).
 *
 * UI/UX creative Decision Area 6: a centered CSS spinner with a 200 ms appearance delay so fast
 * localhost calls (< 200 ms) never flash a loading indicator. The delay is implemented purely in
 * CSS (`Spinner.module.css`) — the element renders immediately so screen readers announce the
 * loading state, while the visual ring fades in only after the delay.
 *
 * Accessibility: `role="status"` + `aria-live="polite"` (polite live region) and an accessible name
 * of "Loading content"; the animated ring itself is decorative (`aria-hidden`).
 */

import type { ReactNode } from 'react';
import styles from './Spinner.module.css';

export function Spinner(): ReactNode {
  return (
    <div
      className={styles.container}
      role="status"
      aria-live="polite"
      aria-label="Loading content"
    >
      <span className={styles.ring} aria-hidden="true" />
    </div>
  );
}
