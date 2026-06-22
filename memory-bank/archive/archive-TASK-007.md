# Archive: Board Interactivity and Real-Time Collaboration

## Metadata
- Task ID: TASK-007
- Complexity: Level 3 (manual override; auto-evaluated Level 4)
- Started: 2026-06-21
- Completed: 2026-06-21
- Roadmap Link: FEAT-007 (Board interactivity and real-time collaboration)
- Branch: feature/FEAT-007-board-interactivity-realtime-collab
- Archive Strategy: local-merge

## Summary

TASK-007 transformed the read-only React SPA delivered in FEAT-006 into a fully
interactive kanban board. It added four create/edit form surfaces (create board,
edit board, create card, edit card), drag-and-drop of cards between status columns
with optimistic updates and rollback-on-failure, a keyboard alternative for
drag-and-drop (WCAG 2.1 SC 2.1.1), and real-time collaboration via Server-Sent
Events so every viewer of a board sees mutations live within ~2s.

The create/edit/drag work consumed Board/Card write endpoints that already existed
and were tested (FEAT-004/005), so it was frontend-only. The one new backend
concern — a real-time transport tier — was the highest-risk, lowest-confidence area
and was sequenced last (Phase 5) after there were mutations worth broadcasting and
after the Architecture creative phase chose the transport. The task introduced the
project's first real-time backend module (`src/realtime/`) and its first client
runtime dependencies (`@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`).

All 12 acceptance criteria were met with direct test and E2E evidence, and all 6
build phases passed independent code-reviewer sub-agent review with zero blocking
findings.

## Requirements

### Original Requirements
- Create/edit board UI — create new boards from the board list and edit board
  details from the board view.
- Create/edit card UI — create new cards per-column and edit existing cards.
- Drag-and-drop of cards between columns (To Do / In Progress / Done), persisting
  the new `status` via the existing `PATCH /api/v1/boards/:boardId/cards/:id`.
- Real-time collaboration so multiple users viewing the same board see
  board/card updates live.
- Validation, cancel, loading, and error/rollback behavior on every interaction.
- WCAG 2.1 AA reasonable effort, including a keyboard alternative to drag-and-drop.
- Dev/prod parity: transport must work behind the Vite dev proxy AND under Express
  single-origin prod serving (`SERVE_CLIENT=true`).

### Success Criteria
- [✓] AC-ENTRY-1 — create-board affordance visible + keyboard-reachable on `/`
- [✓] AC-ENTRY-2 — add-card affordance in each of the three columns
- [✓] AC-HAPPY-1 — create a board end-to-end (appears in list with correct name)
- [✓] AC-HAPPY-2 — edit a board's name/description (heading + list update, no reload)
- [✓] AC-HAPPY-3 — create a card scoped to a specific column (absent from others)
- [✓] AC-HAPPY-4 — edit a card's title/description in place
- [✓] AC-HAPPY-5 — drag a card to a different column; `status` persisted on reload
- [✓] AC-REALTIME-1 — second tab sees a card-move within 2s, no refresh, scoped
- [✓] AC-REALTIME-2 — second tab sees a newly created card within 2s, no refresh
- [✓] AC-ERROR-1 — validation error when creating a board with no name
- [✓] AC-ERROR-2 — validation error when creating a card with no title
- [✓] AC-ERROR-3 — user-readable error on server/network write failure; input preserved
- [✓] AC-ERROR-4 — drag-and-drop failure rolls the card back to its original column
- [✓] AC-LOADING-1 — pending state during writes (submit disabled / card muted)
- [✓] AC-NAV-1 — cancel a create/edit form without submitting (no API call)
- [✓] WCAG 2.1 SC 2.1.1 — keyboard alternative for moving cards between columns

## Implementation

### Approach

Six-phase TDD delivery (RED test → GREEN implementation → independent code review →
docs), gated by two mandatory creative phases (Architecture and UI/UX) that both
completed before frontend implementation began. Frontend write foundation first,
then board forms, card forms, drag-and-drop, the real-time tier, and finally E2E.
Create/edit/drag shipped independently of real-time (consuming live, already-tested
APIs); real-time was sequenced last because it both depended on the Architecture
decision and was the riskiest area.

### Key Components

1. **Frontend write foundation** (Phase 1)
   - Purpose: GP5-safe write API surface for all subsequent forms.
   - Files: `client/src/api/apiClient.ts` (`sendJson` helper + `createBoard`/
     `updateBoard`/`createCard`/`updateCard`/`updateCardStatus`, each sending an
     `X-Client-Id` header), `client/src/api/types.ts` (request/payload types),
     `client/src/api/errorCopy.ts` (`writeErrorCopy` + `dragRevertErrorCopy`),
     `client/src/api/clientId.ts` (per-tab UUID origin token).

