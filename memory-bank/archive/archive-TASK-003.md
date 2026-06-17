# Archive: Health check endpoint with tests

## Metadata

- **Task ID**: TASK-003
- **Complexity**: Level 2 (no creative phase — Spec Writer HIGH confidence)
- **Roadmap**: FEAT-003
- **Branch**: feature/FEAT-003-health-check-endpoint
- **Completed**: 2026-06-17
- **Reflection**: `memory-bank/reflection/reflection-TASK-003.md`
- **Creative**: None (not required)

## Summary

Replaced the liveness-only `GET /health` stub (delivered by TASK-001 Phase 3) with a
readiness-aware handler that probes PostgreSQL via `checkConnection()` (delivered by
TASK-002/FEAT-002) and resolves to three exact response contracts. This is the capstone
that connects the FEAT-001 HTTP foundation and the FEAT-002 connection module into an
operationally useful liveness/readiness probe — and it did so by *consuming* both prior
tasks' seams rather than modifying them, exactly as scoped (zero changes to `src/db/pool.ts`).

All 6 acceptance criteria were satisfied with direct evidence. The full test suite went
from 32 → 38 passing, `tsc` builds clean, the 503 path was dual-asserted to leak no
internal error detail, and the handler logs exclusively via `req.log` (zero `console.*`).
Delivered in a single cohesive phase.

## Solution

Single-phase implementation — a cohesive route change plus a six-test suite:

- **Readiness-aware handler** (`src/routes/health.ts`): an async Express handler that
  branches three ways:
  - `DATABASE_URL` unset → `200 { status:"ok", db:"unconfigured", timestamp }` — guarded
    by `config.databaseUrl === undefined` *before* any pool access, so `getPool()`'s
    "DATABASE_URL is not set" throw is never hit (live; readiness N/A).
  - `checkConnection()` resolves → `200 { status:"ok", db:"ok", timestamp }`.
  - `checkConnection()` rejects → `503 { status:"error", db:"error", timestamp }`, with the
    DB error logged **server-side only** via `req.log.warn({ err })` — no internal detail in
    the response body.
- **Test suite** (test-first, RED → GREEN, no scope creep):
  - `src/routes/health.db.test.ts` (NEW, 5 tests) — mocks the `../db/pool` seam via a
    `mock`-prefixed module-scope `jest.fn` that survives `jest.resetModules()`, sets
    `DATABASE_URL` so config takes the readiness branch. Covers AC-LIVENESS-1,
    AC-DB-UNHEALTHY-1 (status / no-leak / server-log), AC-UNIT-1.
  - `src/routes/health.test.ts` (EXTENDED, +1 test) — AC-DB-UNCONFIGURED-1: `DATABASE_URL`
    unset → `db:"unconfigured"`, `getPool()`/`checkConnection()` never called. Existing
    liveness + trace-propagation tests unchanged.

### Key Technical Decisions

1. **Guard the unconfigured path before any pool access** — `config.databaseUrl === undefined`
   is checked first, so the unconfigured response is a clean `200` liveness reply rather than
   a thrown error from the pool module. Correct three-way branch on the first pass, zero
   mid-phase reversals.
2. **Consume the FEAT-002 seam, don't modify it** — `checkConnection()` was designed in
   TASK-002 as a single-shot acquire/release contract precisely so FEAT-003 could call it;
   this task needed no changes to `src/db/pool.ts`.
3. **No internal error detail in the 503 body** — the DB error is logged server-side only
   (Guiding Principle 5); the no-leak requirement was dual-asserted via an exact-body
   `toEqual` *and* a `JSON.stringify(body)` substring check against the error message and stack.
4. **All logging via `req.log`** — zero `console.*` (Guiding Principle 3, BLOCKING);
   trace context (`traceId`) is inherited from the `requestLogger` middleware, so the
   access-log line carries it for free (AC-LIVENESS-2 — no new spans).

## Files Changed

- `src/routes/health.ts` — MODIFIED: replaced the liveness-only stub with an async
  readiness-aware handler (three response contracts, `checkConnection()` probe, `config`
  unconfigured guard, server-side-only DB error log via `req.log.warn`)
- `src/routes/health.db.test.ts` — NEW: 5 tests (mocked `../db/pool` seam via module-scope
  `mock`-prefixed `jest.fn` stable across `jest.resetModules()`)
- `src/routes/health.test.ts` — EXTENDED: +1 AC-DB-UNCONFIGURED-1 test; existing liveness +
  trace-propagation tests preserved
- `memory-bank/systemPatterns.md` — § API Conventions updated (health readiness contract)
- `memory-bank/techContext.md` — § API updated (`/health` `db` field + 503 status)

## Acceptance Criteria

All 6 satisfied with direct evidence — see reflection AC table:

- **AC-LIVENESS-1** (200 ok/ok when reachable): MET — `health.db.test.ts`
- **AC-LIVENESS-2** (trace context on log line): MET — inherited from `requestLogger`; covered
  by the existing `health.test.ts` trace test
- **AC-DB-UNHEALTHY-1** (503 error/error, no leak, server log): MET — `health.db.test.ts` (3 tests)
- **AC-DB-UNCONFIGURED-1** (200 ok/unconfigured, `getPool()` not called): MET — `health.test.ts`
- **AC-UNIT-1** (handler branches on mocked `checkConnection`): MET — `health.db.test.ts`
- **AC-NOCONSOLELOG-1** (zero `console.*`): MET — inspection (only `req.log.warn`)

## Lessons Learned

- **Cross-task seam design is the highest-leverage planning decision.** Designing a
  downstream-consumable contract one task early (TASK-002's `checkConnection`) turned a
  would-be multi-file feature into a single-file change. The "build the seam now, consume it
  later" decision recorded in TASK-002's creative phase was vindicated here with no friction.
- **A frozen, import-time `process.env`-reading config forces a `resetModules` + re-require
  test rhythm.** Pairing it with a *module-scope* (not `globalThis`) `mock`-prefixed `jest.fn`
  is the lightest-weight way to keep a stable spy across resets when the mocked module lives in
  the same dependency graph being rebuilt — the `jest.fn` reference survives because
  `resetModules()` clears only the require cache, not the test file's variables. (Second
  consecutive reuse of this test-harness family; promoted the learned rule low → medium.)
- **Recurring friction (carried forward):** by-task session logs remain absent
  (`.agent-logs/claude/by-task/TASK-003/` unpopulated), so the reflection had no quantitative
  tool-call/duration metrics. Open since TASK-001.

## Notes

- **Completes the v0.1.0 Foundation milestone trio** (FEAT-001 → FEAT-002 → FEAT-003): a
  TypeScript Express API with PostgreSQL connectivity and an operational liveness/readiness probe.
- **Out of scope** (cleanly deferred): separate `/ready` + `/live` split; metrics/Prometheus
  scrape target; deep schema validation (`SELECT 1`); auth/rate-limiting on `/health`.
- **No changes** to `src/middleware/`, `src/config/env.ts`, or `src/db/pool.ts` — those
  modules were complete and consumed read-only.
