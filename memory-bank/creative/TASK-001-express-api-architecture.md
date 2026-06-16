# Architecture Decision: Express API with TypeScript (BanyanBoard Backend Foundation)

**Created**: 2026-06-16
**Status**: DECIDED
**Decision Type**: Architecture
**Task**: TASK-001 (FEAT-001, Level 3)

## Context

This document resolves the five LOW/MEDIUM-confidence design decisions that block Phase 1
of TASK-001. It establishes the **baseline architecture** for the BanyanBoard backend — the
service foundation that all downstream board/column/card CRUD features build on. `systemPatterns.md`
and `techContext.md` are greenfield (effectively empty), so the decisions here *become* the
project's first established patterns. There are no pre-existing patterns to conform to; instead,
the guiding constraints are CLAUDE.md (12-Factor + OpenTelemetry observability, BLOCKING during
build) and the productBrief NFRs.

### System Requirements

- Scaffold an Express + TypeScript service with a clean app-composition split: `src/index.ts`
  (process entry, binds server, registers SIGTERM handler) and `src/app.ts` (pure Express app
  factory — registers middleware/routers, NO `listen`, NO side effects) so the app is testable
  via supertest without binding a port.
- Single config source: all env access flows through `src/config/env.ts` (typed, validated).
  Zero hard-coded port/log-level/service-name outside that file's defaults (AC-VERIFY-2).
- Baseline OpenTelemetry observability: structured JSON logging with `traceId`, W3C Trace Context
  extraction from `traceparent`, request-logging middleware (method, path, statusCode, durationMs,
  traceId), startup/shutdown/error logging — never `console.*`.
- A verifiable first slice: `GET /health` → `{"status":"ok","timestamp":"<ISO8601>"}` and a
  registered `/api/v1` router scaffold that always returns JSON.
- Centralized error handling: `notFound.ts` (JSON 404) + `errorHandler.ts` (JSON 500, no stack
  leak, logs via logger). All responses JSON, never Express default HTML.
- Graceful SIGTERM shutdown within 5s, exit 0, JSON shutdown log.
- Clean `tsc` build (`npm run build` exits 0, `dist/` populated with source maps) and a unit +
  integration test suite (~14 tests).

### Technical Constraints

- Greenfield project: no existing code, patterns, or stack lock-in beyond "Node.js + npm + TS".
- productBrief mandates: Express + TypeScript backend, PostgreSQL store, **no microservices**
  (single backend process for MVP), "clean architecture preferred; complexity added only when it
  earns its keep."
- Deployment target is `docker compose up` on a single host (1–20 concurrent users, flat growth).
- PostgreSQL is a **stub** this task — `DATABASE_URL` is configurable but NOT connected.
- OTLP trace export is **stubbed/no-op** this task — only local W3C trace-context propagation.
- 12-Factor config: all behavior via env vars; fail-fast validation at startup.

### Non-Functional Requirements

- **Performance**: API p95 < 150 ms reads / < 300 ms writes. No synchronous blocking calls in
  middleware. Cold start / `npm run dev` < 5 s.
- **Scalability**: 1–20 concurrent users, single process, single host. No horizontal scaling, no
  burst. Hundreds of cards per board, tens of boards.
- **Security**: No regulated data (no HIPAA/PCI/SOC2). No PII beyond user emails (auth is a later
  task). No stack-trace leakage in error responses.
- **Availability**: Best-effort, self-hosted, no SLA. Manual restart acceptable.
- **Observability**: Structured JSON logs with `traceId`; logger abstraction (never `console.*`);
  env-var-driven verbosity/format/output.

### Existing Patterns to Respect

None exist yet (greenfield). The CLAUDE.md "Guiding Principles" in force are: (1) 12-Factor config
in environment, (2) OpenTelemetry-first observability with W3C Trace Context, (3) structured JSON
logging via a reusable logger abstraction, (4) no `console.log`/`console.error` in production code,
(5) "clean architecture, complexity only when it earns its keep" (productBrief). All five decisions
below comply with these; no deviations are required.

## Component Analysis

### Core Components

