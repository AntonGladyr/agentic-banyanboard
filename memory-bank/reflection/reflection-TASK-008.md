# Reflection: TASK-008 — Realtime Activity Feed

**Date**: 2026-06-30
**Task Complexity**: Level 3
**Total Phases**: 4 build phases (Phase 1 Persistence, Phase 2 Recording + Endpoint + Broadcast, Phase 3 Frontend, Phase 4 E2E) + UAT between Phase 3 and Phase 4
**Branch**: feature/FEAT-008-realtime-activity-feed
**Duration**: 2026-06-30 (plan + both creative phases + all 4 build phases + UAT + E2E, single day)

---

## Executive Summary

TASK-008 extended the realtime infrastructure established in FEAT-007 with a board-scoped, live activity feed for card-movement events. The implementation spans the full stack: a new `activity_events` database table (migration + DAL), a recording hook inside the existing card PATCH handler, a new REST read endpoint, an additive `activity:card_moved` event type on the existing SSE channel, and a new `ActivityFeed` React component wired into `BoardViewPage`. The entire realtime transport reused FEAT-007 infrastructure without modification — no new socket, proxy, keep-alive, or reconnect code. All 12 acceptance criteria were met and verified through a combination of 52 unit/integration tests (9 DAL, 6 route, 6 cards extension, 3 broadcast, 2 SSE hook extension, 8 component, 5 page integration, 13 utilities), 7 Playwright E2E tests, and a full browser UAT walk that passed with zero Required findings.

The architectural core of this task — the no-`originId` activity event envelope — was the most elegant decision: by designing the absence of `originId` into the event's TypeScript interface rather than special-casing the echo-drop guard, the originating tab's feed delivery was made structurally guaranteed rather than conditionally permitted. The creative phases again served as direct implementation contracts, with all four architecture decisions (SSE delivery via existing channel, pre-flight `findById` for `from_status` capture, no-`originId` envelope, no-prune-with-read-LIMIT retention) holding through all four build phases without revision. The UAT walk surfaced two operational gaps (migration not applied to dev DB; `npm run migrate` not loading `.env`) that are deploy-runbook gaps rather than code defects — both were remediated during the walk and addressed in Phase 4's E2E DB setup.

From an ecosystem perspective, TASK-008 demonstrated the Level 3 workflow at its most efficient: a smaller surface area than TASK-007 (4 phases vs. 6) produced proportionally tighter scoping, with /banyan-uat successfully run between the final build phase and the E2E phase — the first UAT completion in this project's history. The by-task session log gap persists (eighth consecutive task without this data), and the frontend context file gap in the plugin remains unaddressed for the second consecutive frontend-heavy task.

---

## Dimension 1: Task Implementation Quality

### Requirements Achievement

**Status**: All Met

All 12 MUST acceptance criteria were satisfied with direct test and E2E evidence:

| AC | Evidence |
|----|----------|
| AC-ENTRY-1 (feed panel visible on board view) | ActivityFeed.test.tsx; BoardViewPage.test.tsx; Playwright Scenario 1 (complementary landmark); UAT happy step 3 confirmed in-browser |
| AC-LOAD-1 (persisted history on initial load) | BoardViewPage.test.tsx history fetch wired; Playwright Scenario 1 history case; UAT happy step 6 reload confirmation |
| AC-EMPTY-1 (empty state when no moves) | ActivityFeed.test.tsx empty state; Playwright Scenario 1 empty case; UAT happy step 3 |
| AC-LOADING-1 (spinner while fetch in flight) | ActivityFeed.test.tsx loading state; Playwright Scenario 1 (delayed route >200ms → Spinner observable) |
| AC-HAPPY-1 (card move records activity event) | cards.test.ts +6 (status-change path inserts row; verifiable via GET /activity); activity.test.ts route suite |
| AC-HAPPY-2 (live delivery to all tabs, incl. originator) | useRealtimeBoard.test.ts no-drop assertion; Playwright Scenario 4 real cross-tab SSE; UAT cross-tab walk |
| AC-HAPPY-3 (activity REST endpoint returns board history) | activity.test.ts (200 array, ordering, scoping, 8 keys, ISO occurred_at); UAT API probe |
| AC-ACTIVITY-ONLY-MOVES-1 (title/desc-only edits record nothing) | cards.test.ts no-insert assertion on title-only PATCH |
| AC-PERSIST-CARD-DELETE-1 (history survives card deletion) | activity.test.ts DAL scoping test (`board_id` FK CASCADE keeps events when cards row removed) |
| AC-SCOPED-1 (board-scoped only) | activity.test.ts board-scoping test; UAT API-layer board-2 probe |
| AC-ERROR-1 (404 for non-existent board) | activity.test.ts pre-flight findBoardById 404 path; UAT AC-ERROR-1 |
| AC-ERROR-2 (400 for invalid boardId) | activity.test.ts validateId 400 path; UAT AC-ERROR-2 |
| AC-OBS-1 (structured log on card move) | cards.test.ts observability assertion (`{cardId, boardId, fromStatus, toStatus}`) |

No acceptance criteria were partially met or deferred. The mobile viewport layout (AC-ENTRY-1 responsive variant) was not verifiable during the UAT browser walk (UAT-REC-03 — browser window pinned at 1536px) and was subsequently covered by the Phase 4 Playwright Scenario 2 with an explicit `setViewportSize({ width: 375, height: 667 })`.

**Scope held completely.** Card creation/deletion/title-edit events, pagination, cross-board feeds, push notifications, and per-user filtering all remained out of scope. Actor identity shipped as the planned `"anonymous"` stub — the column is schema-forward-compatible for auth landing as a future feature.

