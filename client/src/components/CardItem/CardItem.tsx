/**
 * client/src/components/CardItem/CardItem.tsx — individual card tile (TASK-006 Phase 4).
 *
 * UI/UX creative Decision Area 4 (Option 4A — title + description, no status badge): column
 * placement already communicates status, so the card stays minimal. Rendered as an `<article>`
 * (a self-contained content unit). Heading hierarchy: page `<h1>` → column `<h2>` → card `<h3>`.
 * The description is muted secondary text and is omitted entirely when null/empty.
 */

import type { ReactNode } from 'react';
import type { Card } from '../../api/types';
import styles from './CardItem.module.css';

interface CardItemProps {
  readonly card: Card;
}

export function CardItem({ card }: CardItemProps): ReactNode {
  const hasDescription = card.description !== null && card.description !== '';
  return (
    <article className={styles.card}>
      <h3 className={styles.title}>{card.title}</h3>
      {hasDescription ? <p className={styles.description}>{card.description}</p> : null}
    </article>
  );
}
