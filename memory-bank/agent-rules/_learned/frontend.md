---
name: "Learned: Frontend (React) Patterns"
globs: ["client/src/**/*.tsx", "client/src/**/*.ts"]
topics: ["frontend", "react", "data-fetching", "error-handling"]
priority: low
evidence_count: 2
last_updated: 2026-06-21
auto_generated: true
---

# Frontend (React) Patterns

- Model a page's data-fetch lifecycle with a discriminated-union `LoadState` (`loading | success | error`), one `AbortController` per `useEffect`, and a `signal.aborted` guard before any `setState` — prevents stale state, setState-after-unmount, and flash-of-wrong-state on fast responses.
- Key all user-facing error copy on a safe `ApiError.category` enum (`network | notFound | server`) in a centralized `errorCopy.ts`; never pass raw error messages or HTTP status codes to component props, and assert no-internal-detail-leak in tests (GP5).

## Evidence

| Learning | Source | Date |
|----------|--------|------|
| LoadState discriminated-union + AbortController + signal.aborted guard for fetch lifecycle | [reflection-TASK-006.md](../../reflection/reflection-TASK-006.md) | 2026-06-21 |
| Centralized errorCopy.ts keyed on safe ApiError.category; no raw detail to components | [reflection-TASK-006.md](../../reflection/reflection-TASK-006.md) | 2026-06-21 |
