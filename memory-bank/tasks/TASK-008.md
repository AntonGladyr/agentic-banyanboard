# TASK-008: Realtime Activity Feed

**Complexity**: Level 3
**Status**: CREATIVE_COMPLETE
**Roadmap Link**: FEAT-008
**Branch**: feature/FEAT-008-realtime-activity-feed
**Worktree**: .claude-worktrees/FEAT-008

## Task Description

Track and display a realtime activity feed of card movements between columns (To Do / In Progress / Done). When a card is moved, an activity event is recorded (actor, card, source/target column, timestamp) and surfaced live to all connected clients via the realtime transport established in FEAT-007.

Builds on the documented Domain Event Pattern (card actions emit domain events; consumers subscribe to event streams). Requires architecture (activity-event model, persistence/retention strategy, feed delivery over the existing realtime channel) and UI/UX (feed presentation, ordering, empty/loading states) creative phases. Scoped to card-movement events for v1.

**Dependencies**: FEAT-007 (Board interactivity and real-time collaboration), FEAT-006 (React frontend board UI), FEAT-004 (Card model)

## Specification

**Feature Type**: End-User Feature
**Primary Persona**: Alex the Dev — Software engineer on a 4-person team who needs to quickly see what is in progress and pick up the next task; zero context-switch overhead when checking board state.
**Creative Exploration Needed**: Yes — feed UI location/layout (sidebar vs. panel vs. drawer), actor identity strategy (no auth in MVP), and activity event retention/delivery model need design decisions before implementation.

### Invocation Method

- **Location**: The board view page (`/boards/:id`, rendered in `client/src/pages/BoardViewPage.tsx`). The activity feed appears automatically alongside the kanban board whenever the user is on the board view — it is not hidden behind a menu or toggle in v1.
- **Element**: A read-only activity feed panel — a scrollable list of activity entries, each describing a card move (e.g. "Card X moved from To Do to In Progress"). The feed receives new entries live via the existing SSE channel (`GET /api/v1/boards/:boardId/events`, implemented in `src/realtime/eventsRouter.ts`). No separate button or navigation step is needed to "activate" the feed; it is always visible alongside the board.
- **Visibility**: Always visible on the board view page (status: `success` load state) when the board has activity. Shows an empty state when no card moves have been recorded yet. Shows a loading state on initial data fetch.
- **Navigation**: Open board → `localhost:3000` → click a board from the list (`BoardListPage`) → board view page (`BoardViewPage`) → feed is visible immediately alongside the kanban columns.
- **Confidence**: MEDIUM — the page location is HIGH confidence (board view page is the only viable home for a board-scoped feed). The exact layout (sidebar to the right of the kanban, panel below the columns, or collapsible drawer) is LOW confidence and requires a UI/UX creative decision, because `KanbanBoard.tsx` currently fills the full available width (`max-width: 1280px` in `BoardViewPage.module.css`) and adding a feed panel requires a layout change.

### Success Criteria

- **User sees**: A chronologically ordered list of activity entries (newest first) on the board view page. Each entry shows: the card title, the source column, the target column, and the relative or absolute timestamp of the move. On a new card move (by any user), a new entry appears at the top of the feed list within the SSE delivery latency (sub-second on local network).
- **Verifiable at**: Board view page (`/boards/:id`) — the feed panel is visible without any additional navigation. Activity entries are also queryable via a new REST endpoint `GET /api/v1/boards/:boardId/activity` (returns an ordered JSON array of activity events for the board).
- **Data persisted**: A new `activity_events` table (migration under `migrations/`, following the existing `node-pg-migrate` JS migration pattern). Required columns: `id` (serial PK), `board_id` (integer FK to `boards`, ON DELETE CASCADE), `card_id` (integer, no FK — preserves activity history after card deletion), `card_title` (varchar — snapshot at time of event, not a FK, to survive card renaming), `from_status` (varchar), `to_status` (varchar), `actor` (varchar — see Actor section below), `occurred_at` (timestamptz, server-assigned).
- **Observable within**: New activity entries appear in the feed panel within the SSE round-trip latency — effectively immediate (< 1 second on localhost) for all currently connected clients. The REST endpoint `GET /api/v1/boards/:boardId/activity` returns persisted history on page load.

### Actor Identity

**DECIDED (planning, 2026-06-30): Option 1 — Anonymous stub.**

