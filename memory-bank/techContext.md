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
- **PostgreSQL**: stub this phase. `DATABASE_URL` is configurable via env but NOT connected; pg client added by a downstream DB task.

### API & Communication
- **REST API**: Express-based. `/health` probe and `/api/v1` router scaffold land in Phase 3 (app composition phase). No endpoints wired in Phase 1.

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
Only env-layer config exists in Phase 1. The logger (`pino`) and tracing (`@opentelemetry/api` manual W3C extraction) are **scaffolded in Phase 2**; the request-logging middleware and `initTracing()` seam follow. Observability deps present in `package.json` this phase: `@opentelemetry/api` (`^1.9.0`), `pino` (`^9.5.0`), `pino-pretty` (dev). The OTLP exporter and full `@opentelemetry/sdk-node` are intentionally NOT installed (future task).

See `memory-bank/creative/TASK-001-express-api-architecture.md` § Observability Architecture for the full logging/tracing design.

## Development Commands

| Command | Purpose |
|---------|---------|
| `npm install` | Install dependencies |
| `npm run build` | Compile TypeScript to `dist/` via `tsc` |
| `npm run dev` | Run with hot reload (`tsx watch src/index.ts`) |
| `npm start` | Run the compiled server (`node dist/index.js`) |
| `npm test` | Run the Jest test suite |
| `npm run test:watch` | Run Jest in watch mode |

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
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Collector endpoint (stub — no exporter built this phase) | — |
| `OTEL_TRACES_SAMPLER_ARG` | Sampling ratio (reserved for future SDK wiring) | `1.0` |
| `DATABASE_URL` | PostgreSQL DSN (stub — configurable, NOT connected) | — |

> Note: `.env.example` documenting these vars could not be created automatically (blocked by an `Edit(.env.*)` deny rule) — flagged for manual creation.

## Component Structure

[Seeded in `systemPatterns.md` § Architecture Overview. Source tree to expand as Phases 2–4 add `src/observability`, `src/middleware`, `src/routes`, `src/app.ts`, and `src/index.ts`.]

## External Services

[None this phase. PostgreSQL and OTLP collector are stubs — configurable but not connected.]

## Last Refreshed

2026-06-16
