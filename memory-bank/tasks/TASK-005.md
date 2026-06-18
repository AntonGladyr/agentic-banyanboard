# TASK-005: Card model with CRUD endpoints

**Complexity**: Level 2 (inherited from FEAT-004)
**Status**: BUILD (Phase 1/3 complete)
**Roadmap**: FEAT-004
**Branch**: feature/FEAT-004-card-model-crud
**Worktree**: N/A

## Task Description

Add a Card domain model with full CRUD REST endpoints (create, read one, list, update, delete) on the Express API. Cards have a foreign key to Board (`board_id`) enforcing referential integrity. Includes request input validation (body and params), structured error responses, environment-driven persistence via the existing PostgreSQL connection module, and unit + integration tests. Follows the layered Express + Postgres patterns established in FEAT-001/002/003 and the Board CRUD implementation delivered in FEAT-005 (TASK-004).

**Dependency**: FEAT-005 (Board model — complete; provides the `boards` table that `cards.board_id` references).

## Specification

**Feature Type**: End-User Feature (REST API)
**Primary Persona**: Alex the Dev — software engineer on a 4-person team who needs to manage kanban cards via a REST API so the React frontend can create, read, update, and delete cards with predictable JSON responses and clear error shapes. Cards are always scoped to a board (`board_id`), matching how the product is used: "open board → view cards → move card."
**Creative Exploration Needed**: Yes — two LOW-confidence areas require human decisions before implementation begins; see § Creative Exploration Needed at the bottom of this section.

### Invocation Method

- **Location**: Express API, versioned namespace `/api/v1`; domain router at `src/routes/cards.ts`, registered in `src/routes/index.ts` via `apiRouter.use('/boards/:boardId/cards', cardsRouter)` — board-scoped path (see § Listing Semantics below for the rationale and confidence level).
- **Elements** (five REST endpoints):

  | Method   | Path                                  | Operation        | Success Status   |
  |----------|---------------------------------------|------------------|------------------|
  | `POST`   | `/api/v1/boards/:boardId/cards`       | Create a card    | `201 Created`    |
  | `GET`    | `/api/v1/boards/:boardId/cards`       | List board cards | `200 OK`         |
  | `GET`    | `/api/v1/boards/:boardId/cards/:id`   | Read one card    | `200 OK`         |
  | `PATCH`  | `/api/v1/boards/:boardId/cards/:id`   | Update a card    | `200 OK`         |
  | `DELETE` | `/api/v1/boards/:boardId/cards/:id`   | Delete a card    | `204 No Content` |

- **Visibility**: always reachable (no authentication guard in MVP — `productBrief.md`: "all authenticated users share access to all boards (MVP)").
- **Navigation**: HTTP client → any of the five paths above → JSON response. App composition order in `src/app.ts`: `requestLogger` → `/health` → `/api/v1` → `notFound` → `errorHandler`. The cards router slots into the `/api/v1` sub-tree alongside `/boards`.
- **Confidence**: HIGH for the five-endpoint structure and layered file layout (direct mirror of `src/routes/boards.ts`, `src/db/boards.ts`, `src/validation/board.ts`). MEDIUM for the board-scoped path prefix (`/boards/:boardId/cards`) — see § Listing Semantics below.

### cards Table Schema

Proposed schema for the `cards` PostgreSQL table (MVP-scoped fields):

```sql
CREATE TABLE IF NOT EXISTS cards (
  id          SERIAL       PRIMARY KEY,
  board_id    INTEGER      NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  title       VARCHAR(255) NOT NULL,
  description TEXT,
  position    INTEGER      NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
```

Column notes:
- `id`: auto-incrementing integer PK; exposed as a number in API responses.
- `board_id`: NOT NULL FK to `boards(id)`. ON DELETE CASCADE (see § FK Delete Behavior below).
- `title`: required, max 255 characters; empty string rejected by validation. Named `title` (not `name`) to align with product language — `productBrief.md` says "cards with titles, descriptions, due dates, and labels."
- `description`: optional free text; `NULL` serializes as `null` in JSON.
- `position`: integer ordering within a board (default 0). Included so drag-and-drop can be wired later without a schema migration. An integer is simplest for MVP (no fractional/Fibonacci ordering needed yet).
- `created_at` / `updated_at`: server-managed timestamps; never accepted from client input.

**LOW-confidence fields** — see § Creative Exploration Needed:
- `position`: including it now costs nothing (a single integer column) and avoids a future schema migration, but the ordering model (how position updates on drag-and-drop) is NOT in scope for this task. Flag for human confirmation.
- `status` (e.g., "todo" / "in-progress" / "done"): intentionally NOT included in the MVP schema. `productBrief.md` describes columns as the status axis ("drag-and-drop cards between columns to update status") — status belongs to a `columns` domain, not to `cards`. Flagged here to prevent future confusion.
- `due_date`, `labels`: referenced in `productBrief.md` key functionality but deferred to a future migration. Not included in this task.

### FK Delete Behavior