| Component | Purpose | Responsibilities |
|-----------|---------|------------------|
| `src/index.ts` | Process entry | Read config, build app via factory, bind `server.listen`, register `SIGTERM`/`SIGINT` handlers, log startup/shutdown. Only file that calls `listen` and touches `process`. |
| `src/app.ts` | Express app factory | Pure `createApp(): Express` — registers middleware (request logger), routers (`/health`, `/api/v1`), then `notFound` + `errorHandler`. No `listen`, no env reads beyond injected config, no side effects. Returned app is supertest-injectable. |
| `src/config/env.ts` | Typed, validated config | Single source of all env access. Parse/validate `PORT`, `NODE_ENV`, `LOG_LEVEL`, `LOG_FORMAT`, `LOG_OUTPUT`, `OTEL_SERVICE_NAME`, `OTEL_EXPORTER_OTLP_ENDPOINT`, `DATABASE_URL`. Apply defaults, coerce types, fail-fast on invalid values. Export a frozen typed `config` object. |
| `src/observability/logger.ts` | Structured logger | OTel-compatible structured-JSON logger (pino). Reads level/format/output from config. Provides base logger + `child({traceId, spanId})` for request scope. No `console.*`. |
| `src/observability/tracing.ts` | Trace-context helper | Extract `traceId`/`spanId` from incoming `traceparent` (W3C) or mint a root trace id when absent. Hosts the OTel bootstrap stub (see Decision 3). |
| `src/middleware/requestLogger.ts` | Request/response logging | On each request: derive trace context, attach a request-scoped child logger, time the request, emit one JSON log line on `res.finish` with `method`, `path`, `statusCode`, `durationMs`, `traceId`. Non-blocking. |
| `src/middleware/notFound.ts` | 404 catch-all | Terminal route → forwards a 404 to the error handler (or responds JSON 404 directly) with `error`, `path`, `traceId`. |
| `src/middleware/errorHandler.ts` | Centralized error handler | Express 4-arg error middleware. Maps errors to JSON `{error, traceId}` (+ `path` for 404). Logs via logger (`warn` for 4xx, `error` with message+stack for 5xx). Never leaks stack to the client. Keeps the process alive. |
| `src/routes/health.ts` | Health endpoint | `GET /health` → 200 `{"status":"ok","timestamp":"<ISO8601>"}`. |
| `src/routes/index.ts` | `/api/v1` router scaffold | Mounts the versioned API router (empty of business handlers, but registered so unknown sub-paths hit `notFound` and return JSON). |

### Component Interactions

```
                 process boundary
  ┌──────────────────────────────────────────────────────────┐
  │  src/index.ts                                              │
  │    1. import { config } from config/env  (validated)       │
  │    2. import { logger } from observability/logger          │
  │    3. const app = createApp()      ── src/app.ts ──┐       │
  │    4. server = app.listen(config.port)             │       │
  │    5. process.on('SIGTERM', gracefulShutdown)      │       │
  └────────────────────────────────────────────────────┼──────┘
                                                         │
        ┌────────────────────────────────────────────────┘
        ▼  createApp() composition order (order matters)
   [requestLogger] → [/health router] → [/api/v1 router]
                                  → [notFound] → [errorHandler]
        │                 │                          ▲
        │ trace ctx       │ handlers may throw ──────┘
        ▼                 ▼
  observability/tracing  observability/logger  ◄── config/env (level/format/output)
```

- `config/env.ts` is imported first and is the only module that reads `process.env`. Everything
  downstream depends on the validated `config` object.
- `logger.ts` and `tracing.ts` depend on `config`. `requestLogger` depends on both.
- `app.ts` wires middleware in a fixed order; `errorHandler` is registered last so all thrown/
  forwarded errors funnel through it.
- `index.ts` is the only module with side effects (listen, signal handlers, `process.exit`).

---

## Decision 1 — Layer Structure [LOW]

### Options Explored

#### Option 1A: Flat technical layers (`src/routes/`, `src/middleware/`, `src/services/`)
- **Description**: Group by technical role. Routes in `src/routes/`, middleware in `src/middleware/`,
  cross-cutting concerns in `src/observability/` and `src/config/`. Downstream CRUD adds files to the
  same buckets (`src/routes/boards.ts`, `src/services/boardService.ts`).
- **Pros**:
  - Matches the spec's assumed layout exactly — zero translation for the build agent.
  - Lowest ceremony for an MVP scaffold with one real endpoint (`/health`).
  - Conventional for small/medium Express apps; minimal cognitive load.
- **Cons**:
  - At larger scale, related files (route + service + validation for "boards") are scattered across
    folders.
- **Technical Fit**: High · **Complexity**: Low · **Scalability**: Medium

#### Option 1B: Feature-module layout (`src/modules/health/`, later `src/modules/boards/`)
- **Description**: Group by domain feature. Each module owns its router, service, and types
  (`src/modules/boards/{router,service,schema}.ts`). Shared infra stays in `src/config/`,
  `src/observability/`, `src/middleware/`.
- **Pros**:
  - Excellent locality of change for large codebases; clear feature boundaries.
  - Scales to many domains without folder bloat.
- **Cons**:
  - Over-engineered for a scaffold whose only feature is a health probe — you'd create a `health`
    module wrapping a 5-line handler.
  - Diverges from the spec's stated layout; adds build-agent translation cost now.
  - Marginal benefit at BanyanBoard's flat, single-team scale (3 domains total: boards, columns, cards).
- **Technical Fit**: Medium · **Complexity**: Medium · **Scalability**: High

#### Option 1C: Hybrid — flat infra + `src/routes/` that can graduate to modules later
- **Description**: Use flat layers now (Option 1A), but treat `src/routes/index.ts` as a composition
  root so that if a domain grows, a `src/routes/boards/` sub-folder (router + colocated service) can
  be introduced without restructuring infra. No premature module scaffolding.
