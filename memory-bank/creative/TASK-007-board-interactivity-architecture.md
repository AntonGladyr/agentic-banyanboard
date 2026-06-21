# Architecture Decision: Board Interactivity & Real-Time Collaboration

**Created**: 2026-06-21
**Status**: DECIDED
**Decision Type**: Architecture
**Task**: TASK-007 (FEAT-007) — Level 3
**Scope**: Backend/system-level decisions that gate implementation (Phases 1, 4, 5)

> This document resolves the five open architecture questions flagged in TASK-007
> § Creative Exploration Needed. The companion **UI/UX creative phase** owns form
> pattern, drag affordances, and real-time visual feedback — cross-references to that
> phase are called out under § Implications for UI/UX & Build.

---

## Context

### System Requirements

- **R1** — Push board/card mutations (create, update, status-change) live to every client currently viewing the *same* board, with no manual refresh (AC-REALTIME-1, AC-REALTIME-2).
- **R2** — Drag-and-drop a card between status columns and persist `status` via the existing `PATCH /api/v1/boards/:boardId/cards/:id`; revert the UI if the PATCH fails (AC-HAPPY-5, AC-ERROR-4).
- **R3** — Create/edit boards and cards via new write wrappers in `client/src/api/apiClient.ts` (the file is GET-only today — `apiClient.ts:86-99`), reusing the safe `ApiError` mapping (GP5).
- **R4** — Keyboard-accessible card movement (WCAG 2.1 SC 2.1.1) — drag-and-drop must have a non-pointer alternative.
- **R5** — A user's *own* mutation echoing back over the real-time channel must NOT double-apply (echo de-duplication).
- **R6** — The transport must not break the `createApp()` supertest-injectable factory seam (`src/app.ts:41`, systemPatterns § App factory split).

### Technical Constraints

- **C1 — Single host, ≤ 20 concurrent users** (productBrief § Scalability). No horizontal scaling, no external pub/sub broker (Redis), no multi-instance fan-out. In-process state is sufficient and correct.
- **C2 — Dev/prod parity behind two serving modes:**
  - Dev: Vite dev server at `:5173` proxies `/api/v1` + `/health` to Express at `:3000` (`client/vite.config.ts:31-35`). The proxy is HTTP-only today — no `ws: true`.
  - Prod: Express serves `client/dist` single-origin at `:3000` with `SERVE_CLIENT=true` (`src/app.ts:59-61`).
- **C3 — `createApp()` composition order is fixed** (`src/app.ts:44-70`): `requestLogger` → `/health` → `/api/v1` → optional SPA serving → `notFound` → `errorHandler`. `index.ts` is the *only* module that calls `app.listen` and touches `process` (`src/index.ts:42`).
- **C4 — Single config source** `src/config/env.ts` — the only module that reads `process.env`, parses at import time, fails fast, exports a frozen `config` (GP1). New env vars MUST land here.
- **C5 — Structured pino logging only**; zero `console.*` in backend production code (GP3). Every log line carries `traceId` (GP2). The per-request `requestLogger` (`src/middleware/requestLogger.ts`) binds `req.log`/`req.traceId` on `res.finish` — it does NOT cover long-lived connections.
- **C6 — GP5** — never leak `err.message`/`err.stack` or internal detail to clients; correlate via `traceId` only.
- **C7 — CommonJS backend** (`module: NodeNext`, no `"type":"module"`); Jest + ts-jest + supertest in-process. The browser tier is ESM (Vite). The `@dnd-kit` decision is a `client/package.json` (ESM) concern only.

### Non-Functional Requirements

- **NFR1** — Write p95 < 300 ms (productBrief). Real-time mutations ride the existing CRUD path; the broadcast is fire-and-forget and must not add to the request's critical path.
- **NFR2** — Real-time propagation latency < 2 s on localhost for ≤ 20 users.
- **NFR3** — WCAG 2.1 AA reasonable effort (R4).
- **NFR4** — No regressions to the existing test seam; new backend tests are real-time-only (TASK-007 § Test Strategy).

### Existing Patterns That MUST Be Respected

| Pattern | Source | Bearing on this design |
|---------|--------|------------------------|
| `createApp()` pure factory | `src/app.ts`, systemPatterns | Transport that mounts as a route preserves it; transport that needs the HTTP server does not |
| `req.log` / `req.traceId` augmentation | `src/middleware/requestLogger.ts`, `src/types/express.d.ts` | Broadcast call sites already have `req.log` + `req.traceId` for free |
| Mutation routers log business events | `boards.ts:54,103`; `cards.ts:73,125` | The broadcast hook wires in at exactly these lines |
| Scoped `express.json()` per router | `boards.ts:45`, `cards.ts:58` | Real-time route needs no body parser |
| Single config source + fail-fast | `src/config/env.ts` | `REALTIME_ENABLED` parsed here via existing `parseBool` |
| Safe `ApiError` category mapping | `apiClient.ts:34-84` | Write wrappers + the transport client reuse this mapping (GP5) |

