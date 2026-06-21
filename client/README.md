# BanyanBoard Client (Frontend SPA)

Read-only React + TypeScript SPA that consumes the Express CRUD API (`/api/v1`). Built with Vite.
Introduced in TASK-006 (FEAT-006); see `memory-bank/creative/TASK-006-react-frontend-architecture.md`
and `memory-bank/creative/TASK-006-react-frontend-uiux.md` for the binding design decisions.

## Tooling

| Concern | Choice |
|---------|--------|
| Build tool / dev server | Vite |
| UI | React 18 + react-router-dom (client-side routing) |
| Styling | CSS Modules + CSS Custom Property tokens (`src/styles/tokens.css`) |
| Component/unit tests | Vitest + React Testing Library (jsdom) |
| E2E (Phase 5) | Playwright (added in Phase 5) |

This package is intentionally isolated from the backend: it has its own `package.json`,
`tsconfig.json`, and `node_modules`. The backend `tsc`/Jest never see `client/`, and vice versa.

## Dev workflow (single origin via Vite proxy)

The SPA always calls the **relative** path `/api/v1/...`. In development, Vite proxies that path to
the Express backend, so the code path is identical to production (single origin).

```bash
# 1. Backend prerequisites (from the repo root):
docker compose up -d            # PostgreSQL
npm run migrate                 # apply migrations (incl. the status column)
npm run dev                     # Express API on http://localhost:3000

# 2. Frontend (from client/):
npm install
npm run dev                     # Vite dev server on http://localhost:5173
```

Open `http://localhost:5173`. `/api/v1` requests are proxied to the Express backend.

### Configuring the proxy target

The dev proxy target is **environment-driven** (Guiding Principle 1), read from
`VITE_API_PROXY_TARGET` and defaulting to `http://localhost:3000` in `vite.config.ts`. To override,
set it in your shell or create a `client/.env.development` file:

```
VITE_API_PROXY_TARGET=http://localhost:3000
```

(`.env*` files are intentionally not committed by tooling guardrails; the code default makes the
file optional for the standard localhost setup.)

## Production serving

The production build emits static assets to `client/dist/`. Express serves them with a SPA history
fallback (single origin, port 3000), gated behind `SERVE_CLIENT=true`. This is wired in **Phase 5**.

```bash
npm run build                   # → client/dist/
```

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Vite dev server with HMR + API proxy |
| `npm run build` | Type-check (`tsc -b`) then production build to `dist/` |
| `npm run typecheck` | Type-check only |
| `npm test` | Run the Vitest suite once |
| `npm run test:watch` | Vitest in watch mode |
