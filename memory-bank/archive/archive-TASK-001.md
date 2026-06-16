# Archive: Express API with TypeScript (BanyanBoard Backend Foundation)

## Metadata
- Task ID: TASK-001
- Complexity: Level 3 (inherited from FEAT-001)
- Started: 2026-06-16
- Completed: 2026-06-16
- Roadmap Link: FEAT-001 (v0.1.0 — Foundation)
- Branch: feature/FEAT-001-express-api-typescript
- Final Commit (pre-archive): 644e764

## Summary

Foundation milestone establishing the TypeScript + Express backend service for BanyanBoard,
the self-hosted kanban backend. This task scaffolded the architectural base that all downstream
features (boards, columns, cards CRUD) will build on: a layered Express app with 12-Factor
configuration, baseline OpenTelemetry-style structured observability, a verifiable health slice,
and centralized JSON error handling. PostgreSQL and full OTLP export were intentionally left as
configurable stubs (out of scope for the scaffold).

Delivered in one Architecture creative phase (5 decisions) + 4 sequential BUILD phases, all
complete. Final state: 18/18 tests pass, clean `tsc` build, all 8 acceptance criteria satisfied
(AC-ERROR-3 by code inspection only — see Follow-up).

## Requirements

### Original Requirements
- Project scaffolding: `tsconfig.json` (strict), build/dev/start scripts, `package.json` deps
- Express server bootstrap with a layered structure (app factory, routing, middleware)
- 12-Factor configuration via environment variables (single config source)
- Baseline observability: structured JSON logging with trace context, request logging, error logging
- Health-check endpoint (`GET /health`) and `/api/v1` router scaffold
- Centralized error-handling middleware + graceful SIGTERM shutdown

### Success Criteria
- [✓] AC-ENTRY-1 — `npm run dev` starts with a structured JSON startup log (live smoke)
- [✓] AC-HAPPY-1 — `GET /health` → 200 JSON `{status,timestamp}` with request log (live + test)
- [✓] AC-HAPPY-2 — `/api/v1` always returns JSON (live + test)
- [✓] AC-ERROR-1 — Unknown routes → JSON 404 with `traceId` (live + test)
- [✓] AC-ERROR-2 — Thrown errors → JSON 500, no stack leak, server stays alive (tests, dual-asserted)
- [~] AC-ERROR-3 — SIGTERM → graceful shutdown, exit 0 within 5s (inspection only on Windows host)
- [✓] AC-VERIFY-1 — `npm run build` exits 0, `dist/` populated, source maps present
- [✓] AC-VERIFY-2 — All config from env vars, no hard-coded values outside `env.ts`

## Implementation

### Approach
Built in 4 independently-verifiable phases, each producing a clean `tsc` build and a passing test
batch, gated by human review between phases (appropriate given hard inter-phase dependencies).
The Architecture creative phase front-loaded the five LOW/MEDIUM design decisions with concrete
code snippets (tsconfig, supertest pattern, pino config mapping), which all four build phases
consumed directly — zero mid-phase reversals resulted.

### Key Components
1. **Configuration** (`src/config/env.ts`)
   - Purpose: Single, typed, fail-fast source of all env access; sole `process.env` reader.
   - Files: `src/config/env.ts`, `src/config/env.test.ts`

2. **Observability** (`src/observability/`)
   - Purpose: pino structured-JSON logger (base fields + per-request `child({traceId,spanId})`);
     manual W3C `traceparent` extraction with a no-op `initTracing()` seam for future SDK wiring.
   - Files: `src/observability/logger.ts`, `src/observability/tracing.ts`,
     `src/middleware/requestLogger.ts`, `src/types/express.d.ts` (+ logger/tracing tests)

3. **App composition & lifecycle** (`src/app.ts`, `src/index.ts`)
   - Purpose: Pure `createApp(): Express` factory (supertest-injectable, no listen) and the process
     entry (bind server, structured startup log, SIGTERM/SIGINT graceful shutdown with 5s force-exit
     timer + double-invocation guard, root-traceId lifecycle logs).
   - Files: `src/app.ts`, `src/index.ts`

4. **Routes** (`src/routes/`)
   - Purpose: `GET /health` handler and the `/api/v1` router scaffold (registered, JSON stub root).
   - Files: `src/routes/health.ts`, `src/routes/index.ts` (+ health/api tests)