### Code Quality Assessment

**Overall Rating**: Excellent

- **Maintainability**: The activity feature follows every established project convention without introducing new patterns. `src/db/activity.ts` mirrors `src/db/cards.ts` (parameterized queries, `null`/`[]` on absence, typed interface). `src/routes/activity.ts` mirrors the read handlers in `src/routes/cards.ts` (`Router({ mergeParams: true })`, `validateId`, pre-flight `findBoardById`, `notFoundError`). `ActivityFeed.tsx` reuses `<Spinner>`, `<EmptyState>`, `<ErrorMessage>`, CSS Modules, and `tokens.css` tokens exactly as specified. The recording logic in `cards.ts` is a well-bounded `if (input.status !== undefined && before !== null && before.status !== card.status)` block that is clearly demarcated from the existing handler flow. Future maintainers need to understand zero new patterns to modify any of these files.

- **Architecture**: The no-`originId` ActivityCardMovedEvent interface is the standout architectural decision: making the "this event is never echo-deduped" property structural (absent field) rather than conditional (a type guard in `handle()`) is the correct approach. It is self-documenting, TypeScript-enforced, and immune to future `handle()` refactors re-introducing suppression. The pre-flight `findById` for `from_status` capture correctly follows the DELETE handler precedent already in `cards.ts:145-150` — no new pattern, just an existing one applied consistently. The `getActivity` call intentionally fires OUTSIDE the board/cards `Promise.all` (non-fatal by design) — a critical architectural nuance that prevents a feed failure from knocking out the entire board view.

- **Error Handling**: GP5 is maintained end-to-end. The activity route inherits `errorHandler` for all error responses (`{error, path, traceId}` only). `notifyCardMoved` is fire-and-forget, gated by `config.realtimeEnabled`, and wrapped defensively — a broadcast failure logs at warn and cannot affect the already-sent 200 response. The feed fetch failure is non-fatal at the page level (separate from board/cards `Promise.all`). The `before !== null` guard defends the race between pre-flight read and update. Playwright Scenario 3 verified the non-fatal error path: board renders, feed shows "Could not load activity", no detail leaked.

- **Testing**: 52 unit/integration tests + 7 Playwright E2E tests were delivered vs. the planned 28–36 total (backend ~16–20, frontend ~12–16). The 46% overcount is in the quality direction: the 13 utility tests (8 `formatRelative`, 2 `statusLabel`) cover edge cases that impact user-visible feed entry content. The E2E suite covers both serving models: the hermetic `chromium` project tests AC-ENTRY-1, AC-LOAD-1, AC-EMPTY-1, AC-LOADING-1, AC-HAPPY-2 own-tab, mobile layout, and non-fatal error; the real-DB `realtime` project tests the genuine cross-tab SSE delivery that cannot be mocked. TDD discipline held across all phases — RED state confirmed before GREEN implementation in each.

### Technical Decisions

**Key Decisions:**

1. **SSE delivery via the existing `activity:card_moved` event type on the existing `/events` channel (Architecture Q1 = Option 1A)** — Confirmed the task's stated strong preference. The broadcaster (`broadcaster.ts`) and SSE framing (`eventsRouter.ts`) are already generic over `RealtimeEvent`; adding a union member is additive and rides 100% of FEAT-007 infrastructure. A separate endpoint (rejected Option 1B) would have duplicated the entire transport for zero benefit at the ≤20-user scale. Outcome: zero new transport code, naturally board-scoped, ordering-coherent with `card:updated` on the same stream.

2. **Pre-flight `findById` for `from_status` capture (Architecture Q2 = Option 2A)** — Mirrors the existing DELETE handler at `cards.ts:145-150`, keeps recording logic in the testable application layer, and requires zero SQL changes. The extra primary-key SELECT is sub-millisecond against the 300ms write budget. The CTE approach (rejected Option 2C) would have added activity concerns to the generic card-update DAL query for savings that the NFR budget does not need. Outcome: recording logic is testable via supertest, zero DAL changes required.

3. **No `originId` on the activity event envelope (Architecture Q3 = Option 3A)** — The originator must see its own activity entry (AC-HAPPY-2.2), because the feed is not optimistically pre-populated. By omitting `originId` from the `ActivityCardMovedEvent` TypeScript interface entirely, the "never echo-deduped" property becomes structural: the existing guard `event.originId !== undefined && event.originId === originId` in `useRealtimeBoard.ts` is never satisfied. Option 3B (keeping `originId` but adding a `type`-specific exception in `handle()`) was correctly rejected as fragile. Outcome: originator delivery is structurally guaranteed; verified by `useRealtimeBoard.test.ts` no-drop assertion and Playwright Scenario 4 cross-tab walk.

4. **No pruning in v1; bound the read with `LIMIT 200` (Architecture Q4 = Option 4A)** — At ≤20 users with flat growth, the table stays small for the deployment's life; the `(board_id, occurred_at DESC, id DESC)` index plus a LIMIT satisfies the p95 < 150ms read NFR without pruning. This also respects the productBrief's "no automatic deletion" data stance. Outcome: simplest correct design (GP4), forward-compatible with time-based purge via the already-indexed `occurred_at`, no scheduler/cron infra needed.

5. **Separate `getActivity` fetch outside the board/cards `Promise.all` (UI/UX Implementation Guideline 2)** — A feed failure must not knock out the entire board view. The creative doc explicitly specified "catch it separately and set a `feedError: boolean` flag; the board still renders." This pattern was a Phase-3 resumption gotcha and a Phase-4 Playwright Scenario 3 test target. Outcome: verified non-fatal in both unit tests and E2E; the board remains fully functional even when the activity endpoint errors.

