/**
 * client/src/App.test.tsx — routing skeleton smoke test (TASK-006 Phase 2).
 *
 * Verifies the client-side router renders the correct page for each of the two routes (Test
 * Strategy: "routing skeleton smoke test — renders the two routes"). Uses MemoryRouter so the test
 * controls the initial URL without a real browser history. Full page behavior (fetch, states) is
 * covered by Phase 3/4 component tests.
 */

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { App } from './App';

// Both routes now render live-fetching pages (Phase 3 list, Phase 4 view). Mock the API client so the
// routing smoke test stays deterministic and fires no real network request — each page renders its
// heading regardless of the resolved data.
vi.mock('./api/apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api/apiClient')>();
  return {
    ...actual,
    getBoards: vi.fn().mockResolvedValue([]),
    getBoard: vi.fn().mockResolvedValue({
      id: 42,
      name: 'Demo Board',
      description: null,
      created_at: '2026-06-20T00:00:00.000Z',
      updated_at: '2026-06-20T00:00:00.000Z',
    }),
    getCards: vi.fn().mockResolvedValue([]),
  };
});

function renderAt(path: string): void {
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

describe('App routing skeleton', () => {
  // The board list page fetches on mount; `findBy*` waits for the settled state so the trailing
  // state update is flushed inside act (no warning), while still asserting the route rendered.
  it('renders the board list page at "/"', async () => {
    renderAt('/');
    expect(await screen.findByRole('heading', { level: 1, name: 'Boards' })).toBeInTheDocument();
  });

  it('renders the board view page at "/boards/:id" with a back-to-boards link', async () => {
    renderAt('/boards/42');
    // The board view fetches the board on mount; the heading shows the resolved board name.
    expect(await screen.findByRole('heading', { level: 1, name: 'Demo Board' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Back to boards/ })).toBeInTheDocument();
  });

  it('always renders the BanyanBoard app-shell brand link', async () => {
    renderAt('/');
    expect(await screen.findByRole('link', { name: 'BanyanBoard' })).toBeInTheDocument();
  });
});