**Decision: ON DELETE CASCADE.**

Rationale: When a board is deleted, its cards are logically owned by it and have no meaning without it. CASCADE removes all cards atomically with the board, keeping the DB consistent without requiring the caller to delete cards first. This matches the product's model (boards contain cards; cards do not exist independently). RESTRICT would force callers to delete all cards before deleting a board, which is operationally unfriendly and inconsistent with the DELETE 204 behavior the boards API already provides.

**Confidence**: HIGH — CASCADE is the conventional choice for owned/child entities in a kanban domain (a card without a board is meaningless). The alternative (RESTRICT) would complicate the boards DELETE endpoint by requiring it to either cascade manually or document that boards with cards cannot be deleted.

**Referential integrity violation on POST**: if a client POSTs a card with a `board_id` that does not exist, PostgreSQL raises a foreign key violation (`23503`). The cards route handler must catch this specific pg error code and map it to `400 Bad Request` (not 500) — the client supplied an invalid `board_id`. However, since all five endpoints are board-scoped (`/api/v1/boards/:boardId/cards`), the route handler will validate `boardId` as a positive integer (same `validateId` pattern), and MAY additionally verify the board exists before inserting (a pre-flight `findById` on the boards table). Both approaches are acceptable; the pre-flight check is clearer but adds one extra DB query per POST. **This is a LOW-confidence implementation detail** flagged for human decision — either approach satisfies the AC.

### Listing Semantics — Board-Scoped vs. Flat

**Recommendation: board-scoped path `/api/v1/boards/:boardId/cards`.**

Justification:
1. **Product model**: cards belong to boards. The primary user flow in `productBrief.md` is "Open board → view cards in columns." There is no product scenario where a user wants to list cards across all boards at once at the API level in MVP.
2. **Path consistency with REST resource hierarchy**: cards are a child resource of boards. The conventional REST path is `/boards/:boardId/cards`, which makes the ownership explicit in the URL.
3. **Mounting in `src/routes/index.ts`**: Express supports `apiRouter.use('/boards/:boardId/cards', cardsRouter)` natively. The `boardId` param is accessible in the cards router via `req.params.boardId` when the router is mounted with `{ mergeParams: true }` on the Router constructor. This is the same composition pattern established by `src/routes/index.ts` for boards (`apiRouter.use('/boards', boardsRouter)`).
4. **Alternative considered**: flat `/api/v1/cards?board_id=X`. This would require query-param parsing and is semantically weaker (board ownership is optional rather than required). It also departs from the established router-mounting pattern.

**Confidence**: MEDIUM — this is a well-justified recommendation grounded in the product model and codebase patterns, but it is an architectural decision that affects URL shape and router mounting. The `mergeParams: true` requirement on the cards Router is a non-obvious Express detail. Flagged for human review.

### Request / Response Shapes

All timestamps serialize as ISO-8601 strings via `res.json()` (same as boards — `pg` returns `Date` objects; `JSON.stringify` converts them).

#### POST /api/v1/boards/:boardId/cards — Create
Request body (JSON):
```json
{ "title": "Implement login", "description": "Optional description", "position": 0 }
```
Response `201`:
```json
{ "id": 1, "board_id": 3, "title": "Implement login", "description": null, "position": 0, "created_at": "2026-06-17T10:00:00.000Z", "updated_at": "2026-06-17T10:00:00.000Z" }
```

#### GET /api/v1/boards/:boardId/cards — List
Response `200`:
```json
[
  { "id": 1, "board_id": 3, "title": "Implement login", "description": null, "position": 0, "created_at": "...", "updated_at": "..." }
]
```
Empty list returns `[]` (not 404). Cards are ordered by `position ASC, id ASC`.

#### GET /api/v1/boards/:boardId/cards/:id — Read one
Response `200`: single card object (all columns).
Response `404`: `{ "error": "Not Found", "path": "/api/v1/boards/3/cards/99", "traceId": "..." }` — standard shape from `src/middleware/errorHandler.ts`.

#### PATCH /api/v1/boards/:boardId/cards/:id — Update
Request body (JSON, all fields optional — at least one must be present):
```json
{ "title": "Implement login v2", "position": 1 }
```
Response `200`: full updated card object.
Response `404`: standard 404 shape.
Response `400`: standard 400 shape (empty body, invalid field types, etc.).

#### DELETE /api/v1/boards/:boardId/cards/:id — Delete
Response `204 No Content`: empty body.
Response `404`: standard 404 shape.

### Input Validation Rules

Validation runs synchronously BEFORE any DB call (same contract as `src/validation/board.ts`). All violations throw `badRequest` from `src/errors.ts`, caught by `next(err)`, rendered by `errorHandler` as `400 { error: "Bad Request", path, traceId }`.