The productBrief notes "Session-based auth (email + password)" as the security plan but explicitly defers it: "No auth leaves board data exposed on a shared network — document the risk; add auth before any networked deployment." There is no auth middleware in `src/middleware/` (confirmed by codebase search — no `auth.ts`, no `session.ts`, no `req.user`). The existing echo de-dup mechanism uses an opaque per-tab `X-Client-Id` header / `?clientId=` query param (implemented in `client/src/api/clientId.ts`, used in `notify.ts`) but this token is explicitly documented as "opaque, not auth."

**Resolution**: Store `"anonymous"` as the actor for all events in v1. The `activity_events.actor` column ships as `varchar(255) NOT NULL DEFAULT 'anonymous'` so the schema is forward-compatible when auth lands (FEAT — future), but no name-capture UX is built in v1. This keeps v1 scope tight (no new frontend modal) while preserving the column. The feed entries describe the move without attributing a person.

Options considered and rejected for v1:

1. **Anonymous stub** ✅ — chosen (above).
2. **User-supplied display name**: a one-time prompt storing a name in `localStorage`. Rejected for v1 — adds a name-capture modal + header plumbing without auth-grade value.
3. **Defer actor entirely**: omit the column. Rejected — keeping the column (defaulted) avoids a second migration when auth lands.

### Acceptance Criteria

#### AC-ENTRY-1: Feed panel is visible on the board view page

**Priority**: MUST
**Given** a user navigates to `/boards/:id` and the board loads successfully (state: `success`)
**When** the page renders
**Then** an activity feed panel is visible in the board view layout alongside or adjacent to the kanban columns, clearly labeled (e.g. "Activity")

#### AC-LOAD-1: Feed shows persisted history on initial page load

**Priority**: MUST
**Given** a user opens a board that has had card moves recorded in previous sessions
**When** the board view page finishes loading (`GET /api/v1/boards/:boardId/activity` response received)
**Then** the activity feed panel displays the historical move entries ordered newest-first, each showing card title, from-column, to-column, and timestamp; the entries match what `GET /api/v1/boards/:boardId/activity` returns

#### AC-EMPTY-1: Feed shows an empty state when no moves have occurred

**Priority**: MUST
**Given** a user opens a board that has no recorded card movement activity
**When** the feed data finishes loading
**Then** the feed panel shows a non-blank empty state (e.g. "No activity yet") rather than a blank area or loading indicator

#### AC-LOADING-1: Feed shows a loading state while data is being fetched

**Priority**: MUST
**Given** a user navigates to a board view page
**When** the activity feed data fetch is in flight
**Then** the feed panel shows a loading indicator (consistent with the existing `Spinner` component at `client/src/components/Spinner/Spinner.tsx`) rather than a blank area or stale data

#### AC-HAPPY-1: A card move records a new activity event in the database

**Priority**: MUST
**Given** a user drags a card from "To Do" to "In Progress" (or uses the MoveCardDialog keyboard path) via the existing `PATCH /api/v1/boards/:boardId/cards/:id` handler in `src/routes/cards.ts`
**When** the PATCH succeeds (200 response)
**Then**

1. A new row is inserted into the `activity_events` table with `board_id`, `card_id`, `card_title` (snapshot), `from_status = 'todo'`, `to_status = 'in_progress'`, `actor`, and `occurred_at` set to the server timestamp
2. The row is retrievable via `GET /api/v1/boards/:boardId/activity` in its correct position (newest first)

#### AC-HAPPY-2: A card move delivers a live activity event to all connected clients

**Priority**: MUST
**Given** two browser tabs have the same board view open (both connected to `GET /api/v1/boards/:boardId/events` via `useRealtimeBoard`)
**When** a user in Tab A moves a card between columns
**Then**

1. Tab B's activity feed panel receives a new activity entry at the top of the feed list within sub-second SSE latency (no page reload required)
2. Tab A's activity feed panel also receives the new entry (the originating tab's echo de-dup for the board-state `card:updated` event does NOT suppress the activity feed entry — activity events are independent of the card-state echo de-dup)

#### AC-HAPPY-3: The activity REST endpoint returns the board's event history

**Priority**: MUST
**Given** a board has at least three recorded card moves
**When** a client calls `GET /api/v1/boards/:boardId/activity`
**Then**

1. Response is `200` with `Content-Type: application/json`
2. Body is a JSON array of activity event objects, ordered by `occurred_at DESC` (newest first)
3. Each object has: `id`, `board_id`, `card_id`, `card_title`, `from_status`, `to_status`, `actor`, `occurred_at` (ISO-8601 string)
4. The count and ordering match what was inserted by the preceding card moves

