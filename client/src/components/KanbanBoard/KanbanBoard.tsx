/**
 * client/src/components/KanbanBoard/KanbanBoard.tsx — three-column kanban container (TASK-006 Phase 4; TASK-007 Phase 3).
 *
 * UI/UX creative Decision Area 3 (Option 3A): a CSS Grid of three equal-width `Column`s inside an
 * `overflow-x: auto` wrapper so all three columns stay visible and horizontally scrollable on tablet
 * widths without stacking. Card partitioning by `status` happens in the page; this component just
 * places the already-partitioned card sets into the To Do / In Progress / Done columns left-to-right.
 *
 * TASK-007 Phase 3: when the page supplies interaction handlers, this component binds each column's
 * status into `onCreateCard` so the per-column inline create form is pre-scoped to the right status
 * (AC-HAPPY-3), and forwards `onEditCard` to every card. The handlers are optional so the component
 * still renders read-only when they are absent.
 */

import type { ReactNode } from 'react';
import type { Card, CardStatus } from '../../api/types';
import { Column } from '../Column/Column';
import type { CardFormValues } from '../CardForm/CardForm';
import styles from './KanbanBoard.module.css';

interface KanbanBoardProps {
  readonly todoCards: readonly Card[];
  readonly inProgressCards: readonly Card[];
  readonly doneCards: readonly Card[];
  /** Creates a card with the given status (the column binds its own). Omit for a read-only board. */
  readonly onCreateCard?: (status: CardStatus, values: CardFormValues) => Promise<void>;
  /** Opens the edit-card modal for a card. Omit for a read-only board. */
  readonly onEditCard?: (card: Card) => void;
}

export function KanbanBoard({
  todoCards,
  inProgressCards,
  doneCards,
  onCreateCard,
  onEditCard,
}: KanbanBoardProps): ReactNode {
  /** Bind a column's status into the create handler so its inline form is pre-scoped (AC-HAPPY-3). */
  function createInColumn(status: CardStatus): ((values: CardFormValues) => Promise<void>) | undefined {
    return onCreateCard === undefined ? undefined : (values) => onCreateCard(status, values);
  }

  return (
    <div className={styles.scroller}>
      <div className={styles.grid}>
        <Column
          label="To Do"
          variant="todo"
          cards={todoCards}
          onCreateCard={createInColumn('todo')}
          onEditCard={onEditCard}
        />
        <Column
          label="In Progress"
          variant="inProgress"
          cards={inProgressCards}
          onCreateCard={createInColumn('in_progress')}
          onEditCard={onEditCard}
        />
        <Column
          label="Done"
          variant="done"
          cards={doneCards}
          onCreateCard={createInColumn('done')}
          onEditCard={onEditCard}
        />
      </div>
    </div>
  );
}
