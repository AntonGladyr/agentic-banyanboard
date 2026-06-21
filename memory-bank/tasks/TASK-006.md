# TASK-006: React frontend board UI

**Complexity**: Level 3
**Status**: CREATIVE_COMPLETE
**Roadmap**: FEAT-006
**Branch**: feature/FEAT-006-react-frontend-board-ui
**Worktree**: N/A

## Task Description

Add a React frontend that consumes the existing Express CRUD APIs. Introduces the project's first frontend tier.

Scope (per FEAT-006):
- **Board list page** — lists all boards (consumes `GET /api/v1/boards`).
- **Board view page** — renders three columns (To Do / In Progress / Done) for a selected board, with each column showing its cards.
- **Card display** — each card shows its title, description, and labels.

Introduces: frontend build tooling, client-side routing, an API client against the Board and Card endpoints, and component structure for boards, columns, and cards.

**Display-only scope** — no drag-and-drop, no auth, no real-time collaboration, no create/edit/delete from the UI in this feature (those are future features). The frontend reads from the existing backend and renders.

Requires architecture (frontend tooling/structure, API integration, dev/prod parity, observability) and UI/UX (board list, column layout, card rendering) creative phases.

**Depends on**: FEAT-004 (Card model — complete), FEAT-005 (Board model — complete). Both backing APIs are live.

## Specification

**Feature Type**: End-User Feature
**Primary Persona**: Alex the Dev — software engineer on a 4-person team who wants to quickly see what is in progress and pick up the next task with zero context-switch overhead. Secondary: Sam the Maker (solo developer tracking personal tasks without a paid subscription) and Jordan the PM (lightweight board hygiene).
**Creative Exploration Needed**: Yes — see § Creative Exploration Needed below for the four specific design questions that MUST be resolved before implementation can begin.

### Invocation Method

- **Location**: Browser tab at the app root. The React SPA is served at `http://localhost:3000` (same port as the current Express API). The board list is the application root (`/`); the board view for a specific board is at `/boards/:id`.
- **Element**: Navigation is fully client-side. The board list page is the default landing page. Each board entry on the list page is a clickable link/card that navigates to `/boards/:id`. A back-navigation affordance (e.g., "Back to boards" link) returns the user to `/`.
- **Visibility**: Always visible — no auth gate in this feature scope.
- **Navigation**:
  1. User opens `http://localhost:3000` in a supported browser (Chrome 120+, Firefox 120+, Safari 17+, Edge 120+).
  2. The board list page renders, calling `GET /api/v1/boards` to populate the list.
  3. User clicks a board entry to navigate to `/boards/:id`.
  4. The board view page renders, calling `GET /api/v1/boards/:id` and `GET /api/v1/boards/:id/cards` to populate the columns.
  5. User reads the cards displayed across the three column sections.
- **Confidence**: LOW — the frontend tooling (Vite vs alternatives), how the React app is served alongside the Express API (dev proxy vs separate port vs Express static middleware), and the exact URL scheme are all architecture decisions not yet made. The routes `/` and `/boards/:id` are the intended paths but assume the SPA is co-served at port 3000. See Creative Exploration Needed: question 1.

### Success Criteria

- **User sees**: On the board list page — a list of board names (and optionally descriptions) fetched live from `GET /api/v1/boards`. On the board view page — three named column sections (To Do / In Progress / Done) with cards distributed across them; each card displays its `title` and `description` fields (sourced from `GET /api/v1/boards/:boardId/cards`). Loading and error states are visible while data is in flight or unavailable.
- **Verifiable at**: Browser at `http://localhost:3000` (board list) and `http://localhost:3000/boards/:id` (board view). The board list must show board names that match the rows returned by `GET /api/v1/boards`; the cards on the board view must match the rows returned by `GET /api/v1/boards/:boardId/cards`. Output must be data-specific — a different board must show a different set of cards (stub-detection requirement).
- **Data persisted**: N/A — display-only. No writes in this feature.
- **Observable within**: Immediate on page load (synchronous render with API call in flight, data populates within the 2-second page-load budget defined in productBrief.md NFRs for localhost).

### Backend Data Reality (Gap Analysis)

The Card model (`src/db/cards.ts`) exposes: `id`, `board_id`, `title`, `description`, `position`, `created_at`, `updated_at`. It had NO `status`, `column`, or `labels` field. The roadmap feature description asks for three columns (To Do / In Progress / Done) and card "labels". Both were absent from the backend schema. Two design gaps were surfaced and **resolved during planning (human decision 2026-06-20)**:

- **Column mapping gap — RESOLVED: add a `status` field (scope expansion).** Cards previously had only a `position` integer with no column/status field. **Decision: add a `status` column to the `cards` table** (a new migration), expose it through the Card API/validation/data-access layer, and use it to assign cards to the three columns. This makes the kanban layout real (aligns with the product vision) and expands the feature's footprint to include ONE backend phase before the frontend work. The specific enum values, default, and existing-row backfill are confirmed in the Architecture creative phase (planning default: `status` varchar/enum `'todo' | 'in_progress' | 'done'`, NOT NULL DEFAULT `'todo'`, existing rows backfill to `'todo'`).
- **Labels gap — RESOLVED: omit labels (out of scope).** Cards have no labels field. **Decision: omit labels from this feature entirely** — display-only scope, no labels backend change. Defer labels to a future feature that adds the backing field.

