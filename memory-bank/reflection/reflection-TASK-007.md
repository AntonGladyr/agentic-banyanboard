# Reflection: TASK-007 — Board Interactivity and Real-Time Collaboration

**Date**: 2026-06-21
**Task Complexity**: Level 3 (manual override; auto-evaluated Level 4)
**Total Phases**: 6 (2 creative + 6 build)
**Branch**: feature/FEAT-007-board-interactivity-realtime-collab
**Duration**: 2026-06-21 (plan + both creative phases + all 6 build phases, single day)

---

## Executive Summary

TASK-007 transformed the read-only React SPA delivered in FEAT-006 into a fully interactive kanban board: create/edit boards and cards across four distinct form surfaces, drag cards between status columns with optimistic updates and rollback-on-failure, and broadcast mutations live to every viewer of the same board via Server-Sent Events. The task introduced the project's first real-time transport tier — a new backend module (`src/realtime/`) — alongside the project's first client runtime dependencies (`@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`). All 12 acceptance criteria were met with direct test and E2E evidence, and all 6 phases passed independent code-reviewer sub-agent review with zero blocking findings.

The test suite grew from 34 frontend Vitest + 138 backend Jest + 7 Playwright E2E (TASK-006 baseline) to 118 frontend Vitest + 150 backend Jest + 16 Playwright E2E — a net gain of 84 frontend Vitest tests, 12 backend Jest tests, and 9 Playwright E2E specs from this task alone, substantially exceeding the planned 44–54 range. Two mandatory creative phases (Architecture and UI/UX) again held up as direct implementation contracts through all six build phases, with zero mid-phase design reversals. The SSE transport decision — which resolved the hardest architectural question (real-time without breaking the `createApp()` supertest seam) — was particularly successful: zero new backend runtime dependencies, zero Vite proxy changes, native `EventSource` reconnection for free, and the two-tab E2E suite (AC-REALTIME-1/2) verified it stable across `--repeat-each=3`.

From an ecosystem perspective, the Banyan Level 3 workflow performed consistently with TASK-006: creative phases eliminating design re-derivation, the six-phase TDD cycle (RED test → GREEN implementation → code review → docs) producing reliable, reviewable increments, and the independent code reviewer agent adding quality at every step. Recurring friction from the prior task persisted: by-task session logs remain unpopulated for the seventh consecutive task, quantitative tool-call metrics continue to be unavailable, and a frontend context file gap in the plugin remains unaddressed.

---

## Dimension 1: Task Implementation Quality

### Requirements Achievement

**Status**: All Met

All 12 acceptance criteria were satisfied with direct test and E2E evidence. The mapping:

| AC | Phase | Test Evidence |
|----|-------|---------------|
| AC-ENTRY-1 (create board visible/keyboard-reachable) | Phase 2 | BoardListPage renders "New Board" affordance; Playwright AC-HAPPY-1 journey |
| AC-ENTRY-2 (add card in each column) | Phase 3 | Column +5 tests; Playwright AC-HAPPY-3 |
| AC-HAPPY-1 (create board end-to-end) | Phase 2 | BoardListPage +6; Playwright `interactive-journeys.spec.ts` |
| AC-HAPPY-2 (edit board name/description) | Phase 2 | BoardViewPage +5; Playwright `interactive-journeys.spec.ts` |
| AC-HAPPY-3 (create card in specific column) | Phase 3 | BoardViewPage +3 (scoped to named column, absent from others — stub-detection); Playwright |
| AC-HAPPY-4 (edit card title/description) | Phase 3 | BoardViewPage +3; Playwright |
| AC-HAPPY-5 (drag card, status persisted) | Phase 4 | resolveCardMove 5 + BoardViewPage +3 (keyboard move path); Playwright pointer drag + reload-persists |
| AC-REALTIME-1 (card drag visible in Tab B) | Phase 5 + Phase 6 | useRealtimeBoard 5 + BoardViewPage +3 + `realtime.spec.ts` two-tab (stable across `--repeat-each=3`) |
| AC-REALTIME-2 (new card visible in Tab B) | Phase 5 + Phase 6 | Same sources as AC-REALTIME-1 |
| AC-ERROR-1 (board name required) | Phase 2 | BoardForm 10 |
| AC-ERROR-2 (card title required) | Phase 3 | CardForm 12 |
| AC-ERROR-3 (server error preserves input) | Phase 2 + Phase 3 | BoardForm + CardForm error state; Playwright `interactive-journeys.spec.ts` failed-POST scenario |
| AC-ERROR-4 (DnD rollback on failure) | Phase 4 | BoardViewPage +3 (rollback + GP5 no-leak for move failure); Playwright intercept PATCH→500 (indirect via error-3 test) |
| AC-LOADING-1 (pending state on writes) | Phase 2 + Phase 3 | BoardForm + CardForm submit-disabled tests |
| AC-NAV-1 (cancel without API call) | Phase 2 + Phase 3 | BoardForm + CardForm cancel tests; Playwright cancel-form WriteLog empty assertion |
| WCAG 2.1 SC 2.1.1 (keyboard DnD alternative) | Phase 4 | MoveCardDialog 4; BoardViewPage keyboard-move path (updateCardStatus called + card in new column); AC-HAPPY-5 verified |

