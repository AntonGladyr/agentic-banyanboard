# TASK-003: Health check endpoint with tests

**Complexity**: Level 2
**Status**: REFLECTION_COMPLETE
**Reflection**: memory-bank/reflection/reflection-TASK-003.md
**Roadmap**: FEAT-003
**Branch**: feature/FEAT-003-health-check-endpoint
**Worktree**: N/A (local-only project — feature branch in main working tree)

## Task Description

Add a `/health` endpoint to the Express API that reports service liveness and verifies PostgreSQL connectivity (DB readiness). Returns structured JSON status with appropriate HTTP codes (200 healthy / 503 unhealthy) and includes unit and integration tests. Depends on FEAT-002 (PostgreSQL connection module).

## Specification

**Feature Type**: NFR/Infrastructure
**Creative Exploration Needed**: No

### Verification Method

- **Test method**: `npm test` (Jest 29 + ts-jest + supertest) — runs all `**/*.test.ts` files under `src/`; the health-slice integration test in `src/routes/health.test.ts` and unit tests in a new `src/routes/health.unit.test.ts` are the primary verification targets. Individual run: `npx jest --testPathPattern health`.

- **Success metrics**:
  - `GET /health` with DATABASE_URL set and DB reachable → HTTP 200, `Content-Type: application/json`, body exactly `{ "status": "ok", "db": "ok", "timestamp": "<ISO8601>" }`
  - `GET /health` with DATABASE_URL set but DB unreachable → HTTP 503, `Content-Type: application/json`, body exactly `{ "status": "error", "db": "error", "timestamp": "<ISO8601>" }`
  - `GET /health` with DATABASE_URL unset → HTTP 200, body `{ "status": "ok", "db": "unconfigured", "timestamp": "<ISO8601>" }` (liveness passes; readiness is not applicable)
  - All three variants return `traceId` propagated from the incoming `traceparent` header (W3C Trace Context, per Guiding Principle 2)
  - Response time < 150 ms under normal conditions (productBrief NFR — p95 API reads)
- **Observable at**: `npm test` output (pass/fail per test case); manual curl against `http://localhost:3000/health` when running `npm run dev`
- **Verification frequency**: on every build (CI gate) and on-deploy manual smoke test
- **Confidence**: HIGH — existing `src/routes/health.ts` provides the liveness stub; `src/db/pool.ts` exports `checkConnection()` which is the exact DB readiness primitive needed; `src/routes/health.test.ts` already covers the liveness AC and the trace-propagation pattern; the integration-test supertest pattern is established in `src/routes/health.test.ts` and `src/routes/api.test.ts`

### Acceptance Criteria

#### AC-LIVENESS-1: Healthy response when DB is reachable

**Priority**: MUST

**Given** the Express app is running with `DATABASE_URL` set to a valid PostgreSQL DSN and the database is accepting connections
**When** `GET /health` is called (with or without a `traceparent` header)
**Then**:

- HTTP status is `200`
- `Content-Type` is `application/json`
- Response body is `{ "status": "ok", "db": "ok", "timestamp": "<valid ISO8601 string>" }`
- The `timestamp` value round-trips through `new Date(timestamp).toISOString() === timestamp`
- A structured JSON access-log line is emitted to `process.stdout` with `method: "GET"`, `path: "/health"`, `statusCode: 200`, and `durationMs` (numeric)

#### AC-LIVENESS-2: Response carries W3C trace context

**Priority**: MUST

**Given** a caller supplies a valid `traceparent` header (`00-<32hex>-<16hex>-<flags>`)
**When** `GET /health` is called
**Then** the structured access-log line emitted on `res.finish` carries `traceId` equal to the trace ID embedded in the incoming `traceparent` (verified via `process.stdout` spy, matching the pattern in `src/routes/health.test.ts`)

#### AC-DB-UNHEALTHY-1: 503 when DB is unreachable

**Priority**: MUST

**Given** the Express app is running with `DATABASE_URL` set but `checkConnection()` rejects (database down or connection refused)
**When** `GET /health` is called
**Then**:

- HTTP status is `503`
- `Content-Type` is `application/json`
- Response body is `{ "status": "error", "db": "error", "timestamp": "<valid ISO8601 string>" }`
- No internal error detail (no `err.message`, no stack trace) appears in the response body (Guiding Principle 5 / `src/middleware/errorHandler.ts` security convention)
- A structured log line at `warn` or `error` level is emitted carrying the DB error (server-side only)

#### AC-DB-UNCONFIGURED-1: 200 liveness when DATABASE_URL is unset

**Priority**: MUST

**Given** the Express app is running without `DATABASE_URL` set in the environment
**When** `GET /health` is called
**Then**:

