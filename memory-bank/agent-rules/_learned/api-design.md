---
name: "Learned: API Design"
globs: ["src/app.ts", "src/index.ts", "src/middleware/**/*.ts", "src/routes/**/*.ts"]
topics: ["api-design", "express", "testability"]
priority: low
evidence_count: 2
last_updated: 2026-06-17
auto_generated: true
---

# API Design

- Separate the Express app factory (`createApp(): Express`) from the process entry (`index.ts`) so integration tests can instantiate the app via `request(createApp())` without binding a port or requiring signal handlers.
- Mount `express.json()` (or other body parsers) on the domain router rather than `app.ts` when that domain is the sole body-accepting surface — avoids a global side-effect on the documented app composition; refactor to a global mount only when a second body-accepting domain is added.

## Evidence

| Learning | Source | Date |
|----------|--------|------|
| createApp() factory split from index.ts for supertest-injectable tests | [reflection-TASK-001.md](../../reflection/reflection-TASK-001.md) | 2026-06-16 |
| scope express.json() to the domain router when it is the sole body-accepting domain | [reflection-TASK-004.md](../../reflection/reflection-TASK-004.md) | 2026-06-17 |
