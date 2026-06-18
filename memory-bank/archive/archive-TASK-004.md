# Archive: Board model with CRUD endpoints

## Metadata

- **Task ID**: TASK-004
- **Complexity**: Level 2 (no creative phase — migration mechanism resolved at planning time)
- **Roadmap**: FEAT-005
- **Branch**: feature/FEAT-005-board-model-crud
- **Completed**: 2026-06-17
- **Reflection**: `memory-bank/reflection/reflection-TASK-004.md`
- **Creative**: None (the sole LOW-confidence design decision — migration mechanism — was resolved by human decision during planning: node-pg-migrate)

## Summary

Delivered a complete Board domain model with five REST endpoints under `/api/v1/boards`
(POST create → 201, GET list → 200, GET /:id read-one → 200/404, PATCH /:id update →
200/404/400, DELETE /:id → 204/404), the underlying `boards` PostgreSQL table created via
`node-pg-migrate`, a typed parameterized data-access layer, and synchronous input validation
that short-circuits before any database interaction. This establishes the `boards` table that
FEAT-004 (Cards) will reference via foreign key, and it establishes `node-pg-migrate` as the
project's canonical schema-evolution path for all subsequent domain features.

All ten MUST acceptance criteria were satisfied with direct behavioral test evidence. The full
suite went from 53 → 71 passing (+18 integration, after +15 validation units in Phase 2),
`tsc` builds clean under strict + `noUncheckedIndexedAccess`, the 500 path was dual-asserted to
leak no internal DB detail (AC-OBS-2), and all route logging is via `req.log` (zero `console.*`,
AC-OBS-1). Delivered across three clean phases with zero mid-phase reversals and no scope creep.

## Solution

Three-phase implementation, each ending with a green build and a commit:

### Phase 1 — Migration tooling + `boards` table
- Added `node-pg-migrate ^7.9.1` (prod dep) and npm scripts `migrate` / `migrate:down` /
  `migrate:create`, all driven by `DATABASE_URL` (12-Factor, no hardcoded DSN). The runner
  tracks applied migrations in a `pgmigrations` table.
- `migrations/1781743422435_create-boards-table.js` (CommonJS, lives **outside** `src/` so
  `tsc` does not compile it): `up` creates `boards` (`id` SERIAL PK, `name` varchar(255) NOT
  NULL, `description` text, `created_at`/`updated_at` timestamptz NOT NULL DEFAULT NOW()),
  `down` drops it.
- Verified up → `\d boards` matches the spec schema exactly → `migrate:down` drops cleanly →
  re-applied up, against the local Docker Postgres.

### Phase 2 — Data-access module + input validation
- `src/errors.ts` (NEW): shared `HttpError extends Error` carrying numeric `status`, recognized
  by the existing FEAT-001 `errorHandler` via `.status`; `badRequest()` → 400 and
  `notFoundError()` → 404 factories; `Object.setPrototypeOf` for stable `instanceof` across
  TypeScript transpilation. Descriptive messages are server-log only — the errorHandler emits
  the safe label and never echoes `message`.
- `src/validation/board.ts` (NEW): pure synchronous validators run before any DB call —
  `validateCreate`, `validateUpdate` (≥1 of name/description must be present), `validateId`
  (`/^[0-9]+$/` + `> 0`, rejecting non-int/zero/negative before any pool query).
- `src/db/boards.ts` (NEW): typed parameterized CRUD over `getPool()` — `create`, `list`
  (ORDER BY id ASC, `[]` when empty), `findById` (→ Board | null), `update` (dynamic SET from a
  fixed recognized-column whitelist with bound placeholders; always bumps `updated_at = NOW()`),
  `remove` (→ boolean). No HTTP/Express concerns — a pure data layer, SQLi-safe by construction.

### Phase 3 — CRUD routes + registration + integration tests
- `src/routes/boards.ts` (NEW): the five endpoints with `express.json()` mounted on **this
  router only** (boards is the sole body-accepting domain — keeps `app.ts` composition intact).
  Handler discipline: validate-before-DB, missing-row → 404 via `notFoundError`, every thrown
  or rejected error funneled through `next(err)` to the single `errorHandler`; business events
  (board created/updated/deleted) via `req.log.info`; zero `console.*`.
- `src/routes/index.ts` (MODIFIED): `apiRouter.use('/boards', boardsRouter)` registered,
  fulfilling the long-standing placeholder comment.

### Key Technical Decisions

1. **`node-pg-migrate` for schema migrations (Approach 2 of 3)** — resolved during planning
   over inline `CREATE TABLE IF NOT EXISTS` (no versioning/rollback) and a docker-compose
   `init.sql` mount (only runs on first container creation). Now the canonical schema-evolution
   path inherited by FEAT-004 and all later domains.
2. **`express.json()` scoped to the boards router, not `app.ts`** — avoids a global side-effect
   on a handler stack that currently has no other body-accepting consumers, keeping `app.ts`
   composition documentation unchanged. Trade-off: a second body-accepting domain will need its
   own mount or a refactor to global at that time.
3. **In-memory fake store behind the mocked pool seam in integration tests** — the test mock
   implements a tiny `Map<number, Board>` + auto-increment counter that interprets the five SQL
   statements, so persistence ACs (create-then-read-back, delete-then-404) and stub-detection
   (two POSTs → distinct ids) are genuinely behavioral, not structural assertions.
