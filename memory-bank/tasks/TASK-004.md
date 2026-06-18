# TASK-004: Board model with CRUD endpoints

**Complexity**: Level 2 (inherited from FEAT-005)
**Status**: PLANNING_COMPLETE
**Roadmap**: FEAT-005
**Branch**: feature/FEAT-005-board-model-crud
**Worktree**: N/A

## Task Description

Add a Board domain model with full CRUD REST endpoints (create, read one, list, update, delete) on the Express API. Establishes the `boards` table that Cards reference via foreign key. Includes request input validation, structured error responses, environment-driven persistence via the existing PostgreSQL connection module, and unit + integration tests. Prerequisite for FEAT-004 (Card model). Follows the layered Express + Postgres patterns established in FEAT-001/002/003.

## Specification

**Feature Type**: End-User Feature (REST API)
**Primary Persona**: Alex the Dev — software engineer who needs to manage boards via a REST API so the React frontend (and future clients) can create, read, update, and delete boards with predictable JSON responses and clear error shapes.
**Creative Exploration Needed**: No — the one LOW-confidence area (schema/migration mechanism) was resolved by human decision during planning: **node-pg-migrate** (see § Creative Exploration Needed → Decision below). No `/banyan-creative` phase required.

### Invocation Method

- **Location**: Express API, versioned namespace `/api/v1`; domain router mounted at `src/routes/boards.ts`, registered in `src/routes/index.ts` via `apiRouter.use('/boards', boardsRouter)` following the composition pattern documented in `src/routes/index.ts` comment ("Future domains add their routers here, e.g. `apiRouter.use('/boards', boardsRouter)`").
- **Elements** (five REST endpoints):

  | Method   | Path               | Operation        | Success Status |
  |----------|--------------------|------------------|----------------|
  | `POST`   | `/api/v1/boards`   | Create a board   | `201 Created`  |
  | `GET`    | `/api/v1/boards`   | List all boards  | `200 OK`       |
  | `GET`    | `/api/v1/boards/:id` | Read one board | `200 OK`       |
  | `PATCH`  | `/api/v1/boards/:id` | Update a board | `200 OK`       |
  | `DELETE` | `/api/v1/boards/:id` | Delete a board | `204 No Content` |

- **Visibility**: always reachable (no authentication guard in MVP per `productBrief.md` — "all authenticated users share access to all boards (MVP)"); no auth middleware is in scope for this task.
- **Navigation**: HTTP client → `POST /api/v1/boards` (or other verb/path above) → JSON response. Entry point from `src/app.ts`: `requestLogger` → `/health` → `/api/v1` → `notFound` → `errorHandler`. The boards router slots into the `/api/v1` sub-tree.
- **Confidence**: HIGH — `src/routes/index.ts` has an explicit placeholder comment for this exact mounting pattern; `src/app.ts` shows the overall composition order; `src/routes/health.ts` demonstrates the async route + `req.log` + `pool` pattern to follow.

### boards Table Schema

Concrete schema for the `boards` PostgreSQL table (canonical FK target for `cards.board_id` in FEAT-004):

```sql
CREATE TABLE IF NOT EXISTS boards (
  id          SERIAL       PRIMARY KEY,
  name        VARCHAR(255) NOT NULL,
  description TEXT,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
```

Column notes:
- `id`: auto-incrementing integer PK; exposed as a number in API responses.
- `name`: required, max 255 characters; empty string is rejected by input validation.
- `description`: optional free-text; `NULL` serializes as `null` in JSON.
- `created_at` / `updated_at`: server-managed timestamps; never accepted from clients.

**Confidence**: HIGH on column shape (standard MVP kanban board domain). LOW on the mechanism to create this table — see § Creative Exploration Needed.

### Request / Response Shapes

#### POST /api/v1/boards — Create
Request body (JSON):
```json
{ "name": "Sprint 1", "description": "Optional description" }
```
Response `201`:
```json
{ "id": 1, "name": "Sprint 1", "description": null, "created_at": "2026-06-17T10:00:00.000Z", "updated_at": "2026-06-17T10:00:00.000Z" }
```

