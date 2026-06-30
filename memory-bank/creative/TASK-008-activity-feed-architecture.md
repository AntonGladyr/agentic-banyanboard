# Architecture Decision: Realtime Activity Feed (backend / delivery / persistence)

**Created**: 2026-06-30
**Status**: DECIDED
**Decision Type**: Architecture
**Task**: TASK-008 (FEAT-008) — Level 3
**Scope of this doc**: The four backend/delivery/persistence questions flagged in TASK-008 § Creative Exploration Needed (Q3 SSE delivery, Q5 `from_status` capture, envelope shape, Q4 retention). UI/UX layout is a separate creative phase (creative-uiux-agent) and is out of scope here.

---

## Context

### System Requirements

- Record an `activity_events` row whenever a card's `status` changes via `PATCH /api/v1/boards/:boardId/cards/:id` (`src/routes/cards.ts:117-136`) — and **only** on a real status change (title/description/position-only edits record nothing — AC-ACTIVITY-ONLY-MOVES-1).
- Snapshot `card_title` at move time so the feed survives card rename/deletion (AC-PERSIST-CARD-DELETE-1).
- Expose `GET /api/v1/boards/:boardId/activity` → JSON array ordered `occurred_at DESC` (AC-HAPPY-3, AC-SCOPED-1, AC-ERROR-1, AC-ERROR-2).
- Deliver each new activity event live to **all** connected tabs over the existing FEAT-007 SSE channel `GET /api/v1/boards/:boardId/events` — including the originating tab (AC-HAPPY-2.2; activity entries are NOT subject to the `card:updated` echo de-dup).
- Reuse the FEAT-007 transport (`broadcaster.ts`, `eventsRouter.ts`, `notify.ts`, `useRealtimeBoard.ts`) — do not stand up new infrastructure (TASK-008 § Dependencies).

### Technical Constraints

- Single Express + TypeScript process, single PostgreSQL host, `docker compose up`; no microservices, no external broker (productBrief § Technical Constraints; systemPatterns GP4).
- In-process pub/sub hub only — `Map<boardId, Set<Subscriber>>` (`broadcaster.ts:24`). Delivery is board-scoped; events published for board X reach only board X subscribers.
- `EventSource` cannot set custom request headers, so the per-tab origin token rides `?clientId=` (`eventsRouter.ts:53`, `useRealtimeBoard.ts:62`). Echo de-dup keys on `originId` carried in the event body (`useRealtimeBoard.ts:73`).
- Migrations follow the `node-pg-migrate` JS pattern (`migrations/1781985941842_add-status-to-cards.js`): no DB CHECK/ENUM; allowed-value enforcement lives in the app validate-before-DB layer.
- DAL discipline (`src/db/cards.ts`): parameterized queries only (`$1, $2…`), no validation/HTTP concerns, reads return `null`/`[]` rather than throwing.
- No auth, no `req.user`; actor is the fixed `'anonymous'` stub for v1 (TASK-008 § Actor Identity, DECIDED).

### Non-Functional Requirements

- `GET .../activity` p95 < 150 ms (productBrief § Performance, API reads). PATCH (write) p95 < 300 ms.
- 1–20 concurrent users, single team, flat growth; hundreds of cards/board, tens of boards (productBrief § Scalability).
- Observability-first (GP2/GP3): all new backend code logs via `req.log` (pino child), never `console.*`; AC-OBS-1 requires a structured `{cardId, boardId, fromStatus, toStatus}` line on the move path.
- No internal error detail leaked (GP5); errors via the centralized `errorHandler` (`{error, path, traceId}`).
- Activity recording must NEVER fail or slow the card PATCH it rides on (mirror the fire-and-forget defensiveness of `notify.ts`).

### Existing Patterns That Must Be Respected

- **Domain Event Pattern** (systemPatterns.md): card actions emit domain events `{timestamp, actor, action type, card ID, before/after state}`; in-process emitter for v1. The activity event IS a materialization of this pattern (it persists before/after state — `from_status`/`to_status` — plus an actor and a card-id).
- **Full-entity, board-scoped realtime events** (`events.ts` header; FEAT-007 Decision 2): each SSE event carries a full entity so subscribers swap by `id`. The activity event extends this — it carries the full activity row.
- **Echo de-dup via `originId`** (FEAT-007 Decision 3 / R5): `card:updated` carries `originId` so the originator drops its own echo. Activity events deliberately **break** this for AC-HAPPY-2.2.
- **Fire-and-forget notify seam** gated by `config.realtimeEnabled` (`notify.ts:24-35`).
- **Router-per-domain mounted in the composition root** (`routes/index.ts`), `Router({ mergeParams: true })`, `validateId`, pre-flight `findBoardById` → `notFoundError` (cards/boards routers).

