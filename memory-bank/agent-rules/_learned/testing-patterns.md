---
name: "Learned: Testing Patterns"
globs: ["**/*.test.ts", "*.test.ts"]
topics: ["testing", "jest", "logging"]
priority: low
evidence_count: 1
last_updated: 2026-06-16
auto_generated: true
---

# Testing Patterns

- When testing Express middleware that emits structured pino log output, configure the logger to write through `process.stdout` explicitly (not pino's default fd destination) so `jest.spyOn(process.stdout, 'write')` captures serialized log lines.

## Evidence

| Learning | Source | Date |
|----------|--------|------|
| pino test capture requires explicit process.stdout destination | [reflection-TASK-001.md](../../reflection/reflection-TASK-001.md) | 2026-06-16 |
