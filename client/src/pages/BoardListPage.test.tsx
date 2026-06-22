/**
 * client/src/pages/BoardListPage.test.tsx — board list page component tests (TASK-006 Phase 3).
 *
 * Verifies the page's state machine and AC behaviors against a mocked apiClient (no network):
 *   - loading state shows the spinner (`role="status"`) — AC-LOADING-1
 *   - success with boards renders one navigable entry per board, each linking to /boards/:id — AC-ENTRY-1
 *   - success with [] renders the "No boards yet" empty state — AC-ENTRY-2
 *   - network failure renders the "Could not load boards" error (`role="alert"`) — AC-ERROR-1
 *   - server failure renders the "Something went wrong" error — AC-ERROR-1
 *   - no internal error detail ever reaches the user (Guiding Principle 5)
 *
 * Copy strings are the canonical UI/UX creative strings (Decision Areas 7 & 8).
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { BoardListPage } from './BoardListPage';
import { ApiError } from '../api/apiClient';
import * as apiClient from '../api/apiClient';
import type { Board } from '../api/types';

// Mock the apiClient module but keep the real ApiError class so `instanceof` / category mapping work.
vi.mock('../api/apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/apiClient')>();
  return { ...actual, getBoards: vi.fn(), createBoard: vi.fn() };
});

const getBoardsMock = vi.mocked(apiClient.getBoards);
const createBoardMock = vi.mocked(apiClient.createBoard);

function renderPage(): void {
  render(
    <MemoryRouter>
      <BoardListPage />
    </MemoryRouter>,
  );
}

const boards: Board[] = [
  {
    id: 1,
    name: 'Alpha Project',
    description: 'Sprint planning and engineering tasks',
    created_at: '2026-06-20T00:00:00.000Z',
    updated_at: '2026-06-20T00:00:00.000Z',
  },
  {
    id: 2,
    name: 'Marketing Q3',
    description: null,
    created_at: '2026-06-20T00:00:00.000Z',
    updated_at: '2026-06-20T00:00:00.000Z',
  },
];

afterEach(() => {
  vi.clearAllMocks();
});

describe('BoardListPage', () => {
  it('always renders the page heading', () => {
    getBoardsMock.mockReturnValue(new Promise<Board[]>(() => {})); // never resolves → stays loading
    renderPage();
    expect(screen.getByRole('heading', { level: 1, name: 'Boards' })).toBeInTheDocument();
  });

  it('shows the loading spinner while the boards request is pending (AC-LOADING-1)', () => {
    getBoardsMock.mockReturnValue(new Promise<Board[]>(() => {}));
    renderPage();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('renders one navigable entry per board on success, linking to /boards/:id (AC-ENTRY-1)', async () => {
    getBoardsMock.mockResolvedValue(boards);
    renderPage();

    expect(await screen.findByText('Alpha Project')).toBeInTheDocument();
    expect(screen.getByText('Marketing Q3')).toBeInTheDocument();

    expect(screen.getByRole('link', { name: /Alpha Project/ })).toHaveAttribute('href', '/boards/1');
    expect(screen.getByRole('link', { name: /Marketing Q3/ })).toHaveAttribute('href', '/boards/2');
  });

  it('renders each board description when present', async () => {
    getBoardsMock.mockResolvedValue(boards);
    renderPage();
    expect(await screen.findByText('Sprint planning and engineering tasks')).toBeInTheDocument();
  });

  it('shows the empty state when no boards exist (AC-ENTRY-2)', async () => {
    getBoardsMock.mockResolvedValue([]);
    renderPage();

    expect(await screen.findByText('No boards yet')).toBeInTheDocument();
    expect(screen.getByText('Create your first board to get started.')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('shows a network error alert when the server is unreachable (AC-ERROR-1)', async () => {
    getBoardsMock.mockRejectedValue(new ApiError('network', 'Network request to /boards failed'));
    renderPage();

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('Could not load boards')).toBeInTheDocument();
    expect(within(alert).getByText(/server is not reachable/i)).toBeInTheDocument();
  });

  it('shows a generic error alert on a server failure (AC-ERROR-1)', async () => {
    getBoardsMock.mockRejectedValue(new ApiError('server', 'Request to /boards failed with status 500'));
    renderPage();

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('Something went wrong')).toBeInTheDocument();
  });

  it('never surfaces internal error detail to the user (Guiding Principle 5)', async () => {
    getBoardsMock.mockRejectedValue(new ApiError('server', 'secret stack at db.query internal-detail'));
    renderPage();

    await screen.findByRole('alert');
    expect(screen.queryByText(/internal-detail/)).not.toBeInTheDocument();
    expect(screen.queryByText(/db\.query/)).not.toBeInTheDocument();
  });

  // ─── Create board (TASK-007 Phase 2) ──────────────────────────────────────

  it('renders a "New Board" create action (AC-ENTRY-1)', async () => {
    getBoardsMock.mockResolvedValue([]);
    renderPage();
    expect(await screen.findByRole('button', { name: /new board/i })).toBeInTheDocument();
  });

  it('opens the create-board dialog when "New Board" is activated', async () => {
    const user = userEvent.setup();
    getBoardsMock.mockResolvedValue([]);
    renderPage();

    await user.click(await screen.findByRole('button', { name: /new board/i }));

    expect(screen.getByRole('dialog')).toHaveAccessibleName(/create board/i);
    expect(screen.getByRole('textbox', { name: /board name/i })).toBeInTheDocument();
  });

  it('creates a board end-to-end: calls createBoard and shows the new board in the list (AC-HAPPY-1)', async () => {
    const user = userEvent.setup();
    getBoardsMock.mockResolvedValue([]);
    createBoardMock.mockResolvedValue({
      id: 7,
      name: 'Sprint 42',
      description: null,
      created_at: '2026-06-21T00:00:00.000Z',
      updated_at: '2026-06-21T00:00:00.000Z',
    });
    renderPage();

    await user.click(await screen.findByRole('button', { name: /new board/i }));
    await user.type(screen.getByRole('textbox', { name: /board name/i }), 'Sprint 42');
    await user.click(screen.getByRole('button', { name: 'Create Board' }));

    // The new board appears in the list, linking to its view page.
    expect(await screen.findByRole('link', { name: /Sprint 42/ })).toHaveAttribute('href', '/boards/7');
    expect(createBoardMock).toHaveBeenCalledWith(
      { name: 'Sprint 42', description: null },
      expect.anything(),
    );
    // The dialog closes on success.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes the create dialog on cancel without calling createBoard (AC-NAV-1)', async () => {
    const user = userEvent.setup();
    getBoardsMock.mockResolvedValue([]);
    renderPage();

    await user.click(await screen.findByRole('button', { name: /new board/i }));
    await user.click(screen.getByRole('button', { name: /cancel/i }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(createBoardMock).not.toHaveBeenCalled();
  });

  it('keeps the dialog open and shows an error when creation fails on the server (AC-ERROR-3)', async () => {
    const user = userEvent.setup();
    getBoardsMock.mockResolvedValue([]);
    createBoardMock.mockRejectedValue(new ApiError('server', 'Request to /boards failed with status 500'));
    renderPage();

    await user.click(await screen.findByRole('button', { name: /new board/i }));
    await user.type(screen.getByRole('textbox', { name: /board name/i }), 'Sprint 42');
    await user.click(screen.getByRole('button', { name: 'Create Board' }));

    expect(await screen.findByText("Couldn't save changes")).toBeInTheDocument();
    // Dialog stays open with the user's input preserved so they can retry.
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /board name/i })).toHaveValue('Sprint 42');
  });
});
