# Tech Context

## Technology Stack

### Runtime Environment
- **Node.js**: 20 LTS (pinned via `.nvmrc` = `20` and `package.json` `engines.node >=20`)
- **Package Manager**: npm
- **Module system**: CommonJS output via TypeScript `module`/`moduleResolution: NodeNext` (no `"type":"module"`; kept CJS to minimize ESM friction with `ts-jest`/tooling)

### Languages & Frameworks
- **TypeScript**: 5.x — strict mode + targeted high-value flags (see tsconfig below); `target`/`lib` ES2022
- **Express**: 4 (`^4.21.2`) — HTTP API framework (app factory + routes scaffolded in later phases)

### Data Layer
- **PostgreSQL**: connection layer landed in TASK-002 Phase 1. `pg` (`^8.21.0`) + `@types/pg` (dev) added. `src/db/pool.ts` is a lazily-initialized singleton `pg.Pool` module exporting `getPool()`, `closePool()`, `checkConnection()`, and `checkConnectionWithRetry()` (bounded non-blocking startup retry with capped exponential backoff + a non-fatal `pool.on('error')` handler — see `creative/TASK-002-connection-resilience.md`, Option 2). Config is read only via `config.databaseUrl` (single config source); the DSN/password is never logged. **Not yet wired into `src/index.ts`** (lifecycle wiring is TASK-002 Phase 3) and no compose/`.env` files yet (Phase 2).

- **Schema migrations**: `node-pg-migrate` (`^7.9.1`) is the canonical schema-evolution tool as of FEAT-005 (TASK-004 Phase 1). Migrations are versioned JS files in `migrations/` (CommonJS, outside `src/` so the TS build does not touch them), applied via npm scripts driven by `DATABASE_URL` (12-Factor — no hardcoded DSN). The runner tracks applied migrations in a `pgmigrations` table. First migration creates the `boards` table (`id`, `name`, `description`, `created_at`, `updated_at`). ORM remains out of scope (raw parameterized `pg` queries).

### API & Communication
- **REST API**: Express-based; all responses JSON (including errors — never Express default HTML). Realized endpoints (Phase 3):
  - `GET /health` → liveness + PostgreSQL readiness probe (FEAT-003): 200 `{status:"ok", db:"ok", timestamp}` when reachable, 503 `{status:"error", db:"error", timestamp}` when unreachable, 200 `{status:"ok", db:"unconfigured", timestamp}` when `DATABASE_URL` is unset. Readiness via `checkConnection()`; DB errors logged server-side only.
  - `GET /api/v1` → 200 JSON scaffold root (`{api, status}`); domain routers mount under `/api/v1` as added
  - `/api/v1/boards` → Board CRUD (FEAT-005 / TASK-004): `POST` create→201, `GET` list→200 (`[]` when empty), `GET /:id` read→200/404, `PATCH /:id` update→200/404/400, `DELETE /:id`→204/404. Input validated before any DB call (name required/≤255, `:id` positive integer, PATCH ≥1 field); `express.json()` is scoped to the boards router. Persistence via the `boards` table (`src/db/boards.ts`, parameterized) created by the Phase-1 migration.
- **Error responses** (Phase 4, realized): centralized terminal middleware returns JSON with a generic label + `traceId` for client correlation (no internal detail leaked):
  - Unmatched route → `404 {error:'Not Found', path, traceId}`
  - Carried 4xx client error → that status with `{error:<fixed label>, path, traceId}`
  - Any other thrown/unhandled error → `500 {error:'Internal Server Error', traceId}`
  - See `systemPatterns.md` § Error Handling Conventions for the pattern (status mapping, 4xx→warn/5xx→error logging, no stack leak).

### Development Tools
- **Build**: `tsc` (TypeScript compiler); `outDir: dist`, `rootDir: src`, `sourceMap: true`, test files excluded from the production build
- **Dev runner**: `tsx` (watch mode)
- **Testing**: Jest 29 + `ts-jest` 29 (TS transpilation in-test) + `supertest` 7 (in-process HTTP assertions against the `createApp()` factory)

### TypeScript Configuration (`tsconfig.json`)
Strict baseline plus targeted flags (Decision 4 in the creative doc):
- `strict: true`, `noUncheckedIndexedAccess` (forces `process.env[...]` to be treated as `string | undefined` — enforces the single-config-source validation discipline)
- `noImplicitOverride`, `noFallthroughCasesInSwitch`, `noUnusedLocals`, `noUnusedParameters`, `forceConsistentCasingInFileNames`
- `isolatedModules: true` (required by `ts-jest`)
- `exactOptionalPropertyTypes` deliberately deferred (clashes with Express/optional-config types; revisit only if a real bug appears)