- **Pros**:
  - Keeps MVP simplicity of 1A while leaving a clean, low-cost migration path to per-feature grouping.
  - Honors "complexity only when it earns its keep."
- **Cons**:
  - Slightly informal — the "graduation" convention must be documented so it actually happens.
- **Technical Fit**: High · **Complexity**: Low · **Scalability**: Medium-High

### Decision

**Chosen: Option 1C — Flat technical layers now, with a documented graduation path to per-domain
sub-folders under `src/routes/` as CRUD features land.**

#### Rationale
BanyanBoard is an MVP for 1–20 users with exactly three future domains (boards, columns, cards) —
not the dozens that justify a module-per-feature layout. Option 1A's flat layout matches the spec,
is the conventional Express idiom, and carries the least implementation cost for a scaffold with one
real route. Pure 1B would force a `health` module around a trivial handler — textbook
over-engineering and a direct violation of the productBrief's "complexity only when it earns its
keep" principle. Option 1C captures 1A's simplicity while explicitly preserving 1B's scalability as
an *opt-in later*: when `boards` grows beyond a thin router, colocate its service under
`src/routes/boards/` rather than restructuring the whole tree. This satisfies the task's explicit
instruction to "pick the layout that best supports growth without over-engineering the MVP."

#### Trade-offs Accepted
- We accept slightly scattered files at the three-domain scale (acceptable — three domains is small).
- The graduation convention is a documented norm, not a structural enforcement (acceptable for a
  single-team project; recorded in systemPatterns.md by the build Documentation Agent).

---

## Decision 2 — Logger Library [LOW]

### Options Explored

#### Option 2A: `pino`
- **Description**: High-performance JSON logger. Default output is newline-delimited JSON. Native
  `level` config, `child()` loggers for bound context (ideal for per-request `traceId`), redaction
  support, and a first-party OpenTelemetry bridge (`@opentelemetry/instrumentation-pino` auto-injects
  `trace_id`/`span_id` once the SDK is wired). `pino-pretty` gives human-readable dev output.
- **Pros**:
  - Lowest logging overhead (async, minimal serialization cost) — directly supports the no-blocking,
    p95 < 150 ms NFR.
  - JSON-first by default → satisfies structured-logging requirement with zero extra config.
  - `child()` is the natural fit for request-scoped `traceId` injection (matches the logger interface
    in observability-requirements.md §5.1).
  - Explicitly recommended in observability-requirements.md §12 (Node.js dependency list).
- **Cons**:
  - Pretty-printing requires the `pino-pretty` transport (dev-only dependency).
- **Technical Fit**: High · **Complexity**: Low · **Scalability**: High

#### Option 2B: `winston` (with OTel transport)
- **Description**: Flexible, transport-based logger. JSON via `winston.format.json()`; trace context
  injected via a custom format or `@opentelemetry/winston-transport`.
- **Pros**:
  - Highly configurable transports (file rotation, multiple sinks) out of the box.
  - Familiar to many Node developers.
- **Cons**:
  - Higher per-log overhead than pino (synchronous formatting paths) — weaker fit for the latency NFR.
  - traceId injection and JSON shaping require more manual format wiring.
  - Heavier API surface than this MVP needs.
- **Technical Fit**: Medium · **Complexity**: Medium · **Scalability**: Medium

### Decision

**Chosen: Option 2A — `pino`, wrapped behind a thin `src/observability/logger.ts` abstraction.**

#### Rationale
pino is the fastest mainstream Node logger, JSON-native, and the official observability-requirements
recommendation. Its `child()` API is the cleanest way to attach a per-request `traceId`/`spanId`,
which is the central observability requirement of this task. Its low overhead directly protects the
p95 < 150 ms read NFR and the "no synchronous blocking in middleware" constraint. winston's extra
transport flexibility (multi-sink, rotation) is not needed for a single-process Docker Compose MVP
whose logs go to stdout for the container runtime to collect. Wrapping pino behind our own
`logger.ts` interface (mirroring the `Logger` shape in observability-requirements.md §5.1) keeps the
door open to swap implementations later without touching call sites.

#### Configuration mapping (env → pino)
- `LOG_LEVEL` → pino `level` (`trace|debug|info|warn|error|fatal`; default `info`, `debug` in dev).
- `LOG_FORMAT` → `json` (default) uses raw pino; `text` enables the `pino-pretty` transport (dev only).
- `LOG_OUTPUT` → `stdout` (default) writes to `process.stdout`; `file`/`both` use a pino destination
  (file path validated in `env.ts`). For this MVP, `stdout` is the default and primary path.
- Base fields always present: `level`, `msg` (mapped from pino `msg`), `time` (ISO 8601), plus
  `service`, `version`, `environment` bound at logger creation. `traceId`/`spanId` bound per request
  via `child()`.