2. **Create/edit board UI** (Phase 2)
   - Purpose: modal create-board on `/`, inline edit-board on `/boards/:id`.
   - Files: `client/src/components/Dialog/*` (shared native-`<dialog>` primitive),
     `client/src/components/BoardForm/*`, `client/src/pages/BoardListPage.tsx`,
     `client/src/pages/BoardViewPage.tsx`.

3. **Create/edit card UI** (Phase 3)
   - Purpose: inline per-column add-card, modal edit-card from a card.
   - Files: `client/src/components/CardForm/*` (with `showDescription` toggle),
     `client/src/components/Column/Column.tsx` (footer add-card affordance),
     `client/src/components/CardItem/CardItem.tsx` (edit affordance), reusing the
     `Dialog` primitive from Phase 2.

4. **Drag-and-drop status change** (Phase 4)
   - Purpose: pointer + keyboard DnD with optimistic move and rollback.
   - Files: `@dnd-kit/core`+`sortable`+`utilities` (first client runtime deps),
     `CardItem` (grip handle + Move button), `Column` (`useDroppable` + draggable
     card wrapper), `KanbanBoard` (`DndContext` + `DragOverlay` + `resolveCardMove`
     pure function), `client/src/components/MoveCardDialog/*` (keyboard alternative),
     `BoardViewPage.handleMoveCard` (optimistic update + rollback banner, shared by
     both pointer-drop and keyboard paths).

5. **Real-time collaboration tier** (Phase 5)
   - Purpose: board-scoped SSE broadcast of mutations with own-echo de-dup.
   - Files (backend): `src/realtime/broadcaster.ts` (HTTP-ignorant
     `Map<boardId, Set<subscriber>>` pub/sub), `src/realtime/events.ts`,
     `src/realtime/eventsRouter.ts` (`GET /api/v1/boards/:boardId/events`,
     mounted in `src/routes/index.ts` inside `createApp()`), `src/realtime/notify.ts`
     (fire-and-forget mutation→broadcast bridge), broadcast hooks in
     `src/routes/cards.ts` + `src/routes/boards.ts`, `REALTIME_ENABLED` +
     `REALTIME_KEEPALIVE_MS` in `src/config/env.ts`.
   - Files (frontend): `client/src/realtime/useRealtimeBoard.ts` (`EventSource`
     subscription, own-`originId` echo de-dup), `recentlyUpdated` highlight flash on
     `CardItem` threaded `KanbanBoard`→`Column`→`CardItem`.

6. **E2E + verification** (Phase 6)
   - Purpose: full interactive journeys incl. two-tab real-time against the real
     Express-served build.
   - Files: `client/playwright.config.ts` (two projects — hermetic `chromium` +
     real-DB `realtime`, each with its own `webServer`), `scripts/e2e-db-setup.mjs`
     (idempotent isolated `banyanboard_e2e`: create-if-missing → migrate → truncate),
     `client/e2e/fixtures.ts` (`seedWritableApi` write-aware mock +
     `pointerDragCardToColumn`), `client/e2e/interactive-journeys.spec.ts` (7
     single-tab), `client/e2e/realtime.spec.ts` (2 two-tab SSE).

### Design Decisions

From the Architecture creative
(`memory-bank/creative/TASK-007-board-interactivity-architecture.md`):
1. **SSE transport** mounted as `GET /api/v1/boards/:boardId/events` inside
   `createApp()` — preserves the supertest seam, rides the existing Vite `/api/v1`
   HTTP proxy with no `ws: true` change, native `EventSource` reconnection, zero new
   backend runtime dependencies. (Chosen over WebSocket, which would break the
   factory seam and add a proxy wrinkle.)
2. **Full-entity, board-scoped events** (`card:created`/`card:updated`/
   `card:deleted`/`board:updated`) via `Map<boardId, Set<subscriber>>` — satisfies
   AC-REALTIME-1's stub-detection (only the moved card changes).
3. **Optimistic drag + rollback** with **echo de-dup** via an `X-Client-Id` →
   `originId` round-trip — prevents the user's own PATCH echoing back as a remote
   event, with no server-side per-client state. `X-Client-Id` was pre-plumbed in
   Phase 1 (consumed in Phase 5) to avoid rework.
4. **`@dnd-kit/core` + `@dnd-kit/sortable`** confirmed as the DnD library.
5. New fail-fast env vars `REALTIME_ENABLED` (default true) +
   `REALTIME_KEEPALIVE_MS` (default 15000); SSE lifecycle logged via the existing
   pino `req.log`.

From the UI/UX creative
(`memory-bank/creative/TASK-007-board-interactivity-uiux.md`):
- **Mixed form patterns per surface** — modal for create-board & edit-card; inline
  for edit-board (rename) & create-card (column footer); one shared `<Dialog>`
  primitive; `BoardForm`/`CardForm` content-only components.
- **DnD affordances** — grip handle (hover/focus-reveal, always visible on tablet)
  as the `@dnd-kit` activator + a "Move to column" keyboard dialog for WCAG SC 2.1.1.
