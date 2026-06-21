/**
 * client/src/App.test.tsx — routing skeleton smoke test (TASK-006 Phase 2).
 *
 * Verifies the client-side router renders the correct page for each of the two routes (Test
 * Strategy: "routing skeleton smoke test — renders the two routes"). Uses MemoryRouter so the test
 * controls the initial URL without a real browser history. Full page behavior (fetch, states) is
 * covered by Phase 3/4 component tests.
 */

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { App } from './App';

function renderAt(path: string): void {
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

describe('App routing skeleton', () => {
  it('renders the board list page at "/"', () => {
    renderAt('/');
    expect(screen.getByRole('heading', { level: 1, name: 'Boards' })).toBeInTheDocument();
  });

  it('renders the board view page at "/boards/:id" with a back-to-boards link', () => {
    renderAt('/boards/42');
    expect(screen.getByRole('heading', { level: 1, name: /Board 42/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Back to boards/ })).toBeInTheDocument();
  });

  it('always renders the BanyanBoard app-shell brand link', () => {
    renderAt('/');
    expect(screen.getByRole('link', { name: 'BanyanBoard' })).toBeInTheDocument();
  });
});
