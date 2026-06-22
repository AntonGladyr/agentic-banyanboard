/**
 * client/src/components/CardItem/CardItem.test.tsx — card tile unit tests (TASK-006 Phase 4; TASK-007 Phase 3).
 *
 * A card shows its title (as a heading) and its description when present. No status badge is
 * rendered (UI/UX creative Decision Area 4 — column placement communicates status).
 *
 * TASK-007 Phase 3 adds an edit affordance (UI/UX creative Spec 5): an edit button (revealed on
 * hover/focus, but always in the DOM for keyboard reach) that invokes `onEdit(card)` so the page can
 * open the edit-card modal. The button is rendered only when an `onEdit` handler is supplied.
 */

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CardItem } from './CardItem';
import type { Card } from '../../api/types';

function card(overrides: Partial<Card> & Pick<Card, 'title'>): Card {
  return {
    id: 1,
    board_id: 1,
    description: null,
    position: 0,
    status: 'todo',
    created_at: '2026-06-20T00:00:00.000Z',
    updated_at: '2026-06-20T00:00:00.000Z',
    ...overrides,
  };
}

describe('CardItem', () => {
  it('renders the card title as a heading', () => {
    render(<CardItem card={card({ title: 'Fix login button' })} />);
    expect(screen.getByRole('heading', { name: 'Fix login button' })).toBeInTheDocument();
  });

  it('renders the description when present', () => {
    render(<CardItem card={card({ title: 'Fix login', description: 'The button is misaligned' })} />);
    expect(screen.getByText('The button is misaligned')).toBeInTheDocument();
  });

  it('renders no description paragraph when description is null', () => {
    const { container } = render(
      <CardItem card={card({ title: 'No description card', description: null })} />,
    );
    // Only the title heading should be present — the description <p> is omitted entirely.
    expect(screen.getByRole('heading', { name: 'No description card' })).toBeInTheDocument();
    expect(container.querySelector('p')).toBeNull();
  });

  // ─── Edit card (TASK-007 Phase 3) ──────────────────────────────────────────

  it('does not render an edit affordance when no onEdit handler is given', () => {
    render(<CardItem card={card({ title: 'Fix login bug' })} />);
    expect(screen.queryByRole('button', { name: /edit card/i })).not.toBeInTheDocument();
  });

  it('renders an edit affordance naming the card when onEdit is given (AC-HAPPY-4)', () => {
    render(<CardItem card={card({ title: 'Fix login bug' })} onEdit={vi.fn()} />);
    expect(screen.getByRole('button', { name: /edit card: fix login bug/i })).toBeInTheDocument();
  });

  it('invokes onEdit with the card when the edit affordance is activated (AC-HAPPY-4)', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    const subject = card({ id: 42, title: 'Fix login bug' });
    render(<CardItem card={subject} onEdit={onEdit} />);

    await user.click(screen.getByRole('button', { name: /edit card: fix login bug/i }));

    expect(onEdit).toHaveBeenCalledWith(subject);
  });
});