- `boardId` path param: must be a positive integer (same `validateId` rule from boards). Applied to every endpoint since the path prefix is board-scoped.
- `id` path param (read/update/delete): must be a positive integer (same `validateId` rule).
- `title` on POST: required (missing or empty string → 400). Must be a string. Max 255 characters.
- `title` on PATCH: optional (may be omitted). When present: must be a string, non-empty, ≤ 255 characters.
- `description` on POST/PATCH: optional; when present must be a string or null (other types → 400). Omitted on POST defaults to `null`.
- `position` on POST/PATCH: optional; when present must be a non-negative integer (number, integer, ≥ 0). Omitted on POST defaults to `0`. Non-integer or negative → 400.
- PATCH body: must contain at least one of `title`, `description`, or `position` (empty update → 400).
- Unrecognized extra fields: silently ignored (MVP — keep it simple, as established by `src/validation/board.ts`).

### Structured Error Response Shape

Reuses `src/errors.ts` `HttpError` factories and `src/middleware/errorHandler.ts` exactly as established in TASK-004:
```json
{ "error": "Bad Request",          "path": "/api/v1/boards/3/cards", "traceId": "abc123" }  // 400
{ "error": "Not Found",            "path": "/api/v1/boards/3/cards/99", "traceId": "abc123" } // 404
{ "error": "Internal Server Error", "traceId": "abc123" }                                       // 500
```
Internal error detail (DB error message, FK violation detail, stack) is NEVER in the response body — server-side log only, per Guiding Principle 5 in `memory-bank/systemPatterns.md`.

### Success Criteria

- **Caller receives**: correct HTTP status code + `application/json` Content-Type + response body matching the shapes above for all five operations.
- **Verifiable at**:
  - HTTP responses inspectable via `supertest` against `createApp()` (same pattern as `src/routes/boards.test.ts`).
  - Persisted rows queryable via the in-memory store in the mocked pool seam during integration tests.
- **Data persisted**: `cards` table, columns `id`, `board_id`, `title`, `description`, `position`, `created_at`, `updated_at`.
- **Observable within**: immediate (synchronous request/response; no async jobs).
- **Observability**: each request emits one structured JSON access-log line (existing `requestLogger`); route-level business events (card created/deleted) logged via `req.log.info` carrying `traceId`; no `console.*` usage.

### Acceptance Criteria

#### AC-ENTRY-1: API surface is reachable under /api/v1/boards/:boardId/cards
**Priority**: MUST
**Given** the Express app is started via `createApp()` with `DATABASE_URL` configured and a board with `id = 1` exists in the mocked store
**When** a client sends `GET /api/v1/boards/1/cards`
**Then** the response status is `200` and `Content-Type` matches `application/json`, confirming the cards router is mounted under the board-scoped path and returns JSON (not a 404 from `notFound` middleware)

**Verification**:
- [ ] Integration test: `supertest(createApp()).get('/api/v1/boards/1/cards')` → status 200, content-type JSON

#### AC-HAPPY-1: Create a card (POST /api/v1/boards/:boardId/cards)
**Priority**: MUST
**Given** a board with `boardId` exists and a client sends a valid JSON body `{ "title": "Implement login" }`
**When** they send `POST /api/v1/boards/:boardId/cards`
**Then**:
  1. Response status is `201`
  2. Response body is a card object with `id` (positive integer), `board_id` matching the path param, `title: "Implement login"`, `description: null`, `position: 0`, `created_at` and `updated_at` as valid ISO-8601 strings
  3. A subsequent `GET /api/v1/boards/:boardId/cards/:id` with the returned `id` returns the same card (data is truly persisted, not stub output)
  4. Two separate POST calls produce different `id` values (stub detection)

**Verification**:
- [ ] Integration test creates a card, asserts shape, reads it back by `id`, confirms equality; second POST yields a different `id`

#### AC-HAPPY-2: List cards for a board (GET /api/v1/boards/:boardId/cards)
**Priority**: MUST
**Given** zero or more cards exist for a given `boardId`
**When** a client sends `GET /api/v1/boards/:boardId/cards`
**Then**:
  1. Response status is `200`, Content-Type is `application/json`
  2. Response body is an array (empty `[]` when no cards exist — never 404 for empty list)
  3. When cards exist, each element contains `id`, `board_id`, `title`, `description`, `position`, `created_at`, `updated_at`
  4. Only cards belonging to the specified `boardId` are returned (not cards from other boards)
  5. Cards are ordered by `position ASC, id ASC`

**Verification**:
- [ ] Integration test: empty store → GET → `[]`; POST a card → GET → array contains new card with correct `board_id`

#### AC-HAPPY-3: Read one card (GET /api/v1/boards/:boardId/cards/:id)
**Priority**: MUST
**Given** a card with a known `id` exists under the specified `boardId`
**When** a client sends `GET /api/v1/boards/:boardId/cards/:id`
**Then**:
  1. Response status is `200`
  2. Response body matches the full card object shape (all seven fields)
  3. The `title` and `description` values match what was inserted (not a generic placeholder)

**Verification**:
- [ ] Integration test: POST a card, then GET by returned `id`, assert body fields match input

