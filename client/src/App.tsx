/**
 * client/src/App.tsx — client-side route table (TASK-006 Phase 2).
 *
 * Declares the two SPA routes inside the shared `AppShell`:
 *   - `/`            → BoardListPage  (Phase 3)
 *   - `/boards/:id`  → BoardViewPage  (Phase 4)
 *
 * The `BrowserRouter` (history API) is provided by `main.tsx`. In production the Express SPA
 * history fallback (Phase 5) returns `index.html` for these client routes so direct-URL loads /
 * refreshes of `/boards/:id` render the SPA rather than a 404 (AC-NAV-1).
 */

import type { ReactNode } from 'react';
import { Routes, Route } from 'react-router-dom';
import { AppShell } from './components/AppShell/AppShell';
import { BoardListPage } from './pages/BoardListPage';
import { BoardViewPage } from './pages/BoardViewPage';

export function App(): ReactNode {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<BoardListPage />} />
        <Route path="/boards/:id" element={<BoardViewPage />} />
      </Routes>
    </AppShell>
  );
}
