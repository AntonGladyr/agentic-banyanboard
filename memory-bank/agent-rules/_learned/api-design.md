---
name: "Learned: API Design"
globs: ["src/app.ts", "src/index.ts", "src/middleware/**/*.ts", "src/routes/**/*.ts", "src/db/**/*.ts", "scripts/*.mjs"]
topics: ["api-design", "express", "testability", "routing", "migrations", "deployment"]
priority: medium
evidence_count: 5
last_updated: 2026-06-30
auto_generated: true
---

# API Design

- Separate the Express app factory (`createApp(): Express`) from the process entry (`index.ts`) so integration tests can instantiate the app via `request(createApp())` without binding a port or requiring signal handlers.
- Mount `express.json()` (or other body parsers) on the domain router rather than `app.ts` when that domain is the sole body-accepting surface — avoids a global side-effect on the documented app composition; refactor to a global mount only when a second body-accepting domain is added.
- Mount child-resource routers with `Router({ mergeParams: true })` so the parent-mount path parameter (e.g., `:boardId`) is accessible via `req.params` inside the child router without manual `req.baseUrl` parsing.
- Before inserting a child FK row, run a pre-flight `findById` on the parent entity and return `notFoundError` (404) if absent — keeps error handling uniform with the validate-before-DB principle and avoids interpreting pg FK violation code `23503` in the route layer (the DB FK + `ON DELETE CASCADE` still guarantee integrity).
- Apply database migrations as an explicit step in every deployment and E2E test-harness startup (e.g. `node-pg-migrate up` in `scripts/e2e-db-setup.mjs` before `node dist/index.js`); never assume a new feature's migration is already applied — a missing table yields a runtime 500 that unit tests cannot catch but UAT/E2E will. Confirm the migrate command loads `DATABASE_URL` (e.g. via `.env`/dotenv) or pass it explicitly.

## Evidence

| Learning | Source | Date |
|----------|--------|------|
| createApp() factory split from index.ts for supertest-injectable tests | [reflection-TASK-001.md](../../reflection/reflection-TASK-001.md) | 2026-06-16 |
| scope express.json() to the domain router when it is the sole body-accepting domain | [reflection-TASK-004.md](../../reflection/reflection-TASK-004.md) | 2026-06-17 |
| Router({ mergeParams: true }) exposes parent-mount param in child-resource router | [reflection-TASK-005.md](../../reflection/reflection-TASK-005.md) | 2026-06-18 |
| pre-flight parent findById → 404 before inserting a child FK row | [reflection-TASK-005.md](../../reflection/reflection-TASK-005.md) | 2026-06-18 |
| apply migrations explicitly in deploy + E2E harness startup; a missing migration is a 500 unit tests miss | [reflection-TASK-008.md](../../reflection/reflection-TASK-008.md) | 2026-06-30 |