#### AC-HAPPY-4: Update a card (PATCH /api/v1/boards/:boardId/cards/:id)
**Priority**: MUST
**Given** a card exists and a client sends `PATCH /api/v1/boards/:boardId/cards/:id` with `{ "title": "Renamed" }`
**When** the request is processed
**Then**:
  1. Response status is `200`
  2. Response body reflects the updated `title: "Renamed"` and unchanged other fields
  3. A subsequent `GET /api/v1/boards/:boardId/cards/:id` returns the updated title (change is durable)
  4. `updated_at` is greater than or equal to `created_at` (timestamp updated)

**Verification**:
- [ ] Integration test: POST card, PATCH title, GET card, assert updated title and `updated_at`

#### AC-HAPPY-5: Delete a card (DELETE /api/v1/boards/:boardId/cards/:id)
**Priority**: MUST
**Given** a card exists under the specified `boardId`
**When** a client sends `DELETE /api/v1/boards/:boardId/cards/:id`
**Then**:
  1. Response status is `204` with an empty body
  2. A subsequent `GET /api/v1/boards/:boardId/cards/:id` returns `404` (card is truly removed from DB, not just logically flagged)

**Verification**:
- [ ] Integration test: POST card, DELETE it, GET it → 404

#### AC-ERROR-1: Validation rejects missing/invalid title on POST
**Priority**: MUST
**Given** a client sends `POST /api/v1/boards/:boardId/cards` with a missing `title`, empty string `title`, or `title` exceeding 255 characters
**When** the request is processed
**Then**:
  1. Response status is `400`
  2. Response body is `{ "error": "Bad Request", "path": "/api/v1/boards/1/cards", "traceId": "<string>" }` (standard error shape — no internal detail)
  3. No row is inserted into the `cards` table (validation short-circuits before DB)

**Verification**:
- [ ] Unit test for validation logic; integration test sends invalid body and asserts 400 + no DB query called

#### AC-ERROR-2: 404 for non-existent card (GET, PATCH, DELETE)
**Priority**: MUST
**Given** no card with `id = 99999` exists for the given board
**When** a client sends `GET /api/v1/boards/1/cards/99999`, `PATCH /api/v1/boards/1/cards/99999`, or `DELETE /api/v1/boards/1/cards/99999`
**Then**:
  1. Response status is `404`
  2. Response body is `{ "error": "Not Found", "path": "/api/v1/boards/1/cards/99999", "traceId": "<string>" }`
  3. Response body contains no internal DB error detail, FK constraint names, or stack traces

**Verification**:
- [ ] Integration test for each of the three verbs with a non-existent `id`

#### AC-ERROR-3: 400 for non-integer :id or :boardId path parameter
**Priority**: MUST
**Given** a client sends `GET /api/v1/boards/abc/cards` or `GET /api/v1/boards/1/cards/xyz`
**When** the request is processed
**Then**:
  1. Response status is `400`
  2. Response body follows the standard error shape with `"error": "Bad Request"`
  3. No DB query is executed (validation short-circuits before hitting the pool)

**Verification**:
- [ ] Unit test for id/boardId validation; integration test with string params asserts 400 and `mockQuery` not called

#### AC-ERROR-4: PATCH with empty body returns 400
**Priority**: MUST
**Given** a card exists and a client sends `PATCH /api/v1/boards/1/cards/:id` with `{}` (empty object)
**When** the request is processed
**Then**:
  1. Response status is `400` (no fields to update — ambiguous intent)
  2. No DB update query is executed

**Verification**:
- [ ] Integration test: POST card, PATCH with `{}`, assert 400 and `mockQuery` not called for update

#### AC-ERROR-5: POST with invalid position returns 400
**Priority**: MUST
**Given** a client sends `POST /api/v1/boards/1/cards` with `{ "title": "X", "position": -1 }` or `{ "title": "X", "position": "top" }`
**When** the request is processed
**Then**:
  1. Response status is `400`
  2. No row inserted

**Verification**:
- [ ] Unit test for position validation; integration test with invalid position asserts 400

#### AC-OBS-1: Route handlers use req.log for all logging — no console.*
**Priority**: MUST
**Given** any cards endpoint is called
**When** the response is returned
**Then**:
  1. All log output is emitted via `req.log` (pino child logger — carries `traceId`/`spanId`)
  2. Zero calls to `console.log`, `console.error`, or `console.warn` occur
  3. The access-log line emitted by `requestLogger` carries `traceId`, `method`, `path`, `statusCode`, `durationMs`

**Verification**:
- [ ] Integration test with `jest.spyOn(console, 'log')` etc. (established AC-OBS-1 pattern from `src/routes/boards.test.ts`); assert 0 calls across all five endpoints

#### AC-OBS-2: Error responses never leak internal DB detail
**Priority**: MUST
**Given** a DB error occurs during any cards operation (e.g., connection failure, FK constraint violation)
**When** the error is returned to the client
**Then**:
  1. Response body contains only `{ "error": "Internal Server Error", "traceId": "..." }` (no `err.message`, no stack, no DSN fragment, no pg constraint names)
  2. The DB error IS logged server-side via `req.log.error(...)` with the full `err` object