**Trade-offs:**

- **Extra DB read per PATCH (Q2A)**: Sub-millisecond primary-key SELECT on a 300ms write budget at ≤20 users — accepted for DAL reuse and app-layer testability. The recording block also runs after `res.json()`, so it does not sit on the client-observed PATCH critical path.
- **Unbounded store, bounded read (Q4A)**: Table grows monotonically; offset by flat usage scale and the product's stated data-retention stance. The `LIMIT 200` means entries older than 200 positions are not feed-visible in v1 (pagination deferred and documented as out-of-scope).
- **Activity event shares the channel with card-state events (Q1A)**: The frontend `handle()` branches on `type` (already does — existing pattern). A consumer that only wants activity receives card-state events too; irrelevant for v1 where the board view consumes both.
- **Anonymous actor in v1**: Defers actor identity resolution to a future auth-gated FEAT. The column is present and schema-forward-compatible — no migration required when auth lands. The feed entries are readable without attribution for the small-team use case.

### What Went Well

1. **The no-`originId` envelope design is the cleanest architectural decision in the task.** Making the "never echo-deduped" property structural rather than conditional via a TypeScript omission is self-documenting, immune to future guard refactors, and was verified from unit tests through E2E. The TASK-007 echo-de-dup mechanism was extended rather than compromised.

2. **Reuse of FEAT-007 transport was total.** Every component of the TASK-007 realtime tier — `broadcaster.ts`, `eventsRouter.ts`, `notify.ts`, `useRealtimeBoard.ts`, and the two-Playwright-project E2E design — was consumed without modification. The additive-union extension style used for card-state events extended cleanly to `activity:card_moved`. Zero new transport infrastructure was introduced.

3. **UAT was actually completed this task.** TASK-007's reflection flagged the repeated `/banyan-uat` skips as a workflow gap. TASK-008 ran a full UAT walk between Phase 3 and Phase 4, surfaced two genuine operational gaps (UAT-REC-01, UAT-REC-02) that informed the Phase-4 E2E DB setup, and generated the E2E spec that Phase 4 implemented. The UAT-to-E2E-spec-to-Playwright-implementation pipeline worked exactly as the Level 3 workflow intends.

4. **Test count exceeded plan in the quality direction.** 52 unit/integration + 7 Playwright = 59 total vs. the planned 28–36. The 13 utility tests (`formatRelative`, `statusLabel`) were not in the original plan but are the tests most likely to catch user-visible regressions. The E2E test for the non-fatal error scenario (Playwright Scenario 3) and the explicit mobile viewport test (Scenario 2) fill gaps the UAT walk could not exercise.

5. **All four creative decisions held as exact implementation contracts through all four build phases.** Zero mid-phase design reversals. The Phase-3 implementation of `getActivity` as a separate non-fatal fetch, the Phase-4 `installFakeEventSource`/`emitActivityFrame` controllable stub, and the Scenario 4 real-DB cross-tab test all derived directly from the creative docs' specifications without re-derivation.

6. **The controllable `EventSource` stub (`installFakeEventSource`/`emitActivityFrame`) is a reusable E2E pattern.** Exposing `window.__emitSSE` via `addInitScript` before navigation gives the hermetic `chromium` project the ability to inject SSE frames that a mocked API cannot broadcast. This pattern is novel in the project and directly solves the "how do you test SSE delivery in a mocked environment" problem without needing a real backend.

### Challenges Encountered

1. **UAT-REC-01: migration not applied to dev DB** — On the UAT pre-walk, every board's `GET /api/v1/boards/:id/activity` returned 500. The Phase-1 migration `1783022741842_create-activity-events-table` was unapplied in the dev DB. Resolution: remediated during UAT by running `npm run migrate`; Phase-4 E2E DB setup ensures the migration is applied before the realtime test run via `scripts/e2e-db-setup.mjs`. Impact on future tasks: the deploy runbook needs an explicit "apply pending migrations" step, and the `scripts/e2e-db-setup.mjs` idempotent harness is the correct model for E2E DB management.

2. **UAT-REC-02: `npm run migrate` does not load `.env`** — The migrate npm script does not load `.env` before connecting, so `DATABASE_URL` was missing and the SASL authentication failed when running without an explicit env prefix. The backend loads `.env` via `src/config/env.ts`, but the migrate script bypasses this. Resolution: workaround for the UAT run was to pass `DATABASE_URL` explicitly. Fix requires adding `dotenv` loading to the migrate script (e.g., `node -r dotenv/config node_modules/.bin/node-pg-migrate up`). This is a DX gap that predates TASK-008 but was first surfaced here.

3. **Phase-3 `getActivity` mock defaulting in `BoardViewPage.test.tsx`** — The `getActivity` API function was not present in previous `BoardViewPage` tests. Adding the feed fetch to `BoardViewPage` caused all pre-existing tests to fail because the unmocked call returned `undefined`. Resolution: add a `beforeEach` defaulting `getActivity` to `mockResolvedValue([])` — every pre-existing test implicitly exercises the no-activity feed state. This is documented as a Phase-3 resumption gotcha.

4. **Phase-4 E2E selector collision: kanban cards also expose `role="listitem"`** — An unscoped `getByRole('listitem')` query matched both kanban card items and feed entries. Resolution: all feed entry queries must be scoped to `getByRole('complementary', { name: 'Activity' })`. This gotcha is documented in the Phase-4 notes and should be a standard pattern for any future Playwright work on this board — always scope `listitem` queries to a landmark.

