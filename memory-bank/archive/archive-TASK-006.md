# Archive: React Frontend Board UI (FEAT-006)

## Metadata
- **Task ID**: TASK-006
- **Complexity**: Level 3
- **Started**: 2026-06-20 (planning + creative)
- **Completed**: 2026-06-21
- **Roadmap Link**: FEAT-006 (version: next)
- **Branch**: feature/FEAT-006-react-frontend-board-ui

## Summary

TASK-006 introduced the project's **first frontend tier**: a read-only React SPA that consumes the existing Express CRUD APIs to render a board list page (`/`) and a board view page (`/boards/:id`) with three status-mapped kanban columns (To Do / In Progress / Done). The feature also made one backend change — adding a `status` field to the Card model — so cards could be distributed across the three columns.

The work spanned five implementation phases preceded by two mandatory creative phases (Architecture + UI/UX), all completed within two days. It delivered the project's frontend build tooling, client-side routing, a typed API client, component structure, and a Playwright E2E layer — establishing the architectural base for all future frontend features.

Display-only scope: no drag-and-drop, no auth, no real-time collaboration, no create/edit/delete from the UI (all deferred to future features).

## Requirements

### Original Requirements
- Board list page listing all boards (consumes `GET /api/v1/boards`)
- Board view page rendering three columns with cards distributed by status (consumes `GET /api/v1/boards/:id` + `GET /api/v1/boards/:boardId/cards`)
- Card display showing title and description
- Frontend build tooling, client-side routing, typed API client, component structure
- Backend: add a `status` field to the Card model (planning-time scope expansion, human-approved) so the three columns are real
- Loading, empty, and error states for both pages; WCAG 2.1 AA reasonable effort

### Success Criteria
- [✓] **AC-ENTRY-1**: User reaches the board list page; board names match `GET /api/v1/boards`; entries are navigable (Vitest + Playwright)
- [✓] **AC-ENTRY-2**: Empty state shown when no boards exist (Vitest + Playwright)
- [✓] **AC-HAPPY-1**: User views a board's cards partitioned into the three status columns; stub-detection — a different board shows a different card set (Vitest + Playwright)
- [✓] **AC-HAPPY-2**: Back-navigation returns to the board list (Vitest + Playwright)
- [✓] **AC-HAPPY-3**: Empty-column state when a board has no cards; all three columns still rendered (Vitest + Playwright)
- [✓] **AC-STATUS-1**: Card API exposes and persists a `status` field (`'todo' | 'in_progress' | 'done'`, NOT NULL DEFAULT `'todo'`, existing rows backfilled); invalid status → 400 validate-before-DB (backend Jest integration)
- [✓] **AC-ERROR-1**: Error state when the boards API is unreachable; no internal detail leaked (Vitest + Playwright)
- [✓] **AC-ERROR-2**: Error state when a board view cannot load (404 or unreachable); back-nav still accessible (Vitest + Playwright)
- [✓] **AC-LOADING-1**: Loading indicator while API calls are in flight (Vitest)
- [✓] **AC-NAV-1**: Direct-URL load and reload of `/boards/:id` works via the real Express SPA history fallback (Playwright against `node dist/index.js` with `SERVE_CLIENT=true`)

All 10 acceptance criteria satisfied with direct test/E2E evidence.

## Implementation

### Approach

Backend-first, then frontend foundation → list page → view page → E2E. The two creative phases ran before any implementation and were used as implementation contracts (canonical copy strings, file paths, CSS token values, component names used verbatim as test assertions). Each of the five phases was independently code-reviewed (0 blocking findings each) and built on a stable artifact from the prior phase with zero backtracking.

### Key Components

1. **Backend `status` field** (Phase 1)
   - Purpose: assign cards to the three kanban columns by status
   - Files: `migrations/1781985941842_add-status-to-cards.js` (varchar(20) NOT NULL DEFAULT `'todo'`, backfills existing rows, no DB CHECK — app-validated), `src/validation/card.ts` (`CARD_STATUSES` single source of truth + `checkStatus` validator + default), `src/db/cards.ts` (`status` threaded into `RETURNING_COLUMNS`, create/update params), `src/routes/cards.ts` (unchanged — status flows through existing input plumbing)

