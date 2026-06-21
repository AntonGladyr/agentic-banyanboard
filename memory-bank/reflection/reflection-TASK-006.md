# Reflection: TASK-006 — React Frontend Board UI (FEAT-006)

**Date**: 2026-06-21
**Task Complexity**: Level 3
**Total Phases**: 5 (Backend status, Frontend foundation, Board list, Board view, E2E + serving)
**Branch**: feature/FEAT-006-react-frontend-board-ui
**Duration**: 2026-06-20 (creative + Phase 1–2) to 2026-06-21 (Phases 3–5 + reflect)

---

## Summary

TASK-006 introduced the project's first frontend tier: a read-only React SPA serving board list and board view pages from the existing Express API. The task spanned five implementation phases preceded by two mandatory creative phases (Architecture + UI/UX). The scope included one backend change — adding a `status` field to the Card model — so cards could be distributed across three kanban columns. All five phases were completed within two days and produced 138 backend Jest tests (up from 127, +11 Phase 5; +16 net across Phase 1 and Phase 5 combined from the Phase 1 starting point of 113 pre-task tests, note: Phase 4 backend remained 127), 34 frontend Vitest tests (9 → 17 → 34), and a 7/7 Playwright E2E suite exercising the full AC journeys against the genuine production static-serving path.

Both creative phases held up through implementation with only one deliberate deviation (tsconfig solution layout) and one intentional scope choice (hermetic E2E over seeded-DB E2E). Every phase passed an independent code-reviewer sub-agent review with 0 blocking findings. All 10 acceptance criteria were satisfied with direct test and E2E evidence.

---

## Plan vs Reality

- **Original estimate**: ~32–40 tests across 2 tiers; 5 phases (1 backend, 4 frontend); Level 3 complexity
- **Actual**: 138 backend Jest + 34 frontend Vitest + 7 Playwright E2E = **179 tests total**; 5 phases completed; Level 3 complexity confirmed
- **Deviation — test count**: Substantially exceeded estimate. The plan budgeted ~32–40 total; actual is 179 (including the inherited backend baseline). Net new tests from TASK-006 are: +11 backend (Phase 1 status field +14; wait — Phase 1 took Jest from 113 to 127, +14; Phase 5 took 127 to 138, +11; so +25 backend net), +34 frontend (Vitest 0 → 34), +7 Playwright E2E = 66 net new tests from this task. This compares favorably to the 32–40 estimate's intent (frontend component ~14–18; E2E ~6–8; backend +8–10): actual frontend 34, E2E 7, backend +25 — all exceeded estimate in the same direction. The overcount is healthy: more tests, not fewer.
- **Deviation — Phase 2 tsconfig layout**: Architecture creative specified a 2-file naming scheme; implementation used the standard Vite 3-file solution layout (`tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`). Resolves the TS6310 composite + noEmit constraint. An improvement over the spec, not drift.
- **Deviation — E2E is hermetic (no real DB)**: Architecture creative described E2E as "seeded against real Postgres." Phase 5 implemented Playwright with `page.route` API mocking instead — DB-free, deterministic, CI-friendly. Deliberate choice; a seeded-DB E2E variant is a clean documented follow-up.
- **Deviation — `client/.env.development` not created**: Blocked by the `Edit(.env.*)` permission guardrail (recurring from prior tasks). `VITE_API_PROXY_TARGET` has a code default, making the file optional.
- **Scope expansion at planning time**: Adding a `status` field to Card (Phase 1) was a deliberate, human-approved expansion to make the kanban columns real. This added a backend-only phase that was not in the original feature description.
- **Carried tech debt**: `ErrorMessage.backLink` prop is now unused (board view uses a page-level link instead, for better a11y). Left in place; prune in a future cleanup task.

---

## What Went Well

### Technical

1. **Architectural isolation held perfectly across all 5 phases.** The `client/` separate-package boundary meant the backend `tsc`/Jest never touched frontend code and vice versa. Not a single backend regression occurred across any of the 4 frontend phases. Backend 127/127 Jest was confirmed green after every frontend phase — a meaningful structural guarantee, not an incidental outcome.

2. **The discriminated-union `LoadState` fetch-state machine with `AbortController` worked cleanly on both pages.** The pattern (states: `loading | success | error`, effect keyed on `[id]`, abort on cleanup, `signal.aborted` guard before `setState`, non-`ApiError` throws mapped to `'server'`) was coined in Phase 3 (BoardListPage) and reused directly in Phase 4 (BoardViewPage with `[id]` key triggering re-fetch on board navigation). It handled all AC-LOADING-1, AC-ERROR-1, and AC-ERROR-2 requirements without a single mid-phase revision.