5. **Phase-4 `MoveCardDialog` submit button ambiguity** — `getByRole('button', { name: 'Move' })` collided with the per-card "Move card: …" buttons. Resolution: `{ name: 'Move', exact: true }` resolves the ambiguity. The E2E spec's Selector Registry explicitly notes this.

### Creative Decision Assessment

#### Architecture Decision 1: SSE on existing channel (Option 1A)
- **Decision**: Add `activity:card_moved` to existing `RealtimeEventType` union; broadcast on the existing `/events` channel.
- **Outcome**: Zero new transport code; naturally board-scoped; ordering-coherent with `card:updated`.
- **Verdict**: Correct. The broadcaster and eventsRouter proved as generic as the creative doc predicted — no adaptation required.

#### Architecture Decision 2: Pre-flight `findById` for `from_status` (Option 2A)
- **Decision**: Read the card before updating; compare `before.status` vs returned row.
- **Outcome**: Mirrors the DELETE handler; zero DAL changes; testable via supertest.
- **Verdict**: Correct. Phase-2 test gotcha (pg returns fresh rows per query — mock returns must be COPIES) was the only wrinkle, and it is a standard mock hygiene issue rather than a design problem.

#### Architecture Decision 3: No `originId` on activity envelope (Option 3A)
- **Decision**: `ActivityCardMovedEvent` interface omits `originId`; never echo-deduped.
- **Outcome**: Originator delivery structurally guaranteed; UAT cross-tab walk and Playwright Scenario 4 both confirmed.
- **Verdict**: Excellent. The structural approach was the correct choice over the conditional type-specific exception (rejected Option 3B).

#### Architecture Decision 4: No pruning; read LIMIT 200 (Option 4A)
- **Decision**: No pruning in v1; index + LIMIT bounds the read.
- **Outcome**: Simplest correct design; respects productBrief "no automatic deletion" stance; forward-compatible.
- **Verdict**: Correct for this scale and product stance.

#### UI/UX Decision: Right sidebar + responsive stack-below (Option 4)
- **Decision**: `grid-template-columns: minmax(0, 1fr) 260px` on desktop; single column below 900px.
- **Outcome**: Feed panel is simultaneously visible with kanban on desktop (primary use case for Alex). Mobile layout was verified via Phase-4 Playwright Scenario 2 rather than UAT browser walk.
- **Verdict**: Correct. The 260px sidebar width is tight but readable; the responsive stack-below cleanly recovers kanban width at tablet.

#### UI/UX Implementation: Separate non-fatal `getActivity` fetch
- **Decision**: Fire `getActivity` separately from `Promise.all([getBoard, getCards])`; catch independently; set `feedError` flag.
- **Outcome**: Board view remains fully functional even when the activity endpoint errors. Verified by Playwright Scenario 3.
- **Verdict**: Critical and correct. Would have been a serious usability regression if the feed failure cascaded to the board.

### Technical Debt and Future Work

- **`npm run migrate` `.env` loading (UAT-REC-02)**: The migrate npm script needs `dotenv` integration so `DATABASE_URL` from `.env` is loaded consistently. This affects all developers who run migrations manually. Recommend a Level 1 fix.
- **Deploy runbook migration step (UAT-REC-01)**: The deployment/onboarding docs do not explicitly call out "apply pending migrations before starting the backend." While the E2E DB harness handles this for tests, human-run deployments need the step documented.
- **OpenAPI spec (carried from TASK-004 through TASK-008)**: The API surface now includes the `GET /api/v1/boards/:boardId/activity` endpoint. Still deferred — now spans 11+ REST endpoints + SSE channel.
- **Activity feed pagination**: `LIMIT 200` means feeds with >200 entries silently truncate. Not a v1 problem at ≤20 users, but worth scheduling as a follow-up when the team grows.
- **Actor identity for auth landing**: The `activity_events.actor` column ships as `varchar(255) NOT NULL DEFAULT 'anonymous'`. No migration required when auth lands — only the recording site in `cards.ts` needs updating to read from `req.user`.
- **SSE settle timing in `realtime.spec.ts` (carried from TASK-007)**: Still a fixed 700ms await rather than a signal-based readiness check. The TASK-008 `realtime.spec.ts` (Scenario 4) inherits this pattern.

---

## Dimension 2: Claude Code Ecosystem Effectiveness

### Build Session Analysis

By-task session logs at `.agent-logs/claude/by-task/TASK-008/` do not exist. **This is the eighth consecutive task (TASK-001 through TASK-008) without by-task session log indexing.** Session logs not task-indexed. Run /banyan-init to upgrade.

Quantitative tool-call counts, duration metrics, and sub-agent invocation counts are unavailable. Analysis is derived from the per-phase Completed Steps in `memory-bank/tasks/TASK-008.md` and the phase summaries in `memory-bank/progress.md`.

**Build Sessions**: 4 (Phase 1, Phase 2, Phase 3, Phase 4 — each committed a green, tested build)
**UAT Sessions**: 1 (run 20260630-001; PASS_WITH_RECOMMENDATIONS)
**Creative Sessions**: 2 (Architecture + UI/UX)
**Sub-Agents Spawned (estimated)**: ~2 creative agents + 4 coding agents + 1 UAT walker + 1 UAT synthesizer + 1 E2E spec writer + 1 reflection agent = ~10 sub-agents across the lifecycle
**Build Failures**: 0 across all 4 phases
**Errors Recovered**: 1 (UAT-REC-01 — migration not applied to dev DB; remediated during UAT walk)

#### Tool Utilization (Qualitative — derived from phase notes)

