# Architecture Decision: PostgreSQL Connection-Resilience Strategy

**Created**: 2026-06-16
**Status**: DECIDED
**Decision Type**: Architecture
**Task**: TASK-002 (Docker Compose for PostgreSQL) — FEAT-002
**Scope**: SOLE creative phase. Resolves the human-flagged resilience strategy for `src/db/pool.ts` and its wiring in `src/index.ts`. Covers three design questions only: (1) eager vs. lazy connection, (2) startup retry / backoff, (3) transient-failure reconnection.

---

## Context

### System Requirements

- A connection layer (`src/db/pool.ts`) over `pg.Pool`, exporting `getPool()`, `closePool()`, `checkConnection()`, that backs the Express API and will be consumed by FEAT-003's `/health` DB-readiness probe.
- The product's defining onboarding flow is "clone → `docker compose up` → open `localhost:3000`". Under `docker compose up`, the Express process (running on the host via `npm run dev`, since the `api` service is out of scope this task) and Postgres start in an **undefined relative order** — Postgres typically needs 5–25s to pass its `pg_isready` healthcheck (Decision 2: 5s interval × 3 retries + 5s start_period). The app will frequently come up while the DB is still warming.
- `checkConnection()` is the FEAT-003 readiness surface: it must give a truthful, current answer about whether the DB is reachable **at probe time** (not a cached boot-time verdict).

### Technical Constraints (HARD — not in creative scope; must not be violated)

1. **Non-blocking boot (firm product requirement)**: the app MUST start and serve `/health` even when `DATABASE_URL` is unset or the DB is unreachable. No resilience behavior may gate `server.listen()`. Any retry/backoff must run as a bounded, non-blocking background concern.
2. **Single config source (Guiding Principle 1)**: `pool.ts` reads DB config ONLY via `import { config } from '../config/env'`. It MUST NOT touch `process.env`. Any retry-policy knobs (attempts, delay) must therefore either be hard-coded module constants or be surfaced through new fields on the frozen `config` object — never read from `process.env` in `pool.ts`.
3. **Observability (BLOCKING — Guiding Principles 2 & 3)**: zero `console.*` in `pool.ts`. All lifecycle logging via the pino `logger` from `src/observability/logger.ts`. Pool lifecycle is process-level (not request-scoped): use `logger.info/warn/error(...)` directly — do NOT thread a logger argument into `pool.ts`. Startup/shutdown lines in `index.ts` use the existing `lifecycleLog` (`logger.child({ traceId })`) so every line carries a `traceId`.
4. **Module surface compatibility**: exports remain `getPool(): pg.Pool`, `closePool(): Promise<void>`, `checkConnection(): Promise<void>`. FEAT-003 calls `checkConnection()`.
5. **Testability**: `pg` is mocked via `jest.mock('pg')` with the `jest.resetModules()` + re-`require` pattern from `env.test.ts`. Any timer-based resilience logic must be unit-testable with fake timers (no real wall-clock delays blocking the suite). Logger output is captured via `jest.spyOn(process.stdout, 'write')` per the learned testing rule (pino writes through `process.stdout`).
6. **Scope leanness (Guiding Principle 4)**: Level 2 infra task, < 20 concurrent users. `pg.Pool` defaults (max 10) are appropriate. No external libraries beyond `pg` unless strongly justified. Simplest design that meets the resilience goal.

### Non-Functional Requirements (from productBrief)

- Docker Compose cold-start < 30s (the healthcheck budget already fits this).
- Best-effort availability, no SLA. Manual restart acceptable (RTO < 5 min). `docker compose down && up` is the documented recovery procedure.
- API p95 < 150ms reads / < 300ms writes — pool acquisition must not add meaningful latency in the steady state.
- Self-hosted, solo-dev/small-team operator (Sam the Maker; Dev/Ops maintainer). Operational simplicity is a feature, not a compromise.

### Existing Patterns That Must Be Respected

