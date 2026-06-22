/**
 * client/src/components/Column/Column.test.tsx — kanban column unit tests (TASK-006 Phase 4; TASK-007 Phase 3).
 *
 * The Column is always rendered (never conditionally omitted — AC-HAPPY-3) as a labelled region.
 * It renders the empty-state copy when passed no cards, and one CardItem per card otherwise.
 *
 * TASK-007 Phase 3 adds an inline create-card affordance (UI/UX creative Spec 4): an always-visible
 * "Add card" footer button (rendered only when `onCreateCard` is supplied) that expands an inline
 * CardForm scoped to the column's status. Verifies AC-ENTRY-2 (affordance present, keyboard-reachable),
 * AC-HAPPY-3 (submit forwards values to onCreateCard), and AC-NAV-1 (cancel collapses the form).
 */

import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Column } from './Column';
import type { Card } from '../../api/types';

function card(id: number, title: string): Card {
  return {
    id,
    board_id: 1,
    title,
    description: null,
    position: 0,
    status: 'todo',
    created_at: '2026-06-20T00:00:00.000Z',
    updated_at: '2026-06-20T00:00:00.000Z',
  };
}

describe('Column', () => {
  it('renders as a labelled region with its label as a heading', () => {
    render(<Column label="To Do" variant="todo" cards={[]} />);
    const region = screen.getByRole('region', { name: 'To Do' });
    expect(region).toBeInTheDocument();
    expect(within(region).getByRole('heading', { name: /To Do/ })).toBeInTheDocument();
  });

  it('renders the "No cards yet" empty state when given no cards (AC-HAPPY-3)', () => {
    render(<Column label="In Progress" variant="inProgress" cards={[]} />);
    const region = screen.getByRole('region', { name: 'In Progress' });
    expect(within(region).getByText('No cards yet')).toBeInTheDocument();
  });

  it('renders one card per card when cards are present', () => {
    render(
      <Column
        label="Done"
        variant="done"
        cards={[card(1, 'First card'), card(2, 'Second card')]}
      />,
    );
    const region = screen.getByRole('region', { name: 'Done' });
    expect(within(region).getByText('First card')).toBeInTheDocument();
    expect(within(region).getByText('Second card')).toBeInTheDocument();
    expect(within(region).queryByText('No cards yet')).not.toBeInTheDocument();
  });

  // ─── Create card (TASK-007 Phase 3) ────────────────────────────────────────

  it('does not render an add-card affordance when no onCreateCard handler is given', () => {
    render(<Column label="To Do" variant="todo" cards={[]} />);
    expect(screen.queryByRole('button', { name: /add card/i })).not.toBeInTheDocument();
  });

  it('renders an add-card affordance scoped to the column when onCreateCard is given (AC-ENTRY-2)', () => {
    render(<Column label="In Progress" variant="inProgress" cards={[]} onCreateCard={vi.fn()} />);
    expect(
      screen.getByRole('button', { name: /add card to in progress/i }),
    ).toBeInTheDocument();
  });

  it('expands an inline create form when the add-card affordance is activated (AC-ENTRY-2)', async () => {
    const user = userEvent.setup();
    render(<Column label="To Do" variant="todo" cards={[]} onCreateCard={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /add card to to do/i }));

    expect(screen.getByRole('textbox', { name: /title/i })).toBeInTheDocument();
  });

  it('forwards the new card values to onCreateCard on submit (AC-HAPPY-3)', async () => {
    const user = userEvent.setup();
    const onCreateCard = vi.fn().mockResolvedValue(undefined);
    render(<Column label="In Progress" variant="inProgress" cards={[]} onCreateCard={onCreateCard} />);

    await user.click(screen.getByRole('button', { name: /add card to in progress/i }));
    await user.type(screen.getByRole('textbox', { name: /title/i }), 'Implement websocket handler');
    await user.click(screen.getByRole('button', { name: 'Add Card' }));

    expect(onCreateCard).toHaveBeenCalledWith({
      title: 'Implement websocket handler',
      description: null,
    });
  });

  it('collapses the inline form and restores the add-card button on cancel (AC-NAV-1)', async () => {
    const user = userEvent.setup();
    const onCreateCard = vi.fn();
    render(<Column label="To Do" variant="todo" cards={[]} onCreateCard={onCreateCard} />);

    await user.click(screen.getByRole('button', { name: /add card to to do/i }));
    await user.click(screen.getByRole('button', { name: /cancel/i }));

    expect(screen.queryByRole('textbox', { name: /title/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add card to to do/i })).toBeInTheDocument();
    expect(onCreateCard).not.toHaveBeenCalled();
  });
});