| Tool | Usage Pattern | Notes |
|------|---------------|-------|
| Read | Very High | Every phase loaded task file, creative docs, prior-phase source files, techContext, systemPatterns, progress.md |
| Write | Moderate | New files: migration JS, `src/db/activity.ts`, `src/routes/activity.ts`, `ActivityFeed.tsx/.module.css/.test.tsx`, `scripts/e2e-db-setup.mjs` extension, E2E spec files |
| Edit | High | Existing files modified: `src/realtime/events.ts`, `src/realtime/notify.ts`, `src/routes/cards.ts`, `src/routes/index.ts`, `client/src/api/types.ts`, `client/src/api/apiClient.ts`, `client/src/realtime/useRealtimeBoard.ts`, `client/src/pages/BoardViewPage.tsx`, `client/e2e/fixtures.ts`, `progress.md`, `tasks.md`, `techContext.md` |
| Bash | Moderate | `npm test`, `tsc -b`, `vite build`, `npm run e2e`, `node-pg-migrate up` (via UAT remediation) |
| Grep | Low-Moderate | Pattern lookups: existing PATCH handler structure in `cards.ts`, `notifyCardChange` call sites, `useRealtimeBoard` handler registration pattern |
| Glob | Low | Directory exploration at phase start |
| Agent/Task | Moderate | Creative agents (both), coding agents (per phase), UAT agents, E2E spec writer |

#### Sub-Agent Performance

| Agent Type | Invocations | Model | Effectiveness |
|------------|-------------|-------|---------------|
| Spec Writer | 1 (planning) | Sonnet | High — task specification captured all 12 ACs, the `from_status` capture risk, the no-`originId` requirement, and the non-fatal feed fetch pattern. Actor identity decided in planning (anonymous stub). |
| Creative Architecture | 1 | Sonnet/Opus | Excellent — 4 architecture questions resolved with full option analysis (3 options each for Q1/Q2, 2 for Q3, 3 for Q4), risk table, exact TypeScript interface sketches, and step-by-step implementation guidelines. The no-`originId` envelope design was the most precise decision: it specified the exact guard logic and why the structural absence was preferred over a conditional exception. |
| Creative UI/UX | 1 | Sonnet | Excellent — 4 decision areas (layout, entry presentation, states, live-entry behavior, accessibility) each with specific CSS values, exact token references, and component structure. The "separate non-fatal `getActivity` fetch" was explicitly specified. UAT journey was embedded in the creative doc and extracted into the standalone user-journey doc. |
| Build Coding Agent | 4 (one per phase) | Sonnet | High — each phase implemented exactly to spec with no mid-phase structural reversals. Phase-2 correctly identified the mock-aliasing gotcha (pg returns fresh rows per query). Phase-4 introduced the `installFakeEventSource`/`emitActivityFrame` pattern not fully specified in the UAT E2E spec — an implementation innovation that correctly solved the hermetic SSE injection problem. |
| UAT Walker | 1 | (MCP-driven) | High — UAT-REC-01 (migration not applied) was a genuine operational gap not caught by unit tests. UAT-REC-02 (`npm run migrate` `.env` loading) was surfaced during UAT-REC-01 remediation. Both are actionable and led to Phase-4 improvements. UAT-REC-03 (mobile viewport) correctly escalated to Playwright rather than blocking PASS. |
| UAT Synthesizer + E2E Spec Writer | 1 each | Sonnet | High — the generated E2E spec was well-structured (4 scenarios across 2 Playwright projects, Selector Registry, Network Waits table, Implementation Notes). The Phase-4 implementation notes correctly identified the `installFakeEventSource` pattern as a solution for the mocked SSE injection problem. |
| Build Code Reviewer | Embedded per phase | Sonnet | High — 0 blocking findings across all 4 phases. All GP5 no-leak, pino-only, board-scoping, and echo-de-dup properties verified. |
| Build Documentation Agent | Embedded per phase | Haiku (est.) | Adequate — `techContext.md` updated at Phase 3 (frontend `ActivityFeed` component, `getActivity` API call, `onActivityEvent` SSE routing). `systemPatterns.md` not recorded as modified — consistent with no new architectural patterns introduced beyond the existing Domain Event Pattern. |

### Command Workflow Evaluation

**Commands Used**:
- `/banyan-plan TASK-008` x 1
- `/banyan-creative TASK-008` x 2 (Architecture + UI/UX)
- `/banyan-build TASK-008` x 4 (Phase 1, 2, 3, 4)
- `/banyan-uat TASK-008` x 1 (run 20260630-001, between Phase 3 and Phase 4)
- `/banyan-reflect TASK-008` x 1 (current)

**Workflow Efficiency**: Excellent

**Assessment**:

- The Level 3 workflow (plan → 2 creative phases → 3 build phases → UAT → E2E build phase → reflect) executed cleanly and matched the task's natural phase decomposition. Four build phases for a backend-first, frontend-second feature is correctly sized.

- **UAT completion is the most significant workflow milestone of this task.** TASK-007 and multiple prior tasks skipped `/banyan-uat` due to MCP availability. TASK-008 ran UAT successfully, and the pipeline from walk → E2E spec → Phase-4 implementation worked exactly as the Level 3 workflow intends. UAT-REC-01 and UAT-REC-02 were operational gaps that would not have been caught by unit tests alone.

- The UAT-between-builds Level 3 insertion point worked well. Running UAT after Phase 3 (all features implemented) and before Phase 4 (E2E implementation) is the correct order: UAT discovers behavioral gaps that the E2E spec then encodes as regression coverage. The mobile viewport gap (UAT-REC-03) correctly deferred to Playwright with explicit viewport — UAT identified the gap and the E2E phase filled it.

- No command gaps were encountered. The plan → creative → build → UAT → build → reflect sequence executed without interruption. Phase transitions were clean — each phase ended with a green full suite and a committed build.