#### Trade-offs Accepted
- Adds `pino-pretty` as a devDependency for readable local logs (acceptable — dev-only).
- The custom abstraction is a small amount of wrapper code (acceptable — it's the reusable-abstraction
  principle from observability-requirements.md §5, and it future-proofs the logger choice).

---

## Decision 3 — OTel SDK Wiring Depth [LOW]

### Options Explored

#### Option 3A: Full `@opentelemetry/sdk-node` + auto-instrumentations
- **Description**: Bootstrap the full Node SDK in a `tracing.ts` loaded before app code, with
  `@opentelemetry/auto-instrumentations-node` (auto-patches http, express, pg, etc.), a real OTLP
  exporter, and resource attributes.
- **Pros**:
  - Zero rework when real distributed tracing/export is enabled later.
  - Automatic spans for HTTP and (eventually) pg.
- **Cons**:
  - Heavy for a scaffold whose OTLP export is explicitly **stubbed/no-op** this task.
  - Auto-instrumentation pulls a large dependency tree and adds startup cost — friction against the
    < 5 s dev-start metric and "complexity only when it earns its keep."
  - Requires a `--require`/preload bootstrap ordering that complicates the simple `tsx`/`node` run.
- **Technical Fit**: Low (for *this* task) · **Complexity**: High · **Scalability**: High

#### Option 3B: Minimal manual W3C trace-context extraction (no SDK runtime)
- **Description**: No SDK bootstrap. `tracing.ts` manually parses the `traceparent` header
  (`00-{traceId}-{spanId}-{flags}`), extracts `traceId`/`spanId`, and mints a fresh random `traceId`
  when the header is absent or malformed. The request logger binds these onto the child logger. The
  OTLP exporter is a documented no-op.
- **Pros**:
  - Smallest possible footprint — satisfies every AC (traceId in every log line, propagation from
    `traceparent`) with a few lines of code and only `@opentelemetry/api` for types/constants.
  - No startup cost, no preload ordering, no auto-instrumentation tree — protects the < 5 s start and
    latency NFRs.
  - Fully honors the spec: "OTLP export is stub/no-op; local trace context propagation only."
- **Cons**:
  - No automatic spans; manual parsing must be correct (covered by a unit test).
  - Some rework when full export is enabled — but contained to `tracing.ts`.
- **Technical Fit**: High · **Complexity**: Low · **Scalability**: Medium

#### Option 3C: `@opentelemetry/api` + thin no-op tracer provider seam (chosen middle path)
- **Description**: Option 3B's manual extraction, but structured behind a small `tracing.ts` seam
  that exposes `extractTraceContext(headers)` and a `initTracing()` no-op stub which today does
  nothing (or registers a `NoopTracerProvider`) and is the single place where `sdk-node` + OTLP
  export get wired in a future task. Depend on `@opentelemetry/api` only.
- **Pros**:
  - All of 3B's lightness, plus an explicit, documented extension point (`initTracing()`) so the
    future SDK upgrade is a localized change, not a refactor.
  - Uses W3C constants/types from `@opentelemetry/api` to keep parsing standards-correct.
  - Avoids painting the project into a corner without over-engineering the MVP.
- **Cons**:
  - One extra (trivial) stub function vs pure 3B.
- **Technical Fit**: High · **Complexity**: Low · **Scalability**: Medium-High

### Decision

**Chosen: Option 3C — Minimal manual W3C trace-context extraction (`@opentelemetry/api` only),
behind a documented `initTracing()` no-op seam for the future full-SDK upgrade.**

#### Rationale
The task explicitly stubs OTLP export and scopes tracing to *local context propagation only*.
Full `sdk-node` + auto-instrumentation (3A) would add a large dependency tree, preload-ordering
complexity, and startup cost for capabilities this task is told not to deliver — a clear
over-engineering of an MVP scaffold and a hit to the < 5 s start metric. Pure manual extraction (3B)
meets every acceptance criterion. Option 3C adds only a single, near-zero-cost improvement over 3B:
an explicit `initTracing()` seam and reliance on `@opentelemetry/api` constants, so that "enable full
OpenTelemetry export" later becomes a contained change inside `tracing.ts` rather than a cross-cutting
refactor. This is precisely the "avoid over-engineering while not painting into a corner" balance the
spec asks for.

#### Phase 1 OTel bootstrap scope (concrete)
- Dependency: `@opentelemetry/api` only (for `trace`-context types/constants). NOT `sdk-node`,
  NOT `auto-instrumentations-node`, NOT the OTLP exporter packages this task.
- `tracing.ts` exports:
  - `extractTraceContext(headers): { traceId, spanId }` — parses a valid `traceparent`
    (`00-<32hex>-<16hex>-<2hex>`); on absence/malformation, generates a random 32-hex `traceId` and
    16-hex `spanId`.
  - `initTracing(): void` — **no-op stub** today (documented as the future `sdk-node`/OTLP wiring
    point). Called once from `index.ts` before `createApp()`.