3. **The centralized `errorCopy.ts` / safe `ApiError.category` pattern kept GP5 structurally enforced.** Every user-facing error string was keyed on `network | notFound | server` — the safe category enum, never the raw error message or HTTP status code. This is testable (GP5 no-internal-detail-leak assertions exist in the test suite) and correct by construction. The Phase 3 pattern was extended to Phase 4 (`boardViewErrorCopy`) without modification.

4. **Creative decisions held up across all four implementation phases.** The architecture doc's component layout map was followed precisely (actual file tree matches the spec). The UI/UX doc's exact copy strings were used as test assertions verbatim. The WCAG 2.1 AA heading hierarchy (h1 → h2 → h3), column `<section aria-label>`, `role="status"` spinner, and `role="alert"` errors were all implemented and verified. No design decisions required reversal.

5. **Parallel fetch on the board view page was correct on first implementation.** `Promise.all([getBoard(id), getCards(id)])` with a single `AbortController` was specified in the UI/UX creative doc and implemented correctly in Phase 4 — no waterfall, no extra latency. The code reviewer confirmed this on independent review.

6. **AC-NAV-1 (direct-URL SPA load) is verified against the genuine production path.** The Phase 5 Playwright `webServer` runs `node dist/index.js` with `SERVE_CLIENT=true` — the real Express static serving and history fallback. `AC-NAV-1` is not mocked; the E2E suite reloads `/boards/1` through the actual fallback handler. This is meaningful coverage, not a test-environment shortcut.

7. **XSS safety, a11y, and security posture were clean on first pass.** React's rendering model (no `dangerouslySetInnerHTML`) covers XSS. WCAG 2.1 AA verified by reviewer. No internal error detail reaches the user (GP5). No `console.*` in production code outside the dedicated `errorReporter.ts` module (documented exception for the browser sink).

### Process

1. **Both creative phases delivered immediately actionable design docs.** The Architecture creative mapped every sub-decision to a phase (Q1→Phase 2, Q2→Phase 1, Q3→Phase 5), eliminating ambiguity at each phase start. The UI/UX creative provided exact copy strings, contrast ratios, CSS token values, and component file paths — usable directly as test assertions and implementation spec.

2. **The 5-phase decomposition had zero backtracking.** Each phase built on a stable API from the prior phase. Phase 3 reused Phase 2 foundation (apiClient, types, Vitest). Phase 4 reused Phase 3 shared state components (Spinner, EmptyState, ErrorMessage). Phase 5 used Phase 4's complete UI and Phase 2's Vite build. No phase required revisiting a prior phase's decisions.

3. **Independent code reviewer (build-code-reviewer-agent) consistently added value.** Five reviews, 0 blocking findings, and several applied nits that improved test selectors, fixture ergonomics, and code comments. The reviewer caught the `backLink` unused-prop observation, the API-shadow risk in the fallback middleware, and the parallel-fetch/abort/state-machine correctness across the board.

---

## Challenges Encountered

### `npm install --prefix client` self-dependency injection (recurred twice)

- **Description**: Running `npm install --prefix client` from the repo root injected a spurious `agentic-banyanboard: file:..` self-dependency into `client/package.json` and symlinked the repo root into `client/node_modules`. This corrupted the client dependency graph. It occurred in Phase 2 and recurred in Phase 5.
- **Resolution**: Removed the self-dependency from `client/package.json` and the lockfile, then reinstalled from within `client/` (`cd client && npm install`). The fix is reliable; the gotcha is the trigger.
- **Prevention**: Install client dependencies by running `npm install` from within `client/`, never `npm install --prefix client` from the repo root. This is now a candidate extractable learning.

### `client/.env.development` blocked by `Edit(.env.*)` permission guardrail (recurring)

- **Description**: The `Edit(.env.*)` deny rule blocked creating `client/.env.development` to set `VITE_API_PROXY_TARGET`. This is the same guardrail that blocked `.env` file creation in prior tasks (TASK-002 through TASK-005).
- **Resolution**: Added a code default for `VITE_API_PROXY_TARGET` in `vite.config.ts` so the file is optional; documented the override in `client/README.md`.
- **Prevention**: This is a deliberate project security policy. The workaround (code default + README documentation) is the correct pattern for optional env vars. The `tooling.md` learned rule covers `.env*` creation via `tee`; that workaround applies to the root `.env`, but Vite env files need the same pattern or the code-default approach used here.

