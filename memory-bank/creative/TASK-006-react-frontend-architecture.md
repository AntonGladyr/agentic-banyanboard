# Architecture Decision: React Frontend Board UI (TASK-006)

**Created**: 2026-06-20
**Status**: DECIDED
**Decision Type**: Architecture
**Task**: TASK-006 (FEAT-006) — Level 3
**Scope**: Frontend tier (read-only React SPA) + ONE backend change (`status` field on the Card model)

---

## Context

This task introduces the **project's first frontend tier**: a read-only React SPA that consumes
the existing Express CRUD APIs (`/api/v1/boards`, `/api/v1/boards/:id`, `/api/v1/boards/:boardId/cards`)
and renders a kanban board (board list page + three-column board view). It also makes a single,
contained backend change — adding a `status` field to the `cards` table so cards map to the three
columns.

The repository today is **backend-only**. Confirmed against the codebase:

- `package.json` — zero React/build-tool dependencies; scripts are `build` (`tsc -p tsconfig.json`),
  `dev` (`tsx watch --env-file=.env src/index.ts`), `start` (`node --env-file=.env dist/index.js`),
  `test` (`jest`), and the `migrate*` scripts.
- `tsconfig.json` — `module/moduleResolution: NodeNext` (CJS output, no `"type":"module"`),
  `rootDir: src`, `outDir: dist`, `include: ["src/**/*.ts"]`, `exclude: ["node_modules","dist","**/*.test.ts"]`,
  strict + `noUncheckedIndexedAccess`, `lib: ["ES2022"]` (no `"DOM"`).
- `jest.config.js` — `preset: ts-jest`, `testEnvironment: node`, `roots: ['<rootDir>/src']`,
  `testMatch: ['**/*.test.ts']`.
- `docker-compose.yml` — a **single `postgres` service**; the header comment explicitly states the
  Express app "runs on the host (`npm run dev`)" and an `api` service/Dockerfile is out of scope.
- `migrations/` — two numbered CJS migrations (`*_create-boards-table.js`, `*_create-cards-table.js`)
  using `pgm.createTable`/`pgm.createIndex`, `ifNotExists`, reversible `down`.
- `src/db/cards.ts` — parameterized CRUD over `cards`; a single `RETURNING_COLUMNS` constant
  (`id, board_id, title, description, position, created_at, updated_at`) — **no `status`**.
- `src/validation/card.ts` — pure validators (`validateCreate`/`validateUpdate`), throw `badRequest`
  (400) before any DB call; field validators per column.
- `src/routes/cards.ts` — board-scoped router, `express.json()` scoped to the router, validate-then-DB,
  `next(err)` funneling, business logging via `req.log`.

### System Requirements

- **R1** — Board list page at `/` lists all boards from `GET /api/v1/boards`; each entry navigates to `/boards/:id`.
- **R2** — Board view page at `/boards/:id` renders three columns (To Do / In Progress / Done) and
  partitions cards by `status` (`GET /api/v1/boards/:id` + `GET /api/v1/boards/:id/cards`).
- **R3** — Each card displays `title` and `description`.
- **R4** — Loading, empty, and error states on both pages (AC-LOADING-1, AC-ENTRY-2, AC-HAPPY-3, AC-ERROR-1/2).
- **R5** — Direct-URL load / refresh of `/boards/:id` must render the SPA, not 404 (AC-NAV-1) → SPA history fallback.
- **R6 (backend)** — `cards` gains a `status` column (`'todo'|'in_progress'|'done'`, NOT NULL DEFAULT `'todo'`),
  threaded through validation, data-access, and the create/update API; existing rows backfill to `'todo'` (AC-STATUS-1).
- **R7** — Display-only: NO create/edit/delete, drag-drop, auth, real-time, labels, filtering, or pagination.

### Technical Constraints

- **C1 — Module-system split.** Backend is CommonJS (`module: NodeNext`, no `"type":"module"`).
  Vite/React are ESM. The two must coexist without a `tsconfig.json` conflict.
- **C2 — Build isolation.** The backend production build is `tsc` over `src/` (`include: ["src/**/*.ts"]`,
  `lib: ["ES2022"]` with **no `"DOM"` lib**). Adding `.tsx`/DOM code under `src/` would either pull
  browser code into the Node build or require DOM libs in the Node tsconfig — both undesirable.
  The frontend subtree MUST be excluded from the backend `tsc` and Jest, and vice versa.
- **C3 — Test-runner separation.** Jest `roots: ['<rootDir>/src']`, `testMatch: ['**/*.test.ts']`.
  Frontend tests (`.test.tsx`) must NOT be picked up by the backend Jest run, and backend tests must
  not be run by the frontend runner.
- **C4 — Single-host deployment.** 1–20 users, `docker compose up`, no microservices (productBrief
  Technical Constraints; systemPatterns Guiding Principle 4).
- **C5 — 12-Factor config-in-environment** (Guiding Principle 1). Any frontend-reachable config
  (e.g., API base URL) must be environment-driven, not hardcoded.
- **C6 — Express composition order is fixed** (systemPatterns "App factory split"):
  `requestLogger → /health → /api/v1 → notFound → errorHandler`. Any static-serving/SPA-fallback
  middleware must slot in without disturbing this order or letting `/api/v1` fall through to the SPA.

### Non-Functional Requirements

- **NFR1 — Performance.** Initial load < 2 s on localhost; board load < 1 s (productBrief). No avoidable API waterfall.
- **NFR2 — Accessibility.** WCAG 2.1 AA (reasonable effort): keyboard nav, contrast, focus indicators,
  focus management on client-side route change. (Visual specifics → UI/UX phase.)
- **NFR3 — Browser support.** Chrome/Firefox/Edge 120+, Safari 17+. No IE. (Permits modern ESM, `fetch`, native modules.)
- **NFR4 — Security / error hygiene.** No auth, no PII. Frontend must never surface internal error
  detail to users (mirrors Guiding Principle 5 on the client side).
- **NFR5 — Observability.** systemPatterns requires structured logging server-side; productBrief
  mandates **no third-party analytics/telemetry in MVP**. Frontend observability must be lightweight and self-contained.

### Existing Patterns That MUST Be Respected (systemPatterns.md)