- `OTEL_SERVICE_NAME` and `OTEL_EXPORTER_OTLP_ENDPOINT` are read/validated by `env.ts` and surfaced
  as logger resource fields (`service`) / future exporter config — but no exporter is constructed.

#### Trade-offs Accepted
- No automatic HTTP/pg spans this task (acceptable — out of scope; request logging covers the
  observability AC).
- A future task must replace the `initTracing()` no-op with real SDK wiring (acceptable — localized,
  documented, and intended).

---

## Decision 4 — TypeScript Strict Config [MEDIUM]

### Options Explored

#### Option 4A: `strict: true` only (baseline)
- **Description**: Enable the `strict` family, leave the additional opt-in safety flags off.
- **Pros**: Conventional, low-friction, fast to adopt.
- **Cons**: Misses cheap, high-value safety nets (`noUncheckedIndexedAccess`) that catch real bugs in
  config parsing and request handling.
- **Technical Fit**: Medium · **Complexity**: Low · **Scalability**: Medium

#### Option 4B: `strict: true` + targeted high-value flags (chosen)
- **Description**: `strict: true` plus `noUncheckedIndexedAccess`, `noImplicitOverride`,
  `noFallthroughCasesInSwitch`, `forceConsistentCasingInFileNames`, and `noUnusedLocals` /
  `noUnusedParameters`. Hold off on `exactOptionalPropertyTypes`.
- **Pros**:
  - `noUncheckedIndexedAccess` is especially valuable here: `process.env[...]` access in `env.ts`
    becomes `string | undefined`, forcing the validation/defaulting the spec demands — it actively
    enforces AC-VERIFY-2 discipline at the type level.
  - Catches dead code and unused symbols early in a fresh codebase (cheap to satisfy from day one).
  - No meaningful friction since there is no legacy code to retrofit.
- **Cons**:
  - `noUncheckedIndexedAccess` adds a few guards in handlers (trivial in a small codebase).
- **Technical Fit**: High · **Complexity**: Low · **Scalability**: High

#### Option 4C: Maximum strictness (4B + `exactOptionalPropertyTypes`)
- **Description**: All of 4B plus `exactOptionalPropertyTypes`.
- **Pros**: Most precise optional-property modeling.
- **Cons**:
  - `exactOptionalPropertyTypes` frequently fights Express/third-party types and config objects with
    optional fields, producing churn disproportionate to the bug class it prevents — over-engineering
    for an MVP.
- **Technical Fit**: Medium · **Complexity**: Medium · **Scalability**: Medium

### Decision

**Chosen: Option 4B — `strict: true` plus targeted high-value flags; `exactOptionalPropertyTypes`
deliberately deferred.**

#### Rationale
A greenfield project pays almost nothing to adopt strict flags up front and avoids the future churn
of retrofitting them. `noUncheckedIndexedAccess` is the standout: it forces every `process.env`
lookup in `env.ts` to be treated as possibly-undefined, which is exactly the discipline the
single-config-source and "no hard-coded defaults outside env.ts" requirements (AC-VERIFY-2) depend on.
`exactOptionalPropertyTypes` is excluded because it routinely clashes with Express request/response
augmentation and optional-field config objects, generating noise without commensurate safety for this
codebase — a textbook "complexity that doesn't earn its keep."

