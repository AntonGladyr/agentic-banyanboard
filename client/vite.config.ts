/// <reference types="vitest/config" />
/**
 * client/vite.config.ts — Vite config for the BanyanBoard SPA (TASK-006 Phase 2).
 *
 * Dev/prod parity (Architecture creative Q1c/Q1e): the browser always calls the RELATIVE path
 * `/api/v1/...`. In development, Vite's dev server proxies `/api/v1` (and `/health`) to the
 * Express backend so there is a single logical origin — identical to production, where Express
 * serves the built SPA and the API on the same port (wired in Phase 5).
 *
 * The proxy target is environment-driven, not hardcoded (Guiding Principle 1): it is read from the
 * `VITE_API_PROXY_TARGET` env var (see `.env.development`), defaulting to `http://localhost:3000`.
 *
 * The Vitest config lives here too (it shares Vite's transform pipeline — Architecture creative
 * Q3a): jsdom environment, globals, and a setup file that wires `@testing-library/jest-dom`.
 * Playwright E2E specs (Phase 5) live under `client/e2e/` and are excluded from Vitest below so the
 * two runners never overlap.
 */

import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Load VITE_*-prefixed vars for the active mode (development/production/test) from client/.env*.
  const env = loadEnv(mode, process.cwd(), '');
  const proxyTarget = env.VITE_API_PROXY_TARGET || 'http://localhost:3000';

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        // Forward API + health probes to the Express backend so the SPA stays single-origin in dev.
        '/api/v1': { target: proxyTarget, changeOrigin: true },
        '/health': { target: proxyTarget, changeOrigin: true },
      },
    },
    build: {
      // Built static assets Express serves in production (gated behind SERVE_CLIENT — Phase 5).
      outDir: 'dist',
      sourcemap: true,
    },
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['./vitest.setup.ts'],
      css: true,
      // E2E specs (Phase 5) run under Playwright, not Vitest.
      exclude: ['e2e/**', 'node_modules/**', 'dist/**'],
    },
  };
});
