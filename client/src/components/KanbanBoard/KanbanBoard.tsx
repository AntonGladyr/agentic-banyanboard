/**
 * client/src/components/KanbanBoard/KanbanBoard.tsx — three-column kanban container (TASK-006 Phase 4).
 *
 * UI/UX creative Decision Area 3 (Option 3A): a CSS Grid of three equal-width `Column`s inside an
 * `overflow-x: auto` wrapper so all three columns stay visible and horizontally scrollable on tablet
 * widths without stacking. Card partitioning by `status` happens in the page; this component just
 * places the already-partitioned card sets into the To Do / In Progress / Done columns left-to-right.
 */

import type { ReactNode } from 'react';
import type { Card } from '../../api/types';
import { Column } from '../Column/Column';
import styles from './KanbanBoard.module.css';

interface KanbanBoardProps {
  readonly todoCards: readonly Card[];
  readonly inProgressCards: readonly Card[];
  readonly doneCards: readonly Card[];
}

export function KanbanBoard({ todoCards, inProgressCards, doneCards }: KanbanBoardProps): ReactNode {
  return (
    <div className={styles.scroller}>
      <div className={styles.grid}>
        <Column label="To Do" variant="todo" cards={todoCards} />
        <Column label="In Progress" variant="inProgress" cards={inProgressCards} />
        <Column label="Done" variant="done" cards={doneCards} />
      </div>
    </div>
  );
}