4. **Shared `HttpError` factory** — centralizes typed error creation across the validation and
   route layers; plugs into the existing `errorHandler` `.status` protocol with no middleware change.

## Files Changed

- `package.json` — `node-pg-migrate ^7.9.1` dep + `migrate` / `migrate:down` / `migrate:create` scripts
- `migrations/1781743422435_create-boards-table.js` — NEW: `up`/`down` for the `boards` table (CommonJS, outside `src/`)
- `src/errors.ts` — NEW: shared `HttpError` + `badRequest` / `notFoundError` factories
- `src/validation/board.ts` — NEW: `validateCreate` / `validateUpdate` / `validateId` (throw `HttpError` 400)
- `src/validation/board.test.ts` — NEW: 15 unit tests (no DB/Express)
- `src/db/boards.ts` — NEW: parameterized `create` / `list` / `findById` / `update` / `remove`
- `src/routes/boards.ts` — NEW: five `/api/v1/boards` endpoints; router-scoped `express.json()`; validate-before-DB; `req.log` logging
- `src/routes/boards.test.ts` — NEW: 18 integration tests (mocked `../db/pool` seam backed by an in-memory store)
- `src/routes/index.ts` — MODIFIED: registered `apiRouter.use('/boards', boardsRouter)`
- `memory-bank/techContext.md` — Data Layer note updated (migrations now canonical via node-pg-migrate) + 3 new Development Commands rows

## Acceptance Criteria

All 10 MUST criteria satisfied with direct evidence — see reflection AC table:

- **AC-ENTRY-1** (API surface reachable): MET — `GET /api/v1/boards` → 200 JSON
- **AC-HAPPY-1** (create board): MET — shape + read-back equality + two POSTs distinct ids (stub detection)
- **AC-HAPPY-2** (list boards): MET — empty `[]`; POST then list contains new board
- **AC-HAPPY-3** (read one): MET — POST then GET by id; name/description match input
- **AC-HAPPY-4** (update board): MET — PATCH name persists on re-GET; `updated_at >= created_at`
- **AC-HAPPY-5** (delete board): MET — 204 empty body; subsequent GET → 404 (row genuinely removed)
- **AC-ERROR-1** (invalid/missing name → 400): MET — standard error shape; DB never reached
- **AC-ERROR-2** (non-existent id → 404 on GET/PATCH/DELETE): MET — standard shape, no internal detail
- **AC-ERROR-3** (non-integer/zero `:id` → 400): MET — short-circuits before DB query
- **AC-ERROR-4** (empty PATCH body → 400): MET — no DB update issued
- **AC-OBS-1** (zero `console.*`): MET — console spies assert 0 calls across all endpoints
- **AC-OBS-2** (no internal DB detail leak): MET — `query` rejection → 500 body only `{error, traceId}`, DSN fragment absent (dual-asserted)

## Lessons Learned

- **Planning-time resolution of LOW-confidence design decisions eliminates creative-phase
  overhead for Level 2.** The Spec Writer flagged the migration mechanism as LOW-confidence and
  documented three options; the human decision (node-pg-migrate) was recorded in the task file
  before any build phase started — zero design ambiguity across three build phases, no creative
  phase required.
- **Three-phase Level 2 tasks are viable orchestrator-direct when phases have clean interfaces.**
  Each phase had a defined output artifact and its own verification step (Phase 1: migration
  up/down; Phase 2: unit tests; Phase 3: integration tests + tsc clean). No phase bled scope.
- **An in-memory fake behind the mocked pool seam makes persistence/stub-detection ACs
  meaningful.** Simple fixed-response mocks cannot satisfy "created board is genuinely
  retrievable later" or "two POSTs yield distinct ids" — this extended `testing-patterns` to a
  4th evidence point.
- **Compounding return on continuous learning is visible:** four learned rules
  (testing-patterns, api-design, error-handling, typescript-config) were applied in Phase 3
  without re-derivation.
- **Recurring friction (carried forward):** by-task session logs remain absent
  (`.agent-logs/claude/by-task/TASK-004/` unpopulated) for the fourth consecutive task, so the
  reflection had no quantitative tool-call/duration metrics. Open since TASK-001.

## Notes

- **Unblocks FEAT-004 (Cards):** the `boards.id` column is the FK target for `cards.board_id`.
- **Carried follow-up (security debt):** `node-pg-migrate` adds 13 transitive packages with
  19 moderate / 2 high dev-tree `npm audit` findings. These are in the **dev** dependency tree
  (the migration runner is a CLI used in CI, not in the production runtime bundle), but should be
  triaged before the first production deployment. See § Security Debt in `projectbrief.md` for
  the existing SEC-DEBT-1 entry of the same character.
- **Out of scope** (cleanly deferred): authentication/authorization, pagination of the list
  endpoint, soft-delete/archiving, bulk operations, search/filter, OpenAPI spec, OTLP export.
- **Future work flagged in reflection:** evaluate refactoring `express.json()` to `app.ts`-level
  when a second body-accepting domain (Cards) arrives; introduce an OpenAPI spec at the FEAT-004
  milestone; add list-endpoint pagination as board counts grow.
