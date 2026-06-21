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

// The `/` route now renders the live-fetching BoardListPage (Phase 3). Mock the API client so the
// routing smoke test stays deterministic and fires no real network request — the board list always
// renders its `Boards` heading regardless of the resolved data.
vi.mock('./api/apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api/apiClient')>();
  return { ...actual, getBoards: vi.fn().mockResolvedValue([]) };
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

  it('renders the board view page at "/boards/:id" with a back-to-boards link', () => {
    renderAt('/boards/42');
    expect(screen.getByRole('heading', { level: 1, name: /Board 42/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Back to boards/ })).toBeInTheDocument();
  });

  it('always renders the BanyanBoard app-shell brand link', async () => {
    renderAt('/');
    expect(await screen.findByRole('link', { name: 'BanyanBoard' })).toBeInTheDocument();
  });
});