- **Single config source** (`env.ts` is the only `process.env` reader; frozen `config`).
- **App factory split** (`createApp()` pure; `index.ts` owns all process side effects, `listen`, signal handlers, `process.exit`).
- **Process-entry pattern**: `index.ts` mints `rootTraceId` → `lifecycleLog = logger.child({ traceId })`; graceful shutdown closes the server then exits, guarded by a 5s force-exit timer and a double-invocation guard.
- **`pg.Pool` is itself resilient by design**: it lazily opens physical connections on `connect()`, validates/recycles broken connections, and emits an `'error'` event for errors on *idle* clients. A default un-handled `'error'` listener on `pg.Pool` will crash the process — this is the one `pg` default we must actively neutralize regardless of which option is chosen.

---

## Component Analysis

### Core Components

| Component | Purpose | Responsibilities |
|-----------|---------|------------------|
| `src/db/pool.ts` | Process-level DB connection module | Own the singleton `pg.Pool` lifecycle (create lazily, expose, close); provide `checkConnection()` readiness probe; attach a non-fatal `'error'` handler to the pool; log lifecycle via `logger` |
| `src/index.ts` | Process entry / lifecycle wiring | Emit startup `warn` when `DATABASE_URL` unset; fire a non-blocking startup connectivity probe when set; `await closePool()` in the shutdown sequence before `process.exit(0)` |
| `src/config/env.ts` | Single config source | Provide `config.databaseUrl`; (optionally) provide retry-policy fields if a chosen option needs configurable backoff |
| `src/observability/logger.ts` | Structured logger | Sink for all process-level pool lifecycle lines |

### Component Interactions

```
                         (process-level, no req scope)
  ┌─────────────┐  imports config   ┌──────────────┐  imports logger  ┌──────────────────┐
  │  index.ts   │ ───────────────▶  │  db/pool.ts  │ ───────────────▶ │ observability/   │
  │ (lifecycle) │                   │  pg.Pool     │                  │ logger (pino)    │
  └─────┬───────┘                   └──────┬───────┘                  └──────────────────┘
        │ startup: warn if unset           │ getPool() lazy-init
        │ startup: non-blocking probe      │ checkConnection() → connect/release
        │ shutdown: await closePool()      │ pool.on('error', …) non-fatal log
        ▼                                  ▼
   server.listen (NEVER gated)        PostgreSQL (TCP, pg wire)
```

`pool.ts` never imports `index.ts` (no cycle). FEAT-003's future `/health` handler will import `checkConnection()` directly and use `req.log` for request-scoped logging — `pool.ts` stays logger-argument-free.

---

## Options Explored

All three options keep **lazy** initialization (the hard non-blocking-boot constraint effectively forecloses eager init — see Eager sub-analysis below). They differ on **startup retry/backoff** and **transient-failure handling**. Eager init is analyzed and rejected inline rather than as a full option, because it cannot satisfy constraint #1 without contortion.

#### Eager init (analyzed, rejected — not carried as a full option)

Initializing the `pg.Pool` at module load or at `index.ts` boot, and/or `await`-ing a real connection before `server.listen()`, directly violates the firm non-blocking-boot requirement: a missing/slow DB would block or crash startup, breaking "clone → up → open localhost:3000". Even a non-awaited eager `getPool()` at boot buys nothing over lazy init for a < 20-user single process (the first real query happens within milliseconds of first request anyway), while removing the clean "DB never touched until needed" property that makes the unset-`DATABASE_URL` path trivially safe. **Rejected on constraint grounds.** Lazy is retained in every option.

---

### Option 1: Lazy + Non-Fatal Startup Probe, No Retry (the current spec default)

- **Description**: `getPool()` lazily creates the pool on first call. `index.ts` does NOT call `getPool()` at boot. If `config.databaseUrl` is unset → startup `warn`. If set → a single non-blocking `checkConnection()` fired after `server.listen()` resolves, result logged (`info` success / `warn` failure), never gating startup. No retry. Transient runtime failures handled only by `pg.Pool` defaults — **except** we MUST still add a `pool.on('error', …)` handler (otherwise an idle-client error crashes the process; the spec is silent on this and that silence is a latent bug).
- **Components**: `pool.ts` (getPool/closePool/checkConnection + error handler), `index.ts` (warn + single probe + closePool).
- **Pros**:
  - Simplest to implement and reason about; closest to the already-reviewed spec.
  - Fewest tests; no timer logic, so no fake-timer machinery.
  - Zero new config surface.
