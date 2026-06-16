---
name: "Learned: Testing Patterns"
globs: ["**/*.test.ts", "*.test.ts", "src/db/**"]
topics: ["testing", "jest", "logging", "mocking"]
priority: low
evidence_count: 2
last_updated: 2026-06-16
auto_generated: true
---

# Testing Patterns

- When testing Express middleware that emits structured pino log output, configure the logger to write through `process.stdout` explicitly (not pino's default fd destination) so `jest.spyOn(process.stdout, 'write')` captures serialized log lines.
- When testing a module that wraps a third-party class and uses `jest.resetModules()` + re-require, cache the mock constructor on `globalThis` before any `resetModules()` call so `instanceof` checks and call-count assertions on the shared mock class stay stable across module re-initialization.

## Evidence

| Learning | Source | Date |
|----------|--------|------|
| pino test capture requires explicit process.stdout destination | [reflection-TASK-001.md](../../reflection/reflection-TASK-001.md) | 2026-06-16 |
| globalThis-cached mock constructor preserves instanceof across jest.resetModules() | [reflection-TASK-002.md](../../reflection/reflection-TASK-002.md) | 2026-06-16 |
