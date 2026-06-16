# System Patterns

> Baseline patterns seeded in Phase 1 of TASK-001 (greenfield). Decisions are authoritative from `memory-bank/creative/TASK-001-express-api-architecture.md`. As of Phase 3 the app-composition layer (`createApp()`, `index.ts`, `/health`, `/api/v1`) is realized; the error-handling layer (`notFound` + `errorHandler`, JSON 404/500) remains a forward reference for Phase 4.

## Guiding Principles

| # | Principle | Source |
|---|-----------|--------|
| 1 | **Config in environment** — all behavior via env vars; fail-fast validation at startup; no hard-coded ports/levels/names outside `env.ts` defaults | 12-Factor / CLAUDE.md |
| 2 | **Observability-first** — OpenTelemetry-aligned, W3C Trace Context propagation, every log line carries `traceId` | CLAUDE.md (BLOCKING) |
| 3 | **Structured logging via a reusable abstraction** — JSON logs through a single logger wrapper; never `console.*` in production code | CLAUDE.md (BLOCKING) |
| 4 | **Clean architecture, complexity only when it earns its keep** — prefer the simplest layout that supports growth without over-engineering the MVP | productBrief |

## Architecture Overview

Single Express + TypeScript backend process (no microservices for the MVP; 1–20 users, single host, `docker compose up`). **Flat technical layers** with a documented graduation path (Decision 1).

```
src/
├── index.ts          # process entry: initTracing(), listen, SIGTERM/SIGINT   [Phase 3 ✓]
├── app.ts            # createApp(): pure Express factory, no listen/side effects [Phase 3 ✓]
├── config/
│   └── env.ts        # typed, validated, frozen single config source           [Phase 1 ✓]
├── observability/
│   ├── logger.ts     # pino JSON→stdout; child({traceId, spanId})             [Phase 2 ✓]
│   └── tracing.ts    # extractTraceContext(), initTracing() no-op seam         [Phase 2 ✓]
├── middleware/
│   ├── requestLogger.ts  # trace ctx + one JSON access-log line on res.finish  [Phase 2 ✓]
│   ├── notFound.ts       # JSON 404 forwarder                                  [Phase 4]
│   └── errorHandler.ts   # JSON 404/500, no stack leak                         [Phase 4]
├── types/
│   └── express.d.ts  # Express.Request augmentation: log, traceId              [Phase 2 ✓]
└── routes/
    ├── index.ts      # /api/v1 router scaffold (composition root)              [Phase 3 ✓]
    └── health.ts     # GET /health                                            [Phase 3 ✓]
```

**Graduation path**: layers are grouped by technical role now. When a domain (boards/columns/cards) outgrows a thin router, colocate its service under a `src/routes/<domain>/` sub-folder rather than restructuring the tree. This is a documented convention, not structural enforcement.

## Design Patterns

### Single config source — `src/config/env.ts` [Phase 1, realized]
- **Problem**: 12-Factor config; no hard-coded settings scattered through the code.
- **Implementation**: `env.ts` is the ONLY module that reads `process.env`. It parses/validates at module-evaluation time, applies documented defaults, and exports a frozen typed `config: AppConfig` object (`Object.freeze`). Invalid values (e.g. a non-integer or out-of-range `PORT`) throw synchronously → fail-fast at startup.
- **Enforced by**: `noUncheckedIndexedAccess` makes every `process.env[...]` access `string | undefined`, forcing explicit defaulting/validation. Defaults table lives in `techContext.md` § Configuration Variables.
- **Reference**: `src/config/env.ts`

### App factory split — `createApp()` vs `index.ts` [Phase 3, realized]
- **Problem**: testability — exercise the app via supertest without binding a port.
- **Pattern**: `src/app.ts` exports a pure `createApp(): Express` (registers middleware/routers, no `listen`, no side effects), so tests pass the app straight to `request(app)`. `src/index.ts` is the only module with side effects (`listen`, signal handlers, `process.exit`).
- **Composition order** (in `createApp()`): `requestLogger` (first, so all downstream handlers inherit `req.log`/`req.traceId`) → `/health` router → `/api/v1` router → **[`notFound` + 4-arg `errorHandler` appended last in Phase 4]**. The order is fixed; Phase 4 only appends the two terminal middlewares — earlier registrations do not move.
- **Reference**: `src/app.ts`, `src/routes/health.ts`, `src/routes/index.ts`

### Process-entry pattern — `src/index.ts` [Phase 3, realized]
- **Problem**: isolate all process-level side effects in one module so the app stays pure and testable.
- **Pattern**: `index.ts` is the sole module that touches the process. It runs `initTracing()` → `createApp()` → `app.listen(config.port)` and emits a structured "Server listening" startup log. Graceful shutdown on `SIGTERM`/`SIGINT`: log a JSON shutdown line → `server.close()` → `exit 0`, guarded by a 5s force-exit safety timer (covers hung connections) and a double-invocation guard (a second signal during shutdown is ignored).
- **Root traceId for lifecycle logs**: `index.ts` mints a root traceId via `extractTraceContext({})` and routes every lifecycle line (startup/shutdown) through `logger.child({ traceId })`, so EVERY stdout line — request-scoped or process-level — carries a `traceId` (upholds Guiding Principle 2).
- **Note**: signal-driven shutdown is untestable on Windows (no real signal delivery); verified by inspection and relied upon under Linux/Docker.
- **Reference**: `src/index.ts`

