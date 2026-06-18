# Reflection: TASK-005 — Card model with CRUD endpoints (FEAT-004)

**Date**: 2026-06-18
**Task Complexity**: Level 2 (inherited from FEAT-004)
**Total Phases**: 3 (Migration, Data-access + validation, CRUD routes + registration)
**Duration**: 2026-06-17 (single day, all phases)
**Branch**: feature/FEAT-004-card-model-crud

---

## Executive Summary

TASK-005 delivered a complete Card domain model with five board-scoped REST endpoints under `/api/v1/boards/:boardId/cards` (POST create, GET list, GET read-one, PATCH update, DELETE), the `cards` PostgreSQL table via `node-pg-migrate`, a typed data-access layer with parameterized queries, and synchronous input validation that short-circuits before any database interaction. All twelve acceptance criteria were satisfied with direct test evidence across 113 tests (all passing, +42 net new across Phases 2 and 3). The implementation faithfully mirrored the Board layer established in TASK-004, introducing two new patterns the codebase had not previously needed: `Router({ mergeParams: true })` for nested resource routing, and a pre-flight parent-existence check before inserting a child FK row.

The two architectural decisions that shaped this task — board-scoped URL path versus flat path, and pre-flight SELECT versus FK-violation catch — were resolved at planning time by human decision, eliminating the need for a creative phase. The Spec Writer agent flagged both as LOW/MEDIUM-confidence and presented the trade-offs accurately. This planning discipline meant all three build phases started with full design clarity and completed without mid-phase reversals. The `express.json()` per-router pattern from TASK-004 was applied again to the cards router, confirming the prediction in the TASK-004 reflection: "when a second body-accepting domain arrives, it will also need `express.json()`." The prediction that this would eventually warrant a refactor to `app.ts` remains open — two routers with per-router `express.json()` is still acceptable at MVP scale but the pattern is now established twice.

From an ecosystem perspective, the Level 2 workflow was correctly sized, the continuous learning system delivered its expected compounding return (five learned rules were directly applicable), and the by-task session log gap recurred for the fifth consecutive task. The `mergeParams` routing pattern and the pre-flight existence check are both genuinely new additions to the project's pattern vocabulary that future child-resource domains will be able to reuse without re-derivation.

---

## Dimension 1: Task Implementation Quality

### Requirements Achievement

**Status**: All Met

All twelve MUST acceptance criteria were satisfied with direct test evidence:

- **AC-ENTRY-1**: API surface reachable — integration test `GET /api/v1/boards/1/cards` → 200 JSON, confirming the cards router is mounted under the board-scoped path with `mergeParams` wired correctly in `src/routes/index.ts`.
- **AC-HAPPY-1**: Create card — test creates a card, asserts shape (id positive integer, `board_id` matching path param, `description: null`, `position: 0`, ISO-8601 timestamps), reads it back by id (round-trip equality), confirms two POSTs yield distinct ids (stub detection).
- **AC-HAPPY-2**: List cards — empty store → `[]`; POST then list → array contains new card with correct `board_id`; per-board isolation confirmed (card created under board A absent when listing board B); ordering by `position ASC, id ASC` verified.
- **AC-HAPPY-3**: Read one card — POST then GET by returned id; `title` and `description` values match input.
- **AC-HAPPY-4**: Update card — POST then PATCH `title`; GET confirms updated title persists; `updated_at >= created_at` asserted; `description: null` clear on PATCH with `description: null` field.
- **AC-HAPPY-5**: Delete card — POST then DELETE → 204 empty body; subsequent GET → 404 (row genuinely removed from in-memory store, not flagged).
- **AC-ERROR-1**: Missing/invalid title on POST → 400 standard error shape; mock query not called (DB never reached).
- **AC-ERROR-2**: Non-existent id on GET/PATCH/DELETE → 404 standard shape; no internal detail.
- **AC-ERROR-3**: Non-integer `:boardId` or `:id` → 400 before DB query; mock query verified not called.
- **AC-ERROR-4**: PATCH with empty body → 400; mock query not called.
- **AC-ERROR-5**: Invalid `position` (negative or non-numeric) → 400; no row inserted.
- **AC-OBS-1**: `console.log`/`console.error`/`console.warn` spy asserts 0 calls across all five endpoints.
- **AC-OBS-2**: `getPool().query` rejection → 500 response with body only `{error, traceId}`; secret DSN fragment absent from body (substring check).