---

## Component Analysis

### Core Components

| Component | Purpose | Responsibilities |
|-----------|---------|------------------|
| `migrations/<ts>_create-activity-events-table.js` (new) | Schema | Create `activity_events` table + index `(board_id, occurred_at DESC, id DESC)`; `node-pg-migrate` JS pattern; reversible `down` |
| `src/db/activity.ts` (new) | DAL | `ActivityEvent` interface, `insert(params)`, `listByBoard(boardId)`; parameterized queries only; mirrors `src/db/cards.ts` |
| `src/realtime/events.ts` (extend) | Event contract | Add `'activity:card_moved'` to `RealtimeEventType`; add `ActivityCardMovedEvent` interface (no `originId`) |
| `src/realtime/notify.ts` (extend) | Mutation→broadcast bridge | Add `notifyCardMoved(boardId, activityRow, req)`; build envelope with **no** `originId`; fire-and-forget, gated, defensive |
| `src/routes/activity.ts` (new) | Read HTTP | `Router({ mergeParams:true })`, `GET /`; `validateId`, pre-flight `findBoardById` → 404, `listByBoard`, 200 JSON array |
| `src/routes/cards.ts` PATCH (extend) | Recording injection point | Capture `from_status` (pre-flight `findById`), insert activity row on real status change, emit AC-OBS-1 log, call `notifyCardMoved` |
| `src/routes/index.ts` (extend) | Composition root | Mount `apiRouter.use('/boards/:boardId/activity', activityRouter)` |
| `client/src/api/types.ts`, `useRealtimeBoard.ts`, `apiClient.ts` (extend) | Frontend contract/transport | Mirror the new event type + `ActivityEvent`; route `activity:card_moved` → `onActivityEvent`; `getActivity()` fetch |

### Component Interactions

```
PATCH /boards/:boardId/cards/:id
  └─ validateId, validateUpdate                          (unchanged)
  └─ [NEW] before  := findById(id)        (pre-flight read; capture before.status)
  └─ after := update(id, input)           (unchanged; existing 404 + card:updated path preserved)
  └─ res.json(after)                      (unchanged — response sent FIRST)
  └─ notifyCardChange('card:updated', …)  (unchanged; carries originId → echo-deduped)
  └─ [NEW] if input.status && before && before.status !== after.status:
         row := activity.insert({ board_id, card_id:id, card_title: after.title,
                                  from_status: before.status, to_status: after.status,
                                  actor:'anonymous' })
         req.log.info({cardId, boardId, fromStatus, toStatus}, 'card moved')   (AC-OBS-1)
         notifyCardMoved(boardId, row, req)   →  publish(boardId, {type:'activity:card_moved', activity:row, …NO originId})
                                                    └─ broadcaster fan-out to EVERY subscriber of boardId
                                                          └─ EventSource → useRealtimeBoard.handle()
                                                                └─ originId undefined ⇒ never echo-dropped ⇒ onActivityEvent (ALL tabs)

GET /boards/:boardId/activity
  └─ validateId, pre-flight findBoardById → 404
  └─ activity.listByBoard(boardId)   →  SELECT … WHERE board_id=$1 ORDER BY occurred_at DESC, id DESC
  └─ 200 JSON array
```

---

## Question 1 (TASK-008 Q3) — SSE delivery approach

### Options Explored

#### Option 1A: New `activity:card_moved` event type on the **existing** board channel — CHOSEN