- **Cons**:
  - Under `docker compose up`, the single startup probe almost always fires while Postgres is still warming up → it logs a **misleading `warn`** ("DB unreachable") even though the DB becomes healthy 10–15s later. This is a confusing first-run experience for exactly the persona (Sam) the product optimizes for, and erodes trust in the logs.
  - The `warn` is a one-shot snapshot; nothing ever logs the subsequent recovery, so the operator is left with a scary line and no resolution.
- **Technical Fit**: High (matches existing patterns).
- **Complexity**: Low.
- **Scalability**: High (irrelevant at this scale; nothing to scale).

---

### Option 2: Lazy + Bounded Background Startup Retry with Backoff (chosen)

- **Description**: Lazy `getPool()` unchanged. `index.ts` startup: warn if unset (unchanged). If set, instead of a single probe, fire a **non-blocking, bounded background retry loop** that calls `checkConnection()` up to N times with capped exponential backoff, logging a single `info` line on first success ("database reachable") or a single `warn` line only after **all** attempts are exhausted ("database not reachable after N attempts"). The loop is a detached promise — `server.listen()` is never awaited against it and never gated. The retry policy (attempts, base delay, max delay) lives as module constants in `pool.ts` exported via a small `checkConnectionWithRetry(opts?)` helper so it is overridable in tests (injectable policy — no `process.env` read). A `pool.on('error', …)` non-fatal handler is added (same as Option 1).
- **Components**: `pool.ts` (getPool/closePool/checkConnection + `checkConnectionWithRetry` + error handler), `index.ts` (warn + background retry probe + closePool).
- **Architecture Diagram**:
  ```
  server.listen() resolves ──┐ (NOT awaited)
                             └─▶ checkConnectionWithRetry({attempts, baseDelay, maxDelay})
                                   attempt 1 ── fail ── wait 250ms ─┐
                                   attempt 2 ── fail ── wait 500ms ─┤  (capped exp backoff)
                                   attempt 3 ── ok ───────────────▶ logger.info("database reachable")
                                   …                                
                                   all fail ─────────────────────▶ logger.warn("not reachable after N")
  ```
