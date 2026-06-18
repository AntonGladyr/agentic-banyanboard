# Archive: Card model with CRUD endpoints

## Metadata

- **Task ID**: TASK-005
- **Complexity**: Level 2 (no creative phase — both design decisions resolved at planning time)
- **Roadmap**: FEAT-004
- **Branch**: feature/FEAT-004-card-model-crud
- **Completed**: 2026-06-18
- **Reflection**: `memory-bank/reflection/reflection-TASK-005.md`
- **Creative**: None (the two LOW/MEDIUM-confidence design decisions — board-scoped URL path and pre-flight board-existence check — were resolved by human decision during planning)

## Summary

Delivered a complete Card domain model with five **board-scoped** REST endpoints under
`/api/v1/boards/:boardId/cards` (POST create → 201, GET list → 200, GET /:id read-one →
200/404, PATCH /:id update → 200/404/400, DELETE /:id → 204/404), the underlying `cards`
PostgreSQL table created via `node-pg-migrate` with a `board_id` foreign key
(`REFERENCES boards(id) ON DELETE CASCADE`), a typed parameterized data-access layer, and
synchronous input validation that short-circuits before any database interaction. The cards
layer faithfully mirrors the Board layer established in TASK-004, while introducing two patterns
the codebase had not previously needed: `Router({ mergeParams: true })` for nested-resource
routing, and a pre-flight parent-existence check before inserting a child FK row.

All twelve MUST acceptance criteria were satisfied with direct behavioral test evidence. The full
suite went from 71 → 113 passing (+19 validation units in Phase 2, +23 integration in Phase 3),
`tsc` builds clean under strict + `noUncheckedIndexedAccess`, the 500 path was dual-asserted to
leak no internal DB detail (AC-OBS-2), and all route logging is via `req.log` (zero `console.*`,
AC-OBS-1). Delivered across three clean phases with zero mid-phase reversals and no scope creep.

## Solution

Three-phase implementation, each ending with a green build and a commit:

### Phase 1 — `cards` table migration
- `migrations/1781746875601_create-cards-table.js` (CommonJS, lives **outside** `src/` so
  `tsc` does not compile it): `up` creates `cards` (`id` SERIAL PK,
  `board_id` integer NOT NULL `references: 'boards'` + `onDelete: 'CASCADE'`,
  `title` varchar(255) NOT NULL, `description` text, `position` integer NOT NULL DEFAULT 0,
  `created_at`/`updated_at` timestamptz NOT NULL DEFAULT NOW()), plus an explicit
  `cards_board_id_index` on `board_id` (FK columns are not auto-indexed by Postgres and the
  board-scoped list query always filters by `board_id`); `down` drops the table (and its
  dependent index). No new tooling/deps — reused the `node-pg-migrate` scripts from TASK-004.
- Verified up → `\d cards` matches the spec schema exactly (FK CASCADE + index confirmed) →
  `migrate:down` drops cleanly → re-applied up, against the local Docker Postgres.

### Phase 2 — Data-access module + input validation (TDD)
- `src/validation/card.ts` (NEW): pure synchronous validators run before any DB call —
  `validateCreate` (title required/string/non-empty/≤255; description optional string|null,
  omitted → null; position optional non-negative integer, omitted → 0), `validateUpdate`
  (≥1 of title/description/position must be present; `description: null` clears). Re-exports the
  domain-agnostic `validateId` from `./board` so the cards router imports all card validation
  from a single site.
- `src/db/cards.ts` (NEW): typed parameterized CRUD over `getPool()` — `create`,
  `listByBoard(boardId)` (WHERE board_id, ORDER BY position ASC, id ASC), `findById`
  (→ Card | null), `update(id, params)` (dynamic SET from a fixed recognized-column whitelist;
  always bumps `updated_at = NOW()`), `remove` (→ boolean). `board_id`/`position` in
  `RETURNING_COLUMNS`. No HTTP/Express concerns — a pure data layer, SQLi-safe by construction.
- `src/validation/card.test.ts` (NEW, authored first): 19 unit tests, no DB/Express.