#### Chosen `tsconfig.json` (authoritative for the build agent)
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "outDir": "dist",
    "rootDir": "src",
    "sourceMap": true,
    "declaration": false,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist", "**/*.test.ts"]
}
```
Notes: `target`/`lib` ES2022 matches modern Node LTS (Node 20+; pin via `.nvmrc` / `engines`).
`module`/`moduleResolution: NodeNext` is the current Node-native ESM/CJS interop default; the project
runs as CommonJS output unless `"type":"module"` is set — keep CommonJS for this scaffold to minimize
ESM friction with `ts-jest`/tooling (revisit only if ESM is needed). `sourceMap: true` satisfies
AC-VERIFY-1 (source maps in `dist/`). Test files are excluded from the production build via `exclude`.

#### Trade-offs Accepted
- A handful of explicit `undefined` guards from `noUncheckedIndexedAccess` (acceptable — they encode
  required validation).
- Deferring `exactOptionalPropertyTypes` leaves a small precision gap on optional props (acceptable —
  re-evaluate if it ever causes a real bug).

---

## Decision 5 — Test Framework [MEDIUM]

### Options Explored

#### Option 5A: Jest + `ts-jest`
- **Description**: Mature, batteries-included test runner. `ts-jest` transpiles TS in-test;
  `supertest` for HTTP assertions against the `createApp()` factory.
- **Pros**:
  - Ubiquitous; vast ecosystem and documentation; well-understood `supertest` integration.
  - Stable, conservative choice for a foundation that establishes the project's testing convention.
- **Cons**:
  - `ts-jest` adds transpilation overhead; Jest's CJS-first model needs config for ESM.
  - Slower cold start than Vitest.
- **Technical Fit**: High · **Complexity**: Low · **Scalability**: Medium

#### Option 5B: Vitest
- **Description**: Vite-powered test runner with native ESM/TS support and a Jest-compatible API.
- **Pros**:
  - Faster, near-zero TS config, Jest-compatible matchers; works cleanly with `supertest`.
  - Excellent watch-mode DX.
- **Cons**:
  - Pulls a Vite toolchain into a backend that otherwise has no bundler — extra surface for a pure
    Node service.
  - Slightly less ubiquitous in Express-backend codebases (more momentum in frontend/Vite projects).
- **Technical Fit**: Medium-High · **Complexity**: Low · **Scalability**: High

### Decision

**Chosen: Option 5A — Jest with `ts-jest`, using `supertest` against the `createApp()` factory.**

#### Rationale
Both runners satisfy the requirements. Jest is selected as the conservative, ubiquitous default for a
backend foundation: it is the most widely documented Express + `supertest` testing stack, minimizing
onboarding friction for the open-source contributors the productBrief targets, and it introduces no
bundler toolchain into a pure-Node service (Vitest's Vite dependency would be the only Vite in the
project — surface that doesn't earn its keep on a backend MVP). Test-suite speed is not a constraint at
~14 tests. Because the spec mandates the testable `createApp()` factory split, `supertest` can exercise
the app **in-process without binding a port**, keeping integration tests fast and deterministic.

#### supertest integration pattern (authoritative)
```typescript
// src/routes/health.test.ts
import request from 'supertest';
import { createApp } from '../app';

describe('GET /health', () => {
  const app = createApp();              // pure factory — no listen, no port

  it('returns 200 with status ok and an ISO timestamp', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body.status).toBe('ok');
    expect(() => new Date(res.body.timestamp).toISOString()).not.toThrow();
  });

  it('propagates traceId from the traceparent header', async () => {
    const tp = '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01';
    const res = await request(app).get('/health').set('traceparent', tp);
    expect(res.status).toBe(200);
    // request-log assertion: traceId === '0af7651916cd43dd8448eb211c80319c'
    // (capture via a spy on the logger or a captured-transport in test setup)
  });
});
```
Pattern rules: tests import `createApp()` (never `index.ts`); pass the app directly to
`request(app)` so supertest manages an ephemeral server internally; assert status, `content-type`,
and body shape per the ACs. For request-log/traceId assertions, install a capturing logger
transport in a Jest `setupFiles` / `beforeEach` rather than reading stdout.

#### Trade-offs Accepted
- `ts-jest` transpilation overhead and a small `jest.config` (acceptable at this scale; the cost is
  invisible for ~14 tests).
- Forgoing Vitest's speed/DX edge (acceptable — speed is not a constraint and Jest avoids adding a
  Vite toolchain to a backend).

---

## Evaluation Matrix

Scoring the *chosen* option for each decision against the standard criteria (H/M/L).

| Criteria | D1 Flat+graduation (1C) | D2 pino (2A) | D3 manual+seam (3C) | D4 strict+targeted (4B) | D5 Jest (5A) |
|----------|--------------------------|--------------|----------------------|--------------------------|--------------|
| Scalability | M-H | H | M-H | H | M |
| Maintainability | H | H | H | H | H |
| Performance | H | H | H | H | n/a (test) |
| Security | n/a | H (redaction-capable, no leak) | n/a | H (type safety) | n/a |
| Observability | n/a | H | H (W3C propagation) | n/a | H (observability tests) |
| Implementation Cost | L | L | L | L | L |
| Time to Implement | Low | Low | Low | Low | Low |

All chosen options are Low cost / Low time — appropriate for an MVP scaffold while honoring the
BLOCKING observability and 12-Factor standards.

---

## Observability Architecture

### Logging
- **Library**: `pino`, wrapped by `src/observability/logger.ts` (reusable abstraction per
  observability-requirements.md §5).
- **Format**: Structured JSON. Base fields on every line: `level`, `msg`, `time` (ISO 8601),
  `service` (`OTEL_SERVICE_NAME`), `version`, `environment` (`NODE_ENV`). Request-scoped child loggers
  add `traceId` (and `spanId`).
- **Configuration**: `LOG_LEVEL` (default `info`, `debug` in dev), `LOG_FORMAT` (`json` default;
  `text` → `pino-pretty`, dev only), `LOG_OUTPUT` (`stdout` default; `file`/`both` validated, with
  `LOG_FILE_PATH` required when file is included).
- **Never log**: passwords, tokens, PII, full auth headers (observability-requirements.md §3.3) —
  no such data exists in this scaffold, but the redaction seam is available in pino.

### Distributed Tracing
- **SDK**: `@opentelemetry/api` only this task (manual W3C extraction); full `sdk-node`/OTLP export is
  a documented future upgrade behind `initTracing()`.
- **Propagation**: W3C Trace Context (`traceparent`). `extractTraceContext()` parses
  `00-<traceId>-<spanId>-<flags>`; a fresh root `traceId` is minted when the header is absent.
- **Service Boundaries**:

  | From | To | Protocol | Propagation Method |
  |------|-----|----------|-------------------|
  | HTTP client (React FE / curl) | BanyanBoard API | HTTP | `traceparent` header extracted in `requestLogger` |
  | BanyanBoard API | PostgreSQL | TCP (pg) | N/A this task (DB is a stub; pg span propagation deferred to the DB task) |
  | BanyanBoard API | OTLP collector | HTTP | N/A this task (exporter is a no-op stub) |

- **Sampling**: Not applied this task (no exporter). `OTEL_TRACES_SAMPLER_ARG` reserved for the
  future SDK wiring (default 1.0 dev / 0.1 prod when enabled).

### Metrics
- **This task**: none (deferred per the implementation plan). The architecture leaves the standard
  HTTP metric names reserved so a future metrics task adds them without renaming.
- **Reserved standard metrics** (future):
  - `http_requests_total{method, route, status_code}`
  - `http_request_duration_seconds{method, route}`
- **Custom business metrics** (future, downstream CRUD): e.g.
  `banyanboard_card_operations_total{operation, status}`.
- **Cardinality**: no user/request IDs as labels (observability-requirements.md §6.3).

### Configuration Variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `PORT` | HTTP listen port | `3000` |
| `NODE_ENV` | Deployment environment | `development` |
| `LOG_LEVEL` | Log verbosity | `info` (`debug` in dev) |
| `LOG_FORMAT` | Output format (`json`/`text`) | `json` |
| `LOG_OUTPUT` | Destination (`stdout`/`file`/`both`) | `stdout` |
| `LOG_FILE_PATH` | File sink path (required if output includes file) | — |
| `OTEL_SERVICE_NAME` | Service identifier (logger `service` field) | `banyanboard-api` |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Collector endpoint (stub; no exporter built this task) | — |
| `OTEL_TRACES_SAMPLER_ARG` | Sampling ratio (reserved for future SDK) | `1.0` (dev) |
| `DATABASE_URL` | PostgreSQL DSN (stub — configurable, NOT connected) | — |

All read and validated exclusively in `src/config/env.ts`; invalid values fail fast at startup.

---

## Implementation Guidelines

### Final directory tree
```
banyanboard/
├── package.json
├── tsconfig.json
├── jest.config.js
├── .nvmrc                     # Node 20 LTS
├── .env.example               # all env vars with safe defaults documented
├── src/
│   ├── index.ts               # process entry: initTracing(), listen, SIGTERM/SIGINT
│   ├── app.ts                 # createApp(): Express factory — no listen, no side effects
│   ├── config/
│   │   ├── env.ts             # typed, validated, single config source
│   │   └── env.test.ts
│   ├── observability/
│   │   ├── logger.ts          # pino wrapper; child({traceId,spanId})
│   │   ├── logger.test.ts
│   │   └── tracing.ts         # extractTraceContext(), initTracing() no-op seam
│   ├── middleware/
│   │   ├── requestLogger.ts   # trace ctx + JSON request log (method,path,status,durationMs,traceId)
│   │   ├── notFound.ts        # JSON 404 forwarder
│   │   ├── errorHandler.ts    # JSON 404/500, no stack leak, logs via logger
│   │   └── errorHandler.test.ts
│   └── routes/
│       ├── index.ts           # /api/v1 router scaffold (registered, no business handlers)
│       ├── health.ts          # GET /health
│       └── health.test.ts
└── dist/                      # tsc output (gitignored)
```
(Per Decision 1, future CRUD graduates into `src/routes/boards/`, `src/routes/columns/`,
`src/routes/cards/` sub-folders colocating router + service when a domain outgrows a thin router.)

### `package.json` dependencies (authoritative)
```jsonc
{
  "engines": { "node": ">=20" },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "dev": "tsx watch src/index.ts",
    "start": "node dist/index.js",
    "test": "jest",
    "test:watch": "jest --watch"
  },
  "dependencies": {
    "express": "^4.x",
    "pino": "^9.x",
    "@opentelemetry/api": "^1.x"
  },
  "devDependencies": {
    "typescript": "^5.x",
    "@types/node": "^20.x",
    "@types/express": "^4.x",
    "tsx": "^4.x",
    "pino-pretty": "^11.x",
    "jest": "^29.x",
    "ts-jest": "^29.x",
    "@types/jest": "^29.x",
    "supertest": "^7.x",
    "@types/supertest": "^6.x"
  }
}
```
Deliberately NOT included this task: `@opentelemetry/sdk-node`, `@opentelemetry/auto-instrumentations-node`,
`@opentelemetry/exporter-trace-otlp-http`, any pg client. (Added by downstream tracing/DB tasks.)

### `jest.config.js`
```javascript
/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.test.ts'],
  setupFiles: ['<rootDir>/jest.setup.ts'],   // set deterministic test env vars + capturing logger
  clearMocks: true,
};
```

### OTel bootstrap approach (Phase 1)
- `tracing.ts`: `extractTraceContext(headers)` (W3C parse + root-id mint) and `initTracing()` (no-op
  stub, the single future SDK-wiring point). `index.ts` calls `initTracing()` once before
  `createApp()`.
- `requestLogger.ts`: call `extractTraceContext(req.headers)`, create `req.log = logger.child({traceId, spanId})`,
  start a timer, and on `res.on('finish')` emit one JSON line with `method`, `path`, `statusCode`,
  `durationMs`, `traceId`. No blocking work.
- `errorHandler.ts`: use `req.log` (falls back to base logger) so error logs carry the same `traceId`.

### App composition order (in `createApp()`)
1. `requestLogger` (first — establishes trace context + request logger for everything after)
2. `/health` router
3. `/api/v1` router (`routes/index.ts`)
4. `notFound` (terminal 404 → JSON)
5. `errorHandler` (4-arg, last — JSON 404/500, no stack leak)

### Phase mapping
- **P1 (scaffolding+config)**: `package.json`, `tsconfig.json`, `jest.config.js`, `.env.example`,
  `src/config/env.ts` (+ test). → AC-VERIFY-1/2.
- **P2 (observability)**: `src/observability/logger.ts`, `src/observability/tracing.ts`,
  `src/middleware/requestLogger.ts` (+ logger test).
- **P3 (app+health)**: `src/app.ts`, `src/index.ts` (entry+SIGTERM), `src/routes/health.ts`,
  `src/routes/index.ts` (+ health integration tests). → AC-ENTRY-1, AC-HAPPY-1/2, AC-ERROR-3.
- **P4 (error handling)**: `src/middleware/notFound.ts`, `src/middleware/errorHandler.ts` (+ test).
  → AC-ERROR-1/2.

---

## Validation Checklist

- [x] Meets all system requirements (app split, single config source, health slice, error handling, SIGTERM)
- [x] Respects technical constraints (single process, no microservices, DB/OTLP stubbed, Docker Compose target)
- [x] Addresses non-functional requirements (non-blocking middleware, pino low overhead → p95 < 150 ms; < 5 s start)
- [x] Technically feasible (standard, well-supported libraries; greenfield)
- [x] Risks identified and acceptable (see Risk Assessment)
- [x] Complies with Guiding Principles in systemPatterns.md (greenfield — these decisions establish the baseline; no deviation)
- [x] Respects established patterns in systemPatterns.md (none pre-exist; this doc seeds them)
- [x] Observability architecture defined (logging, tracing seam, reserved metrics)
- [x] Trace context propagation across all service boundaries (HTTP `traceparent` extracted; DB/OTLP deferred & documented)
- [x] Logging strategy consistent with observability-requirements.md (pino, structured JSON, traceId, env-driven, no console.*)
- [x] Metrics strategy follows naming conventions (reserved standard names; none implemented this task)

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Manual `traceparent` parsing is incorrect (malformed/edge cases) | M | M | Unit test `extractTraceContext` against valid, absent, and malformed headers; use `@opentelemetry/api` constants for format. |
| `noUncheckedIndexedAccess` adds friction in handlers | L | L | Confined to a few `env.ts`/handler guards in a small codebase; encodes required validation. |
| Future full-OTel SDK upgrade requires rework | M | L | Contained behind `initTracing()` seam in `tracing.ts`; only that file changes. |
| `console.*` accidentally used (BLOCKING violation) | L | H | Logger abstraction is the only sanctioned path; add an ESLint `no-console` rule in a later lint task; code review checklist (observability-requirements.md §10). |
| ESM/CJS interop friction with `ts-jest` / `NodeNext` | L | M | Keep CommonJS output for the scaffold; revisit ESM only if a dependency forces it. |
| Logger drops `traceId` outside request scope (startup/shutdown logs) | L | L | Startup/shutdown use a root `traceId` minted at `initTracing()`; base logger binds it. |

## Next Steps

1. Begin Phase 1: scaffold `package.json` (deps above), `tsconfig.json` (flag set above),
   `jest.config.js`, `.nvmrc` (Node 20), `.env.example`, and implement `src/config/env.ts` with
   fail-fast validation + unit tests (AC-VERIFY-1/2).
2. Phase 2: implement `logger.ts` (pino wrapper), `tracing.ts` (`extractTraceContext` + `initTracing`
   no-op), and `requestLogger.ts`; add logger/trace unit tests.
3. Phase 3: implement `app.ts` factory, `index.ts` entry + SIGTERM, `health.ts`, `routes/index.ts`;
   add supertest integration tests for `/health` and `/api/v1`.
4. Phase 4: implement `notFound.ts` + `errorHandler.ts`; add 404/500 integration tests (no stack leak).
5. Build Documentation Agent: seed `systemPatterns.md` with the layered structure, pino logging
   convention, W3C trace-context propagation, error-handling convention, and the Jest+supertest
   testing pattern established here; update `techContext.md` with the stack and commands.