- Complexity Level 3 classification was accurate. Smaller surface area than TASK-007 (4 build phases vs. 6) but requires the same creative-phase investment (two design docs resolving non-trivial architecture and UI/UX questions). A Level 2 classification would have missed the Architecture creative decisions that drove the no-`originId` design.

### Context File Effectiveness

**Files Loaded**:
- `memory-bank/tasks/TASK-008.md` — primary implementation contract (updated per-phase)
- `memory-bank/creative/TASK-008-activity-feed-architecture.md` — loaded at Phases 1 and 2
- `memory-bank/creative/TASK-008-activity-feed-uiux.md` — loaded at Phase 3
- `memory-bank/creative/TASK-008-activity-feed-user-journey.md` — loaded by UAT agents
- `memory-bank/techContext.md` — loaded at each phase for commands and env vars
- `memory-bank/systemPatterns.md` — loaded for GP1/GP3/GP5 + Domain Event Pattern
- `memory-bank/progress.md` — loaded for context from prior phases (TASK-007 FEAT-007 SSE infrastructure)
- `memory-bank/agent-rules/_learned/*.md` — 7 topic files consulted during build phases

**Assessment**:

- **Helpful — Architecture creative as implementation contract**: The implementation guidelines section of the Architecture creative contained exact TypeScript interface sketches for `ActivityCardMovedEvent`, exact SQL for `listByBoard` with `LIMIT 200`, and the precise change diff for the cards PATCH handler (including `before !== null` race guard and `res.json` first/recording second ordering). The Phase-2 coder implemented the recording block directly from the creative's `cards.ts` pseudocode. This continued to be the highest-ROI aspect of the creative phase.

- **Helpful — UI/UX creative component structure and implementation guidelines**: The Implementation Guidelines section specified the `getActivity` non-fatal fetch pattern (Guideline 2), the `newestEntryId` state flag for highlight (Guideline 4), and the exact CSS class names (Guideline 8). These were used directly in Phase 3 without re-derivation.

- **Helpful — Learned rules from prior tasks**: Seven `_learned/` rule files available. All applied:
  - `realtime.md` (SSE-in-createApp()): confirmed the no-new-transport architecture; validated that `broadcaster.ts` and `eventsRouter.ts` are already generic.
  - `frontend.md` (EventSource useRef + unmount close; X-Client-Id → originId echo de-dup): the no-`originId` design correctly extends the echo de-dup rule by deliberate omission — confirming that activity events must not be subject to the de-dup logic.
  - `testing-patterns.md` (dedicated real-DB Playwright project for cross-context SSE): confirmed Phase-4 `activity-feed.realtime.spec.ts` belongs in the `realtime` project; confirmed `installFakeEventSource` is needed for the hermetic project.
  - `api-design.md` (pre-flight parent findById → 404; `Router({ mergeParams: true })`): `src/routes/activity.ts` applied both rules directly.
  - `error-handling.md`: `notifyCardMoved` fire-and-forget defensive pattern and GP5 no-leak in the activity route.
  - `typescript-config.md` (`noUncheckedIndexedAccess`): applied in `req.params.boardId ?? ''` discipline.
  - `tooling.md`: no new npm packages this task; rule confirmed not applicable.

- **Gap — No frontend context file in the plugin (persists from TASK-006 and TASK-007)**: The third consecutive frontend-heavy task. A plugin-level `frontend-react.md` would have covered the `getByRole('complementary', { name: 'Activity' })` ARIA role, the `beforeEach` mock-default pattern for new API calls in existing test files, and the `setViewportSize` Playwright viewport pattern. Without it, these had to be derived during implementation.

- **Gap — No migration-as-deployment-step guidance**: The UAT-REC-01 gap (migration not applied to dev DB) and UAT-REC-02 (`npm run migrate` not loading `.env`) suggest that the Memory Bank should have a section or context file covering deployment prerequisites. A `deploy-checklist.md` or a note in `techContext.md` Development Commands would prevent this class of UAT finding.

- **No new gaps introduced** beyond those already identified in prior reflections.

### Memory Bank Organization

**Assessment**:

- **Structure**: The six-layer organization (tasks.md → tasks/TASK-008.md → progress.md → creative/ (3 docs) → uat/ (report + spec) → reflection/) handled a Level 3, 4-phase + UAT task cleanly. The per-phase Build Execution State section in `TASK-008.md` with Phase-3 resumption gotchas and Phase-4 resumption gotchas was used directly by each phase's coder — the gotcha format proved its value when the Phase-3 `getActivity` mock-defaulting issue would otherwise have required re-discovery.

- **Navigation**: The UAT report (`uat-TASK-008.md`) and E2E spec (`spec-TASK-008-e2e.md`) were well-structured and directly consumed by Phase 4. The Selector Registry in the E2E spec (confirmed against live DOM) was especially useful for Phase-4 implementation.

- **Completeness**: The three creative docs (architecture, uiux, user-journey) cleanly covered their respective scopes. No overlap between architecture and uiux docs. The user-journey doc correctly extracted only the UAT-relevant walkable steps from the UI/UX creative, without duplicating the design rationale.

- **Minor gap**: `learning-log.md` and `learning-metrics.md` should record this task's learnings once extracted. The continuous learning consolidation pass in `/banyan-archive` should merge the SSE envelope pattern into `realtime.md` and the separate-non-fatal-fetch pattern into `frontend.md`.

### Suggested Improvements to Claude Code System

> **Note**: These are suggestions only. Do NOT implement these changes — they are recommendations for future system enhancements.

#### High Priority