---

## Component Analysis

### Core Components

| Component | Purpose | Responsibilities |
|-----------|---------|------------------|
| **`src/realtime/broadcaster.ts`** (new) | In-process pub/sub hub | Hold a `Map<boardId, Set<subscriber>>`; `subscribe(boardId, sink)` / `unsubscribe`; `publish(boardId, event)`; expose connection count. No Express/HTTP types — pure, unit-testable. |
| **`src/realtime/sseRoute.ts`** (new) | SSE transport endpoint | `GET /api/v1/boards/:boardId/events` → `text/event-stream`; registers the response as a subscriber, writes keep-alive comments, logs connection lifecycle via `req.log`, cleans up on `req.on('close')`. |
| **Mutation routers** (`boards.ts`, `cards.ts`) | Trigger broadcasts | After a successful create/update, call `broadcaster.publish(boardId, event)` — fire-and-forget, off the response critical path. |
| **`src/config/env.ts`** (extend) | Config | Add `REALTIME_ENABLED` (+ `REALTIME_KEEPALIVE_MS`), fail-fast parsed. |
| **`client/src/api/apiClient.ts`** (extend) | Write API | Add `sendJson` + `createBoard`/`updateBoard`/`createCard`/`updateCard`/`updateCardStatus`. |
| **`client/src/realtime/useRealtimeBoard.ts`** (new hook) | Frontend subscription | Open an `EventSource` to the events route; dispatch parsed events into board state; de-duplicate the client's own echo (R5); auto-reconnect (native `EventSource` behavior). |
| **`@dnd-kit/core` + `@dnd-kit/sortable`** (new dep) | Drag-and-drop | Pointer + keyboard sensors; column drop targets; emits the drop event the optimistic-update logic consumes. |

### Component Interactions

```
                 mutation (POST/PATCH)
  Browser  ───────────────────────────────▶  Express  /api/v1/boards|cards
  (Tab A)                                       │  validate → DB write → res.json(entity)   [unchanged]
                                                │  broadcaster.publish(boardId, event)      [NEW, fire-and-forget]
                                                ▼
                                        broadcaster (in-process)
                                        Map<boardId, Set<sseClient>>
                                                │  write `event:` frame to each subscriber
                                                ▼
  Browser  ◀───────────────────────────────  GET /api/v1/boards/:boardId/events  (text/event-stream, long-lived)
  (Tab B)     EventSource → useRealtimeBoard → apply event → React state → UI updates (< 2 s)
```

The broadcaster is the only shared mutable state. It is deliberately ignorant of HTTP: the SSE route adapts an Express `res` into a "subscriber sink", and the mutation routers call `publish`. This keeps the broadcaster unit-testable with a fake sink and keeps `createApp()` pure.

---

## Decision 1 — Real-Time Transport Mechanism

### Options Explored

#### Option 1: WebSocket (`ws` library, upgrade handler on the HTTP server)
- **Description**: Add the `ws` library; attach a `WebSocketServer({ noServer: true })` to `httpServer.on('upgrade', ...)` in `src/index.ts`. Clients open a `ws://` connection; the server broadcasts JSON frames board-scoped.
- **Architecture sketch**:
  ```
  index.ts:  const server = app.listen(...)
             server.on('upgrade', (req, socket, head) => wss.handleUpgrade(...))   ← outside createApp()
  ```
- **Pros**:
  - Bidirectional (not needed here, but available).
  - Lowest per-message overhead at high message rates (irrelevant at ≤ 20 users).
- **Cons**:
  - **Breaks the `createApp()` seam**: the upgrade handler lives on the HTTP server in `index.ts`, which tests never import (systemPatterns § Process-entry pattern). Real-time behavior becomes unreachable via supertest — it would need a separately-bound port in tests, contradicting NFR4 and the documented test seam.
  - **Dev-proxy wrinkle**: Vite's `server.proxy` must add `ws: true` for `/api/v1/.../events` (`vite.config.ts` change), and WS upgrade + path-rewrite behind a proxy is the documented Vite footgun this task explicitly flagged.
  - Reconnection is manual — `ws` has no built-in client reconnect; we'd hand-roll backoff.
  - New runtime dependency (`ws` + `@types/ws`).