**Verification**:
- [ ] Integration test mocking `getPool().query` to reject; assert 500 body has no internal detail (substring check as in `boards.test.ts`)

### Scope Boundaries

- **In scope**:
  - `cards` table migration (new timestamped JS file in `migrations/`, using `node-pg-migrate` — the established pattern from TASK-004 Phase 1)
  - Five REST endpoints: POST create, GET list (board-scoped), GET read-one, PATCH update, DELETE delete
  - Input validation (`title` required/max-length, `boardId`/`id` positive integer, `position` non-negative integer, PATCH must have at least one field)
  - Structured JSON error responses using the existing `errorHandler` + `notFound` + `HttpError` machinery from `src/errors.ts` and `src/middleware/`
  - Observability: `req.log`-based structured logging; no `console.*`
  - Unit tests for validation logic (`src/validation/card.test.ts`, no DB required)
  - Integration tests against mocked `getPool().query` backed by an in-memory store (`src/routes/cards.test.ts`) — same pattern as `src/routes/boards.test.ts`
  - Registering the cards router in `src/routes/index.ts` under `/boards/:boardId/cards`
  - `express.json()` scoped to the cards router (same pattern as boards, per the `api-design` learned rule)

- **Out of scope**:
  - Authentication / authorization (MVP: no auth guard)
  - Column model (columns are a separate future domain; `position` is a simple integer for now)
  - Labels, due dates, assignees (future features referenced in `productBrief.md` but not in this task)
  - Soft-delete / card archiving (hard DELETE only for MVP)
  - Pagination of the list endpoint
  - Bulk operations (bulk-delete cards when a board is deleted is handled by ON DELETE CASCADE at the DB level — no application code needed)
  - Drag-and-drop ordering algorithm (position column included for future use; ordering semantics are deferred)
  - Moving a card between boards (changing `board_id` via PATCH) — not in scope for MVP; cards live on one board
  - OpenTelemetry SDK / OTLP export
  - OpenAPI specification (noted as future work in TASK-004 reflection; cards would be a natural milestone to introduce it — deferred)

- **Dependencies**:
  - `src/db/pool.ts` — `getPool()` provides the `pg.Pool` singleton (FEAT-002, complete)
  - `src/config/env.ts` — `config.databaseUrl` (FEAT-001, complete)
  - `src/middleware/errorHandler.ts` + `src/middleware/notFound.ts` — error shape (FEAT-001 Phase 4, complete)
  - `src/errors.ts` — `HttpError`, `badRequest()`, `notFoundError()` factories (TASK-004 Phase 2, complete)
  - `src/routes/index.ts` — composition root for mounting the cards router
  - `boards` table (`id` column) — FK target for `cards.board_id` (TASK-004, complete and merged)
  - `src/validation/board.ts` `validateId` — reuse directly or copy the pattern for card/board id validation

- **NFR implications** (from `productBrief.md`):
  - Performance: p95 < 150 ms for reads, < 300 ms for writes (single-team scale, local DB)
  - Security: no internal error detail in responses (Guiding Principle 5); no PII in cards (task titles/descriptions are not regulated data)
  - No auth guard in MVP (documented risk in `productBrief.md`)

### Creative Exploration Needed

**Yes — two LOW-confidence areas require a human decision before implementation begins:**

**1. Board-scoped URL path vs. flat URL path for the cards endpoints**

Recommendation in this spec: `/api/v1/boards/:boardId/cards` (board-scoped). This is a MEDIUM-confidence recommendation grounded in the product model (cards belong to boards) and REST resource hierarchy conventions. However, it requires `Router({ mergeParams: true })` on the cards Router so `req.params.boardId` is accessible inside the cards router — a non-obvious Express detail that TASK-004 did not need.

The alternative (flat `/api/v1/cards` with `?board_id=` query param or `board_id` in the request body) avoids the `mergeParams` detail and is simpler to mount. The trade-off: URL semantics are weaker (board ownership optional rather than structural), and it diverges from conventional REST resource hierarchy.

**Decision needed**: confirm the board-scoped path (`/boards/:boardId/cards`) or choose the flat path (`/cards`). Either choice unlocks implementation.

**2. How to handle a POST with a board_id referencing a non-existent board**

With the board-scoped URL path, the `boardId` path param is validated as a positive integer before the DB call. But the question is: should the route handler additionally verify the board exists (a pre-flight `SELECT` on `boards` before `INSERT` into `cards`) or rely on PostgreSQL's FK constraint violation (pg error code `23503`) to signal the bad `board_id`?

- **Pre-flight check**: adds one extra SELECT per POST but gives a clean, consistent 400 before the INSERT. Simpler error handling in the route layer.
- **FK violation catch**: catches the `23503` pg error code after the failed INSERT and maps it to 400. Zero extra DB roundtrip but requires specific pg error-code handling in the route layer.

