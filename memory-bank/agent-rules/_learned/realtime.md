---
name: "Learned: Real-Time Transport Patterns"
globs: ["src/realtime/**", "client/src/realtime/**"]
topics: ["realtime", "sse", "transport", "backend", "architecture"]
priority: low
evidence_count: 1
last_updated: 2026-06-21
auto_generated: true
---

# Real-Time Transport Patterns

- For server-push-only features on a single-host Express app, prefer SSE over WebSocket: mount it as a plain `GET /api/v1/.../events` route inside `createApp()` (not on the HTTP server) so it stays supertest-injectable, rides the existing Vite `/api/v1` HTTP proxy with no `ws: true` change, and gets native `EventSource` reconnection for free.

## Evidence

| Learning | Source | Date |
|----------|--------|------|
| SSE-in-createApp() over WebSocket for single-host server-push (testable, proxy-free, native reconnect) | [reflection-TASK-007.md](../../reflection/reflection-TASK-007.md) | 2026-06-21 |