#### AC-ACTIVITY-ONLY-MOVES-1: Only status-change moves produce activity events

**Priority**: MUST
**Given** a user performs a card edit that changes only the title or description (no status change), via `PATCH /api/v1/boards/:boardId/cards/:id`
**When** the PATCH succeeds
**Then** no new row is inserted into `activity_events` (activity is scoped to column-move events only — v1 scope boundary)

#### AC-PERSIST-CARD-DELETE-1: Activity history survives card deletion

**Priority**: MUST
**Given** a card has been moved (activity event recorded) and subsequently deleted
**When** a client calls `GET /api/v1/boards/:boardId/activity`
**Then** the activity event for the move is still present in the response, with the `card_title` snapshot intact (the snapshot field preserves readability after the card row is removed)

#### AC-SCOPED-1: Activity feed is board-scoped — events from other boards do not appear

**Priority**: MUST
**Given** two boards exist with card move activity on each
**When** a client calls `GET /api/v1/boards/1/activity`
**Then** only events with `board_id = 1` are returned; events from board 2 are absent

#### AC-ERROR-1: Board not found returns 404

**Priority**: MUST
**Given** a client calls `GET /api/v1/boards/99999/activity` for a non-existent board
**When** the request is processed
**Then** response is `404 {error: 'Not Found', path, traceId}` (matching the standard error shape from `src/middleware/errorHandler.ts`)

#### AC-ERROR-2: Invalid boardId returns 400

**Priority**: MUST
**Given** a client calls `GET /api/v1/boards/abc/activity`
**When** the request is processed
**Then** response is `400` with a JSON error body (same validation pattern as `validateId` in `src/validation/card.ts`)

#### AC-OBS-1: Card move emits a structured log line with activity event details

**Priority**: MUST
**Given** a card is moved between columns
**When** the activity event is recorded
**Then** `req.log` (pino child from `requestLogger`) emits a JSON log line with `cardId`, `boardId`, `fromStatus`, `toStatus` — no `console.*` usage (Guiding Principle 3)

### Scope Boundaries

- **In scope**:
  - Recording an activity event when a card's `status` field changes (detected in the existing `PATCH /api/v1/boards/:boardId/cards/:id` handler at `src/routes/cards.ts:116-136`, where `input.status` is truthy and differs from the pre-update card status)
  - Persisting activity events in a new `activity_events` table (migration file under `migrations/`)
  - A new REST endpoint `GET /api/v1/boards/:boardId/activity` returning board-scoped event history ordered newest-first
  - Delivering new activity events live to connected clients via the existing SSE broadcaster (`src/realtime/broadcaster.ts`, `src/realtime/notify.ts`) — a new event type (e.g. `activity:card_moved`) on the existing `GET /api/v1/boards/:boardId/events` channel
  - A new `ActivityFeed` React component rendered in `BoardViewPage.tsx` that: fetches history on mount, receives live events via `useRealtimeBoard` (extended to handle the new event type), shows empty state, loading state, and an ordered list of move entries
  - Snapshotting `card_title` at the time of the move (so the feed remains readable after card deletion or rename)
  - Card-move events only (v1 scope; not card creation, deletion, board rename, etc.)

- **Out of scope**:
  - Auth-based actor identity — actor field resolution strategy is a creative decision (see Actor section); implementation follows the creative outcome
  - Activity events for non-move mutations: card create, card delete, card title/description edit, board rename
  - Pagination of the activity feed (v1: return all events up to a retention limit decided in creative)
  - Activity feed on the board list page (`BoardListPage`)
  - Push notifications outside the browser (email, mobile)
  - Per-user filtering of the feed
  - Activity across boards (cross-board feed)

- **Dependencies**:
  - FEAT-007 (TASK-007): SSE transport (`src/realtime/broadcaster.ts`, `src/realtime/eventsRouter.ts`, `src/realtime/notify.ts`, `useRealtimeBoard.ts`) — must reuse, not re-implement
  - FEAT-006 (TASK-006): React frontend (`BoardViewPage.tsx`, CSS Modules design tokens in `client/src/styles/tokens.css`, `Spinner`, `ErrorMessage` components) — must follow established patterns
  - FEAT-004 (TASK-005): Card model (`src/db/cards.ts`, migration pattern in `migrations/`) — `PATCH` handler is the injection point for activity recording