### Request augmentation — `req.log` / `req.traceId` [Phase 2, realized]
- **Problem**: every handler needs trace-correlated logging without threading a logger through call signatures.
- **Pattern**: a global `Express.Request` augmentation in `src/types/express.d.ts` adds `log: Logger` and `traceId: string`. `requestLogger` populates both per request, so downstream handlers log via `req.log` and inherit the request's trace context for free.
- **Reference**: `src/types/express.d.ts`, `src/middleware/requestLogger.ts`

## Error Handling Conventions

[Forward reference — realized in Phase 4.] All responses are JSON, never Express default HTML. A terminal `notFound` middleware emits JSON 404; a 4-arg `errorHandler` (registered last) maps errors to `{error, traceId}`, logs via the logger (`warn` for 4xx, `error` + stack for 5xx), and never leaks stack traces to the client. The process stays alive.

## Observability Conventions

- **Structured JSON logging** through the `pino` wrapper in `src/observability/logger.ts` [Phase 2, realized] — never `console.*`. Configured from the single `config` object: `level = config.logLevel`, base fields `service` (otelServiceName), `environment` (nodeEnv), `version` (serviceVersion); pino supplies `level`, `msg`, `time`. Writes newline-delimited JSON to `process.stdout`. Request-scoped logging via `.child({ traceId, spanId })` binds trace context to every line. *Pretty-print and file sinks are intentionally NOT wired this phase (JSON-to-stdout only); `LOG_FORMAT`/`LOG_OUTPUT`/`LOG_FILE_PATH` remain config-only knobs reserved for a later phase.*
- **W3C Trace Context propagation** in `src/observability/tracing.ts` [Phase 2, realized]: `extractTraceContext(headers)` performs a manual parse of the inbound `traceparent` header (`00-<32hex>-<16hex>-<2hex>`, rejecting all-zero trace/span ids) and mints a fresh CSPRNG (`crypto.randomBytes`) root id pair when the header is absent or malformed. It never throws. Depends on `@opentelemetry/api` only — no `@opentelemetry/sdk-node`.
- **`initTracing()` no-op seam** [Phase 2, realized]: a documented no-op that establishes the single future wiring point for `@opentelemetry/sdk-node` + OTLP export. Realizing it does not change current behavior — it makes the extension point explicit so SDK adoption is an additive change at one site.
- **Request-logging middleware contract** — `src/middleware/requestLogger.ts` [Phase 2, realized]: derives trace context via `extractTraceContext`, attaches `req.log` (a child logger bound to the request's `traceId`/`spanId`) and `req.traceId`, times the request with `process.hrtime.bigint()`, and emits exactly ONE JSON access-log line on `res.finish` with `method`, `path`, `statusCode`, `durationMs`. Registered FIRST in `createApp()` (Phase 3, realized) so all downstream handlers inherit `req.log`/`req.traceId`.
- **Metrics**: deferred — no metrics endpoint or instrumentation this task.

## Testing Patterns

- **Framework**: Jest + `ts-jest` (node env), `supertest` for HTTP (Decision 5).
- **Layout**: `**/*.test.ts` colocated with source under `src/`; `jest.config.js` uses `roots: src`, `testMatch: **/*.test.ts`, `clearMocks: true`, and `setupFiles: jest.setup.ts` (kept intentionally empty so it never sets env keys owned by `env.ts`).
- **Config tests** (`env.test.ts`): use the `jest.resetModules()` + `process.env` mutation pattern — mutate env, re-`require` the module, assert on the freshly evaluated `config` (works because `env.ts` parses at import time).
- **Integration tests** (Phase 3, realized): import `createApp()` (never `index.ts`), pass the app directly to `request(app)` so supertest manages an ephemeral server in-process — no port binding. Assert status, `content-type`, and body shape. Realized in `src/routes/health.test.ts` and `src/routes/api.test.ts`.

## API Conventions

[Phase 3, realized.] REST over Express; all responses JSON. `GET /health` → 200 `{"status":"ok","timestamp":"<ISO8601>"}`. Versioned API under `/api/v1`, mounted as its own router (`src/routes/index.ts`) with a stub `GET /` → 200 `{"api":"v1","status":"ok"}` so `/api/v1` always returns JSON. Domain routers colocate under `/api/v1` as they are added. *JSON-only error responses (404/500) are appended in Phase 4 — see § Error Handling Conventions.*

## Last Refreshed

2026-06-16
