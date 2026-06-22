/**
 * client/src/components/MoveCardDialog/MoveCardDialog.test.tsx — keyboard DnD alternative (TASK-007 Phase 4).
 *
 * UI/UX creative Spec 6: the pointer-free way to move a card between columns (WCAG 2.1 SC 2.1.1).
 * A small modal lists the three columns as radio options with the card's current column pre-selected;
 * choosing a different column and activating "Move" reports the new status to the parent, which runs
 * the same optimistic-move + rollback path as a pointer drop (AC-HAPPY-5 / AC-ERROR-4). Cancel/Escape
 * close it with no move (AC-NAV-1). It renders nothing when `card` is null.
 */

import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MoveCardDialog } from './MoveCardDialog';
import type { Card } from '../../api/types';

function card(overrides: Partial<Card> & Pick<Card, 'title' | 'status'>): Card {
  return {
    id: 10,
    board_id: 1,
    description: null,
    position: 0,
    created_at: '2026-06-20T00:00:00.000Z',
    updated_at: '2026-06-20T00:00:00.000Z',
    ...overrides,
  };
}

describe('MoveCardDialog', () => {
  it('renders nothing when no card is given', () => {
    const { container } = render(
      <MoveCardDialog card={null} onMove={vi.fn()} onClose={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders a dialog with the three columns and the current column pre-selected (WCAG SC 2.1.1)', () => {
    render(
      <MoveCardDialog
        card={card({ title: 'Fix login bug', status: 'in_progress' })}
        onMove={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAccessibleName(/move card/i);
    expect(within(dialog).getByRole('radio', { name: 'To Do' })).not.toBeChecked();
    expect(within(dialog).getByRole('radio', { name: 'In Progress' })).toBeChecked();
    expect(within(dialog).getByRole('radio', { name: 'Done' })).not.toBeChecked();
  });

  it('reports the chosen target status to onMove when "Move" is activated (AC-HAPPY-5)', async () => {
    const user = userEvent.setup();
    const onMove = vi.fn();
    render(
      <MoveCardDialog
        card={card({ title: 'Fix login bug', status: 'todo' })}
        onMove={onMove}
        onClose={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('radio', { name: 'Done' }));
    await user.click(screen.getByRole('button', { name: /^move$/i }));

    expect(onMove).toHaveBeenCalledWith('done');
  });

  it('closes without moving when Cancel is activated (AC-NAV-1)', async () => {
    const user = userEvent.setup();
    const onMove = vi.fn();
    const onClose = vi.fn();
    render(
      <MoveCardDialog
        card={card({ title: 'Fix login bug', status: 'todo' })}
        onMove={onMove}
        onClose={onClose}
      />,
    );

    await user.click(screen.getByRole('button', { name: /cancel/i }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onMove).not.toHaveBeenCalled();
  });
});
