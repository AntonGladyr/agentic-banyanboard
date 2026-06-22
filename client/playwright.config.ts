/**
 * client/playwright.config.ts — Playwright E2E config (TASK-006 Phase 5).
 *
 * Per memory-bank/creative/TASK-006-react-frontend-architecture.md (Q3b — Playwright is the
 * runnable E2E layer for the AC entry-to-success journeys) and TASK-006 AC-NAV-1.
 *
 * ── Serving model ─────────────────────────────────────────────────────────────────────────────
 * The `webServer` below starts the REAL backend (`node dist/index.js`) with `SERVE_CLIENT=true`, so
 * Express serves the built `client/dist` via the production static + SPA history-fallback path added
 * in this phase. That is what makes the AC-NAV-1 direct-URL / refresh test exercise the genuine
 * production serving behavior rather than a dev-only fallback.
 *
 * ── Two serving models, two projects (TASK-007 Phase 6) ─────────────────────────────────────────
 * `chromium` (mocked) — the single-tab journeys. Each spec intercepts `**​/api/v1/**` with `page.route`
 *   and fulfills deterministic fixtures (see e2e/fixtures.ts). This keeps them hermetic and DB-free —
 *   no Postgres, no migration, no seed — while still driving the real SPA: routing, URL refresh,
 *   network-failure handling, optimistic create/edit/drag, and "different board → different cards"
 *   stub-detection. The document + asset requests are NOT mocked, so they flow through the real
 *   Express SPA serving under test. Served by the first webServer below (no DATABASE_URL).
 *
 * `realtime` (real backend) — the two-tab collaboration journeys (AC-REALTIME-1/2). A mocked API can
 *   never broadcast an SSE event from one browser context to another, so these run against a REAL
 *   backend with REAL persistence + a REAL `text/event-stream` channel (`REALTIME_ENABLED=true`),
 *   backed by an ISOLATED `banyanboard_e2e` database. They do NOT mock `/api/v1` — they drive the
 *   genuine create/PATCH + SSE round-trip behind the single-origin Express-served build (no Vite
 *   proxy), which is exactly the production path the Architecture creative phase flagged to verify.
 *   Served by the second webServer below, whose command provisions the E2E DB (create-if-missing →
 *   migrate → truncate, idempotent) before starting, so the schema is guaranteed present regardless
 *   of Playwright's globalSetup ordering.
 *
 * Prerequisites (run by `npm run e2e`): the client (`client/dist`) and backend (`dist/`) are built,
 * and the Chromium binary is installed (`npm run e2e:install`). The `realtime` project additionally
 * requires a reachable PostgreSQL (the local compose DB by default; override via E2E_DATABASE_URL).
 */

import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';

// Repo root = the directory above client/ (this config lives in client/).
const repoRoot = fileURLToPath(new URL('..', import.meta.url));

// Dedicated E2E ports (overridable) so the suite never collides with a running dev server on 3000.
// The SPA calls relative `/api/v1` URLs, so the ports are arbitrary; the two projects use distinct
// ports so the mocked (DB-free) and realtime (DB-backed) backends run side by side.
const PORT = Number(process.env.E2E_PORT ?? 3100);
const RT_PORT = Number(process.env.E2E_RT_PORT ?? 3101);
const baseURL = `http://localhost:${PORT}`;
const realtimeBaseURL = `http://localhost:${RT_PORT}`;

// Isolated E2E database DSN for the realtime backend (never the developer DB). Must match the default
// in scripts/e2e-db-setup.mjs so the provisioning step and the server connect to the same database.
const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL ?? 'postgres://banyan:banyan@localhost:5432/banyanboard_e2e';

// Realtime specs are matched by filename so the mocked `chromium` project can ignore them (and vice
// versa) — each runs only against its own serving model.
const REALTIME_SPEC = /realtime\.spec\.ts$/;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      testIgnore: REALTIME_SPEC,
      use: { ...devices['Desktop Chrome'], baseURL },
    },
    {
      name: 'realtime',
      testMatch: REALTIME_SPEC,
      use: { ...devices['Desktop Chrome'], baseURL: realtimeBaseURL },
    },
  ],
  webServer: [
    {
      // Mocked project: Express static-serves the built SPA + SPA history fallback, no DB.
      command: 'node dist/index.js',
      cwd: repoRoot,
      env: {
        SERVE_CLIENT: 'true',
        CLIENT_DIST_PATH: 'client/dist',
        PORT: String(PORT),
        NODE_ENV: 'production',
        // DATABASE_URL intentionally unset — the API is mocked per-test, so no DB is needed; the
        // backend logs a single non-fatal warn and serves the SPA regardless.
        LOG_LEVEL: 'warn',
      },
      url: baseURL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      // Realtime project: provision the isolated E2E DB (idempotent), then serve the real backend with
      // the SSE tier enabled. The `&&` chain guarantees the schema exists before the server serves.
      command: 'node scripts/e2e-db-setup.mjs && node dist/index.js',
      cwd: repoRoot,
      env: {
        SERVE_CLIENT: 'true',
        CLIENT_DIST_PATH: 'client/dist',
        PORT: String(RT_PORT),
        NODE_ENV: 'production',
        LOG_LEVEL: 'warn',
        DATABASE_URL: E2E_DATABASE_URL,
        REALTIME_ENABLED: 'true',
      },
      url: realtimeBaseURL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
