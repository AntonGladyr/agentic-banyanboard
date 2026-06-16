# System Patterns

> Baseline patterns seeded in Phase 1 of TASK-001 (greenfield). Decisions are authoritative from `memory-bank/creative/TASK-001-express-api-architecture.md`. Some patterns are only partially realized in Phase 1 (config layer only); forward references mark what later phases complete.

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
├── index.ts          # process entry: initTracing(), listen, SIGTERM/SIGINT   [Phase 3]
├── app.ts            # createApp(): pure Express factory, no listen/side effects [Phase 3]
├── config/
│   └── env.ts        # typed, validated, frozen single config source           [Phase 1 ✓]
├── observability/
│   ├── logger.ts     # pino wrapper; child({traceId, spanId})                  [Phase 2]
│   └── tracing.ts    # extractTraceContext(), initTracing() no-op seam         [Phase 2]
├── middleware/
│   ├── requestLogger.ts  # trace ctx + JSON request log                        [Phase 2]
│   ├── notFound.ts       # JSON 404 forwarder                                  [Phase 4]
│   └── errorHandler.ts   # JSON 404/500, no stack leak                         [Phase 4]
└── routes/
    ├── index.ts      # /api/v1 router scaffold (composition root)              [Phase 3]
    └── health.ts     # GET /health                                            [Phase 3]
```

**Graduation path**: layers are grouped by technical role now. When a domain (boards/columns/cards) outgrows a thin router, colocate its service under a `src/routes/<domain>/` sub-folder rather than restructuring the tree. This is a documented convention, not structural enforcement.

## Design Patterns

### Single config source — `src/config/env.ts` [Phase 1, realized]
- **Problem**: 12-Factor config; no hard-coded settings scattered through the code.
- **Implementation**: `env.ts` is the ONLY module that reads `process.env`. It parses/validates at module-evaluation time, applies documented defaults, and exports a frozen typed `config: AppConfig` object (`Object.freeze`). Invalid values (e.g. a non-integer or out-of-range `PORT`) throw synchronously → fail-fast at startup.
- **Enforced by**: `noUncheckedIndexedAccess` makes every `process.env[...]` access `string | undefined`, forcing explicit defaulting/validation. Defaults table lives in `techContext.md` § Configuration Variables.
- **Reference**: `src/config/env.ts`

### App factory split — `createApp()` vs `index.ts` [Phase 3, forward reference]
- **Problem**: testability — exercise the app via supertest without binding a port.
- **Pattern**: `src/app.ts` exports a pure `createApp(): Express` (registers middleware/routers, no `listen`, no side effects). `src/index.ts` is the only module with side effects (`listen`, signal handlers, `process.exit`).
- **Composition order** (in `createApp()`): `requestLogger` → `/health` → `/api/v1` → `notFound` → `errorHandler` (4-arg, last).

## Error Handling Conventions

[Forward reference — realized in Phase 4.] All responses are JSON, never Express default HTML. A terminal `notFound` middleware emits JSON 404; a 4-arg `errorHandler` (registered last) maps errors to `{error, traceId}`, logs via the logger (`warn` for 4xx, `error` + stack for 5xx), and never leaks stack traces to the client. The process stays alive.

## Observability Conventions

- **Structured JSON logging** through the `pino` wrapper in `src/observability/logger.ts` — never `console.*`. Base fields: `level`, `msg`, `time` (ISO 8601), `service`, `version`, `environment`; request-scoped `child({traceId, spanId})` adds trace context. *(logger lands in Phase 2.)*
- **W3C Trace Context propagation**: `extractTraceContext()` parses the inbound `traceparent` header (`00-<32hex>-<16hex>-<2hex>`) or mints a fresh root `traceId` when absent/malformed. `initTracing()` is a documented no-op seam — the single future wiring point for `@opentelemetry/sdk-node` + OTLP export (not built this task). Depends on `@opentelemetry/api` only. *(tracing lands in Phase 2.)*
- **Env-driven verbosity/format/output** via `LOG_LEVEL`/`LOG_FORMAT`/`LOG_OUTPUT` (see `techContext.md`).

## Testing Patterns

- **Framework**: Jest + `ts-jest` (node env), `supertest` for HTTP (Decision 5).
- **Layout**: `**/*.test.ts` colocated with source under `src/`; `jest.config.js` uses `roots: src`, `testMatch: **/*.test.ts`, `clearMocks: true`, and `setupFiles: jest.setup.ts` (kept intentionally empty so it never sets env keys owned by `env.ts`).
- **Config tests** (`env.test.ts`): use the `jest.resetModules()` + `process.env` mutation pattern — mutate env, re-`require` the module, assert on the freshly evaluated `config` (works because `env.ts` parses at import time).
- **Integration tests** (forward reference, Phase 3): import `createApp()` (never `index.ts`), pass the app directly to `request(app)` so supertest manages an ephemeral server in-process — no port binding. Assert status, `content-type`, and body shape.

## API Conventions

[Forward reference — Phase 3.] REST over Express. `GET /health` → `{"status":"ok","timestamp":"<ISO8601>"}`; versioned API under `/api/v1`. All responses JSON.

## Last Refreshed

2026-06-16
