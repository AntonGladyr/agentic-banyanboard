---
name: "Learned: API Design"
globs: ["src/app.ts", "src/index.ts", "src/middleware/**/*.ts", "src/routes/**/*.ts", "src/db/**/*.ts"]
topics: ["api-design", "express", "testability", "routing"]
priority: medium
evidence_count: 4
last_updated: 2026-06-18
auto_generated: true
---

# API Design

- Separate the Express app factory (`createApp(): Express`) from the process entry (`index.ts`) so integration tests can instantiate the app via `request(createApp())` without binding a port or requiring signal handlers.
- Mount `express.json()` (or other body parsers) on the domain router rather than `app.ts` when that domain is the sole body-accepting surface — avoids a global side-effect on the documented app composition; refactor to a global mount only when a second body-accepting domain is added.
- Mount child-resource routers with `Router({ mergeParams: true })` so the parent-mount path parameter (e.g., `:boardId`) is accessible via `req.params` inside the child router without manual `req.baseUrl` parsing.
- Before inserting a child FK row, run a pre-flight `findById` on the parent entity and return `notFoundError` (404) if absent — keeps error handling uniform with the validate-before-DB principle and avoids interpreting pg FK violation code `23503` in the route layer (the DB FK + `ON DELETE CASCADE` still guarantee integrity).

## Evidence

| Learning | Source | Date |
|----------|--------|------|
| createApp() factory split from index.ts for supertest-injectable tests | [reflection-TASK-001.md](../../reflection/reflection-TASK-001.md) | 2026-06-16 |
| scope express.json() to the domain router when it is the sole body-accepting domain | [reflection-TASK-004.md](../../reflection/reflection-TASK-004.md) | 2026-06-17 |
| Router({ mergeParams: true }) exposes parent-mount param in child-resource router | [reflection-TASK-005.md](../../reflection/reflection-TASK-005.md) | 2026-06-18 |
| pre-flight parent findById → 404 before inserting a child FK row | [reflection-TASK-005.md](../../reflection/reflection-TASK-005.md) | 2026-06-18 |
