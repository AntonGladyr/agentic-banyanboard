# Learning Metrics

## Configuration

| Setting | Value | Description |
|---------|-------|-------------|
| Max learned rule files | 10 | Hard cap on files in `agent-rules/_learned/` |
| Expiry period (days) | 90 | Remove unreinforced bullets after this period |
| Promotion threshold | 3 | Promote to `medium` priority at this evidence count |
| Max bullets per file | 15 | Prune to 10 most-evidenced when exceeded |

## Task History

| Task ID | Date | Learnings Extracted | Rules Amended | Rules Created |
|---------|------|--------------------:|-------------:|-------------:|
| TASK-001 | 2026-06-16 | 4 | 0 | 4 |
| TASK-002 | 2026-06-16 | 2 | 1 | 1 |
| TASK-003 | 2026-06-17 | 1 | 1 | 0 |
| TASK-004 | 2026-06-17 | 2 | 2 | 0 |
| TASK-005 | 2026-06-18 | 2 | 1 | 0 |
| TASK-006 | 2026-06-21 | 4 | 2 | 1 |
| TASK-007 | 2026-06-21 | 4 | 2 | 1 |

## Rule Effectiveness

| File | Topics | Evidence Count | Priority | Last Updated |
|------|--------|---------------:|:--------:|:------------:|
| testing-patterns.md | testing, jest, logging, mocking, e2e, playwright, realtime | 6 | medium | 2026-06-21 |
| api-design.md | api-design, express, testability, routing | 4 | medium | 2026-06-18 |
| error-handling.md | error-handling, express, security | 1 | low | 2026-06-16 |
| typescript-config.md | typescript, config, 12-factor | 1 | low | 2026-06-16 |
| tooling.md | tooling, env-files, claude-code-settings, npm, monorepo | 2 | low | 2026-06-21 |
| frontend.md | frontend, react, data-fetching, error-handling, realtime | 4 | medium | 2026-06-21 |
| realtime.md | realtime, sse, transport, backend, architecture | 1 | low | 2026-06-21 |

## Consolidation History

| Date | Rules Before | Rules After | Merged | Expired | Promoted |
|------|------------:|------------:|-------:|--------:|---------:|
| 2026-06-16 | 4 | 4 | 0 | 0 | 0 |
| 2026-06-16 | 5 | 5 | 0 | 0 | 0 |
| 2026-06-17 | 5 | 5 | 0 | 0 | 0 |
| 2026-06-17 | 5 | 5 | 0 | 0 | 0 |
| 2026-06-18 | 5 | 5 | 0 | 0 | 0 |
| 2026-06-21 | 6 | 6 | 0 | 0 | 0 |
| 2026-06-21 | 7 | 7 | 0 | 0 | 1 |