5. **Error handling** (`src/middleware/`)
   - Purpose: Terminal JSON 404 (`notFound`) and centralized 4-arg error handler (4xx→warn /
     5xx→error; `unknown`-typed err narrowed via `ErrorLike`; no stack/message leak; `headersSent`
     guard; process stays alive).
   - Files: `src/middleware/notFound.ts`, `src/middleware/errorHandler.ts` (+ tests)

### Design Decisions (Creative Phase)
1. Layer structure → **flat technical layers** with a documented graduation path to per-domain folders
2. Logger library → **pino**, wrapped behind `src/observability/logger.ts`
3. OTel SDK depth → **minimal manual W3C extraction** (`@opentelemetry/api` only) behind a no-op `initTracing()` seam
4. tsconfig → **`strict: true` + targeted flags** (`noUncheckedIndexedAccess` et al.); `exactOptionalPropertyTypes` deferred
5. Test framework → **Jest + `ts-jest`** with `supertest` against `createApp()`

Reference: `memory-bank/creative/TASK-001-express-api-architecture.md`

## Testing
- Unit tests: env config (4), logger (3), tracing (4) — added
- Integration tests: health/`/api/v1` (3 supertest), notFound + errorHandler (4) — added
- Total: 18 tests across 4 suites
- All tests passing: ✅ (18/18, clean `tsc` build)

## Files Changed
Scaffolding/config: `package.json`, `tsconfig.json`, `jest.config.js`, `jest.setup.ts`, `.nvmrc`
Source: `src/config/env.ts`, `src/observability/{logger,tracing}.ts`,
`src/middleware/{requestLogger,notFound,errorHandler}.ts`, `src/app.ts`, `src/index.ts`,
`src/routes/{health,index}.ts`, `src/types/express.d.ts`
Tests: `src/config/env.test.ts`, `src/observability/{logger,tracing}.test.ts`,
`src/routes/{health,api}.test.ts`, `src/middleware/{notFound,errorHandler}.test.ts`
Memory bank: `systemPatterns.md`, `techContext.md`, `projectbrief.md` (SEC-DEBT-1), `progress.md`,
`tasks.md`, `tasks/TASK-001.md`, reflection + 4 learned-rule files + learning log/metrics

## Lessons Learned
- Architecture-first creative phase had the highest ROI of any phase on this greenfield foundation —
  concrete code snippets eliminated per-phase research and produced zero mid-phase reversals.
- `noUncheckedIndexedAccess` structurally enforced the single-config-source invariant at the type level.
- The `errorHandler.ts` security boundary (no stack/message leak, dual-asserted) is production-grade.
- pino test capture requires writing through `process.stdout` explicitly (a non-obvious impl detail).
- Verify signal-handler behavior on the target OS (Linux/Docker) — Windows cannot deliver SIGTERM.

Reference: `memory-bank/reflection/reflection-TASK-001.md`

## References
- Reflection: `memory-bank/reflection/reflection-TASK-001.md`
- Creative: `memory-bank/creative/TASK-001-express-api-architecture.md`
- Progress: `memory-bank/progress.md`
- System patterns: `memory-bank/systemPatterns.md`
- Tech context: `memory-bank/techContext.md`

## Follow-up
- **`.env.example` (MUST)** — Never created; blocked by the `Edit(.env.*)` deny rule across all 4
  phases. Developers cloning the repo have no documented env-var reference. Requires manual creation
  or a whitelist exception for the `.example` template.
- **AC-ERROR-3 Linux/Docker SIGTERM smoke (RECOMMENDED)** — Run `npm start` in a Linux container,
  `kill -TERM <PID>`, assert exit code 0 + structured shutdown log to close the inspection-only gap.
- **SEC-DEBT-1 (LOW)** — Dev-only `js-yaml` advisory (GHSA-h67p-54hq-rp68) via the Jest toolchain;
  tracked in `projectbrief.md`. Needs a deliberate jest/ts-jest toolchain-bump task.
- **`LOG_FORMAT=text` / `LOG_OUTPUT=file|both` (DEFERRED)** — Config keys validated but not wired
  (only JSON-to-stdout is active).
- **ESLint `no-console` rule (FUTURE)** — `console.*` prohibition currently enforced by review only;
  machine-enforce in a later lint task.