No scope creep. The out-of-scope items (auth, pagination, column model, labels, due dates, soft-delete, bulk operations, OpenAPI spec, drag-and-drop algorithm) were not touched.

### Code Quality Assessment

**Overall Rating**: Excellent

- **Maintainability**: The three-layer separation (validation → data-access → routes) is upheld identically to the boards layer. `src/validation/card.ts` re-exports `validateId` from `./board` rather than duplicating it, making the domain-agnostic utility discoverable from a single import site. `src/db/cards.ts` has no HTTP/Express imports; the dynamic UPDATE SET builder pattern from `db/boards.ts` is reproduced with the same bound-param whitelist approach. Adding a new updateable field (e.g., `due_date` when that feature arrives) requires one array change in `db/cards.ts` and one validation rule in `validation/card.ts`.
- **Architecture**: The `Router({ mergeParams: true })` pattern is the first use of nested router composition in the project. It is correctly documented in the task file and is a pattern every future child-resource domain will inherit. The registration in `src/routes/index.ts` (`apiRouter.use('/boards/:boardId/cards', cardsRouter)`) sits alongside the boards mount in a readable, symmetric layout. The pre-flight board-existence check is implemented by re-importing `findById` from `db/boards` as `findBoardById`, an explicit alias that signals intent at the call site without hiding the cross-domain dependency.
- **Error Handling**: All five handlers funnel every thrown or rejected error through `next(err)`. Validation throws 400 before any DB call. The pre-flight check throws `notFoundError` (404) if the board is absent, before the INSERT — consistent with the validate-before-DB principle. Missing-row paths for read/update/delete use `notFoundError`. DB faults produce 500 via the central `errorHandler` with no internal detail leaked (AC-OBS-2 dual-asserted via body shape and substring check).
- **Testing**: 113/113 tests passing. Phase 2 delivered 19 unit tests for the pure validation functions (no DB, no Express). Phase 3 delivered 23 integration tests via `supertest(createApp())` with a mocked pool backed by a two-entity in-memory store (boards + cards). The store correctly models per-board isolation (list/read filter by `board_id`), position ordering, the pre-flight board-existence check, and the post-delete 404 guarantee. These are behavioral assertions, not structural shape checks.

### Technical Decisions

**Key Decisions:**

1. **Board-scoped URL path `/api/v1/boards/:boardId/cards` with `Router({ mergeParams: true })`** — Chosen over the flat `/api/v1/cards?board_id=X` alternative. The board-scoped path makes ownership structural in the URL rather than optional in a query param, aligns with the product model ("open board → view cards"), and follows REST resource hierarchy conventions. The `mergeParams: true` option on the cards Router is the non-obvious Express detail required to expose the parent-mount `:boardId` inside the child router. This is the first use of this pattern in the project.

2. **Pre-flight board-existence SELECT before INSERT** — Chosen over catching PostgreSQL FK violation code `23503` after a failed INSERT. The pre-flight approach is consistent with the validate-before-DB principle already established throughout the codebase. It returns a clean 404 (`notFoundError`) rather than requiring error-code interpretation in the route layer. The DB-level `ON DELETE CASCADE` still enforces referential integrity for board deletion, so the pre-flight check and the FK constraint serve complementary rather than redundant roles. The cost is one extra SELECT per POST; the benefit is uniform error handling without pg-specific error-code branching in the route layer.

3. **`express.json()` scoped to the cards router** — Consistent with the TASK-004 boards decision and the `api-design` learned rule. Cards is the second body-accepting domain. The per-router pattern is now duplicated, which was the predicted inflection point from the TASK-004 reflection. At two domains, per-router is still readable and acceptable. The question of refactoring to `app.ts`-level global mounting is now more concrete, warranting explicit tracking as a future work item.

**Trade-offs:**

- **Pre-flight SELECT vs. FK violation catch**: One extra DB roundtrip per POST gained — uniform, pg-code-free error handling. Trade-off: in a high-write-volume system, the extra SELECT per create would accumulate; at MVP scale (small team, local DB, p95 < 300 ms write target) this is negligible.
- **`mergeParams: true` on child Router**: Clean access to `:boardId` inside the cards router without `req.baseUrl` parsing. Trade-off: `mergeParams` is a non-obvious Express option; any developer unfamiliar with it who reads the cards router in isolation may not understand where `req.params.boardId` comes from. A comment in the file mitigates this.
- **`express.json()` per-router (second occurrence)**: Continued isolation from `app.ts` gained. Trade-off: the pattern is now duplicated across two domain routers; refactoring to global is cleaner and overdue by one domain.

