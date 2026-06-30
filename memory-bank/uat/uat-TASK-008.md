# UAT Report: Realtime Activity Feed

**Journey**: TASK-008-activity-feed-user-journey
**Run Date**: 2026-06-30T17:40:00Z
**Run ID**: 20260630-001
**Task**: TASK-008
**Feature**: FEAT-008
**Sections Run**: happy, mobile (default sections; errors + scoping checks folded into happy via API probes)
**Environment**: http://localhost:5173 (dev — Vite SPA; backend :3000, REALTIME_ENABLED=true)
**UAT Agent Version**: 1.8.0
**Result**: PASS_WITH_RECOMMENDATIONS

**Counts**: Required=0  Recommended=3  Optional=0
**Confidence Distribution**: high=2  medium=0  low=1 (low capped to Recommended: 1)

**Artifacts**: memory-bank/uat/artifacts/20260630-001/

> **Execution note**: This run was orchestrator-driven (a single shared Chrome window precludes the
> parallel sub-agent walkers the architecture normally dispatches; the entire journey is one persona —
> Alex the Dev — so a serial walk is equivalent). Evidence is the exported happy-path GIF plus inline
> network-request and DOM probes captured first-hand during the walk.

---

## Summary

The realtime activity feed works end-to-end on the board view. The feed renders as a right-sidebar
panel alongside the kanban (AC-ENTRY-1), shows "No activity yet" on an empty board (AC-EMPTY-1), loads
persisted history newest-first on mount (AC-LOAD-1), and delivers new card-move entries live — both to
the originating tab and to a second tab — within ~1 second over SSE (AC-HAPPY-2). The REST contract
(AC-HAPPY-3), error contracts (AC-ERROR-1/2), and board-scoping (AC-SCOPED-1) all verified at the API
layer, and the documented accessibility affordances (aside landmark, `role="list"`, `aria-live="polite"`,
per-entry natural-language `aria-label`, ISO timestamp `title`) are present in the DOM.

**The one issue worth your attention**: on first load the activity endpoint returned **HTTP 500 for every
board** because the feature's Phase-1 migration had never been applied to the dev database. This is a
deployment/setup gap, **not a code defect** — after running `npm run migrate` the endpoint returned 200
and every acceptance criterion passed. It is recorded as UAT-REC-01 so the deploy/runbook can include
the migrate step. The mobile responsive layout could not be verified (the UAT Chrome window cannot be
constrained below ~1536px) — recorded as a low-confidence note, not a defect. Required findings: 0 →
PASS, with an E2E spec generated.

---

## Findings

### Required (0)

None.

### Recommended (3)

#### UAT-REC-01 — Activity migration not applied in the running dev environment (feed 500'd until `npm run migrate`)
- **Severity**: Recommended (operational/deployment — not a code defect; implementation verified correct after remediation)
- **Confidence**: high
- **Section**: happy
- **Step(s)**: Pre-walk (initial board-view load)
- **Persona**: Alex the Dev
- **Source**: walker
- **What happened**: Every board's `GET /api/v1/boards/:id/activity` returned 500. DB introspection showed `activity_events` did not exist; applied migrations stopped at `1781985941842_add-status-to-cards`. The Phase-1 migration `1783022741842_create-activity-events-table` was unapplied in the dev DB.
- **Expected**: `GET .../activity` returns 200 with the board's events (or `[]`).
- **Observed**: `500 {error:'Internal Server Error', traceId}` for boards 1, 2, and 3; `to_regclass('public.activity_events')` = `null`.
- **Repro**:
  1. Run backend + SPA against a dev DB that has not had the TASK-008 migration applied.
  2. Open any board → feed shows the error state; `GET .../activity` → 500.
- **Evidence**:
  - network: `GET /api/v1/boards/1/activity` → `500 {"error":"Internal Server Error","traceId":"07a833cf204aeb968a5f57d1640da983"}`
  - db probe: `to_regclass('public.activity_events') => null`; `pgmigrations` latest = `1781985941842_add-status-to-cards`
- **Suggested fix**: Apply pending migrations as part of deployment (`npm run migrate`); document the step in the runbook / Docker entrypoint. **Remediated during this run** (table + index created; endpoint re-verified 200).
- **References**: —

#### UAT-REC-02 — `npm run migrate` does not load `.env` (fails with SASL "client password must be a string")
- **Severity**: Recommended (developer-experience / ops paper-cut)
- **Confidence**: high
- **Section**: happy (encountered during UAT-REC-01 remediation)
- **Step(s)**: Pre-walk
- **Persona**: Alex the Dev
- **Source**: walker
- **What happened**: `npm run migrate` (`node-pg-migrate up`) failed to connect because `DATABASE_URL` from `.env` was not loaded — it connected with no password. The backend server itself loads `.env` via `src/config/env.ts`, but the migrate script does not. Migration succeeded only after passing `DATABASE_URL` explicitly in the environment.
- **Expected**: `npm run migrate` uses the same `DATABASE_URL` as the app (from `.env`).
- **Observed**: `could not connect to postgres: Error: SASL: SCRAM-SERVER-FIRST-MESSAGE: client password must be a string`.
- **Repro**:
  1. With `DATABASE_URL` set only in `.env`, run `npm run migrate`.
  2. Connection fails with the SASL error.
- **Evidence**:
  - console: `npm run migrate → "could not connect to postgres: Error: SASL: SCRAM-SERVER-FIRST-MESSAGE: client password must be a string"`
  - console: `DATABASE_URL=... npx node-pg-migrate up → "Migrations complete!"`
- **Suggested fix**: Have the migrate npm script load `.env` (e.g., `node -r dotenv/config node_modules/.bin/node-pg-migrate up`, a `node-pg-migrate` config file, or `dotenv-cli`) so dev and CI use one source of truth and migrations don't silently use libpq defaults.
- **References**: techContext.md → Development Commands (migrate)