### Hermetic E2E vs. architecture-doc intent

- **Description**: The Architecture creative specified Phase 5 E2E should be "seeded against real Postgres." The implementation chose hermetic `page.route` API mocking instead, making the suite DB-free.
- **Resolution**: Deliberate, conscious deviation. The hermetic approach is CI-friendly (no Docker dependency, deterministic, fast), and the architecture doc's `SERVE_CLIENT=true` production-serving path is still exercised (only the API calls are mocked, not Express). The trade-off is that true DB round-trips are not covered by the E2E suite.
- **Prevention**: Not a defect — a documented follow-up. A seeded-DB E2E variant (using `docker compose up` in CI, real migrations, seed data) remains a clean next step for teams wanting true end-to-end DB coverage.

### tsconfig 3-file vs. 2-file naming (minor, resolved as improvement)

- **Description**: The Architecture creative described a 2-file tsconfig layout; Vite's current scaffold generates a 3-file solution layout. The 3-file layout resolves TS6310 (composite projects may not disable emit) more cleanly.
- **Resolution**: Applied the 3-file layout. Code reviewer confirmed it as an improvement, not drift.
- **Prevention**: The Architecture creative doc noted the tsconfig as a recommendation to confirm in implementation. This flexibility was appropriate given the Vite toolchain's evolution.

---

## Creative Decision Assessment

### Architecture Creative (TASK-006-react-frontend-architecture.md)

**Overall**: Held up through all 5 phases with no reversals.

| Decision | Outcome | Verdict |
|----------|---------|---------|
| Vite + `client/` separate package | Perfect build/test isolation; no backend regression across any phase | Excellent |
| Single-origin Express static + SPA fallback | AC-NAV-1 satisfied by genuine production path in E2E; no CORS needed | Excellent |
| `varchar(20)` app-validated status | Consistent with existing validate-before-DB pattern; no DB migration friction | Excellent |
| Vitest + RTL for component tests | Zero test runner collision; Jest-compatible API reduced learning curve | Excellent |
| Playwright for E2E (hermetic variant) | 7/7 green; CI-friendly; production serving path genuinely exercised | Good (hermetic was the right call for MVP CI; seeded-DB is a clean follow-up) |
| Console-only errorReporter (no telemetry) | GP5 + no-telemetry constraint satisfied; structurally enforced in tests | Excellent |
| Docker Compose stays postgres-only | Kept diff focused; prod single-image path documented for follow-up | Excellent |
| tsconfig 2-file spec → 3-file actual | 3-file resolves TS6310 more cleanly; improvement over spec | Minor improvement |

### UI/UX Creative (TASK-006-react-frontend-uiux.md)

**Overall**: Every visual decision was directly implementable and held through Phases 3–5.

| Decision | Outcome | Verdict |
|----------|---------|---------|
| CSS Modules + CSS Custom Properties | Zero extra build config; components authored identically to spec | Excellent |
| Neutral slate palette + #3B6EF5 accent | WCAG AA ratios confirmed by reviewer; no contrast rework needed | Excellent |
| Vertical board list | Naturally accessible; linear tab order; responsive by default | Excellent |
| Horizontal 3-column kanban with overflow-x scroll | All three columns always rendered; AC-HAPPY-3 satisfied structurally | Excellent |
| No status badge on cards | Column placement communicates status; no redundant UI element | Excellent |
| 200ms-delayed spinner (CSS-only) | `prefers-reduced-motion` honored; tests assert `role="status"` immediately | Excellent |
| Text-only empty states with exact copy | Copy strings used verbatim as test assertions; consistent across phases | Excellent |
| Exact error copy keyed on `ApiError.category` | GP5-safe; testable; no internal detail leaked; map covered all three categories | Excellent |
| `← Back to boards` page-level link always above h1 | Accessible in loading + error states; `backLink` prop on ErrorMessage correctly unused | Excellent |
| `ErrorMessage.backLink` prop pattern | Prop exists but is unused on both pages (page-level link is superior). Minor dead code; clean follow-up to prune | Minor technical debt |

---

## Lessons Learned

### Technical