#### GET /api/v1/boards — List
Response `200`:
```json
[
  { "id": 1, "name": "Sprint 1", "description": null, "created_at": "...", "updated_at": "..." }
]
```
Empty board list returns `[]` (not 404).

#### GET /api/v1/boards/:id — Read one
Response `200`: same single-board object as above.
Response `404`: `{ "error": "Not Found", "path": "/api/v1/boards/99", "traceId": "..." }` (standard error shape from `src/middleware/errorHandler.ts`).

#### PATCH /api/v1/boards/:id — Update
Request body (JSON, all fields optional — at least one must be present):
```json
{ "name": "Sprint 1 Updated" }
```
Response `200`: full updated board object.
Response `404`: standard 404 shape.
Response `400`: standard 400 shape (e.g., body is empty object).

#### DELETE /api/v1/boards/:id — Delete
Response `204 No Content`: empty body.
Response `404`: standard 404 shape.

### Input Validation Rules

- `name` on POST: required (missing or empty string → 400).
- `name` on POST/PATCH: max 255 characters (exceeding → 400).
- `name` on POST/PATCH: must be a string (non-string type → 400).
- `description` on POST/PATCH: optional; must be a string or null/omitted if present (other types → 400).
- `id` path param: must be a positive integer (non-integer or zero → 400 before DB query).
- PATCH body: must contain at least one of `name` / `description` (empty update → 400).
- Unrecognized extra fields in the body: silently ignored (no 400 — keep it simple for MVP).
- Validation is performed in the route handler BEFORE any DB call. Failed validation calls `next(err)` with a status-400 error object, which the existing `errorHandler` maps to `400 { "error": "Bad Request", "path": "...", "traceId": "..." }`.

### Structured Error Response Shape

Reuses the established centralized error handling from `src/middleware/errorHandler.ts` and `src/middleware/notFound.ts`:
```json
{ "error": "Bad Request",  "path": "/api/v1/boards", "traceId": "abc123" }   // 400
{ "error": "Not Found",    "path": "/api/v1/boards/99", "traceId": "abc123" } // 404
{ "error": "Internal Server Error", "traceId": "abc123" }                      // 500
```
Internal error detail (DB error message, stack) is NEVER in the response body — server-side log only, per Guiding Principle 5 in `memory-bank/systemPatterns.md`.

### Success Criteria

- **Caller receives**: correct HTTP status code + `application/json` Content-Type + response body matching the shapes above for all five operations.
- **Verifiable at**:
  - HTTP responses inspectable via `supertest` against `createApp()` (same pattern as `src/routes/health.db.test.ts`).
  - Persisted rows queryable directly via `pg.Pool` in integration tests.
- **Data persisted**: `boards` table, columns `id`, `name`, `description`, `created_at`, `updated_at`.
- **Observable within**: immediate (synchronous request/response; no async jobs).
- **Observability**: each request emits one structured JSON access-log line (via `requestLogger`); route-level business events (board created/deleted) logged via `req.log` at `info` level carrying `traceId`; no `console.*` usage anywhere in route/handler code.

### Acceptance Criteria

#### AC-ENTRY-1: API surface is reachable under /api/v1/boards
**Priority**: MUST
**Given** the Express app is started via `createApp()` with `DATABASE_URL` configured
**When** a client sends `GET /api/v1/boards`
**Then** the response status is `200` and `Content-Type` matches `application/json`, confirming the boards router is mounted and returns JSON (not Express default HTML or a 404 from `notFound` middleware)

**Verification**:
- [ ] Integration test: `supertest(createApp()).get('/api/v1/boards')` → status 200, content-type JSON