- **Technical Fit**: Low (violates the factory seam). **Complexity**: High. **Scalability**: High (unneeded).

#### Option 2: Server-Sent Events (SSE — an Express `text/event-stream` route)  ◀ CHOSEN
- **Description**: A plain `GET /api/v1/boards/:boardId/events` route mounted *inside* `createApp()` under the existing `/api/v1` tree. Sets `Content-Type: text/event-stream`, keeps the response open, and writes `event:`/`data:` frames. The browser consumes it with the native `EventSource` API.
- **Architecture sketch**:
  ```
  routes/index.ts:  apiRouter.use('/boards/:boardId/events', eventsRouter)   ← inside createApp()
  EventSource(`/api/v1/boards/${id}/events`)  ← rides the existing HTTP proxy, no ws:true
  ```
- **Pros**:
  - **Preserves the `createApp()` seam fully** — it's just another `/api/v1` route, supertest-injectable like every other endpoint (R6, NFR4). Connection lifecycle is testable in-process.
  - **Zero Vite proxy changes** — SSE is plain HTTP; it rides the existing `/api/v1` proxy entry (`vite.config.ts:33`). Dev/prod parity is automatic (C2): same relative URL in dev (proxied) and prod (single-origin).
  - **Native browser reconnection** — `EventSource` auto-reconnects with `Last-Event-ID` resend support, no client backoff code (addresses the WebSocket reconnection con directly).
  - **No new runtime dependency** — SSE is hand-written response writes; `EventSource` is a browser built-in. (Backend adds nothing to `package.json`; frontend adds nothing either.)
  - `req.log` / `req.traceId` are already bound by `requestLogger` on the SSE request (`requestLogger.ts:37-38`), so connection-lifecycle logging is trace-correlated for free.
- **Cons**:
  - Unidirectional (server→client only). **Acceptable**: all client→server actions already go over the existing REST mutations; the channel only needs to push.
  - SSE has a per-browser connection cap (~6 over HTTP/1.1 per origin). **Acceptable**: a user views one board at a time = one connection; the cap is far above ≤ 20-user, single-board usage.
  - `res.finish` never fires for a long-lived stream, so the `requestLogger` access-log line won't emit until close — handled explicitly in § Observability.
- **Technical Fit**: High. **Complexity**: Low. **Scalability**: Medium (more than enough for C1).

#### Option 3: Long-polling (client re-requests on an interval / hanging GET)
- **Description**: Client polls `GET /api/v1/boards/:boardId/cards` (or a `?since=` delta endpoint) every N seconds; or a hanging GET that resolves on the next change.
- **Pros**:
  - Simplest possible transport; plain request/response; rides the HTTP proxy.
  - No long-lived connection bookkeeping (interval polling).
- **Cons**:
  - **Latency vs. load tradeoff fails NFR2 cleanly**: a 2 s poll interval risks exceeding the < 2 s budget under jitter; a tighter interval multiplies request volume (20 users × frequent polls = wasteful churn for a mostly-idle board).
  - Hanging-GET ("comet") variant reinvents SSE's long-lived connection with worse semantics and no reconnection/`Last-Event-ID` support — strictly inferior to Option 2.
  - Delta computation (`?since=`) adds server complexity that SSE event frames avoid.
- **Technical Fit**: Medium. **Complexity**: Low (interval) / Medium (hanging). **Scalability**: Low (request amplification).

### Evaluation Matrix (Transport)

| Criteria | Opt 1 WebSocket | Opt 2 SSE ◀ | Opt 3 Long-poll |
|----------|:---:|:---:|:---:|
| Preserves `createApp()` seam (R6) | ✗ Low | ✓ **High** | ✓ High |
| Dev/prod parity behind Vite proxy (C2) | ✗ Low (`ws:true`) | ✓ **High** (no change) | ✓ High |
| Browser reconnection handling | ✗ Low (manual) | ✓ **High** (native) | ✗ Low |
| Latency vs. NFR2 | High | **High** | Medium |
| New dependency footprint | `ws`+types | **none** | none |
| Implementation complexity | High | **Low** | Low–Med |
| Maintainability | Medium | **High** | Low |
| Observability ease | Medium | **High** (`req.log` bound) | Medium |

## Decision

**Chosen: Option 2 — Server-Sent Events, mounted as a `GET /api/v1/boards/:boardId/events` route inside `createApp()`.**