1. **The `client/` separate-package pattern structurally resolves ESM/CJS coexistence for React + Node in the same repo.** Backend tsconfig/Jest are untouched; no `exclude` fences or config patches needed. This approach should be the default starting point for any future frontend tier addition in a CJS Node project.

2. **A discriminated-union `LoadState` with `AbortController` and `signal.aborted` guard is the correct fetch-state machine for React pages that need clean unmount behavior.** The pattern (`loading | success | error` state, effect keyed on dependencies, abort cleanup, guard before setState) handles all loading/error/empty states without flicker, stale-state, or unmount-after-cleanup errors. It was coined once and reused directly.

3. **Centralizing user-facing error copy in a single `errorCopy.ts` file keyed on safe `ApiError.category` values makes GP5 (no internal detail leak) structurally enforced rather than convention-based.** The category enum (`network | notFound | server`) is the safe API surface; raw error messages and HTTP status codes never reach component props. This pattern is testable with a no-leak assertion.

4. **Running `npm install --prefix <subpackage>` from the repo root injects a self-referencing dependency into the subpackage's `package.json`.** Always install subpackage dependencies from within the subpackage directory. This is a non-obvious npm workspace gotcha that cost two rounds of cleanup across two separate phases.

### Process

1. **Two required creative phases before a 5-phase implementation were worth the investment.** The Architecture creative eliminated all tooling ambiguity before Phase 1 started. The UI/UX creative eliminated all visual ambiguity before Phase 3 started. Zero design re-derivation was needed in any build phase. The creative docs functioned as a direct implementation contract, not just guidance.

2. **Hermetic Playwright E2E (API mocked via `page.route`) is the right first E2E layer for a read-only frontend.** It is CI-friendly, deterministic, and still exercises the production serving path. A seeded-DB E2E variant should be a distinct follow-up task, not a requirement for the first E2E layer.

3. **Phase decomposition for a first frontend tier benefit from keeping infrastructure phases short (Phase 2) so reviewable visual work starts quickly (Phase 3).** The Phase 2 scaffolding produced 9 tests and a routing skeleton — minimal visible output, but it unblocked Phases 3–5 with a stable foundation. This sequencing was correct.

---

## Recommendations

1. **Extract the `LoadState` fetch-state machine with `AbortController` into a reusable `useFetch` custom hook** when a third page is added. It is currently duplicated across `BoardListPage` and `BoardViewPage` with only the fetch function differing.

2. **Prune `ErrorMessage.backLink` prop** in a future Level 1 cleanup task. The prop exists but is unused on both pages that use `ErrorMessage` — the page-level `← Back to boards` link is always preferred for a11y. The prop adds API surface with no current consumer.

3. **Schedule the seeded-DB E2E variant** as a follow-up Level 2 task. The current Playwright suite mocks the API; a future variant using `docker compose up` + real migrations + seed fixtures would provide true end-to-end DB coverage and validate the migration path in CI.

4. **Add a multi-stage Dockerfile** as a follow-up Level 2 task (flagged in Architecture creative as a clean additive next step). The `SERVE_CLIENT=true` production path is proven; a multi-stage build (`npm run build` in `client/`, then `node dist/index.js` with `SERVE_CLIENT=true`) is a minimal addition.

5. **Triage the `node-pg-migrate` dev-dependency audit findings** (19 moderate, 2 high — carried from TASK-004/TASK-005). Still unresolved after three task cycles. Belongs on the roadmap before any production deployment.

---

## Dimension 2: Claude Code Ecosystem Effectiveness

### Build Session Analysis

By-task session logs at `.agent-logs/claude/by-task/TASK-006/` are not populated. This is the **sixth consecutive task** (TASK-001 through TASK-006) without by-task session log indexing. Quantitative tool-call counts and durations are unavailable. Evaluation below is qualitative, derived from the detailed Execution State in TASK-006.md and the per-phase summaries in progress.md.

**Session logs not task-indexed. Run /banyan-init to upgrade.**

**Build Sessions**: 5 (one per phase — each produced a committed, green build)
**Sub-Agents Spawned**: Qualitative count from Execution State — 2 creative sub-agents (Architecture, UI/UX), 5 coding agents (one per phase), 5 code reviewer sub-agents (one per phase) = ~12+ sub-agents across the lifecycle (plus the Spec Writer during planning)
**Tool Calls**: Not quantifiable (no logs)
**Errors Recovered**: 0 build failures; 2 rounds of self-dependency cleanup (npm install gotcha)

#### Tool Utilization (Qualitative)

