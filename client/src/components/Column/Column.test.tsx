/**
 * client/src/components/Column/Column.test.tsx — kanban column unit tests (TASK-006 Phase 4).
 *
 * The Column is always rendered (never conditionally omitted — AC-HAPPY-3) as a labelled region.
 * It renders the empty-state copy when passed no cards, and one CardItem per card otherwise.
 */

import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
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
});