### Rationale
SSE is the only option that satisfies **all three** hard constraints simultaneously: it preserves the `createApp()` supertest seam (R6/C3) by mounting as an ordinary `/api/v1` route, it requires **zero** changes to the Vite proxy (C2 — it rides the existing `/api/v1` HTTP proxy entry, avoiding the `ws: true` footgun), and it gets robust reconnection from the native `EventSource` API for free. The traffic is fundamentally server-push of small JSON events to ≤ 20 single-board viewers — exactly SSE's sweet spot. WebSocket's only real advantage (bidirectionality, throughput) is unused here and is paid for with a broken test seam, a proxy change, and manual reconnection. Long-polling either misses the latency budget or amplifies request volume.

### Trade-offs Accepted
- **Unidirectional channel** — acceptable because every client→server action already flows over the existing REST mutations; the channel only pushes.
- **`res.finish` access-log line is deferred to connection close** — acceptable and explicitly handled with dedicated `connection open` / `connection closed` lifecycle logs (§ Observability).
- **SSE per-origin connection cap (~6 on HTTP/1.1)** — acceptable; single-board viewing uses one connection, far under the cap at this scale.

---

## Decision 2 — Event Schema & Scope

### Options Explored

- **Option A — Full updated entity per event** (lean): broadcast `{ type, boardId, card | board, originId }`; client replaces the matching entity in local state by `id`. ◀ CHOSEN
- **Option B — Delta/patch events**: broadcast only changed fields (`{ type, cardId, changes: { status } }`). Smaller payloads; more client merge logic and ordering hazards. Premature at this scale.
- **Option C — Full board snapshot on any change**: broadcast the entire board+cards on every mutation. Simplest client (replace everything) but violates AC-REALTIME-1's stub-detection ("only the moved card's column changes, other cards unaffected") and wastes bandwidth.

### Decision

**Chosen: Option A — full-entity, board-scoped events.** Delivery is **board-scoped**: a client subscribes to exactly one board's channel (`Map<boardId, Set<subscriber>>`), so a mutation on board X is never delivered to a viewer of board Y (AC-REALTIME-1 board-scoping; Phase-5 test). Payload carries the **full updated entity** the client swaps in by `id` — this directly satisfies AC-REALTIME-1's "only the moved card changes" stub-detection (Option C fails it) without the merge/ordering complexity of Option B (GP4 — complexity only when it earns its keep).

**Event type sketch** (shared contract; backend emits, `useRealtimeBoard` consumes — colocate in `client/src/api/types.ts` and mirror server-side):

```typescript
// Board-scoped real-time event envelope (SSE `data:` payload, JSON).
type RealtimeEventType =
  | 'card:created'
  | 'card:updated'   // covers edit AND drag-and-drop status change
  | 'card:deleted'   // emitted by existing DELETE paths; UI delete is out of scope but the
                     // backend broadcasts it for forward-compat / multi-tab correctness
  | 'board:updated';

interface RealtimeEventBase {
  type: RealtimeEventType;
  boardId: number;
  /**
   * Origin token of the client that caused this mutation, echoed back so that client can
   * de-duplicate its own event (Decision 3 / R5). Sent by the mutation request as a header;
   * omitted/undefined for server-internal mutations.
   */
  originId?: string;
  /** Server-side emission timestamp (ISO-8601), also used as the SSE event id. */
  emittedAt: string;
}

interface CardEvent extends RealtimeEventBase {
  type: 'card:created' | 'card:updated' | 'card:deleted';
  card: Card;            // full entity (id, board_id, title, description, status, position, updated_at)
}

interface BoardEvent extends RealtimeEventBase {
  type: 'board:updated';
  board: Board;          // full entity (id, name, description, updated_at)
}

type RealtimeEvent = CardEvent | BoardEvent;
```

SSE wire frame (one event):
```
id: 2026-06-21T10:23:45.120Z
event: card:updated
data: {"type":"card:updated","boardId":7,"originId":"a1b2…","emittedAt":"…","card":{…}}

```

---

## Decision 3 — Optimistic vs Server-Confirmed Drag-and-Drop (+ Echo De-Dup)

### Options Explored

- **Option A — Optimistic move + rollback** ◀ CHOSEN: move the card in local state on drop, fire the PATCH, revert to the original column + show an error on PATCH failure (AC-ERROR-4).
- **Option B — Server-confirmed**: show a pending/muted card during the PATCH, commit only on 200. Simpler (no rollback) but adds perceived latency and a visible pending state on every move.

### Decision