1. **Fix by-task session log symlinking (eighth consecutive task without this data)** — The by-task session log directory remains unpopulated for all eight tasks in this project. This is now a confirmed systemic defect affecting audit capability, reflection quality, and debugging of agent behavior. Every reflection in this project's history has been produced without quantitative tool-call or duration data. The fix must populate `.agent-logs/claude/by-task/TASK-XXX/` for all workflow command sessions (orchestrator + sub-agents). Treating this as a P0 infrastructure defect is appropriate and has been appropriate since TASK-006.

2. **Add `frontend-react.md` context file to the plugin** — Three consecutive frontend-heavy tasks (TASK-006, TASK-007, TASK-008) have had to re-derive or re-document: `getByRole('complementary')` for ARIA landmark queries, the `beforeEach` mock-default pattern for new API calls in existing test files, the `setViewportSize` Playwright pattern for responsive tests, and CSS Modules camelCase naming conventions. A plugin-level file covering these React/Vite/Playwright patterns would eliminate creative-phase re-derivation and Phase-3/4 implementation surprises for all future frontend tasks.

#### Medium Priority

3. **Add a deploy-checklist or migration-step guidance to the Memory Bank templates** — UAT-REC-01 (migration not applied to dev DB) and UAT-REC-02 (`npm run migrate` not loading `.env`) are operational gaps that unit tests cannot catch and that UAT surfaced only because an actual browser walk was run. A `techContext.md` Development Commands section noting "apply pending migrations before starting the backend (`DATABASE_URL=... npx node-pg-migrate up`)" would prevent this class of UAT finding for every new task that adds a migration. Alternatively, a plugin-level `deploy-checklist.md` template populated during `/banyan-init` would address this structurally.

4. **Document the controllable `EventSource` stub pattern in the Level 3 implementation context file** — TASK-008 Phase 4 introduced `installFakeEventSource`/`emitActivityFrame` (exposing `window.__emitSSE` via `addInitScript` before navigation) as the solution for injecting SSE frames in a mocked Playwright project. This pattern is reusable for any future task that needs to test SSE delivery in the hermetic project (e.g., presence indicators, notifications, board-list-level events). Adding a paragraph to the Level 3 context file — alongside the existing two-Playwright-project pattern from TASK-007 — would prevent future re-derivation.

5. **Add a pre-flight check for by-task log indexing in `/banyan-reflect`** — If `.agent-logs/claude/by-task/TASK-XXX/` is empty or missing, `/banyan-reflect` should emit a visible warning ("Session logs not task-indexed — metrics unavailable. Run /banyan-init to upgrade.") rather than silently proceeding. This would make the systemic gap visible at the moment it affects the workflow, rather than only in the finished reflection document.

#### Low Priority / Nice to Have

6. **Add `npm run migrate` `.env` fix to the plugin's project init checklist** — When `/banyan-init` sets up the `techContext.md` Development Commands section, it should note that the migrate script requires explicit `DATABASE_URL` (or a `dotenv` integration) if `.env` is the source of truth. This is a one-line note that prevents UAT-REC-02 class issues on every project that uses `node-pg-migrate` with `.env`.

7. **Extract the non-fatal separate-fetch pattern to `frontend.md` during `/banyan-archive`** — The pattern of firing a secondary, optional data fetch (like `getActivity`) outside the primary `Promise.all` and treating its failure as non-fatal is a reusable frontend architecture pattern. It should be added to the `frontend.md` learned rule as a fifth bullet, so future tasks with optional sidebar/panel data (notifications panel, comment feed, audit log) have a canonical pattern to follow.

---

## Key Learnings

### Extractable Learnings (for Continuous Learning)

These learnings will be extracted into `memory-bank/agent-rules/_learned/`. Level 3 maximum is 2–4 learnings.

1. **realtime** (`src/realtime/**`, `client/src/realtime/**`, `client/src/api/types.ts`): When a realtime event must be delivered to ALL clients including the originator (i.e., no echo-de-dup), omit `originId` from the event's TypeScript interface entirely rather than adding a type-specific exception to the de-dup guard — the structural absence is self-documenting and immune to future guard refactors.

2. **frontend** (`client/src/pages/**`, `client/src/**/*.tsx`): Fire optional/non-critical data fetches (activity feed, sidebar panel, notification count) in a separate `try/catch` outside the primary `Promise.all` for required page data — a fetch failure for a non-critical panel must never prevent the board/page from rendering.

3. **testing-patterns** (`client/e2e/**`, `**/*.spec.ts`): In a hermetic Playwright project (mocked API), inject SSE frames by installing a controllable `EventSource` stub via `addInitScript` (before navigation) that exposes `window.__emitSSE` — call it after triggering the mocked PATCH to simulate the server's `activity:card_moved` broadcast; the real-DB project tests the actual SSE path.

4. **api-design** (`src/routes/**/*.ts`, `scripts/*.mjs`): Apply database migrations as an explicit step in every deployment and E2E test harness startup (e.g., `node-pg-migrate up` in `scripts/e2e-db-setup.mjs` before `node dist/index.js`); never assume a feature's migration is applied — a missing migration yields a 500 that unit tests cannot catch but UAT will.

**Consolidation guidance**:
- Learning 1 amends `realtime.md` (adds a second bullet on the no-`originId` structural pattern).
- Learning 2 amends `frontend.md` (adds a fifth bullet on the non-fatal separate fetch).
- Learning 3 amends `testing-patterns.md` (adds a seventh bullet on the controllable EventSource stub).
- Learning 4 amends `api-design.md` (adds a fifth bullet on explicit migration application in deployment/E2E harness).

### Learned Rules Applied