### What Went Well

1. **The boards layer was a precise mirror template.** Because TASK-004 was already complete and well-documented, the cards layer could be authored with minimal design ambiguity. The `src/db/boards.ts`, `src/validation/board.ts`, and `src/routes/boards.ts` files served as direct structural templates for their card equivalents. Zero design divergence from the plan was required.

2. **TDD discipline held cleanly across all three phases.** Tests were written before implementation in Phases 2 and 3. In Phase 3, the in-memory store needed to model both boards and cards to support the pre-flight check — this design decision was made at test-authoring time, before a single line of route code existed, which forced early clarity on the cross-domain dependency.

3. **The pre-flight board-existence check was integrated with no cross-layer coupling.** Importing `findById` from `db/boards` into `src/routes/cards.ts` (aliased as `findBoardById`) is a deliberate single-point dependency. The data-access layer has no knowledge of the route layer; the route layer composes two data-access modules. This is the correct direction for the dependency arrow.

4. **All per-board isolation ACs were meaningfully exercised.** The AC-HAPPY-2.4 requirement (cards from board A must not appear when listing board B) is a behavioral assertion that would catch a naive implementation that ignores the `boardId` filter. The in-memory store correctly implements this filtering, and the test creates cards under two separate boards to verify isolation.

5. **Security posture clean on first pass.** No new production dependencies were added. All DB interactions go through the Phase 2 parameterized data-access layer. The no-internal-detail leak is dual-asserted in the integration tests (AC-OBS-2: body shape + DSN substring check). No `console.*` calls.

### Challenges Encountered

1. **`noUncheckedIndexedAccess` requires `req.params.boardId ?? ''` and `req.params.id ?? ''` in the cards router** — The same pattern from TASK-004 (`req.params.id ?? ''`) applies here for both `:boardId` and `:id`. This is now a two-instance established pattern across the routes layer. It is mechanical, consistent, and correctly handled by `validateId` (which treats an empty string as invalid). Not a blocking issue, but it is a repeated minor noise point for every new domain handler.

2. **Two-entity in-memory store in the integration tests requires more setup than a single-entity store** — The Phase 3 mock needed to model both `boards` and `cards` to support the pre-flight existence check. This increased the test mock's complexity relative to the boards test (which only modelled one entity). The added setup is justified — the pre-flight check is a core correctness requirement — but future child-resource domains will need to factor this two-entity store pattern into their test infrastructure.

3. **The `node-pg-migrate` dev-tree audit findings from TASK-004 were not triaged at TASK-004 archive time** — This was a carried-forward item from TASK-004 (19 moderate, 2 high in the dev dependency tree). TASK-005 adds no new dependencies, so the audit posture is unchanged. The findings remain open and should be triaged before any production deployment.

### Technical Debt & Future Work

- **`express.json()` per-router is now duplicated across boards and cards**: With two body-accepting domains, the argument for refactoring to a global `app.ts` mount has strengthened. A future task should consolidate this — either move `express.json()` to `app.ts` before adding a third domain, or document explicitly in `systemPatterns.md` that per-router is the project's canonical approach.
- **`node-pg-migrate` dev-tree audit findings (19 moderate, 2 high)**: Carried from TASK-004. Triage required before production deployment. These are dev-only transitive dependencies; likely false-alarm context, but explicit verification is needed.
- **No OpenAPI specification**: TASK-004 reflection identified FEAT-004 (Cards) as the natural milestone to introduce an OpenAPI spec covering both domains. This task is now complete and the spec is still absent. With ten REST endpoints live (five boards, five cards), the absence of machine-readable API documentation is becoming more significant for API consumers.
- **`position` drag-and-drop algorithm deferred**: The `position` column is persisted and used for list ordering, but the mechanism for computing position on card reorder (client sends new position integer, or server recomputes fractional/gap-based positions) is undefined. This will require a schema migration or application logic when drag-and-drop is implemented.
- **Moving a card between boards (`board_id` update via PATCH)**: Explicitly out of scope for MVP. When this capability is needed, the PATCH handler and `validateUpdate` must be extended to accept `board_id` as an updatable field with its own pre-flight existence check for the target board.

---

## Dimension 2: Claude Code Ecosystem Effectiveness

### Build Session Analysis

