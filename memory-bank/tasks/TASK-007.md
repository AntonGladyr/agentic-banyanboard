# TASK-007: Board interactivity and real-time collaboration

**Complexity**: Level 3 (manual override; auto-evaluated Level 4 — see FEAT-007 override reason)
**Status**: COMPLETE
**Reflection**: memory-bank/reflection/reflection-TASK-007.md
**Archived**: memory-bank/archive/archive-TASK-007.md
**Completed**: 2026-06-21
**Roadmap**: FEAT-007
**Branch**: feature/FEAT-007-board-interactivity-realtime-collab
**Worktree**: N/A

## Task Description

Extend the existing React frontend (FEAT-006, currently display-only) with full board interactivity:
- **Create/edit board UI** — create new boards and edit existing board details from the UI.
- **Create/edit card UI** — create new cards and edit existing cards from the UI.
- **Drag-and-drop** of cards between columns (To Do / In Progress / Done), persisting the new `status`.
- **Real-time collaboration** so multiple users see board/card updates live.

Builds on the Board and Card CRUD APIs (FEAT-004/005) and the React tier established in FEAT-006. The `cards.status` field added in TASK-006 (Phase 1) backs the drag-and-drop column mapping.

Requires architecture (real-time sync transport, optimistic updates, dev/prod parity, observability) and UI/UX (create/edit forms, drag-and-drop interaction model) creative phases.

**Depends on**: FEAT-006 (React frontend board UI — complete), FEAT-005 (Board model — complete), FEAT-004 (Card model — complete).

## Specification

**Feature Type**: End-User Feature
**Primary Persona**: Alex the Dev — software engineer on a 4-person team who wants to move cards across columns and create/edit tasks with zero context-switch overhead. Secondary: Jordan the PM (board hygiene, editing card details) and Sam the Maker (personal project boards, solo usage).
**Creative Exploration Needed**: Yes — two mandatory creative phases required before implementation. See § Creative Exploration Needed for the specific open questions. Architecture phase is the harder blocker (real-time transport, optimistic update strategy); UI/UX phase is needed for create/edit form design and drag-and-drop affordances.

### Invocation Method

#### Create Board
- **Location**: Board list page (`/`), rendered by `client/src/pages/BoardListPage.tsx`
- **Element**: A "New Board" or "Create Board" button/link in the page header area, near the `<h1>Boards</h1>` heading
- **Visibility**: Always visible on the board list page (no boards needed in advance)
- **Navigation**: User is already on `/` (the entry page); button is present on first load
- **Confidence**: MEDIUM — the board list page exists and is the logical entry point, but the exact placement of the "create" trigger (inline within the list vs. header-level action) is a UI/UX creative decision

#### Edit Board
- **Location**: Board view page (`/boards/:id`), rendered by `client/src/pages/BoardViewPage.tsx`
- **Element**: An edit affordance (icon button, inline "Edit" link, or menu) associated with the board name `<h1>` heading
- **Visibility**: Visible to all authenticated users on the board view (no auth gate in MVP — all users can edit all boards per productBrief)
- **Navigation**: User navigates from `/` → clicks board entry → arrives at `/boards/:id`
- **Confidence**: LOW — exact placement of the edit trigger relative to the board name heading is a UI/UX creative decision; could be inline next to `<h1>`, in a header action bar, or in a menu

#### Create Card
- **Location**: Board view page (`/boards/:id`), within a specific column section rendered by `client/src/components/Column/Column.tsx`
- **Element**: An "Add Card" or "+ Card" button at the bottom of each `Column` component (inline within the column, below any existing cards)
- **Visibility**: Always visible at the bottom of each column (regardless of how many cards exist)
- **Navigation**: User is on `/boards/:id`, viewing the kanban board
- **Confidence**: MEDIUM — per-column "add card" is the canonical kanban pattern (Trello, Linear, GitHub Projects all use it); exact visual treatment (inline text input vs modal) is a UI/UX creative decision

#### Edit Card
- **Location**: Board view page (`/boards/:id`), triggered from a specific `CardItem` component (`client/src/components/CardItem/CardItem.tsx`)
- **Element**: Click on the card title/body (open an edit form), or an explicit edit icon/button on card hover
- **Visibility**: Accessible on hover/focus for any card
- **Navigation**: User is on `/boards/:id`, hovering or focusing a `CardItem`
- **Confidence**: LOW — there are two valid patterns (inline edit vs modal/drawer); this is a UI/UX creative decision with different accessibility implications

#### Drag-and-Drop Card
- **Location**: Board view page (`/boards/:id`), on `CardItem` components within `Column` components
- **Element**: The card itself (`<article>` in `CardItem`) becomes a drag source; each `Column` (rendered as `<section>`) becomes a drop target
- **Visibility**: Always active on the board view (drag handle affordance or full-card drag — UI/UX creative decision)
- **Navigation**: User is on `/boards/:id`; they drag a card from one column to another column
- **Confidence**: MEDIUM for the functional requirement; LOW for the specific drag library and interaction model (pointer events, keyboard DnD, ghost card style, optimistic vs server-confirmed — all creative decisions)

#### Real-Time Collaboration
- **Location**: Board view page (`/boards/:id`); live updates appear within the three-column `KanbanBoard` component
- **Element**: No explicit user invocation — updates appear automatically when another user changes a board or card
- **Visibility**: Always active when a user has a board view open
- **Navigation**: N/A — happens passively while user is on `/boards/:id`
- **Confidence**: LOW — the transport mechanism (WebSocket, SSE, polling), how it integrates with the Express server (`src/app.ts`), dev/prod parity (how WebSocket/SSE behaves behind the Vite dev proxy at `:5173` vs the Express prod server at `:3000`), and the event schema are all open architecture questions

### Success Criteria

#### Create/Edit Board
- **User sees**: A form (inline or modal — UI/UX creative decision) with fields for board `name` (required) and `description` (optional). On submit: the board list or board heading updates immediately to reflect the new/updated name.
- **Verifiable at**: `GET /api/v1/boards` returns the new board; `GET /api/v1/boards/:id` returns the updated name/description. Board list page at `/` shows the new board entry. Board view heading at `/boards/:id` shows the updated name.
- **Data persisted**: `boards` table (`id`, `name`, `description`, `updated_at`) via `POST /api/v1/boards` (create: 201) or `PATCH /api/v1/boards/:id` (edit: 200). Backend endpoints already exist in `src/routes/boards.ts`.
- **Observable within**: Immediate (optimistic or server-confirmed — creative decision); within the p95 < 300 ms write budget from productBrief NFRs.

