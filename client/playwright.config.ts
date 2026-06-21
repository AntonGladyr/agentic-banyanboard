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
 * ── Why the API is mocked, not seeded ───────────────────────────────────────────────────────────
 * Each spec intercepts `**​/api/v1/**` with `page.route` and fulfills deterministic fixtures (see
 * e2e/fixtures.ts). This keeps the journeys hermetic and DB-free — no Postgres, no migration, no
 * seed step — while still driving the real SPA: routing, URL refresh, network-failure handling, and
 * "different board → different cards" stub-detection. The document + asset requests are NOT mocked,
 * so they flow through the real Express SPA serving under test.
 *
 * Prerequisites (run by `npm run e2e`): the client (`client/dist`) and backend (`dist/`) are built,
 * and the Chromium binary is installed (`npm run e2e:install`).
 */

import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';

// Repo root = the directory above client/ (this config lives in client/).
const repoRoot = fileURLToPath(new URL('..', import.meta.url));

// A dedicated E2E port (overridable via E2E_PORT) so the suite never collides with a running dev
// server on the default 3000. The SPA calls relative `/api/v1` URLs, so the port is arbitrary.
const PORT = Number(process.env.E2E_PORT ?? 3100);
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // Production serving path: Express static-serves the built SPA + SPA history fallback.
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
});