- **NFR implications**:
  - Performance: `GET /api/v1/boards/:boardId/activity` must meet the p95 < 150 ms read target (productBrief NFR). A basic index on `activity_events(board_id, occurred_at DESC)` is expected.
  - Scalability: Activity event table will grow unbounded without retention limits — a retention strategy (e.g., keep last N events per board, or keep events for last 30 days) must be decided in creative; v1 may defer automatic pruning.
  - Accessibility: The feed panel must meet WCAG 2.1 AA (color contrast, keyboard reachability, focus indicators) consistent with productBrief requirements.
  - Security: No internal detail (stack, SQL) leaked to client responses; errors follow the `errorHandler` pattern (Guiding Principle 5).
  - Observability: All new backend code uses `req.log` (pino), never `console.*` (Guiding Principle 3).

### Creative Exploration Needed

**Yes** — the following specific questions need design decisions before implementation planning:

1. **Feed UI location and layout**: Three viable options need evaluation against the existing `BoardViewPage` layout (currently `max-width: 1280px`, kanban fills full width). Options: (a) right sidebar panel alongside kanban columns, requiring a two-column layout change; (b) collapsible drawer/panel below the kanban; (c) always-visible strip below the kanban. This is a UI/UX creative decision requiring a layout mock/spec.

2. **Actor identity strategy for v1**: No auth exists. Three options identified (anonymous stub / user-supplied display name stored in localStorage / omit actor entirely). Creative must decide which to implement and, if a display name is chosen, what the UX for capturing it looks like.

3. **Activity event delivery via SSE**: Two options for how the existing SSE channel is extended: (a) add a new `activity:card_moved` event type to the existing `RealtimeEventType` union in `src/realtime/events.ts` and `client/src/api/types.ts`, broadcasting it alongside the existing `card:updated` event on the same `GET /api/v1/boards/:boardId/events` channel; (b) a separate SSE endpoint for activity only. Option (a) is strongly preferred (reuses all existing transport infrastructure — broadcaster, eventsRouter, useRealtimeBoard, Vite proxy) but the architecture creative must confirm.

4. **Activity event retention strategy**: Without pruning, `activity_events` grows unbounded. Creative must decide: (a) no pruning in v1 (simplest, acceptable for small teams per productBrief scalability NFR); (b) keep last N events per board (e.g., 100); (c) time-based retention (e.g., 30 days). The decision affects the migration schema and query design.

5. **Pre-update card status capture for `from_status`**: The current `PATCH` handler in `src/routes/cards.ts:116-136` does not read the card before updating — it calls `update(id, input)` and uses the returned updated row. To capture `from_status`, the handler needs a `findById(id)` pre-flight read (adding one DB round-trip). Architecture creative must confirm this approach vs. a DB-level trigger vs. returning both old and new in the UPDATE (using `RETURNING` on a CTE).

## Implementation Plan

### Overview

Add a board-scoped, realtime activity feed for card-move events. The work spans a new persistence
layer (`activity_events` table + DAL), a recording hook inside the existing card `PATCH` handler, a
new read endpoint, a new SSE event type on the **existing** board channel, and a new `ActivityFeed`
React component wired into `BoardViewPage`. All new transport rides the FEAT-007 infrastructure
(broadcaster, eventsRouter, `useRealtimeBoard`) — nothing new is stood up. Actor is the fixed
`"anonymous"` stub for v1 (column shipped, defaulted).

### Requirements

**Functional:**

- Record an `activity_events` row when a card's `status` changes via `PATCH /api/v1/boards/:boardId/cards/:id` (and ONLY on status change — title/description-only edits record nothing).
- Snapshot `card_title` at move time so the feed survives card rename/deletion.
- Expose `GET /api/v1/boards/:boardId/activity` → JSON array ordered `occurred_at DESC`.
- Broadcast a new `activity:card_moved` event on the existing `GET /api/v1/boards/:boardId/events` SSE channel; deliver to ALL connected tabs (including the originating tab — activity entries are NOT subject to card-state echo de-dup).
- Render an always-visible `ActivityFeed` panel on the board view with loading / empty / list states; prepend live entries.

**Non-Functional:**

