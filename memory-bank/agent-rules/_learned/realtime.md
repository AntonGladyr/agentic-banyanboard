---
name: "Learned: Real-Time Transport Patterns"
globs: ["src/realtime/**", "client/src/realtime/**"]
topics: ["realtime", "sse", "transport", "backend", "architecture"]
priority: low
evidence_count: 2
last_updated: 2026-06-30
auto_generated: true
---

# Real-Time Transport Patterns

- For server-push-only features on a single-host Express app, prefer SSE over WebSocket: mount it as a plain `GET /api/v1/.../events` route inside `createApp()` (not on the HTTP server) so it stays supertest-injectable, rides the existing Vite `/api/v1` HTTP proxy with no `ws: true` change, and gets native `EventSource` reconnection for free.
- When a real-time event must reach ALL clients including the originator (no echo-de-dup), omit `originId` from that event's TypeScript interface entirely rather than adding a type-specific exception to the de-dup guard — the structural absence is self-documenting and immune to future guard refactors. Add the new event as an additive member of the `RealtimeEventType` union so the generic broadcaster/eventsRouter need no transport change.

## Evidence

| Learning | Source | Date |
|----------|--------|------|
| SSE-in-createApp() over WebSocket for single-host server-push (testable, proxy-free, native reconnect) | [reflection-TASK-007.md](../../reflection/reflection-TASK-007.md) | 2026-06-21 |
| Omit originId from events that must reach all clients (structural no-echo-dedup); additive union member needs no transport change | [reflection-TASK-008.md](../../reflection/reflection-TASK-008.md) | 2026-06-30 |
