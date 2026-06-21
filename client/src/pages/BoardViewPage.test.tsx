/**
 * client/src/pages/BoardViewPage.test.tsx — board view page component tests (TASK-006 Phase 4).
 *
 * Verifies the page's state machine and AC behaviors against a mocked apiClient (no network). The
 * page fires getBoard(id) and getCards(id) in parallel on mount:
 *   - loading state shows the spinner (`role="status"`) while either request is pending — AC-LOADING-1
 *   - success renders the board name as the <h1> heading and partitions cards into the three
 *     status-mapped columns (To Do / In Progress / Done) — AC-HAPPY-1
 *   - a different card set renders for a different board (stub-detection) — AC-HAPPY-1
 *   - empty columns render the "No cards yet" empty state, all three columns always present — AC-HAPPY-3
 *   - a 404 board renders the "Board not found" error with the back-nav still reachable — AC-ERROR-2
 *   - a network failure renders the "Could not load board" error with back-nav — AC-ERROR-2
 *   - the `← Back to boards` link is present in loading, success, and error states — AC-HAPPY-2
 *   - no internal error detail ever reaches the user (Guiding Principle 5)
 *
 * Copy strings are the canonical UI/UX creative strings (Decision Areas 7 & 8).
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { BoardViewPage } from './BoardViewPage';
import { ApiError } from '../api/apiClient';
import * as apiClient from '../api/apiClient';
import type { Board, Card } from '../api/types';

// Mock the apiClient but keep the real ApiError class so `instanceof` / category mapping work.
vi.mock('../api/apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/apiClient')>();
  return { ...actual, getBoard: vi.fn(), getCards: vi.fn() };
});

const getBoardMock = vi.mocked(apiClient.getBoard);
const getCardsMock = vi.mocked(apiClient.getCards);

/** Render the board view at `/boards/:id` so `useParams` resolves the id like the real router. */
function renderPageAt(id: number | string): void {
  render(
    <MemoryRouter initialEntries={[`/boards/${id}`]}>
      <Routes>
        <Route path="/boards/:id" element={<BoardViewPage />} />
        <Route path="/" element={<h1>Boards</h1>} />
      </Routes>
    </MemoryRouter>,
  );
}

const board: Board = {
  id: 1,
  name: 'Alpha Project',
  description: 'Sprint planning and engineering tasks',
  created_at: '2026-06-20T00:00:00.000Z',
  updated_at: '2026-06-20T00:00:00.000Z',
};

function card(overrides: Partial<Card> & Pick<Card, 'id' | 'title' | 'status'>): Card {
  return {
    board_id: 1,
    description: null,
    position: 0,
    created_at: '2026-06-20T00:00:00.000Z',
    updated_at: '2026-06-20T00:00:00.000Z',
    ...overrides,
  };
}

const cards: Card[] = [
  card({ id: 10, title: 'Fix login button', description: 'The login button is misaligned', status: 'todo' }),
  card({ id: 11, title: 'Update docs', status: 'todo' }),
  card({ id: 12, title: 'Add API endpoints', status: 'in_progress' }),
  card({ id: 13, title: 'Set up DB migrations', status: 'done' }),
];

afterEach(() => {
  vi.clearAllMocks();
});