- **Pros**:
  - Matches `docker compose up` reality: the app rides out the 5–25s Postgres warm-up and logs a single accurate `info` "reachable" line instead of a misleading boot-time `warn`. Best experience for the target persona.
  - Still strictly non-blocking — the loop is detached; `server.listen()` and `/health` are unaffected.
  - Bounded (N attempts, capped backoff, `unref`'d timers) → cannot keep the event loop alive or retry forever; safe under graceful shutdown.
  - `checkConnection()` itself (the FEAT-003 surface) is untouched — retry is an `index.ts`-orchestrated startup concern layered *on top of* the unchanged single-shot probe, so FEAT-003's readiness contract is unaffected.
  - Deterministically testable with Jest fake timers + an injectable policy (small attempt count, `advanceTimersByTimeAsync`).
- **Cons**:
  - Slightly more code than Option 1; introduces timer logic and ~2 extra tests (retry-then-succeed, retry-exhausted).
  - Adds retry-policy constants (mitigated by keeping them module-local with optional override, not env-driven, honoring the leanness + single-config constraints).
- **Technical Fit**: High.
- **Complexity**: Low–Medium.
- **Scalability**: High.

---

### Option 3: Lazy + Startup Retry + Active Transient-Failure Reconnection Layer

- **Description**: Everything in Option 2, plus an active mid-runtime resilience layer: track pool health from `'error'` events, mark the pool "degraded", and proactively tear down (`pool.end()`) and re-create the pool on transient failures, possibly wrapping `getPool()` queries in retry/circuit-breaker logic so callers transparently survive a DB blip.
- **Components**: Option 2 components + a pool-state/health tracker + reconnection/circuit-breaker logic + caller-facing retry wrapper.
- **Pros**:
  - Most robust against sustained DB outages and connection storms.
  - Could transparently hide brief DB restarts from API callers.
- **Cons**:
  - **Re-implements what `pg.Pool` already does.** `pg.Pool` already discards broken connections and opens fresh ones on the next `connect()`/`query()`; a manual reconnection layer is redundant and risks double-managing the pool (e.g., ending a pool other code still holds a reference to).
  - High-cardinality failure modes (when to tear down? what about in-flight clients? circuit-breaker tuning) → exactly the operational complexity the product brief warns against for a < 20-user MVP.
  - Significantly more tests and edge cases; meaningfully higher maintenance burden for negligible benefit at this scale (best-effort availability, manual restart acceptable per RTO).
  - Caller-facing query-retry belongs to the future data-access/repository layer (domain features), not the infra connection module in a Level 2 task — premature.
- **Technical Fit**: Medium (fights the library; over-reaches the module's role).
- **Complexity**: High.
- **Scalability**: High (but unneeded).

---

## Evaluation Matrix

Scores: High / Medium / Low (higher = better for the criterion).

| Criteria | Option 1 (no retry) | Option 2 (bounded retry) | Option 3 (active reconnect) |
|----------|---------------------|--------------------------|------------------------------|
| Scalability (to product targets) | High | High | High |
| Maintainability | High | High | Low |
| Performance (boot + steady state) | High | High | Medium |
| Security | High | High | High |
| Observability (truthful, low-noise logs) | Low | High | Medium |
| Operational simplicity (solo-dev self-host) | High | High | Low |
| `docker compose up` warm-up fit | Low | High | High |
| FEAT-003 readiness-probe cleanliness | High | High | Medium |
| Testability with mocked `pg` | High | High (fake timers) | Low |
| Implementation cost | Low | Low–Medium | High |
| Adheres to "complexity earns its keep" (GP4) | High | High | Low |

---

## Observability Architecture

### Logging

- **Library**: existing pino wrapper (`src/observability/logger.ts`) — JSON to `process.stdout`, base fields `service`/`environment`/`version` already bound.
- **Format**: structured JSON. Every line carries a `traceId` because process-level lines route through `lifecycleLog = logger.child({ traceId: rootTraceId })` in `index.ts`. Lines emitted from inside `pool.ts` (pool init/close, `'error'` event) use the bare `logger` — these are deep process-level events; per the spec's "no traceId on module-level logs" note they may omit `traceId`. Startup/probe lines orchestrated from `index.ts` use `lifecycleLog` and DO carry `traceId`.
- **Configuration**: levels honor `config.logLevel` (single config source). No new logging env vars.
- **Lifecycle log lines (Option 2, chosen)**:
  | Site | Level | Message (intent) | Carries traceId |
  |------|-------|------------------|-----------------|
  | `pool.ts` getPool first-init | `info` | pool initialized | no (module-level) |
  | `pool.ts` closePool (was init) | `info` | pool closed | no (module-level) |
  | `pool.ts` `pool.on('error')` | `error` | idle-client pool error (non-fatal; `err` serialized, no secrets) | no (module-level) |
  | `index.ts` startup, `DATABASE_URL` unset | `warn` | DATABASE_URL unset — DB connectivity unavailable | yes (lifecycleLog) |
  | `index.ts` background probe success | `info` | database reachable | yes (lifecycleLog) |
  | `index.ts` background probe exhausted | `warn` | database not reachable after N attempts | yes (lifecycleLog) |
  | `index.ts` shutdown pool close | `info` | pool closed during shutdown | yes (lifecycleLog) |
- **Never log**: the `DATABASE_URL` DSN (contains the password) — log only that it is set/unset, never its value. The `pg` error object is serialized by pino on the `err` key for the `'error'` handler and probe-failure path; it carries no credential material.

### Distributed Tracing

- **SDK**: OpenTelemetry seam unchanged. `initTracing()` remains a no-op this task; no DB spans are created (metrics/tracing instrumentation of queries is deferred, consistent with project-wide deferral).
- **Propagation**: process-level pool events are not request-scoped, so no inbound `traceparent` applies. The `rootTraceId` minted in `index.ts` correlates all lifecycle lines. When FEAT-003+ issues request-scoped DB calls, those will run under `req.traceId` via `req.log` — `pool.ts` requires no change to support that (it never logs on the request's behalf).

  | From | To | Protocol | Propagation Method |
  |------|-----|----------|-------------------|
  | `index.ts` lifecycle | stdout logs | n/a | `rootTraceId` via `logger.child` |
  | future `/health` (FEAT-003) | `checkConnection()` | in-process call | `req.log` carries `req.traceId`; pool stays logger-free |

- **Sampling**: n/a this task (no spans emitted).

### Metrics

- **Standard Metrics**: deferred (no metrics endpoint in the project yet).
- **Custom Business Metrics**: none added. A future `db_connection_check_failures_total` could attach when metrics land — explicitly out of scope here.

### Configuration Variables

No new **environment** variables are introduced (honors single-config-source + leanness). Retry policy is a module constant with a test-overridable parameter, not an env var. Existing relevant vars:

| Variable | Purpose | Default |
|----------|---------|---------|
| `DATABASE_URL` | Postgres DSN (already in `config.databaseUrl`) | unset (stub) |
| `LOG_LEVEL` | Log verbosity for lifecycle lines | info |

Retry-policy constants (module-local in `pool.ts`, overridable via the helper's optional argument for tests):

| Constant | Purpose | Default |
|----------|---------|---------|
| `STARTUP_PROBE_ATTEMPTS` | Max startup connectivity attempts | 5 |
| `STARTUP_PROBE_BASE_DELAY_MS` | Base backoff delay | 250 |
| `STARTUP_PROBE_MAX_DELAY_MS` | Backoff cap | 4000 |

(5 attempts with 250ms → 500 → 1000 → 2000 capped at 4000ms ≈ ~3.75s of bounded retry, comfortably inside the 25s healthcheck window while non-blocking; values may be tuned in build but stay module-local and `unref`'d.)

---

## Decision

**Chosen**: **Option 2 — Lazy initialization + bounded, non-blocking background startup retry with capped exponential backoff + a non-fatal `pool.on('error')` handler.**

### Resolved behavior for the three design questions

1. **Eager vs. lazy connection → LAZY (kept).** `getPool()` lazily creates the `pg.Pool` on first call from `config.databaseUrl`; throws the typed error when unset. `index.ts` does NOT call `getPool()` at boot. Eager init is rejected — it cannot satisfy the firm non-blocking-boot requirement and buys nothing at this scale.

2. **Startup retry / backoff → BOUNDED, NON-BLOCKING BACKGROUND RETRY (revised from the spec).** Replace the spec's single post-listen `checkConnection()` with `checkConnectionWithRetry({ attempts, baseDelay, maxDelay })`, fired as a detached promise after `server.listen()` resolves. It logs one `info` "database reachable" on first success or one `warn` "not reachable after N attempts" once exhausted. It NEVER gates startup. This directly fixes the misleading boot-time `warn` that Option 1 produces under `docker compose up`.

3. **Transient-failure reconnection → RELY ON `pg.Pool` DEFAULTS + ADD A NON-FATAL `'error'` HANDLER (no custom reconnection layer).** `pg.Pool` already recycles broken connections and reconnects on the next acquisition. The only required addition is a `pool.on('error', (err) => logger.error({ err }, …))` listener attached at init, so an error on an *idle* pooled client is logged instead of crashing the process (Node's default for an unhandled pool `'error'`). No circuit breaker, no manual pool teardown/recreate, no caller-facing query-retry — that is Option 3's over-engineering and is rejected for this Level 2 task.

### Rationale

- **It honors every hard constraint.** Boot is never gated (the retry loop is a detached, `unref`'d background promise); `pool.ts` reads only `config`; logging is pino-only with no `console.*`; the export surface and `checkConnection()` contract are unchanged so FEAT-003 is unaffected; all new behavior is deterministically testable with fake timers + an injectable policy.
- **It fixes a real, persona-specific defect in the spec default.** Option 1's lone startup probe fires into the Postgres warm-up window and emits a misleading "DB unreachable" `warn` on nearly every `docker compose up` — precisely the first-run moment for Sam the Maker and the Dev/Ops maintainer. Option 2 turns that into an accurate single `info` line once the DB is up, which is the truthful-observability outcome the project's Guiding Principle 2 is meant to deliver.
- **It refuses to re-implement the library.** Option 3's reconnection layer duplicates `pg.Pool` behavior and adds operational complexity that fails Guiding Principle 4 ("complexity only when it earns its keep") for a < 20-user, best-effort-availability, manual-restart-RTO product. The one genuine gap in "rely on defaults" — the process-crashing unhandled `'error'` event — is closed cheaply with a single listener.
- **Cost is proportionate.** The increment over the spec is ~30 lines and ~2 tests, well within the provisional 9–11 estimate (revised to ~10–12 below).

### Trade-offs Accepted

- **Slightly more code and two extra tests than Option 1.** Acceptable: the added behavior removes a misleading log on the product's signature flow and the tests are small and deterministic with fake timers.
- **Retry-policy constants live in `pool.ts`, not in `env.ts`.** Acceptable and in fact required: routing them through env would either add env vars to `pool.ts` (violates single-config-source) or expand `env.ts` for an MVP knob nobody will tune. Module constants with a test-override argument keep `pool.ts` env-free while staying testable. If a future task wants them env-driven, they graduate into `env.ts` (the documented single reader) — an additive change.
- **No protection against sustained mid-runtime outages beyond `pg.Pool` defaults.** Acceptable: best-effort availability, manual restart is the documented RTO, and `pg.Pool` already reconnects on the next acquisition once the DB returns.

---

## Spec Reconciliation

| Spec item | Verdict | Replacement / exact build behavior |
|-----------|---------|-------------------------------------|
| **Decision 1 (lazy module shape)** | **KEEP** | `getPool()` lazy-init from `config.databaseUrl`, throws typed error when unset; `closePool()` ends pool if initialized else resolves; `checkConnection()` acquires a client via `pool.connect()`, releases it, resolves on success / rejects on failure. **Addition (not a revision of the contract):** at pool creation, attach `pool.on('error', (err) => logger.error({ err }, 'idle pg client error (non-fatal)'))` so an idle-client error is logged, not fatal. |
| **Decision 4 (startup `checkConnection` behavior)** | **REVISE** | Replace "non-blocking single `checkConnection()` after listen" with a **non-blocking bounded background retry**. Exact behavior: after `server.listen()` resolves, if `config.databaseUrl` is set, call (without `await`) a new `checkConnectionWithRetry({ attempts: STARTUP_PROBE_ATTEMPTS, baseDelay: STARTUP_PROBE_BASE_DELAY_MS, maxDelay: STARTUP_PROBE_MAX_DELAY_MS })` exported from `pool.ts`. On first success → `lifecycleLog.info('database reachable')`; on exhaustion → `lifecycleLog.warn('database not reachable after N attempts')`. Backoff timers are `unref`'d. The startup-warn-when-unset path and the `closePool()`-before-`exit(0)` wiring are UNCHANGED. |
| **AC-WARN-1 (warn when `DATABASE_URL` unset)** | **KEEP** | Unchanged. Startup still emits a `warn` via `lifecycleLog` (carries `traceId`) when `config.databaseUrl` is undefined; server still listens. |
| **AC-MODULE-3 (`getPool()` throws when unset)** | **KEEP** | Unchanged. Throws `Error('DATABASE_URL is not set — cannot initialize pg pool')`. |
| **AC-MODULE-4 (`checkConnection()` resolves on live pool)** | **KEEP** | Unchanged. `checkConnection()` remains the single-shot probe (acquire → release → resolve, `release()` called once). The retry helper is a separate, layered export that *calls* `checkConnection()` — it does not change `checkConnection()`'s own contract. |
| **AC-MODULE-5 (`checkConnection()` rejects, propagates pg error)** | **KEEP** | Unchanged. Single-shot `checkConnection()` still rejects with the underlying error, unswallowed. (The retry helper catches per-attempt rejections internally to drive backoff — but `checkConnection()` itself is unchanged, so FEAT-003's contract holds.) |
| **New AC proposed — AC-RETRY-1 (startup retry succeeds within budget)** | **ADD** | Given `DATABASE_URL` set and `checkConnection()` rejects then resolves within the attempt budget, `checkConnectionWithRetry(...)` resolves and exactly one `info` "database reachable" line is logged; server boot was never blocked. |
| **New AC proposed — AC-RETRY-2 (startup retry exhausts)** | **ADD** | Given `checkConnection()` rejects on all N attempts, `checkConnectionWithRetry(...)` settles (resolves — non-fatal) after exactly one `warn` "not reachable after N attempts" line; server boot was never blocked. |
| **New AC proposed — AC-POOLERR-1 (non-fatal idle pool error)** | **ADD** | Given an initialized pool, emitting an `'error'` event on the mocked pool logs one `error` line and does NOT crash the process (no unhandled-error throw). |
| Decision 2 (compose), Decision 3 (env reconciliation), AC-COMPOSE-1/2, AC-ENVFILE-1, AC-MODULE-1/2/6/7, AC-SHUTDOWN-1, AC-NOCONSOLELOG-1 | **KEEP (out of creative scope)** | No change. |

---

## Test Impact

Tests stay deterministic with `pg` fully mocked (`jest.mock('pg')`, `jest.resetModules()` + re-`require`), Jest **fake timers** for backoff, and `jest.spyOn(process.stdout, 'write')` for log-line assertions (pino writes through `process.stdout` per the learned testing rule).

**Determinism mechanics for the retry helper:**
- Use `jest.useFakeTimers()`; drive backoff with `await jest.advanceTimersByTimeAsync(...)` (async variant so awaited promises between timers settle). No real delays — suite stays fast.
- Pass a small policy via the helper's optional argument (e.g., `{ attempts: 3, baseDelay: 10, maxDelay: 20 }`) so tests don't depend on production constants and total simulated time is tiny.
- Mock `pool.connect` to reject then resolve (sequence via `mockRejectedValueOnce(...).mockResolvedValueOnce({ release })`) for retry-then-succeed; reject on every call for exhaustion.
- For AC-POOLERR-1, capture the registered `'error'` handler from the mocked pool's `on` mock and invoke it directly; assert one `error` log line and that no exception propagates.

**Test count update (revises the provisional 9–11):**

| Phase | Tests | Notes |
|-------|-------|-------|
| Phase 1 — `pool.ts` | 7–9 (unchanged AC-MODULE-1..7) **+ 2–3 new** (AC-RETRY-1, AC-RETRY-2, AC-POOLERR-1) | retry + pool-error tests added here; `checkConnectionWithRetry` and the `'error'` handler are pool-module behavior |
| Phase 2 — compose/env | 0 automated | manual smoke + inspection (unchanged) |
| Phase 3 — `index.ts` wiring | 2 (AC-WARN-1 stdout-spy; AC-SHUTDOWN-1 inspection-backed on Windows) | startup-warn + shutdown ordering (unchanged) |
| **Revised total** | **~10–12** | up from 9–11 by the 2–3 resilience tests |

---

## Implementation Guidelines

1. In `pool.ts`, after creating the `pg.Pool`, immediately `pool.on('error', (err) => logger.error({ err }, 'idle pg client error (non-fatal)'))`. Do this in the same lazy-init block as the `info` "pool initialized" line.
2. Keep `checkConnection()` exactly as specced (acquire → `release()` → resolve / reject). Do not add retry inside it.
3. Add `export async function checkConnectionWithRetry(opts?: { attempts?: number; baseDelay?: number; maxDelay?: number }): Promise<void>` that loops `checkConnection()` with capped exponential backoff, swallowing per-attempt rejections to drive the next attempt, and resolves non-fatally on exhaustion (it must not reject — the caller in `index.ts` does not `await` it and a rejection would be an unhandled promise rejection). It performs no logging itself beyond what its caller does; success/exhaustion logging happens in `index.ts` via `lifecycleLog` so lines carry `traceId`. (Alternatively the helper may accept a small logger-free result and let `index.ts` log — keep `pool.ts` logger-argument-free either way; the cleanest split is: helper returns/throws-free signals success via resolve, and `index.ts` wraps the call to log. If the helper logs the `info`/`warn` itself it must use the bare `logger`, accepting that those two lines then lack `traceId`. **Preferred:** `index.ts` does the success/exhaustion logging so the lines carry `traceId`.)
4. Backoff timers MUST be created with `setTimeout(...).unref()` (or `await` a `setTimeout`-based delay that is unref'd) so they never keep the process alive and don't interfere with graceful shutdown.
5. In `index.ts`, after `server.listen()` resolves: if `config.databaseUrl` is unset → `lifecycleLog.warn(...)` (AC-WARN-1, unchanged). If set → fire-and-log: call `checkConnectionWithRetry()` (not awaited) and `.then(() => lifecycleLog.info('database reachable')).catch(...)` — but since the helper never rejects, use `.then()` for success and rely on the helper's exhaustion path; the simplest shape is to have `index.ts` call the helper and log `info` on resolve, with the helper internally distinguishing "reached" vs "exhausted" by returning a boolean or by `index.ts` calling `checkConnection()` once more — choose the minimal form during build that yields exactly one `info` OR one `warn`. Do NOT `await` it before/around `server.listen()`.
6. In `gracefulShutdown()`'s `server.close()` callback, make the callback `async` (or chain) and `await closePool()` after `clearTimeout(forceExit)` and before `process.exit(0)`; log `info` "pool closed during shutdown" via `lifecycleLog`. (Decision 4 wiring, unchanged.)
7. Never log the `DATABASE_URL` value. Log only the set/unset state and pino-serialized `err` objects (no credentials).
8. Keep retry constants module-local in `pool.ts`; expose override only through the helper's optional argument for tests.

---

## Validation Checklist

- [x] Meets all system requirements (lazy module, readiness probe, compose-warm-up resilience)
- [x] Respects technical constraints (non-blocking boot, single config source, pino-only logging, unchanged export surface, fake-timer testability, leanness)
- [x] Addresses non-functional requirements (< 30s cold-start unaffected; best-effort availability honored; no steady-state latency added)
- [x] Technically feasible with current constraints (pure `pg` + existing logger; no new deps; no new env vars)
- [x] Risks identified and acceptable (see below)
- [x] Complies with Guiding Principles in systemPatterns.md (1 config-source, 2 observability-first, 3 structured-logging-no-console, 4 complexity-earns-keep, 5 no-internal-error-leak — DB errors go to logs, never to a client here)
- [x] Respects established patterns (lazy module mirrors single-config-source; `index.ts` retains sole side-effect ownership; lifecycle logs via `lifecycleLog`)
- [x] Observability architecture defined (log line table; traceId routing; no DSN/secret logging)
- [x] Trace context propagation across boundaries (process-level via rootTraceId; future request-scoped via `req.log` needs no pool change)
- [x] Logging strategy consistent with observability-requirements.md (structured JSON, levels, never-log secrets, error recording via serialized `err`)
- [x] Metrics strategy follows conventions (deferred, consistent with project-wide deferral)

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Unhandled `pg.Pool` `'error'` event crashes the process on an idle-client failure | Medium | High | Attach a non-fatal `pool.on('error', …)` handler at init (core of the decision) — closes a gap the spec was silent on |
| Background retry promise rejects and surfaces as an unhandled promise rejection | Low | Medium | `checkConnectionWithRetry` is non-rejecting (resolves on exhaustion); `index.ts` does not `await` it and attaches a `.catch` defensively |
| Backoff timers keep the event loop alive or fight graceful shutdown | Low | Medium | All delay timers `unref`'d; attempt count and max delay bounded (~3.75s total) — well inside the shutdown window |
| Retry constants tempt creep toward env-driven config (violating single-config-source) | Low | Low | Keep constants module-local with a test-only override argument; document the graduation path to `env.ts` if ever needed |
| Logging the DSN leaks the DB password | Low | High | Log only set/unset state and pino-serialized `err`; never log `config.databaseUrl` |
| Fake-timer retry tests become flaky | Low | Medium | Use `advanceTimersByTimeAsync`, tiny injected delays, and deterministic `mockResolvedValueOnce`/`mockRejectedValueOnce` sequences |

---

## Next Steps

1. **Build Phase 1** (`src/db/pool.ts`): implement lazy `getPool()` (+ `pool.on('error')` handler + `info` init line), `closePool()`, `checkConnection()`, and `checkConnectionWithRetry()` with module-local `unref`'d backoff constants; add `pg` + `@types/pg`. Write `src/db/pool.test.ts` (AC-MODULE-1..7 + AC-RETRY-1/2 + AC-POOLERR-1) with `pg` mocked and fake timers.
2. **Build Phase 2** (compose + env): unchanged from spec (`docker-compose.yml`, `.env`, `.env.example`, `.gitignore`).
3. **Build Phase 3** (`src/index.ts` wiring): startup `warn` when unset (AC-WARN-1); non-blocking `checkConnectionWithRetry()` after listen with single `info`/`warn` outcome via `lifecycleLog`; `await closePool()` in the `server.close()` callback before `process.exit(0)` (AC-SHUTDOWN-1).
4. **Update `tasks/TASK-002.md`**: mark the creative phase complete; fold the revised Decision 4 + new ACs (AC-RETRY-1/2, AC-POOLERR-1) and revised test count (~10–12) into the spec before `/banyan-build`.