| Tool | Usage Pattern | Notes |
|------|---------------|-------|
| Read | Very High | Every phase loaded: task file, creative docs, prior-phase source files, systemPatterns, techContext, learned rules |
| Write | High | New files across all 5 phases: migration, validations, data-access, client package scaffold, page components, CSS modules, E2E fixtures, Playwright config |
| Edit | Moderate | Existing file modifications: env.ts, app.ts, routes/index.ts, App.test.tsx (twice — Phase 3 and Phase 4 reminder), progress.md, tasks.md |
| Bash | Moderate | npm test, tsc, vite build, npm run e2e (Phase 5), migration up/down (Phase 1) |
| Grep | Low-Moderate | Pattern lookups: RETURNING_COLUMNS, createApp composition order, existing validator patterns |
| Glob | Low | Directory exploration at phase start |
| Agent/Task | Moderate | Creative agents (Phases 0 creative), coding agents, code reviewer agents per phase |

#### Sub-Agent Performance

| Agent Type | Invocations | Model | Effectiveness |
|------------|-------------|-------|---------------|
| Spec Writer | 1 (planning) | Sonnet | High — drafted the spec with 10 ACs, surfaced the status-field gap, and correctly flagged 4 creative questions as LOW/MEDIUM confidence |
| Creative Architecture | 1 | Sonnet | Excellent — produced a 750-line decision doc covering 7 sub-questions with full option analysis; held up through 5 phases |
| Creative UI/UX | 1 | Sonnet | Excellent — produced exact copy strings, verified contrast ratios, component inventory with file paths; used verbatim as test selectors |
| Build Coding Agent | 5 (one per phase) | Sonnet | High — implemented each phase to spec with no mid-phase structural reversals |
| Build Code Reviewer | 5 (one per phase) | Sonnet | High — 0 blocking findings across 5 reviews; applied nits that measurably improved fixture ergonomics, test selectors, and code comments |
| Build Test Writer | 5 (orchestrator-authored) | N/A | High — TDD discipline held: tests written before implementation in every phase |

### Command Workflow Evaluation

**Commands Used**:
- `/banyan-plan TASK-006` × 1
- `/banyan-creative TASK-006` × 2 (Architecture + UI/UX)
- `/banyan-build TASK-006` × 5 (one per phase)
- `/banyan-reflect TASK-006` × 1 (current)

**Workflow Efficiency**: Good

**Assessment**:
- The Level 3 workflow (plan → two creative phases → five build phases → reflect) was correctly sized for a task introducing the project's first frontend tier. The two creative phases eliminated all tooling and visual ambiguity before a single line of implementation code was written — this is the correct use of the creative workflow.
- Five `/banyan-build` invocations is the highest phase count in this project's history. The decomposition was sound: each phase had a clear output artifact (migration, scaffold, board list, board view, E2E + serving) and could be human-reviewed independently.
- The `/banyan-uat` step was not run between phases as specified by the Level 3 workflow ("Run between phase builds"). The architecture doc notes UAT requires Claude-in-Chrome MCP; no UAT findings were recorded. This is a workflow gap — not a blocking issue for this read-only MVP feature (the Playwright E2E serves as the acceptance layer), but it represents a workflow step skipped.
- No command gaps were encountered. The two-creative + five-build + reflect sequence executed cleanly.

### Context File Effectiveness

**Files Loaded**:
- `memory-bank/tasks/TASK-006.md` — primary implementation contract
- `memory-bank/creative/TASK-006-react-frontend-architecture.md` — loaded at Phase 1 and Phase 2 starts
- `memory-bank/creative/TASK-006-react-frontend-uiux.md` — loaded at Phase 3 and Phase 4 starts
- `memory-bank/techContext.md` — loaded at each phase for commands and env vars
- `memory-bank/systemPatterns.md` — loaded for GP1/GP4/GP5 + composition order verification
- `memory-bank/productBrief.md` — loaded during planning + creative phases for persona/NFR alignment
- `memory-bank/agent-rules/_learned/*.md` — all five files loaded during each build phase

**Assessment**:

