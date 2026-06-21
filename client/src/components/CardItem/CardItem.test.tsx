/**
 * client/src/components/CardItem/CardItem.test.tsx — card tile unit tests (TASK-006 Phase 4).
 *
 * A card shows its title (as a heading) and its description when present. No status badge is
 * rendered (UI/UX creative Decision Area 4 — column placement communicates status).
 */

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
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
});