- **Guiding Principle 1** — Config in environment, fail-fast, no hardcoded settings.
- **Guiding Principle 4** — Clean architecture; complexity only when it earns its keep (favor the simplest layout).
- **Guiding Principle 5** — No internal error detail in client responses (extended here to the React client's user-facing copy).
- **Validate-before-DB** — backend `status` work must reject invalid input before any pool query, via the existing validator pattern.
- **`RETURNING_COLUMNS` single-source** — `status` must be added to that one constant so every read/RETURNING stays consistent.

---

## Component Analysis

### Core Components

| Component | Tier | Purpose | Responsibilities |
|-----------|------|---------|------------------|
| Vite + React + TS toolchain | Frontend | Build/dev tooling | HMR dev server, ESM build to `client/dist/`, env injection |
| SPA entry (`main.tsx`, `App.tsx`) | Frontend | Bootstrap + router | Mount React root, declare client routes, error boundary |
| Client-side router | Frontend | Navigation | `/` (BoardList) and `/boards/:id` (BoardView); back-nav; focus mgmt |
| Typed API client (`apiClient.ts`) | Frontend | Backend integration | Typed `fetch` wrappers; map non-OK/`network` to a safe `ApiError`; carry no internal detail |
| Shared API types (`types.ts`) | Frontend | Contract | `Board`, `Card` (incl. `status`), `CardStatus` union — mirror backend row shapes |
| Page components (BoardList, BoardView) | Frontend | Pages | Orchestrate fetch + render list/columns; own loading/empty/error states |
| Presentational components (BoardEntry, Column, CardItem, state components) | Frontend | UI | Render data; visual specifics deferred to UI/UX phase |
| Client error reporter (`errorReporter.ts`) | Frontend | Observability | Centralize `console.error` for boundary + unhandled-rejection; structured shape; no telemetry |
| `status` column + migration | Backend | Schema | Add `cards.status`, backfill `'todo'`, NOT NULL DEFAULT |
| `status` validator | Backend | Validation | Accept/validate `status` on create/update; invalid → 400 |
| `status` in data-access | Backend | Persistence | Add to `RETURNING_COLUMNS`, create/update params |
| Static + SPA-fallback serving | Backend | Prod serving | Serve `client/dist/` and return `index.html` for non-API routes |

### Component Interactions

```
Browser ──HTTP──▶ Express (port 3000)
   │                  ├─ /health           → healthRouter
   │                  ├─ /api/v1/*          → apiRouter (boards, cards)   [JSON]
   │                  └─ (prod) everything else → static client/dist + index.html fallback (SPA)
   │
   ├─ DEV:  Vite dev server (port 5173) serves the SPA; Vite proxy forwards /api/v1 → http://localhost:3000
   └─ PROD: Express serves both the built SPA and the API on port 3000 (single origin)

React app:  Router → Page (BoardList | BoardView) → apiClient.fetch → /api/v1/... → render
            apiClient maps failures → ApiError (safe) → Page renders error state (no internal detail)
            ErrorBoundary + window 'unhandledrejection' → errorReporter (console only, structured)
```

The boundary that matters for trace context is the single HTTP hop **browser → Express**. The
backend already mints/propagates W3C Trace Context per request (`requestLogger`/`extractTraceContext`);
the browser is the trace originator and (per NFR5) does not run an OTel SDK in MVP.

---

## Q1 — Frontend Tooling & Serving Strategy

### Sub-decision 1a: Build tool

#### Option 1: Vite (React + TypeScript template)
- **Description**: Vite dev server with HMR; Rollup production build to a static `dist/`.
- **Pros**: De-facto standard for React SPAs in 2026; native ESM + fast HMR; first-class TS; built-in
  dev `server.proxy` (solves the dev `/api/v1` reach cleanly); `import.meta.env` env handling that
  satisfies 12-Factor at build time; tiny config; output is plain static files Express can serve.
- **Cons**: Another toolchain in the repo; ESM-vs-CJS coexistence must be handled (resolved via subtree tsconfig).
- **Technical Fit**: High — produces static assets Express can serve; aligns with "simplest thing that works."
- **Complexity**: Low. **Scalability**: High (handles growth to more pages/components without restructuring).

#### Option 2: Create React App (CRA)
- **Description**: `react-scripts` based tooling.
- **Pros**: Historically familiar.
- **Cons**: **Officially deprecated** (no longer recommended by React); slow Webpack-based dev server;
  unmaintained — an immediate tech-debt and security liability. Disqualifying.
- **Technical Fit**: Low. **Complexity**: Medium. **Scalability**: Low.

#### Option 3: Next.js
- **Description**: Full React framework (SSR/SSG/file routing/API routes).
- **Pros**: Powerful routing, SSR, image optimization.
- **Cons**: Massive overkill for a read-only localhost SPA; introduces a Node server tier that
  **competes with the existing Express server** (two servers, or awkward custom-server integration);
  SSR/edge features are unused; violates Guiding Principle 4 (complexity must earn its keep). The
  product is explicitly a static-served SPA behind one Express process.
- **Technical Fit**: Low. **Complexity**: High. **Scalability**: High (but irrelevant to needs).

**Decision (1a): Option 1 — Vite.** It is the lowest-complexity tool that delivers fast HMR, native
TS, a built-in dev proxy, and a plain static build that Express can serve as-is — the exact shape this
single-host, read-only SPA needs. CRA is deprecated; Next.js violates Guiding Principle 4.

### Sub-decision 1b: Project layout

#### Option 1: Separate `client/` directory with its own `package.json` (npm workspace-style sibling)
- **Description**: A top-level `client/` folder holding the entire frontend: its own `package.json`,
  `tsconfig.json` (+ `tsconfig.node.json`), `vite.config.ts`, `src/`, and tests. The backend
  `package.json`/`tsconfig.json`/Jest are untouched.
- **Pros**: **Clean dependency isolation** — React/Vite/Vitest never pollute backend deps; backend
  `tsc`/`jest` automatically ignore `client/` (their `include`/`roots` are scoped to `src/`); the
  ESM-vs-CJS split is naturally contained (each package owns its module system); independent install/build/test;
  trivially promotable to a real monorepo (pnpm/npm workspaces) later.
- **Cons**: Two `node_modules` and two install steps (mitigated by root convenience scripts or a workspace later).
- **Technical Fit**: High. **Complexity**: Low. **Scalability**: High.

#### Option 2: Same `package.json`, frontend under `src/client/` (or `client/`) subtree
- **Description**: Add React/Vite/Vitest to the **root** `package.json`; frontend source lives under
  the backend tree.
- **Pros**: One install, one `node_modules`.
- **Cons**: **Dependency and module-system entanglement** — Vite (ESM) + React DOM types mixed into a
  CJS Node package; high risk of the backend `tsc`/Jest accidentally compiling/running `.tsx`/DOM code;
  requires surgical `exclude`/`roots` edits to keep them apart; muddies which deps belong to which tier.
  Fights constraints C1–C3 instead of sidestepping them.
- **Technical Fit**: Medium. **Complexity**: Medium. **Scalability**: Medium.

#### Option 3: Separate top-level `frontend/` repo-style package (same as Option 1, different name)
- **Description**: Identical to Option 1; name `frontend/` instead of `client/`.
- **Pros/Cons**: Same as Option 1. Naming only.

**Decision (1b): Option 1 — separate `client/` directory with its own `package.json`.** It contains
the ESM/CJS split (C1), gives the backend `tsc`/Jest automatic isolation with zero edits to their
config (C2, C3), and keeps each tier's dependencies honest — the cleanest expression of Guiding
Principle 4. `client/` is chosen over `frontend/` purely for brevity and to match the task's
phrasing; the boundary is what matters. Option 2 was rejected for fighting the module-system and
build-isolation constraints; Option 3 is Option 1 by another name.

### Sub-decision 1c: Dev/prod parity (how the SPA reaches `/api/v1`, and how it is served in prod)

#### Option 1: Express serves the built `client/dist/` as static files (single image) + Vite dev proxy
- **Description**:
  - **Dev**: Vite dev server on `:5173` with `server.proxy` forwarding `/api/v1` (and `/health`) to
    `http://localhost:3000` (the Express dev server). Two processes, one logical origin from the
    browser's perspective for API calls.
  - **Prod**: `npm run build` in `client/` emits `client/dist/`. Express adds, **after** the
    `/api/v1` router and **before** `notFound`, (a) `express.static('client/dist')` and (b) a
    SPA history-fallback handler that returns `client/dist/index.html` for any non-API GET that
    didn't match a static asset. Single origin, single port (3000), single container/image.
- **Pros**: **Single origin in prod → no CORS, no separate base URL** (API base is the empty/relative
  path `/api/v1`); directly satisfies AC-NAV-1 (index.html fallback for `/boards/:id`); simplest
  deploy (one process/image); dev proxy keeps the dev experience single-origin too, so the code path
  (`fetch('/api/v1/...')`) is identical in dev and prod (strong dev/prod parity — 12-Factor).
- **Cons**: Express now has a static-serving responsibility; fallback ordering must be precise so it
  never shadows `/api/v1` or `/health` (handled by registering it after the API router and excluding
  `/api/v1`/`/health` paths). Build step must run before `npm start` in prod.
- **Technical Fit**: High. **Complexity**: Low. **Scalability**: High (sufficient for 1–20 users).

#### Option 2: Separate nginx container serves the SPA; Express serves only the API
- **Description**: A second container (nginx) serves `client/dist/` with `try_files ... /index.html`
  fallback and reverse-proxies `/api/v1` to the Express service.
- **Pros**: Clear separation; nginx is a battle-tested static server; SPA fallback is a one-line nginx config.
- **Cons**: **Two services + reverse-proxy config** for a 1–20-user localhost product — violates
  Guiding Principle 4 and the "no microservices / single backend process" constraint; more moving
  parts in `docker compose up`; introduces an origin/proxy boundary that adds nothing for this scale.
- **Technical Fit**: Medium. **Complexity**: Medium. **Scalability**: High (unneeded).

#### Option 3: Two separate origins in prod (Vite preview / static host on a different port + CORS)
- **Description**: Serve the SPA from a different port/host than the API; enable CORS on Express.
- **Pros**: Decoupled deploys.
- **Cons**: Requires CORS config and a build-time absolute API base URL; breaks the single-origin
  simplicity; weaker dev/prod parity; more config surface. Unjustified for this product.
- **Technical Fit**: Low. **Complexity**: Medium. **Scalability**: Medium.

**Decision (1c): Option 1 — Express serves `client/dist/` statically with SPA history fallback; Vite
dev proxy in development.** This yields a **single origin and single port (3000) in both dev and prod**
(the browser always calls relative `/api/v1/...`), which (a) directly satisfies AC-NAV-1's
index.html-fallback requirement, (b) eliminates CORS and a build-time API base URL, (c) keeps the
deploy to a single process/image, and (d) gives near-perfect dev/prod parity. nginx (Option 2) and a
second origin (Option 3) add a tier/config for a single-host, 20-user product — rejected under
Guiding Principle 4.

**Express integration detail (preserves the fixed composition order, C6):** the static + fallback
middleware is **opt-in via env** so dev (where Vite serves the SPA) and test (supertest) are
unaffected:

```
createApp():
  requestLogger
  /health        → healthRouter
  /api/v1        → apiRouter
  [NEW] if (config.serveClient) {            // SERVE_CLIENT=true in prod only
          express.static(config.clientDistPath)            // serve built assets
          GET (non-/api, non-/health) * → sendFile(index.html)   // SPA history fallback
        }
  notFound       → notFound          // /api/v1 misses still get JSON 404, never index.html
  errorHandler   → errorHandler
```

The fallback is registered **after** `/api/v1` and `/health` and only handles GET requests that are
not under those prefixes, so API 404s remain JSON (Guiding Principle 5 / existing `notFound`
contract) and never receive `index.html`. `SERVE_CLIENT` defaults to `false` so the backend test
suite and `npm run dev` behavior are unchanged.

### Sub-decision 1d: Module-system coexistence & tsconfig split

The backend `tsconfig.json` stays exactly as-is (`NodeNext`, `lib: ["ES2022"]`, `include: ["src/**/*.ts"]`).
Because the frontend lives in `client/` (Decision 1b), the backend `include`/`exclude` and Jest `roots`
**already ignore it** — no backend config edits are needed. The frontend gets its own tsconfig subtree
under `client/`:

- `client/tsconfig.json` — app config: `target: ES2022`, `module: ESNext`, `moduleResolution: Bundler`,
  `lib: ["ES2022","DOM","DOM.Iterable"]`, `jsx: react-jsx`, `strict: true` + `noUncheckedIndexedAccess`
  (mirror backend rigor), `noEmit: true` (Vite/esbuild does the transpile), `isolatedModules: true`,
  `types: ["vite/client","vitest/globals"]`. Includes `client/src`.
- `client/tsconfig.node.json` — for `vite.config.ts` itself (Node context): `module/moduleResolution: NodeNext` (or Bundler), `composite: true`.
- `client/tsconfig.json` references `client/tsconfig.node.json` via project references (standard Vite scaffold).

This is the standard Vite two-tsconfig layout. The ESM frontend and CJS backend never share a tsconfig,
so constraint C1 is structurally resolved — not patched.

### Sub-decision 1e: 12-Factor env handling for frontend config (API base URL)

Because prod is single-origin (Decision 1c), the **API base URL is the relative path `/api/v1`** in
both dev and prod — there is effectively no host to configure, which is the most 12-Factor outcome
(no environment-specific absolute URL baked into the bundle). For the dev proxy target and any future
knob, Vite's env model applies:

- **Dev proxy target** is configured in `vite.config.ts` from a Vite env var
  (`VITE_API_PROXY_TARGET`, default `http://localhost:3000`) read from `client/.env` /
  `client/.env.development` — environment-driven, not hardcoded (Guiding Principle 1).
- Any value the **browser** must see is exposed only via the `VITE_`-prefixed convention and accessed
  through `import.meta.env.VITE_*` (Vite's documented mechanism). These are **build-time** substitutions —
  the doc explicitly notes that browser-reachable config is fixed at build time, so prod images that
  need a different value rebuild (acceptable for a self-hosted single-image product). For MVP the only
  such value is the (relative) API base, so this is a documented convention, not an active knob.

### Sub-decision 1f: Docker Compose impact

#### Option 1: Keep "Express runs on host" for dev; add NOTHING to compose now
- Compose stays postgres-only; dev is `docker compose up` (Postgres) + `npm run dev` (Express on host)
  + `npm run dev` in `client/` (Vite on host). Matches the current documented model exactly.
- **Pros**: Zero churn; matches the existing header comment and quick-start; smallest diff.
- **Cons**: Prod single-image story (Dockerfile + optional `api` service) is left for a later feature.

#### Option 2: Add an `api` service (Dockerfile) and optionally a `frontend` service now
- **Pros**: Full `docker compose up` brings up DB + API + SPA.
- **Cons**: Pulls a Dockerfile + multi-service orchestration into a **display-only frontend** feature;
  the prod single-image is fully realizable later from the same static-serve decision; scope creep
  against the task's explicit "Express runs on host" status quo.

**Decision (1f): Option 1 for this feature — keep compose postgres-only; Express + Vite run on host.**
The static-serve decision (1c) already defines the **prod single-image** path (Express serves
`client/dist`), so a Dockerfile/`api` service is a clean, additive follow-up that does not need to land
inside this read-only-frontend feature. This honors the current documented quick-start and keeps the
diff focused. **Recommended follow-up (noted, not in scope):** a multi-stage Dockerfile that builds
`client/` then runs Express with `SERVE_CLIENT=true`, optionally added as an `api` compose service.

---

## Q2 — `status` Field Schema (confirmation of fixed strategy)

Strategy is fixed by planning: **add a `status` column to `cards`**. Only the specifics are confirmed here.

### Sub-decision 2a: Column type

#### Option 1: Plain `varchar` + app-layer validation (no DB CHECK)
- **Pros**: Exactly matches the existing card layer — `title`/`description`/`position` are validated
  in `src/validation/card.ts` (validate-before-DB), not by DB constraints; consistent mental model;
  no migration coupling when the enum evolves; the app is the single source of truth for allowed values.
- **Cons**: DB does not enforce the domain itself (acceptable — the API is the only writer; validate-before-DB already guards every write).
- **Technical Fit**: High. **Complexity**: Low.

#### Option 2: `varchar` + CHECK constraint
- **Pros**: DB-level enforcement as a backstop.
- **Cons**: Adds a constraint to evolve via migration whenever values change; slight redundancy with
  app validation; mild divergence from the established "validate in the app" pattern.
- **Technical Fit**: Medium. **Complexity**: Medium.

#### Option 3: Postgres native `ENUM` type
- **Pros**: Strongest DB typing.
- **Cons**: Postgres enums are **awkward to evolve** (`ALTER TYPE ... ADD VALUE`, ordering caveats,
  can't easily remove values); heaviest migration; over-engineered for three values; diverges most
  from the existing varchar-everywhere card schema.
- **Technical Fit**: Low. **Complexity**: High.

**Decision (2a): Option 1 — plain `varchar` + app-layer validation**, consistent with the planning
lean and the existing parameterized/validate-before-DB card layer. Use `varchar(20)` (room for
`'in_progress'`). The allowed set lives in `src/validation/card.ts` as the single source of truth.
(Option 2's CHECK is a reasonable future hardening if a non-API writer ever appears; explicitly
deferred.)

### Sub-decision 2b: Allowed values, default, backfill (confirmed)

- **Allowed values**: `'todo' | 'in_progress' | 'done'` (a TS string-literal union `CardStatus`).
- **Constraint**: `NOT NULL DEFAULT 'todo'`.
- **Backfill**: the migration adds the column with the default, so existing rows take `'todo'` automatically.
- **API behavior**: create accepts optional `status`, defaults to `'todo'` when omitted; create/update
  validate it (invalid → 400, **no DB write**, per validate-before-DB); PATCH accepts `status` as one of
  the recognized fields. `GET` responses include `status`.

### Migration sketch (matches the existing `node-pg-migrate` CJS convention)

New file `migrations/<timestamp>_add-status-to-cards.js` (created via `npm run migrate:create -- add-status-to-cards`):

```js
exports.shorthands = undefined;

/** @param pgm {import('node-pg-migrate').MigrationBuilder} */
exports.up = (pgm) => {
  // NOT NULL DEFAULT 'todo' → existing rows backfill to 'todo' automatically.
  pgm.addColumn('cards', {
    status: { type: 'varchar(20)', notNull: true, default: 'todo' },
  });
  // No DB CHECK — allowed values are enforced in src/validation/card.ts (validate-before-DB),
  // consistent with the rest of the card schema.
};

/** @param pgm {import('node-pg-migrate').MigrationBuilder} */
exports.down = (pgm) => {
  pgm.dropColumn('cards', 'status', { ifExists: true });
};
```

Verification per the established Phase-1 convention: manual `\d cards` shows the column + default;
existing rows show `'todo'`; `down` drops it cleanly.

### Exactly where `status` threads through the backend (Phase 1 files)

| File | Change |
|------|--------|
| `migrations/<ts>_add-status-to-cards.js` | **New** migration above (up: `addColumn` NOT NULL DEFAULT `'todo'`; down: `dropColumn`). |
| `src/db/cards.ts` | Add `status: CardStatus` to the `Card` interface; add `status` to **`RETURNING_COLUMNS`** (single source → flows to SELECT/list/findById/INSERT/UPDATE RETURNING); add `status` to `CreateCardParams` and the `INSERT` column list + `$n` value; add `status?` to `UpdateCardParams` and the dynamic `update()` SET builder (mirroring the existing `title`/`description`/`position` blocks). Export a `CardStatus` type. |
| `src/validation/card.ts` | Add `CardStatus` union + `CARD_STATUSES` allowed-set; `checkStatus(value): CardStatus` (string in the allowed set, else `badRequest`); `validateCreate` → `status = obj.status === undefined ? 'todo' : checkStatus(obj.status)` and include in `CardCreateInput`; `validateUpdate` → treat `status` as a recognized field (`hasStatus`), include in the "at least one field" check and the normalized result; add to `CardUpdateInput`. |
| `src/routes/cards.ts` | **Likely no structural change** — handlers already spread the validated input into `create({ board_id, ...input })` and `update(id, input)`. `status` flows through once it is in the validated input + data-access params. Confirm the create handler passes it (it will, via `...input`). |
| `src/validation/card.test.ts` | Add `status` cases (valid values, invalid → 400, omitted → `'todo'`, type/whitelist checks, PATCH-with-status). |
| `src/routes/cards.test.ts` | Add integration cases (GET cards carry `status`; POST without status → `'todo'`; POST/PATCH invalid status → 400 no-write; PATCH to valid status → read-back reflects it). |

This keeps the `RETURNING_COLUMNS` single-source invariant and the validate-before-DB principle intact.

---

## Q3 — Frontend Test Runner & E2E Approach

### Sub-decision 3a: Component/unit runner

#### Option 1: Vitest + React Testing Library (RTL) + jsdom
- **Description**: Vitest as the component/unit runner inside `client/`, RTL for component rendering, jsdom environment.
- **Pros**: **Shares Vite's transform/config** (one resolver, one tsconfig path resolution, ESM-native) →
  zero second build pipeline; Jest-compatible API (low learning curve, mirrors backend Jest ergonomics);
  fast; first-class TS/JSX; isolated in `client/` so it never collides with the backend Jest run (C3).
- **Cons**: A second test framework in the repo (Jest backend + Vitest frontend) — but they are
  cleanly partitioned by package, and Vitest's Jest-like API keeps the cognitive cost low.
- **Technical Fit**: High. **Complexity**: Low.

#### Option 2: Jest + ts-jest + RTL for the frontend too
- **Description**: Reuse Jest for the frontend.
- **Pros**: One test framework name across the repo.
- **Cons**: Jest with ESM + Vite is friction-heavy (ESM transform config, `import.meta.env` shims,
  separate Babel/ts-jest setup that does NOT share Vite's pipeline) — precisely the integration pain
  Vitest eliminates; would also risk the backend Jest `roots`/`testMatch` picking up frontend tests
  unless carefully fenced. More config for less fit.
- **Technical Fit**: Medium. **Complexity**: Medium.

**Decision (3a): Option 1 — Vitest + React Testing Library + jsdom**, scoped to `client/`. It reuses
the Vite pipeline (no separate transform), is ESM-native, has a Jest-compatible API, and is physically
isolated from the backend Jest run by living in `client/` (C3). The two-framework cost is negligible
given the package boundary and API similarity.

### Sub-decision 3b: E2E approach

#### Option 1: Playwright
- **Description**: Playwright drives a real Chromium/Firefox/WebKit against a running app (seeded DB + Express serving the built SPA or dev proxy).
- **Pros**: Cross-browser (covers the productBrief support matrix incl. WebKit/Safari-engine), reliable
  auto-waiting, runs headless in CI, codifies the AC journeys as durable runnable specs; well-suited to
  the AC-NAV-1 direct-URL/refresh test and the "different board → different cards" stub-detection check.
- **Cons**: New dev dependency + browser binaries; CI must build + serve the app and seed the DB.
- **Technical Fit**: High. **Complexity**: Medium.

#### Option 2: Project's existing UAT / Claude-in-Chrome path (`/banyan-uat`)
- **Description**: Use the repo's UAT harness to walk the journeys in a real browser.
- **Pros**: Already part of the workflow (Level 3 runs `/banyan-uat`); persona-driven; emits findings
  and an E2E spec. Good for the **acceptance/exploratory** pass.
- **Cons**: It is an acceptance-validation + spec-generation tool, **not a committed regression suite** —
  on PASS it *produces* an E2E spec that still needs a runner to execute repeatedly. So it complements
  rather than replaces a runnable E2E layer.
- **Technical Fit**: High (as a phase gate). **Complexity**: Low.

**Decision (3b): Use BOTH, in their intended roles — Playwright is the recommended runnable E2E
framework; `/banyan-uat` (Claude-in-Chrome) remains the Level-3 acceptance gate that generates the
E2E spec Playwright implements.** Concretely: Phase 5 implements the AC entry-to-success journeys as
**Playwright** specs (list → click → columns; empty list; empty board; API-unreachable error;
direct-URL `/boards/:id` for AC-NAV-1; back-nav round-trip), seeded against a real Express+Postgres.
This is the durable regression layer. `/banyan-uat` runs at the Level-3 UAT gate (between phase builds
and final E2E implementation) and its generated spec feeds the Playwright implementation. Playwright is
chosen over a Vitest-browser approach because the ACs require **real cross-browser navigation, URL
refresh, and network interception**, which a unit-runner cannot faithfully reproduce.

**Reflection into TASK-006 Test Strategy**: confirm `frontend component/unit = Vitest + RTL (jsdom)`,
`E2E = Playwright` before Phase 2 build. Split unchanged (backend +8–10; frontend component ~14–18;
E2E ~6–8 as Playwright specs). Playwright E2E specs live under `client/e2e/` (kept out of Vitest's
`include` so the two runners do not overlap).

---

## Q4 — Frontend Observability

Constraints: **no third-party analytics/telemetry in MVP** (productBrief); structured-logging ethos
(systemPatterns); never surface internal detail to users (Guiding Principle 5, NFR4). The single HTTP
hop is browser → Express; the backend already owns request tracing/logging. So the frontend strategy
is deliberately **lightweight, self-contained, console-only**.

#### Option 1: Lightweight self-contained client observability — error boundary + global handlers + centralized fetch-error mapping (no SDK)
- **Components**:
  - **React `ErrorBoundary`** at the app root → renders a safe fallback UI and routes the error to a
    single `errorReporter.report()`. Prevents the blank-white-screen failure mode (AC-ERROR-* spirit).
  - **Global handlers** — `window.addEventListener('unhandledrejection', …)` and `'error'` → same `errorReporter`.
  - **`errorReporter.ts`** — the ONLY place the client calls `console.error`, emitting a **structured**
    object `{ level:'error', source, message, ... }` (mirrors the backend's structured-logging ethos,
    on the client's only available sink). No network egress, no third-party SDK (honors NFR5).
  - **Centralized fetch-error mapping in `apiClient.ts`** — every API call maps non-2xx / network
    failure to a typed `ApiError` carrying a **safe, user-facing category** (`notFound` | `network` | `server`),
    **never** the raw response body or stack. Pages render copy from the category (UI/UX owns the words),
    so users never see internal detail (Guiding Principle 5 on the client).
- **Pros**: Zero third-party telemetry (compliant); tiny footprint (Guiding Principle 4); single choke
  point for both UX (error states) and diagnostics (console); satisfies AC-ERROR-1/2 (no blank screen,
  human-readable message, no internal detail); keeps trace correlation server-side where it already lives.
- **Cons**: No client-side aggregation/remote capture — acceptable and intended for a local-first MVP
  with "no telemetry."
- **Technical Fit**: High. **Complexity**: Low.

#### Option 2: Integrate a hosted error-tracking SDK (e.g., Sentry-style)
- **Pros**: Rich remote capture/aggregation.
- **Cons**: **Directly violates "no third-party analytics or telemetry in MVP"**; adds a vendor dep
  and egress from a local-first product. Disqualified.
- **Technical Fit**: Low. **Complexity**: Medium.

#### Option 3: Propagate W3C Trace Context from the browser (OTel web SDK) into `/api/v1` calls
- **Pros**: End-to-end traces from the click.
- **Cons**: Adds an OTel browser SDK (telemetry tooling) for a single hop the backend already traces;
  weight unjustified at MVP (NFR5, Guiding Principle 4). The backend already mints a `traceId` per
  request; client-originated traceparent is a clean future enhancement, not MVP.
- **Technical Fit**: Medium. **Complexity**: Medium.

**Decision (Q4): Option 1 — lightweight, self-contained, console-only client observability** (root
`ErrorBoundary` + global `unhandledrejection`/`error` handlers → single structured `errorReporter`
using `console.error`; centralized safe fetch-error mapping in `apiClient.ts`). This is the only option
that honors "no third-party telemetry," keeps the footprint minimal (Guiding Principle 4), and enforces
Guiding Principle 5 on the client (users see a safe category, diagnostics go to the console only). A
hosted SDK (Option 2) is disqualified by policy; browser OTel propagation (Option 3) is a documented
future enhancement.

**Note on `console.error`**: systemPatterns bans `console.*` in **production backend** code (it has a
pino sink). The browser has **no pino**; `console.error` confined to the single `errorReporter` module
is the idiomatic client sink and does not violate the backend rule. This boundary is documented so the
build agents do not flag it.

---

## Evaluation Matrix

Scores are for the **recommended composite** (Vite + separate `client/` + Express-static single-origin
+ varchar status + Vitest/Playwright + lightweight observability) against the principal rejected
alternative for each axis.

| Criteria | Recommended (Vite/`client/`/Express-static) | nginx 2-service + monorepo-in-`src/` |
|----------|---------------------------------------------|--------------------------------------|
| Scalability (to product needs) | High | High (but over-built) |
| Maintainability | High (clean tier boundary, no config edits to backend) | Medium (entangled deps / extra service) |
| Performance | High (single origin, no proxy hop in prod, <2s budget easily met) | High |
| Security / error hygiene | High (single origin → no CORS; GP5 enforced client-side) | Medium (more surfaces) |
| Observability | High (structured console reporter, no telemetry) | High |
| Implementation Cost | Low (one tool, one new dir, additive migration) | High (Dockerfile/nginx, config fences) |
| Dev/Prod Parity | High (relative `/api/v1` in dev via proxy + prod via static) | Medium |
| Guiding-Principle 4 fit | High (simplest thing that works) | Low (complexity unearned) |

---

## Observability Architecture

### Logging
- **Backend (Phase 1)**: unchanged — reuse existing `pino` structured JSON via `req.log` for card
  business events; zero `console.*`. The `status` change adds no new sink.
- **Frontend**: a single `client/src/observability/errorReporter.ts` emits **structured** error objects
  via `console.error` (the browser's only sink). No third-party telemetry (NFR5). No network egress.

### Distributed Tracing
- **SDK**: none added on the client for MVP (NFR5, Guiding Principle 4).
- **Propagation**: the backend continues to mint/extract W3C Trace Context per request
  (`extractTraceContext`/`requestLogger`). The browser is the trace originator; client-originated
  `traceparent` injection is a documented **future enhancement** (Q4 Option 3), not MVP.

| From | To | Protocol | Propagation Method |
|------|-----|----------|--------------------|
| Browser (React) | Express `/api/v1` | HTTP (relative, same origin) | None client-side in MVP; Express mints `traceId` per request (existing) |

### Metrics
- Deferred — consistent with the backend (systemPatterns "Metrics: deferred"). No client metrics in MVP.

### Configuration Variables

New/affected env vars (all read via the existing single-config-source discipline on the backend, or
Vite's `VITE_`/`import.meta.env` on the frontend):

| Variable | Tier | Purpose | Default |
|----------|------|---------|---------|
| `SERVE_CLIENT` | Backend (`env.ts`) | Enable static serving of `client/dist` + SPA fallback (prod only) | `false` |
| `CLIENT_DIST_PATH` | Backend (`env.ts`) | Path to the built SPA assets | `client/dist` (resolved) |
| `VITE_API_PROXY_TARGET` | Frontend (`vite.config.ts`, dev) | Dev-proxy target for `/api/v1` | `http://localhost:3000` |
| (existing) `LOG_LEVEL`, `OTEL_*`, `DATABASE_URL`, `PORT` | Backend | Unchanged | — |

`SERVE_CLIENT`/`CLIENT_DIST_PATH` follow the existing `env.ts` validation pattern (fail-fast, frozen
config) and default to the dev-safe values so `npm run dev`, `npm test`, and supertest are unaffected.

---

## Decision (Summary)

**Chosen composite architecture:**

- **Q1a Build tool**: **Vite** (React + TS). *(Rejected: CRA — deprecated; Next.js — overkill, GP4.)*
- **Q1b Layout**: **Separate `client/` directory with its own `package.json`** and tsconfig subtree.
  *(Rejected: same-`package.json` subtree — entangles ESM/CJS + deps; `frontend/` — naming-only twin.)*
- **Q1c Serving / dev-prod parity**: **Vite dev proxy** (`/api/v1` → `http://localhost:3000`) in dev;
  **Express serves `client/dist` statically with a SPA history fallback** in prod — single origin,
  single port (3000), satisfies AC-NAV-1. *(Rejected: nginx 2-service; separate origin + CORS — GP4.)*
- **Q1d tsconfig**: backend `tsconfig.json` untouched; new `client/tsconfig.json` (+ `tsconfig.node.json`),
  ESM/Bundler, DOM libs. Module-system split resolved structurally by the `client/` boundary.
- **Q1e env**: API base is **relative `/api/v1`** (no absolute URL baked in — most 12-Factor); dev-proxy
  target via `VITE_API_PROXY_TARGET`; browser config via `import.meta.env.VITE_*` (build-time).
- **Q1f Compose**: **keep postgres-only**; Express + Vite on host (matches current model). Prod
  single-image Dockerfile is a clean additive follow-up (not in scope).
- **Q2 status schema**: **`varchar(20)`, app-layer validation** (no DB CHECK/enum), `NOT NULL DEFAULT 'todo'`,
  migration backfills existing rows; create/update accept + validate `status` (invalid → 400, default `'todo'`);
  `status` added to the single `RETURNING_COLUMNS` constant. *(Rejected: CHECK — deferred hardening; native ENUM — evolution pain, GP4.)*
- **Q3 testing**: **Vitest + RTL (jsdom)** for component/unit (reuses Vite pipeline, isolated in `client/`);
  **Playwright** for runnable E2E; **`/banyan-uat`** remains the Level-3 acceptance gate that generates the E2E spec.
- **Q4 observability**: **lightweight, self-contained, console-only** — root `ErrorBoundary` + global
  `unhandledrejection`/`error` handlers → single structured `errorReporter`; centralized safe fetch-error
  mapping in `apiClient.ts` (no third-party telemetry; GP5 on the client). *(Rejected: hosted SDK — policy; browser OTel — GP4/future.)*

### Rationale

Every decision favors the **simplest topology that satisfies the ACs and NFRs** (Guiding Principle 4):
one build tool, one new directory with a clean tier boundary, one origin and one port in both dev and
prod, an additive column on the existing card layer using the established varchar/validate-before-DB
pattern, test runners that reuse the build pipeline and live behind the package boundary, and an
observability strategy that adds no telemetry and no tracing weight while still preventing blank screens
and internal-detail leakage. The single-origin static-serve choice is the linchpin: it eliminates CORS,
removes the need for a build-time absolute API URL, and is the mechanism that satisfies AC-NAV-1's SPA
history fallback — all without a second container.

### Trade-offs Accepted

- **Two test frameworks (Jest backend, Vitest frontend)** — accepted: cleanly partitioned by package,
  near-identical APIs; the alternative (Jest-over-Vite) is more config for worse fit.
- **Express gains a static-serving responsibility (prod)** — accepted: gated behind `SERVE_CLIENT`,
  registered after `/api/v1`/`/health` so it never shadows the API; far simpler than an nginx tier.
- **No remote error capture / no client tracing in MVP** — accepted and required by NFR5 ("no telemetry").
- **Browser-reachable config is build-time** (Vite) — accepted: the only such value is the relative API
  base; a different prod value would rebuild the single image, which is fine for self-hosting.
- **No DB-level CHECK on `status`** — accepted: the API is the sole writer and validate-before-DB guards
  every write; a CHECK is a documented future hardening.

---

## Implementation Guidelines

### Recommended project/file layout

```
agentic-banyanboard/
├── package.json                 # backend — UNCHANGED deps; (optional) root convenience scripts
├── tsconfig.json                # backend — UNCHANGED (NodeNext, include src/**/*.ts)
├── jest.config.js               # backend — UNCHANGED (roots: src)
├── docker-compose.yml           # UNCHANGED (postgres only)
├── migrations/
│   ├── 1781743422435_create-boards-table.js
│   ├── 1781746875601_create-cards-table.js
│   └── <ts>_add-status-to-cards.js          # NEW (Phase 1)
├── src/                         # backend (Node, CJS) — status threads through here (Phase 1)
│   ├── db/cards.ts              # +status in RETURNING_COLUMNS, params, update() builder
│   ├── validation/card.ts       # +CardStatus, checkStatus, create/update integration
│   ├── routes/cards.ts          # likely unchanged (status flows via ...input)
│   ├── config/env.ts            # +SERVE_CLIENT, +CLIENT_DIST_PATH (Phase 2/5, validated, defaulted false)
│   └── app.ts                   # +gated static + SPA-fallback after /api/v1, before notFound (Phase 5)
└── client/                      # NEW frontend package (browser, ESM) — Phases 2–5
    ├── package.json             # react, react-dom, react-router-dom, vite, vitest, @testing-library/*, @playwright/test
    ├── tsconfig.json            # ESM/Bundler, lib DOM, jsx react-jsx, strict + noUncheckedIndexedAccess, noEmit
    ├── tsconfig.node.json       # for vite.config.ts (Node context)
    ├── vite.config.ts           # plugin-react; server.proxy /api/v1 → VITE_API_PROXY_TARGET; build outDir dist
    ├── index.html               # SPA shell (Vite entry)
    ├── .env.development         # VITE_API_PROXY_TARGET=http://localhost:3000
    ├── src/
    │   ├── main.tsx             # React root mount + Router + ErrorBoundary
    │   ├── App.tsx              # route table: '/' → BoardList, '/boards/:id' → BoardView
    │   ├── api/
    │   │   ├── apiClient.ts     # typed fetch wrappers; safe ApiError mapping (network|notFound|server)
    │   │   └── types.ts         # Board, Card (incl. status), CardStatus union — mirror backend
    │   ├── pages/
    │   │   ├── BoardList.tsx        + BoardList.test.tsx
    │   │   └── BoardView.tsx        + BoardView.test.tsx
    │   ├── components/
    │   │   ├── BoardEntry.tsx
    │   │   ├── Column.tsx           + Column.test.tsx
    │   │   ├── CardItem.tsx         + CardItem.test.tsx
    │   │   └── states/ (Loading, Empty, Error)   # visual treatment → UI/UX phase
    │   └── observability/
    │       └── errorReporter.ts # single structured console.error sink; ErrorBoundary + global handlers
    └── e2e/                     # Playwright specs (Phase 5) — OUTSIDE Vitest include
        └── *.spec.ts
```

### Dev workflow (single origin via proxy)
1. `docker compose up` (Postgres) + `npm run migrate` (applies the `status` migration).
2. `npm run dev` (Express on :3000) in the repo root.
3. `npm run dev` inside `client/` (Vite on :5173). Browser hits `http://localhost:5173`; `/api/v1` calls
   are proxied to `:3000`. Frontend code always calls **relative `/api/v1/...`** (parity with prod).

### Prod workflow (single image/origin)
1. `npm --prefix client run build` → `client/dist/`.
2. Run Express with `SERVE_CLIENT=true` → Express serves `client/dist` + returns `index.html` for
   non-API GETs (AC-NAV-1). Single port 3000.

### Phase mapping (consumes this doc)
- **Phase 1 (backend `status`)**: implement the migration + the `src/db/cards.ts` / `src/validation/card.ts`
  changes + tests per the Q2 table. No frontend touched. Delivers AC-STATUS-1.
- **Phase 2 (frontend foundation)**: scaffold `client/` (Vite React-TS), tsconfig split, `vite.config.ts`
  proxy, router skeleton, `apiClient.ts` + `types.ts` (incl. `status`), `ErrorBoundary` + `errorReporter`.
  Vitest + RTL configured. (Defer `SERVE_CLIENT`/static serving to Phase 5.)
- **Phase 3 (board list)**: BoardList page + states. AC-ENTRY-1/2, AC-ERROR-1, AC-LOADING-1.
- **Phase 4 (board view)**: BoardView, three `status`-mapped columns, CardItem, states, back-nav.
  AC-HAPPY-1/2/3, AC-ERROR-2, AC-LOADING-1, and partition-by-`status`.
- **Phase 5 (E2E + serving)**: add `SERVE_CLIENT`/`CLIENT_DIST_PATH` to `env.ts`, the gated static +
  SPA-fallback middleware in `app.ts`, and Playwright specs (incl. AC-NAV-1 direct-URL + back-nav).

### Decisions the UI/UX creative phase depends on (explicit hand-off)
- **Build tool = Vite** and **layout = `client/` with React + react-router-dom** — UI/UX components are
  authored as `.tsx` under `client/src/components` and `client/src/pages`.
- **CSS strategy recommendation (tooling-level, UI/UX owns visuals)**: **adopt plain CSS Modules**
  (built into Vite, zero extra deps, scoped class names, no runtime) as the default styling mechanism;
  this keeps the toolchain minimal (Guiding Principle 4) and imposes no design system. **Tailwind is a
  viable alternative** but adds a PostCSS/Tailwind build step and a utility-class paradigm — a real
  build-tooling commitment. **Recommendation: default to CSS Modules; if UI/UX strongly prefers Tailwind,
  it is compatible with Vite and can be added in Phase 2** — but the *visual* system (palette, type,
  spacing, component look, empty/error/loading treatment, WCAG contrast) is UI/UX's call. Flag this back
  to creative question 1 (CSS framework choice) as a tooling input.
- **Accessibility enablers (architectural)**: client-side routing must **manage focus on route change**
  (move focus to the new page's `<h1>`/main landmark) and use **semantic landmarks** (`<main>`, `<nav>`,
  headings) and real `<a>`/`<button>` elements for board entries and back-nav — so UI/UX's WCAG 2.1 AA
  work (contrast, focus indicators, keyboard nav) has a sound structural base. Visual specifics deferred.

---

## Validation Checklist

- [x] Meets all system requirements (R1–R7 mapped to decisions/phases)
- [x] Respects technical constraints (C1–C6: module split, build/test isolation, single host, env config, fixed composition order)
- [x] Addresses non-functional requirements (perf single-origin <2s; a11y enablers; browser matrix; error hygiene; no-telemetry observability)
- [x] Technically feasible with current constraints (additive `client/`, additive migration, gated middleware)
- [x] Risks identified and acceptable (see Risk Assessment)
- [x] Complies with Guiding Principles (1: env config; 4: simplest topology; 5: no client-side internal-detail leak) — no deviations
- [x] Respects established patterns (validate-before-DB, `RETURNING_COLUMNS` single-source, fixed `createApp()` order, scoped `express.json()`)
- [x] Observability architecture defined (backend unchanged; lightweight self-contained client reporter; no telemetry)
- [x] Trace context across boundaries addressed (single browser→Express hop; backend mints `traceId`; client OTel deferred)
- [x] Logging strategy consistent with systemPatterns (structured; backend pino unchanged; client `console.error` boundary documented as the browser sink)
- [x] Metrics strategy consistent (deferred, as backend)

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| SPA fallback shadows `/api/v1` (API miss returns `index.html` instead of JSON 404) | M | H | Register static+fallback AFTER `/api/v1`/`/health`, BEFORE `notFound`; fallback handles only non-`/api`,non-`/health` GETs; keep `notFound` JSON contract intact; E2E asserts API 404 is JSON |
| Backend `tsc`/Jest accidentally compiles/runs frontend `.tsx` | L | M | `client/` is outside backend `include: ["src/**/*.ts"]` and Jest `roots: ['<rootDir>/src']` — isolation is structural, no config edits needed; verify backend `npm run build`/`npm test` still green after `client/` lands |
| ESM (Vite) vs CJS (Node) tsconfig conflict | L | M | Separate `client/tsconfig.json` subtree (Bundler/ESM, DOM libs); backend tsconfig untouched |
| `status` value drift between validator union and DB | L | M | No DB CHECK; the validator's `CARD_STATUSES` is the single source of truth; DB column is permissive varchar; tests assert invalid → 400 no-write |
| Build-time API base prevents env override in prod | L | L | API base is relative (`/api/v1`) — no host baked in; single-origin removes the need; documented |
| Two test runners cause CI confusion | L | L | Root runs backend Jest; `client/` runs Vitest + Playwright via its own scripts; document both in techContext before Phase 2 |
| `console.error` in client flagged by the no-`console.*` rule | L | L | Confine to `errorReporter.ts`; document that the rule targets the backend (pino sink); browser has no pino |

---

## Next Steps

1. **Phase 1** — create `migrations/<ts>_add-status-to-cards.js`; thread `status` through `src/db/cards.ts`
   (`RETURNING_COLUMNS`, params, `update()` builder), `src/validation/card.ts` (`CardStatus`/`checkStatus`/create+update),
   confirm `src/routes/cards.ts`; extend `card.test.ts`/`cards.test.ts`. Verify `\d cards`, backfill, down.
2. **Update TASK-006 Test Strategy** to confirm Vitest + RTL (component) and Playwright (E2E) before Phase 2.
3. **Hand off to UI/UX creative** with the explicit dependencies above (Vite + `client/` + react-router;
   CSS Modules default vs Tailwind option; focus-management + semantic-landmark a11y enablers).
4. **Phase 2** — scaffold `client/` per the layout tree (Vite React-TS, tsconfig split, proxy, router,
   apiClient/types, ErrorBoundary/errorReporter, Vitest).
5. **Phases 3–4** — board list and board view pages + state components, consuming the UI/UX visual spec.
6. **Phase 5** — add `SERVE_CLIENT`/`CLIENT_DIST_PATH` to `env.ts`, gated static + SPA-fallback in `app.ts`,
   Playwright E2E (incl. AC-NAV-1). Run `/banyan-uat` at the Level-3 gate before final E2E implementation.
