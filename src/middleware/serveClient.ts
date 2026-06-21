/**
 * src/middleware/serveClient.ts — optional SPA static serving + history fallback (TASK-006 Phase 5).
 *
 * Per memory-bank/creative/TASK-006-react-frontend-architecture.md (Q1c — single-origin prod:
 * "Express serves client/dist statically with a SPA history fallback"; the createApp() composition
 * sketch) and TASK-006 AC-NAV-1:
 *
 *   Registered by `createApp()` ONLY when `config.serveClient` is true, AFTER the `/api/v1` and
 *   `/health` routers and BEFORE `notFound`. It does two things:
 *     1. `express.static(clientDistPath)` — serves the built SPA assets (hashed JS/CSS, favicon).
 *        `express.static` answers GET/HEAD and calls `next()` when no file matches, so unmatched
 *        paths flow on to the fallback.
 *     2. SPA history fallback — any non-API, non-health GET/HEAD that did not match a static asset
 *        returns `index.html`, so a direct load / refresh of a client route (e.g. `/boards/:id`)
 *        renders the SPA instead of a 404 (AC-NAV-1).
 *
 * ── Why it never shadows the API (C6 / Guiding Principle 5) ──────────────────────────────────────
 * The fallback explicitly skips `/health` and `/api/` paths (calling `next()`), so an `/api/v1` or
 * `/health` miss falls through to the existing `notFound` middleware and keeps its structured JSON
 * 404 — it never receives `index.html`. Non-GET requests are skipped too, so e.g. `POST /boards/123`
 * also flows to the JSON 404 rather than the SPA shell. This preserves the fixed composition order
 * and the JSON-404 contract while satisfying the SPA history-fallback requirement.
 */

import path from 'node:path';
import express from 'express';
import type { Express, NextFunction, Request, Response } from 'express';
import { config } from '../config/env';

/**
 * Register static serving of the built SPA + the SPA history fallback on `app`.
 * Call this from `createApp()` between the `/api/v1` router and `notFound`, guarded by
 * `config.serveClient`.
 */
export function registerClientServing(app: Express): void {
  // Resolve to an absolute path so serving is independent of the process cwd.
  const distPath = path.resolve(config.clientDistPath);
  const indexHtmlPath = path.join(distPath, 'index.html');

  // 1. Serve built static assets. Missing files call next() → the fallback below.
  app.use(express.static(distPath));

  // 2. SPA history fallback for client-side routes.
  app.use((req: Request, res: Response, next: NextFunction): void => {
    // Only GET/HEAD navigations get the SPA shell; other verbs keep the JSON 404 contract.
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      next();
      return;
    }
    // API and health misses must remain structured JSON 404s — never index.html.
    if (
      req.path === '/health' ||
      req.path.startsWith('/health/') ||
      req.path.startsWith('/api/')
    ) {
      next();
      return;
    }
    res.sendFile(indexHtmlPath, (err) => {
      // If index.html is missing/unreadable, defer to the error handler rather than hang.
      if (err) {
        next(err);
      }
    });
  });
}