#### UAT-REC-03 — Mobile responsive layout could not be verified (window cannot be constrained below ~1536px)
- **Severity**: Recommended (capped from low confidence; no defect observed — verification gap)
- **Confidence**: low
- **Section**: mobile
- **Step(s)**: Step 1 (set mobile viewport)
- **Persona**: Alex the Dev
- **Source**: walker
- **What happened**: `resize_window(390×780)` reported success but `window.innerWidth` stayed `1536`; the `@media (max-width: 900px)` breakpoint never engaged, so the "feed stacks below kanban" behavior could not be observed.
- **Expected**: At ≤900px the ActivityFeed stacks below a full-width kanban (UI/UX creative Option 4).
- **Observed**: Viewport pinned at 1536px; desktop sidebar layout rendered.
- **Repro**:
  1. `resize_window` to 390×780.
  2. Read `window.innerWidth` → still 1536.
- **Evidence**:
  - console: `window.innerWidth=1536, innerHeight=770 after resize_window(390x780)`
- **Suggested fix**: Verify via DevTools device emulation, or assert the responsive stack-below in a Playwright test with an explicit `viewport` in the Phase-4 E2E suite.
- **References**: memory-bank/creative/TASK-008-activity-feed-uiux.md → Responsive Behavior

### Optional (0)

None.

---

## Journey Coverage

### Section: happy (serial)
- [✓] Step 1: Navigate to base URL — board list loads — PASS
- [✓] Step 3: Board view loads — feed panel visible (AC-ENTRY-1) + empty state (AC-EMPTY-1) — PASS
  - AC-LOADING-1: implemented per spec; not visually triggerable on localhost (sub-200ms fetch under the Spinner's 200ms appearance delay — by design). Non-blank load states confirmed.
- [✓] Step 5: Move card (To Do → In Progress) via MoveCardDialog — live entry at top within ~1s (AC-HAPPY-2 own-tab); content title + from→to + "just now" correct — PASS
- [✓] Step 6: Second move + reload — newest-first ordering; persisted history loads on mount (AC-LOAD-1); REST contract (AC-HAPPY-3: 200 array, occurred_at DESC, 8 keys, ISO occurred_at, actor='anonymous') — PASS
- [✓] Step 7: Cross-tab live delivery — Tab B (untouched) receives entry at top within ~1s (AC-HAPPY-2 cross-tab); Tab B kanban also syncs — PASS
- [✓] Step 8: Error contracts — AC-ERROR-1 (404), AC-ERROR-2 (400), AC-SCOPED-1 (board-scoped; board 1's events absent from board 2) — PASS
- [✓] Accessibility (targeted DOM probe): aside landmark + `aria-labelledby` → `h2#activity-heading`; `ul[role=list][aria-live=polite][aria-relevant=additions]`; per-entry `aria-label`; timestamp `title` ISO — PASS

### Section: mobile
- [!] Step 1: Feed stacks below kanban at ≤900px — UNVERIFIED (UAT-REC-03 — environment cannot constrain viewport)

### Section: negatives
- Not applicable — unauthenticated, shared-access MVP (no RBAC/access-denied surface).

### Section: errors
- Folded into happy Step 8 (API-layer probes): AC-ERROR-1, AC-ERROR-2, AC-SCOPED-1 all PASS; UI feed error state (non-fatal) documented in creative — board still renders on feed-fetch failure.

---

## UX Pattern Conformance

Checked against `ux-patterns.md` (hash `5ea1e5fb98a9ea5a`).

> `ux-patterns.md` is the freshly-scaffolded generic template (`/banyan-ux-ingest --scaffold`). Its rules
> target components this simple kanban does not use (AlertDialog/Drawer/Tabs/Toasts/Forms/Skeletons), so
> most are **unverified** rather than violated. The one rule that maps to this feature — empty states —
> conforms. No UX-pattern violations detected.

| Rule                                                              | Status                          |
|------------------------------------------------------------------|---------------------------------|
| Confirmation dialogs use `AlertDialog` for destructive actions   | — unverified (no destructive action in feed/move flow) |
| Modals close on ESC and outside-click (MoveCardDialog observed)  | — unverified (not exercised this run) |
| Side drawer for contextual detail panels (≥768px)                | — unverified (feed is a static sidebar, not a drawer) |
| Tabs vs Sections                                                 | — unverified (no tabs in scope) |
| Forms layout/validation/errors                                   | — unverified (no forms in the feed flow) |
| Empty states: always provide an empty-state view                 | ✓ conforms ("No activity yet")  |
| Toasts top-right / banners full-width                            | — unverified (no toasts in scope) |
| Loading: spinner for async actions                               | ✓ conforms (feed reuses `Spinner`; implemented per spec) |
| Mobile adaptation (right-side inspectors → bottom)               | — unverified (UAT-REC-03 — viewport not constrainable) |

---

## Next Action

**Required findings == 0** → UAT PASS_WITH_RECOMMENDATIONS. E2E test specification generated at:
```
memory-bank/uat/spec-TASK-008-e2e.md
```

Recommended next step:
```
/banyan-build TASK-008
```
This will implement the E2E spec using the project's detected framework (**Playwright**, `client/e2e/`).

The three Recommended findings do not block PASS. Address before networked deployment:
- **UAT-REC-01** (apply migrations on deploy) and **UAT-REC-02** (`npm run migrate` `.env` loading) are
  operational — fold into the deploy runbook / migrate script.
- **UAT-REC-03** (mobile layout) is a verification gap — assert the ≤900px stack-below in the Phase-4
  Playwright E2E with an explicit viewport.