- HTTP status is `200` (the service is live; DB readiness is not applicable)
- Response body is `{ "status": "ok", "db": "unconfigured", "timestamp": "<valid ISO8601 string>" }`
- `getPool()` from `src/db/pool.ts` is NOT called (avoids the `throw new Error('DATABASE_URL is not set')` path in the pool module)

#### AC-UNIT-1: Health handler is unit-testable with a mocked checkConnection

**Priority**: MUST

**Given** the health route handler is implemented as an async Express handler that calls `checkConnection()` (imported from `src/db/pool.ts`)
**When** tests mock `checkConnection` to resolve (success) or reject (failure) without a real database
**Then** the handler produces the correct status code and body shape in both cases — verifiable via `jest.mock('../db/pool')` + supertest against `createApp()`, following the pattern in `src/db/pool.test.ts`

#### AC-NOCONSOLELOG-1: No console.* in the health handler

**Priority**: MUST

**Given** the health handler implementation
**When** the code is inspected or linted
**Then** there are zero `console.log`, `console.error`, or other `console.*` calls — all logging uses `req.log` (the request-scoped pino child logger injected by `src/middleware/requestLogger.ts`) per CLAUDE.md observability requirements (BLOCKING)

### Scope Boundaries

**In scope**:

- Replacing the existing liveness-only stub in `src/routes/health.ts` with a readiness-aware handler that calls `checkConnection()` from `src/db/pool.ts`
- Three response variants: DB reachable (200 ok/ok), DB unreachable (503 error/error), DATABASE_URL unset (200 ok/unconfigured)
- Unit tests (mocked `checkConnection`) and integration tests (supertest against `createApp()`) for all three variants
- Trace context propagation (already provided by `requestLogger` middleware — the handler inherits `req.log` and `req.traceId` for free)
- Extending `src/routes/health.test.ts` with the new DB-readiness test cases (or adding a parallel `health.unit.test.ts` for the mock-based unit tests — the Coding Agent decides based on test isolation needs)

**Out of scope**:

- Changing the existing `GET /health` liveness path (it already exists and is tested — only extending it with a `db` field)
- A separate `/ready` or `/live` endpoint split (not required for MVP; single `/health` covers both)
- Metrics endpoint or Prometheus scrape target (productBrief: metrics deferred)
- Deep schema validation (e.g. running a `SELECT 1` query) — `checkConnection()` (acquire + release a client) is sufficient for DB readiness
- Authentication or rate-limiting on `/health` (not required for MVP; the endpoint is public)
- Any changes to `src/middleware/`, `src/config/env.ts`, or `src/db/pool.ts` — those modules are complete and correct

**Dependencies**:

- `src/db/pool.ts` (`checkConnection()`) — delivered by FEAT-002/TASK-002 (complete, on `main`)
- `src/routes/health.ts` — existing liveness stub from FEAT-001/TASK-001 Phase 3 (to be extended)
- `src/app.ts` (`createApp()`) — test harness entry point; no changes needed
- `src/middleware/requestLogger.ts` — injects `req.log` and `req.traceId`; health handler consumes them

**NFR implications**:

- **Performance**: `checkConnection()` is a single pool `connect()` + `release()` — expected < 5 ms on a healthy local DB; well within the 150 ms p95 NFR. No timeout is imposed by this task (the pg pool's `connectionTimeoutMillis` config covers that at the pool level)
- **Security**: no internal error detail in the 503 response body (Guiding Principle 5)
- **Observability**: the handler MUST log via `req.log` (never `console.*`); the DB error is logged server-side only

### Implementation Guide Required

No — the acceptance criteria above are fully auto-verifiable via `npm test`. The Coding Agent has all the information needed: extend `src/routes/health.ts`, call `checkConnection()`, handle the three variants, write tests following the patterns in `src/routes/health.test.ts` and `src/db/pool.test.ts`.

## User Journey Definition

See `## Specification` above. This is an NFR/Infrastructure feature — the full verification method, success metrics, and acceptance criteria (AC-LIVENESS-1, AC-LIVENESS-2, AC-DB-UNHEALTHY-1, AC-DB-UNCONFIGURED-1, AC-UNIT-1, AC-NOCONSOLELOG-1) are defined there.

## Test Strategy

### Approach
- **Emphasis**: integration (supertest against `createApp()`) with mocked `checkConnection` for the DB-readiness branches — matches the project's established Testing Patterns (systemPatterns.md § Testing Patterns: Jest + ts-jest + supertest, mock at the module seam via `jest.mock`).
- **Target test count**: 7 (within the 6-12 single-module guideline; well under 20, no justification needed).

### File Organization
- **New test files**:
  - `src/routes/health.db.test.ts` — readiness branches that require controlling `checkConnection()`. Top-of-file `jest.mock('../db/pool')` so the handler's `checkConnection` is a `jest.fn()`. Covers: DB reachable → 200 `{status:"ok", db:"ok", timestamp}`; DB unreachable (rejects) → 503 `{status:"error", db:"error", timestamp}` with NO internal error detail in body + a server-side `warn`/`error` log line; unit-level assertion that the handler branches purely on the mocked `checkConnection` outcome (AC-UNIT-1).
- **Extend existing**:
  - `src/routes/health.test.ts` — keep the existing AC-HAPPY-1 liveness + trace-propagation tests (they remain valid: tests run with `DATABASE_URL` unset, so the new handler returns 200 `status:"ok"` via the `unconfigured` path; existing assertions on `status` + ISO-8601 timestamp still hold). ADD one explicit AC-DB-UNCONFIGURED-1 assertion: with `DATABASE_URL` unset the body carries `db:"unconfigured"` and `getPool()` is never invoked.

### What NOT to Test
- `checkConnection()` / `getPool()` internals (retry/backoff, pool error handler, lazy singleton) — already covered by `src/db/pool.test.ts` (FEAT-002). This task mocks that seam, it does not re-test it.
- `requestLogger` trace-context derivation — covered in Phase 2 tests; AC-LIVENESS-2 only asserts the health line *inherits* the existing propagation.
- Real PostgreSQL connectivity — out of scope for unit/integration; deterministic behavior is driven by mocking the `checkConnection` seam (no live DB in the test suite).
- Response Content-Type serialization — guaranteed by `res.json()` (framework); asserted incidentally, not a dedicated test.

### Per-Phase Test Guidance
- Phase 1 (7 tests, all written test-first per TDD):
  - **Extend** `health.test.ts` (1 new): AC-DB-UNCONFIGURED-1 — `DATABASE_URL` unset → 200 `db:"unconfigured"`, `getPool()` not called.
  - **New** `health.db.test.ts` (existing 2 liveness/trace tests stay in `health.test.ts`; this file adds ~5):
    - AC-LIVENESS-1: `checkConnection` resolves → 200, exact body `{status:"ok", db:"ok", timestamp:<ISO8601>}`, `Content-Type: application/json`, timestamp round-trips.
    - AC-DB-UNHEALTHY-1 (status): `checkConnection` rejects → 503, exact body `{status:"error", db:"error", timestamp:<ISO8601>}`.
    - AC-DB-UNHEALTHY-1 (no leak): rejected error message/stack does NOT appear anywhere in the 503 response body.
    - AC-DB-UNHEALTHY-1 (log): a `warn`/`error` log line carrying the DB error is emitted server-side (stdout spy, per the `health.test.ts` capture pattern).
    - AC-UNIT-1: handler returns the correct status/body for both mocked outcomes without a real DB (verifies the seam is `checkConnection`, mockable via `jest.mock('../db/pool')`).
  - AC-NOCONSOLELOG-1 is enforced by lint/inspection (no dedicated runtime test) — the handler logs only via `req.log`.

## Implementation Roadmap

- [x] Phase 1: DB-readiness `/health` endpoint + tests — extend `src/routes/health.ts` to call `checkConnection()` from `src/db/pool.ts` and branch into the three response variants (200 ok/ok, 503 error/error, 200 ok/unconfigured guarded by `config.databaseUrl === undefined` so `getPool()` is never hit on the unconfigured path); log DB failures via `req.log` at `warn`/`error` (no internal detail in the body, no `console.*`); write the test-first suite described in Test Strategy. Single phase — the change is cohesive, self-contained, and fully auto-verifiable via `npm test`.

### Requirements
- `GET /health` reports liveness AND PostgreSQL readiness with the three exact response contracts in the Specification.
- Readiness is determined by `checkConnection()` (acquire + release a client) — no `SELECT 1`, no schema probe.
- Unconfigured (`DATABASE_URL` unset) is a healthy liveness response (`200`, `db:"unconfigured"`), never a thrown error — guard with `config.databaseUrl === undefined` before any `getPool()`/`checkConnection()` call.
- All logging via `req.log`; zero `console.*` (BLOCKING — Guiding Principle 3).
- No internal error detail in the 503 body (Guiding Principle 5).

### Files to Modify
- `src/routes/health.ts` — replace the liveness-only handler with an async readiness-aware handler (call `checkConnection()`, branch on outcome, add the `db` field). Import `checkConnection` + `config`.
- `src/routes/health.test.ts` — add the AC-DB-UNCONFIGURED-1 assertion; keep existing tests.
- `src/routes/health.db.test.ts` — NEW; mocked-`checkConnection` readiness/failure tests.

### Dependencies
- `src/db/pool.ts` (`checkConnection`, `getPool`) — FEAT-002, complete on `main`.
- `src/config/env.ts` (`config.databaseUrl`) — the only env reader; used for the unconfigured guard.
- `src/middleware/requestLogger.ts` (`req.log`, `req.traceId`) — already injected; consumed read-only.

### Observability Requirements
- **Applies**: Yes → reference `${CLAUDE_PLUGIN_ROOT}/context/observability-requirements.md` during build.
- **Logging**: DB-readiness failure logged via `req.log` at `warn`/`error` with the error object (server-side only); success path inherits the existing one-line access log from `requestLogger`.
- **Tracing**: inherited — handler runs after `requestLogger`, so the log line already carries `traceId` (AC-LIVENESS-2). No new spans.
- **Metrics**: N/A (deferred per productBrief).

### API Requirements
- **REST API**: Yes → `GET /health` response schema extended with a `db` field (`"ok" | "error" | "unconfigured"`) and a 503 failure status. Document the contract in code comments consistent with systemPatterns.md § API Conventions. No OpenAPI spec exists yet for this project (not introduced by this task).
- **GraphQL API**: No.

## Creative Phases

- [x] None required — Spec Writer assessed HIGH confidence; all building blocks (`checkConnection`, the supertest + stdout-spy patterns, the `config.databaseUrl` guard) already exist. No design exploration needed.

---

## Build Execution State

**Build Status**: COMPLETE
**Current Build**: Phase 1: DB-readiness /health endpoint + tests (TASK-003)
**Build Started**: 2026-06-17
**Build Completed**: 2026-06-17
**Phase Number**: 1 of 1
**Is Multi-Phase**: NO
**Status**: BUILD_COMPLETE

### Current Build Step
**Step**: Step 11 - Phase Git Completion
**Status**: COMPLETE
**Completed**: 2026-06-17

### Completed Steps
- Step 0.1: Auto-provisioned TASK-003 for FEAT-003 (Level 2, branch feature/FEAT-003-health-check-endpoint)
- Step 3 (PLAN): Spec Writer Agent — specification written, HIGH confidence, no creative needed
- Step 3.2 (PLAN): Human approved specification
- Step 4-5 (PLAN): Codebase analysis + implementation plan (single phase) + test strategy written
- Step 0.5 Git Setup: COMPLETE — feature branch created in main working tree (local-only, no worktree)
- Step 0.6 Phase Gate: COMPLETE — Implementation Roadmap populated, no creative phases required (Level 2)
- Step 1 Read Task Context: COMPLETE — single phase identified, Level 2
- Step 2 Load Context: COMPLETE — Level 2 implementation rules
- Step 3 Test Writer: COMPLETE — 6 new tests (health.db.test.ts +5, health.test.ts +1); confirmed RED
- Step 4 Coding Agent: COMPLETE — src/routes/health.ts readiness handler (3 variants, req.log, no leak)
- Step 6 Test Execution: COMPLETE — 8/8 health tests GREEN
- Step 7 Integration Verification: COMPLETE — full suite 38/38 PASS, tsc build PASS, no console.* (AC-NOCONSOLELOG-1)
- Step 8 Code Review: COMPLETE — APPROVED (secure, observable, correct branching)
- Step 9 Documentation: COMPLETE — systemPatterns.md § API Conventions + techContext.md § API updated; rich inline comments
- Step 10 Memory Bank: COMPLETE — tasks.md, progress.md, roadmap.md (FEAT-003) updated
- Step 11 Git Completion: COMPLETE — phase committed to feature branch

### Sub-Agents
(none — single cohesive route change executed inline by orchestrator)

### Resumption Notes
**Can Resume**: NO — REFLECTION_COMPLETE. Next: /banyan-archive TASK-003.

---

## Reflection Execution State

**Build Status**: IDLE
**Current Phase**: REFLECT → ARCHIVE
**Can Resume**: NO

### Completed Steps
- Step 1: Verify Prerequisites — COMPLETE (all phases [x], status BUILD_COMPLETE, Level 2)
- Step 2: Load Complexity Context — COMPLETE (level2-reflection.md)
- Step 3: Reflection — COMPLETE (inline by orchestrator) — Output: memory-bank/reflection/reflection-TASK-003.md
- Step 3.5: Pattern Extraction — COMPLETE (1 learning → 1 amended: testing-patterns.md)
- Step 4: Git Commit — COMPLETE

### Acceptance Criteria Status
- AC-LIVENESS-1 (200 ok/ok when reachable): MET — health.db.test.ts
- AC-LIVENESS-2 (trace context on log line): MET — inherited from requestLogger; covered by existing health.test.ts trace test
- AC-DB-UNHEALTHY-1 (503 error/error, no leak, server log): MET — health.db.test.ts (3 tests)
- AC-DB-UNCONFIGURED-1 (200 ok/unconfigured, getPool not called): MET — health.test.ts
- AC-UNIT-1 (handler branches on mocked checkConnection): MET — health.db.test.ts
- AC-NOCONSOLELOG-1 (zero console.*): MET — inspection (only req.log.warn)