#### AC-HAPPY-1: Create a board (POST /api/v1/boards)
**Priority**: MUST
**Given** a client with a valid JSON body `{ "name": "Sprint 1" }`
**When** they send `POST /api/v1/boards`
**Then**:
  1. Response status is `201`
  2. Response body is a board object with `id` (positive integer), `name: "Sprint 1"`, `description: null`, `created_at` and `updated_at` as valid ISO-8601 strings
  3. A subsequent `GET /api/v1/boards/:id` with the returned `id` returns the same board (data is truly persisted, not stub output)
  4. The response body does NOT contain a hardcoded/placeholder `id` — two separate POST calls produce different `id` values (stub detection)

**Verification**:
- [ ] Integration test creates a board, asserts shape, then reads it back by `id` and confirms equality

#### AC-HAPPY-2: List boards (GET /api/v1/boards)
**Priority**: MUST
**Given** zero or more boards exist in the database
**When** a client sends `GET /api/v1/boards`
**Then**:
  1. Response status is `200`, Content-Type is `application/json`
  2. Response body is an array (empty `[]` when no boards exist — never 404 for empty list)
  3. When boards exist, each element contains `id`, `name`, `description`, `created_at`, `updated_at`
  4. The list reflects boards actually stored in the DB — creating a new board and re-listing shows it (not a hardcoded array)

**Verification**:
- [ ] Integration test: empty DB → GET → `[]`; POST a board → GET → array contains new board

#### AC-HAPPY-3: Read one board (GET /api/v1/boards/:id)
**Priority**: MUST
**Given** a board with a known `id` exists in the database
**When** a client sends `GET /api/v1/boards/:id`
**Then**:
  1. Response status is `200`
  2. Response body matches the full board object shape (all five fields)
  3. The `name` and `description` values match what was inserted (not a generic placeholder)

**Verification**:
- [ ] Integration test: POST a board, then GET by returned `id`, assert body fields match input

#### AC-HAPPY-4: Update a board (PATCH /api/v1/boards/:id)
**Priority**: MUST
**Given** a board exists and a client sends `PATCH /api/v1/boards/:id` with `{ "name": "Renamed" }`
**When** the request is processed
**Then**:
  1. Response status is `200`
  2. Response body reflects the updated `name: "Renamed"`
  3. A subsequent `GET /api/v1/boards/:id` returns the updated name (change is durable, not just response-level)
  4. `updated_at` is strictly later than or equal to `created_at` (timestamp updated)

**Verification**:
- [ ] Integration test: POST board, PATCH name, GET board, assert updated name and `updated_at`

#### AC-HAPPY-5: Delete a board (DELETE /api/v1/boards/:id)
**Priority**: MUST
**Given** a board exists
**When** a client sends `DELETE /api/v1/boards/:id`
**Then**:
  1. Response status is `204` with an empty body
  2. A subsequent `GET /api/v1/boards/:id` returns `404` (board is truly removed from DB, not just logically flagged)

**Verification**:
- [ ] Integration test: POST board, DELETE it, GET it → 404

#### AC-ERROR-1: Validation rejects missing/invalid name on POST
**Priority**: MUST
**Given** a client sends `POST /api/v1/boards` with a missing `name`, empty string `name`, or `name` exceeding 255 characters
**When** the request is processed
**Then**:
  1. Response status is `400`
  2. Response body is `{ "error": "Bad Request", "path": "/api/v1/boards", "traceId": "<string>" }` (standard error shape — no internal detail)
  3. No row is inserted into the `boards` table

**Verification**:
- [ ] Unit test for validation logic; integration test sends invalid body and asserts 400 + no DB row

#### AC-ERROR-2: 404 for non-existent board (GET, PATCH, DELETE)
**Priority**: MUST
**Given** no board with `id = 99999` exists in the database
**When** a client sends `GET /api/v1/boards/99999`, `PATCH /api/v1/boards/99999`, or `DELETE /api/v1/boards/99999`
**Then**:
  1. Response status is `404`
  2. Response body is `{ "error": "Not Found", "path": "/api/v1/boards/99999", "traceId": "<string>" }`
  3. The response body contains no internal DB error detail, DSN fragments, or stack traces