One scope item slightly exceeded original planning: the Phase 6 two-Playwright-project design (hermetic `chromium` + real-DB `realtime`) was more sophisticated than the original Phase 6 description, but it was the correct solution for a task that requires genuine cross-context SSE propagation (AC-REALTIME-1/2) to be testable. A mocked API cannot broadcast an SSE event from one browser context to another — this architectural insight drove the real-DB Playwright project design.

**Scope boundaries held completely.** Delete board/card UI, intra-column reordering, card labels, authentication, multi-stage Dockerfile, and OpenAPI spec all remained out of scope. OpenAPI spec remains a multi-task carried deferred item (FEAT-004/005 → TASK-006 → TASK-007).

### Code Quality Assessment

**Overall Rating**: Excellent

- **Maintainability**: New components follow clear single-responsibility boundaries. `broadcaster.ts` is HTTP-ignorant (pure pub/sub, unit-testable with fake sinks). `notify.ts` is the sole mutation-to-broadcast bridge, isolating the fire-and-forget concern. `BoardForm`/`CardForm` are content-only components, reused across two contexts each (Dialog/inline). `MoveCardDialog` is a standalone keyboard-alternative component. The `resolveCardMove` pure function is the testable seam for drag-end logic. All new code follows the project's established patterns with no new architectural styles introduced.

- **Architecture**: The `createApp()` supertest seam was preserved exactly as the Architecture creative required — SSE mounts as an ordinary `/api/v1` route, supertest-injectable, no `index.ts` changes for the transport. The broadcaster pattern (HTTP-ignorant Map-keyed pub/sub hub with an injected sink interface) is both correctly designed and directly testable. Optimistic DnD with rollback is localized to `BoardViewPage.handleMoveCard`, shared between pointer drop and keyboard dialog paths. Echo de-dup via `X-Client-Id` → `originId` round-trip is a clean, stateless, single-field mechanism that satisfies R5 without server-side per-client tracking.

- **Error Handling**: GP5 is structurally enforced end-to-end: `sendJson` never reads the response body on error (GP5); write error copy is keyed on `ApiError.category` only; rollback copy is static (`dragRevertErrorCopy`); the SSE route returns 404 on `REALTIME_ENABLED=false` without leaking the "disabled" detail; the `notify.ts` broadcast failure logs at warn and can never propagate to the HTTP mutation response. Independent code reviewers verified GP5 compliance in every phase.

- **Testing**: 84 net-new frontend Vitest tests, 12 net-new backend Jest tests, 9 net-new Playwright E2E specs. TDD discipline held in all phases — tests were written first (RED state confirmed), then implementation (GREEN). The real-DB `realtime` Playwright project is the project's first genuinely end-to-end test layer with real persistence, real SSE, and two independent browser contexts. The `scripts/e2e-db-setup.mjs` idempotent harness (CREATE IF MISSING → migrate → TRUNCATE) ensures deterministic state.

### Technical Decisions

**Key Decisions:**

1. **SSE transport over WebSocket** (Architecture Decision 1) — SSE preserves the `createApp()` supertest seam, requires zero Vite proxy changes, gets native `EventSource` reconnection for free, and introduces zero new backend runtime dependencies. The WebSocket alternative would have broken the factory seam and introduced a proxy configuration wrinkle. This was the single most impactful decision in the task and the rationale was sound and well-evidenced. Outcome: fully verified end-to-end in Phase 6 with the two-tab `realtime.spec.ts` suite, confirmed stable across `--repeat-each=3`.

2. **Optimistic drag-and-drop with rollback** (Architecture Decision 3) — Delivers the "zero context-switch overhead" persona goal (Alex the Dev) and satisfies the "immediate" success criteria language. The rollback path (capture prior status → optimistic move → PATCH → on reject, restore status + static error banner) is bounded, localized in `BoardViewPage.handleMoveCard`, and shared by both the pointer-drop and keyboard-dialog paths. Echo de-dup prevents the user's own PATCH echoing back as a remote event. Outcome: AC-HAPPY-5 and AC-ERROR-4 verified; the keyboard move path also satisfies WCAG 2.1 SC 2.1.1 via the same `handleMoveCard` code path.

3. **Full-entity board-scoped events** (Architecture Decision 2) — Broadcasting the full updated entity (vs. deltas or full board snapshots) is the correct choice at this scale. It satisfies AC-REALTIME-1's stub-detection requirement ("only the moved card's column changes, other cards unaffected") — a full board snapshot would fail this. Delta events would add client-side merge complexity with no benefit at ≤20 users. Outcome: event schema held through Phases 5 and 6 without revision.

4. **Mixed form patterns per surface** (UI/UX Decision 1C) — Modal for create-board and edit-card; inline for edit-board and create-card. This is the correct cognitive-weight-per-surface decision: frequent add-card operations stay low-friction (inline column footer), while edit-card with title+description benefits from a focus trap (modal). The single `Dialog` primitive was reused for both modal surfaces. Outcome: all four form surfaces implemented correctly in Phases 2–3, no pattern reversals.

5. **X-Client-Id plumbed in Phase 1, consumed in Phase 5** — The Architecture creative explicitly called for the per-tab echo-de-dup origin token to be added to Phase-1 write wrappers, even though it is only consumed in Phase 5. This eliminated a Phase-1 rework risk. Outcome: zero rework required in Phase 5 for this concern.