### Observability
The logger (`pino`) and tracing (`@opentelemetry/api` manual W3C extraction) are **IMPLEMENTED as of Phase 2**, along with the request-logging middleware and the `initTracing()` no-op seam:

- **Logging** — `pino` writes newline-delimited JSON to `process.stdout`, level driven by `config.logLevel`. JSON-to-stdout is the only sink wired this phase; pretty-print and file sinks are **deferred** (`LOG_FORMAT`/`LOG_OUTPUT`/`LOG_FILE_PATH` are accepted as config but not yet acted on). `pino-pretty` remains a dev dependency only.
- **Tracing** — `@opentelemetry/api` only; W3C `traceparent` extraction is hand-rolled with a CSPRNG fresh-id fallback. The OTLP exporter and full `@opentelemetry/sdk-node` are intentionally NOT installed; `initTracing()` is the documented future wiring point.
- **Metrics** — deferred (no endpoint or instrumentation this task).

Observability deps in `package.json`: `@opentelemetry/api` (`^1.9.0`), `pino` (`^9.5.0`), `pino-pretty` (dev).

See `systemPatterns.md` § Observability Conventions for the logger/tracing/middleware patterns, and `memory-bank/creative/TASK-001-express-api-architecture.md` § Observability Architecture for the authoritative design.

See `memory-bank/creative/TASK-001-express-api-architecture.md` § Observability Architecture for the full logging/tracing design.

## Development Commands

| Command | Purpose |
|---------|---------|
| `npm install` | Install dependencies |
| `npm run build` | Compile TypeScript to `dist/` via `tsc` |
| `npm run dev` | Boot a real server with hot reload (`tsx watch src/index.ts`); listens on `config.port`, graceful SIGTERM/SIGINT shutdown |
| `npm start` | Run the compiled server (`node dist/index.js`); entry `src/index.ts`, graceful shutdown |
| `npm test` | Run the Jest test suite |
| `npm run test:watch` | Run Jest in watch mode |
| `npm run migrate` | Apply pending DB migrations (`node-pg-migrate up`); reads `DATABASE_URL` |
| `npm run migrate:down` | Revert the most recent migration (`node-pg-migrate down`) |
| `npm run migrate:create -- <name>` | Scaffold a new timestamped JS migration in `migrations/` |

## Configuration Variables

All env vars are read and validated exclusively in `src/config/env.ts`; invalid values fail fast at startup.

| Variable | Purpose | Default |
|----------|---------|---------|
| `PORT` | HTTP listen port (validated: positive integer 1–65535) | `3000` |
| `NODE_ENV` | Deployment environment | `development` |
| `LOG_LEVEL` | Log verbosity (`trace`/`debug`/`info`/`warn`/`error`/`fatal`) | `info` |
| `LOG_FORMAT` | Output format (`json`/`text`) | `json` |
| `LOG_OUTPUT` | Destination (`stdout`/`file`/`both`) | `stdout` |
| `LOG_FILE_PATH` | File sink path (required when output includes file) | — |
| `OTEL_SERVICE_NAME` | Service identifier (logger `service` field) | `banyanboard-api` |
| `npm_package_version` | Service version (logger `version` field; exposed as `config.serviceVersion`, sourced from the `npm_package_version` env var npm sets at runtime) | `0.0.0` |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Collector endpoint (stub — no exporter built this phase) | — |
| `OTEL_TRACES_SAMPLER_ARG` | Sampling ratio (reserved for future SDK wiring) | `1.0` |
| `DATABASE_URL` | PostgreSQL DSN (stub — configurable, NOT connected) | — |

> Note: `.env.example` documenting these vars could not be created automatically (blocked by an `Edit(.env.*)` deny rule) — flagged for manual creation.

## Component Structure

[Seeded in `systemPatterns.md` § Architecture Overview. Phase 2 added `src/observability/` (logger, tracing), `src/middleware/requestLogger.ts`, and `src/types/express.d.ts`. Phase 3 added `src/app.ts` (`createApp()` factory), `src/index.ts` (process entry + graceful shutdown), and `src/routes/` (`health.ts`, `index.ts`). Phase 4 added `src/middleware/notFound.ts` and `src/middleware/errorHandler.ts` (centralized JSON error handling). **The BanyanBoard API foundation — config, observability, app composition, health, and error handling — is now COMPLETE (all 4 phases of TASK-001).** Downstream CRUD domain routers (boards/columns/cards) will extend the `/api/v1` tree on top of this foundation.]

## External Services

[None this phase. PostgreSQL and OTLP collector are stubs — configurable but not connected.]

## Last Refreshed

2026-06-16