**Verification**:
- [ ] Integration test for each of the three verbs with a non-existent id

#### AC-ERROR-3: 400 for non-integer :id path parameter
**Priority**: MUST
**Given** a client sends `GET /api/v1/boards/abc` or `DELETE /api/v1/boards/0`
**When** the request is processed
**Then**:
  1. Response status is `400`
  2. Response body follows the standard error shape with `"error": "Bad Request"`
  3. No DB query is executed (validation short-circuits before hitting the pool)

**Verification**:
- [ ] Unit test for id validation; integration test with string param asserts 400

#### AC-ERROR-4: PATCH with empty body returns 400
**Priority**: MUST
**Given** a board exists and a client sends `PATCH /api/v1/boards/:id` with `{}` (empty object)
**When** the request is processed
**Then**:
  1. Response status is `400` (no fields to update — ambiguous intent)
  2. No DB update query is executed

**Verification**:
- [ ] Integration test: POST board, PATCH with `{}`, assert 400

#### AC-OBS-1: Route handlers use req.log for all logging — no console.*
**Priority**: MUST
**Given** any boards endpoint is called
**When** the response is returned
**Then**:
  1. All log output is emitted via `req.log` (pino child logger — carries `traceId`/`spanId`)
  2. Zero calls to `console.log`, `console.error`, or `console.warn` occur
  3. The access-log line emitted by `requestLogger` carries `traceId`, `method`, `path`, `statusCode`, `durationMs`

**Verification**:
- [ ] Integration test spying on `process.stdout.write` (established pattern in `src/routes/health.test.ts`); assert no `console.*` calls

#### AC-OBS-2: Error responses never leak internal DB detail
**Priority**: MUST
**Given** a DB error occurs during any boards operation (e.g., connection failure)
**When** the error is returned to the client
**Then**:
  1. Response body contains only `{ "error": "Internal Server Error", "traceId": "..." }` (no `err.message`, no stack, no DSN fragments)
  2. The DB error IS logged server-side via `req.log.error(...)` with the full `err` object

**Verification**:
- [ ] Integration test mocking `getPool().query` to reject; assert 500 body has no internal detail

### Scope Boundaries

- **In scope**:
  - `boards` table creation (SQL `CREATE TABLE IF NOT EXISTS`) — see LOW-confidence note below on mechanism
  - Five REST endpoints: POST create, GET list, GET read-one, PATCH update, DELETE delete
  - Input validation (name required/max-length, id must be positive integer, PATCH must have at least one field)
  - Structured JSON error responses using the existing `errorHandler` + `notFound` middleware
  - Observability: `req.log`-based structured logging per request; no `console.*`
  - Unit tests for validation logic (no DB required)
  - Integration tests against a real `pg.Pool` (mocked DB seam) using the established `jest.resetModules()` + `createApp()` + `supertest` pattern from `src/routes/health.db.test.ts`
  - Registering the boards router in `src/routes/index.ts`

- **Out of scope**:
  - Authentication / authorization (MVP: no auth guard; documented in `productBrief.md`)
  - Column management (FEAT-004 Cards depend on boards but columns are a separate domain)
  - Card model (FEAT-004 — depends on this feature; boards table must exist first)
  - Soft-delete / board archiving (hard DELETE only for MVP)
  - Pagination of the list endpoint (not required at MVP scale of tens of boards)
  - Bulk operations
  - Search or filtering by name
  - OpenTelemetry SDK / OTLP export (deferred — `initTracing()` no-op seam already in place)
  - Metrics endpoint

- **Dependencies**:
  - `src/db/pool.ts` — `getPool()` provides the `pg.Pool` singleton (FEAT-002, complete)
  - `src/config/env.ts` — `config.databaseUrl` gates DB usage (FEAT-001, complete)
  - `src/middleware/errorHandler.ts` + `src/middleware/notFound.ts` — error shape already realized (FEAT-001 Phase 4, complete)
  - `src/routes/index.ts` — composition root where the boards router is mounted
  - FEAT-004 (Card model) is a **downstream consumer** of this feature; the `boards` table `id` column is the FK target for `cards.board_id`

