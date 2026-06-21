/**
 * client/src/components/BoardEntry/BoardEntry.tsx — a single board list row (TASK-006 Phase 3).
 *
 * UI/UX creative Decision Area 2 (Option 2B — vertical list): one `<li>` whose entire content is a
 * react-router `<Link>` to `/boards/:id`. Wrapping the whole row in the link gives a large click /
 * focus target and a single tab stop per entry (better keyboard a11y). The board name is prominent;
 * the description (when present) is muted secondary text beneath it.
 */

import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { Board } from '../../api/types';
import styles from './BoardEntry.module.css';

interface BoardEntryProps {
  readonly board: Board;
}

export function BoardEntry({ board }: BoardEntryProps): ReactNode {
  return (
    <li className={styles.entry}>
      <Link to={`/boards/${board.id}`} className={styles.link}>
        <span className={styles.name}>{board.name}</span>
        {board.description !== null && board.description !== '' ? (
          <span className={styles.description}>{board.description}</span>
        ) : null}
      </Link>
    </li>
  );
}