**Decision needed**: pre-flight SELECT vs. FK-violation catch. Both satisfy the spec (400 response when `board_id` doesn't exist). The pre-flight SELECT is more consistent with the validation-before-DB principle established throughout the codebase (`src/validation/board.ts`; "VALIDATE BEFORE DB" comment in `src/routes/boards.ts`). Recommend pre-flight SELECT but flagging for human confirmation.

#### Decisions (resolved during planning, 2026-06-17)

All three open questions were resolved by human decision during `/banyan-plan`; the recommendations were accepted. No `/banyan-creative` phase is required — the specification is now fully concrete.

1. **URL path → board-scoped `/api/v1/boards/:boardId/cards` (Approach: board-scoped).** Cards mount as a child resource of boards. The cards `Router` is constructed with `{ mergeParams: true }` so `req.params.boardId` is visible inside the cards router, and is registered via `apiRouter.use('/boards/:boardId/cards', cardsRouter)` in `src/routes/index.ts`. `boardId` is validated as a positive integer (reusing `validateId`) on every endpoint.

2. **Non-existent `board_id` on POST → pre-flight `SELECT` (Approach: pre-flight check).** Before inserting a card, the handler verifies the parent board exists via `findById(boardId)` against the boards data-access layer. Absent board → `notFoundError` (404, since the board-scoped resource path itself is not found). This is consistent with the validate-before-DB principle and avoids relying on pg error-code (`23503`) interpretation in the route layer. The DB-level `ON DELETE CASCADE` FK still guarantees referential integrity for board deletion.

3. **Schema includes `position` → included now (`position INTEGER NOT NULL DEFAULT 0`).** Stored, returned, and used for list ordering (`ORDER BY position ASC, id ASC`). The drag-and-drop ordering *algorithm* (how position is recomputed on reorder) remains out of scope; the column is added now to avoid a future migration.

## Test Strategy

### Approach

- **Emphasis**: Integration-weighted balanced — identical rationale to TASK-004. The feature's value is observable HTTP behavior against the mocked `pg.Pool` seam, so integration tests (`supertest` + `createApp()`) carry the most weight; pure validation logic is covered by fast unit tests. Matches `systemPatterns.md` § Testing Patterns and the `testing-patterns` learned rule (in-memory store behind the mocked `getPool().query`).
- **Target test count**: ~22 total across phases. Justified by 5 endpoints × (happy + error paths) + board-scoping assertions (cards isolated per board) + pre-flight-board-existence path + `position` validation + 2 observability ACs + a unit suite for validation. Slightly above the boards count (18) due to the added `boardId` dimension and `position` field; still within the multi-component feature range.

### File Organization

- **New test files**:
  - `src/validation/card.test.ts` — unit tests for the card input-validation functions (no DB). Covers `title` (required/empty/length/type), `description` type, `position` (non-negative integer), PATCH-body at-least-one-field, and `boardId`/`id` positive-integer rules (the last reusing `validateId`).
  - `src/routes/cards.test.ts` — integration tests for the five endpoints + error + observability ACs, using the `supertest(createApp())` + mocked `getPool().query` backed by an in-memory store pattern from `src/routes/boards.test.ts`. The in-memory store must model BOTH `boards` (so the pre-flight board-existence check and `ON DELETE CASCADE` semantics are exercisable) and `cards`, and must filter cards by `board_id` for the list/read/scoping ACs.
- **Extend existing**:
  - `src/routes/index.ts` is covered transitively by `cards.test.ts` (AC-ENTRY-1 asserts the cards router is mounted). No separate index test needed (mirrors TASK-004).

### What NOT to Test

- `node-pg-migrate`, the `pg` driver, and PostgreSQL FK-constraint enforcement itself — third-party; the migration up/down is smoke-verified against Docker Postgres in Phase 1 (CI), not in the Jest suite.
- `errorHandler` / `notFound` / `requestLogger` middleware behavior — already covered by FEAT-001 Phase 4 tests; cards tests assert the *resulting* status/shape, not the middleware internals.
- `src/errors.ts`, `config/env.ts`, `db/pool.ts` — already unit-tested (TASK-004 / FEAT-001 / FEAT-002).
- `validateId` internals when reused unchanged — already unit-tested in `src/validation/board.test.ts`; card tests assert its *effect* (400 on bad `boardId`/`id`), not re-test the regex.
- TypeScript-enforced type guarantees — no tests for what the compiler proves.

### Per-Phase Test Guidance

- **Phase 1 (migration + `cards` table)**: ~1 check (smoke). Verify `npm run migrate` applies the `cards` migration against the local Docker Postgres (table shape + FK to `boards(id)` with `ON DELETE CASCADE`) and that `npm run migrate:down` reverts it. Primarily manual/CI verification — no Jest suite. The table is exercised transitively by Phase 3.
- **Phase 2 (data-access + validation)**: ~9 unit tests in `src/validation/card.test.ts` — missing `title`, empty `title`, `title` > 255, non-string `title`, invalid `description` type, `position` negative, `position` non-integer/non-number, empty PATCH body, and a valid-input pass-through. (`boardId`/`id` validation reuses `validateId`, already covered — assert one delegation case at most.)
- **Phase 3 (routes + registration)**: ~12 integration tests in `src/routes/cards.test.ts` — AC-ENTRY-1; AC-HAPPY-1..5 incl. persistence/stub-detection round-trips and per-board isolation (AC-HAPPY-2.4: a card created under board A does not appear when listing board B); pre-flight board-existence (POST to a non-existent `boardId` → 404, no card inserted); AC-ERROR-1 (`title`), AC-ERROR-2 (404 on GET/PATCH/DELETE), AC-ERROR-3 (non-integer `:id`/`:boardId`), AC-ERROR-4 (empty PATCH), AC-ERROR-5 (`position`); AC-OBS-1 (zero `console.*`), AC-OBS-2 (DB error → 500, no internal detail). This phase delivers the complete entry-to-success flow.

## Implementation Roadmap

- [x] **Phase 1: `cards` table migration.** Author a new `node-pg-migrate` migration (via `npm run migrate:create -- create-cards-table`) creating the `cards` table per § cards Table Schema: `id` SERIAL PK, `board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE`, `title VARCHAR(255) NOT NULL`, `description TEXT`, `position INTEGER NOT NULL DEFAULT 0`, `created_at`/`updated_at` TIMESTAMPTZ DEFAULT NOW(). Use `pgm.createTable(..., { ifNotExists: true })` with a `references: 'boards'` + `onDelete: 'CASCADE'` column spec (mirror `migrations/1781743422435_create-boards-table.js`); `down` drops the table. No new tooling/deps (node-pg-migrate + migrate scripts already exist from TASK-004). Verify up→down→up against the local Docker Postgres. _Note: a `board_id` index is created implicitly only on the PK side; add an explicit index on `cards(board_id)` since list queries filter by it._
- [x] **Phase 2: Card data-access module + input validation (TDD).** Add `src/db/cards.ts` with parameterized query functions (`create`, `listByBoard(boardId)`, `findById`, `update`, `remove`) over the `cards` table using `getPool()` — mirror `src/db/boards.ts` (RETURNING_COLUMNS incl. `board_id`/`position`; list ordered `position ASC, id ASC`; `findById`/`update` return `Card | null`; `remove` returns boolean). Add `src/validation/card.ts` with `validateCreate`, `validateUpdate` (throwing `badRequest` from `src/errors.ts`) and reuse `validateId` from `src/validation/board.ts` for `boardId`/`id` (it is domain-agnostic). Write `src/validation/card.test.ts` FIRST (Phase 2 unit tests), then implement.
- [ ] **Phase 3: Card CRUD routes + registration + integration tests (TDD).** Add `src/routes/cards.ts` — `Router({ mergeParams: true })`, `express.json()` scoped to the router, five async handlers with validate-before-DB, the **pre-flight board-existence check** on POST (`findById(boardId)` on boards → 404 if absent), `notFoundError` for absent cards, try/catch→`next(err)`, business events via `req.log.info`, zero `console.*`. Register via `apiRouter.use('/boards/:boardId/cards', cardsRouter)` in `src/routes/index.ts`. Write `src/routes/cards.test.ts` FIRST (in-memory store modelling boards + cards, per-board filtering), then implement. Delivers the complete entry-to-success flow; satisfies all ACs.

### Observability Requirements

- **Applies**: Yes → build agents must reference `${CLAUDE_PLUGIN_ROOT}/context/observability-requirements.md`.
- **Logging**: Each request emits one structured JSON access-log line (existing `requestLogger`); route handlers log business events (card created/updated/deleted) and errors via `req.log` (pino child carrying `traceId`/`spanId`). Zero `console.*` (AC-OBS-1).
- **Tracing**: W3C trace context already propagated by existing middleware; handlers reuse `req.log` so logs carry `traceId`/`spanId`. No new tracing surface.
- **Metrics**: None added in this task.

### API Requirements

- **REST API**: Yes → build agents must load `${CLAUDE_PLUGIN_ROOT}/context/api-rest-requirements.md`. Five new endpoints under `/api/v1/boards/:boardId/cards` (see Specification → Invocation Method).
- **OpenAPI Spec**: None currently in the repo. Deferred (consistent with TASK-004). Document endpoint contracts in code/tests per `api-rest-requirements.md`.

## Creative Phases

- [x] None required — the three open design decisions (URL path, FK-violation handling, `position` field) were resolved during planning by human decision. See § Creative Exploration Needed → Decisions.

---

## Execution State

**Build Status**: COMPLETE (Phase 2/3)
**Current Phase**: BUILD
**Current Step**: Phase 2 complete — ready for /banyan-build (Phase 3: routes + registration + integration tests)
**Phase Number**: 2 of 3
**Is Multi-Phase**: YES
**Last Completed**: BUILD Phase 2/3 (2026-06-17)
**Can Resume**: NO

### Active Sub-Agents
(none)

### Build Phase 1 Summary

- Branch `feature/FEAT-004-card-model-crud` created off master.
- Migration `migrations/1781746875601_create-cards-table.js`: `cards` table per § cards Table Schema — `id` SERIAL PK, `board_id` INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE, `title` varchar(255) NOT NULL, `description` text, `position` integer NOT NULL DEFAULT 0, `created_at`/`updated_at` timestamptz NOT NULL DEFAULT NOW(). Explicit index `cards_board_id_index` on `board_id` (FK column not auto-indexed by Postgres; list query filters by it). `{ ifNotExists: true }` create; `down` drops the table.
- Verified up→down→up against local Docker Postgres; `\d cards` matches spec exactly (FK CASCADE + index confirmed).
- Build: PASS (tsc clean — migrations excluded from src/ compile). Full suite 71/71 (no regression — Phase 1 is infra, no new Jest suite per Test Strategy; table exercised transitively in Phase 3). Lint: N/A (no lint script).
- Remaining: Phase 2 (data-access `src/db/cards.ts` + validation `src/validation/card.ts` + unit tests), Phase 3 (routes + registration + integration tests).

### Build Phase 2 Summary

- `src/validation/card.test.ts` written FIRST (TDD): 19 unit tests — `validateCreate` (missing/empty/over-long/non-string `title`, invalid `description` type, negative/string/fractional `position`, valid pass-through with `description→null`/`position→0` defaults, 255-char boundary + extra-field-ignore), `validateUpdate` (empty body, unrecognized-only, over-long `title`, negative `position`, title-only / description-null / position-only partials), and `validateId` delegation (non-integer reject, valid parse).
- `src/validation/card.ts`: mirrors `board.ts` contract — `validateCreate` (title required + ≤255, description string|null→null, position non-negative integer→0), `validateUpdate` (≥1 of title/description/position; `description:null` clears), private `checkTitle`/`checkDescription`/`checkPosition` helpers throwing `badRequest`. Re-exports domain-agnostic `validateId` from `./board` so the Phase-3 cards router imports all card validation from one site.
- `src/db/cards.ts`: parameterized data-access mirroring `db/boards.ts` — `Card` interface (incl. `board_id`/`position`), `RETURNING_COLUMNS` incl. both; `create` (INSERT board_id/title/description/position), `listByBoard(boardId)` (WHERE board_id ORDER BY position ASC, id ASC), `findById(id)→Card|null`, `update(id,params)` (dynamic SET + `updated_at=NOW()`), `remove(id)→boolean`. All bound params — SQL-injection-safe; no validation/HTTP concerns.
- Verification: card unit suite 19/19 PASS; full suite **90/90** (71 prior + 19 new — no regression). Build (`tsc`): clean. Lint: N/A (no lint script). Code-level security: parameterized queries only; no `console.*`.
- Remaining: Phase 3 (routes `src/routes/cards.ts` with `mergeParams` + pre-flight board-existence check + registration in `src/routes/index.ts` + integration tests `src/routes/cards.test.ts`).

### Completed Steps
- Step 0/0.1 Auto-provisioning: COMPLETE (2026-06-17) — TASK-005 created for FEAT-004 (Card model), Level 2 inherited; branch feature/FEAT-004-card-model-crud
- Step 0.5 Agent Rules Index: COMPLETE (2026-06-17) — reindexed (5 learned rules, testing-patterns promoted to medium); no unsafe rules, no conflicts
- Step 3 Spec Writer Agent (Sonnet): COMPLETE (2026-06-17) — full Specification drafted (12 ACs); flagged 3 design questions
- Step 3.2 Human Review: COMPLETE (2026-06-17) — spec approved; 3 decisions resolved (board-scoped path; pre-flight board SELECT; include `position` column)
- Step 4 Codebase Analysis: COMPLETE (2026-06-17) — mirrored boards layer (routes/index.ts, boards.ts, db/boards.ts, validation/board.ts, errors.ts, migration, boards.test.ts); confirmed migrate tooling + validateId reuse
- Step 5 Implementation Plan: COMPLETE (2026-06-17) — Test Strategy (~22 tests) + 3-phase Roadmap finalized
- Step 6 Finalize: COMPLETE (2026-06-17) — validation gate passed; no creative phase; Status=PLANNING_COMPLETE
- BUILD Phase 1/3: COMPLETE (2026-06-17) — `cards` table migration authored + up→down→up verified against Docker Postgres; FK CASCADE + board_id index confirmed; build clean; 71/71 suite (no regression); committed to feature branch
- BUILD Phase 2/3: COMPLETE (2026-06-17) — `src/validation/card.ts` + `src/db/cards.ts` + `src/validation/card.test.ts` (TDD, tests first); 19 new unit tests; full suite 90/90 (no regression); build clean; committed to feature branch

### Prior State (PLAN)
- PLAN: Spec Writer Agent drafted specification (Sonnet)
- PLAN: Human review — spec approved; 3 design decisions resolved during planning
- PLAN: Test Strategy + Implementation Roadmap finalized (3 phases)
