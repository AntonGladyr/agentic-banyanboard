---
name: "Learned: Frontend (React) Patterns"
globs: ["client/src/**/*.tsx", "client/src/**/*.ts"]
topics: ["frontend", "react", "data-fetching", "error-handling", "realtime"]
priority: medium
evidence_count: 5
last_updated: 2026-06-30
auto_generated: true
---

# Frontend (React) Patterns

- Model a page's data-fetch lifecycle with a discriminated-union `LoadState` (`loading | success | error`), one `AbortController` per `useEffect`, and a `signal.aborted` guard before any `setState` — prevents stale state, setState-after-unmount, and flash-of-wrong-state on fast responses.
- Key all user-facing error copy on a safe `ApiError.category` enum (`network | notFound | server`) in a centralized `errorCopy.ts`; never pass raw error messages or HTTP status codes to component props, and assert no-internal-detail-leak in tests (GP5).
- In a real-time subscription hook (`EventSource`/WebSocket), keep the event handlers in a `useRef` so the stream is not reopened on every render, and close the connection on unmount to avoid dead subscriptions.
- De-duplicate a user's own mutations from a real-time feed by stamping each write with a per-tab `X-Client-Id` UUID header, echoing it into the event envelope as `originId`, and dropping any event whose `originId` matches the current tab — prevents double-applying optimistic updates with no server-side per-client state.
- Fire optional/non-critical data fetches (activity feed, sidebar panel, notification count) in their own `try/catch` OUTSIDE the primary `Promise.all` for required page data — a non-critical panel's fetch failure must never knock out the whole page; the panel degrades to its own error state while the board renders.

## Evidence

| Learning | Source | Date |
|----------|--------|------|
| LoadState discriminated-union + AbortController + signal.aborted guard for fetch lifecycle | [reflection-TASK-006.md](../../reflection/reflection-TASK-006.md) | 2026-06-21 |
| Centralized errorCopy.ts keyed on safe ApiError.category; no raw detail to components | [reflection-TASK-006.md](../../reflection/reflection-TASK-006.md) | 2026-06-21 |
| EventSource hook: handlers in useRef (no per-render reopen) + close on unmount | [reflection-TASK-007.md](../../reflection/reflection-TASK-007.md) | 2026-06-21 |
| X-Client-Id → originId echo de-dup drops own mutations from the real-time feed | [reflection-TASK-007.md](../../reflection/reflection-TASK-007.md) | 2026-06-21 |
| Fire non-critical panel fetches outside the primary Promise.all so their failure can't block page render | [reflection-TASK-008.md](../../reflection/reflection-TASK-008.md) | 2026-06-30 |