- `GET .../activity` p95 < 150 ms — backed by an index on `activity_events(board_id, occurred_at DESC)`.
- All new backend code logs via `req.log` (pino), zero `console.*` (GP3); errors via centralized `errorHandler`, no internal detail leaked (GP5).
- Feed panel meets WCAG 2.1 AA (contrast, keyboard reachability, focus, list semantics).
- Retention strategy TBD in creative (v1 may defer pruning).

### Component Analysis

**New backend components:**

- `migrations/<ts>_create-activity-events-table.js` — table + index (follows `node-pg-migrate` JS pattern, mirrors `1781985941842_add-status-to-cards.js`).
- `src/db/activity.ts` — DAL: `ActivityEvent` interface, `insert(params)`, `listByBoard(boardId)` (mirrors `src/db/cards.ts` structure; parameterized queries only).
- `src/routes/activity.ts` — `Router({ mergeParams: true })`, `GET /` handler (mirrors the read handlers in `src/routes/cards.ts`; reuses `validateId`, `findBoardById` pre-flight for 404, `notFoundError`).

**Affected backend components:**

- `src/routes/cards.ts` PATCH handler (`cards.ts:117-136`) — add a `findById(id)` pre-flight read to capture `from_status` BEFORE `update()` (mechanism to be confirmed in Architecture creative Q5: pre-flight read vs. CTE `RETURNING`); after a successful status-changing update, insert the activity row and call the new notify helper. **Must not** alter existing card-update behavior, response, or the existing `card:updated` broadcast.
- `src/realtime/events.ts` — add `'activity:card_moved'` to `RealtimeEventType` and an `ActivityEvent` interface (carries the activity row; **no `originId`** so the originating tab does not drop it — AC-HAPPY-2.2).
- `src/realtime/notify.ts` — add `notifyCardMoved(boardId, activityRow, req)` (fire-and-forget, gated by `config.realtimeEnabled`, same defensive pattern as `notifyCardChange`).
- `src/routes/index.ts` — mount `apiRouter.use('/boards/:boardId/activity', activityRouter)`.

**New frontend components:**

- `client/src/components/ActivityFeed/ActivityFeed.tsx` (+ `.module.css`) — props: entries, load state; renders `Spinner` (loading), `EmptyState` (no activity), or an ordered `<ul>`/list of move entries. Reuses design tokens (`client/src/styles/tokens.css`).
- Entry sub-render: card title, from-column → to-column (human labels), timestamp.

**Affected frontend components:**

- `client/src/api/types.ts` — `ActivityEvent` interface; add `'activity:card_moved'` to `RealtimeEventType`; `ActivityRealtimeEvent` variant.
- `client/src/api/apiClient.ts` — `getActivity(boardId, signal)`.
- `client/src/realtime/useRealtimeBoard.ts` — listen for `activity:card_moved`; add `onActivityEvent` to `RealtimeHandlers`. Activity events have no `originId`, so the existing echo-drop never suppresses them (originator sees its own entry).
- `client/src/pages/BoardViewPage.tsx` (+ `.module.css`) — fetch activity history alongside board/cards, hold feed state, render `ActivityFeed` in the layout (layout = UI/UX creative decision), prepend live entries via `onActivityEvent`.

### Implementation Strategy (phase order)

Backend-first so the frontend integrates against a real contract. Each phase is independently
testable and committed.

### Observability Requirements

- **Applies**: Yes (new HTTP read handler + activity-recording on an existing handler).
- **Logging**: The card-move recording path emits a structured `req.log.info({ cardId, boardId, fromStatus, toStatus }, 'card moved')` line (AC-OBS-1). The activity read endpoint inherits the standard `requestLogger` access line. Broadcast publish logged by existing `notify.ts` (`'realtime event published'`).
- **Tracing**: rides existing W3C trace context (`req.traceId`); the activity event carries `traceId` for correlation (logged only, never surfaced — GP5).
- **Metrics**: deferred (consistent with project — no metrics endpoint yet).
- **Configuration**: no new env vars (reuses `REALTIME_ENABLED` / `config.realtimeEnabled`).

### API Requirements

- **REST API**: Yes — new `GET /api/v1/boards/:boardId/activity`. Response: `200` JSON array; `404` board-not-found; `400` invalid id (standard error shapes). No OpenAPI spec in this project — document the endpoint in `techContext.md` / `systemPatterns.md` API Conventions during the Documentation build step.
- **SSE**: new `activity:card_moved` event on the existing `/events` channel (additive to the `RealtimeEventType` union, both backend and frontend).

### Dependencies & Risks