2. **Frontend foundation** (Phase 2)
   - Purpose: the project's first frontend tier as an isolated `client/` package
   - Files: `client/` (Vite 5 + React 18 + TypeScript), solution-style tsconfig split (`tsconfig.json` → `tsconfig.app.json` + `tsconfig.node.json`), `vite.config.ts` (dev proxy for `/api/v1` + `/health`), `client/src/api/apiClient.ts` + `types.ts` (typed `getBoards`/`getBoard`/`getCards`, safe `ApiError` category mapping), `errorReporter.ts` + `ErrorBoundary`, `styles/tokens.css` + `globals.css`, router skeleton (BrowserRouter, AppShell)

3. **Board list page** (Phase 3)
   - Purpose: fetch + render boards with loading/empty/error states
   - Files: `client/src/pages/BoardListPage.tsx` (discriminated-union `LoadState` state machine), reusable `Spinner` / `EmptyState` / `ErrorMessage` / `BoardEntry` components (CSS Modules), `client/src/api/errorCopy.ts` (`boardListErrorCopy` keyed on safe `ApiError.category`)

4. **Board view page** (Phase 4)
   - Purpose: three status-mapped columns with card display, parallel fetch, back-nav
   - Files: `client/src/pages/BoardViewPage.tsx` (parallel `Promise.all` fetch, `cardsByStatus` partition, `[id]`-keyed re-fetch, page-level back-nav), `KanbanBoard` / `Column` / `CardItem` components (CSS Modules), `boardViewErrorCopy` added to `errorCopy.ts`

5. **E2E + Express SPA serving** (Phase 5)
   - Purpose: production static-serve + SPA history fallback (AC-NAV-1) and runnable E2E regression layer
   - Files: `src/config/env.ts` (`serveClient`/`clientDistPath` config + fail-fast `parseBool`), `src/middleware/serveClient.ts` (`registerClientServing`: `express.static` + history fallback, API/health/non-GET excluded), `app.ts` wiring (gated, after `/api/v1`+`/health`, before `notFound`), `client/playwright.config.ts`, `client/e2e/fixtures.ts`, `client/e2e/board-journeys.spec.ts` (7 hermetic specs against the real built server)

### Design Decisions

Both creative phases held through implementation with no reversals.

- **Architecture**: Vite + separate `client/` package (perfect build/test isolation — zero backend regression across all 4 frontend phases); single-origin Express static + SPA history fallback (AC-NAV-1, no CORS); `varchar(20)` app-validated `status` (no DB enum/CHECK); Vitest + RTL for components, Playwright for E2E; console-only `errorReporter` (no third-party telemetry); Docker Compose stays postgres-only.
- **UI/UX**: CSS Modules + CSS custom-property tokens; neutral slate palette + `#3B6EF5` accent (WCAG AA verified); vertical board list; horizontal three-column kanban with `overflow-x` scroll (all three columns always rendered); title+description cards, no status badge (column placement conveys status); 200ms-delayed CSS-only spinner honoring `prefers-reduced-motion`; text-only empty/error states with exact copy keyed on `ApiError.category`; `← Back to boards` page-level link always above the `<h1>`; h1→h2→h3 heading hierarchy with `<section aria-label>` columns.

References: `memory-bank/creative/TASK-006-react-frontend-architecture.md`, `memory-bank/creative/TASK-006-react-frontend-uiux.md`

## Testing