- **Real-time feedback** — brief CSS background-highlight flash (existing tokens,
  600ms, `prefers-reduced-motion` honored), de-duped against own mutations; no toast.

References:
- `memory-bank/creative/TASK-007-board-interactivity-architecture.md`
- `memory-bank/creative/TASK-007-board-interactivity-uiux.md`

## Testing
- Frontend unit/component (Vitest): 34 → 118 (+84 net-new)
- Backend (Jest): 138 → 150 (+12 net-new)
- E2E (Playwright): 7 → 16 (+9 net-new: 7 single-tab interactive + 2 two-tab SSE)
- Total net-new: 105 tests (plan was ~44–54 — exceeded in the quality direction)
- All tests passing: ✅ (backend 150/150, client 118/118, E2E 16/16; the two-tab
  `realtime.spec.ts` stable across `--repeat-each=3`)
- Code review: APPROVED, 0 blocking findings across all 6 phases (independent
  code-reviewer sub-agent each phase)

## Files Changed

64 files changed, ~7,887 insertions, ~96 deletions across the feature branch.
Highlights:

- `client/src/api/{apiClient,types,errorCopy,clientId}.ts` (+tests) — write API surface
- `client/src/components/{Dialog,BoardForm,CardForm,MoveCardDialog}/*` — new form/DnD UI
- `client/src/components/{Column,CardItem,KanbanBoard}/*` — affordances + DnD wiring
- `client/src/pages/{BoardListPage,BoardViewPage}.tsx` — create/edit/move + live updates
- `client/src/realtime/useRealtimeBoard.ts` — SSE subscription hook + echo de-dup
- `src/realtime/{broadcaster,events,eventsRouter,notify}.ts` (+tests) — backend SSE tier
- `src/config/env.ts` — `REALTIME_ENABLED` + `REALTIME_KEEPALIVE_MS` fail-fast vars
- `src/routes/{cards,boards,index}.ts` — broadcast hooks + SSE route mount
- `client/playwright.config.ts`, `scripts/e2e-db-setup.mjs`, `client/e2e/*` — E2E harness
- `client/package.json` — `@dnd-kit/core`+`sortable`+`utilities`
- `memory-bank/*` — creative docs, reflection, techContext, learned rules

## Lessons Learned

- **Creative-phase-as-implementation-contract held for all six build phases** with
  zero mid-phase design reversals. Exact TypeScript interface sketches, file paths,
  CSS token values, and a phase-sequencing map made the creative docs directly
  usable as implementation specs.
- **Pre-plumbing a cross-phase dependency in an early phase eliminates later
  rework** — the `X-Client-Id` header added in Phase 1 (consumed only in Phase 5)
  meant zero Phase-5 rework for echo de-dup.
- **A mocked API cannot broadcast a server-push event across browser contexts** —
  testing cross-context SSE/WebSocket behavior requires a dedicated real-DB
  Playwright project alongside the hermetic one. This delivered the previously
  carried "seeded-DB E2E variant" follow-up as a side effect.
- **SSE over WebSocket** for single-host server-push preserved the `createApp()`
  supertest seam, required no Vite proxy change, and got native reconnection for
  free — the single most impactful technical choice in the task.

Reference: `memory-bank/reflection/reflection-TASK-007.md`

## References
- Plan + Execution State: `memory-bank/tasks/TASK-007.md`
- Reflection: `memory-bank/reflection/reflection-TASK-007.md`
- Architecture creative: `memory-bank/creative/TASK-007-board-interactivity-architecture.md`
- UI/UX creative: `memory-bank/creative/TASK-007-board-interactivity-uiux.md`
- Progress (per-phase summaries): `memory-bank/progress.md`
- Roadmap feature: FEAT-007 in `memory-bank/roadmap.md`

## Follow-up

Non-blocking items carried forward from the reflection:
1. SSE settle timing in `realtime.spec.ts` — replace the fixed 700ms await with a
   server `ready`/`connected` signal or a subscriber-count poll for determinism.
2. Move the realtime `webServer` `e2e-db-setup.mjs &&` chain into a Playwright
   `globalSetup` for cleaner separation.
3. `banyanboard_e2e` accumulates boards across reused-server local runs (harmless,
   id-scoped) — add a periodic `TRUNCATE` / `afterAll` cleanup.
4. OpenAPI spec (carried since FEAT-004/005 → TASK-006) — now covers 10+ REST
   endpoints plus the SSE events route; recommend a dedicated Level 2 task.
5. Multi-stage Dockerfile (carried from TASK-006) — `SERVE_CLIENT=true` path is
   proven by both Playwright projects.
6. Prune `ErrorMessage.backLink` prop (carried from TASK-006) — Level 1 cleanup.
7. `node-pg-migrate` dev-tree audit triage (19 moderate / 2 high — carried from
   TASK-004 through TASK-007) — triage before any production deployment.