**Chosen: Option A — optimistic move with rollback-on-failure.** This delivers the "zero context-switch overhead" Alex-the-Dev experience (productBrief primary persona) and the "immediate" observability the success criteria call for, while AC-ERROR-4 *defines* the rollback behavior as MUST. Rollback is bounded and local: capture the card's prior `status` before the optimistic move; on PATCH rejection (`ApiError` of category `network`/`server`), restore it and surface the mapped error copy. AC-LOADING-1 (pending state) becomes a SHOULD nicety rather than the primary UX, consistent with optimistic UI.

### Echo De-Duplication Design (R5 — the critical interaction)

The current user's own PATCH will (a) update local state optimistically AND (b) echo back over the SSE channel as a `card:updated` event. Without de-dup the move would be applied twice (harmless for an idempotent full-entity swap, but it can clobber a *newer* local optimistic state and re-trigger animations — and AC-REALTIME-1's "only the moved card changes" must hold for *remote* viewers, not be muddied by self-echo).

**Mechanism — origin token round-trip:**

1. On app load, `useRealtimeBoard` mints a per-tab `originId` (`crypto.randomUUID()`), stored in memory.
2. Every write wrapper in `apiClient.ts` sends it as a request header: **`X-Client-Id: <originId>`** (chosen over a body field so it works uniformly for POST and PATCH and never pollutes the validated entity body).
3. The mutation router passes the header value into `broadcaster.publish(boardId, { …, originId: req.get('X-Client-Id') })`.
4. The SSE route writes `originId` into the event envelope.
5. `useRealtimeBoard` **drops any event whose `originId` equals this tab's `originId`** — the originating tab already applied the change optimistically; remote tabs (different `originId`) apply it normally.

This is a stateless, single-field round-trip — no server-side per-client sequence tracking (over-engineering for C1). It satisfies AC-ERROR-4 (rollback is purely local and happens *before* any echo could arrive) and R5.

> **GP5 note**: `X-Client-Id` is an opaque client-generated UUID, not a user identity or secret — safe to log and echo. It is NOT auth (no auth in MVP).

---

## Decision 4 — Drag-and-Drop Library

### Decision

**Chosen: confirm `@dnd-kit/core` + `@dnd-kit/sortable`** as the `client/package.json` dependency (productBrief § Risks explicitly recommends dnd-kit).