**Trade-offs:**

- **SSE unidirectional channel vs WebSocket bidirectionality**: Accepted. All client→server actions flow over REST mutations; the SSE channel only needs to push. The trade-off is correct for this use case.
- **SSE `res.finish` access-log deferred to connection close**: Accepted. Explicit connection-open/close lifecycle logs via `req.log` cover the gap. The standard `requestLogger` access-log line still fires at close.
- **Inline add-card has no description field**: Accepted (UI/UX Spec 4). Keeps the add-card flow lightweight (Trello/Linear pattern). Description is added/edited via the edit-card modal.
- **Board CREATE does not broadcast**: Accepted. No board-scoped channel exists for a brand-new board at creation time — no subscribers. This is correct behavior, not a gap.
- **Fixed 700ms SSE settle in `realtime.spec.ts`**: Known non-blocking carry-forward. A server `ready` signal or subscriber-count poll would be more deterministic. The fixed delay is acceptable for a local `--repeat-each=3`-stable suite but fragile under high load.

### What Went Well

1. **Architecture creative held as an exact implementation contract for all six build phases.** Every Phase 5 implementation decision — broadcaster interface, SSE route structure, `notify.ts` fire-and-forget pattern, echo de-dup mechanism, env vars, observability lifecycle logs — was specified precisely in the Architecture creative. No Phase-5 design derivation was needed. The Phase-1 `X-Client-Id` pre-plumbing is a concrete example of a creative decision preventing rework in a later phase.

2. **Zero mid-phase design reversals across the entire 6-phase lifecycle.** Phases 1–4 built on a stable frontend foundation. Phase 5's SSE tier integrated with the existing mutation hooks exactly as the Architecture creative prescribed (at the existing `req.log.info` business-event sites). Phase 6's real-DB Playwright project design was an architectural insight during implementation, but it was an addition, not a reversal — it extended Phase 5's work rather than contradicting it.

3. **The two-Playwright-project Phase 6 design correctly solved the two-tab E2E problem.** The key insight — that a mocked API can never broadcast an SSE event from one browser context to another — drove the real-DB `realtime` Playwright project. The `scripts/e2e-db-setup.mjs` idempotent harness (idempotent `CREATE DATABASE` with an allowlist regex DDL guard, `node-pg-migrate up`, then `TRUNCATE`) is a clean, reusable pattern for any future real-DB E2E test layer. This was the previously-carried "seeded-DB E2E variant" follow-up from TASK-006, now delivered as a side effect of the realtime requirement.

4. **GP5 no-leak was structurally enforced and independently verified in every phase.** The `sendJson` function never reads the response body on error. Write error copy is keyed on safe category enums only. The SSE route returns a generic 404 on `REALTIME_ENABLED=false`. The rollback banner copy is a static string. Independent reviewers confirmed GP5 in all six phase reviews.

5. **WCAG 2.1 SC 2.1.1 keyboard alternative was fully delivered via `MoveCardDialog`.** The keyboard-move path runs through the same `handleMoveCard` function as the pointer-drop path, shares the same optimistic-update and rollback logic, and is tested separately. The `@dnd-kit` `KeyboardSensor` on the drag handle provides the drag-keyboard path; `MoveCardDialog` provides the explicit "Move to column" dialog path. Both are tested and both were independently verified by the code reviewer.

6. **Test count substantially exceeded the plan in the quality direction.** 84 net-new frontend Vitest + 12 backend + 9 Playwright = 105 net-new tests vs. the 44–54 plan. The overcount is healthy: more behavioral coverage, not more structural tests. No test is trivial — each covers a specific AC, GP5 no-leak path, rollback scenario, echo de-dup behavior, or stub-detection assertion.

### Challenges Encountered

1. **Two-tab real-time E2E design required an architectural insight not in the original Phase 6 spec** — The original Phase 6 plan called for "extending the Playwright suite with the full interactive journeys incl. two-tab real-time." It did not specify how. The insight that a mocked API is structurally incapable of broadcasting an SSE event from one browser context to another required a non-trivial Phase 6 design decision: a second Playwright project (`realtime`) with a real backend, real persistence, and a real SSE channel. This added the `scripts/e2e-db-setup.mjs` harness and a second `webServer` config. Resolution: the correct design was found and implemented within Phase 6. The `--repeat-each=3` stability verification confirmed reliability.

2. **Phase 6 carries three non-blocking review items that remain open** — (1) The fixed 700ms SSE settle in `realtime.spec.ts` should become a server `ready`/`connected` signal or a subscriber-count poll for determinism; (2) the realtime `webServer` `&&` DB-setup chain could move to a Playwright `globalSetup` for cleaner separation; (3) the `banyanboard_e2e` database accumulates boards across reused-server local runs (harmless for id-scoped lookups, but periodic cleanup would be good hygiene). All three are cosmetic/operational, not correctness issues.

3. **Playwright `chromium` project required a stateful write-aware mock** — The hermetic single-tab journeys in `interactive-journeys.spec.ts` use a `page.route` mock for the API. But tests like AC-HAPPY-5 (drag card then reload confirms status persisted) require the mock to interpret POST/PATCH requests and maintain state across route calls within a test. This required `seedWritableApi` — a per-test, deep-cloned in-memory store. The design was sound and the implementation reused the established `fixtures.ts` pattern, but it was more elaborate than a simple static mock.