- **NFR implications** (from `productBrief.md`):
  - Performance: p95 < 150 ms for reads, < 300 ms for writes (single-team scale, local DB — straightforward SQL)
  - Security: no internal error detail in responses (Guiding Principle 5, enforced by `errorHandler`)
  - No PII in boards (task titles/descriptions are not regulated data)

### Creative Exploration Needed

**Yes — one LOW-confidence area:**

**Schema/migration mechanism — how is the `boards` table created?**

No migration tool or schema-creation mechanism exists in the codebase today. The `productBrief.md` Risks table explicitly identifies this: "Use a migration tool (e.g., `node-pg-migrate`); version migrations in repo." `techContext.md` notes: "Schema/migrations/ORM remain out of scope (future domain features)." No `.sql` files, no migration runner, no `init.sql` in `docker-compose.yml`.

Three valid approaches exist — this is a design decision, not a spec decision:

1. **Inline `CREATE TABLE IF NOT EXISTS` in a `src/db/schema.ts` module** called once at startup in `src/index.ts` — zero new dependencies, simple for MVP, but not a migration system (no rollback, no versioning). Fits "complexity only when it earns its keep."
2. **Add `node-pg-migrate` or `db-migrate`** — proper up/down migrations, versioned in `migrations/` folder. Correct for production but adds a dependency and a new CLI command.
3. **`docker-compose.yml` `init.sql` mount** — mount a `db/init.sql` file into the PostgreSQL container's `docker-entrypoint-initdb.d/`. Zero runtime dependencies but only runs on first container creation (not idempotent on upgrades).

This question should be answered before implementation begins. A `/banyan-creative` phase is **recommended** to lock in the mechanism — or a human decision documented in the task file is sufficient to unblock implementation. The rest of the specification is fully concrete and independent of this choice.

#### Decision (resolved during planning, 2026-06-17)

**Mechanism: `node-pg-migrate` (Approach 2).** Versioned up/down migrations stored in a repo `migrations/` folder, run via npm scripts. Chosen for production correctness and alignment with the `productBrief.md` Risks recommendation ("Use a migration tool (e.g., `node-pg-migrate`); version migrations in repo"). Establishes the project's canonical schema-evolution path, which FEAT-004 (Cards) and later domains will reuse.

Implications for the plan:
- Adds `node-pg-migrate` (and `pg` is already present) as a dependency.
- Migration config is driven by `DATABASE_URL` (12-Factor) — no hardcoded connection string.
- New npm scripts: `migrate` (up), `migrate:down`, and a `migrate:create` helper.
- The first migration creates the `boards` table per the § boards Table Schema above.
- This unblocks implementation with no creative phase.

## Test Strategy

### Approach

- **Emphasis**: Integration-weighted balanced. The feature's value is observable HTTP behavior against a real `pg.Pool` seam, so integration tests (supertest + `createApp()`) carry the most weight; pure validation logic is covered by fast unit tests.
- **Target test count**: ~18 total across phases. Justified by 5 endpoints × (happy + error paths) + 2 observability ACs + a unit suite for validation — still within the multi-component feature range (10-20).

### File Organization

- **New test files**:
  - `src/validation/board.test.ts` — unit tests for the board input-validation functions (no DB). Covers name/description/id/PATCH-body rules.
  - `src/routes/boards.test.ts` — integration tests for the five endpoints + error + observability ACs, using the `jest.resetModules()` + mocked `getPool().query` + `supertest(createApp())` pattern from `src/routes/health.db.test.ts`.
- **Extend existing**:
  - `src/index.test.ts` (or `src/routes/index`-level coverage) — optionally add one assertion that `/api/v1/boards` is mounted (AC-ENTRY-1 is also covered in `boards.test.ts`).

