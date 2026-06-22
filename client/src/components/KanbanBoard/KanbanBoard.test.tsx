/**
 * client/src/components/KanbanBoard/KanbanBoard.test.tsx — drop-target resolution (TASK-007 Phase 4).
 *
 * The pointer/keyboard drag mechanics belong to @dnd-kit and are exercised end-to-end by the Phase 6
 * Playwright suite (TASK-007 § What NOT to Test — no pixel-level pointer simulation in unit tests).
 * What this unit suite locks down is the pure mapping that `onDragEnd` relies on: given the dragged
 * card id and the column it was dropped over, `resolveCardMove` yields the move (card + target status)
 * only when the drop lands in a DIFFERENT column. This is the logic that decides whether
 * `updateCardStatus` is called with the target status (AC-HAPPY-5).
 */

import { describe, expect, it } from 'vitest';
import { resolveCardMove } from './KanbanBoard';
import type { Card } from '../../api/types';

function card(id: number, status: Card['status']): Card {
  return {
    id,
    board_id: 1,
    title: `Card ${id}`,
    description: null,
    position: 0,
    status,
    created_at: '2026-06-20T00:00:00.000Z',
    updated_at: '2026-06-20T00:00:00.000Z',
  };
}

const cards: Card[] = [card(1, 'todo'), card(2, 'in_progress'), card(3, 'done')];

describe('resolveCardMove', () => {
  it('returns the card and target status when dropped over a different column (AC-HAPPY-5)', () => {
    expect(resolveCardMove(1, 'in_progress', cards)).toEqual({
      card: cards[0],
      targetStatus: 'in_progress',
    });
  });

  it('returns null when dropped over the column the card already belongs to (no-op move)', () => {
    expect(resolveCardMove(2, 'in_progress', cards)).toBeNull();
  });

  it('returns null when not dropped over any droppable column', () => {
    expect(resolveCardMove(1, null, cards)).toBeNull();
  });

  it('returns null when the over target is not one of the three column statuses', () => {
    expect(resolveCardMove(1, 'archived', cards)).toBeNull();
  });

  it('returns null when the dragged card id is unknown', () => {
    expect(resolveCardMove(999, 'done', cards)).toBeNull();
  });
});