### Technical Debt and Future Work

- **Seeded-DB E2E scope expansion**: The `banyanboard_e2e` database accumulates rows across reused-server local dev runs. Periodic `TRUNCATE` or `DROP/CREATE` in a test-session lifecycle hook would keep local runs deterministic. Harmless for now (id-scoped lookups prevent cross-test contamination) but worth a cleanup mechanism.

- **SSE settlement timing in `realtime.spec.ts`**: The 700ms await before Tab A mutates (to ensure Tab B's subscriber is registered) is a fixed delay rather than a signal-based readiness check. A server-emitted `connected` event or a subscriber-count HTTP endpoint would make this deterministic. Low urgency given `--repeat-each=3` stability on localhost.

- **`ErrorMessage.backLink` prop** (carried from TASK-006): The prop exists in `ErrorMessage` but no page currently uses it (the page-level link is always used instead). Prune in a future Level 1 cleanup.

- **OpenAPI spec** (carried from FEAT-004/005 → TASK-006 → TASK-007): Now covers 10+ REST endpoints plus the SSE events route. Still deferred. Increasingly worthwhile to document before the API surface grows further.

- **Multi-stage Dockerfile** (carried from TASK-006): The `SERVE_CLIENT=true` production path is proven and exercised by both Playwright projects. A multi-stage Dockerfile (`npm run build` in `client/`, then `node dist/index.js` with `SERVE_CLIENT=true`) would complete the dev/prod containerization story.

- **`node-pg-migrate` dev-tree audit findings** (19 moderate/2 high — carried from TASK-004 through TASK-007): Still unresolved after four task cycles. Should be triaged before any production deployment.

---

## Dimension 2: Claude Code Ecosystem Effectiveness

### Build Session Analysis

By-task session logs at `.agent-logs/claude/by-task/TASK-007/` do not exist — confirmed in the task brief. **This is the seventh consecutive task (TASK-001 through TASK-007) without by-task session log indexing.** Quantitative tool-call counts, duration metrics, and sub-agent invocation counts are unavailable. The analysis below is derived from the per-phase Completed Steps in `memory-bank/tasks/TASK-007.md` and the phase summaries in `memory-bank/progress.md`.

**Session logs not task-indexed. Run /banyan-init to upgrade.**

**Build Sessions**: 6 (one per implementation phase — each produced a committed, green build with independent code review)
**Creative Sessions**: 2 (Architecture + UI/UX)
**Sub-Agents Spawned (estimated from Execution State)**: ~2 creative agents + 6 coding agents + 6 code reviewer agents + 1 spec writer = ~15 sub-agents across the lifecycle (plus the reflection agent = ~16 total)
**Tool Calls**: Not quantifiable (no session logs)
**Build Failures**: 0 across all 6 phases
**Errors Recovered**: The `@dnd-kit` dependency installation was handled as a pre-Step-3 dependency step in Phase 4 (not a recovery, a planned prerequisite). No error recovery events recorded.

#### Tool Utilization (Qualitative)

| Tool | Usage Pattern | Notes |
|------|---------------|-------|
| Read | Very High | Every phase loaded: task file, both creative docs, prior-phase source files, systemPatterns, techContext, progress.md |
| Write | High | New files: `src/realtime/` 4 files, `client/src/components/` 5 new (Dialog, BoardForm, CardForm, MoveCardDialog, KanbanBoard changes), `client/src/realtime/`, `scripts/e2e-db-setup.mjs`, E2E spec files |
| Edit | High | Existing files modified: `apiClient.ts`, `errorCopy.ts`, `types.ts`, `env.ts`, `routes/cards.ts`, `routes/boards.ts`, `routes/index.ts`, `BoardViewPage.tsx`, `BoardListPage.tsx`, `KanbanBoard.tsx`, `Column.tsx`, `CardItem.tsx`, `playwright.config.ts`, `fixtures.ts`, `progress.md`, `tasks.md`, `techContext.md` |
| Bash | Moderate | `npm test`, `tsc -b`, `vite build`, `npm run e2e`, `npm install` (for `@dnd-kit`), `node-pg-migrate` |
| Grep | Low-Moderate | Pattern lookups: RETURNING_COLUMNS, existing mutation log sites in cards.ts/boards.ts, createApp composition order, existing apiClient patterns |
| Glob | Low | Directory exploration at phase start |
| Agent/Task | Moderate | Creative agents (both), coding agents (per phase), code reviewer agents (per phase) |

#### Sub-Agent Performance

| Agent Type | Invocations | Model | Effectiveness |
|------------|-------------|-------|---------------|
| Spec Writer | 1 (planning) | Sonnet | High — 12 ACs across 6 surfaces, LOW-confidence fields correctly isolated (transport, DnD interaction, form pattern), both creative phases correctly flagged as REQUIRED blockers |
| Creative Architecture | 1 | Sonnet | Excellent — 5 decisions with full option analysis, risk table, implementation guidelines, and phase-sequencing map. The SSE decision's rationale (factory seam, proxy parity, native reconnect, zero deps) was decisive and correct. Pre-plumbing `X-Client-Id` in Phase 1 was a specific, correct, actionable call that prevented Phase-5 rework. |
| Creative UI/UX | 1 | Sonnet | Excellent — AC traceability matrix, detailed specs for all 7 decision areas, exact CSS token values, `prefers-reduced-motion` handling, accessibility requirements per surface. Every spec held through Phases 2–5 with no revision. |
| Build Coding Agent | 6 (one per phase) | Sonnet | High — implemented each phase to spec with no mid-phase structural reversals. Phase 5 correctly wired the broadcast hooks at the existing `req.log` sites as specified; Phase 6 correctly identified the two-Playwright-project design requirement. |
| Build Code Reviewer | 6 (one per phase) | Sonnet | High — 0 blocking findings across all 6 phases. Notable catches: GP5 no-leak dual-asserted in Phases 1–4; echo de-dup traced end-to-end in Phase 5/6; DDL identifier guard adequacy confirmed in Phase 6; cross-context SSE propagation traced from origin-tab mutation through broadcaster to Tab B subscriber. The 3 non-blocking Phase-6 recommendations (SSE settle timing, globalSetup, DB accumulation) are useful but not blocking. |
| Build Documentation Agent | 6 (embedded per phase) | Haiku (est.) | Adequate — `techContext.md` updated at Phase 4 (for `@dnd-kit`), Phase 5 (for `src/realtime/`, `REALTIME_*` env vars, two-channel origin token note), and Phase 6 (for two Playwright projects + `scripts/e2e-db-setup.mjs` + `E2E_*` vars). `systemPatterns.md` and `productBrief.md` not recorded as modified — consistent with no new architectural or product patterns introduced beyond what the creative docs specified. |

### Command Workflow Evaluation

**Commands Used**:
- `/banyan-plan TASK-007` x 1
- `/banyan-creative TASK-007` x 2 (Architecture + UI/UX)
- `/banyan-build TASK-007` x 6 (one per phase)
- `/banyan-reflect TASK-007` x 1 (current)

**Workflow Efficiency**: Good

**Assessment**:

- The Level 3 workflow (plan → two creative phases → six build phases → reflect) was correctly sized. Two creative phases for a task introducing a new real-time transport tier, three `@dnd-kit` dependencies, and four new form surfaces was the right investment. The creative phase ROI (zero design re-derivation across all six build phases) was again demonstrated.

- Six `/banyan-build` invocations is the highest phase count in the project. The decomposition was sound: Phase 1 (API write foundation), Phase 2 (board forms), Phase 3 (card forms), Phase 4 (DnD), Phase 5 (SSE tier), Phase 6 (E2E). Each phase had a clear, testable, reviewable output. No phase required revisiting a prior phase's decisions.

- The complexity-level override (manual Level 3; auto-evaluated Level 4) appears to have been correct: the task was complex but not at the enterprise/architectural Level 4 scale. The two creative phases + six build phases is a Level 3 execution pattern, and it delivered correctly.

- `/banyan-uat` was not run between phases, consistent with TASK-006. This remains a workflow gap for the Level 3 pattern. The `realtime.spec.ts` two-tab Playwright suite partially fills the gap for the real-time surface, but the form surfaces and DnD interactions were not exercised with a real browser walk (only automated Playwright tests and unit tests). Not blocking — the Playwright E2E suite provides strong behavioral coverage — but `/banyan-uat` would add the persona-empathy dimension.

- No command gaps were encountered. The plan → creative → build → reflect sequence executed cleanly.

### Context File Effectiveness

**Files Loaded**:
- `memory-bank/tasks/TASK-007.md` — primary implementation contract (updated per-phase)
- `memory-bank/creative/TASK-007-board-interactivity-architecture.md` — loaded at Phases 1, 4, 5
- `memory-bank/creative/TASK-007-board-interactivity-uiux.md` — loaded at Phases 2, 3, 4
- `memory-bank/techContext.md` — loaded at each phase for commands and env vars
- `memory-bank/systemPatterns.md` — loaded for GP1/GP3/GP5 + composition order + createApp() seam
- `memory-bank/progress.md` — loaded for context from prior phases
- `memory-bank/agent-rules/_learned/*.md` — the 6 topic files loaded during each build phase

**Assessment**:

- **Helpful — Architecture creative as implementation contract**: The Architecture creative's component analysis table, implementation guidelines section (with exact TypeScript interface sketches for `broadcaster.ts`, `eventsRouter.ts`, and `useRealtimeBoard`), and phase-sequencing map were specific enough to function as a direct implementation spec. The Phase-5 coder could implement `broadcaster.ts` from the creative doc's description without re-deriving the interface. This pattern continues to be the most valuable aspect of the creative phase.

- **Helpful — UI/UX creative AC traceability matrix**: The AC-to-component mapping table (`AC-ENTRY-1 → BoardListPage`, `AC-HAPPY-5 → CardItem+Column+KanbanBoard`, etc.) gave the Phase-2 through Phase-4 coders exact attribution. The Spec sections (1 through 7) with wireframes, CSS token references, and implementation notes were used directly. No UI decisions were re-derived in any build phase.

- **Helpful — Learned rules from prior tasks**: Six `_learned/` rule files were available. Applicable rules confirmed (see Learned Rules Applied section):
  - `frontend.md`: `LoadState` + `AbortController` pattern (applied in Phase 5 `useRealtimeBoard` close-on-unmount); centralized `errorCopy.ts` pattern (extended to write operations in Phase 1)
  - `api-design.md`: validate-before-DB, RETURNING_COLUMNS, createApp() factory preservation (applied throughout)
  - `testing-patterns.md`: hermetic Playwright via `page.route` (applied in Phase 6 `chromium` project)
  - `error-handling.md`: type `err` as `unknown`, no message/stack leak (applied in `notify.ts` and all write paths)
  - `typescript-config.md`: `noUncheckedIndexedAccess` (applied in Phase 5 `req.params.boardId ?? ''` discipline)
  - `tooling.md`: `npm install` from within subpackage (applied for `@dnd-kit` installation in Phase 4)

- **Gap — No frontend context file in the plugin (persists from TASK-006)**: All React/TypeScript/Vite frontend tooling decisions still had to be established via the creative phase. A plugin-level `frontend-react.md` context file would have reduced the Architecture creative's scope. This gap was flagged in TASK-006's reflection and remains unaddressed.

- **Gap — No SSE/real-time context file**: The Architecture creative had to derive the SSE implementation approach, Vite proxy behavior with `text/event-stream`, `EventSource` reconnection semantics, and `createApp()` integration from first principles. A plugin-level `realtime-sse.md` context file would accelerate future real-time transport work.

- **No new gaps introduced**: TASK-007 did not surface any new context-file gaps beyond those already identified in TASK-006.

### Memory Bank Organization

**Assessment**:

- **Structure**: The six-layer organization (tasks.md registry → tasks/TASK-007.md full plan + live execution state → progress.md build history → creative/ two design docs → reflection/) handled a Level 3, 6-phase task cleanly. The creative phase separation (Architecture and UI/UX as distinct files) continued to be the right structure — Phase-4 DnD work loaded only the Architecture creative (for the `@dnd-kit` decision) and the UI/UX creative (for drag affordances), without needing the full Architecture doc for every detail.

- **Navigation**: The per-phase Build Execution State in `TASK-007.md` (Completed Steps + Resumption Notes per phase) is a reliable resumption mechanism. Every phase's resumption notes correctly pointed to the next phase's key concerns — Phase 4's notes correctly identified echo de-dup as Phase 5's critical integration concern; Phase 5's notes correctly identified two-tab E2E over a real SSE connection as Phase 6's key constraint.

- **Completeness**: The `scripts/e2e-db-setup.mjs` script (new, repo root) and the `playwright.config.ts` two-project design are documented in `techContext.md` as updated by the Phase-6 Documentation Agent. The `REALTIME_*` env vars are documented in `techContext.md` Configuration Variables. Both creative docs are complete and current. No documentation gaps.

- **Minor gap**: `memory-bank/agent-rules/_learned/` now covers 6 topics (`error-handling`, `typescript-config`, `api-design`, `frontend`, `testing-patterns`, `tooling`). A `realtime.md` topic would capture the SSE transport pattern for future tasks. This is a new extractable topic introduced by TASK-007.

### Suggested Improvements to Claude Code System

**Note**: These are suggestions only. Do NOT implement these changes — they are recommendations for future system enhancements.

#### High Priority

1. **Fix by-task session log symlinking (seventh consecutive task without this data)** — The by-task session log directory remains unpopulated for all seven tasks in this project. The Build Session Analysis section of every reflection has been produced without quantitative metrics. This is now a confirmed systemic defect that materially limits reflection quality, audit capability, and debugging of agent behavior. The fix should populate `.agent-logs/claude/by-task/TASK-XXX/` for all workflow command sessions (orchestrator + sub-agents), not only sub-agent sessions. Treating this as a P0 infrastructure defect (as TASK-006 recommended) is still appropriate.

2. **Add `frontend-react.md` context file to the plugin** — Flagged in TASK-006; still absent in TASK-007. Two consecutive Level 3 frontend tasks have had to re-derive React/Vite/TypeScript tooling decisions in the creative phase. A context file covering: Vite tsconfig 3-file layout, CSS Modules conventions, Vitest vs backend Jest separation, `page.route` hermetic E2E vs seeded-DB variants, `AbortController` + `signal.aborted` pattern, React Router focus management, and the `npm install` from-within-subpackage rule would eliminate significant creative-phase rederivation. For TASK-008 or any future frontend task, this file should be a prerequisite.

#### Medium Priority

3. **Add `realtime-sse.md` context file to the plugin** — TASK-007 derived the SSE implementation approach, Vite proxy behavior with `text/event-stream`, `EventSource` reconnection, `createApp()` integration, echo de-dup mechanism, and fire-and-forget broadcast pattern from first principles in the Architecture creative. A context file documenting this decision (SSE over WebSocket for single-host Express, `GET /api/v1/.../events` route inside `createApp()`, `EventSource` auto-reconnect, `X-Client-Id` echo de-dup pattern) would accelerate any future real-time enhancement (e.g., board-list-level events, presence indicators, notifications).

4. **Add a `/banyan-uat` pre-flight check for Claude-in-Chrome MCP availability** — Flagged in TASK-006; still not addressed. Two consecutive Level 3 tasks have skipped the `/banyan-uat` step silently. A pre-flight reachability check with a clear failure message ("Claude-in-Chrome MCP not reachable — run with `--skip-ux-check` or configure the MCP first") would make the skip explicit and prevent the workflow gap from persisting unnoticed.

5. **Document the real-DB Playwright project pattern in the Level 3 implementation context file** — The TASK-007 Phase 6 design (two Playwright projects: hermetic `chromium` for single-tab journeys + real-DB `realtime` for cross-context transport tests) is a reusable pattern for any future task that tests server-push behavior (SSE, WebSocket, webhooks, etc.). Adding a one-paragraph decision guide to the Level 3 implementation context file would prevent future re-derivation: use the hermetic project for all single-context journeys; add a real-DB project only when cross-context state (e.g., SSE broadcast, shared session, WebSocket fan-out) must be tested.

#### Low Priority / Nice to Have

6. **Add `realtime-sse.md` to the `_learned/` rules index** — The SSE transport pattern (broadcaster interface, eventsRouter structure, notify fire-and-forget, `X-Client-Id` echo de-dup) is complex enough to warrant a reusable learned rule. The continuous learning system would benefit from a `realtime` topic file capturing the key directives. Without this, future tasks adding real-time features will re-derive the same patterns.

7. **Consider an E2E database harness context file or learned rule** — The `scripts/e2e-db-setup.mjs` idempotent harness pattern (CREATE IF MISSING with allowlist DDL guard → migrate to head → TRUNCATE for clean slate → chain before `webServer`) is reusable for any future real-DB E2E layer. Documenting this pattern as a learned rule or a context file would benefit TASK-008 and beyond.

---

## Key Learnings

### Extractable Learnings (for Continuous Learning)

These learnings will be extracted into `memory-bank/agent-rules/_learned/`. Level 3 maximum is 2–4 learnings. All four are genuinely reusable across future tasks.

1. **frontend** (`client/src/realtime/**`, `client/src/**/*.ts`): When implementing a real-time subscription hook with `EventSource`, store event handlers in a `useRef` so the stream is not reopened on every render, and close the `EventSource` on unmount to prevent dead subscriptions.

2. **realtime** (`src/realtime/**`, `client/src/realtime/**`): Mount SSE as a plain `GET /api/v1/.../events` route inside `createApp()` (not on the HTTP server) so it is supertest-injectable, rides the existing Vite `/api/v1` HTTP proxy with no `ws: true` change, and gets native `EventSource` reconnection for free — prefer SSE over WebSocket for server-push-only use cases on single-host Express.

3. **testing-patterns** (`client/e2e/**`, `**/*.spec.ts`): When E2E tests must verify cross-context server-push behavior (SSE, WebSocket), add a dedicated real-DB Playwright project with a real backend alongside the hermetic project — a mocked API cannot broadcast an event from one browser context to another; use the hermetic project for all single-context journeys.

4. **frontend** (`client/src/**/*.tsx`, `client/src/pages/**`): De-duplicate a user's own mutations from a real-time subscription by stamping each write request with a per-tab `X-Client-Id` UUID header, echoing it into the event envelope as `originId`, and dropping any event in the subscription hook whose `originId` equals the current tab's id — prevents double-apply of optimistic updates without server-side per-client state.

**Consolidation guidance**: Learnings 1 and 4 both target the `frontend.md` topic (they amend the existing `frontend.md`). Learning 2 creates the new `realtime.md` topic. Learning 3 amends the existing `testing-patterns.md`.

### Learned Rules Applied

- **frontend.md** (LoadState + AbortController + centralized errorCopy): Applied — `useRealtimeBoard` closes on unmount (analogous to AbortController cleanup); `writeErrorCopy` and `dragRevertErrorCopy` are centralized in `errorCopy.ts` keyed on safe category enums. Both rules directly applicable.
- **api-design.md** (validate-before-DB; RETURNING_COLUMNS; createApp factory): Applied — `eventsRouter` validates `boardId` before subscribing; `RETURNING_COLUMNS` in `cards.ts` ensures broadcast events carry full entities; `createApp()` seam preserved exactly as specified by the rule. All three sub-rules applicable.
- **testing-patterns.md** (hermetic Playwright via `page.route`; in-memory store for persistence ACs): Applied — Phase 6 `chromium` project uses `page.route` for the hermetic single-tab journeys; `seedWritableApi` is the stateful in-memory store behind the write-aware mock. Both sub-rules applicable.
- **error-handling.md** (type `err` as `unknown`; no message/stack leak): Applied — `notify.ts` wraps broadcast failures in a catch block logging at warn without leaking details; `sendJson` error path never reads the response body. Directly applicable.
- **typescript-config.md** (`noUncheckedIndexedAccess`): Applied — `req.params.boardId ?? ''` discipline in the SSE route, consistent with all prior route handlers. Directly applicable.
- **tooling.md** (`npm install` from within subpackage): Applied — `@dnd-kit` packages installed via `npm install` within `client/`, avoiding the self-dependency injection gotcha. Directly applicable.

### For Claude Code Workflow

1. **Pre-plumbing cross-phase dependencies in an early phase eliminates rework in later phases.** The `X-Client-Id` header plumbed in Phase 1 (consumed only in Phase 5) is a concrete example. When the Architecture creative identifies a dependency that a later phase will consume, it should explicitly note which early phase must implement it. This is an extractable process pattern: "when a later phase depends on a header, parameter, or schema field that can be designed early, add it to the first relevant phase's implementation notes."

2. **The creative-phase-as-implementation-contract pattern requires canonical values to achieve its full benefit.** Both creative docs for TASK-007 included exact TypeScript interface sketches, exact file paths, exact CSS token references, and exact component names. These were used directly as implementation specs without re-derivation. Future creative-agent prompts should explicitly require: (a) exact file paths for all new files; (b) TypeScript interface sketches for any new module boundary; (c) exact CSS token values for new visual states; (d) phase sequencing map showing which build phase implements each decision.

3. **The by-task session log gap now spans seven tasks (TASK-001 through TASK-007).** Every reflection in this project's history has been produced without quantitative tool-call or duration data. This is now a project-wide audit gap, not just a reflection quality issue. Future reflections will continue to note this until it is resolved at the infrastructure level.

---

## Carried Follow-Ups

### From TASK-007 Phase 6 (non-blocking)

1. **SSE settle timing in `realtime.spec.ts`**: Replace the fixed 700ms await (before Tab A mutates) with a server `ready`/`connected` signal or a subscriber-count poll endpoint for deterministic readiness. Current fixed delay is `--repeat-each=3`-stable on localhost but fragile under load.

2. **`realtime.spec.ts` DB-setup chaining**: Move the `e2e-db-setup.mjs &&` chain from the `webServer` command into a Playwright `globalSetup` for cleaner separation of concerns. Currently the DB setup runs as part of the `webServer` command, which works but conflates infrastructure setup with server startup.

3. **`banyanboard_e2e` accumulation**: The E2E database accumulates boards across reused-server local dev runs (harmless for id-scoped lookups, but could grow unboundedly). Add a periodic `TRUNCATE` or an `afterAll` cleanup in the `realtime` Playwright project for long-running local dev sessions.

### Carried from TASK-006 (still open)

4. **OpenAPI spec** (carried from FEAT-004/005 → TASK-006 → TASK-007): The API surface now includes 10+ REST endpoints plus `GET /api/v1/boards/:boardId/events` (SSE). Documenting the contract formally is increasingly valuable. Recommend scheduling as a Level 2 task.

5. **Multi-stage Dockerfile** (carried from TASK-006): The `SERVE_CLIENT=true` production path is proven by both Playwright projects. A multi-stage build completing the containerization story is a clean Level 2 follow-up.

6. **Prune `ErrorMessage.backLink` prop** (carried from TASK-006): The prop exists but no page uses it. A Level 1 cleanup.

7. **`node-pg-migrate` dev-tree audit triage** (19 moderate/2 high — carried from TASK-004 through TASK-007): Five task cycles without resolution. Should be triaged before any production deployment.

---

## Conclusion

TASK-007 delivered a fully interactive kanban board on top of the FEAT-006 read-only SPA — four form surfaces (create/edit board, create/edit card), drag-and-drop status change with optimistic rollback, keyboard DnD alternative (WCAG 2.1 SC 2.1.1), and a real-time SSE tier broadcasting mutations to all active board viewers. All 12 acceptance criteria are met with direct test and E2E evidence, including the two-tab real-time journeys (AC-REALTIME-1/2) verified against a real Express backend with real SSE across genuinely independent browser contexts. The 105 net-new tests (84 Vitest + 12 Jest + 9 Playwright) exceed the 44–54 plan in the quality direction.

The Architecture creative's SSE decision — mounting the transport as an ordinary `/api/v1` route inside `createApp()`, avoiding WebSocket entirely — was the single most impactful technical choice, and it proved correct: zero new backend dependencies, zero Vite proxy changes, native reconnection, and a testable Phase-5 and Phase-6 SSE tier. Both creative docs again held as direct implementation contracts through all six build phases with zero mid-phase reversals, confirming that the creative-phase-as-implementation-contract pattern is the correct investment for Level 3 tasks.

The TASK-007 SSE implementation (broadcaster/eventsRouter/notify/useRealtimeBoard + echo de-dup) and the Phase-6 real-DB Playwright project design (two-project pattern for cross-context transport testing) are immediately reusable patterns for any future real-time feature. Four extractable learnings have been identified to propagate these patterns into the continuous learning system.

**Overall Task Success**: Success

**Overall Workflow Effectiveness**: Moderately Effective (seven tasks without quantitative session log metrics; /banyan-uat skipped due to MCP availability; otherwise smooth execution with creative-to-build contract pattern working as designed and all six phases delivered with 0 blocking code-review findings)

**Recommendation**: Ready to archive. Follow-up items: (1) SSE settle timing in `realtime.spec.ts`; (2) Playwright `globalSetup` for DB setup; (3) `banyanboard_e2e` cleanup; (4) OpenAPI spec; (5) multi-stage Dockerfile; (6) prune `ErrorMessage.backLink`; (7) `node-pg-migrate` audit triage.

---

## References

- Plan + Execution State: `memory-bank/tasks/TASK-007.md`
- Architecture creative: `memory-bank/creative/TASK-007-board-interactivity-architecture.md`
- UI/UX creative: `memory-bank/creative/TASK-007-board-interactivity-uiux.md`
- Progress (per-phase summaries): `memory-bank/progress.md`
- Prior reflection (TASK-006, comparison context): `memory-bank/reflection/reflection-TASK-006.md`
