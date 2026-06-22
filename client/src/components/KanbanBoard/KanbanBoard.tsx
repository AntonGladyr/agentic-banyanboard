/**
 * client/src/components/KanbanBoard/KanbanBoard.tsx — three-column kanban container (TASK-006 Phase 4; TASK-007 Phases 3-4).
 *
 * UI/UX creative Decision Area 3 (Option 3A): a CSS Grid of three equal-width `Column`s inside an
 * `overflow-x: auto` wrapper so all three columns stay visible and horizontally scrollable on tablet
 * widths without stacking. Card partitioning by `status` happens in the page; this component just
 * places the already-partitioned card sets into the To Do / In Progress / Done columns left-to-right.
 *
 * TASK-007 Phase 3: when the page supplies create/edit handlers, this binds each column's status into
 * `onCreateCard` so the inline create form is pre-scoped, and forwards `onEditCard` to every card.
 *
 * TASK-007 Phase 4 wires drag-and-drop (Architecture Decision 4 — `@dnd-kit`; UI/UX Spec 6). When an
 * `onMoveCard` commit handler is supplied the board becomes interactive: it is wrapped in a
 * `DndContext` (pointer + keyboard sensors), each column is a drop target and its cards are draggable,
 * and a `DragOverlay` renders the in-flight card clone. On drop, {@link resolveCardMove} maps the
 * dragged card + the column it landed over to a move, which is committed via `onMoveCard` (the page
 * runs the optimistic update + rollback). `onRequestMove` opens the keyboard "Move" alternative. With
 * no `onMoveCard` the board renders read-only exactly as before (no DnD context, no draggables).
 */

import { useState } from 'react';
import type { ReactNode } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import type { Card, CardStatus } from '../../api/types';
import { CARD_STATUSES } from '../../api/types';
import { Column } from '../Column/Column';
import { CardItem } from '../CardItem/CardItem';
import type { CardFormValues } from '../CardForm/CardForm';
import styles from './KanbanBoard.module.css';

/**
 * Resolve a drag drop into a status-change move. Returns the dragged card and its target status only
 * when the card landed over a DIFFERENT column (`overId` is one of the three column statuses); returns
 * `null` for a same-column drop, a drop outside any column, an unknown status, or an unknown card.
 * This is the pure decision `onDragEnd` relies on — whether `updateCardStatus` runs (AC-HAPPY-5).
 */
export function resolveCardMove(
  activeCardId: number,
  overId: string | null,
  cards: readonly Card[],
): { card: Card; targetStatus: CardStatus } | null {
  if (overId === null || !CARD_STATUSES.includes(overId as CardStatus)) {
    return null;
  }
  const card = cards.find((candidate) => candidate.id === activeCardId);
  if (card === undefined || card.status === overId) {
    return null;
  }
  return { card, targetStatus: overId as CardStatus };
}

interface KanbanBoardProps {
  readonly todoCards: readonly Card[];
  readonly inProgressCards: readonly Card[];
  readonly doneCards: readonly Card[];
  /** Creates a card with the given status (the column binds its own). Omit for a read-only board. */
  readonly onCreateCard?: (status: CardStatus, values: CardFormValues) => Promise<void>;
  /** Opens the edit-card modal for a card. Omit for a read-only board. */
  readonly onEditCard?: (card: Card) => void;
  /** Commits a card move to a new status (drag drop or keyboard). Presence enables drag-and-drop. */
  readonly onMoveCard?: (card: Card, targetStatus: CardStatus) => void;
  /** Opens the keyboard "Move to column" dialog for a card (WCAG SC 2.1.1). */
  readonly onRequestMove?: (card: Card) => void;
  /** Ids of cards just changed by a REMOTE collaborator — they flash the highlight (Phase 5, Spec 7). */
  readonly highlightedCardIds?: ReadonlySet<number>;
}

export function KanbanBoard({
  todoCards,
  inProgressCards,
  doneCards,
  onCreateCard,
  onEditCard,
  onMoveCard,
  onRequestMove,
  highlightedCardIds,
}: KanbanBoardProps): ReactNode {
  const [activeId, setActiveId] = useState<number | null>(null);
  const sensors = useSensors(
    // An 8px activation distance so a click to open the edit/move buttons is not read as a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const interactive = onMoveCard !== undefined;

  /** Bind a column's status into the create handler so its inline form is pre-scoped (AC-HAPPY-3). */
  function createInColumn(status: CardStatus): ((values: CardFormValues) => Promise<void>) | undefined {
    return onCreateCard === undefined ? undefined : (values) => onCreateCard(status, values);
  }

  const grid = (
    <div className={styles.scroller}>
      <div className={styles.grid}>
        <Column
          label="To Do"
          variant="todo"
          cards={todoCards}
          droppableStatus={interactive ? 'todo' : undefined}
          onCreateCard={createInColumn('todo')}
          onEditCard={onEditCard}
          onRequestMove={onRequestMove}
          highlightedCardIds={highlightedCardIds}
        />
        <Column
          label="In Progress"
          variant="inProgress"
          cards={inProgressCards}
          droppableStatus={interactive ? 'in_progress' : undefined}
          onCreateCard={createInColumn('in_progress')}
          onEditCard={onEditCard}
          onRequestMove={onRequestMove}
          highlightedCardIds={highlightedCardIds}
        />
        <Column
          label="Done"
          variant="done"
          cards={doneCards}
          droppableStatus={interactive ? 'done' : undefined}
          onCreateCard={createInColumn('done')}
          onEditCard={onEditCard}
          onRequestMove={onRequestMove}
          highlightedCardIds={highlightedCardIds}
        />
      </div>
    </div>
  );

  if (!interactive) {
    return grid;
  }

  const allCards = [...todoCards, ...inProgressCards, ...doneCards];
  const activeCard = activeId === null ? null : allCards.find((card) => card.id === activeId) ?? null;

  function handleDragStart(event: DragStartEvent): void {
    setActiveId(Number(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent): void {
    setActiveId(null);
    const overId = event.over === null ? null : String(event.over.id);
    const move = resolveCardMove(Number(event.active.id), overId, allCards);
    if (move !== null && onMoveCard !== undefined) {
      onMoveCard(move.card, move.targetStatus);
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      {grid}
      <DragOverlay>{activeCard !== null ? <CardItem card={activeCard} /> : null}</DragOverlay>
    </DndContext>
  );
}
