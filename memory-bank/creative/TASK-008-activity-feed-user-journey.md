# User Journey: Realtime Activity Feed (TASK-008)

**Created**: 2026-06-30
**Task**: TASK-008 (FEAT-008) — Level 3
**Source**: Extracted from `creative/TASK-008-activity-feed-uiux.md` § "User Journey for UAT" into the
standalone, section-parseable form `/banyan-uat` expects.
**Primary Persona / Actor**: Alex the Dev (software engineer on a 4-person team; desktop browser).
**Base URL**: resolved from `uat-config.md` (default env `dev` = `http://localhost:5173`).

> **Preconditions** (all sections): backend running with `REALTIME_ENABLED=true` (`:3000`) and the Vite
> SPA on `:5173`. BanyanBoard's MVP is unauthenticated — no login step. At least one board with prior
> card-move history SHOULD exist for the happy path; one board with zero card-move history is needed for
> the empty-state check (create a fresh board if none exists).

---

## Happy Path

**Actor**: Alex the Dev

**Acceptance criteria covered**: AC-ENTRY-1, AC-LOAD-1, AC-EMPTY-1, AC-LOADING-1, AC-HAPPY-2 (live +
cross-tab), entry content correctness.

### Steps

1. Navigate to the base URL (`http://localhost:5173`). The board list page (`BoardListPage`) loads.
2. Click a board that has at least one existing card-move in its history. The board view page
   (`/boards/:id`, `BoardViewPage`) loads.
3. Observe the initial load: while activity data is in flight, the feed panel content area shows a
   `<Spinner>` (loading state) — the "Activity" heading is visible above it.
4. Once loading completes, observe the feed panel to the right of the kanban columns (desktop layout):
   - If history exists, entries render newest-first.
   - Each entry shows: card title, from-column → to-column (e.g. "To Do → In Progress"), and a relative
     timestamp (e.g. "2 minutes ago").
5. Drag a card from one column to another (e.g. "To Do" → "In Progress"). The keyboard alternative is
   the "Move to column" dialog (`MoveCardDialog`).
6. Observe the result after the move:
   - The kanban board shows the card in its new column.
   - Within ~1 second (SSE latency), a new entry appears at the **top** of the Activity feed.
   - The new entry shows the correct card title, correct source → target labels, and a recent timestamp
     ("just now" / "< 1 minute ago").
   - The new entry briefly highlights (light blue flash) before fading to white.
7. Open the same board in a second browser tab. In Tab A, move a card. Observe that Tab B's feed receives
   the same new entry at the top (cross-tab delivery via SSE — AC-HAPPY-2).
8. Open a board that has **no** card-move history. Observe the feed shows the empty state
   ("No activity yet") rather than a blank area, spinner, or stale data.

### Verify

- [ ] Feed panel is visible on the board view without any user interaction (AC-ENTRY-1).
- [ ] Initial load shows a `<Spinner>` in the feed panel, not a blank area (AC-LOADING-1).
- [ ] Persisted history renders newest-first with title + from → to + timestamp on each entry (AC-LOAD-1).
- [ ] After a card move, a new entry appears at the top of the feed within ~1 second (AC-HAPPY-2).
- [ ] The new entry's content is correct (card title, source → target labels, recent timestamp).
- [ ] The new entry shows the brief highlight-fade.
- [ ] A second tab receives the live entry (cross-tab SSE delivery — AC-HAPPY-2).
- [ ] An empty board shows "No activity yet" (AC-EMPTY-1).
- [ ] No native browser dialog (`alert`/`confirm`/`prompt`) is triggered by any feed interaction.

### Cleanup

- No persistent test accounts to tear down (unauthenticated MVP). Card moves performed during the walk
  are real and recorded in `activity_events`; if a clean board is desired afterward, create a throwaway
  board for the walk rather than mutating a board with meaningful data.

---

## Mobile

**Actor**: Alex the Dev (mobile/responsive viewport — best-effort per productBrief; mobile-first is not
an MVP priority).

**Layout under test**: Option 4 responsive stack-below — at viewport widths ≤ 900px the feed panel
stacks **below** the full-width kanban (UI/UX creative § Responsive Behavior).

### Steps

1. With the viewport at the mobile preset (375 × 667), navigate to a board view page (`/boards/:id`).
2. Observe the layout: the kanban renders full-width (with its existing `overflow-x: auto` horizontal
   scroll); the Activity feed panel appears **below** the kanban rather than to the right.
3. Scroll down to the feed. Confirm entries (or the empty state) are readable.

### Verify

- [ ] On the mobile viewport the feed stacks below the kanban (not a cramped sidebar).
- [ ] The kanban retains its full width and horizontal-scroll behavior.
- [ ] Feed entries / empty state remain legible at the mobile width.
- [ ] No horizontal overflow of the page body (the kanban scroller is the only horizontal scroller).

### Cleanup

- None.

---

## Error Scenarios

**Actor**: Alex the Dev

**Acceptance criteria covered**: AC-ERROR-1 (404 board not found), AC-ERROR-2 (400 invalid id), feed
non-fatal error behavior (UI/UX creative § Error States).

### Scenario E1 — Activity fetch fails but board still renders (non-fatal feed error)

1. Open a board view page where the activity fetch returns a server/network error (e.g. with the backend
   activity endpoint unavailable while board/cards endpoints succeed).
2. Verify the board and kanban still render normally; the feed panel shows a compact inline error
   ("Could not load activity" / "Try reloading the page."), NOT a full-page error and NOT raw JSON.

### Scenario E2 — Board not found (page-level 404)

1. Navigate directly to a non-existent board id (e.g. `/boards/99999`).
2. Verify the page shows the existing board-not-found error state (the feed panel never renders in this
   case). The activity endpoint `GET /api/v1/boards/99999/activity` would itself return
   `404 {error:'Not Found', path, traceId}` (AC-ERROR-1) — confirmable via the network panel.

### Scenario E3 — Invalid board id (400)

1. (API-level) `GET /api/v1/boards/abc/activity` returns `400` with a JSON error body (AC-ERROR-2). The
   SPA never constructs such a URL through normal navigation; this is verified via the network/REST layer.

### Verify

- [ ] A failed activity fetch is non-fatal — the board/kanban render; the feed shows a compact, generic
      error with no internal detail leaked (GP5).
- [ ] A non-existent board shows the page-level not-found state; the activity endpoint returns 404
      (AC-ERROR-1).
- [ ] An invalid board id yields a 400 JSON error from the activity endpoint (AC-ERROR-2).
- [ ] No native browser dialog is triggered by any error path.

### Cleanup

- None.

---

## Negative / Access-Denied Paths

**Actor**: n/a

BanyanBoard's MVP is **unauthenticated** with a shared-access model (all users see all boards —
productBrief § Security/Authorization). There are therefore **no RBAC / access-denied paths** to walk in
v1. This section is intentionally empty; revisit when auth (FEAT — future) lands.

### Verify

- [ ] (n/a — no access-control surface in the unauthenticated MVP)

### Cleanup

- None.
