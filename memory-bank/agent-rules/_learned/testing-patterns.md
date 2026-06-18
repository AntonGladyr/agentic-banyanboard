---
name: "Learned: Testing Patterns"
globs: ["**/*.test.ts", "*.test.ts", "src/db/**", "src/routes/**"]
topics: ["testing", "jest", "logging", "mocking"]
priority: medium
evidence_count: 4
last_updated: 2026-06-17
auto_generated: true
---

# Testing Patterns

- When testing Express middleware that emits structured pino log output, configure the logger to write through `process.stdout` explicitly (not pino's default fd destination) so `jest.spyOn(process.stdout, 'write')` captures serialized log lines.
- When testing a module that wraps a third-party class and uses `jest.resetModules()` + re-require, cache the mock constructor on `globalThis` before any `resetModules()` call so `instanceof` checks and call-count assertions on the shared mock class stay stable across module re-initialization.
- When mocking a module consumed by a frozen, import-time `process.env`-reading config, keep the mock as a module-scope `mock`-prefixed `jest.fn` and drive branches via `jest.resetModules()` + re-require — the same `jest.fn` reference survives because `resetModules()` clears only the require cache, not the test file's variables.
- When integration tests must exercise persistence round-trips and stub-detection ACs, back the mocked `getPool().query` with a minimal in-memory store (Map/array + auto-increment counter) that interprets the SQL — simple fixed-response mocks cannot satisfy "created row is genuinely retrievable later" or "two creates yield distinct ids."

## Evidence

| Learning | Source | Date |
|----------|--------|------|
| pino test capture requires explicit process.stdout destination | [reflection-TASK-001.md](../../reflection/reflection-TASK-001.md) | 2026-06-16 |
| globalThis-cached mock constructor preserves instanceof across jest.resetModules() | [reflection-TASK-002.md](../../reflection/reflection-TASK-002.md) | 2026-06-16 |
| module-scope mock jest.fn survives resetModules for env-frozen config branches | [reflection-TASK-003.md](../../reflection/reflection-TASK-003.md) | 2026-06-17 |
| in-memory store behind mocked getPool().query makes persistence/stub-detection ACs meaningful | [reflection-TASK-004.md](../../reflection/reflection-TASK-004.md) | 2026-06-17 |