### Acceptance Criteria

#### AC-ENTRY-1: User can reach the board list page
**Priority**: MUST
**Given** a user who has the app running locally (`docker compose up` for PostgreSQL, Express server running on port 3000 with at least one board in the database)
**When** they open `http://localhost:3000` in a supported browser
**Then**
- The page loads within 2 seconds on localhost (productBrief NFR)
- The page title or heading identifies the application (e.g., "BanyanBoard" or "Boards")
- At least one board name is visible on the page, matching a board that exists in the database via `GET /api/v1/boards`
- Each board entry is a navigable link/button to the board view page

**Verification**:
- [ ] E2E: navigate to `http://localhost:3000`, assert board list heading is present
- [ ] E2E: assert at least one board name matches what `GET /api/v1/boards` returns
- [ ] E2E: assert each board entry is clickable and navigates away

#### AC-ENTRY-2: Board list page shows empty state when no boards exist
**Priority**: MUST
**Given** a user who has the app running with zero boards in the database (`GET /api/v1/boards` returns `[]`)
**When** they open `http://localhost:3000`
**Then**
- The page loads without error
- An empty state message is visible (e.g., "No boards yet" or similar — exact copy is a UI/UX creative decision)
- No board cards or broken list elements are rendered

**Verification**:
- [ ] E2E: seed database with zero boards, navigate to `/`, assert empty state element is present
- [ ] Unit: BoardList component renders empty state when passed an empty array