### What NOT to Test

- `node-pg-migrate` internals and the `pg` driver — third-party, out of scope.
- `errorHandler` / `notFound` middleware behavior — already covered by FEAT-001 Phase 4 tests; boards tests assert the *resulting* status/shape, not the middleware itself.
- `config/env.ts` and `db/pool.ts` — already unit-tested (FEAT-001/002).
- TypeScript-enforced type guarantees — no tests for what the compiler proves.

### Per-Phase Test Guidance

- **Phase 1 (migration + table)**: ~1 check. Verify `npm run migrate` applies the `boards` migration against a dev/CI database and that `migrate:down` reverts it (smoke-level; primarily manual/CI verification, no Jest suite required). The table's existence is exercised transitively by Phase 3 integration tests.
- **Phase 2 (data-access + validation)**: ~7 unit tests in `src/validation/board.test.ts` — missing name, empty-string name, name > 255, non-string name, invalid description type, non-integer/zero `:id`, empty PATCH body, and at least one valid-input pass-through.
- **Phase 3 (routes + registration)**: ~10 integration tests in `src/routes/boards.test.ts` — AC-ENTRY-1, AC-HAPPY-1…5 (including persistence/stub-detection round-trips), AC-ERROR-1…4, AC-OBS-1 (no `console.*`, via `process.stdout.write` spy), AC-OBS-2 (DB error → 500 with no internal detail, via mocked `query` rejection).

## Implementation Roadmap

- [x] **Phase 1: Migration tooling + `boards` table.** Add `node-pg-migrate` dependency; add `migrate` / `migrate:down` / `migrate:create` npm scripts driven by `DATABASE_URL` (12-Factor, no hardcoded DSN); author the first migration creating the `boards` table per the spec schema (`id`, `name`, `description`, `created_at`, `updated_at`). Document the commands in `techContext.md`. Verify up/down against the local Docker Postgres. ✅ COMPLETE (2026-06-17) — `node-pg-migrate@^7.9.1`; migration `migrations/1781743422435_create-boards-table.js`; up→down→up verified against Docker Postgres (table shape matches spec exactly); build + 38 tests green.
- [x] **Phase 2: Board data-access module + input validation.** Add `src/db/boards.ts` (or `src/models/board.ts`) with parameterized query functions (`create`, `list`, `findById`, `update`, `delete`) using `getPool()`. Add `src/validation/board.ts` with `validateCreate`, `validateUpdate`, and `validateId` returning status-400 errors on failure. Unit-test validation (Phase 2 tests). ✅ COMPLETE (2026-06-17) — `src/db/boards.ts` (create/list/findById/update/remove, all parameterized; returns Board/null/boolean), `src/validation/board.ts` (validateCreate/validateUpdate/validateId throwing `HttpError` status 400), `src/errors.ts` (shared `HttpError` + `badRequest`/`notFoundError` factories, recognized by errorHandler via `.status`), `src/validation/board.test.ts` (15 unit tests). Build PASS; full suite 53/53.
- [ ] **Phase 3: Board CRUD routes + registration + integration tests.** Add `src/routes/boards.ts` implementing the five endpoints (async handlers, `req.log` structured logging, validation-before-DB, `next(err)` on failure); register via `apiRouter.use('/boards', boardsRouter)` in `src/routes/index.ts`. Integration tests covering all remaining ACs. This phase delivers the complete entry-to-success flow.

### Observability Requirements

- **Applies**: Yes → build agents must reference `${CLAUDE_PLUGIN_ROOT}/context/observability-requirements.md`.
- **Logging**: Each request emits one structured JSON access-log line (existing `requestLogger`); route handlers log business events (board created/updated/deleted) and errors via `req.log` (pino child carrying `traceId`/`spanId`). Zero `console.*` (AC-OBS-1).
- **Tracing**: W3C trace context already propagated by existing middleware; handlers reuse `req.log` so logs carry `traceId`/`spanId`. No new tracing surface (OTLP export remains a no-op seam, out of scope).
- **Metrics**: None added in this task.

