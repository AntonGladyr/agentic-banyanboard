/**
 * client/src/components/Column/Column.tsx — a single kanban column (TASK-006 Phase 4; TASK-007 Phases 3-4).
 *
 * UI/UX creative Decision Area 3 (Option 3A — horizontal kanban). A column is ALWAYS rendered, never
 * conditionally omitted, so all three columns are present even when a board has no cards (AC-HAPPY-3).
 * Rendered as a `<section aria-label={label}>` (a labelled landmark region) with the label as an
 * `<h2>` (page `<h1>` → column `<h2>` → card `<h3>`). The header carries a subtle per-status tint via
 * the `variant` class. With no cards, it shows the "No cards yet" empty state.
 *
 * TASK-007 Phase 3 adds an inline create-card affordance (UI/UX creative Spec 4): when an
 * `onCreateCard` handler is supplied, an always-visible "Add card" footer button expands an inline
 * CardForm at the bottom of the column. Each Column owns its own `isAdding` state.
 *
 * TASK-007 Phase 4 makes the column a `@dnd-kit` drop target (UI/UX creative Spec 6). When a
 * `droppableStatus` is supplied (i.e. the board is interactive), the card area becomes a `useDroppable`
 * zone keyed by that status, and each card is wrapped in a draggable so it can be picked up by its grip
 * handle; the `onRequestMove` handler is forwarded to each card's keyboard "Move" affordance. The hooks
 * are confined to this interactive subtree, so a read-only Column (no `droppableStatus`) never calls
 * them and renders exactly as it did before Phase 4.
 */

import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import type { Card, CardStatus } from '../../api/types';
import { CardForm } from '../CardForm/CardForm';
import type { CardFormValues } from '../CardForm/CardForm';
import { CardItem } from '../CardItem/CardItem';
import { EmptyState } from '../EmptyState/EmptyState';
import styles from './Column.module.css';

/** Column tint variant — maps to a per-status background defined in tokens.css. */
export type ColumnVariant = 'todo' | 'inProgress' | 'done';

interface ColumnProps {
  readonly label: string;
  readonly variant: ColumnVariant;
  readonly cards: readonly Card[];
  /** Creates a card in this column (status pre-bound by the parent). Omit to render no add affordance. */
  readonly onCreateCard?: (values: CardFormValues) => Promise<void>;
  /** Opens the edit-card modal for a card. Forwarded to each CardItem. */
  readonly onEditCard?: (card: Card) => void;
  /**
   * The card status this column represents. When supplied, the column is a `@dnd-kit` drop target and
   * its cards are draggable (interactive board). Omit for a read-only column.
   */
  readonly droppableStatus?: CardStatus;
  /** Opens the keyboard "Move to column" dialog for a card (WCAG SC 2.1.1). Forwarded to each card. */
  readonly onRequestMove?: (card: Card) => void;
  /** Ids of cards just changed by a REMOTE collaborator — they flash the highlight (Phase 5, Spec 7). */
  readonly highlightedCardIds?: ReadonlySet<number>;
}

export function Column({
  label,
  variant,
  cards,
  onCreateCard,
  onEditCard,
  droppableStatus,
  onRequestMove,
  highlightedCardIds,
}: ColumnProps): ReactNode {
  const [isAdding, setIsAdding] = useState(false);
  const addButtonRef = useRef<HTMLButtonElement>(null);

  async function handleCreate(values: CardFormValues): Promise<void> {
    if (onCreateCard === undefined) {
      return;
    }
    // A rejection propagates to the CardForm (safe error, form stays open — AC-ERROR-3).
    await onCreateCard(values);
    setIsAdding(false);
    addButtonRef.current?.focus();
  }

  function cancelAdd(): void {
    setIsAdding(false);
    addButtonRef.current?.focus();
  }

  const cardsContent =
    cards.length === 0 ? (
      <EmptyState heading="No cards yet" />
    ) : (
      <ul className={styles.cardList}>
        {cards.map((card) => (
          <li key={card.id} className={styles.cardListItem}>
            {droppableStatus !== undefined ? (
              <DraggableCard
                card={card}
                onEditCard={onEditCard}
                onRequestMove={onRequestMove}
                recentlyUpdated={highlightedCardIds?.has(card.id) ?? false}
              />
            ) : (
              <CardItem
                card={card}
                onEdit={onEditCard}
                recentlyUpdated={highlightedCardIds?.has(card.id) ?? false}
              />
            )}
          </li>
        ))}
      </ul>
    );

  return (
    <section className={styles.column} aria-label={label}>
      <h2 className={`${styles.header} ${styles[variant]}`}>
        {label}
        <span className={styles.count} aria-hidden="true">
          {cards.length}
        </span>
      </h2>
      {droppableStatus !== undefined ? (
        <DropZone status={droppableStatus}>{cardsContent}</DropZone>
      ) : (
        cardsContent
      )}
      {onCreateCard !== undefined ? (
        <div className={styles.footer}>
          {isAdding ? (
            <CardForm
              formLabel={`Add card to ${label}`}
              submitLabel="Add Card"
              showDescription={false}
              onSubmit={handleCreate}
              onCancel={cancelAdd}
            />
          ) : (
            <button
              ref={addButtonRef}
              type="button"
              className={styles.addCard}
              aria-label={`Add card to ${label} column`}
              onClick={() => setIsAdding(true)}
            >
              + Add card
            </button>
          )}
        </div>
      ) : null}
    </section>
  );
}

/**
 * The droppable card area, keyed by the column's status. `isOver` (true while a dragged card hovers
 * the column) drives a highlight ring so the drop target is obvious (Spec 6). Confined to interactive
 * columns so the hook never runs in read-only isolation tests.
 */
function DropZone({ status, children }: { status: CardStatus; children: ReactNode }): ReactNode {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <div ref={setNodeRef} className={isOver ? `${styles.dropZone} ${styles.dropZoneOver}` : styles.dropZone}>
      {children}
    </div>
  );
}

/**
 * Wraps a CardItem with `@dnd-kit` draggable wiring (Spec 6). The `<article>` is the drag node and the
 * grip handle is the activator; `isDragging` mutes the source while the DragOverlay clone follows the
 * pointer. Keeping the hook here (not in CardItem) means the overlay clone and read-only cards never
 * register a draggable, avoiding duplicate-id collisions.
 */
function DraggableCard({
  card,
  onEditCard,
  onRequestMove,
  recentlyUpdated,
}: {
  card: Card;
  onEditCard?: (card: Card) => void;
  onRequestMove?: (card: Card) => void;
  recentlyUpdated?: boolean;
}): ReactNode {
  const { setNodeRef, setActivatorNodeRef, attributes, listeners, isDragging } = useDraggable({
    id: card.id,
  });
  return (
    <CardItem
      card={card}
      onEdit={onEditCard}
      onMove={onRequestMove}
      recentlyUpdated={recentlyUpdated}
      drag={{ setNodeRef, handleRef: setActivatorNodeRef, attributes, listeners, isDragging }}
    />
  );
}