### Phase 3 — CRUD routes + registration + integration tests (TDD)
- `src/routes/cards.ts` (NEW): five board-scoped endpoints on a `Router({ mergeParams: true })`
  (so the parent-mount `:boardId` is visible via `req.params`), with `express.json()` mounted on
  **this router only**. Handler discipline: validate-before-DB (`validateId(boardId)` +
  `validateCreate`/`validateUpdate`/`validateId(id)` throw 400 before any pool query); a
  **pre-flight board-existence check** on POST (`findById` re-imported as `findBoardById` from
  `db/boards` → `notFoundError` 404 if absent, before insert — no orphan card, no reliance on
  pg FK violation code `23503`); missing-row → 404 via `notFoundError`; every thrown or rejected
  error funneled through `next(err)` to the single `errorHandler`; business events (card
  created/updated/deleted) via `req.log.info`; zero `console.*`; `req.params.boardId/id ?? ''`
  for `noUncheckedIndexedAccess`.
- `src/routes/index.ts` (MODIFIED): `apiRouter.use('/boards/:boardId/cards', cardsRouter)`
  registered alongside the boards mount.
- `src/routes/cards.test.ts` (NEW, authored first): 23 integration tests via
  `supertest(createApp())` with the `../db/pool` seam mocked; the mocked `getPool().query` is
  backed by a **two-entity** in-memory store modelling both `boards` (for the pre-flight check)
  and `cards` (per-board filtering + `position ASC, id ASC` ordering).

### Key Technical Decisions

1. **Board-scoped URL path `/api/v1/boards/:boardId/cards` with `Router({ mergeParams: true })`**
   — chosen during planning over the flat `/api/v1/cards?board_id=X` alternative. Makes board
   ownership structural in the URL, aligns with the product model ("open board → view cards"),
   and follows REST resource-hierarchy conventions. `mergeParams: true` is the non-obvious Express
   detail that exposes the parent-mount `:boardId` inside the child router. First use of nested
   router composition in the project.
2. **Pre-flight board-existence SELECT before INSERT** — chosen during planning over catching
   PostgreSQL FK violation code `23503`. Consistent with the validate-before-DB principle; returns
   a clean 404 without pg-specific error-code branching in the route layer. The DB-level
   `ON DELETE CASCADE` still enforces referential integrity for board deletion, so the two serve
   complementary roles.
3. **`position INTEGER NOT NULL DEFAULT 0` included now** — stored, returned, and used for list
   ordering (`ORDER BY position ASC, id ASC`). The drag-and-drop ordering *algorithm* remains out
   of scope; the column is added now to avoid a future migration.
4. **`express.json()` scoped to the cards router (second occurrence)** — consistent with the
   TASK-004 boards decision and the `api-design` learned rule. Cards is the second body-accepting
   domain, reaching the predicted inflection point; at two domains, per-router is still acceptable.

## Files Changed

- `migrations/1781746875601_create-cards-table.js` — NEW: `up`/`down` for the `cards` table + `board_id` FK (CASCADE) + `cards_board_id_index` (CommonJS, outside `src/`)
- `src/validation/card.ts` — NEW: `validateCreate` / `validateUpdate` (throw `badRequest` 400); re-exports `validateId` from `./board`
- `src/validation/card.test.ts` — NEW: 19 unit tests (no DB/Express)
- `src/db/cards.ts` — NEW: parameterized `create` / `listByBoard` / `findById` / `update` / `remove`
- `src/routes/cards.ts` — NEW: five `/api/v1/boards/:boardId/cards` endpoints; `Router({ mergeParams: true })`; router-scoped `express.json()`; validate-before-DB; pre-flight board-existence check; `req.log` logging
- `src/routes/cards.test.ts` — NEW: 23 integration tests (mocked `../db/pool` seam backed by a two-entity boards+cards in-memory store)
- `src/routes/index.ts` — MODIFIED: registered `apiRouter.use('/boards/:boardId/cards', cardsRouter)`

## Acceptance Criteria

All 12 MUST criteria satisfied with direct evidence — see reflection AC table:

- **AC-ENTRY-1** (API surface reachable under board-scoped path): MET — `GET /api/v1/boards/1/cards` → 200 JSON (cards router mounted with `mergeParams`)
- **AC-HAPPY-1** (create card): MET — shape (id, `board_id` matches path, `description: null`, `position: 0`, ISO-8601 timestamps) + read-back equality + two POSTs distinct ids (stub detection)
- **AC-HAPPY-2** (list cards): MET — empty `[]`; per-board isolation (board A card absent when listing board B); ordering by `position ASC, id ASC`
- **AC-HAPPY-3** (read one): MET — POST then GET by id; title/description match input
- **AC-HAPPY-4** (update card): MET — PATCH title persists on re-GET; `updated_at >= created_at`; `description: null` clears
- **AC-HAPPY-5** (delete card): MET — 204 empty body; subsequent GET → 404 (row genuinely removed)
- **AC-ERROR-1** (missing/invalid title → 400): MET — standard error shape; DB never reached
- **AC-ERROR-2** (non-existent id → 404 on GET/PATCH/DELETE): MET — standard shape, no internal detail
- **AC-ERROR-3** (non-integer `:boardId`/`:id` → 400): MET — short-circuits before DB query (mockQuery not called)
- **AC-ERROR-4** (empty PATCH body → 400): MET — no DB update issued
- **AC-ERROR-5** (invalid `position` → 400): MET — negative/non-numeric rejected; no row inserted
- **AC-OBS-1** (zero `console.*`): MET — console spies assert 0 calls across all five endpoints
- **AC-OBS-2** (no internal DB detail leak): MET — `query` rejection → 500 body only `{error, traceId}`, DSN fragment absent (dual-asserted)

(Additional behavioral coverage beyond the AC table: the pre-flight check — POST to an unknown `boardId` → 404 with no card inserted.)

## Lessons Learned

- **Planning-time resolution of MEDIUM-confidence design decisions continues to eliminate
  creative-phase overhead for Level 2.** The board-scoped-vs-flat URL decision was MEDIUM-confidence
  (not LOW); the Spec Writer presented the trade-offs accurately and the human resolved it at
  planning time, so all three build phases started with full design clarity. Second consecutive
  Level 2 task where a MEDIUM-confidence architectural decision was resolved at plan time.
- **The prior domain layer is a precise mirror template for the next.** TASK-004's boards layer
  (`db/boards.ts`, `validation/board.ts`, `routes/boards.ts`, `routes/boards.test.ts`) served as
  direct structural templates for their card equivalents — zero design divergence from the plan.
- **A pre-flight parent-existence check inserts cleanly with the dependency arrow pointing the
  right way.** Importing `findById` from `db/boards` into the cards *route* layer (aliased
  `findBoardById`) keeps the data-access layer ignorant of routes; the route layer composes two
  data-access modules.
- **Highest compounding return on continuous learning to date:** five learned rules
  (testing-patterns, api-design ×2 bullets, error-handling, typescript-config) were applied in
  Phase 3 without re-derivation. The two new learnings extracted here (nested router with
  `mergeParams`; pre-flight parent findById → 404 before child FK insert) amended `api-design.md`
  to evidence_count 4 and promoted it low → medium.
- **Recurring friction (carried forward):** by-task session logs remain absent
  (`.agent-logs/claude/by-task/TASK-005/` unpopulated) for the **fifth** consecutive task, so the
  reflection had no quantitative tool-call/duration metrics. Open since TASK-001 — now overdue for
  infrastructure resolution rather than a per-reflection note.

## Notes

- **Completes FEAT-004 (Cards)** and the boards→cards domain pair: ten REST endpoints now live
  (five boards, five cards).
- **Carried follow-up (security debt):** the `node-pg-migrate` dev-tree `npm audit` findings
  (19 moderate / 2 high) carried from TASK-004 remain open. TASK-005 added no new dependencies, so
  the posture is unchanged. Dev/CI-only (the migration runner is not in the production runtime
  bundle), but should be triaged before the first production deployment. See § Security Debt in
  `projectbrief.md` (SEC-DEBT-1).
- **Future work flagged in reflection:**
  - `express.json()` is now duplicated across boards and cards — consolidate to an `app.ts`-level
    global mount before a third body-accepting domain arrives, or document per-router as canonical
    in `systemPatterns.md`.
  - **OpenAPI specification** still absent with ten endpoints live — flagged as deferred in both
    TASK-004 and TASK-005 reflections; a dedicated milestone task would prevent indefinite deferral.
  - `position` drag-and-drop ordering algorithm deferred (column persisted; reorder mechanism
    undefined).
  - Moving a card between boards (`board_id` update via PATCH) — out of scope for MVP; needs a
    target-board pre-flight check when added.
  - Capture the `mergeParams` nested-router pattern and the pre-flight parent-existence pattern in
    `systemPatterns.md` (currently only in the `api-design` learned rule + the cards source).
- **Out of scope** (cleanly deferred): authentication/authorization, column model, labels, due
  dates, assignees, soft-delete/archiving, list pagination, bulk operations, OTLP export.