### API Requirements

- **REST API**: Yes → build agents must load `${CLAUDE_PLUGIN_ROOT}/context/api-rest-requirements.md`. Five new endpoints under `/api/v1/boards` (see Specification → Invocation Method).
- **OpenAPI Spec**: None currently in the repo. Build agents to follow `api-rest-requirements.md` guidance (create/extend an OpenAPI definition for the boards endpoints if the requirements file mandates it; otherwise document endpoint contracts in code/tests).

## Creative Phases

- [x] None required — the only open design decision (migration mechanism) was resolved during planning (node-pg-migrate). See § Creative Exploration Needed → Decision.

---

## Build Execution State

**Build Status**: COMPLETE (Phase 2 of 3)
**Current Build**: Phase 2: Board data-access module + input validation (TASK-004) — COMPLETE
**Build Started**: 2026-06-17
**Phase Number**: 2 of 3
**Is Multi-Phase**: YES

### Current Build Step
**Step**: Phase 2 complete — awaiting human review before Phase 3
**Status**: COMPLETE
**Completed**: 2026-06-17
**Output**: `src/errors.ts` (HttpError + badRequest/notFoundError), `src/validation/board.ts` (validateCreate/validateUpdate/validateId), `src/db/boards.ts` (create/list/findById/update/remove — parameterized), `src/validation/board.test.ts` (15 unit tests). Build PASS (tsc clean); full suite 53/53 (was 38; +15).

### Completed Steps
- Step 0.5 Git Setup: COMPLETE (2026-06-17) — branch `feature/FEAT-005-board-model-crud` (no worktree; Worktree=N/A)
- Step 0.6 Phase Gate: COMPLETE — Implementation Roadmap populated; no creative phases required (Level 2)
- Phase 1 Implementation + Verification: COMPLETE (2026-06-17) — migration tooling + boards table; 38/38 tests
- Step 1 Read Task Context: COMPLETE (2026-06-17) — Phase 2 of 3 identified
- Step 2 Load Context: COMPLETE (2026-06-17) — Level 2 implementation rules
- Phase 2 Test Writer (TDD): COMPLETE (2026-06-17) — 15 validation unit tests authored first
- Phase 2 Implementation: COMPLETE (2026-06-17) — errors.ts + validation/board.ts + db/boards.ts
- Phase 2 Integration Verification: COMPLETE (2026-06-17) — full suite 53/53, build PASS (tsc clean)
- Phase 2 Code Review (self): COMPLETE (2026-06-17) — parameterized queries (SQLi-safe), zero console.*, HttpError→errorHandler integration; 0 blocking

### Sub-Agents
(none — focused Level 2 phase; orchestrator implements directly with TDD discipline, mirroring Phase 1)

### Resumption Notes
**Can Resume**: N/A (phase complete — human review gate)
**Resume From**: Phase 3 (next `/banyan-build TASK-004`)
**Notes**: Phase 3 = `src/routes/boards.ts` (5 endpoints; async handlers, req.log, validate-before-DB, next(err)) consuming `src/validation/board.ts` + `src/db/boards.ts`; register `apiRouter.use('/boards', boardsRouter)` in `src/routes/index.ts`; integration tests `src/routes/boards.test.ts` (AC-ENTRY-1, AC-HAPPY-1..5, AC-ERROR-1..4, AC-OBS-1/2) via mocked `getPool().query` + supertest. Use `notFoundError(...)` from `src/errors.ts` for 404s. Validators throw `HttpError`; wrap handler bodies in try/catch → next(err).

### Prior State (PLAN)
- PLAN: Spec Writer Agent drafted specification (Sonnet)
- PLAN: Human review — spec approved; migration mechanism decided (node-pg-migrate)
- PLAN: Test Strategy + Implementation Roadmap finalized (3 phases)