#### Create/Edit Card
- **User sees**: A form with fields for card `title` (required), `description` (optional), and `status` (optional, defaults to column's status). On submit: the card appears in the appropriate column immediately.
- **Verifiable at**: `GET /api/v1/boards/:boardId/cards` returns the new/updated card with correct fields. The board view page shows the card in the correct column matching its `status` field.
- **Data persisted**: `cards` table (`id`, `board_id`, `title`, `description`, `status`, `position`, `updated_at`) via `POST /api/v1/boards/:boardId/cards` (create: 201) or `PATCH /api/v1/boards/:boardId/cards/:id` (edit: 200). Both endpoints exist in `src/routes/cards.ts` with full validation in `src/validation/card.ts`.
- **Observable within**: Immediate; within p95 < 300 ms write budget.

#### Drag-and-Drop
- **User sees**: A card dragged from column A and dropped into column B. The card moves to column B in the UI. The column B's card list gains the card; column A loses it. The card's `status` field is persisted via `PATCH /api/v1/boards/:boardId/cards/:id` with `{ status: <target-column-status> }`.
- **Verifiable at**: After drop, `GET /api/v1/boards/:boardId/cards` returns the card with the updated `status`. The board view immediately shows the card in the new column (no page refresh required).
- **Data persisted**: `cards` table `status` column via `PATCH /api/v1/boards/:boardId/cards/:id` — the endpoint accepts `{ status: 'todo' | 'in_progress' | 'done' }` per the existing `validateUpdate` in `src/validation/card.ts`.
- **Observable within**: Immediate (optimistic move) or near-immediate (server-confirmed); API response within p95 < 300 ms.

#### Real-Time Collaboration
- **User sees**: While viewing `/boards/:id`, a second user's changes to that board (new card, card moved, board renamed) appear in the first user's browser without a manual refresh.
- **Verifiable at**: Two browser tabs open to the same `/boards/:id` — a mutation in one tab is visible in the other within a reasonable latency window (< 2 seconds for localhost).
- **Data persisted**: N/A — this is a delivery concern, not new persistence. The underlying data is already persisted by the CRUD endpoints; real-time just notifies subscribers.
- **Observable within**: < 2 seconds on localhost (LAN, single host, < 20 users — productBrief NFR).

### Acceptance Criteria

#### AC-ENTRY-1: User can find the "create board" affordance
**Priority**: MUST
**Given** a user on the board list page at `/` (with zero or more boards present)
**When** they look for a way to create a new board
**Then**
- A clearly labeled create action (e.g., "New Board" button) is visible on the page
- The action is keyboard-reachable via Tab order
- Clicking/activating it opens the board creation UI (form, dialog, or inline input — UI/UX creative decision)

**Verification**:
- [ ] E2E: navigate to `/`, assert create-board trigger element is present and focusable
- [ ] Unit: BoardListPage renders a create action element

#### AC-ENTRY-2: User can find the "create card" affordance in each column
**Priority**: MUST
**Given** a user on a board view page at `/boards/:id` (with zero or more cards in a column)
**When** they look at any of the three columns (To Do / In Progress / Done)
**Then**
- An "Add Card" affordance is visible within that column (at the bottom of the card list or as a column footer)
- The affordance is keyboard-reachable within the column's tab sequence
- Activating it opens the card creation UI pre-scoped to that column's status

**Verification**:
- [ ] E2E: navigate to `/boards/:id`, assert each of the three columns has an add-card affordance
- [ ] Unit: Column component renders an add-card affordance

#### AC-HAPPY-1: User creates a new board end-to-end
**Priority**: MUST
**Given** a user on the board list page at `/`
**When** they:
  1. Activate the "New Board" create action
  2. Enter a board name (e.g., "Sprint 42") into the name field
  3. Optionally enter a description
  4. Submit the form (click "Create" button or press Enter)
**Then**
- The new board "Sprint 42" appears in the board list at `/`
- `GET /api/v1/boards` returns a board with `name: "Sprint 42"` (not placeholder data — stub-detection)
- The board has a unique `id` assigned by the server
- The user can navigate to `/boards/<new-id>` and see the empty board with three columns

**Verification**:
- [ ] E2E: perform full create-board journey, assert board appears in list with correct name
- [ ] E2E: assert new board's entry links to a valid `/boards/:id` URL
- [ ] Integration: `POST /api/v1/boards` with `{ name: "Sprint 42" }` → 201, response body contains `id`, `name: "Sprint 42"`

#### AC-HAPPY-2: User edits an existing board's details
**Priority**: MUST
**Given** a user on the board view page at `/boards/:id` for an existing board named "Alpha Project"
**When** they:
  1. Activate the edit affordance (e.g., edit icon next to the board name `<h1>`)
  2. Change the name to "Alpha Project v2"
  3. Submit the change
**Then**
- The board name heading on the page updates to "Alpha Project v2" without a full page reload
- `GET /api/v1/boards/:id` returns `name: "Alpha Project v2"` (not the old name — stub-detection)
- The browser tab title updates accordingly (e.g., "BanyanBoard — Alpha Project v2")
- Navigating back to `/` shows the updated board name in the list

**Verification**:
- [ ] E2E: perform full edit-board journey, assert heading updated on page and on board list
- [ ] Integration: `PATCH /api/v1/boards/:id` with `{ name: "Alpha Project v2" }` → 200, response `name: "Alpha Project v2"`

#### AC-HAPPY-3: User creates a new card in a specific column
**Priority**: MUST
**Given** a user on the board view page at `/boards/:id`, looking at the "In Progress" column
**When** they:
  1. Activate the "Add Card" affordance in the "In Progress" column
  2. Enter a card title (e.g., "Implement websocket handler")
  3. Optionally enter a description
  4. Submit the form
**Then**
- The new card "Implement websocket handler" appears in the "In Progress" column (NOT in To Do or Done)
- `GET /api/v1/boards/:boardId/cards` returns a card with `title: "Implement websocket handler"` and `status: "in_progress"`
- The card has a unique `id` assigned by the server; no placeholder values (stub-detection)
- The column's card count increments

**Verification**:
- [ ] E2E: create card via In Progress column affordance, assert card appears in In Progress only
- [ ] E2E: assert card NOT in To Do or Done columns
- [ ] Integration: `POST /api/v1/boards/:boardId/cards` with `{ title: "...", status: "in_progress" }` → 201, response carries `status: "in_progress"`

#### AC-HAPPY-4: User edits an existing card's title and description
**Priority**: MUST
**Given** a user on the board view page at `/boards/:id` with an existing card "Fix login bug" in the To Do column
**When** they:
  1. Activate the edit affordance on the "Fix login bug" card
  2. Change the title to "Fix login redirect bug"
  3. Add a description: "POST /login should redirect to dashboard after success"
  4. Submit the change
**Then**
- The card now shows "Fix login redirect bug" as its title in the To Do column
- The description text is visible on the card (or in the edit view on re-open)
- `GET /api/v1/boards/:boardId/cards` returns the card with `title: "Fix login redirect bug"` and the updated description (not the old title — stub-detection)
- The card remains in the To Do column (status unchanged)

**Verification**:
- [ ] E2E: edit card title and description, assert updated title visible in column
- [ ] Integration: `PATCH /api/v1/boards/:boardId/cards/:id` with `{ title: "...", description: "..." }` → 200, response reflects updates

#### AC-HAPPY-5: User drags a card to a different column
**Priority**: MUST
**Given** a user on the board view page at `/boards/:id` with a card "Fix login bug" in the "To Do" column
**When** they drag "Fix login bug" from the "To Do" column and drop it into the "In Progress" column
**Then**
- The card "Fix login bug" disappears from the "To Do" column
- The card "Fix login bug" appears in the "In Progress" column
- `GET /api/v1/boards/:boardId/cards` returns "Fix login bug" with `status: "in_progress"` (not `"todo"` — stub-detection: status MUST have changed on the server)
- The change is reflected WITHOUT a page refresh

**Verification**:
- [ ] E2E: drag card from To Do to In Progress using pointer events, assert column membership changed
- [ ] E2E: reload the board view page and assert card is still in In Progress (server persisted)
- [ ] Integration: `PATCH /api/v1/boards/:boardId/cards/:id` with `{ status: "in_progress" }` → 200, response `status: "in_progress"`

#### AC-REALTIME-1: Second user sees card drag update without refreshing
**Priority**: MUST
**Given** two browser tabs (Tab A and Tab B) both open to the same `/boards/:id`
**When** user in Tab A drags a card from "To Do" to "In Progress"
**Then**
- Within 2 seconds, Tab B's board view shows the card in "In Progress" (NOT in "To Do")
- Tab B did NOT require a manual page refresh to receive the update
- The update in Tab B is specific to the actual card moved (not a full board reset — stub-detection: only the moved card's column changes, other cards are unaffected)

**Verification**:
- [ ] E2E (two-tab): open two tabs to same board, perform drag in tab 1, assert tab 2 updates within 2s
- [ ] Confidence note: this AC requires the architecture creative phase to define the transport — it is verifiable once transport is chosen but CANNOT be spec'd more precisely until then

#### AC-REALTIME-2: Second user sees new card created by first user
**Priority**: MUST
**Given** two browser tabs (Tab A and Tab B) both open to the same `/boards/:id`
**When** user in Tab A creates a new card "New feature: dark mode" in the "To Do" column
**Then**
- Within 2 seconds, Tab B's "To Do" column shows "New feature: dark mode" without a manual refresh
- The card in Tab B has the correct title (not a placeholder — stub-detection)

**Verification**:
- [ ] E2E (two-tab): create card in tab 1, assert new card appears in tab 2 within 2s

#### AC-ERROR-1: User sees validation error when creating a board with no name
**Priority**: MUST
**Given** a user in the create board form
**When** they submit the form with an empty or blank name field
**Then**
- The form does NOT submit a request to `POST /api/v1/boards`
- A validation error message is shown inline (e.g., "Board name is required")
- The user can correct the name and resubmit
- No partial/corrupted board is created

**Verification**:
- [ ] Unit: create-board form component renders validation error when name is empty on submit
- [ ] E2E: attempt to submit empty name, assert no navigation and error message visible

#### AC-ERROR-2: User sees validation error when creating a card with no title
**Priority**: MUST
**Given** a user in the create card form (in any column)
**When** they submit the form with an empty or blank title field
**Then**
- The form does NOT submit a request to `POST /api/v1/boards/:boardId/cards`
- A validation error message is shown inline (e.g., "Card title is required")
- The user can correct the title and resubmit

**Verification**:
- [ ] Unit: create-card form component renders validation error when title is empty on submit
- [ ] E2E: attempt to submit card with no title, assert error message and no card added to column

#### AC-ERROR-3: User sees error when a write operation fails on the server
**Priority**: MUST
**Given** a user creating a card (or editing a board/card) when the API returns a 500 or network error
**When** the `POST` or `PATCH` request fails
**Then**
- A user-readable error message is shown (keyed on `ApiError.category` — `network` or `server`, following the existing `errorCopy.ts` pattern)
- No internal error detail or HTTP status code is visible to the user (Guiding Principle 5)
- The user's form input is preserved so they can retry without re-entering data
- The UI does NOT leave the board in a permanently broken state

**Verification**:
- [ ] Unit: form component renders error state when API call rejects with `ApiError`
- [ ] E2E: intercept the POST/PATCH to return 500, assert user-facing error message visible and form input preserved

#### AC-ERROR-4: Drag-and-drop failure does not leave card in wrong column
**Priority**: MUST
**Given** a user who dragged a card from To Do to In Progress, and the `PATCH` status update call fails (network error or 500)
**When** the API request to persist the status change fails
**Then**
- The card reverts to its original column (To Do) in the UI
- A user-readable error message is shown indicating the move failed
- `GET /api/v1/boards/:boardId/cards` returns the card still with `status: "todo"` (server was not modified — stub-detection)
- The board view remains functional (user can attempt the drag again)

**Confidence note**: This is the rollback-on-failure behavior for optimistic drag-and-drop updates. Whether the UI uses optimistic-update-with-rollback or server-confirmed-then-update is an Architecture creative decision — this AC defines the OBSERVABLE behavior, not the implementation strategy.

**Verification**:
- [ ] E2E: intercept the PATCH to return 500 during a drag, assert card reverts to original column
- [ ] Integration: confirm PATCH failure leaves card status unchanged in DB

#### AC-LOADING-1: User sees loading/pending state during writes
**Priority**: SHOULD
**Given** a user who has submitted a create or edit form, or dropped a card into a new column
**When** the write API call is in flight
**Then**
- The submit button is disabled or shows a loading indicator so duplicate submissions are prevented
- The dragged card shows a pending/muted state during the PATCH if using server-confirmed (not optimistic) drag

**Verification**:
- [ ] Unit: form component disables submit button while request is pending
- [ ] E2E: slow-network simulation shows pending state (submit button disabled or card muted)

#### AC-NAV-1: User can cancel a create/edit form without submitting
**Priority**: MUST
**Given** a user who has opened a create board, create card, or edit card form
**When** they activate a "Cancel" button or press Escape
**Then**
- The form closes without making any API call
- The board view or board list is restored to the state before the form was opened
- No partial data is written

**Verification**:
- [ ] Unit: form component calls no API and closes on cancel/Escape
- [ ] E2E: open create-card form, press Escape, assert card count unchanged and no API call made

### Scope Boundaries

**In scope**:
- Create a new board from the board list page (`POST /api/v1/boards` — endpoint already exists)
- Edit an existing board's name and description from the board view page (`PATCH /api/v1/boards/:id` — endpoint already exists)
- Create a new card from within a column on the board view page (`POST /api/v1/boards/:boardId/cards` — endpoint already exists)
- Edit an existing card's title and description from the board view page (`PATCH /api/v1/boards/:boardId/cards/:id` — endpoint already exists)
- Drag-and-drop a card between columns, persisting the `status` change via `PATCH /api/v1/boards/:boardId/cards/:id` with `{ status: <new-status> }` — the endpoint and status validation already exist; the `status` field was added in TASK-006 Phase 1 (`src/validation/card.ts`, `src/db/cards.ts`)
- Real-time push of board/card mutations (create, update, delete, status change) to all users currently viewing the same board
- New API client methods in `client/src/api/apiClient.ts` for the write operations (POST/PATCH for boards and cards, DELETE if delete is added)
- Backend real-time transport endpoint (WebSocket upgrade handler, SSE endpoint, or polling endpoint — architecture creative decision) added to `src/app.ts` or a new module
- Frontend real-time subscription hook/context consuming the transport
- Error states and rollback for drag-and-drop failures
- Cancel affordance on all create/edit forms

**Out of scope**:
- Delete board from the UI (no delete board button in this feature — future enhancement)
- Delete card from the UI (no delete card button in this feature — future enhancement)
- Card reordering within the same column via drag-and-drop (status-change DnD only; intra-column position reordering is a future enhancement)
- Card labels — no `labels` field on the card model (deferred since TASK-006; still out of scope)
- Authentication or per-user authorization (all users share all boards; productBrief MVP constraint)
- Due dates on cards (not in the current Card model)
- Column creation or customization from the UI (three fixed columns: To Do / In Progress / Done)
- Mobile-first design (tablet-usable; mobile-first explicitly out of scope per productBrief)
- Pagination on the board view (hundreds of cards per board is target; no pagination for MVP)
- Filter or search functionality
- Dockerfile / multi-stage build changes (Compose stays postgres-only; Express + Vite on host for dev; following TASK-006 Q1f decision)
- OpenAPI spec (carried deferred item from FEAT-004/005; still deferred)

**Dependencies**:
- FEAT-006 complete — React SPA (`client/`), `apiClient.ts`, `types.ts`, `errorCopy.ts`, all component and page structure, CSS Modules + design tokens, Vitest + Playwright setup. All of these are the foundation this feature extends.
- FEAT-005/004 complete — Board and Card CRUD APIs (`src/routes/boards.ts`, `src/routes/cards.ts`, `src/validation/`, `src/db/`). All write endpoints needed for create/edit/DnD already exist and are tested.
- Architecture creative phase — MUST complete before backend implementation (real-time transport decision, optimistic update strategy, DnD library selection)
- UI/UX creative phase — MUST complete before frontend implementation (create/edit form design, DnD affordance visual treatment, modal vs inline vs drawer pattern decision)

**NFR implications** (from productBrief.md):
- **Performance**: Write p95 < 300 ms (productBrief NFR); board view must remain responsive during drag-and-drop; real-time latency < 2 s on localhost for < 20 concurrent users
- **Scalability**: 1–20 concurrent users on a single host — no need for horizontal scaling; a single in-process WebSocket/SSE handler or polling interval is sufficient
- **Accessibility**: WCAG 2.1 AA (reasonable effort) — drag-and-drop MUST have a keyboard-accessible alternative for moving cards between columns (WCAG 2.1 Success Criterion 2.1.1); create/edit forms must be keyboard-navigable with proper focus management; form errors must use `role="alert"` (consistent with the existing `ErrorMessage` pattern)
- **Security**: No auth gate in MVP; all users share access (productBrief). Forms must not expose internal error detail (Guiding Principle 5). PATCH/POST bodies go through the existing validate-before-DB layer on the backend.
- **Observability**: Backend write and real-time events logged via `req.log` (pino, structured JSON, traceId-correlated) — no `console.*` in backend code. Frontend errors via the existing `errorReporter.ts` pattern.
- **Dev/prod parity**: The real-time transport must work both in dev (Vite proxy at `:5173` forwarding to Express at `:3000`) AND in prod (Express serving `client/dist` at `:3000` with `SERVE_CLIENT=true`). This is the primary dev/prod parity concern for the architecture creative phase.

### Creative Exploration Needed

Yes — two mandatory creative phases are required. Both are blockers for implementation.

**Architecture Creative Phase (PRIMARY blocker — must complete first)**:

1. **Real-time transport mechanism (LOW confidence — critical blocker)**
   No real-time transport exists in the codebase today. `src/app.ts` uses the documented `createApp()` factory with a fixed composition order. The architecture phase must decide:
   - **Transport type**: WebSocket (ws library, upgrade handler on the existing HTTP server) vs Server-Sent Events (SSE, a simple Express route returning `text/event-stream`) vs long-polling (simple, no new protocol). For 1–20 users on localhost, all three are viable; the decision trades implementation complexity, dev/prod proxy behavior, and browser reconnection handling.
   - **Dev/prod parity with the transport**: In dev, Vite's `server.proxy` forwards HTTP requests (including SSE/polling); WebSocket upgrades require `server.proxy` to also configure `ws: true` proxy mode. This is a known Vite proxy wrinkle — the architecture must confirm it works for the chosen transport.
   - **Integration with `createApp()` and `src/index.ts`**: WebSocket requires attaching to the HTTP server (`httpServer.on('upgrade', ...)`), which is in `src/index.ts` (the process entry), not the Express factory. SSE/polling integrate more naturally as Express routes within `createApp()`. The chosen approach must not break the `createApp()` testability pattern (supertest-injectable factory — systemPatterns).
   - **Event schema**: What events are broadcast, to what scope (board-level room/channel), and with what payload (full entity vs delta). A lean option: broadcast the full updated entity (e.g., `{ type: 'card:updated', card: Card }`); the client replaces the card in its local state. A heavier option: full board snapshot on any change.
   - **New backend env vars**: e.g., `REALTIME_ENABLED` (opt-in for dev, on by default in prod) — must follow the `src/config/env.ts` fail-fast pattern.

2. **Optimistic updates vs. server-confirmed updates for drag-and-drop (LOW confidence)**
   When a user drops a card into a new column, there are two strategies:
   - **Optimistic**: Move the card in the UI immediately (before the PATCH response), rollback if the PATCH fails. Feels fastest but requires rollback logic.
   - **Server-confirmed**: Show a pending state while the PATCH is in flight, then update the UI on success/failure. Simpler but adds perceived latency.
   The architecture creative phase must decide the strategy and how it interacts with the real-time subscription (avoid double-applying the move if the current user's own PATCH triggers a real-time event back to them).

3. **Drag-and-drop library selection (MEDIUM confidence — confirm in architecture)**
   productBrief.md risks section explicitly recommends a "well-supported library (e.g., dnd-kit)" for DnD. `dnd-kit` is the current recommendation for React DnD (accessible by design, pointer + keyboard, no DOM manipulation). The architecture phase should confirm `@dnd-kit/core` + `@dnd-kit/sortable` as the drag-and-drop library (or provide justification for a different choice). This is an npm dependency addition to `client/package.json`.

4. **Observability for the real-time tier (MEDIUM confidence)**
   WebSocket/SSE connections are long-lived — the existing `requestLogger` (one JSON line per HTTP response) does not cover them naturally. The architecture phase must define: how connection lifetime, message sends, and errors are logged; how `traceId` is carried through a WebSocket message (if at all); whether connection counts are surfaced.

**UI/UX Creative Phase (SECONDARY blocker — must complete before frontend implementation)**:

5. **Create/edit form design: modal vs. inline vs. drawer (LOW confidence — critical for all forms)**
   Three patterns are common for create/edit in kanban tools:
   - **Modal/dialog**: A centered `<dialog>` or overlay with the form. Focuses the user on the single action. Requires focus trap and backdrop.
   - **Inline**: An inline text input replaces/expands within the column (Trello's "add card" pattern). Lower cognitive overhead for the create-card case; less obvious for edit board.
   - **Drawer/panel**: A side panel slides in with the full card detail form. Better for rich card editing (future labels/due dates); higher complexity.
   The UI/UX creative phase must decide per-surface (create board, edit board, create card, edit card) which pattern to use and design the form fields, validation error display, and cancel affordance.

6. **Drag-and-drop visual affordances (LOW confidence)**
   - Drag handle vs. full-card-draggable
   - Ghost card appearance during drag (translucent overlay, placeholder in source column, highlight on target column)
   - Drop zone indicator (column highlights when a card is dragged over it)
   - Hover state on cards to reveal edit affordance (edit icon appears on hover/focus — consistent with existing `--color-surface-hover` token)
   - Keyboard alternative for moving cards (e.g., a "Move to..." dropdown or keyboard shortcut — required for WCAG 2.1 SC 2.1.1)

7. **Real-time update visual feedback (LOW confidence)**
   When a remote update arrives (a card moved by another user):
   - Silent update (card just moves)
   - Brief highlight/flash on the updated card
   - Toast notification ("Jordan moved 'Fix login bug' to In Progress")
   The UI/UX phase must decide the notification pattern consistent with the existing design system (CSS custom property tokens from `client/src/styles/tokens.css`, CSS Modules pattern).

## User Journey Definition

See § Specification above — the Specification section is the authoritative user journey definition for TASK-007. This placeholder is superseded.

## Test Strategy

### Approach
- **Emphasis**: Balanced, frontend-weighted. The create/edit/drag work is **frontend-only consumption of existing, already-tested APIs** (Board/Card POST/PATCH/DELETE and the `status` PATCH are covered by TASK-004/005 — `src/routes/boards.ts`, `src/routes/cards.ts`, with `status` cases already in `src/routes/cards.test.ts:438-507`). So the bulk of new tests are **frontend component/unit** (Vitest + RTL) plus **E2E** (Playwright) for the entry-to-success journeys. The **only new backend tests** are for the real-time transport tier (Phase 5).
- **Target test count**: ~44–54 total across 6 phases (justified — a full interactivity tier across four create/edit surfaces + drag-and-drop + a brand-new real-time backend transport). Rough split: frontend write-API client ~6–8; board forms ~8–10; card forms ~8–10; drag-and-drop ~6–8; real-time (backend + frontend) ~8–12; E2E ~8–10.
- **Note**: the drag-and-drop library (lean: `@dnd-kit`), the real-time transport (WebSocket vs SSE vs polling), and the optimistic-vs-server-confirmed strategy are **Architecture creative decisions**; the form pattern (modal/inline/drawer) is a **UI/UX creative decision**. Per-phase test specifics below are confirmed/adjusted after those creative phases and before each phase's build.

### File Organization
- **Extend existing**:
  - `client/src/api/apiClient.ts` + its colocated test — add POST/PATCH write wrappers (`createBoard`, `updateBoard`, `createCard`, `updateCard`, `updateCardStatus`) and a body-sending `sendJson` helper alongside the existing GET-only `getJson`; mirror the existing safe-`ApiError` mapping (GP5 — never leak server body/stack). Add validation-failure (400 → mapped category) cases.
  - `client/src/pages/BoardListPage.tsx` test — assert the create-board entry point + create flow.
  - `client/src/pages/BoardViewPage.tsx` test — assert edit-board, create/edit-card, and drag entry points + the live update path.
  - `client/src/components/Column/*` and `client/src/components/CardItem/*` tests — add-card affordance, edit affordance, drag source/drop target wiring.
  - `client/e2e/board-journeys.spec.ts` (or a new sibling spec) — add interactive journeys to the existing Playwright suite (currently read-only / mocked via `page.route`).
- **New test files** (colocated, per the UI/UX creative layout): form components (e.g. `BoardForm.test.tsx`, `CardForm.test.tsx`), a shared form/dialog primitive test, the drag-and-drop wiring test, and the frontend real-time subscription hook test (e.g. `useRealtimeBoard.test.tsx`).
- **New test files** (backend, Phase 5 only): the real-time transport module test(s) — location/shape per the Architecture creative decision (e.g. `src/realtime/*.test.ts`): connection lifecycle, broadcast-on-mutation, board-scoped delivery, no internal-detail leak.

### What NOT to Test
- **Existing Board/Card CRUD endpoints** — POST/PATCH/DELETE for boards and cards (incl. the `status` PATCH) are already covered by the TASK-004/005 suites. This task adds NO re-tests of that behavior; the new backend tests are real-time-only.
- **Third-party library internals** — `@dnd-kit` drag mechanics, `react-router`, `fetch`, the chosen WS/SSE library, React rendering.
- **Exact visual styling, colors, animation, and copy** — verified by UAT/inspection, not brittle string assertions (consistent with the TASK-006 Test Strategy).
- **Vite / tsconfig / build config** — proven by the app building and running.
- **DnD pixel-level pointer simulation beyond column-membership outcome** — assert the observable result (card changed columns + `status` persisted), not intermediate drag coordinates.

### Per-Phase Test Guidance
- **Phase 1 (frontend write foundation)**: ~6–8 tests — `sendJson` maps success (JSON body returned) and each failure (network/`notFound`/`server`, and a 400 validation failure → safe category) with no server-detail leak (GP5); each write wrapper hits the correct method + path + body shape.
- **Phase 2 (create/edit board UI)**: ~8–10 tests — create-board form: required-name validation blocks submit (AC-ERROR-1), valid submit calls `createBoard` and surfaces the new board (AC-HAPPY-1), cancel/Escape closes with no API call (AC-NAV-1), submit disabled while pending (AC-LOADING-1), server-failure error state preserves input (AC-ERROR-3); edit-board form: updates heading (AC-HAPPY-2); BoardListPage renders the create entry point (AC-ENTRY-1).
- **Phase 3 (create/edit card UI)**: ~8–10 tests — Column renders an add-card affordance scoped to its status (AC-ENTRY-2); create-card: title-required validation (AC-ERROR-2), valid submit places card in the correct column (AC-HAPPY-3), cancel (AC-NAV-1), pending (AC-LOADING-1), server-failure (AC-ERROR-3); edit-card: title/description update in place (AC-HAPPY-4).
- **Phase 4 (drag-and-drop)**: ~6–8 tests — drop into a new column moves the card and calls `updateCardStatus` with the target status (AC-HAPPY-5); optimistic move + rollback to the original column on PATCH failure with an error message (AC-ERROR-4); keyboard alternative moves a card between columns (WCAG 2.1 SC 2.1.1); card remains after reload (status persisted — E2E confirms).
- **Phase 5 (real-time)**: ~8–12 tests — backend: a client subscribed to a board receives a broadcast when a card on that board is created/updated, is NOT notified of mutations on other boards (board-scoped), connection lifecycle logged via `req.log`/structured logger with no internal-detail leak; frontend: the subscription hook applies `card:created`/`card:updated`/`board:updated` events to local state, and de-duplicates the current user's own mutation echo (no double-apply).
- **Phase 6 (E2E)**: ~8–10 tests — full journeys against the real Express-served build: create board → appears in list; edit board → heading + list update; create card in a named column; edit card title/description; drag card across columns + reload persists; cancel a form (no write); **two-tab real-time** card move (AC-REALTIME-1) and card create (AC-REALTIME-2); a write-failure error path. Uses concrete AC values, not abstract assertions.

## Implementation Plan

### Overview

TASK-007 turns the read-only React SPA (FEAT-006) into a fully interactive board: create/edit boards and cards, drag cards between status columns, and see other users' changes live. The create/edit/drag work consumes Board/Card write endpoints that **already exist and are tested** (FEAT-004/005), so it is frontend-only. The **one new backend concern** is a real-time transport tier (none exists today), which is the highest-risk, lowest-confidence area and is sequenced late (Phase 5) — after there are mutations worth broadcasting and after the Architecture creative phase has chosen the transport. Both creative phases (Architecture, UI/UX) are **required** and must complete before frontend implementation (Phase 1) begins; the Architecture phase additionally gates the DnD (Phase 4) and real-time (Phase 5) work.

### Requirements

**Functional**:
- Create a board from `/` and edit a board's name/description from `/boards/:id` (existing `POST`/`PATCH /api/v1/boards`).
- Create a card in a specific column and edit a card's title/description from `/boards/:id` (existing `POST`/`PATCH /api/v1/boards/:boardId/cards`).
- Drag a card between columns, persisting `status` via the existing `PATCH /api/v1/boards/:boardId/cards/:id`.
- Push board/card mutations live to all users viewing the same board (new transport).
- Validation, cancel, loading, and error/rollback behavior on every interaction (see AC-ERROR-1→4, AC-LOADING-1, AC-NAV-1).

**Non-Functional** (from productBrief + systemPatterns):
- Write p95 < 300 ms; real-time latency < 2 s on localhost for ≤ 20 concurrent users (single host).
- WCAG 2.1 AA reasonable effort — **keyboard alternative for drag-and-drop is mandatory** (SC 2.1.1); focus management on forms; `role="alert"` errors (reuse `ErrorMessage`).
- GP5: no internal error detail surfaced to users (extend the existing `ApiError`/`errorCopy` pattern to writes).
- GP1–3 (backend): real-time transport config via env (`src/config/env.ts` fail-fast), structured logging via the pino wrapper (no `console.*`), `traceId` correlation.
- Dev/prod parity: the transport must work behind the Vite dev proxy (`:5173`→`:3000`) AND under Express single-origin prod serving (`SERVE_CLIENT=true`, `:3000`).

### Component Analysis

**New components (frontend)**:
- Shared form/dialog primitive(s) and `BoardForm` / `CardForm` (create + edit), per the UI/UX modal-vs-inline-vs-drawer decision.
- Drag-and-drop wiring on `CardItem` (drag source) and `Column` (drop target) + a keyboard move affordance.
- Real-time subscription hook/context (e.g. `useRealtimeBoard`) consuming the chosen transport.

**Affected components (frontend)**:
- `client/src/api/apiClient.ts` (+ test) — add `sendJson` + write wrappers.
- `client/src/api/types.ts` — request/payload types for create/update.
- `client/src/api/errorCopy.ts` — copy for write/validation/rollback error categories.
- `client/src/pages/BoardListPage.tsx` — create-board entry point + flow.
- `client/src/pages/BoardViewPage.tsx` — edit-board, create/edit-card, drag, live-update integration.
- `client/src/components/Column/*`, `client/src/components/CardItem/*` — affordances + DnD.
- `client/package.json` — add `@dnd-kit/*` (and a client WS/SSE dep if the transport needs one).

**Affected components (backend, Phase 5 only)**:
- New real-time module (e.g. `src/realtime/`) — transport handler + board-scoped broadcast, invoked from the card/board mutation paths.
- `src/app.ts` / `src/index.ts` — wire the transport without breaking the `createApp()` supertest-injectable factory (WS upgrade attaches to the HTTP server in `index.ts`; SSE/polling mount as `/api/v1` routes in `createApp()`).
- `src/config/env.ts` — new transport env var(s) (e.g. `REALTIME_ENABLED`), fail-fast parsed.

### Implementation Strategy (order & critical path)
Frontend write foundation → board forms → card forms → drag-and-drop → real-time tier → E2E. Create/edit/drag are independent of real-time and ship first (consuming live, tested APIs). Real-time is sequenced last because it both depends on the Architecture decision and is the riskiest; the mutation UI must exist before live broadcast is meaningful. E2E closes by exercising the full journeys (incl. two-tab real-time) against the real Express-served build, extending the existing Playwright harness.

### Dependencies & Risks
- **Dep**: FEAT-006 (React tier, apiClient, errorCopy, Vitest/Playwright) — complete. FEAT-004/005 (Board/Card CRUD incl. `status`) — complete and tested.
- **Risk**: real-time transport vs Vite dev proxy (esp. WebSocket upgrade needs `ws: true` proxy config) → **Mitigation**: Architecture creative confirms the transport works behind the dev proxy AND under prod single-origin serving before Phase 5.
- **Risk**: WebSocket breaks the pure `createApp()` testability seam (upgrade lives on the HTTP server, not the Express app) → **Mitigation**: Architecture creative defines the integration point; SSE/polling avoid this entirely (mount as routes) — a factor in the transport choice.
- **Risk**: double-apply when the current user's own mutation echoes back over the real-time channel → **Mitigation**: event de-duplication in the subscription hook (covered by a Phase 5 test).
- **Risk**: optimistic DnD leaves a card in the wrong column on PATCH failure → **Mitigation**: rollback-on-failure (AC-ERROR-4), explicitly tested.
- **Risk**: drag-and-drop inaccessible to keyboard users → **Mitigation**: `@dnd-kit` keyboard sensor + an explicit "move to column" affordance; WCAG SC 2.1.1 test in Phase 4.
- **Risk**: scope creep (delete UI, intra-column reordering, labels) → **Mitigation**: explicitly out of scope (see Scope Boundaries).

### Observability Requirements
- **Applies**: Yes (Phase 5 introduces a new transport tier with long-lived connections) → reference `${CLAUDE_PLUGIN_ROOT}/context/observability-requirements.md` during the Phase 5 build.
- **Logging**: connection open/close, broadcast events, and transport errors via the structured pino logger (no `console.*`); board/card mutations already log via `req.log`.
- **Tracing**: carry/propagate `traceId` into real-time events where feasible (the existing `requestLogger` does not cover long-lived sockets — define the seam in the Architecture creative phase).
- **Metrics**: deferred (consistent with the rest of the project); optionally surface a connection count.
- **Configuration**: new transport env var(s) (e.g. `REALTIME_ENABLED`) added to `src/config/env.ts` and documented in `techContext.md` Configuration Variables.

### API Requirements — REST (+ real-time)
- **Involves REST API**: Yes — consumes existing Board/Card write endpoints (no new REST CRUD endpoints). Adds ONE new real-time transport endpoint (WebSocket upgrade path, SSE `text/event-stream` route, or polling route — Architecture creative decision).
- **OpenAPI spec**: still deferred (carried follow-up from FEAT-004/005).

### Creative Phases Required
- **Architecture Design** — REQUIRED (real-time transport choice + dev/prod parity + `createApp()` integration; optimistic-vs-server-confirmed strategy + echo de-dup; `@dnd-kit` confirmation; real-time observability/env). Blocks Phases 1, 4, 5.
- **UI/UX Design** — REQUIRED (form pattern per surface: modal/inline/drawer; DnD affordances + keyboard alternative; real-time update visual feedback). Blocks frontend visual implementation (Phases 2–4).

## Implementation Roadmap

- [x] Phase 1: Frontend write foundation — extend `apiClient.ts` with a `sendJson` helper + write wrappers (`createBoard`/`updateBoard`/`createCard`/`updateCard`/`updateCardStatus`), request/payload types, and write/validation/rollback error copy → enables all subsequent forms (GP5-safe error mapping) ✅ COMPLETE (2026-06-21)
- [x] Phase 2: Create/edit board UI — create-board entry point + form on `/`, edit-board affordance + form on `/boards/:id`, validation/cancel/loading/error → delivers AC-ENTRY-1, AC-HAPPY-1, AC-HAPPY-2, AC-ERROR-1, AC-ERROR-3 (board), AC-LOADING-1 (board), AC-NAV-1 (board) ✅ COMPLETE (2026-06-21) — Dialog primitive, BoardForm, clientId.ts, VALIDATION_COPY; 70/70 client tests
- [x] Phase 3: Create/edit card UI — per-column add-card affordance + create form, edit-card affordance + form, validation/cancel/loading/error → delivers AC-ENTRY-2, AC-HAPPY-3, AC-HAPPY-4, AC-ERROR-2, AC-ERROR-3 (card), AC-LOADING-1 (card), AC-NAV-1 (card) ✅ COMPLETE (2026-06-21) — CardForm (showDescription toggle), inline add-card in Column footer, edit-card via reused Dialog from CardItem; 93/93 client tests
- [x] Phase 4: Drag-and-drop status change — `@dnd-kit` drag source/drop target, optimistic move + rollback, keyboard alternative (WCAG SC 2.1.1), `status` persistence via existing PATCH → delivers AC-HAPPY-5, AC-ERROR-4 ✅ COMPLETE (2026-06-21) — @dnd-kit/core+sortable+utilities (first client runtime deps); CardItem grip handle + Move button, Column useDroppable + DraggableCard wrapper, KanbanBoard DndContext + DragOverlay + resolveCardMove, MoveCardDialog keyboard alt, BoardViewPage optimistic handleMoveCard + rollback banner; 109/109 client tests
- [x] Phase 5: Real-time collaboration — new backend transport (Architecture-chosen) + board-scoped broadcast wired into mutation paths + env/observability; frontend subscription hook with echo de-dup → delivers AC-REALTIME-1, AC-REALTIME-2 ✅ COMPLETE (2026-06-21) — SSE tier `src/realtime/` (broadcaster/events/eventsRouter/notify), `REALTIME_ENABLED`+`REALTIME_KEEPALIVE_MS` env, broadcast hooks on card create/update/delete + board update, frontend `useRealtimeBoard` (EventSource + own-origin echo de-dup) + `recentlyUpdated` highlight flash; backend 150/150, client 118/118
- [x] Phase 6: E2E + verification — extend the Playwright suite with the full interactive journeys incl. two-tab real-time, against the real Express-served build → verifies the end-to-end ACs ✅ COMPLETE (2026-06-21) — two Playwright projects (mocked `chromium` + real-DB `realtime`); `scripts/e2e-db-setup.mjs` (isolated `banyanboard_e2e`, idempotent); `seedWritableApi` write-aware mock + shared `pointerDragCardToColumn`; `interactive-journeys.spec.ts` (7) + `realtime.spec.ts` (2 two-tab SSE); E2E 16/16, backend 150/150, client 118/118

## Creative Phases

- [x] Architecture design → **required** → COMPLETE (2026-06-21) → `memory-bank/creative/TASK-007-board-interactivity-architecture.md`
  - **Decision**: SSE transport mounted as `GET /api/v1/boards/:boardId/events` inside `createApp()` (preserves supertest seam, rides existing Vite `/api/v1` HTTP proxy, native `EventSource` reconnection, zero new backend deps); board-scoped full-entity events (`card:created`/`card:updated`/`card:deleted`/`board:updated`) via `Map<boardId, Set<subscriber>>`; optimistic drag + rollback with echo de-dup via `X-Client-Id` origin-token round-trip; `@dnd-kit/core` + `@dnd-kit/sortable` confirmed; new fail-fast env vars `REALTIME_ENABLED` (default true) + `REALTIME_KEEPALIVE_MS` (default 15000); SSE lifecycle logged via existing pino `req.log`.
  - **Build note**: `X-Client-Id` header must be added to Phase-1 write wrappers (consumed in Phase 5) to avoid rework.
- [x] UI/UX design → **required** → COMPLETE (2026-06-21) → `memory-bank/creative/TASK-007-board-interactivity-uiux.md`
  - **Decision**: Mixed form patterns per surface — modal for create-board & edit-card; inline for edit-board (rename) & create-card (column footer); one shared `<Dialog>` primitive (native `<dialog>` + `showModal()`); `BoardForm`/`CardForm` content-only components. DnD: grip handle (hover/focus-reveal, always-visible on tablet) as `@dnd-kit` activator + a "Move to column" keyboard dialog for WCAG SC 2.1.1. Real-time feedback: brief CSS background-highlight flash (existing tokens, 600ms, `prefers-reduced-motion` honored), de-duped against own mutations; no toast.

---

## Build Execution State

**Build Status**: IDLE
**Current Phase**: COMPLETE
**Current Step**: Archived 2026-06-21 — archive doc created, learned rules consolidated (frontend.md promoted to medium), merged to master via local-merge, feature branch deleted.
**Can Resume**: NO
**Merge Status**: merged
**Merge Commit**: (recorded post-merge below)
**Worktree Cleaned**: N/A (no worktree)
**Branch Deleted**: YES
**Current Build**: Phase 6: E2E + verification (TASK-007) — ALL 6 PHASES COMPLETE → BUILD_COMPLETE
**Build Started**: 2026-06-21
**Phase Number**: 6 of 6
**Is Multi-Phase**: YES

### Current Build Step (Phase 6)
**Step**: Phase 6 COMPLETE — committed; all phases done, awaiting human review → /banyan-reflect then /banyan-archive
**Status**: COMPLETE
**Completed**: 2026-06-21

### Completed Steps (Phase 6)
- Step 0.1 Resumption/Rules Check: COMPLETE — new build (Phase 5 done); no agent-rules dir (skip index)
- Step 0.5 Git Setup: COMPLETE — on feature/FEAT-007-board-interactivity-realtime-collab, clean tree, local-merge (no remote/worktree)
- Step 0.6 Phase Gate: COMPLETE — roadmap populated, both creative phases COMPLETE, Level 3; Phase 5 done
- Step 1 Read Task Context: COMPLETE — Phase 6 = E2E + verification (full interactive journeys + two-tab real-time over a REAL SSE connection behind the Express-served build)
- Step 2 Load Context: COMPLETE — design: (A) hermetic single-tab journeys via a write-aware stateful page.route mock; (B) two-tab real-time (AC-REALTIME-1/2) against a REAL DB-backed backend (dedicated banyanboard_e2e DB, 2nd webServer, 2nd Playwright project) — mocking cannot broadcast across browser contexts
- Step 3 Test Writer: COMPLETE — `scripts/e2e-db-setup.mjs` (create-if-missing→migrate→truncate, idempotent), playwright.config (chromium+realtime projects, 2 webServers), `fixtures.ts` +seedWritableApi +pointerDragCardToColumn, `interactive-journeys.spec.ts` (7 single-tab journeys), `realtime.spec.ts` (2 two-tab journeys)
- Step 7 Integration Verify: COMPLETE — E2E 16/16 (7 read-only + 7 interactive + 2 two-tab realtime; realtime stable across repeat-each=3); backend Jest 150/150; client Vitest 118/118; `npm run e2e` canonical (rebuild both tiers) green; no ESLint (strict tsc is the lint gate)
- Step 8 Code Review: COMPLETE — independent reviewer APPROVED, 0 blocking; cross-context SSE de-dup traced end-to-end (distinct per-context originIds, subscriber-before-mutation, 2s assertion budget), DDL identifier guard adequate, mocked project DB-free, per-test store clone (no leakage), GP5 no-leak, FEAT-006-consistent. 3 non-blocking recommendations carried as follow-ups
- Step 9/10 Docs + Memory Bank: COMPLETE — techContext (two Playwright projects + `scripts/e2e-db-setup.mjs` + `E2E_*` harness env + Last Refreshed), progress.md (Phase 6 + BUILD_COMPLETE), tasks.md registry (BUILD_COMPLETE 6/6), roadmap checkbox; applied 1 zero-risk review note (mock insertion-order comment)

### Resumption Notes (Phase 6)
**Can Resume**: NO
**Resume From**: Build complete — next: /banyan-reflect TASK-007 then /banyan-archive TASK-007
**Notes**: All 6 phases COMPLETE. Phase 6 delivered two Playwright projects (mocked `chromium` + real-DB `realtime`), `scripts/e2e-db-setup.mjs` (isolated `banyanboard_e2e`), `seedWritableApi` + `pointerDragCardToColumn` in fixtures, `interactive-journeys.spec.ts` (7) + `realtime.spec.ts` (2 two-tab SSE). Carried follow-ups (non-blocking): (1) replace the fixed 700ms SSE settle in realtime.spec with a server `ready`/`connected` signal or subscriber-count poll; (2) move the realtime `webServer` `&&` chain into a Playwright `globalSetup`; (3) `banyanboard_e2e` accumulates boards across reused-server local runs (harmless — id-scoped lookups) — periodic drop or afterAll cleanup.

### Prior Phase (Phase 5) — Current Build Step
**Step**: Phase 5 COMPLETE — committed; awaiting human review before Phase 6
**Status**: COMPLETE
**Completed**: 2026-06-21

### Completed Steps (Phase 5)
- Step 0.1 Resumption/Rules Check: COMPLETE — new build (Phase 4 done); no agent-rules dir (skip index)
- Step 0.5 Git Setup: COMPLETE — on feature/FEAT-007-board-interactivity-realtime-collab, clean tree, local-merge (no remote/worktree)
- Step 0.6 Phase Gate: COMPLETE — roadmap populated, both creative phases COMPLETE (Architecture + UI/UX), Level 3
- Step 1 Read Task Context: COMPLETE — Phase 5 = real-time collaboration (SSE transport, board-scoped broadcast, echo de-dup, highlight flash)
- Step 2 Load Context: COMPLETE — Architecture Decisions 1/2/3/5 (SSE, full-entity board-scoped events, echo de-dup via X-Client-Id/originId, REALTIME_* env + observability) + UI/UX Spec 7 (highlight flash) authoritative
- Step 3 Test Writer (RED): COMPLETE — 12 backend tests (broadcaster 5, eventsRouter 3, mutationBroadcast 4) + 9 frontend (useRealtimeBoard 5, CardItem +1, BoardViewPage +3)
- Step 4 Coding Agent (GREEN): COMPLETE — `src/realtime/{events,broadcaster,notify,eventsRouter}.ts`, mounted in routes/index.ts, broadcast hooks in cards.ts/boards.ts, REALTIME_* in env.ts; frontend `useRealtimeBoard.ts`, realtime types, CardItem recentlyUpdated +CSS, highlightedCardIds threaded KanbanBoard→Column→CardItem, BoardViewPage hook wiring
- Step 7 Integration Verify: COMPLETE — backend Jest 150/150; client Vitest 118/118; backend `tsc` + client `tsc -b`+`vite build` clean (74 modules, 232 KB / 75 KB gzip); no ESLint (strict tsc is the lint gate)
- Step 8 Code Review: COMPLETE — independent reviewer APPROVED, 0 blocking; createApp() seam preserved, fire-and-forget off critical path (NFR1), GP5 no-leak, pino-only (GP3), board-scoping + disconnect cleanup verified, echo de-dup correct (R5), env fail-fast (GP1), Spec 7 a11y honored; 3 optional non-blocking notes
- Step 9/10 Docs + Memory Bank: COMPLETE — techContext updated (REALTIME_* vars + `src/realtime/` tier + two-channel origin token note); progress.md + tasks.md + roadmap checkbox updated

### Resumption Notes (Phase 5)
**Can Resume**: NO
**Resume From**: Phase 6 (next /banyan-build TASK-007 Phase6)
**Notes**: Phase 5 done. Phase 6 = E2E + verification — extend the Playwright suite (`client/e2e/`) with the full interactive journeys against the real Express-served build (`SERVE_CLIENT=true`), INCLUDING two-tab real-time: AC-REALTIME-1 (tab A drag → tab B sees the move <2s) and AC-REALTIME-2 (tab A create → tab B sees the card <2s). Real-time tier is live and unit/integration-tested; Phase 6 proves it end-to-end over a real SSE connection behind the Express-served build (verify the Vite-proxy-less single-origin path + `text/event-stream` buffering, per Architecture Risk table). Also create-board/edit-board/create-card/edit-card/drag-persist-on-reload/cancel-form/write-failure journeys.

### Prior Phases (Phase 4)
**Step**: Phase 4 COMPLETE — committed; awaiting human review before Phase 5
**Status**: COMPLETE
**Completed**: 2026-06-21

### Completed Steps (Phase 4)
- Step 0.1 Resumption/Rules Check: COMPLETE — new build (Phase 3 done); no agent-rules dir (skip index)
- Step 0.5 Git Setup: COMPLETE — on feature/FEAT-007-board-interactivity-realtime-collab, clean tree, local-merge (no remote/worktree)
- Step 0.6 Phase Gate: COMPLETE — roadmap populated, both creative phases COMPLETE (Architecture + UI/UX), Level 3
- Step 1 Read Task Context: COMPLETE — Phase 4 = drag-and-drop status change (@dnd-kit drag handle + droppable columns, optimistic move + rollback, keyboard "Move to column" alternative)
- Step 2 Load Context: COMPLETE — Level 3 frontend phase; Architecture Decision 3 (optimistic + rollback, X-Client-Id echo de-dup) + Decision 4 (@dnd-kit) + UI/UX Spec 6 (DnD affordances + MoveCardDialog) authoritative
- Step pre-3 Dependency: COMPLETE — installed @dnd-kit/core@6.3.1 + @dnd-kit/sortable@8.0.0 + @dnd-kit/utilities@3.2.2 (0 prod vulnerabilities); FIRST new client runtime dep
- Step 3 Test Writer (RED): COMPLETE — 16 new tests (resolveCardMove 5, MoveCardDialog 4, CardItem +4, BoardViewPage +3); confirmed RED (10 failing pre-impl)
- Step 4 Coding Agent (GREEN): COMPLETE — CardItem drag/move affordances; Column useDroppable + DraggableCard; KanbanBoard DndContext + DragOverlay + resolveCardMove; MoveCardDialog (+css); BoardViewPage handleMoveCard optimistic + rollback banner; CSS for drag/drop states
- Step 7 Integration Verify: COMPLETE — client Vitest 109/109; `tsc -b` + `vite build` clean (73 modules, 230 KB / 74 KB gzip); no ESLint (strict tsc is the lint gate)
- Step 8 Code Review: COMPLETE — 0 blocking; GP5-safe (static rollback copy), XSS-safe (React-escaped aria-labels), full a11y (focusable drag handle + KeyboardSensor + MoveCardDialog for SC 2.1.1, Dialog focus trap, role=alert banner), optimistic+rollback per Architecture Decision 3, no DragOverlay duplicate-id (hook in Column wrapper)
- Step 9/10 Docs + Memory Bank: COMPLETE — techContext updated (@dnd-kit deps); progress.md + tasks.md updated

### Resumption Notes (Phase 4)
**Can Resume**: NO
**Resume From**: Phase 5 (next /banyan-build TASK-007 Phase5)
**Notes**: Phase 4 done. Phase 5 = real-time collaboration — NEW backend tier: `src/realtime/broadcaster.ts` (pure `Map<boardId, Set<subscriber>>`) + `src/realtime/eventsRouter.ts` (SSE `GET /api/v1/boards/:boardId/events`, mounted in `src/routes/index.ts` AFTER cards — preserves createApp() seam), broadcast hooks at the existing mutation log sites (cards.ts:73/125/144, boards.ts:103), `REALTIME_ENABLED`+`REALTIME_KEEPALIVE_MS` in `src/config/env.ts` (fail-fast); frontend `client/src/realtime/useRealtimeBoard.ts` (EventSource, drop own-`originId` echo via getClientId(), apply card:*/board:updated to state) + the `recentlyUpdated` highlight flash (UI/UX Spec 7) on CardItem. X-Client-Id already sent by all write wrappers (incl. updateCardStatus). See architecture creative Decisions 1/2/3/5 + UI/UX Spec 7.

### Phase 3 (previous) — Current Build Step
**Step**: Phase 3 COMPLETE — committed; awaiting human review before Phase 4
**Status**: COMPLETE
**Completed**: 2026-06-21

### Completed Steps (Phase 3)
- Step 0.1 Resumption/Rules Check: COMPLETE — new build (Phase 2 done); no agent-rules dir (skip index)
- Step 0.5 Git Setup: COMPLETE — on feature/FEAT-007-board-interactivity-realtime-collab, clean tree, local-merge (no remote/worktree)
- Step 0.6 Phase Gate: COMPLETE — roadmap populated, both creative phases COMPLETE (Architecture + UI/UX), Level 3
- Step 1 Read Task Context: COMPLETE — Phase 3 = create/edit card UI (inline create-card in Column footer, modal edit-card from CardItem)
- Step 2 Load Context: COMPLETE — Level 3 frontend phase; UI/UX creative Spec 4 (inline create) + Spec 5 (modal edit) are authoritative
- Step 3 Test Writer (RED): COMPLETE — 23 new tests (CardForm 12, Column +5, CardItem +3, BoardViewPage +3); confirmed RED
- Step 4 Coding Agent (GREEN): COMPLETE — CardForm + CSS; Column add-card affordance; CardItem edit affordance; KanbanBoard prop threading; BoardViewPage create/edit handlers + Edit Card Dialog
- Step 7 Integration Verify: COMPLETE — client Vitest 93/93; `tsc -b` + `vite build` clean; no ESLint (strict tsc is the lint gate)
- Step 8 Code Review: COMPLETE — 0 blocking; GP5-safe, XSS-safe (React-escaped aria-label), full a11y, FEAT-006/Phase-2-consistent; backend validators confirmed to accept the create/edit payloads
- Step 9/10 Docs + Memory Bank: COMPLETE — no new deps/config/patterns; progress.md + tasks.md updated

### Resumption Notes (Phase 3)
**Can Resume**: NO
**Resume From**: Phase 4 (next /banyan-build TASK-007 Phase4)
**Notes**: Phase 3 done. Phase 4 = drag-and-drop status change — add `@dnd-kit/core` + `@dnd-kit/sortable` to client/package.json (FIRST new client dep — update techContext), `useDraggable` grip handle on CardItem + `useDroppable` on Column + `DragOverlay` in KanbanBoard, optimistic move + rollback (AC-ERROR-4) via `updateCardStatus` (already in apiClient), `MoveCardDialog` keyboard alternative (WCAG SC 2.1.1). The Column/CardItem/KanbanBoard handler-threading + the reusable Dialog established here are the seams Phase 4 builds on.

### Phase 2 (previous) — Current Build Step
**Step**: Phase 2 COMPLETE — committed; awaiting human review before Phase 3
**Status**: COMPLETE
**Completed**: 2026-06-21

### Completed Steps (Phase 2)
- Step 0.1 Resumption/Rules Check: COMPLETE — new build (Phase 1 done); agent-rules index current
- Step 0.5 Git Setup: COMPLETE — on feature/FEAT-007-board-interactivity-realtime-collab, clean tree, local-merge (no remote/worktree)
- Step 0.6 Phase Gate: COMPLETE — roadmap populated, both creative phases COMPLETE (Architecture + UI/UX), Level 3
- Step 1 Read Task Context: COMPLETE — Phase 2 = create/edit board UI (modal create-board, inline edit-board)
- Step 2 Load Context: COMPLETE — Level 3 frontend phase; UI/UX creative Spec 1/2/3 are authoritative
- Step 3 Test Writer (RED): COMPLETE — 23 new tests (Dialog 4, BoardForm 10, BoardListPage +6, BoardViewPage +5)
- Step 4 Coding Agent (GREEN): COMPLETE — Dialog + BoardForm + clientId.ts + VALIDATION_COPY; wired BoardListPage (create) + BoardViewPage (inline edit)
- Step 7 Integration Verify: COMPLETE — client Vitest 70/70; `tsc -b` + `vite build` clean; no ESLint (strict tsc is the lint gate)
- Step 8 Code Review: COMPLETE — 0 blocking; GP5-safe, XSS-safe, full a11y, FEAT-006-consistent
- Step 9/10 Docs + Memory Bank: COMPLETE — no new deps/config/patterns; progress.md + tasks.md + roadmap updated

### Resumption Notes (Phase 2)
**Can Resume**: NO
**Resume From**: Phase 3 (next /banyan-build TASK-007 Phase3)
**Notes**: Phase 2 done. Phase 3 = create/edit card UI — CardForm (title+description), inline add-card in Column footer (status pre-scoped to column), edit-card via Dialog from CardItem. Reuse the Dialog primitive + the BoardForm state-machine pattern. clientId/X-Client-Id already plumbed.

### Phase 1 (previous) — Current Build Step
**Step**: Phase 1 COMPLETE — committed; awaiting human review before Phase 2
**Status**: COMPLETE
**Completed**: 2026-06-21

### Completed Steps (Phase 1)
- Step 0.5 Git Setup: COMPLETE — branch feature/FEAT-007-board-interactivity-realtime-collab created (local-merge, no remote, no worktree)
- Step 3 Test Writer: COMPLETE — 13 tests (10 apiClient, 3 errorCopy), correct RED state
- Step 4 Coding Agent: COMPLETE — sendJson + 5 write wrappers (+X-Client-Id), 4 payload types, writeErrorCopy + dragRevertErrorCopy
- Step 7 Integration Verify: COMPLETE — client Vitest 47/47 pass; `tsc -b` + `vite build` clean
- Step 8 Code Review: COMPLETE — inline review, GP5-compliant (no body read, safe categories), matches existing style, 0 blocking
- Step 9/10 Docs + Memory Bank: COMPLETE — no new deps/config/patterns in Phase 1 (deferred to Phase 4 @dnd-kit / Phase 5 realtime)

### Resumption Notes
**Can Resume**: NO
**Resume From**: Phase 2 (next /banyan-build TASK-007)
**Notes**: Phase 1 done. Phase 2 = create/edit board UI (modal create-board on `/`, inline edit-board on `/boards/:id`) per UI/UX creative. Reminder: X-Client-Id header already plumbed into write wrappers for Phase 5.

### Active Sub-Agents
- Architecture Design: COMPLETE (2026-06-21)
- UI/UX Design: COMPLETE (2026-06-21)

### Completed Steps
- Step 0.1 Create Task: COMPLETE (2026-06-21) — TASK-007 created for FEAT-007
- Step 0.2 Phase Gate: COMPLETE (2026-06-21) — task registered, roadmap exists, FEAT-007 has complexity (Level 3)
- Step 2 Roadmap Link: COMPLETE (2026-06-21) — Linked to FEAT-007
- Step 3 Spec Writer: COMPLETE (2026-06-21) — Specification drafted (Sonnet); 6 surfaces, 12 acceptance criteria; LOW-confidence fields isolated to real-time transport + DnD interaction + form pattern
- Step 3.2 Human Review: COMPLETE (2026-06-21) — Approved as-is
- Step 4 Codebase Analysis: COMPLETE (2026-06-21) — confirmed all Board/Card write endpoints exist + tested (incl. `status` PATCH in cards.test.ts:438-507); apiClient is GET-only (needs write wrappers); real-time is the only new backend tier
- Step 5 Implementation Plan: COMPLETE (2026-06-21) — 6 phases, test strategy (~44–54 tests), 2 creative phases flagged REQUIRED
- Step 6 Finalize: COMPLETE (2026-06-21) — validation gate passed; Status=PLANNING_COMPLETE; Architecture + UI/UX creative REQUIRED next
- CREATIVE Architecture: COMPLETE (2026-06-21) — Output: memory-bank/creative/TASK-007-board-interactivity-architecture.md — SSE transport, full-entity board-scoped events, optimistic DnD + X-Client-Id echo de-dup, @dnd-kit confirmed, REALTIME_* env vars
- CREATIVE UI/UX: COMPLETE (2026-06-21) — Output: memory-bank/creative/TASK-007-board-interactivity-uiux.md — mixed form patterns (modal create-board/edit-card, inline edit-board/create-card), grip-handle DnD + "Move to column" keyboard dialog, CSS highlight-flash real-time feedback