- **Risk**: `from_status` capture adds a DB round-trip to the hot card-PATCH path → Mitigation: confirm approach in Architecture creative (pre-flight `findById` vs. single-statement CTE with `RETURNING` old+new); the pre-flight read mirrors the existing DELETE handler pattern and is acceptable for the ≤20-user MVP.
- **Risk**: activity event accidentally suppressed in the originating tab by echo de-dup → Mitigation: activity events carry **no** `originId` (designed-in; covered by AC-HAPPY-2.2 test).
- **Risk**: unbounded table growth → Mitigation: index + retention decision in creative; v1 may defer pruning (documented).
- **Risk**: layout change to `BoardViewPage` (currently full-width kanban) could regress existing AC → Mitigation: UI/UX creative produces a layout spec; frontend phase preserves existing kanban behavior and tests.

### Creative Phases Required

- [x] **Architecture Design** (Opus) — confirm SSE delivery approach (new event type on existing channel — strongly preferred), `from_status` capture mechanism (Q5), activity-event envelope shape (no `originId`), and retention strategy.
- [x] **UI/UX Design** (Sonnet) — feed panel location/layout against the existing `max-width: 1280px` `BoardViewPage` (right sidebar vs. below-board panel vs. drawer), entry presentation, empty/loading states, accessibility, and a user-journey doc for UAT.

## Test Strategy

### Approach

