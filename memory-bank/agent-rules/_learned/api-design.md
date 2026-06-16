---
name: "Learned: API Design"
globs: ["src/app.ts", "src/index.ts", "src/middleware/**/*.ts"]
topics: ["api-design", "express", "testability"]
priority: low
evidence_count: 1
last_updated: 2026-06-16
auto_generated: true
---

# API Design

- Separate the Express app factory (`createApp(): Express`) from the process entry (`index.ts`) so integration tests can instantiate the app via `request(createApp())` without binding a port or requiring signal handlers.

## Evidence

| Learning | Source | Date |
|----------|--------|------|
| createApp() factory split from index.ts for supertest-injectable tests | [reflection-TASK-001.md](../../reflection/reflection-TASK-001.md) | 2026-06-16 |
