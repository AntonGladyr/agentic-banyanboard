---
name: "Learned: Error Handling"
globs: ["src/middleware/errorHandler.ts", "src/**/*.ts"]
topics: ["error-handling", "express", "security"]
priority: low
evidence_count: 1
last_updated: 2026-06-16
auto_generated: true
---

# Error Handling

- In Express error middleware, type `err` as `unknown` and narrow via an `ErrorLike` interface before reading `.status`/`.statusCode`/`.message`; never echo `err.message` or `err.stack` to the HTTP response body — log them server-side only and return a fixed generic label.

## Evidence

| Learning | Source | Date |
|----------|--------|------|
| Type err as unknown, narrow via ErrorLike, no stack/message leak to client | [reflection-TASK-001.md](../../reflection/reflection-TASK-001.md) | 2026-06-16 |