describe('BoardViewPage', () => {
  it('shows the loading spinner while the board/cards requests are pending (AC-LOADING-1)', () => {
    getBoardMock.mockReturnValue(new Promise<Board>(() => {})); // never resolves → stays loading
    getCardsMock.mockReturnValue(new Promise<Card[]>(() => {}));
    renderPageAt(1);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('keeps the back-to-boards link present while loading (AC-HAPPY-2)', () => {
    getBoardMock.mockReturnValue(new Promise<Board>(() => {}));
    getCardsMock.mockReturnValue(new Promise<Card[]>(() => {}));
    renderPageAt(1);
    expect(screen.getByRole('link', { name: /Back to boards/ })).toHaveAttribute('href', '/');
  });

  it('renders the board name as the page heading on success (AC-HAPPY-1)', async () => {
    getBoardMock.mockResolvedValue(board);
    getCardsMock.mockResolvedValue(cards);
    renderPageAt(1);
    expect(await screen.findByRole('heading', { level: 1, name: 'Alpha Project' })).toBeInTheDocument();
  });

  it('partitions cards into the three status-mapped columns (AC-HAPPY-1)', async () => {
    getBoardMock.mockResolvedValue(board);
    getCardsMock.mockResolvedValue(cards);
    renderPageAt(1);

    const todo = await screen.findByRole('region', { name: 'To Do' });
    const inProgress = screen.getByRole('region', { name: 'In Progress' });
    const done = screen.getByRole('region', { name: 'Done' });

    // todo cards land in To Do
    expect(within(todo).getByText('Fix login button')).toBeInTheDocument();
    expect(within(todo).getByText('Update docs')).toBeInTheDocument();
    // and nowhere else
    expect(within(inProgress).queryByText('Fix login button')).not.toBeInTheDocument();

    expect(within(inProgress).getByText('Add API endpoints')).toBeInTheDocument();
    expect(within(done).getByText('Set up DB migrations')).toBeInTheDocument();
  });

  it('renders a card description when present (AC-HAPPY-1)', async () => {
    getBoardMock.mockResolvedValue(board);
    getCardsMock.mockResolvedValue(cards);
    renderPageAt(1);
    expect(await screen.findByText('The login button is misaligned')).toBeInTheDocument();
  });

  it('renders a different card set for a different board (stub-detection, AC-HAPPY-1)', async () => {
    const otherBoard: Board = { ...board, id: 2, name: 'Marketing Q3' };
    getBoardMock.mockResolvedValue(otherBoard);
    getCardsMock.mockResolvedValue([card({ id: 99, title: 'Launch campaign', status: 'in_progress' })]);
    renderPageAt(2);

    expect(await screen.findByText('Launch campaign')).toBeInTheDocument();
    // Cards from board 1 must NOT appear for board 2.
    expect(screen.queryByText('Fix login button')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Marketing Q3' })).toBeInTheDocument();
  });

  it('renders all three columns with empty states when the board has no cards (AC-HAPPY-3)', async () => {
    getBoardMock.mockResolvedValue(board);
    getCardsMock.mockResolvedValue([]);
    renderPageAt(1);

    // All three columns are always present, even with zero cards.
    expect(await screen.findByRole('region', { name: 'To Do' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'In Progress' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Done' })).toBeInTheDocument();
    // Each column shows the empty-state copy.
    expect(screen.getAllByText('No cards yet')).toHaveLength(3);
  });

  it('shows a "Board not found" error with back-nav on a 404 (AC-ERROR-2)', async () => {
    getBoardMock.mockRejectedValue(new ApiError('notFound', 'Resource /boards/99999 was not found'));
    getCardsMock.mockResolvedValue([]);
    renderPageAt(99999);

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('Board not found')).toBeInTheDocument();
    // Back-nav remains reachable so the user can recover (AC-ERROR-2 / AC-HAPPY-2).
    expect(screen.getByRole('link', { name: /Back to boards/ })).toHaveAttribute('href', '/');
  });

  it('shows a "Could not load board" error with back-nav on a network failure (AC-ERROR-2)', async () => {
    getBoardMock.mockRejectedValue(new ApiError('network', 'Network request to /boards/1 failed'));
    getCardsMock.mockResolvedValue([]);
    renderPageAt(1);

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('Could not load board')).toBeInTheDocument();
    expect(within(alert).getByText(/server is not reachable/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Back to boards/ })).toBeInTheDocument();
  });

  it('shows a generic error when the cards request fails with a server error (AC-ERROR-2)', async () => {
    getBoardMock.mockResolvedValue(board);
    getCardsMock.mockRejectedValue(new ApiError('server', 'Request to /boards/1/cards failed with status 500'));
    renderPageAt(1);

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('Something went wrong')).toBeInTheDocument();
  });

  it('never surfaces internal error detail to the user (Guiding Principle 5)', async () => {
    getBoardMock.mockRejectedValue(new ApiError('server', 'secret stack at db.query internal-detail'));
    getCardsMock.mockResolvedValue([]);
    renderPageAt(1);

    await screen.findByRole('alert');
    expect(screen.queryByText(/internal-detail/)).not.toBeInTheDocument();
    expect(screen.queryByText(/db\.query/)).not.toBeInTheDocument();
  });
});