### Rationale
- **Accessibility (R4 / NFR3, decisive)**: `@dnd-kit` ships a `KeyboardSensor` and a live-region announcer out of the box, giving the WCAG 2.1 SC 2.1.1 keyboard alternative with minimal custom code — the single hardest accessibility requirement in this task. The UI/UX phase still designs an explicit "Move to column…" affordance as a belt-and-suspenders alternative, but dnd-kit alone clears the bar.
- **No DOM ownership conflict with React**: dnd-kit is pointer-event based and never mutates the DOM out from under React (unlike `react-dnd`'s HTML5 backend or legacy `react-beautiful-dnd`, which is unmaintained). It composes cleanly with the existing CSS-Modules `Column`/`CardItem` components.
- **Scope fit**: TASK-007 needs *column-to-column* status change only (intra-column reordering is out of scope). `@dnd-kit/core` (`DndContext`, `useDraggable`, `useDroppable`) covers this; `@dnd-kit/sortable` is added now so the deferred intra-column reorder is a non-breaking future addition (graduation path, GP4).
- **Test posture**: Phase-4 tests assert the *outcome* (card changed columns + `updateCardStatus` called with the target status), not pixel-level pointer simulation (TASK-007 § What NOT to Test) — so dnd-kit's internals are never under test.

**Alternatives rejected**: `react-beautiful-dnd` (unmaintained, no React 18 StrictMode support); `react-dnd` (HTML5 backend fights React rendering, weaker keyboard story); native HTML5 Drag-and-Drop API (poor accessibility, inconsistent cross-browser, no keyboard).

---

## Decision 5 — Real-Time Observability & Config

### Logging the long-lived connection

`requestLogger` binds `req.log` + `req.traceId` on the SSE request and emits its access-log line only on `res.finish` (`requestLogger.ts:42`) — which fires at *connection close*, not open. The SSE route therefore emits explicit lifecycle logs via the already-bound `req.log` (trace-correlated, GP2/GP3, no `console.*`):

| Moment | Log | Level | Fields |
|--------|-----|-------|--------|
| Connection open | `realtime connection opened` | info | `boardId`, `clientId` (= `X-Client-Id`), `connections` (current count for board) |
| Broadcast emit | `realtime event published` | info (debug-able) | `boardId`, `type`, `subscribers` |
| Write error to a dead socket | `realtime write failed` | warn | `boardId`, no socket internals (GP5) |
| Connection close | `realtime connection closed` | info | `boardId`, `clientId`, `durationMs` |

Connection cleanup is driven by `req.on('close', …)` → `broadcaster.unsubscribe(boardId, sink)`, which both prevents the dead-subscriber leak and emits the close log. The existing `res.finish` access-log line still fires at close (one line per stream lifetime) — acceptable and documented.

### traceId in real-time messages

The mutation request that *causes* a broadcast already has a `req.traceId` (from `requestLogger`). We carry it into the broadcast log line and **optionally** into the event envelope as `traceId` so a remote-applied change can be correlated back to the originating request across the SSE boundary — this is the W3C-trace-context propagation analog for the messaging boundary (observability-requirements § 7.3). It is logged, never surfaced to end users (GP5). The SSE *connection itself* has its own `req.traceId` for its lifecycle logs. Full OTel span propagation across SSE is deferred (consistent with the project-wide `initTracing()` no-op seam — systemPatterns); the `traceId` field is the seam.

### Metrics

**Deferred**, consistent with the rest of the project (systemPatterns § Observability: "Metrics: deferred"). The broadcaster exposes a `connectionCount(boardId?)` accessor so a future `/metrics` endpoint can surface `banyanboard_realtime_connections` (a low-cardinality gauge) without rework. No metrics endpoint is built this task.

### Configuration (new env vars — `src/config/env.ts`, fail-fast)

| Variable | Purpose | Default | Parser |
|----------|---------|---------|--------|
| `REALTIME_ENABLED` | Master switch for the SSE route + broadcast hooks. When `false`, the events route returns 404 and mutation broadcasts are skipped (graceful no-op). | `true` | existing `parseBool` |
| `REALTIME_KEEPALIVE_MS` | Interval for SSE keep-alive comment frames (`: keep-alive\n\n`) that defeat idle-proxy timeouts. | `15000` | new `parsePositiveInt` (mirror `parsePort` range logic) |

Both follow the existing `loadConfig()` pattern (`env.ts:129`) and are added to the frozen `AppConfig`. Documented in `techContext.md` § Configuration Variables. **No `OTEL_*` changes** — real-time piggybacks on the existing tracing seam.

---

## Observability Architecture

### Logging
- **Library**: existing `pino` wrapper (`src/observability/logger.ts`) via `req.log` — structured JSON to stdout, `level = config.logLevel`, base fields `service`/`environment`/`version`, request child carries `traceId`/`spanId`. No new logger.
- **Format / config**: unchanged (`LOG_LEVEL`, `LOG_FORMAT`, `LOG_OUTPUT` already in `env.ts`).

### Distributed Tracing
- **SDK**: `@opentelemetry/api` only (existing); `initTracing()` no-op seam unchanged.
- **Propagation**: W3C Trace Context inbound on every HTTP request (incl. the SSE GET and the mutation POST/PATCH) via `extractTraceContext` (`requestLogger.ts:35`).
- **Service boundaries**:

  | From | To | Protocol | Propagation Method |
  |------|-----|----------|-------------------|
  | Browser | Express (mutation) | HTTP | `traceparent` header (existing) + `X-Client-Id` header (echo de-dup) |
  | Express mutation handler | broadcaster → SSE clients | In-process → SSE | `traceId` + `originId` carried in the event envelope (messaging-boundary analog) |
  | Browser | Express (SSE subscribe) | HTTP (`text/event-stream`) | `traceparent` header (existing); connection lifecycle logs carry the SSE request's `traceId` |
- **Sampling**: `OTEL_TRACES_SAMPLER_ARG` unchanged (1.0 dev).

### Metrics
- **Standard HTTP metrics**: deferred project-wide (no `/metrics` endpoint).
- **Custom (future-ready, NOT built)**: `banyanboard_realtime_connections{}` gauge — broadcaster exposes the accessor; no high-cardinality labels (no boardId-per-series, no clientId — observability-requirements § 6.3).

### Configuration Variables
| Variable | Purpose | Default |
|----------|---------|---------|
| `REALTIME_ENABLED` | Enable SSE transport + broadcast hooks | `true` |
| `REALTIME_KEEPALIVE_MS` | SSE keep-alive frame interval (ms) | `15000` |
| `LOG_LEVEL` | Log verbosity (existing) | `info` |
| `OTEL_SERVICE_NAME` | Service identifier (existing) | `banyanboard-api` |
| `OTEL_TRACES_SAMPLER_ARG` | Sampling ratio (existing) | `1.0` |

---

## Implementation Guidelines

### Backend (Phase 5)

1. **`src/realtime/broadcaster.ts`** — pure module, no Express imports:
   ```typescript
   export interface Subscriber { send(event: RealtimeEvent): void; }
   // Map<number, Set<Subscriber>>; subscribe/unsubscribe/publish/connectionCount.
   // publish() iterates the board's Set, calls send(); a throwing send is caught + logged by the caller.
   ```
   Unit-testable with a fake `Subscriber` (no HTTP) — covers board-scoped delivery + no-cross-board leak.

2. **`src/realtime/eventsRouter.ts`** — `Router({ mergeParams: true })`, mounted in `src/routes/index.ts` **after** the cards router:
   ```typescript
   // GET /  →  /api/v1/boards/:boardId/events
   //   validateId(boardId); if (!config.realtimeEnabled) → notFoundError → 404 (GP5-safe)
   //   res.writeHead(200, { 'Content-Type':'text/event-stream', 'Cache-Control':'no-cache', Connection:'keep-alive' })
   //   res.flushHeaders();  subscriber = { send: e => res.write(`id:${e.emittedAt}\nevent:${e.type}\ndata:${JSON.stringify(e)}\n\n`) }
   //   broadcaster.subscribe(boardId, subscriber); req.log.info({boardId, clientId}, 'realtime connection opened')
   //   keepalive = setInterval(() => res.write(': keep-alive\n\n'), config.realtimeKeepaliveMs)
   //   req.on('close', () => { clearInterval(keepalive); broadcaster.unsubscribe(...); req.log.info(..., 'realtime connection closed') })
   ```
   Mount in `routes/index.ts`: `apiRouter.use('/boards/:boardId/events', eventsRouter);` — preserves `createApp()` purity (no `index.ts` change for transport). **No `express.json()`** on this router (GET only).

3. **Broadcast hook in mutation routers** — at the existing success-log lines, fire-and-forget AFTER `res.json()` so it is never on the response critical path (NFR1):
   - `cards.ts:73` (create) → `publishCardEvent('card:created', boardId, card, req)`
   - `cards.ts:125` (update — covers edit AND drag status change) → `'card:updated'`
   - `cards.ts:144` (delete) → `'card:deleted'`
   - `boards.ts:103` (update) → `'board:updated'`
   - `boards.ts:54` (create) → no board-scoped channel exists yet for a brand-new board; broadcasting is a no-op (no subscribers) — emit nothing or a future board-list channel (out of scope).
   Wrap each `publish` in a guard so a broadcaster failure can never fail the HTTP mutation (it is logged at warn, request already responded 2xx).

4. **`src/config/env.ts`** — add `realtimeEnabled` (`parseBool(readEnv('REALTIME_ENABLED'), true)`) and `realtimeKeepaliveMs` to `DEFAULTS`, `AppConfig`, and `loadConfig()`.

### Frontend (Phases 1, 4, 5)

5. **`apiClient.ts` (Phase 1)** — add a `sendJson<T>(method, path, body, originId, signal)` mirroring `getJson`'s safe `ApiError` mapping (`apiClient.ts:56-84`), sending `Content-Type: application/json` + `X-Client-Id: originId`; map a 400 to category `server` (no body read — GP5). Wrappers: `createBoard`, `updateBoard`, `createCard`, `updateCard`, `updateCardStatus(boardId, cardId, status, originId)`.

6. **`useRealtimeBoard(boardId, originId, dispatch)` (Phase 5)** — `new EventSource(`/api/v1/boards/${boardId}/events`)`; `addEventListener` per event type; parse `data`; **drop events where `evt.originId === originId`** (R5); dispatch full-entity swap into board state; close on unmount. Native reconnection; no backoff code.

7. **Drag-and-drop (Phase 4)** — wrap the board in `DndContext` with `PointerSensor` + `KeyboardSensor`; `CardItem` = `useDraggable`, `Column` = `useDroppable` keyed by status. `onDragEnd`: capture prior status → optimistic move → `updateCardStatus(...)` → on reject, restore prior status + error copy (AC-ERROR-4).

### Sequencing
Phases 1→4 (write wrappers, forms, DnD) consume **already-tested** REST endpoints and ship independently of real-time. Phase 5 adds the SSE tier last (riskiest; needs mutations to exist first). Echo de-dup (`originId`) is introduced in Phase 1 (wrappers send `X-Client-Id`) but only *consumed* in Phase 5 — design the header in from the start so Phase 5 needs no Phase-1 rework.

---

## Validation Checklist

- [x] Meets all system requirements (R1–R6)
- [x] Respects technical constraints (C1–C7) — single-host in-process pub/sub; SSE rides existing proxy; `createApp()` seam preserved; env via `env.ts`; pino-only; GP5-safe
- [x] Addresses non-functional requirements (NFR1–NFR4)
- [x] Technically feasible — no new backend runtime deps; one client dep (`@dnd-kit`); SSE + `EventSource` are platform built-ins
- [x] Risks identified and acceptable (below)
- [x] Complies with Guiding Principles in systemPatterns.md — **no deviations** (GP1 env config ✓, GP2 traceId on every line ✓, GP3 pino-only ✓, GP4 lean SSE + full-entity + no broker ✓, GP5 no detail leak ✓)
- [x] Respects established patterns — route mounts under `/api/v1`, broadcast hooks at existing `req.log` sites, `createApp()` order unchanged
- [x] Observability architecture defined — connection lifecycle logging, traceId carriage, deferred metrics with a ready accessor
- [x] Trace context propagation across all service boundaries — HTTP `traceparent` + `traceId`/`originId` in the event envelope (messaging-boundary analog)
- [x] Logging strategy consistent with observability-requirements.md — structured JSON, traceId-correlated, no sensitive data
- [x] Metrics strategy follows naming conventions — `banyanboard_realtime_connections` snake_case gauge, low cardinality (when built)

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| SSE connection leaks (subscribers not cleaned up) | Medium | Medium | `req.on('close')` → `unsubscribe` + close log; Phase-5 test asserts the subscriber Set shrinks on disconnect |
| Idle proxy/load-balancer kills the SSE stream | Medium | Low | `REALTIME_KEEPALIVE_MS` comment frames; `EventSource` auto-reconnects on drop |
| Self-echo double-applies the user's own move | Medium | Medium | `X-Client-Id` round-trip + drop-own-`originId` in `useRealtimeBoard` (R5); Phase-5 test |
| Optimistic move stuck in wrong column on PATCH failure | Medium | Medium | Capture prior status; rollback + error copy (AC-ERROR-4); explicit E2E intercept test |
| Broadcast failure breaks the HTTP mutation | Low | High | `publish` is fire-and-forget AFTER `res.json()`, wrapped in a try/catch logged at warn — never fails the request |
| Vite proxy mishandles `text/event-stream` buffering in dev | Low | Medium | SSE rides the existing HTTP `/api/v1` proxy entry; `Cache-Control: no-cache` + `flushHeaders()`; verify in Phase 5 with the two-tab E2E |
| `@dnd-kit` keyboard story insufficient for WCAG SC 2.1.1 | Low | Medium | `KeyboardSensor` + explicit "Move to column…" affordance (UI/UX phase); Phase-4 keyboard test |

---

## Implications for UI/UX & Build

**For the UI/UX creative phase:**
- **Optimistic-by-default** is decided — design real-time feedback (Decision 5 of UI/UX scope) for *remote* changes only; the user's own move is already applied optimistically and self-echo is dropped. A brief highlight/flash on remotely-updated cards is the recommended pattern; a toast is optional.
- The **rollback** path (AC-ERROR-4) needs an error surface consistent with the existing `ErrorMessage` / `role="alert"` pattern — design the "move failed, reverted" copy.
- The **keyboard "Move to column…"** affordance is required as the dnd-kit `KeyboardSensor` companion (R4) — design it.
- `AC-LOADING-1` pending state is a SHOULD under optimistic UI — design it for the *form* writes (disabled submit) primarily, not the drag.

**For the build phases:**
- Phase 1 must add the `X-Client-Id` header to write wrappers even though it is consumed only in Phase 5 (no rework).
- Phase 5 backend tests: board-scoped delivery, no-cross-board leak, connection lifecycle logged via `req.log` with no internal-detail leak, `REALTIME_ENABLED=false` → 404. Frontend: hook applies `card:*`/`board:updated`, drops own-`originId` echo.
- `techContext.md` § Configuration Variables and § Component Structure must be updated by the Documentation Agent to add `src/realtime/`, `REALTIME_ENABLED`, `REALTIME_KEEPALIVE_MS`, and the `@dnd-kit` client dep.

---

## Next Steps

1. UI/UX creative phase consumes the optimistic + remote-feedback + keyboard-affordance implications above.
2. Phase 1 build: `sendJson` + write wrappers with `X-Client-Id` (GP5-safe mapping).
3. Phases 2–4 build: forms, then `@dnd-kit` drag with optimistic rollback.
4. Phase 5 build: `src/realtime/{broadcaster,eventsRouter}.ts`, mount in `routes/index.ts`, broadcast hooks at the existing mutation log sites, `env.ts` vars, `useRealtimeBoard`.
5. Phase 6: two-tab E2E for AC-REALTIME-1/2 against the real Express-served build.
