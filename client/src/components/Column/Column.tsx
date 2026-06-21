/**
 * client/src/components/Column/Column.tsx — a single kanban column (TASK-006 Phase 4).
 *
 * UI/UX creative Decision Area 3 (Option 3A — horizontal kanban). A column is ALWAYS rendered, never
 * conditionally omitted, so all three columns are present even when a board has no cards (AC-HAPPY-3).
 * Rendered as a `<section aria-label={label}>` (a labelled landmark region) with the label as an
 * `<h2>` (page `<h1>` → column `<h2>` → card `<h3>`). The header carries a subtle per-status tint via
 * the `variant` class. With no cards, it shows the "No cards yet" empty state.
 */

import type { ReactNode } from 'react';
import type { Card } from '../../api/types';
import { CardItem } from '../CardItem/CardItem';
import { EmptyState } from '../EmptyState/EmptyState';
import styles from './Column.module.css';

/** Column tint variant — maps to a per-status background defined in tokens.css. */
export type ColumnVariant = 'todo' | 'inProgress' | 'done';

interface ColumnProps {
  readonly label: string;
  readonly variant: ColumnVariant;
  readonly cards: readonly Card[];
}

export function Column({ label, variant, cards }: ColumnProps): ReactNode {
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
              <CardItem card={card} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