- **Helpful — Creative docs as implementation contracts**: Both creative docs were structured with enough specificity (exact file paths, exact copy strings, verified contrast ratios, exact CSS tokens) to function as implementation contracts, not just guidance documents. The UI/UX creative's "Exact copy strings (canonical)" table was used verbatim as test assertions in Phases 3, 4, and 5 — this is precisely the correct use of a creative phase output.
- **Helpful — tasks/TASK-006.md Execution State**: The per-phase Build Completed Steps sections and "Notes / Deviations (for reflection)" sub-sections provided a precise, self-updating audit trail. Phase 4's reminder about App.test.tsx selectors was correctly carried to Phase 4 and resolved there.
- **Helpful — Learned rules**: All five `_learned/` rule files were applicable or semi-applicable: `api-design.md` (validate-before-DB, RETURNING_COLUMNS) directly applied to Phase 1; `testing-patterns.md` (in-memory store, importOriginal) applied to Phases 3/4/5; `error-handling.md` applied to Phase 3/4 apiClient mapping; `typescript-config.md` informed the noUncheckedIndexedAccess discipline in the frontend tsconfig.
- **Gap — No frontend context file exists in the plugin**: There is no `${CLAUDE_PLUGIN_ROOT}/context/frontend-react.md` or equivalent. All frontend tooling decisions (Vite tsconfig 3-file layout, CSS Modules conventions, Vitest vs Jest choice, Playwright vs UAT role split, AbortController pattern, React Router focus management) had to be derived from scratch in the creative phase. A reusable frontend context file would reduce creative-phase scope for future frontend features.
- **Gap — `npm install --prefix` self-dependency gotcha not documented**: The npm workspace self-dependency injection gotcha (running `npm install --prefix <subdir>` from the repo root corrupts the subpackage's `package.json`) is not captured in any context file or learned rule. It recurred twice in this task.
- **Gap — The `tooling.md` learned rule (`tee` redirect for `.env*`) does not cover Vite env files**: The rule covers root `.env` creation but not `client/.env.development`. The code-default workaround used in Phase 2 is correct but required re-derivation.

### Memory Bank Organization

**Assessment**:

- **Structure**: The five-layer organization (tasks.md registry → tasks/TASK-006.md full plan + live state → progress.md history → creative/TASK-006-*.md design decisions → reflection/reflection-TASK-006.md) handled a Level 3, 5-phase task cleanly. No documents were ambiguously located or hard to find.
- **Navigation**: The tasks/TASK-006.md file with its per-phase Execution State sections and "Notes / Deviations (for reflection)" sub-sections was a particularly effective navigation aid. The orchestrator could reliably resume any phase from the recorded state.
- **Completeness**: The creative doc pattern (two separate files for Architecture + UI/UX) is the right structure for a Level 3 task with distinct architectural and visual concerns. The separation allowed Phase 1 to load only the Architecture doc and Phase 3 to load only the UI/UX doc — appropriate progressive loading.
- **Minor gap**: There is no `memory-bank/agent-rules/_learned/frontend.md` or `react.md` topic file. The five existing learned rules all cover backend concerns (error handling, api design, testing with Jest/supertest, TypeScript config, tooling constraints). This task introduces the first frontend patterns worth capturing but has no existing topic to amend — requires a new topic file.

### Ecosystem Improvement Suggestions

> Note: These are documentation-only suggestions. Do NOT implement during reflection.

#### High Priority

1. **Enable by-task session log symlinking for all command sessions (6th consecutive task without this data)** — Six reflections have now been produced without quantitative tool-call or duration metrics. The Build Session Analysis section is structurally incomplete for every task in this project. The fix requires populating `.agent-logs/claude/by-task/TASK-XXX/` even for orchestrator-direct sessions, not just sub-agent sessions. This is now a confirmed systemic gap that materially limits the quality and auditability of every reflection produced. It should be treated as a P0 infrastructure defect, not a recurring note.

2. **Add a `frontend-react.md` context file to the plugin** — This task introduced a complete frontend tooling stack (Vite, React, TypeScript, CSS Modules, Vitest, Playwright) that any future frontend feature will need to know about. A context file covering: Vite tsconfig 3-file layout (and the TS6310 issue), CSS Modules conventions, Vitest vs backend Jest separation, Playwright hermetic E2E vs seeded-DB variants, AbortController + `signal.aborted` pattern, React Router client-side focus management, and the `npm install` from-within-subpackage rule would eliminate significant creative-phase rederivation for future frontend tasks.

#### Medium Priority

3. **Extend the `tooling.md` learned rule to cover `npm install --prefix` self-dependency injection** — The current `tooling.md` rule covers `.env*` write constraints. A new bullet should document: "Always install subpackage dependencies from within the subpackage directory (`cd <pkg> && npm install`); running `npm install --prefix <pkg>` from the repo root injects a self-referencing dependency into `<pkg>/package.json`." This recurred in two separate phases of the same task and is a non-obvious npm behavior.

4. **Add a `/banyan-uat` prerequisite check for Claude-in-Chrome MCP availability** — The Level 3 workflow specifies running `/banyan-uat` between phases. This was skipped because the Claude-in-Chrome MCP was not confirmed as available. A pre-flight reachability check before the UAT gate (with a clear failure message and suggested alternative, e.g., "Claude-in-Chrome MCP not reachable — run with `--skip-ux-check` or configure the MCP first") would prevent silent UAT skips and make the gap explicit rather than implied.

5. **Document the hermetic vs. seeded-DB E2E trade-off in the level3-implementation context file** — The choice between hermetic Playwright (`page.route` API mocking) and seeded-DB Playwright (Docker + real migrations + seed data) is a recurring architectural question for any frontend E2E suite. Adding a one-paragraph decision guide to the Level 3 implementation context file would prevent rederivation in future tasks: hermetic first (CI-friendly, fast, tests SPA rendering and production serving path), seeded-DB as a follow-up (true DB round-trip coverage, requires Docker in CI).

#### Low Priority / Nice to Have

6. **Add a frontend `agent-rules` topic to the rules index** — The `agent-rules-index.md` and the five `_learned/` files all cover backend topics. A `frontend.md` or `react.md` topic file in `_learned/` (auto-populated from this reflection's extractable learnings) would extend the continuous learning system to the new frontend tier. Without this, the compounding return from learned rules will not accrue to future frontend tasks.

7. **Consider a `Dockerfile` as a Phase 5 or Phase 6 task type for first-frontend-tier features** — The Architecture creative explicitly flagged the multi-stage Dockerfile as a clean additive follow-up. For any feature that introduces a frontend tier and defines a `SERVE_CLIENT` production path, a subsequent "containerize" phase (multi-stage build → `api` compose service) would complete the dev/prod parity story. The Level 3 workflow could optionally include this as a named phase type.

---

## Key Learnings

### Extractable Learnings (for Continuous Learning)

These learnings will be extracted into `memory-bank/agent-rules/_learned/`. All four are Level 3 maximum; all are genuinely reusable across any future frontend feature.

1. **frontend** (`client/src/**/*.tsx`, `client/src/pages/**`): Model fetch lifecycle with a discriminated-union `LoadState` (`loading | success | error`), one `AbortController` per `useEffect`, and a `signal.aborted` guard before any `setState` call — prevents stale state, unmount errors, and flash-of-wrong-state on fast network responses.
   - *New topic* — no existing `frontend.md` in `_learned/`; creates the first frontend topic file.

2. **frontend** (`client/src/api/**`): Key all user-facing error copy on a safe `ApiError.category` enum (`network | notFound | server`) in a centralized `errorCopy.ts` — never pass raw error messages or HTTP status codes to component props; assert no-internal-detail-leak in tests.
   - *Amends* the new `frontend.md` topic (consolidate with learning 1 above).

3. **tooling** (`client/package.json`, `**/package.json`): Install subpackage dependencies by running `npm install` from within the subpackage directory, not `npm install --prefix <subdir>` from the repo root — the latter injects a self-referencing `file:..` dependency into the subpackage's `package.json`.
   - *Amends* existing `tooling.md` — new bullet alongside the `.env*` tee-redirect rule.

4. **testing-patterns** (`client/e2e/**`, `**/*.spec.ts`): Use `page.route('**/api/v1/**')` to make Playwright E2E suites hermetic (no real DB/seed step) while still running the SPA and production-serving path through a real built Express server — reserve a seeded-DB E2E variant for a follow-up task when true DB round-trip coverage is needed.
   - *Amends* existing `testing-patterns.md` — new bullet for Playwright/frontend E2E.

### Learned Rules Applied

- **error-handling.md** (type `err` as `unknown`, no message/stack leak): Applied in Phase 1 (status validation extending the existing card error pattern) and in the apiClient `ApiError` safe-mapping design. Directly applicable.
- **testing-patterns.md** (in-memory store behind mocked pool; importOriginal for class preservation): Applied in Phases 3/4 — frontend RTL tests used `importOriginal` to preserve the real `ApiError` class so `instanceof`/category checks are exercised genuinely, not structurally. The in-memory store pattern informed the E2E fixture design.
- **api-design.md** (validate-before-DB; RETURNING_COLUMNS single-source; createApp factory): Applied in Phase 1 — `status` added to `RETURNING_COLUMNS`, validated in `card.ts` before any pool call, and the supertest Phase 5 tests use `createApp()` directly. All three rules applicable and applied.
- **typescript-config.md** (`noUncheckedIndexedAccess`): Applied in the frontend tsconfig — `noUncheckedIndexedAccess: true` mirrored in `client/tsconfig.json` to maintain the same type rigor as the backend.
- **tooling.md** (`.env*` write constraint via tee redirect): Partially applicable — the root `.env` constraint was not triggered (no root `.env` changes in TASK-006), but the same permission guardrail blocked `client/.env.development`. The workaround was a code default rather than a `tee` redirect, which is the correct approach for an optional Vite env file. The rule could be broadened to cover this case.

### For Claude Code Workflow

1. **The creative-phase-as-implementation-contract pattern works best when creative docs include canonical values** (exact copy strings, exact file paths, exact CSS token values, exact component names) **rather than only structural guidance.** Both creative docs for TASK-006 followed this pattern and were used as verbatim test selectors and implementation specs. Future creative-agent prompts should explicitly require canonical values for anything that will be asserted in tests or implemented in a specific file.

2. **The by-task session log gap has now persisted for six consecutive tasks.** This is not a one-off gap — it is a confirmed systemic defect that structurally limits reflection quality across the project's entire history. Future reflections will continue to note this until it is resolved at the infrastructure level; escalating it from "recurring note" to "tracked ecosystem defect requiring a fix" is the appropriate response.

3. **For Level 3 tasks that introduce a new architectural tier (e.g., first frontend, first microservice), the creative phase should produce an Implementation Guidelines section that maps each sub-decision to the exact phase that implements it.** The Architecture creative for TASK-006 had this mapping explicitly (Phase 1 → Q2, Phase 2 → Q1a/b/c/d/e, Phase 5 → Q1c/Q3b). This eliminated ambiguity at every phase start and should be a required section in architecture creative outputs.

---

## Conclusion

TASK-006 delivered the project's first frontend tier cleanly, completely, and without mid-phase reversals. All 10 acceptance criteria are satisfied with direct test and E2E evidence. The final test count — 138 backend Jest + 34 frontend Vitest + 7 Playwright E2E = 179 total — substantially exceeds the 32–40 estimate in the same quality direction (more behavioral coverage, not more structural tests). The two creative phases invested before any implementation code was written paid for themselves many times over: zero design re-derivation was needed in any of the five build phases, and both creative docs were used as implementation contracts with verbatim test assertions.

The most significant technical patterns introduced — the `LoadState` discriminated-union fetch-state machine with `AbortController`, the centralized `errorCopy.ts` keyed on safe `ApiError.category`, and the hermetic Playwright E2E running against the production static-serving path — are immediately reusable in future frontend features without rediscovery. The `npm install --prefix` self-dependency gotcha is the one genuine friction point that recurred twice and warrants a tooling rule to prevent future repetition.

From an ecosystem perspective, the Level 3 workflow was appropriately sized and executed correctly for a multi-tier, multi-creative task. The most significant ongoing gap — absent by-task session logs for the sixth consecutive task — continues to limit reflection auditability. The ecosystem now needs a new `frontend.md` learned-rule topic to bring the continuous learning system to the new frontend tier; without it, compounding benefits from prior tasks will not accrue to future frontend features.

**Overall Task Success**: Success

**Overall Workflow Effectiveness**: Moderately Effective (six tasks without quantitative session log metrics; /banyan-uat skipped due to MCP availability; otherwise smooth execution with creative-to-build contract pattern working as designed)

**Recommendation**: Ready to archive. Follow-up tasks: seeded-DB E2E variant, multi-stage Dockerfile, `ErrorMessage.backLink` prop pruning, OpenAPI spec (carried from TASK-004/TASK-005).

---

## References

- Plan: `memory-bank/tasks/TASK-006.md`
- Architecture creative: `memory-bank/creative/TASK-006-react-frontend-architecture.md`
- UI/UX creative: `memory-bank/creative/TASK-006-react-frontend-uiux.md`
- Progress: `memory-bank/progress.md`
- Prior reflections: `memory-bank/reflection/reflection-TASK-005.md`, `memory-bank/reflection/reflection-TASK-004.md`
