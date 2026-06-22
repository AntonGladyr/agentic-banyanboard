/**
 * client/src/components/CardItem/CardItem.tsx — individual card tile (TASK-006 Phase 4; TASK-007 Phase 3).
 *
 * UI/UX creative Decision Area 4 (Option 4A — title + description, no status badge): column
 * placement already communicates status, so the card stays minimal. Rendered as an `<article>`
 * (a self-contained content unit). Heading hierarchy: page `<h1>` → column `<h2>` → card `<h3>`.
 * The description is muted secondary text and is omitted entirely when null/empty.
 *
 * TASK-007 Phase 3 adds an edit affordance (UI/UX creative Spec 5): when an `onEdit` handler is
 * supplied, an edit (✎) button is rendered. It is always present in the DOM (so it is keyboard
 * reachable) but visually revealed on card hover / `:focus-within` to keep the board uncluttered. Its
 * accessible name names the card so screen-reader users can tell the buttons apart. Activating it
 * invokes `onEdit(card)`, letting the page open the edit-card modal (Spec 5). Read-only cards (no
 * `onEdit`) render no edit affordance.
 */

import type { ReactNode } from 'react';
import type { Card } from '../../api/types';
import styles from './CardItem.module.css';

interface CardItemProps {
  readonly card: Card;
  /** Opens the edit-card modal for this card. Omit to render no edit affordance (read-only). */
  readonly onEdit?: (card: Card) => void;
}

export function CardItem({ card, onEdit }: CardItemProps): ReactNode {
  const hasDescription = card.description !== null && card.description !== '';
  return (
    <article className={styles.card}>
      <div className={styles.headerRow}>
        <h3 className={styles.title}>{card.title}</h3>
        {onEdit !== undefined ? (
          <button
            type="button"
            className={styles.edit}
            aria-label={`Edit card: ${card.title}`}
            onClick={() => onEdit(card)}
          >
            ✎
          </button>
        ) : null}
      </div>
      {hasDescription ? <p className={styles.description}>{card.description}</p> : null}
    </article>
  );
}
