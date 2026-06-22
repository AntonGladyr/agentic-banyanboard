/**
 * client/src/components/Column/Column.tsx — a single kanban column (TASK-006 Phase 4; TASK-007 Phase 3).
 *
 * UI/UX creative Decision Area 3 (Option 3A — horizontal kanban). A column is ALWAYS rendered, never
 * conditionally omitted, so all three columns are present even when a board has no cards (AC-HAPPY-3).
 * Rendered as a `<section aria-label={label}>` (a labelled landmark region) with the label as an
 * `<h2>` (page `<h1>` → column `<h2>` → card `<h3>`). The header carries a subtle per-status tint via
 * the `variant` class. With no cards, it shows the "No cards yet" empty state.
 *
 * TASK-007 Phase 3 adds an inline create-card affordance (UI/UX creative Spec 4): when an
 * `onCreateCard` handler is supplied, an always-visible "Add card" footer button expands an inline
 * CardForm at the bottom of the column. The form is title-only (`showDescription={false}`) and its
 * status is pre-scoped to the column by the parent that binds `onCreateCard` (AC-HAPPY-3). On success
 * the parent appends the card and the form collapses; Cancel/Escape collapses with no write (AC-NAV-1).
 * Each Column owns its own `isAdding` state, so opening the form in one column never affects another.
 * Read-only Columns (no `onCreateCard`) render no add affordance.
 */

import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { Card } from '../../api/types';
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
}

export function Column({ label, variant, cards, onCreateCard, onEditCard }: ColumnProps): ReactNode {
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

  return (
    <section className={styles.column} aria-label={label}>
      <h2 className={`${styles.header} ${styles[variant]}`}>
        {label}
        <span className={styles.count} aria-hidden="true">
          {cards.length}
        </span>
      </h2>
      {cards.length === 0 ? (
        <EmptyState heading="No cards yet" />
      ) : (
        <ul className={styles.cardList}>
          {cards.map((card) => (
            <li key={card.id} className={styles.cardListItem}>
              <CardItem card={card} onEdit={onEditCard} />
            </li>
          ))}
        </ul>
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
