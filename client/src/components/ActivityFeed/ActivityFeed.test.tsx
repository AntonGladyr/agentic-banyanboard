/**
 * client/src/components/ActivityFeed/ActivityFeed.test.tsx — activity feed panel tests (TASK-008 Phase 3).
 *
 * Verifies the panel's mutually-exclusive content states and entry presentation against the AC:
 *   - loading  → <Spinner> (role="status")                                 — AC-LOADING-1
 *   - error    → "Could not load activity" (non-fatal feed error)          — UI/UX § Error State
 *   - empty    → "No activity yet"                                         — AC-EMPTY-1
 *   - list     → newest-first <ul> of entries, each with title + from → to + timestamp — AC-LOAD-1 / AC-ENTRY-1
 *   - the "Activity" heading + <aside> landmark are always present         — AC-ENTRY-1
 *   - each entry exposes a natural-language aria-label for screen readers  — UI/UX § Decision Area 5
 *   - the newest live entry receives the highlight class                   — UI/UX § Decision Area 4
 */

import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { ActivityFeed } from './ActivityFeed';
import type { ActivityEvent } from '../../api/types';

function event(overrides: Partial<ActivityEvent> & Pick<ActivityEvent, 'id'>): ActivityEvent {
  return {
    board_id: 1,
    card_id: 10,
    card_title: 'Fix login bug',
    from_status: 'todo',
    to_status: 'in_progress',
    actor: 'anonymous',
    occurred_at: '2026-06-30T11:59:30.000Z',
    ...overrides,
  };
}

describe('ActivityFeed', () => {
  it('always renders the "Activity" heading in an aside landmark (AC-ENTRY-1)', () => {
    render(<ActivityFeed entries={[]} loadState="success" newestEntryId={null} />);
    const aside = screen.getByRole('complementary', { name: 'Activity' });
    expect(within(aside).getByRole('heading', { level: 2, name: 'Activity' })).toBeInTheDocument();
  });

  it('shows the spinner while the feed data is loading (AC-LOADING-1)', () => {
    render(<ActivityFeed entries={[]} loadState="loading" newestEntryId={null} />);
    expect(screen.getByRole('status')).toBeInTheDocument();
    // No list and no empty-state copy while loading.
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    expect(screen.queryByText('No activity yet')).not.toBeInTheDocument();
  });

  it('shows the empty state when there is no activity (AC-EMPTY-1)', () => {
    render(<ActivityFeed entries={[]} loadState="success" newestEntryId={null} />);
    expect(screen.getByText('No activity yet')).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('shows a non-fatal error message when the feed fetch failed (UI/UX § Error State)', () => {
    render(<ActivityFeed entries={[]} loadState="error" newestEntryId={null} />);
    const alert = screen.getByRole('alert');
    expect(within(alert).getByText('Could not load activity')).toBeInTheDocument();
  });

  it('renders entries as a list showing title, from → to labels, and a timestamp (AC-LOAD-1 / AC-ENTRY-1)', () => {
    render(
      <ActivityFeed
        entries={[event({ id: 1, card_title: 'Fix login bug', from_status: 'todo', to_status: 'in_progress' })]}
        loadState="success"
        newestEntryId={null}
      />,
    );
    const list = screen.getByRole('list');
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(1);
    expect(within(items[0]!).getByText('Fix login bug')).toBeInTheDocument();
    // Human-readable column labels (from the DB values todo/in_progress) appear in the move line.
    expect(items[0]!).toHaveTextContent('To Do');
    expect(items[0]!).toHaveTextContent('In Progress');
  });

  it('renders entries in the order received (caller supplies newest-first — AC-LOAD-1)', () => {
    render(
      <ActivityFeed
        entries={[
          event({ id: 3, card_title: 'Newest card' }),
          event({ id: 2, card_title: 'Middle card' }),
          event({ id: 1, card_title: 'Oldest card' }),
        ]}
        loadState="success"
        newestEntryId={null}
      />,
    );
    const items = screen.getAllByRole('listitem');
    expect(items.map((li) => li.textContent)).toEqual([
      expect.stringContaining('Newest card'),
      expect.stringContaining('Middle card'),
      expect.stringContaining('Oldest card'),
    ]);
  });

  it('exposes a natural-language aria-label per entry for screen readers (UI/UX § Decision Area 5)', () => {
    render(
      <ActivityFeed
        entries={[event({ id: 1, card_title: 'Fix login bug', from_status: 'todo', to_status: 'done' })]}
        loadState="success"
        newestEntryId={null}
      />,
    );
    expect(
      screen.getByRole('listitem', { name: /Fix login bug moved from To Do to Done/ }),
    ).toBeInTheDocument();
  });

  it('marks the newest live entry with the highlight class (UI/UX § Decision Area 4)', () => {
    const { container } = render(
      <ActivityFeed
        entries={[event({ id: 7, card_title: 'Just moved' }), event({ id: 6, card_title: 'Older' })]}
        loadState="success"
        newestEntryId={7}
      />,
    );
    const highlighted = container.querySelectorAll('[class*="newEntry"]');
    // Exactly the one entry whose id matches newestEntryId carries the highlight class.
    expect(highlighted).toHaveLength(1);
    expect(highlighted[0]).toHaveTextContent('Just moved');
  });
});
