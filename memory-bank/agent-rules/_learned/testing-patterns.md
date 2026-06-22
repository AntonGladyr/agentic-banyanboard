---
name: "Learned: Testing Patterns"
globs: ["**/*.test.ts", "*.test.ts", "src/db/**", "src/routes/**", "client/e2e/**", "**/*.spec.ts"]
topics: ["testing", "jest", "logging", "mocking", "e2e", "playwright", "realtime"]
priority: medium
evidence_count: 6
last_updated: 2026-06-21
auto_generated: true
---

# Testing Patterns

- When testing Express middleware that emits structured pino log output, configure the logger to write through `process.stdout` explicitly (not pino's default fd destination) so `jest.spyOn(process.stdout, 'write')` captures serialized log lines.
- When testing a module that wraps a third-party class and uses `jest.resetModules()` + re-require, cache the mock constructor on `globalThis` before any `resetModules()` call so `instanceof` checks and call-count assertions on the shared mock class stay stable across module re-initialization.
- When mocking a module consumed by a frozen, import-time `process.env`-reading config, keep the mock as a module-scope `mock`-prefixed `jest.fn` and drive branches via `jest.resetModules()` + re-require — the same `jest.fn` reference survives because `resetModules()` clears only the require cache, not the test file's variables.
- When integration tests must exercise persistence round-trips and stub-detection ACs, back the mocked `getPool().query` with a minimal in-memory store (Map/array + auto-increment counter) that interprets the SQL — simple fixed-response mocks cannot satisfy "created row is genuinely retrievable later" or "two creates yield distinct ids."
- For frontend E2E, make Playwright suites hermetic with `page.route('**/api/v1/**')` to mock the API (no real DB/seed step) while still running the SPA and production static-serving path through a real built server (`node dist/index.js`) — reserve a seeded-DB E2E variant for a follow-up task when true DB round-trip coverage is needed.
- To E2E-verify cross-context server-push (SSE/WebSocket between two browser contexts), add a dedicated real-DB Playwright project (real backend + isolated DB) alongside the hermetic project — a mocked API cannot broadcast an event from one context to another; keep all single-context journeys on the hermetic project.

## Evidence

| Learning | Source | Date |
|----------|--------|------|
| pino test capture requires explicit process.stdout destination | [reflection-TASK-001.md](../../reflection/reflection-TASK-001.md) | 2026-06-16 |
| globalThis-cached mock constructor preserves instanceof across jest.resetModules() | [reflection-TASK-002.md](../../reflection/reflection-TASK-002.md) | 2026-06-16 |
| module-scope mock jest.fn survives resetModules for env-frozen config branches | [reflection-TASK-003.md](../../reflection/reflection-TASK-003.md) | 2026-06-17 |
| in-memory store behind mocked getPool().query makes persistence/stub-detection ACs meaningful | [reflection-TASK-004.md](../../reflection/reflection-TASK-004.md) | 2026-06-17 |
| hermetic Playwright E2E via page.route against real built server; seeded-DB variant as follow-up | [reflection-TASK-006.md](../../reflection/reflection-TASK-006.md) | 2026-06-21 |
| dedicated real-DB Playwright project for cross-context SSE/WebSocket; hermetic project for single-context | [reflection-TASK-007.md](../../reflection/reflection-TASK-007.md) | 2026-06-21 |