- **realtime.md** (SSE-in-createApp() over WebSocket for single-host server-push): Applied and reinforced — confirmed that `broadcaster.ts` and `eventsRouter.ts` are already generic over `RealtimeEvent`; the `activity:card_moved` additive union member extended the channel without any transport modification. Evidence count increases: 1 → 2.
- **frontend.md** (EventSource useRef + unmount close; X-Client-Id → originId echo de-dup): Applied — the no-`originId` design for the activity event directly extends the echo de-dup pattern by deliberate omission. The `useRealtimeBoard` hook's existing guard handled the new event type correctly without modification. Evidence count increases: 4 → 5 (for the echo de-dup pattern reinforcement; non-fatal fetch is new).
- **testing-patterns.md** (dedicated real-DB Playwright project for cross-context SSE): Applied — `activity-feed.realtime.spec.ts` placed in the `realtime` project for Scenario 4; `activity-feed.spec.ts` placed in the `chromium` project for Scenarios 1–3. The controllable EventSource stub is a novel extension of this pattern. Evidence count increases: 6 → 7.
- **api-design.md** (pre-flight parent findById → 404; Router mergeParams): Applied — `src/routes/activity.ts` uses `Router({ mergeParams: true })` and pre-flight `findBoardById` exactly as the rule specifies. Evidence count unchanged (rules confirmed, no new evidence generated).
- **error-handling.md** (type `err` as `unknown`; no message/stack leak): Applied — `notifyCardMoved` defensive wrapper and GP5 no-leak in the activity route and ActivityFeed error state. Evidence count unchanged.
- **typescript-config.md** (`noUncheckedIndexedAccess`): Applied — `req.params.boardId ?? ''` discipline in activity route, consistent with prior routes. Evidence count unchanged.
- **tooling.md**: No new npm packages in TASK-008; rule not applicable this task.

### For Claude Code Workflow

1. **UAT-to-E2E-spec-to-Playwright pipeline worked as designed for the first time.** The /banyan-uat → E2E spec → /banyan-build Phase 4 sequence is the correct Level 3 flow, and TASK-008 demonstrated it completely. The two operational gaps (UAT-REC-01, UAT-REC-02) that UAT surfaced would not have been caught by unit tests. Future Level 3 tasks should treat UAT as a mandatory step, not an optional one.

2. **Phase resumption gotchas in `tasks/TASK-008.md` were the single most effective quality mechanism for cross-phase knowledge transfer.** The Phase-3 note that "`getActivity` must be fired SEPARATELY from the board/cards `Promise.all`" and the Phase-4 note that "feed-entry queries MUST be scoped to the `complementary` landmark" were used directly by each subsequent phase's coder. The gotcha format — written at phase completion, consumed at the next phase's start — is a lightweight but high-value knowledge transfer mechanism that should be explicitly required in the build phase context files.

3. **The by-task session log gap is now a material audit risk.** Eight consecutive tasks without quantitative metrics means the Reflection Agent cannot report on tool usage efficiency, sub-agent duration outliers, or error recovery frequency. The reflection quality ceiling is constrained by this gap. If the infrastructure fix is not prioritized, the reflection process should develop a compensating mechanism (e.g., the orchestrator manually records key metrics to a task-scoped journal during each build phase).

---

## Conclusion

TASK-008 delivered a production-quality realtime activity feed on top of the FEAT-007 SSE infrastructure, completing the full Level 3 lifecycle including the first successful UAT run in this project's history. All 12 MUST acceptance criteria were met with direct evidence across 52 unit/integration tests, 7 Playwright E2E tests, and a browser UAT walk. The architectural core — the no-`originId` activity event envelope — demonstrates the value of structural design decisions over conditional guards: a TypeScript interface omission is more robust than a type-specific exception in a generic handler.

The creative-phase-as-implementation-contract pattern performed at its highest effectiveness here. Four architecture decisions and four UI/UX decisions were made before a single line of implementation code was written; all eight held through all four build phases without revision. The ROI on the two creative phases — measured as "design re-derivation hours saved across four build phases" — was substantial.

The workflow gap from TASK-007 (no `/banyan-uat` run) was closed in TASK-008. The UAT walk's two Recommended findings (migration not applied; migrate not loading `.env`) are deploy-runbook gaps that inform the project's operational maturity. These are precisely the kind of findings that browser-level UAT surfaces that automated test suites cannot.

Four extractable learnings — the no-`originId` structural pattern, the non-fatal separate fetch, the controllable EventSource stub, and the explicit migration application requirement — update four existing `_learned/` topic files and extend the project's continuous learning system with patterns that will benefit every future realtime and frontend task.

**Overall Task Success**: Success

**Overall Workflow Effectiveness**: Highly Effective (first UAT completion in project history; all 4 creative decisions held as implementation contracts; zero build failures across all 4 phases; 0 blocking code-review findings; UAT-to-E2E pipeline worked as designed; by-task session log gap remains the one persistent systemic limitation)

**Recommendation**: Ready to archive.

---

## References

- Plan + Execution State: `memory-bank/tasks/TASK-008.md`
- Architecture creative: `memory-bank/creative/TASK-008-activity-feed-architecture.md`
- UI/UX creative: `memory-bank/creative/TASK-008-activity-feed-uiux.md`
- User Journey (UAT): `memory-bank/creative/TASK-008-activity-feed-user-journey.md`
- UAT Report: `memory-bank/uat/uat-TASK-008.md`
- E2E Spec: `memory-bank/uat/spec-TASK-008-e2e.md`
- Progress (per-phase summaries): `memory-bank/progress.md`
- Prior reflection (TASK-007, realtime predecessor): `memory-bank/reflection/reflection-TASK-007.md`
