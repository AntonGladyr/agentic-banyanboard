/**
 * client/src/components/MoveCardDialog/MoveCardDialog.tsx — keyboard DnD alternative (TASK-007 Phase 4).
 *
 * UI/UX creative Spec 6: the pointer-free way to move a card between columns, mandatory for WCAG 2.1
 * SC 2.1.1. Built on the shared `<Dialog>` primitive (native `<dialog>` focus trap + Escape) so it
 * matches the create-board / edit-card modals. The body is a radio group of the three columns with the
 * card's current column pre-selected; choosing a different column and activating "Move" reports the
 * target status to the parent, which runs the same optimistic-move + rollback path as a pointer drop
 * (AC-HAPPY-5 / AC-ERROR-4). Cancel/Escape close it with no move (AC-NAV-1). It renders nothing when
 * `card` is null, mirroring the edit-card dialog's open-when-non-null pattern.
 */

import { useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import type { Card, CardStatus } from '../../api/types';
import { Dialog } from '../Dialog/Dialog';
import styles from './MoveCardDialog.module.css';

interface MoveCardDialogProps {
  /** The card being moved; `null` keeps the dialog closed. */
  readonly card: Card | null;
  /** Reports the chosen target status. The parent closes the dialog and commits the move. */
  readonly onMove: (targetStatus: CardStatus) => void;
  /** Closes the dialog without moving (Cancel button, Escape, or close ×). */
  readonly onClose: () => void;
}

/** The three columns, in board order, paired with their human labels. */
const COLUMN_OPTIONS: readonly { readonly status: CardStatus; readonly label: string }[] = [
  { status: 'todo', label: 'To Do' },
  { status: 'in_progress', label: 'In Progress' },
  { status: 'done', label: 'Done' },
];

export function MoveCardDialog({ card, onMove, onClose }: MoveCardDialogProps): ReactNode {
  return (
    <Dialog open={card !== null} title="Move card" onClose={onClose}>
      {card !== null ? <MoveCardForm card={card} onMove={onMove} onCancel={onClose} /> : null}
    </Dialog>
  );
}

function MoveCardForm({
  card,
  onMove,
  onCancel,
}: {
  card: Card;
  onMove: (targetStatus: CardStatus) => void;
  onCancel: () => void;
}): ReactNode {
  const [selected, setSelected] = useState<CardStatus>(card.status);

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    onMove(selected);
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <fieldset className={styles.fieldset}>
        <legend className={styles.legend}>Move to column</legend>
        {COLUMN_OPTIONS.map((option) => (
          <label key={option.status} className={styles.option}>
            <input
              type="radio"
              name="move-target"
              value={option.status}
              checked={selected === option.status}
              onChange={() => setSelected(option.status)}
            />
            {option.label}
          </label>
        ))}
      </fieldset>
      <div className={styles.actions}>
        <button type="button" className={styles.secondary} onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className={styles.primary}>
          Move
        </button>
      </div>
    </form>
  );
}
