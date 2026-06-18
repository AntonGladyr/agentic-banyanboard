# Learning Log

Chronological record of pattern extraction and consolidation events from task reflections.

---

## 2026-06-16 - TASK-001 Reflection

### Extracted Patterns
- **testing-patterns** → created `agent-rules/_learned/testing-patterns.md` (evidence count: 1)
- **api-design** → created `agent-rules/_learned/api-design.md` (evidence count: 1)
- **error-handling** → created `agent-rules/_learned/error-handling.md` (evidence count: 1)
- **typescript-config** → created `agent-rules/_learned/typescript-config.md` (evidence count: 1)

### systemPatterns.md Updates
- None (all 4 learnings are coding practices, not novel architecture patterns)

---

## 2026-06-16 - Consolidation (during TASK-001 archive)

- Files before: 4, Files after: 4
- Merged: 0 files (all 4 topics distinct — no >50% overlap)
- Expired: 0 bullets (all created today)
- Promoted: 0 files (evidence_count 1 < promotion threshold 3)
- Pruned: 0 excess bullets (1 bullet/file < max 15)

---

## 2026-06-16 - TASK-002 Reflection

### Extracted Patterns
- **testing-patterns** → amended `agent-rules/_learned/testing-patterns.md` (evidence count: 2) — globalThis-cached mock constructor preserves `instanceof` across `jest.resetModules()`
- **tooling** → created `agent-rules/_learned/tooling.md` (evidence count: 1) — create `.env*` via `tee` (Write/Edit deny-listed)

### systemPatterns.md Updates
- None (both learnings are coding/tooling practices, not novel architecture patterns)

---

## 2026-06-16 - Consolidation (during TASK-002 archive)

- Files before: 5, Files after: 5
- Merged: 0 files (all 5 topics distinct — no >50% overlap)
- Expired: 0 bullets (all created/amended today, < 90-day window)
- Promoted: 0 files (testing-patterns evidence_count 2 < promotion threshold 3; all others 1)
- Pruned: 0 excess bullets (max 2 bullets/file < max 15)

---

## 2026-06-17 - TASK-003 Reflection

### Extracted Patterns
- **testing-patterns** → amended `agent-rules/_learned/testing-patterns.md` (evidence count: 3) — module-scope `mock`-prefixed `jest.fn` survives `jest.resetModules()` when driving branches in a frozen, import-time env-reading config. **Promoted low → medium** (evidence_count reached promotion threshold 3).

### systemPatterns.md Updates
- None (the learning is a coding/test-harness practice, not a novel architecture pattern)

---

## 2026-06-17 - Consolidation (during TASK-003 archive)

- Files before: 5, Files after: 5
- Merged: 0 files (all 5 topics distinct — no >50% overlap)
- Expired: 0 bullets (all created/amended within the 90-day window)
- Promoted: 0 files (testing-patterns already promoted to medium during TASK-003 reflection; all others evidence_count 1 < threshold 3)
- Pruned: 0 excess bullets (max 3 bullets/file < max 15)

---

## 2026-06-17 - TASK-004 Reflection

### Extracted Patterns
- **testing-patterns** → amended `agent-rules/_learned/testing-patterns.md` (evidence count: 4) — back a mocked `getPool().query` with a minimal in-memory store (Map/array + auto-increment counter) so persistence round-trip and stub-detection ACs are meaningfully exercised. (Already medium priority.)
- **api-design** → amended `agent-rules/_learned/api-design.md` (evidence count: 2) — scope `express.json()` to the domain router when it is the sole body-accepting domain; refactor to global only when a second arrives. Globs widened to include `src/routes/**/*.ts`. (Stays low — evidence_count 2 < promotion threshold 3.)

### systemPatterns.md Updates
- None (both learnings are coding/API-convention practices, not novel architecture patterns; the `express.json()` scoping note is captured in the learned api-design rule rather than systemPatterns Guiding Principles)

---

## 2026-06-17 - Consolidation (during TASK-004 archive)

- Files before: 5, Files after: 5
- Merged: 0 files (all 5 topics distinct — no >50% topic/glob overlap)
- Expired: 0 bullets (all created/amended within the 90-day window)
- Promoted: 0 files (testing-patterns already medium; api-design evidence_count 2 < threshold 3; all others 1)
- Pruned: 0 excess bullets (max 4 bullets/file < max 15)

---

## 2026-06-18 - TASK-005 Reflection

### Extracted Patterns
- **api-design** → amended `agent-rules/_learned/api-design.md` (evidence count: 2 → 4) — two child-resource routing learnings: (1) `Router({ mergeParams: true })` exposes the parent-mount param (`:boardId`) inside the child router; (2) pre-flight `findById` on the parent entity → `notFoundError` (404) before inserting a child FK row, avoiding pg `23503` interpretation. Globs widened to include `src/db/**/*.ts`; `routing` topic added. **Promoted low → medium** (evidence_count reached promotion threshold 3).

### systemPatterns.md Updates
- None (both learnings are API-convention/coding practices captured in the learned api-design rule rather than systemPatterns Guiding Principles — consistent with how the express.json() scoping note was handled in TASK-004)

---

## 2026-06-18 - Consolidation (during TASK-005 archive)

- Files before: 5, Files after: 5
- Merged: 0 files (all 5 topics distinct — no >50% topic/glob overlap)
- Expired: 0 bullets (oldest bullet 2 days old — all within the 90-day window)
- Promoted: 0 files (api-design already promoted to medium during the TASK-005 reflection; testing-patterns already medium; error-handling/typescript-config/tooling all evidence_count 1 < threshold 3)
- Pruned: 0 excess bullets (max 4 bullets/file < max 15)