#### AC-HAPPY-1: User views a board's cards in columns
**Priority**: MUST
**Given** a user on the board list page, with a board in the database that has at least one card
**When** they click that board's entry
**Then**
- The browser navigates to `/boards/:id` (the board's id)
- The page shows the board's name as a heading
- Three column sections are visible — To Do / In Progress / Done (visual treatment to be decided in UI/UX creative phase)
- Each card is rendered in the column matching its `status` field (`todo` → To Do, `in_progress` → In Progress, `done` → Done)
- At least one card is visible in the appropriate column, showing its `title` and `description` fields as sourced from `GET /api/v1/boards/:boardId/cards`
- The card data is specific to this board (not generic placeholder text — stub-detection requirement)
- Navigating to a DIFFERENT board's URL shows a DIFFERENT set of cards

**Verification**:
- [ ] E2E: seed two boards each with distinct cards, navigate to each board's URL, assert card titles are board-specific
- [ ] E2E: assert board name heading matches what `GET /api/v1/boards/:id` returns
- [ ] Unit: BoardView component renders cards into the correct column sections given a known card set

#### AC-HAPPY-2: User navigates back to the board list
**Priority**: MUST
**Given** a user on a board view page at `/boards/:id`
**When** they use the back-navigation affordance (e.g., "Back to boards" link or browser back button)
**Then**
- They are returned to the board list page at `/`
- The board list is still populated correctly

**Verification**:
- [ ] E2E: navigate to a board view, click back affordance, assert arrival at `/` with board list visible

#### AC-HAPPY-3: Board view shows empty state when a board has no cards
**Priority**: MUST
**Given** a user navigating to a board that exists but has zero cards (`GET /api/v1/boards/:boardId/cards` returns `[]`)
**When** the board view page loads
**Then**
- The board name heading is shown
- The three column sections are rendered (not omitted)
- Each column shows an empty state (e.g., "No cards" or empty column — exact copy is a UI/UX creative decision)
- No broken or null card elements are rendered

**Verification**:
- [ ] E2E: seed a board with zero cards, navigate to its URL, assert columns present, assert no card elements rendered
- [ ] Unit: Column component renders empty state when passed an empty card array

#### AC-STATUS-1: Card API exposes and persists a status field (backend)
**Priority**: MUST
**Given** the `cards` table extended with a `status` column (`'todo' | 'in_progress' | 'done'`, NOT NULL DEFAULT `'todo'`)
**When** cards are read via `GET /api/v1/boards/:boardId/cards` (and created/updated via the existing POST/PATCH endpoints)
**Then**
- Each card object in the response includes a `status` field with one of the three allowed values
- Existing cards created before the migration default to `'todo'`
- Creating a card without a status defaults to `'todo'`; supplying an invalid status → 400 (validate-before-DB, consistent with the existing card validation layer)
- Updating a card's status to a valid value persists and is reflected on read-back

**Verification**:
- [ ] Integration: `GET /api/v1/boards/:boardId/cards` returns cards each carrying a valid `status`
- [ ] Integration: POST without status → card has `status: 'todo'`; POST/PATCH with invalid status → 400, no DB write
- [ ] Integration: PATCH status to `'in_progress'` → read-back shows `'in_progress'`
- [ ] Migration: up adds the column with default + backfills existing rows to `'todo'`; down drops it cleanly

#### AC-ERROR-1: User sees an error state when the API is unreachable
**Priority**: MUST
**Given** a user navigating to `http://localhost:3000` when the Express backend is not running (or returns a 5xx)
**When** the board list page attempts to call `GET /api/v1/boards` and the request fails
**Then**
- The page does not crash or show a blank white screen
- A human-readable error message is displayed (e.g., "Could not load boards. Please try again." — exact copy is a UI/UX creative decision)
- The user is not shown internal error details or stack traces (consistent with Guiding Principle 5 in systemPatterns.md)

**Verification**:
- [ ] E2E: intercept/block the `GET /api/v1/boards` request, assert error message element is visible
- [ ] Unit: BoardList component renders error state when the API call rejects

#### AC-ERROR-2: User sees an error state when a board view cannot load
**Priority**: MUST
**Given** a user navigating to `/boards/:id` for a board id that does not exist (API returns 404) or when the API is unreachable
**When** the board view page attempts to call `GET /api/v1/boards/:id` or `GET /api/v1/boards/:id/cards` and the request fails
**Then**
- A human-readable error message is displayed (e.g., "Board not found" for 404, "Could not load board" for network failure — exact copy is a UI/UX creative decision)
- The user is not shown a blank screen or unhandled exception UI
- The back-navigation affordance is still accessible so the user can return to the board list

**Verification**:
- [ ] E2E: navigate to `/boards/99999` (non-existent id), assert error message and back-navigation are visible
- [ ] Unit: BoardView component renders error state when board fetch returns null/404

#### AC-LOADING-1: User sees a loading state while API calls are in flight
**Priority**: SHOULD
**Given** a user navigating to any page that fetches data from the API
**When** the API call is pending (not yet resolved)
**Then**
- A loading indicator is visible (e.g., spinner, skeleton, or "Loading..." text — exact treatment is a UI/UX creative decision)
- The page does not flash a broken/empty state before data arrives

**Verification**:
- [ ] Unit: BoardList component renders loading state when data-fetch status is "loading"
- [ ] Unit: BoardView component renders loading state when data-fetch status is "loading"

#### AC-NAV-1: Direct URL navigation works for board view
**Priority**: MUST
**Given** a user who opens `/boards/:id` directly in the browser (e.g., pastes the URL, or refreshes the page)
**When** the page loads
**Then**
- The board view renders correctly (not a 404 or blank page)
- The card data loads from the API as expected
- Confidence note: this depends on how the SPA is served — if Express serves the frontend as static files, it must return `index.html` for all non-API routes. This is an architecture decision (creative phase question 1).

**Verification**:
- [ ] E2E: navigate directly to `/boards/:id` without first visiting `/`, assert board view renders

### Scope Boundaries

**In scope**:
- **Backend: add a `status` field to the Card model** — migration (`status` enum/varchar, NOT NULL DEFAULT `'todo'`, backfill existing rows), validation update (accept + validate `status` on create/update), data-access update (`src/db/cards.ts` SELECT/RETURNING include `status`), and the integration-test additions. This is the only backend change.
- React SPA with two pages: board list (`/`) and board view (`/boards/:id`)
- Client-side routing between the two pages
- API client that calls `GET /api/v1/boards` (board list page) and `GET /api/v1/boards/:boardId/cards` + `GET /api/v1/boards/:id` (board view page)
- Card display showing `title` and `description` fields from the Card model (`src/db/cards.ts`)
- Board display showing `name` field from the Board model (`src/db/boards.ts`)
- Three-column layout on the board view, cards assigned by their `status` field (To Do / In Progress / Done)
- Loading states, empty states, and API error states for both pages
- Frontend build tooling setup (to be decided in architecture creative phase)
- Dev/prod parity strategy: how the React app is served alongside Express and how it reaches `/api/v1` (to be decided in architecture creative phase)

**Out of scope**:
- Create, edit, or delete boards from the UI (future feature)
- Create, edit, or delete cards from the UI (future feature)
- Drag-and-drop card reordering (explicitly excluded from FEAT-006)
- Authentication or authorization (explicitly excluded from FEAT-006)
- Real-time collaboration or WebSocket updates (explicitly excluded from FEAT-006)
- Card labels display — no `labels` field exists on the Card model; defer to a future feature that adds the backend field (see Gap Analysis above)
- Filter or search functionality
- Pagination (hundreds of cards per board is the scale target; no pagination required for MVP)
- Column creation or customization from the UI

**Dependencies**:
- FEAT-005 (Board CRUD) — `GET /api/v1/boards` and `GET /api/v1/boards/:id` must be live. Status: complete.
- FEAT-004 (Card CRUD) — `GET /api/v1/boards/:boardId/cards` must be live. Status: complete.
- Architecture creative phase — must resolve frontend tooling, dev/prod serving strategy, and column-mapping approach before implementation begins.
- UI/UX creative phase — must resolve visual layout, empty states, error states, loading treatment, and color/contrast before implementation begins.

**NFR implications** (from productBrief.md):
- **Performance**: Page load < 2 seconds on localhost; board load time < 1 second on local machine (productBrief Success Metrics). The frontend must not introduce unnecessary API waterfall (board list call and board view calls should complete within budget).
- **Accessibility**: WCAG 2.1 AA reasonable effort — keyboard navigation between boards and cards, color contrast compliance for column labels and any status indicators, focus indicators on all interactive elements (links, buttons).
- **Browser support**: Chrome 120+, Firefox 120+, Safari 17+, Edge 120+. No IE compatibility needed.
- **Responsive layout**: Usable on tablet; mobile-first is not a priority for MVP (productBrief).
- **Observability**: The productBrief lists "no third-party analytics or telemetry in MVP" and systemPatterns.md requires structured logging; frontend observability strategy (console errors, unhandled promise rejections, fetch error logging) is an architecture creative decision.
- **Security**: No auth in this feature; no PII displayed (board/card content is internal task data). Frontend must not expose internal error details to users (consistent with Guiding Principle 5).

### Creative Exploration Needed

Yes — this feature has FOUR questions that block implementation and MUST be resolved in the creative phases before any code is written. The two mandatory creative phases (Architecture Design + UI/UX Design) map directly to these questions.

**Architecture Creative Phase (blocks all implementation)**:

1. **Frontend tooling and serving strategy (LOW confidence — critical blocker)**
   The current repo has no frontend tooling at all (confirmed: no React, no Vite, no Webpack, no `client/` or `frontend/` directory, `package.json` has zero React/build-tool dependencies). The architecture phase must decide:
   - Build tool: Vite (recommended for React + TypeScript + fast HMR, widely adopted) vs Create React App (deprecated) vs Next.js (overkill for MVP static SPA) vs other
   - Project layout: monorepo in the same `package.json` (adds `client/` or `src/client/` subtree) vs separate `client/` with its own `package.json` vs a new top-level `frontend/` package
   - Dev/prod parity: in development, how does the React dev server reach `/api/v1` (Vite proxy to `http://localhost:3000` is the conventional approach); in production / Docker, does Express serve the built `dist/` as static files (simplest — single Docker image), or does a separate nginx container serve the frontend?
   - Module system: the backend uses CommonJS (`"type"` unset, `module: NodeNext`); the frontend will likely use ES modules with Vite; these must coexist without `tsconfig.json` conflicts (a separate `tsconfig.json` for the frontend subtree is the standard resolution)
   - Docker Compose impact: `docker-compose.yml` currently only has a `postgres` service; the architecture phase must decide whether to add an `api` service and/or a `frontend` service, or to keep the current "Express runs on host" model

2. **Status field schema design (RESOLVED at planning — Option B chosen; remaining sub-questions for creative)**
   The strategic decision is made: **add a `status` field to the Card model** (human decision 2026-06-20) so cards map to the three columns by status. A backend phase (Phase 1) now precedes the frontend work. The Architecture creative phase only needs to confirm the schema specifics:
   - Column type: Postgres native `enum` type vs `varchar` + CHECK constraint vs plain `varchar` validated at the app layer (planning lean: `varchar` + app-layer validation, consistent with the existing parameterized/validate-before-DB card layer; revisit if creative prefers a DB CHECK)
   - Allowed values + default: `'todo' | 'in_progress' | 'done'`, NOT NULL DEFAULT `'todo'`
   - Existing-row backfill: migration sets existing cards to `'todo'`
   - Whether create/update API accepts `status` (planning lean: yes — accept + validate, default `'todo'` when omitted)
   These are low-risk confirmations, not open blockers.

**UI/UX Creative Phase (blocks visual implementation)**:

3. **Visual layout and component design (LOW confidence)**
   No design system or UI component library exists yet. The creative phase must decide:
   - Board list page layout: card grid vs vertical list; what information is shown per board (name only, or name + description + card count)
   - Board view page layout: three-column horizontal layout (kanban-style) vs vertical stacked layout; column header styling; column width on narrow viewports
   - Card component: visual treatment for title, description, and (if added) status badge
   - Color palette and typography (consistent with a "lightweight, developer-friendly" product identity per productBrief)
   - Whether to adopt a CSS utility framework (Tailwind) or a component library (shadcn/ui, MUI) vs hand-rolled CSS — this has build-tooling implications that feed back into creative question 1

4. **Loading, empty, and error state design (LOW confidence)**
   The spec defines the behavioral requirements (AC-ENTRY-2, AC-HAPPY-3, AC-ERROR-1, AC-ERROR-2, AC-LOADING-1) but not the visual treatment. The UI/UX phase must decide:
   - Loading: spinner vs skeleton loaders vs "Loading..." text
   - Empty states: copy and visual treatment for zero boards and zero cards
   - Error states: copy, icon treatment, and recovery affordance for API failure and 404

## Test Strategy

### Approach
- **Emphasis**: Balanced across two tiers. **Backend** (Phase 1): extend the existing Jest + `ts-jest` + `supertest` suites with `status`-specific assertions (validation + integration) following the established validate-before-DB + in-memory-store-behind-mocked-pool patterns. **Frontend** (Phases 2–4): component/unit tests for the list, view, card, and state (loading/empty/error) behaviors. **E2E** (Phase 5): walk the concrete entry-to-success journeys defined in the ACs.
- **Target test count**: ~32–40 total (justified — this introduces a whole new frontend tier PLUS a backend schema change across 5 phases). Rough split: backend +8–10; frontend component ~14–18; E2E ~6–8.
- **Note**: the frontend test runner is an **Architecture creative decision** (planning lean: Vitest + React Testing Library for component tests since Vite is the likely build tool; Playwright or the project's existing UAT/Claude-in-Chrome path for E2E). Final tooling is confirmed in the Architecture creative phase and reflected here before Phase 2 build.

### File Organization
- **Extend existing** (Phase 1, backend):
  - `src/validation/card.test.ts` — add `status` validation cases (valid values, invalid → 400, omitted → default, type checks)
  - `src/routes/cards.test.ts` — add `status` integration cases (GET returns status, POST default `'todo'`, POST/PATCH invalid → 400 no-write, PATCH persists)
  - `src/db/cards.ts` has no dedicated test file per the existing Test Strategy convention — exercised transitively via `cards.test.ts`
- **New test files** (Phases 2–4, frontend): colocated component tests per the chosen frontend layout (e.g. `BoardList.test.tsx`, `BoardView.test.tsx`, `Card.test.tsx`, `apiClient.test.ts`) — exact paths follow the Architecture creative layout decision
- **New test files** (Phase 5, E2E): entry-to-success specs covering the AC journeys — location/format per the chosen E2E approach

### What NOT to Test
- Frontend build-tool config (Vite/tsconfig) — proven by the app building and running; not unit-tested
- Board/Card CRUD already covered by TASK-004/TASK-005 suites — Phase 1 adds ONLY `status`-specific assertions, not re-tests of existing behavior
- Third-party library internals (router, fetch, React rendering engine)
- Exact visual styling, colors, and copy — UI/UX concerns verified by UAT/inspection, not brittle string assertions
- The migration runner itself (`node-pg-migrate`) — only the migration's up/down effect is verified (manual `\d cards` per established Phase-1 migration convention)

### Per-Phase Test Guidance
- **Phase 1 (backend `status`)**: ~8–10 tests — validation unit (valid/invalid/default/omitted/type); integration (GET cards carry `status`; POST omitting status → `'todo'`; POST & PATCH invalid status → 400 with no DB write; PATCH to a valid status → read-back reflects it). Migration up/down verified manually (`\d cards` shows column + default; down drops cleanly; existing rows backfill to `'todo'`).
- **Phase 2 (frontend foundation)**: ~2–4 tests — typed API client wrapper (success path maps JSON; failure path surfaces an error the UI can render — no internal detail). Routing skeleton smoke test (renders the two routes). Mostly infrastructure.
- **Phase 3 (board list page)**: ~6–8 component tests — renders board names from a mocked `GET /boards`; empty state on `[]` (AC-ENTRY-2); loading state while pending (AC-LOADING-1); error state on rejected fetch (AC-ERROR-1); each entry is a navigable link (AC-ENTRY-1).
- **Phase 4 (board view page)**: ~8–10 component tests — renders board name heading; cards partitioned into the three columns by `status` (AC-HAPPY-1); a different card set per board (stub-detection); empty-column state when board has no cards (AC-HAPPY-3); loading state (AC-LOADING-1); error/404 state with back-nav still present (AC-ERROR-2); back-navigation returns to `/` (AC-HAPPY-2).
- **Phase 5 (E2E)**: ~6–8 tests — full journeys with a real/seeded backend: list → click board → cards in correct columns; empty board list; empty board (no cards); API-unreachable error on the list page; direct-URL load of `/boards/:id` (AC-NAV-1); back-nav round-trip. Uses the concrete values from the ACs, not abstract assertions.

## Implementation Plan

### Overview

TASK-006 introduces the project's first frontend tier (a read-only React SPA) and makes ONE backend change to support it: a `status` field on the Card model so cards map to the three kanban columns. Work proceeds backend-first (so the frontend consumes a stable API), then frontend foundation → board list page → board view page, closing with E2E tests of the full journeys. Both creative phases (Architecture, UI/UX) are required and must complete before Phase 1's frontend-affecting decisions and Phase 2 begin — though the Architecture phase also confirms the Phase 1 `status` schema specifics.

### Component Analysis

**New components**:
- Frontend tier: build tooling, SPA entry, client-side router, typed API client, shared API types, page components (BoardList, BoardView), presentational components (board entry, column, card), and loading/empty/error state components — exact layout per Architecture creative.

**Affected components (backend)**:
- `migrations/` — new migration adding `cards.status`
- `src/validation/card.ts` — accept + validate `status`
- `src/db/cards.ts` — include `status` in SELECT/RETURNING columns and create/update params
- `src/routes/cards.ts` — pass validated `status` through (likely no structural change — validation + data layer carry it)
- `docker-compose.yml` / serving — possible `api`/`frontend` service additions per Architecture creative
- `package.json` / `tsconfig.json` — frontend deps + a frontend tsconfig per Architecture creative

### Dependencies & Risks
- **Dep**: FEAT-004 (Card CRUD) and FEAT-005 (Board CRUD) APIs — both live/complete.
- **Risk**: backend module-system (CJS) vs frontend (ESM/Vite) `tsconfig` conflict → **Mitigation**: separate frontend `tsconfig.json` subtree (resolved in Architecture creative).
- **Risk**: dev/prod serving + direct-URL SPA fallback (AC-NAV-1) → **Mitigation**: Architecture creative decides Express-static-with-`index.html`-fallback vs separate container.
- **Risk**: scope creep on the `status` field (e.g. card reordering/status-change UI) → **Mitigation**: status is display-only in this feature; mutation UI is explicitly out of scope.

### API Requirements — REST
- **Involves REST API**: Yes (consumer + minor extension). Existing endpoints consumed read-only; `cards` create/update extended to accept `status`. OpenAPI spec still deferred (carried follow-up from prior tasks).

### Observability
- Backend Phase 1 reuses the existing card-route logging (business events via `req.log`, no `console.*`). Frontend observability (console-error / unhandled-rejection / fetch-error handling, no third-party telemetry per productBrief) is an Architecture creative decision.

## Implementation Roadmap

- [x] Phase 1: Backend — add `status` field to the Card model (migration + validation + data-access + integration tests) → delivers AC-STATUS-1 — COMPLETE (2026-06-20)
- [x] Phase 2: Frontend foundation — build tooling, project layout, dev proxy, client-side routing skeleton, typed API client + shared types, app shell, ErrorBoundary + errorReporter, Vitest + RTL — COMPLETE (2026-06-20). (Prod static serving deferred to Phase 5 per Architecture creative phase mapping.)
- [x] Phase 3: Board list page (`/`) — fetch + render boards, navigable entries, empty/loading/error states → delivers AC-ENTRY-1, AC-ENTRY-2, AC-ERROR-1 (list), AC-LOADING-1 (list) — COMPLETE (2026-06-20)
- [x] Phase 4: Board view page (`/boards/:id`) — three status-mapped columns, card display, empty-column/loading/error-404 states, back-nav, direct-URL nav → delivers AC-HAPPY-1/2/3, AC-ERROR-2, AC-LOADING-1 (view), AC-NAV-1 — COMPLETE (2026-06-21)
- [ ] Phase 5: E2E tests + serving verification — implement entry-to-success E2E specs, verify full journeys and dev/prod serving (post-UAT per Level 3 flow)

## Creative Phases

- [x] Architecture design → **required** (frontend tooling/layout, dev/prod serving + SPA fallback, module-system coexistence, `status` schema confirmation, frontend test-runner choice, frontend observability) → COMPLETE → `memory-bank/creative/TASK-006-react-frontend-architecture.md`
- [x] UI/UX design → **required** (board list layout, three-column board view layout, card component, loading/empty/error visual treatment + copy, WCAG 2.1 AA: keyboard nav, contrast, focus indicators) → COMPLETE → `memory-bank/creative/TASK-006-react-frontend-uiux.md`

---

## Execution State

**Build Status**: COMPLETE (Phase 4 of 5)
**Current Phase**: BUILD
**Current Build**: Phase 4: Board view page (`/boards/:id`) — three status-mapped columns, card display, empty-column/loading/error-404 states, back-nav, direct-URL nav (AC-HAPPY-1/2/3, AC-ERROR-2, AC-LOADING-1, AC-NAV-1) — COMPLETE
**Phase Number**: 4 of 5
**Is Multi-Phase**: YES
**Build Started**: 2026-06-21
**Current Step**: Phase 4 complete — awaiting human review, then /banyan-uat (Level 3 flow) or /banyan-build TASK-006 (Phase 5)
**Last Completed**: BUILD Phase 4/5 (2026-06-21)
**Can Resume**: NO
**Branch**: feature/FEAT-006-react-frontend-board-ui (created from master 2026-06-20)

### Current Build Step (Phase 4)
**Step**: Step 11 — Git Completion (Phase 4)
**Status**: COMPLETE — committed to feature/FEAT-006-react-frontend-board-ui (NOT pushed; push deferred to human / archive per project config).
**Completed**: 2026-06-21

### Build Completed Steps (Phase 4)
- Step 0.5 Git Setup: COMPLETE — on feature/FEAT-006-react-frontend-board-ui (in-tree, no worktree).
- Step 0.6 Phase Gate: COMPLETE — roadmap populated; both creative phases COMPLETE; Phases 1–3 done.
- Step 1 Read Task Context: COMPLETE — Phase 4 (board view page) identified, Level 3.
- Step 2 Load Context: COMPLETE — UI/UX creative (Decision Areas 3/4/5/8/9, exact copy, a11y, component inventory, Phase-4 guidelines) + apiClient/types/errorCopy + Phase 2/3 foundation components reviewed.
- Step 3 Test Writer: COMPLETE — 17 Vitest tests written first (BoardViewPage ×11, Column ×3, CardItem ×3) + App.test.tsx mock refresh.
- Step 4 Coding Agent (orchestrator-authored): COMPLETE — KanbanBoard, Column, CardItem components (+ CSS Modules); `boardViewErrorCopy` added to errorCopy.ts; BoardViewPage live page (parallel fetch, partition, back-nav, focus, title) + module.css.
- Steps 5–7 Test/Build/Integration: COMPLETE — frontend `tsc -b` clean; Vitest 34/34; `vite build` PASS (59 modules). Backend `tsc`+Jest 127/127 → isolation reconfirmed. Lint N/A.
- Step 8 Code Review: COMPLETE — independent build-code-reviewer-agent APPROVED-WITH-NITS, 0 blocking. Applied nits #1 (comment) + #3 (test selector); backLink omission intentional; nit #2 defensive branch left as-is.
- Steps 9–10 Docs/Memory Bank: COMPLETE — progress.md (Phase 4 section + history row), tasks.md registry (Phase 4/5), this file updated. No new tech → techContext unchanged.

### Phase 4 Notes / Deviations (for Phase 5 and reflection)
- **Phase 5 serving + AC-NAV-1**: direct-URL `/boards/:id` currently works in dev via the Vite history fallback; Phase 5 must add the Express static-serve + SPA `index.html` history fallback (`SERVE_CLIENT`) to satisfy AC-NAV-1 in prod, and implement the Playwright E2E journeys.
- **`ErrorMessage.backLink` is now unused** across both pages (list never set it; board view uses the always-present page-level back-nav instead). A future cleanup could remove the prop, or Phase 5/UAT may decide to keep it for a different surface. Left in place — harmless.
- **`prefers-reduced-motion`** Spinner behavior (Phase 3) applies unchanged on the board view.

### Current Build Step (Phase 3)
**Step**: Step 11 — Git Completion (Phase 3)
**Status**: COMPLETE — committed `f58e610` to feature/FEAT-006-react-frontend-board-ui (NOT pushed; push deferred to human / archive per project config).
**Completed**: 2026-06-20

### Build Completed Steps (Phase 3)
- Step 0.5 Git Setup: COMPLETE — on feature/FEAT-006-react-frontend-board-ui (in-tree, no worktree).
- Step 0.6 Phase Gate: COMPLETE — roadmap populated; both creative phases COMPLETE; Phase 1+2 done.
- Step 1 Read Task Context: COMPLETE — Phase 3 (board list page) identified, Level 3.
- Step 2 Load Context: COMPLETE — UI/UX creative (state machine, exact copy, a11y, component inventory) + Architecture creative (apiClient/ApiError, GP5) reviewed; Phase 2 foundation files read.
- Step 3 Test Writer: COMPLETE — 8 Vitest tests written first (BoardListPage: loading/success+links/description/empty/network-error/server-error/GP5-no-leak).
- Step 4 Coding Agent (orchestrator-authored): COMPLETE — Spinner, EmptyState, ErrorMessage, BoardEntry components (+ CSS Modules); errorCopy.ts; BoardListPage live page + module.css; App.test.tsx mock update.
- Steps 5–7 Test/Build/Integration: COMPLETE — frontend `tsc -b` clean; Vitest 17/17 (act warnings fixed); `vite build` PASS (52 modules). Backend `tsc`+Jest 127/127 → isolation reconfirmed. Lint N/A.
- Step 8 Code Review: COMPLETE — independent build-code-reviewer-agent APPROVED-WITH-NITS, 0 blocking. Nit #1 applied (errorCopy.ts fall-through comment); other nits intentional/no-action.
- Steps 9–10 Docs/Memory Bank: COMPLETE — progress.md (Phase 3 section + history row), tasks.md registry (Phase 3/5), this file updated. No new tech → techContext unchanged.

### Phase 3 Notes / Deviations (for Phase 4+ and reflection)
- **Reusable state components landed in Phase 3**: `Spinner`, `EmptyState`, `ErrorMessage` are built for reuse — Phase 4 consumes them directly (`EmptyState heading="No cards yet"` per empty column; `ErrorMessage` with `backLink` for board-view errors). `errorCopy.ts` should gain `boardViewErrorCopy(category)` for the `notFound`/`network`/`server` board-view copy.
- **App.test.tsx Phase 4 reminder (carried)**: the `/boards/:id` smoke assertions still target the Phase 2 skeleton placeholder (`/Board 42/`); Phase 4 replaces BoardViewPage with the real board name and must refresh those selectors + add the `apiClient` getBoard/getCards mocks there.
- **Spinner 200 ms delay is CSS-only** (no JS timer) — tests assert the `role="status"` element is present immediately; the anti-flash delay is purely visual. `prefers-reduced-motion` intentionally bypasses the delay (immediate static indicator).

### Current Build Step (Phase 2)
**Step**: Step 11 — Git Completion (Phase 2)
**Status**: COMPLETE — committed `9397c27` to feature/FEAT-006-react-frontend-board-ui (NOT pushed; push deferred to human / archive per project config).
**Completed**: 2026-06-20

### Build Completed Steps (Phase 2)
- Step 0.5 Git Setup: COMPLETE — on feature/FEAT-006-react-frontend-board-ui (in-tree, no worktree).
- Step 0.6 Phase Gate: COMPLETE — roadmap populated; both creative phases COMPLETE.
- Step 1 Read Task Context: COMPLETE — Phase 2 (frontend foundation) identified, Level 3.
- Step 2 Load Context: COMPLETE — Architecture creative (Vite + `client/` + Vite dev proxy; static serving deferred to Phase 5) + UI/UX creative (tokens) reviewed; backend contract captured (Board/Card shapes incl. `status`; error body `{ error, path?, traceId }`).
- Step 3 Test Writer: COMPLETE — 9 Vitest tests written first (apiClient: success/notFound/server/network mapping + no-leak; App routing smoke for both routes + shell brand).
- Step 4 Coding Agent (orchestrator-authored scaffold): COMPLETE — `client/` package (Vite+React+TS), tsconfig solution split, vite proxy config, router skeleton (App + AppShell + page skeletons), apiClient + types, errorReporter + ErrorBoundary, tokens.css + globals.css, README.
- Steps 5–7 Test/Build/Integration: COMPLETE — frontend typecheck PASS; Vitest 9/9 PASS; `vite build` PASS (dist emitted). Backend `tsc` build PASS + Jest 127/127 PASS → `client/` isolation confirmed, no backend regression. No lint script in either package (N/A).
- Step 8 Code Review: COMPLETE — independent reviewer (build-code-reviewer-agent) APPROVED-WITH-NITS, 0 blocking. NIT 1 (ReactNode import consistency) applied; NIT 2 (tsconfig naming — improvement, noted below); NIT 3 (Phase-4 must refresh App.test.tsx placeholder selectors).
- Steps 9–10 Docs/Memory Bank: COMPLETE — progress.md (build entry), techContext.md (Frontend Tier + commands + env var + Last Refreshed), tasks.md registry (Phase 2/5), this file updated.

### Phase 2 Notes / Deviations (for Phase 3+ and reflection)
- **tsconfig naming**: implemented the standard Vite 3-file solution layout (`tsconfig.json` solution → `tsconfig.app.json` + `tsconfig.node.json`) instead of the architecture doc's 2-file naming. Resolves TS6310 (composite project may not disable emit) and is the current Vite scaffold default — same intent, an improvement, not drift.
- **`client/.env.development` not created**: blocked by the `Edit(.env.*)` permission guardrail. `VITE_API_PROXY_TARGET` has a code default in `vite.config.ts`, so the file is optional; override documented in `client/README.md`.
- **Spurious self-dependency removed**: `npm install --prefix client` (run from repo root) injected `agentic-banyanboard: file:..` into `client/package.json` and symlinked the repo root into `client/node_modules`. Fixed by removing it and installing from within `client/`. Phase 3+ MUST run `npm install` from inside `client/`.
- **Phase 4 reminder**: `client/src/App.test.tsx` routing smoke asserts placeholder copy (`Boards`, `Board 42`); update those selectors when Phase 4 replaces the BoardViewPage skeleton with the real board name.

### Phase 1 (archived)
**Step 11 — Git Completion (Phase 1)**: COMPLETE — committed `33786aa` to feature/FEAT-006-react-frontend-board-ui (NOT pushed; push deferred to human / archive per project config). Completed 2026-06-20.

### Build Completed Steps (Phase 1)
- Step 0.5 Git Setup: COMPLETE — Feature branch created (no worktree; in-tree). Worktree=N/A.
- Step 0.6 Phase Gate: COMPLETE — Roadmap populated, both creative phases COMPLETE.
- Step 1 Read Task Context: COMPLETE — Phase 1 (backend status) identified, Level 3.
- Step 2 Load Context: COMPLETE — Architecture creative Q2 schema confirmed (varchar(20), app-validated).
- Step 3 Test Writer: COMPLETE — +9 validation unit tests, +5 integration tests (TDD, written first).
- Step 4 Coding Agent: COMPLETE — migration + validation + data-access threaded `status`; route unchanged.
- Steps 5–7 Test/Build/Lint: COMPLETE — 127/127 Jest pass; tsc clean; lint N/A (no lint script).
- Migration verification: COMPLETE — live up→down→up vs Postgres; `\d cards` shows `status varchar(20) NOT NULL DEFAULT 'todo'`.
- Step 8 Code Review: COMPLETE — independent reviewer APPROVED, 0 blocking.
- Steps 9–10 Docs/Memory Bank: COMPLETE — progress.md + tasks.md + this file updated; no new tech/pattern (reuses validate-before-DB + RETURNING_COLUMNS).

### Active Sub-Agents
- Architecture Design: COMPLETE (2026-06-20) — Output: memory-bank/creative/TASK-006-react-frontend-architecture.md
- UI/UX Design: COMPLETE (2026-06-20) — Output: memory-bank/creative/TASK-006-react-frontend-uiux.md

### Completed Steps
- Architecture Creative Design: COMPLETE (2026-06-20) — Output: memory-bank/creative/TASK-006-react-frontend-architecture.md
  - Decision: Vite + separate `client/` package; single-origin Express-static SPA (history fallback) + Vite dev proxy; `varchar(20)` app-validated `status` field; Vitest/RTL + Playwright; lightweight console-only client observability. UI/UX styling lean: CSS Modules (Tailwind optional).
- UI/UX Creative Design: COMPLETE (2026-06-20) — Output: memory-bank/creative/TASK-006-react-frontend-uiux.md
  - Decision: CSS Modules + CSS custom-property tokens; neutral slate palette + accent #3B6EF5 (WCAG AA contrasts verified); vertical board list; horizontal three-column kanban (tablet horizontal-scroll); title+description cards (no status badge); 200ms-delayed spinner; text-only empty/error states with exact copy mapped to network/notFound/server fetch-error categories; `← Back to boards` top-left link always present.

### Completed Steps
- Step 0.1 Create Task: COMPLETE (2026-06-20) - TASK-006 created for FEAT-006
- Step 2 Roadmap Link: COMPLETE (2026-06-20) - Linked to FEAT-006
- Step 3 Spec Writer: COMPLETE (2026-06-20) - Specification drafted (Sonnet), human-reviewed
- Step 3.2 Human Review: COMPLETE (2026-06-20) - Approved; column gap resolved → add `status` field (backend + frontend); labels omitted
- Step 5 Implementation Plan: COMPLETE (2026-06-20) - 5 phases, test strategy, 2 creative phases flagged required
- Step 6 Finalize: COMPLETE (2026-06-20) - Status=PLANNING_COMPLETE; both creative phases REQUIRED