- **Emphasis**: Integration-heavy on the backend (supertest against `createApp()` — the project's established pattern), component + hook tests on the frontend. Prioritize the AC-mapped behaviors over exhaustive unit coverage.
- **Target test count**: ~28-36 total (backend ~16-20, frontend ~12-16).

### File Organization

- **New test files**:
  - `src/db/activity.test.ts` — DAL (insert returns row, `listByBoard` ordering/scoping, survives card delete).
  - `src/routes/activity.test.ts` — `GET .../activity` (200 array + ordering + shape, 404, 400, board-scoping).
  - `client/src/components/ActivityFeed/ActivityFeed.test.tsx` — loading / empty / list / live-prepend.
- **Extend existing**:
  - `src/routes/cards.test.ts` — PATCH records an event on status change; records NOTHING on title/desc-only edit (AC-ACTIVITY-ONLY-MOVES-1); emits the obs log line (AC-OBS-1); broadcasts `activity:card_moved`.
  - `client/src/realtime/useRealtimeBoard.test.ts` — routes `activity:card_moved` to `onActivityEvent`; does NOT drop it for the originating `originId` (AC-HAPPY-2.2).
  - `client/src/pages/BoardViewPage.test.tsx` — feed renders alongside the board; history fetch wired; live entry prepends; loading/empty states.

### What NOT to Test

- The FEAT-007 broadcaster/eventsRouter internals (already covered by TASK-007 tests) — only test the new event type flows through.
- `node-pg-migrate` mechanics — migrations are exercised by the integration suite hitting a real/test DB, not unit-tested.
- Exact CSS layout pixels — layout correctness is a UAT/visual concern, not a unit assertion.
- The `anonymous` actor value beyond a single assertion that it is persisted (no branching logic to cover in v1).

### Per-Phase Test Guidance

- **Phase 1 (persistence)**: ~8-10 tests — `activity.test.ts` (DAL) + migration exercised by suite. Verify insert, `occurred_at DESC` ordering, board scoping, and that a row persists after its card is deleted (AC-PERSIST-CARD-DELETE-1, AC-SCOPED-1, AC-HAPPY-1 DB half).
- **Phase 2 (recording + endpoint + broadcast)**: ~8-10 tests — `activity.test.ts` (route: AC-HAPPY-3, AC-ERROR-1, AC-ERROR-2) + extend `cards.test.ts` (AC-HAPPY-1 end-to-end, AC-ACTIVITY-ONLY-MOVES-1, AC-OBS-1, broadcast emitted).
- **Phase 3 (frontend)**: ~12-16 tests — `ActivityFeed.test.tsx` (AC-ENTRY-1, AC-LOAD-1, AC-EMPTY-1, AC-LOADING-1) + `useRealtimeBoard.test.ts` (AC-HAPPY-2.2 routing/no-drop) + `BoardViewPage.test.tsx` (integration, live prepend).
- **Phase 4 (E2E, post-UAT)**: 1-2 E2E tests implementing the UAT-generated spec — start at `/boards/:id`, move a card, assert a new feed entry appears at the top showing title + from→to + timestamp (the concrete entry-to-success flow from the Specification).

## Implementation Roadmap

- [x] **Phase 1 — Activity persistence layer**: migration `create-activity-events-table.js` (columns per Specification §Data persisted; `actor varchar(255) NOT NULL DEFAULT 'anonymous'`; index on `(board_id, occurred_at DESC)`), `src/db/activity.ts` DAL (`ActivityEvent`, `insert`, `listByBoard`), `src/db/activity.test.ts`. ✅ COMPLETE (2026-06-30) — 9 DAL tests pass, full suite 159/159 green, tsc clean.
- [ ] **Phase 2 — Recording, REST endpoint & SSE broadcast**: capture `from_status` in the cards PATCH handler (mechanism per Architecture creative), insert activity row on status change, add `activity:card_moved` to `events.ts` + `notifyCardMoved` in `notify.ts`, new `src/routes/activity.ts` mounted in `routes/index.ts`, tests (`activity.test.ts` route + extend `cards.test.ts`).
- [ ] **Phase 3 — Frontend ActivityFeed & integration**: `ActivityEvent`/`activity:card_moved` in `client/src/api/types.ts`, `getActivity` in `apiClient.ts`, `onActivityEvent` in `useRealtimeBoard.ts`, new `ActivityFeed` component (loading/empty/list per UI/UX creative), wire into `BoardViewPage.tsx` layout, tests.
- [ ] **UAT** (`/banyan-uat`) — walk the user journey produced by the UI/UX creative; emit findings; on PASS generate the E2E spec.
- [ ] **Phase 4 — E2E implementation** (post-UAT): implement the generated E2E spec (entry-to-success: open board → move card → new feed entry appears at top with title + from→to + timestamp).

## Creative Phases

- [x] Architecture Design — SSE delivery confirmation, `from_status` capture (Q5), event envelope (no `originId`), retention strategy → `memory-bank/creative/TASK-008-activity-feed-architecture.md`
- [x] UI/UX Design — feed panel layout/location, entry presentation, empty/loading states, accessibility, user-journey doc for UAT → `memory-bank/creative/TASK-008-activity-feed-uiux.md`

---

## Execution State

## Build Execution State

**Build Status**: COMPLETE (Phase 1)
**Current Build**: Phase 1: Activity persistence layer (TASK-008) — COMPLETE
**Build Started**: 2026-06-30
**Phase Number**: 1 of 4 (3 build phases + E2E)
**Is Multi-Phase**: YES

### Current Build Step
**Step**: Step 11 - Phase Git Completion
**Status**: COMPLETE
**Completed**: 2026-06-30
**Output**: Phase 1 committed to feature/FEAT-008-realtime-activity-feed

### Completed Steps
- Step 0.5 Git Setup: COMPLETE (2026-06-30) - Branch feature/FEAT-008-realtime-activity-feed created (local-merge, no worktree per project pattern)
- Step 0.6 Phase Gate: COMPLETE (2026-06-30) - Roadmap populated, creative phases complete
- Step 1 Read Task Context: COMPLETE (2026-06-30) - Phase 1 (persistence) identified, Level 3
- Step 2 Load Context: COMPLETE (2026-06-30) - Architecture + UI/UX creative loaded
- Step 3 Test Writer: COMPLETE (2026-06-30) - src/db/activity.test.ts (9 tests)
- Step 4 Coding Agent: COMPLETE (2026-06-30) - migration + src/db/activity.ts DAL
- Step 6/7 Verification: COMPLETE (2026-06-30) - 9/9 DAL tests pass; full suite 159/159; tsc clean; migration node --check OK
- Step 10 Memory Bank: COMPLETE (2026-06-30) - roadmap Phase 1 checked, registry + progress updated

### Sub-Agents
- (Phase 1 executed in-orchestrator with TDD discipline — tightly-scoped persistence phase)

### Resumption Notes
**Can Resume**: NO (Phase 1 complete; awaiting human review)
**Resume From**: N/A
**Notes**: Next: /banyan-build TASK-008 for Phase 2 (recording + REST endpoint + SSE broadcast)

### Prior Planning/Creative (complete)
- Architecture Design: COMPLETE — memory-bank/creative/TASK-008-activity-feed-architecture.md
- UI/UX Design: COMPLETE — memory-bank/creative/TASK-008-activity-feed-uiux.md
- Spec + Plan + Test Strategy + Roadmap: COMPLETE (PLANNING_COMPLETE)