- **Backend Jest**: 113 → 138 (+25 net from this task: Phase 1 +14 status validation/integration; Phase 5 +11 env + serveClient middleware)
- **Frontend Vitest**: 0 → 34 (Phase 2 +9 apiClient/routing; Phase 3 +8 board list; Phase 4 +17 board view/Column/CardItem)
- **Playwright E2E**: 7/7 — full AC journeys against the genuine `SERVE_CLIENT=true` production path (hermetic API via `page.route`, no DB/seed step)
- **Net new tests from TASK-006**: 66 (25 backend + 34 frontend + 7 E2E); total project suite 179
- **All tests passing**: ✅
- **Code review**: independent build-code-reviewer-agent on every phase — 0 blocking findings across all 5 phases. Security clean (XSS-safe React rendering, GP5 no-internal-detail-leak asserted, no `console.*` outside the dedicated `errorReporter`). WCAG 2.1 AA verified (roles, focus-visible, heading hierarchy).

## Files Changed

**Backend**:
- `migrations/1781985941842_add-status-to-cards.js` — new migration: `cards.status` varchar(20) NOT NULL DEFAULT `'todo'`
- `src/validation/card.ts` — `CARD_STATUSES`, `checkStatus`, default status
- `src/db/cards.ts` — `status` in RETURNING_COLUMNS + create/update params
- `src/config/env.ts` — `serveClient` / `clientDistPath` config + `parseBool`
- `src/middleware/serveClient.ts` — new: gated static-serve + SPA history fallback
- `src/app.ts` — wire `registerClientServing` (gated, ordered after API/health, before notFound)

**Frontend** (new `client/` package):
- Vite/TS/React tooling, tsconfig solution split, dev proxy
- `client/src/api/` — apiClient, types, errorCopy, errorReporter
- `client/src/pages/` — BoardListPage, BoardViewPage
- `client/src/components/` — Spinner, EmptyState, ErrorMessage, BoardEntry, KanbanBoard, Column, CardItem (+ CSS Modules)
- `client/src/styles/` — tokens.css, globals.css; App/AppShell/ErrorBoundary
- `client/playwright.config.ts`, `client/e2e/` — fixtures + board-journeys specs
- `.gitignore` — Playwright artifacts

## Lessons Learned

- **The `client/` separate-package pattern structurally resolves ESM/CJS coexistence** for React + Node in one repo — no `exclude` fences or config patches needed. Default starting point for any future frontend tier.
- **A discriminated-union `LoadState` + `AbortController` + `signal.aborted` guard is the correct React fetch-state machine** — coined in Phase 3, reused verbatim in Phase 4, handled every loading/error/empty AC without flicker or unmount errors.
- **Centralizing user-facing error copy on a safe `ApiError.category` enum makes GP5 structurally enforceable and testable** — components never see raw error detail.
- **`npm install --prefix <subdir>` from the repo root injects a self-referencing `file:..` dependency** into the subpackage — always install from within the subpackage directory. (Recurred twice; now a tooling learned rule.)
- **The by-task session log gap has persisted for six consecutive tasks** — escalated from a recurring note to an overdue tracked ecosystem defect.

Reference: `memory-bank/reflection/reflection-TASK-006.md`

## References
- Reflection: `memory-bank/reflection/reflection-TASK-006.md`
- Creative (Architecture): `memory-bank/creative/TASK-006-react-frontend-architecture.md`
- Creative (UI/UX): `memory-bank/creative/TASK-006-react-frontend-uiux.md`
- Task plan & execution state: `memory-bank/tasks/TASK-006.md`
- Progress notes: `memory-bank/progress.md`

## Follow-up
- **Seeded-DB E2E variant** — run Playwright against real Postgres (docker compose + migrations + seed) for true end-to-end DB coverage, complementing the current hermetic suite.
- **Multi-stage Dockerfile** — single-image prod serving (Express serves the built `client/dist`) per the architecture doc's documented prod path.
- **Prune unused `ErrorMessage.backLink` prop** — both pages use a page-level back-nav link instead; minor dead code.
- **OpenAPI spec** — carried from TASK-004/TASK-005; still deferred (now ~12 endpoints live).
- **`node-pg-migrate` dev-tree audit triage** — carried follow-up (19 moderate / 2 high dev-only advisories).
- **Frontend context file in the plugin** — no frontend guidance exists in the Banyan context set for the new tier (ecosystem suggestion from reflection).
