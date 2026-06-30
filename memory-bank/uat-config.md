# UAT Configuration

This file is created and maintained by `/banyan-uat-init`. It carries project-specific UAT infrastructure (base URLs, persona credentials, auth strategy, viewport presets, isolation strategy).

**Companion file**: `memory-bank/projectConfig.md` `## UAT` section carries project-wide *ergonomic* defaults (default sections, artifact git policy). Keep secrets/infra here; keep ergonomics there.

---

**Status**: Configured
**Last Updated**: 2026-06-30

## Environments

| Name     | Base URL                            | Default |
|----------|-------------------------------------|---------|
| dev      | http://localhost:5173               | yes     |
| local    | http://localhost:3000               | no      |

> `dev` is the Vite dev server (HMR). Run the backend with `npm run dev` (`:3000`, `REALTIME_ENABLED=true`) and the SPA with `cd client && npm run dev` (`:5173`); Vite proxies `/api/v1` + `/health` to the backend. The `local` env is the single-origin Express-served production build (`SERVE_CLIENT=true npm start` after `cd client && npm run build`).
>
> `/banyan-uat` refuses to run against environments where `name == "prod"`. There is no override flag — production UAT must be intentionally invoked via a separate (future) command.

## Auth

- **Strategy**: none
  - BanyanBoard's MVP is **unauthenticated** — there is no auth middleware, no login UI, no session/cookie auth. The activity-feed actor is the fixed `"anonymous"` stub (TASK-008 Spec § Actor Identity). The board view is reachable directly by URL with no login step.
  - The realtime echo-de-dup token (per-tab `X-Client-Id` header / `?clientId=` query param) is **opaque, not auth** — it only suppresses an originating tab's own `card:updated` echo and is reset between persona groups via `localStorage.clear()`.
  - **Forward note**: productBrief plans session-based auth (email + password, bcrypt) before any networked deployment. When auth lands, re-run `/banyan-uat-init` to switch this to `token+fallback`, populate `.auth/`, and add login selectors.
- **Credential vault**: n/a (no credentials in the unauthenticated MVP)
- **Token file pattern**: n/a
- **Login selectors**: n/a (no login form exists)

## Persona Map

Each row maps a persona role discovered in `productBrief.md` → a test account → an auth reference. Because the app is unauthenticated, no account or credential is needed to walk a persona — the role is a label that selects the journey's point of view.

| Role           | Test Account            | Auth Reference            |
|----------------|-------------------------|---------------------------|
| Alex the Dev   | n/a (no auth)           | none (unauthenticated MVP) |
| Jordan the PM  | n/a (no auth)           | none (unauthenticated MVP) |
| Sam the Maker  | n/a (no auth)           | none (unauthenticated MVP) |

> The TASK-008 journey's primary actor is **Alex the Dev** (desktop). For the cross-tab AC-HAPPY-2 step, both tabs walk as Alex — same persona, so walkers may run in parallel under the `auto`/`same-persona-only` isolation strategy.

## Viewports

| Name    | Width | Height | Default For      |
|---------|-------|--------|------------------|
| desktop | 1280  | 720    | all non-mobile   |
| mobile  | 375   | 667    | mobile section   |

## Execution

- **max_parallel_tabs**: 4
- **isolation_strategy**: auto          # auto | same-persona-only | incognito
  - `auto` (default) — probes incognito support at run start; falls back to `same-persona-only` if unavailable. Today this always falls back; the Claude-in-Chrome MCP does not yet expose incognito tab creation. (Moot here — the app is unauthenticated, so there is no cookie-jar collision across personas.)
- **auth_cookies_to_clear**:            # none — no auth cookies are set
- **logout_url**:                       # empty — no logout route exists in the unauthenticated MVP
- **screenshot_retention**: keep 10 most recent runs
- **default_timeout_ms**: 15000
- **ux_pattern_check**: enabled

## Notes

- This MVP is unauthenticated, so there is no credential vault to protect. If/when auth is added, re-run `/banyan-uat-init` and ensure the chosen `.auth/` vault path is in `.gitignore`.
- UAT artifacts may include screenshots of board/card content (task titles, descriptions — no PII in the unauthenticated MVP). Configure `artifact_git_policy` in `projectConfig.md` accordingly (default: `ignore`).
- The realtime tier must be enabled for the live-feed journey steps: start the backend with `REALTIME_ENABLED=true` (the default).