- **Description**: Add `'activity:card_moved'` to the `RealtimeEventType` union (`events.ts:17`, mirrored in `client/src/api/types.ts:101`), broadcast it via the existing `broadcaster.publish(boardId, event)` on the same `GET /api/v1/boards/:boardId/events` stream, and register one more `addEventListener` in `useRealtimeBoard`.
- **Components**: `events.ts` (union + interface), `notify.ts` (`notifyCardMoved`), `broadcaster.ts` (unchanged — already type-agnostic), `eventsRouter.ts` (unchanged — `frame()` already serializes any `RealtimeEvent` by `event.type`/`event.emittedAt`), `useRealtimeBoard.ts` (+1 listener + `onActivityEvent`).
- **Pros**:
  - Zero new transport: `broadcaster.publish` and `eventsRouter.frame()` are already generic over `RealtimeEvent` (`broadcaster.ts:53`, `eventsRouter.ts:39-41`). The only backend change is a union member + a notify helper.
  - One connection per board tab (the existing `EventSource`), one Vite proxy entry, one keep-alive timer — no extra socket budget, no second reconnect/backoff surface.
  - Naturally board-scoped and ordering-coherent with `card:updated` on the same stream (a move's card-state event and its activity event arrive on the same ordered channel).
  - Matches FEAT-007 Decision 2 (full-entity events) and the additive-union extension style already used for `card:created/updated/deleted/board:updated`.
- **Cons**:
  - The activity event shares the channel with card-state events, so the frontend `handle()` must branch on `type` (already does — `useRealtimeBoard.ts:76`).
  - A consumer that only wants activity still receives card-state events (irrelevant for v1 — the board view consumes both).
- **Technical Fit**: High — it is the additive pattern the codebase already uses.
- **Complexity**: Low.
- **Scalability**: High (for the ≤20-user target; same hub).

#### Option 1B: Separate SSE endpoint `GET /api/v1/boards/:boardId/activity/events`

- **Description**: A dedicated activity stream with its own router and its own subscriber registry (or a second `Map`).
- **Pros**: Clean separation; an activity-only consumer subscribes to only what it needs.
- **Cons**:
  - Duplicates the entire transport: a second SSE route (headers, keep-alive, subscribe/unsubscribe, close handling), a second `EventSource` per tab, a second Vite proxy concern, a second reconnect surface, and a second `broadcaster` channel namespace — directly violates "reuse, don't re-implement" (TASK-008 § Dependencies) and GP4 (complexity only when it earns its keep).
  - Doubles the connection count per tab for zero benefit at this scale.
  - Cross-stream ordering between a card move and its activity entry is no longer guaranteed.
- **Technical Fit**: Low. **Complexity**: High. **Scalability**: Medium (more sockets, no upside).

### Evaluation Matrix — Q1

| Criteria | 1A (same channel) | 1B (separate endpoint) |
|----------|-------------------|------------------------|
| Scalability | High | Medium |
| Maintainability | High | Low |
| Performance | High | Medium |
| Observability | High (one channel, one log surface) | Medium |
| Implementation Cost | Low | High |
| Pattern fit | High | Low |

### **Chosen**: Option 1A — new `activity:card_moved` event type on the existing `/events` channel.

**Rationale**: The broadcaster (`broadcaster.ts:53`) and the SSE framing (`eventsRouter.ts:39`) are already generic over `RealtimeEvent`. Adding a union member is additive and rides 100% of FEAT-007 infrastructure — no new socket, proxy, keep-alive, or reconnect code. A separate endpoint (1B) would re-implement the transport TASK-008 explicitly says to reuse, doubling connections for no benefit at the ≤20-user scale. This confirms the task's stated strong preference for option (a).

---

## Question 2 (TASK-008 Q5) — `from_status` capture mechanism

The current PATCH handler (`cards.ts:124`) calls `update(id, input)` and uses only the returned (post-update) row. To record `from_status` we need the pre-update status.

### Options Explored

#### Option 2A: Pre-flight `findById(id)` read before `update()` — CHOSEN

- **Description**: Read the card first (`const before = await findById(id)`), then `update()`, then compare `before.status` vs the returned row's status. Mirrors exactly what the existing DELETE handler already does (`cards.ts:147` reads the card before `remove()` so the realtime event can carry the full entity).
- **Pros**:
  - **Precedent already in the file** — the DELETE path does the identical pre-flight read for the same realtime-payload reason (`cards.ts:145-150`). Zero new pattern.
  - Pure DAL reuse: `findById` already exists (`src/db/cards.ts:91`); no SQL change, no new query to test.
  - Keeps recording logic in the application layer (testable with supertest against `createApp()` — the project's established test seam), consistent with validate-before-DB and "API is the sole writer."
  - The pre-flight also lets the handler short-circuit cleanly when the card is absent (the existing `update()→null→404` path is unaffected; both reads agree).
- **Cons**:
  - One extra DB round-trip on PATCH (two queries: SELECT then UPDATE).
- **Technical Fit**: High. **Complexity**: Low. **Scalability**: High (see NFR analysis).

#### Option 2B: DB-level trigger on `cards` UPDATE that inserts into `activity_events`

- **Description**: A Postgres trigger comparing `OLD.status`/`NEW.status` and inserting an activity row.
- **Pros**: No app round-trip; recording is atomic with the update.
- **Cons**:
  - Hides domain logic in the database — the trigger cannot snapshot the *frontend-meaningful* actor (`'anonymous'` today, a session user later) without plumbing app context into the DB session (`SET LOCAL`), and cannot emit the AC-OBS-1 `req.log` line or the SSE broadcast (the broadcast still has to happen in-process). So a trigger does NOT remove the need for app-side code — it just splits the logic across two tiers.
  - Migrations in this project deliberately avoid DB-side logic (no CHECK/ENUM — `migrations/1781985941842…`); a trigger is a sharp departure from the established "app is the single source of truth" stance.
  - Harder to test in the supertest/integration style the project uses; couples behavior to DB internals.
- **Technical Fit**: Low. **Complexity**: High. **Scalability**: High but at a maintainability cost.

#### Option 2C: Single-statement CTE with `RETURNING` old + new

- **Description**: One SQL statement, e.g. `WITH prev AS (SELECT status FROM cards WHERE id=$1) UPDATE cards SET … FROM prev WHERE cards.id=$1 RETURNING cards.*, prev.status AS prev_status`.
- **Pros**: Single round-trip; atomic snapshot of old+new; technically the most efficient.
- **Cons**:
  - Requires changing `src/db/cards.ts update()` (or adding a parallel `updateReturningPrevious()`), complicating the cleanly-shaped dynamic-SET builder (`cards.ts:105-134`) and its tests, for a path whose cost the NFR budget easily absorbs.
  - Mixes activity concerns into the generic card-update query — the DAL would now carry move-feed-specific shape.
  - Over-engineering for ≤20 users (GP4): buys a saved round-trip that the p95 budget does not need.
- **Technical Fit**: Medium. **Complexity**: Medium. **Scalability**: High.

### NFR check (the deciding factor)

The PATCH write budget is p95 < 300 ms. On a single local PostgreSQL host, a primary-key `SELECT … WHERE id=$1` is sub-millisecond. The extra round-trip is ~0.2–1 ms of additional latency on a 300 ms budget at ≤20 concurrent users — negligible. Note the **read** NFR (p95 < 150 ms) does NOT apply to this path; it applies to `GET .../activity`, which is unaffected by the capture mechanism. The activity `insert` itself is also fire-and-forget-able relative to the response (the response is sent before recording — see Implementation Guidelines), so it does not even sit on the PATCH critical path that the client waits on.

### Evaluation Matrix — Q2

| Criteria | 2A (pre-flight read) | 2B (trigger) | 2C (CTE RETURNING) |
|----------|----------------------|--------------|--------------------|
| Performance (write p95<300ms) | High (1 extra sub-ms read) | High | High |
| Maintainability | High (existing precedent) | Low | Medium |
| Testability (supertest) | High | Low | Medium |
| Pattern fit (app-as-writer, no DB logic) | High | Low | Medium |
| Implementation Cost | Low | High | Medium |

### **Chosen**: Option 2A — pre-flight `findById(id)` read.

**Rationale**: It reuses an existing DAL function and an existing same-file precedent (the DELETE handler's pre-flight read at `cards.ts:147`), keeps all recording logic in the testable application layer, and respects the project's "no DB-side logic" stance. The single extra primary-key read is negligible against the 300 ms write budget at ≤20 users, so the round-trip savings of 2B/2C are not worth their maintainability and testability costs (GP4). This confirms the approach the task plan and § Dependencies & Risks already lean toward.

---

## Question 3 — Activity-event envelope shape (no `originId`)

### Requirement

`card:updated` carries `originId` so the originating tab drops its own echo (`useRealtimeBoard.ts:73`) — that tab already applied the move optimistically. The **activity** event is different: the originator MUST see its own activity entry appear in the feed (AC-HAPPY-2.2), because the feed is not optimistically pre-populated by the mover. Therefore the activity envelope must carry **no `originId`**, so the de-dup guard `event.originId !== undefined && event.originId === originId` (`useRealtimeBoard.ts:73`) is never satisfied for it and the event is delivered to every tab including the originator.

### Options Explored

- **Option 3A (CHOSEN)**: A new `ActivityCardMovedEvent` interface that shares the realtime base fields (`type`, `boardId`, `emittedAt`, `traceId`) but **omits `originId`** and carries the full activity row under `activity`. `originId` is `readonly originId?` on the base, so omission is type-legal and semantically explicit ("server-internal, not echo-deduped" — same `undefined` semantics already documented for board-internal mutations in `events.ts:31-32`).
- **Option 3B (rejected)**: Reuse `originId` but special-case the frontend to skip de-dup for `type === 'activity:card_moved'`. Rejected — it puts a fragile, type-specific exception inside the generic `handle()` de-dup guard, and a future refactor of the guard could silently re-suppress activity events. Designing the absence of `originId` into the envelope makes the "never deduped" property structural, not conditional.

### **Chosen**: Option 3A — dedicated envelope, no `originId`.

**Backend interface** (`src/realtime/events.ts`):

```ts
export type RealtimeEventType =
  | 'card:created'
  | 'card:updated'
  | 'card:deleted'
  | 'board:updated'
  | 'activity:card_moved';   // NEW — recorded card-move, delivered to ALL tabs (no echo de-dup)

/**
 * A recorded card move. Carries the full activity row. Deliberately has NO `originId`:
 * the originating tab MUST see its own activity entry (AC-HAPPY-2.2), unlike card:updated.
 */
export interface ActivityCardMovedEvent extends RealtimeEventBase {
  readonly type: 'activity:card_moved';
  readonly activity: ActivityEvent;   // imported from ../db/activity
  // originId intentionally never set — never echo-deduped.
}

export type RealtimeEvent = CardEvent | BoardEvent | ActivityCardMovedEvent;
```

`RealtimeEventBase.originId` stays optional, so `ActivityCardMovedEvent` simply never sets it. `eventsRouter.frame()` (`eventsRouter.ts:39`) already serializes any `RealtimeEvent` via `event.type` and `event.emittedAt` — no transport change.

**Frontend mirror** (`client/src/api/types.ts`): add `'activity:card_moved'` to `RealtimeEventType`, add an `ActivityEvent` row interface (timestamps as ISO strings), add `ActivityRealtimeEvent` to the `RealtimeEvent` union, and in `useRealtimeBoard.ts` add `'activity:card_moved'` to `REALTIME_EVENT_TYPES`, add `onActivityEvent` to `RealtimeHandlers`, and branch in `handle()` (the existing `originId` guard at line 73 leaves it untouched because `originId` is `undefined`).

**How it differs from `card:updated`**: `card:updated` carries `card: Card` + `originId` (echo-deduped → originator drops it). `activity:card_moved` carries `activity: ActivityEvent` + **no `originId`** (never deduped → originator keeps it). Both are board-scoped, full-payload, and ride the same channel.

---

## Question 4 (TASK-008 Q4) — Retention strategy

`activity_events` grows unbounded. Options below; the choice affects migration schema and the `listByBoard` query.

### Options Explored

#### Option 4A: No pruning in v1 (bounded read, unbounded store) — CHOSEN

- **Description**: Persist all events; never prune in v1. Cap only what the API/feed returns by adding a `LIMIT` to `listByBoard` (e.g. `LIMIT 200`) so the read NFR and the feed render stay bounded even as the table grows.
- **Pros**:
  - Simplest correct option (GP4); no scheduler, no migration-time retention column, no background job in a single-process MVP that has no cron tier.
  - Matches productBrief data-volume reality: ≤20 users, hundreds of cards/board, tens of boards, flat growth → at a few moves per card the table is in the low tens-of-thousands of rows for the life of a deployment. With the `(board_id, occurred_at DESC, id DESC)` index, an index-ordered `LIMIT 200` scan is sub-millisecond regardless of total table size — the p95 < 150 ms read NFR is met by the index + LIMIT, not by pruning.
  - Preserves full history (productBrief § Data Retention: "No automatic deletion; user manages their own data") — pruning would actively contradict the product's stated data stance.
  - Forward-compatible: time-based pruning (4C) can be added later as a pure operational concern (a `DELETE … WHERE occurred_at < now() - interval` run by the maintainer / future job) with **no schema change**, because `occurred_at` is already indexed.
- **Cons**:
  - Table grows monotonically (acceptable: bounded by usage scale; disk on a self-hosted single host is the operator's concern, and `pg_dump`/drop is the documented data-management path — productBrief § Backup/Right-to-Deletion).
  - The feed shows at most the latest 200; older entries are queryable only if pagination is added later (explicitly out of scope for v1 — TASK-008 § Out of scope).
- **Technical Fit**: High. **Complexity**: Low. **Scalability**: High for target scale.

#### Option 4B: Keep last N events per board (e.g. 100)

- **Description**: After each insert, delete rows beyond the newest N for that board.
- **Pros**: Hard bound on storage.
- **Cons**: Adds a delete-on-write step to the move path (a windowed `DELETE … WHERE id NOT IN (SELECT id … ORDER BY occurred_at DESC LIMIT N)`), making the hot path more complex and contention-prone; permanently discards history (contradicts § Data Retention); the storage it saves is irrelevant at this scale. Over-engineering (GP4).
- **Technical Fit**: Low. **Complexity**: Medium. **Scalability**: High but unneeded.

#### Option 4C: Time-based retention (e.g. 30 days)

- **Description**: Periodically delete events older than 30 days.
- **Pros**: Predictable, bounded store; familiar pattern.
- **Cons**: Requires a scheduler/cron tier that does not exist in this single-process MVP (would need a new background-job mechanism — new infra, against GP4 and "no microservices"); destroys history younger users may want; unnecessary at flat ≤20-user growth. **Crucially, 4A does not preclude 4C later** — `occurred_at` is indexed, so a time-based purge is a future additive operational step with no migration.
- **Technical Fit**: Medium. **Complexity**: High (new scheduling tier). **Scalability**: High but unneeded now.

### Evaluation Matrix — Q4

| Criteria | 4A (no prune + read LIMIT) | 4B (last N/board) | 4C (time-based) |
|----------|----------------------------|-------------------|-----------------|
| Read p95 < 150 ms | High (index + LIMIT) | High | High |
| Maintainability | High | Medium | Low |
| Respects § Data Retention | High (keeps history) | Low | Low |
| New infra needed | None | None | Scheduler (new) |
| Implementation Cost | Low | Medium | High |
| Forward-compat to add pruning later | High (no schema change) | n/a | — |

### **Chosen**: Option 4A — no pruning in v1; bound the **read** with `LIMIT`, not the **store**.

**Rationale**: At ≤20 users with flat growth, the table stays small for the deployment's life; the read NFR is satisfied by the `(board_id, occurred_at DESC, id DESC)` index plus a `LIMIT` on `listByBoard`, so pruning buys nothing while contradicting productBrief's "no automatic deletion" stance. It is the simplest correct design (GP4) and remains forward-compatible: time-based pruning can be added later as a pure operational step against the already-indexed `occurred_at`, with no migration. **Schema/query impact**: the migration needs no retention column; `listByBoard` adds `ORDER BY occurred_at DESC, id DESC LIMIT <N>` (recommend N=200; tie-break on `id DESC` so events sharing an `occurred_at` millisecond order deterministically).

---

## Observability Architecture

### Logging

- **Library**: existing `pino` wrapper (`src/observability/logger.ts`); request-scoped child via `req.log` (bound `traceId`/`spanId`). **No `console.*`** (GP3).
- **Recording path (AC-OBS-1)**: on a recorded move, emit `req.log.info({ cardId, boardId, fromStatus, toStatus }, 'card moved')`. The existing `req.log.info({ cardId }, 'card updated')` line (`cards.ts:128`) stays.
- **Read endpoint**: inherits the standard one-line access log from `requestLogger` (`{method, path, statusCode, durationMs}`) — no extra logging needed.
- **Broadcast**: the existing `publishSafely` logs `'realtime event published'` with `{boardId, type:'activity:card_moved', subscribers}` (`notify.ts:30`) — reused unchanged.
- **Format/Output/Level**: JSON→stdout, `LOG_LEVEL`/`LOG_FORMAT`/`LOG_OUTPUT` already wired in `env.ts` (config-only knobs). No new logging config.

### Distributed Tracing

- **SDK / standard**: existing `extractTraceContext` (W3C Trace Context) per FEAT-007; `req.traceId` is already bound by `requestLogger`.
- **Propagation across boundaries**:

  | From | To | Protocol | Propagation method |
  |------|-----|----------|--------------------|
  | Card PATCH request | activity insert + broadcast | in-process | `req.traceId` carried into the event envelope (`traceId`) and the `'card moved'` log line |
  | Broadcaster | SSE subscriber | SSE (`text/event-stream`) | `traceId` is a field in the JSON `data:` payload (logged-only on the client — never surfaced, GP5) |

- **Sampling**: reuses existing `OTEL_TRACES_SAMPLER_ARG`; no change. `initTracing()` no-op seam unchanged.

### Metrics

- **Deferred** — consistent with the project (no `/metrics` endpoint yet; systemPatterns § Observability Conventions). The broadcaster already exposes `connectionCount()` (`broadcaster.ts:75`) for a future gauge. Future candidate (when metrics land): `banyanboard_activity_events_total{board_id}` — but `board_id` as a label risks cardinality; prefer an unlabeled counter per the cardinality guidance.

### Configuration Variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `REALTIME_ENABLED` (reused) | Master switch; gates `notifyCardMoved` exactly as `notifyCardChange` | true |
| `LOG_LEVEL` (reused) | Log verbosity | info |
| `OTEL_SERVICE_NAME` (reused) | Service identifier in traces | — |

**No new environment variables** — the feature rides `config.realtimeEnabled` and the existing logging/tracing config (TASK-008 § Observability Requirements).

---

## Decision Summary

| # | Question | Decision |
|---|----------|----------|
| Q1 (Q3) | SSE delivery | **1A** — add `'activity:card_moved'` to the existing `RealtimeEventType` union; broadcast on the existing `/events` channel. Confirmed strongly preferred. |
| Q2 (Q5) | `from_status` capture | **2A** — pre-flight `findById(id)` read before `update()` (mirrors the DELETE handler precedent; negligible vs 300 ms write budget). |
| Q3 | Envelope shape | **3A** — dedicated `ActivityCardMovedEvent` carrying the full `activity` row with **no `originId`** → never echo-deduped → originator sees its own entry (AC-HAPPY-2.2). |
| Q4 (Q4) | Retention | **4A** — no pruning in v1; bound the **read** with `LIMIT 200` + the `(board_id, occurred_at DESC, id DESC)` index. Forward-compatible with later time-based purge (no schema change). |

### Trade-offs Accepted

- **One extra DB read per PATCH (Q2A)**: a sub-millisecond primary-key SELECT on a 300 ms write budget at ≤20 users — accepted for DAL reuse, app-layer testability, and an existing same-file precedent.
- **Unbounded store, bounded read (Q4A)**: table grows monotonically; acceptable because growth is flat and bounded by ≤20-user usage, the read stays fast via index+LIMIT, and the product's stated stance is "no automatic deletion." Older-than-200 entries are not feed-visible in v1 (pagination is out of scope).
- **Activity event shares the channel with card-state events (Q1A)**: the frontend branches on `type` (already does) — accepted for full transport reuse.

---

## Implementation Guidelines

1. **Migration** (`migrations/<ts>_create-activity-events-table.js`, `node-pg-migrate` JS pattern, reversible):
   - `pgm.createTable('activity_events', { id: 'id' /* serial PK */, board_id: { type:'integer', notNull:true, references:'boards', onDelete:'CASCADE' }, card_id: { type:'integer', notNull:true /* NO FK — survives card delete */ }, card_title: { type:'varchar(255)', notNull:true /* snapshot */ }, from_status: { type:'varchar(20)', notNull:true }, to_status: { type:'varchar(20)', notNull:true }, actor: { type:'varchar(255)', notNull:true, default:'anonymous' }, occurred_at: { type:'timestamptz', notNull:true, default: pgm.func('now()') } })`.
   - `pgm.createIndex('activity_events', ['board_id', { name:'occurred_at', sort:'DESC' }, { name:'id', sort:'DESC' }])` — backs `listByBoard` ordering + p95 < 150 ms. No CHECK/ENUM (validate-before-DB, mirrors `add-status-to-cards`). `down` drops the table.

2. **DAL** (`src/db/activity.ts`, mirrors `src/db/cards.ts`; parameterized only):
   - `export interface ActivityEvent { readonly id:number; readonly board_id:number; readonly card_id:number; readonly card_title:string; readonly from_status:string; readonly to_status:string; readonly actor:string; readonly occurred_at:Date; }`
   - `export interface InsertActivityParams { board_id:number; card_id:number; card_title:string; from_status:string; to_status:string; actor?:string; }` (actor defaults to `'anonymous'` — let the column default apply or pass explicitly).
   - `export async function insert(params: InsertActivityParams): Promise<ActivityEvent>` — `INSERT INTO activity_events (board_id, card_id, card_title, from_status, to_status, actor) VALUES ($1,$2,$3,$4,$5, COALESCE($6,'anonymous')) RETURNING <cols>`.
   - `export async function listByBoard(boardId: number): Promise<ActivityEvent[]>` — `SELECT <cols> FROM activity_events WHERE board_id=$1 ORDER BY occurred_at DESC, id DESC LIMIT 200` (returns `[]` when none).

3. **Events contract** (`src/realtime/events.ts`): add the union member + `ActivityCardMovedEvent` interface exactly as in Q3 above; extend the `RealtimeEvent` union. Mirror in `client/src/api/types.ts`.

4. **Notify** (`src/realtime/notify.ts`): add
   ```ts
   export function notifyCardMoved(boardId: number, activity: ActivityEvent, req: Request): void {
     const event: ActivityCardMovedEvent = {
       type: 'activity:card_moved',
       boardId,
       activity,
       emittedAt: new Date().toISOString(),
       traceId: req.traceId,
       // NO originId — never echo-deduped (AC-HAPPY-2.2)
     };
     publishSafely(boardId, event, req);   // reuses the existing gated/defensive helper
   }
   ```

5. **Cards PATCH handler** (`src/routes/cards.ts:117-136`) — precise change (must NOT alter existing behavior, response, or the `card:updated` broadcast):
   ```ts
   const input = validateUpdate(req.body);
   const before = await findById(id);          // NEW: pre-flight read (mirrors DELETE path)
   const card = await update(id, input);
   if (card === null) { throw notFoundError(`card ${id} not found`); }
   req.log.info({ cardId: id }, 'card updated');   // unchanged
   res.status(200).json(card);                      // unchanged — response sent FIRST
   notifyCardChange('card:updated', boardId, card, req);   // unchanged (echo-deduped)
   // NEW — record + broadcast the move only on a real status change, AFTER the response:
   if (input.status !== undefined && before !== null && before.status !== card.status) {
     const row = await insert({                       // src/db/activity.ts
       board_id: boardId, card_id: id, card_title: card.title,
       from_status: before.status, to_status: card.status,
     });
     req.log.info({ cardId: id, boardId, fromStatus: before.status, toStatus: card.status }, 'card moved'); // AC-OBS-1
     notifyCardMoved(boardId, row, req);
   }
   ```
   Note: recording is inside the existing `try/catch` so any failure forwards to `errorHandler` — but it runs after `res.json`, so a recording failure cannot corrupt the already-sent 200 (mirrors the fire-and-forget posture of the broadcast). Guard `before !== null` defends the race where the row vanished between read and update.

6. **Read router** (`src/routes/activity.ts`, mirrors cards read handlers): `Router({ mergeParams:true })`; `GET '/'` → `validateId(req.params.boardId)`, pre-flight `findBoardById(boardId)` → `notFoundError` (404), `listByBoard(boardId)`, `res.status(200).json(rows)`; invalid id → 400 via `validateId`/`errorHandler` (AC-ERROR-1/2).

7. **Mount** (`src/routes/index.ts`): `apiRouter.use('/boards/:boardId/activity', activityRouter)` (distinct segment from `/cards` and `/events` — no conflict).

8. **Frontend**: `getActivity(boardId, signal)` in `apiClient.ts`; `onActivityEvent` in `useRealtimeBoard` `RealtimeHandlers` + `'activity:card_moved'` in `REALTIME_EVENT_TYPES` + a `type` branch in `handle()` (the existing `originId` guard leaves it untouched since `originId` is `undefined`).

---

## Validation Checklist

- [x] Meets all system requirements (record-on-status-change, snapshot, read endpoint, live delivery to all tabs)
- [x] Respects technical constraints (in-process broadcaster, no new infra, `node-pg-migrate` JS, parameterized DAL, anonymous actor)
- [x] Addresses NFRs (read p95 < 150 ms via index+LIMIT; write p95 < 300 ms with sub-ms extra read; WCAG is a UI/UX-phase concern)
- [x] Technically feasible — every change is additive over existing seams
- [x] Risks identified and acceptable (see below)
- [x] Complies with Guiding Principles (GP1 no new hardcoded config; GP2/GP3 `req.log` only, no `console.*`; GP4 simplest correct design — no trigger/scheduler; GP5 no internal detail leaked) — **no deviations**
- [x] Respects established patterns (Domain Event Pattern, full-entity board-scoped events, echo de-dup via `originId`, fire-and-forget notify, router-per-domain)
- [x] Observability architecture defined (AC-OBS-1 log line, trace correlation via `traceId` in envelope + log)
- [x] Trace context propagation across boundaries (request → in-process insert/broadcast → SSE payload)
- [x] Logging strategy consistent with observability standards (pino child, JSON, `traceId`)
- [x] Metrics strategy follows conventions (deferred, consistent with project; cardinality noted for future)

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Extra `findById` read regresses PATCH latency | Low | Low | Primary-key read, sub-ms at ≤20 users on 300 ms budget; runs off the response critical path (after `res.json`) |
| Activity event suppressed in originating tab by echo de-dup | Low | High | Envelope carries **no `originId`** by design (Q3); covered by AC-HAPPY-2.2 test in `useRealtimeBoard.test.ts` |
| Unbounded table growth | Medium | Low | Index + read `LIMIT 200`; flat ≤20-user growth; forward-compatible time-based purge (no schema change) on indexed `occurred_at` |
| Recording failure corrupts/blocks the card PATCH | Low | Medium | Recording runs AFTER `res.json`; insert failure cannot un-send the 200; broadcast already gated/defensive (`publishSafely`) |
| Activity row references a renamed/deleted card | High (by design) | Low | `card_title` snapshot + `card_id` with NO FK; AC-PERSIST-CARD-DELETE-1 |
| Race: card deleted between pre-flight read and update | Low | Low | `update()` returns null → existing 404 path; `before !== null` guard skips recording |

## Next Steps

1. **Phase 1 (persistence)**: migration `create-activity-events-table.js` (cols + `(board_id, occurred_at DESC, id DESC)` index), `src/db/activity.ts` DAL with `LIMIT 200` read, `src/db/activity.test.ts`.
2. **Phase 2 (recording + endpoint + broadcast)**: pre-flight `findById` capture in cards PATCH, `insert` on status change, `'activity:card_moved'` + `ActivityCardMovedEvent` in `events.ts`, `notifyCardMoved` in `notify.ts`, `src/routes/activity.ts` mounted in `routes/index.ts`, tests (route + extend `cards.test.ts` for AC-HAPPY-1, AC-ACTIVITY-ONLY-MOVES-1, AC-OBS-1, broadcast emitted).
3. **Phase 3 (frontend)**: mirror types, `getActivity`, `onActivityEvent` (no-`originId` routing), `ActivityFeed` per the UI/UX creative, wire into `BoardViewPage`.
4. Hand the UI/UX creative the constraint that the live entry arrives via `onActivityEvent` for ALL tabs (prepend newest-first).