**Build Sessions**: 3 (one per phase — each ended with a committed green build)
**Sub-Agents Spawned**: 0 (orchestrator-direct across all three build phases; Spec Writer agent used during planning)
**Tool Calls**: Not quantifiable — by-task session logs not available (see note below)
**Errors Recovered**: 0 build failures across all three phases

Note: `.agent-logs/claude/by-task/TASK-005/` directory is not populated. This is the fifth consecutive task without by-task session log indexing, making quantitative tool-call, duration, and error-recovery metrics unavailable. Evaluation is qualitative, based on the task file Execution State and progress.md Implementation History rows. "Session logs not task-indexed. Run /banyan-init to upgrade."

#### Tool Utilization

Qualitative assessment based on the three-phase execution record:

| Tool | Usage Pattern | Notes |
|------|---------------|-------|
| Read | High | Context loading at each phase start: task file, techContext, systemPatterns, boards layer source files for pattern reference (boards.ts, db/boards.ts, validation/board.ts, routes/index.ts) |
| Write | Moderate | New files: migration JS, validation/card.ts, db/cards.ts, routes/cards.ts, two test files |
| Edit | Low-Moderate | Existing file modifications: routes/index.ts (cards router registration) |
| Bash | Moderate | npm run migrate up/down (Phase 1 verification), npm test (all phases), tsc check |
| Grep | Low-Moderate | Pattern lookups: validateId re-export pattern, findById signature in db/boards.ts, mergeParams usage confirmation |
| Glob | Low | Directory structure exploration at phase start |
| Agent/Task | None | No sub-agents spawned during build phases |

#### Sub-Agent Performance

No sub-agents were spawned during build phases. All three phases were orchestrator-direct, consistent with the Level 2 pattern. The planning phase used a Spec Writer Agent (Sonnet) as documented in the task file's Prior State section. The Spec Writer correctly flagged two LOW/MEDIUM-confidence design decisions (URL path, FK-violation handling) and presented trade-offs accurately — both were resolved by human decision at planning time, eliminating the need for a creative phase.

### Command Workflow Evaluation

**Commands Used**: `/banyan-plan TASK-005` (x1), `/banyan-build TASK-005` (x3), `/banyan-reflect TASK-005` (x1)

**Workflow Efficiency**: Good

**Assessment**:
- The Level 2 workflow (`/banyan-plan` → three `/banyan-build` phases → `/banyan-reflect`) was correctly sized. Each `/banyan-build` invocation targeted one cohesive phase with a defined output artifact, a passing test suite, and a commit. Human review between phases worked as designed.
- The feature roadmap entry was already established from when FEAT-004 was created as the successor to FEAT-005 (Boards). No `roadmap feature create` was needed for this task — the feature pre-existed and the task was provisioned directly.
- Three `/banyan-build` invocations mirrors TASK-004's three-phase structure exactly. The justification is the same: migration is an infra-only phase with its own Docker verification step; data-access and validation are independently testable; routes depend on both and are the integration phase. This phase decomposition continues to produce clean interfaces with no phase-to-phase backtracking.
- The absence of a creative phase was appropriate and correctly determined at planning time. The Spec Writer correctly evaluated both design questions as resolvable by human decision rather than requiring design exploration. This saved at least one workflow command and kept the task on a single day.

### Context File Effectiveness

