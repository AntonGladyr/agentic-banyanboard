/**
 * client/src/components/CardItem/CardItem.tsx — individual card tile (TASK-006 Phase 4; TASK-007 Phases 3-4).
 *
 * UI/UX creative Decision Area 4 (Option 4A — title + description, no status badge): column
 * placement already communicates status, so the card stays minimal. Rendered as an `<article>`
 * (a self-contained content unit). Heading hierarchy: page `<h1>` → column `<h2>` → card `<h3>`.
 * The description is muted secondary text and is omitted entirely when null/empty.
 *
 * TASK-007 Phase 3 adds an edit affordance (UI/UX creative Spec 5): when an `onEdit` handler is
 * supplied, an edit (✎) button is rendered. It is always present in the DOM (so it is keyboard
 * reachable) but visually revealed on card hover / `:focus-within` to keep the board uncluttered.
 *
 * TASK-007 Phase 4 adds drag-and-drop affordances (UI/UX creative Spec 6). This component stays
 * presentational — the `@dnd-kit` `useDraggable` hook lives in the Column wrapper, which passes the
 * resulting wiring down via the optional `drag` prop. When present, the `<article>` becomes the drag
 * node and a grip (⠿) handle becomes the drag activator; the `isDragging` flag mutes the source card
 * while its clone is shown in the DragOverlay. An optional `onMove` handler renders a keyboard "Move"
 * (⤢) button — the pointer-free alternative that opens the MoveCardDialog (WCAG 2.1 SC 2.1.1). The
 * DragOverlay clone and read-only boards render neither affordance (no `drag`/`onMove`).
 */

import type { ReactNode } from 'react';
import type { DraggableAttributes, DraggableSyntheticListeners } from '@dnd-kit/core';
import type { Card } from '../../api/types';
import styles from './CardItem.module.css';

/** `@dnd-kit` draggable wiring threaded down from the Column wrapper (Spec 6). */
export interface CardDragProps {
  /** Ref for the draggable node (the `<article>`). */
  readonly setNodeRef: (element: HTMLElement | null) => void;
  /** Ref for the activator node (the grip handle `<button>`). */
  readonly handleRef: (element: HTMLElement | null) => void;
  /** Accessibility attributes for the activator (role, tabIndex, aria-*). */
  readonly attributes: DraggableAttributes;
  /** Pointer/keyboard event listeners for the activator. */
  readonly listeners: DraggableSyntheticListeners;
  /** True while this card is the active drag source — mutes it behind the overlay clone. */
  readonly isDragging: boolean;
}

interface CardItemProps {
  readonly card: Card;
  /** Opens the edit-card modal for this card. Omit to render no edit affordance (read-only). */
  readonly onEdit?: (card: Card) => void;
  /** Opens the keyboard "Move to column" dialog for this card (WCAG SC 2.1.1). Omit to render none. */
  readonly onMove?: (card: Card) => void;
  /** `@dnd-kit` draggable wiring. Omit for the DragOverlay clone and read-only boards. */
  readonly drag?: CardDragProps;
  /**
   * True briefly after a REMOTE real-time update lands this card (TASK-007 Phase 5, UI/UX Spec 7):
   * applies a one-shot background highlight that fades, so collaborators' changes are noticeable. The
   * current user's own (optimistic) changes are de-duped upstream and never flash.
   */
  readonly recentlyUpdated?: boolean;
}

export function CardItem({ card, onEdit, onMove, drag, recentlyUpdated }: CardItemProps): ReactNode {
  const hasDescription = card.description !== null && card.description !== '';
  const cardClassName = [
    styles.card,
    drag?.isDragging ? styles.dragging : '',
    recentlyUpdated ? styles.recentlyUpdated : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <article ref={drag?.setNodeRef} className={cardClassName}>
      <div className={styles.headerRow}>
        {drag !== undefined ? (
          <button
            type="button"
            ref={drag.handleRef}
            className={styles.dragHandle}
            aria-label={`Reorder card: ${card.title}`}
            {...drag.attributes}
            {...drag.listeners}
          >
            ⠿
          </button>
        ) : null}
        <h3 className={styles.title}>{card.title}</h3>
        <div className={styles.toolbar}>
          {onMove !== undefined ? (
            <button
              type="button"
              className={styles.action}
              aria-label={`Move card: ${card.title}`}
              onClick={() => onMove(card)}
            >
              ⤢
            </button>
          ) : null}
          {onEdit !== undefined ? (
            <button
              type="button"
              className={styles.action}
              aria-label={`Edit card: ${card.title}`}
              onClick={() => onEdit(card)}
            >
              ✎
            </button>
          ) : null}
        </div>
      </div>
      {hasDescription ? <p className={styles.description}>{card.description}</p> : null}
    </article>
  );
}