**Files Loaded**: Task file (TASK-005.md), techContext.md, systemPatterns.md, productBrief.md, boards layer source files (boards.ts, db/boards.ts, validation/board.ts, routes/index.ts, routes/boards.test.ts), agent-rules/_learned/* (testing-patterns, api-design, error-handling, typescript-config, tooling)

**Assessment**:
- **Helpful**: The TASK-005.md specification was again the single most valuable context artifact. The 12 ACs, explicit validation rules, exact request/response shapes, and the pre-flight check design decision (resolved at planning time with rationale) meant zero disambiguation was needed during implementation.
- **Helpful**: The boards layer source files (`src/db/boards.ts`, `src/routes/boards.ts`, `src/routes/boards.test.ts`) functioned as direct implementation templates. Reading the existing two-entity mock pattern from any prior boards test would have been the natural starting point for the two-entity cards test mock.
- **Helpful**: The `api-design` learned rule (scope `express.json()` to the domain router) was applied in Phase 3 without re-derivation. The `testing-patterns` learned rule (in-memory store behind mocked `getPool().query`) was applied for the Phase 3 test mock, extended here to model two entities rather than one. Both rules delivered their expected compounding return.
- **Gap**: The `mergeParams: true` pattern — the most novel Express detail in this task — is not captured in any existing learned rule file or context file. If a future developer encounters a nested router for the first time (e.g., a `columns` resource under cards, or labels under cards), they would need to rediscover this from the cards router source file rather than from a documented pattern. This is a candidate for the `api-design` learned rule.
- **Gap**: The observability requirements file (`${CLAUDE_PLUGIN_ROOT}/context/observability-requirements.md`) is still not confirmed as loaded during build phases. Consistent with TASK-004, the observability requirements were met by pattern-matching the existing `req.log` usage in boards — a sound approach given the codebase maturity, but fragile for future developers less familiar with the project patterns.

### Memory Bank Organization

**Assessment**:
- **Structure**: The three-layer organization (tasks.md registry → tasks/TASK-005.md plan + state → progress.md history) continued to work well for a three-phase task. The Execution State section was updated after each phase, providing clear resumption points. The per-phase Build Summary blocks in the task file are the primary source of record for this reflection.
- **Navigation**: The Implementation Roadmap checkbox pattern makes phase status visible at a glance. The Completed Steps audit trail in the Execution State section is precise and timestamped.
- **Completeness**: No missing document types for a Level 2 task. Appropriate that no creative doc was created given the human-resolved design decisions. The three commit messages (by SHA) on `feature/FEAT-004-card-model-crud` provide the authoritative git audit trail.
- **Minor gap**: `techContext.md` was not explicitly updated in any TASK-005 phase (the migration tooling was already documented from TASK-004; no new development commands or dependencies were added). This is correct — there was nothing new to document. The absence of a `techContext.md` update is a positive signal: the card domain fit cleanly into the existing documented tech stack.

### Suggested Improvements to Claude Code System

> Note: These are documentation-only suggestions. Do NOT implement.

**High Priority**:

1. **Enable by-task session log symlinking for orchestrator-direct sessions** — This is the fifth consecutive task without quantitative tool-call or duration metrics. The reflection template requires these metrics; without them, the Build Session Analysis section remains structurally incomplete for every task in this project. The fix would populate `.agent-logs/claude/by-task/TASK-XXX/` even when the orchestrator implements phases directly (not via sub-agents). Five reflections without this data makes it a clear infrastructure investment, not a one-off gap.

2. **Capture `mergeParams` nested-router composition in the `api-design` learned rule** — The `Router({ mergeParams: true })` pattern for child-resource routes is non-obvious and will recur for every future child-resource domain (columns, labels, comments, etc.). A one-line rule in `api-design.md` — "Mount child-resource Routers with `Router({ mergeParams: true })` so the parent-mount param (e.g., `:boardId`) is accessible via `req.params` inside the child router" — would save rediscovery on the next nested domain without requiring developers to read the cards router source.

**Medium Priority**:

3. **Surface the `express.json()` refactor trigger in `systemPatterns.md`** — The per-router `express.json()` pattern is now established twice (boards, cards). The TASK-004 reflection recommended a note in `systemPatterns.md` about when to refactor to global. That note has not been added. A concrete trigger ("refactor to `app.ts` global mount when the third body-accepting domain is introduced") would prevent the pattern from proliferating further without a documented decision point.

4. **Add a pre-flight parent-existence check pattern to a context file** — The validate-parent-before-insert pattern (pre-flight SELECT on the parent entity before inserting a child FK row) is a genuinely new pattern this codebase had not documented before TASK-005. It will recur for any child-resource POST (e.g., POST a column to a board, POST a label to a card). Capturing it in `systemPatterns.md` or a data-layer-patterns context file would allow future domains to apply it without re-derivation.

**Low Priority / Nice to Have**:

5. **Consider an OpenAPI-first milestone task** — With ten REST endpoints live and twelve more likely in the next two features (columns, labels), an OpenAPI specification would provide machine-readable documentation for API consumers and a contract test surface. Both TASK-004 and TASK-005 reflections have flagged this as deferred. Scheduling it as a explicit roadmap item (e.g., TASK-006 or a separate FEAT) would prevent indefinite deferral.

---

## Key Learnings

### Extractable Learnings (for Continuous Learning)

1. **api-design** (`src/routes/**/*.ts`): Use `Router({ mergeParams: true })` when mounting a child-resource router so the parent-mount path parameter (e.g., `:boardId`) is accessible via `req.params` inside the child router without manual `req.baseUrl` parsing.

2. **api-design** (`src/routes/**/*.ts`, `src/db/**/*.ts`): Before inserting a child FK row, perform a pre-flight `findById` on the parent entity and return `notFoundError` (404) if absent — this avoids catching pg FK violation code `23503` in the route layer and keeps error handling uniform with the validate-before-DB principle.

### Learned Rules Applied

- **testing-patterns.md** (rule: in-memory store behind mocked `getPool().query` for persistence/stub-detection ACs): Applied and extended in Phase 3 — the cards test mock needed a two-entity in-memory store (boards + cards) rather than single-entity, to support the pre-flight board-existence check. The rule correctly predicted the approach; the two-entity extension is a natural generalization for child-resource routes.
- **api-design.md** (rule: scope `express.json()` to the domain router when it is the sole body-accepting surface): Applied in Phase 3 for the cards router. This is now the second application of this rule. The rule's caveat ("refactor to global only when a second body-accepting domain is added") was reached with this task — two domains now share the per-router pattern.
- **api-design.md** (rule: `createApp()` factory separate from `index.ts`): Applied in Phase 3 — `supertest(createApp())` is the integration test entry point. Directly applicable and used without re-derivation.
- **error-handling.md** (rule: type `err` as `unknown`, narrow via `ErrorLike`, never echo `err.message` to response): Applied — all route handlers forward errors via `next(err)`; `errorHandler` emits only the safe label plus `traceId`. Directly applicable.
- **typescript-config.md** (rule: `noUncheckedIndexedAccess` forces `req.params.id ?? ''`): Applied for both `req.params.boardId ?? ''` and `req.params.id ?? ''` in `src/routes/cards.ts`. Directly applicable; now a two-instance project-wide pattern.
- **tooling.md** (rule: `.env*` via `tee` redirect): Not applicable this task — no `.env` file changes were needed in any of the three phases.

### For Claude Code Workflow

1. **The boards-then-cards sequencing demonstrates clean additive domain growth.** TASK-004 established every shared tool (errors.ts, validateId, in-memory mock seam, migration tooling, per-router express.json). TASK-005 consumed all of them without modification, extending only what was specific to cards (validation rules, data columns, router composition). For future domains (columns, labels), the same pattern applies: read the cards layer as the template, extend only what differs.

2. **Planning-time resolution of MEDIUM-confidence design decisions continues to eliminate creative-phase overhead.** The `mergeParams` vs. flat-path decision was MEDIUM-confidence in the spec, not LOW. The Spec Writer presented it accurately, and the human resolved it at planning time. This is now the second consecutive Level 2 task where a MEDIUM-confidence architectural decision (migration tooling in TASK-004; URL structure in TASK-005) was resolved at plan time, avoiding a creative phase. The pattern suggests that MEDIUM-confidence architectural questions with clear trade-offs and a recommended option should default to planning-time human resolution, reserving creative phases for genuinely ambiguous architecture problems.

3. **The by-task session log gap is a confirmed systemic gap, not project-specific.** Five consecutive tasks have produced reflections without quantitative metrics. This should be escalated from "recurring note" to "tracked ecosystem defect" — it structurally limits the data quality of every reflection this project produces.

---

## Conclusion

TASK-005 delivered a complete, production-ready Card CRUD API in three clean phases with no mid-phase reversals, no scope creep, and all twelve acceptance criteria satisfied with direct behavioral test evidence. The two novel patterns — `Router({ mergeParams: true })` for nested resource composition and a pre-flight parent-existence check before inserting a child FK row — were both introduced cleanly and are immediately available as templates for future child-resource domains. The test suite (113/113) extends the project's strongest behavioral coverage by adding per-board isolation, ordering assertions, and the two-entity in-memory store pattern.

From an ecosystem perspective, the Level 2 workflow was appropriate and efficient. Five learned rules were applied directly in Phase 3 without re-derivation — the highest compounding return on the continuous learning system seen in any task to date. The one structural gap that continues to limit reflection quality is the absent by-task session log index; this is its fifth appearance and is now overdue for infrastructure resolution rather than a reflection note. The two new learnings extracted here (nested router with `mergeParams`; pre-flight parent-existence check) extend the `api-design` rule file with patterns that every future child-resource domain will encounter.

**Overall Task Success**: Success

**Overall Workflow Effectiveness**: Highly Effective (recurring minor friction: absent by-task session logs prevent quantitative build-session metrics for the fifth consecutive task)

**Recommendation**: Ready to archive
