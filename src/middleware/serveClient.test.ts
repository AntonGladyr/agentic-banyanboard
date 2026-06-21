/**
 * Integration test for the optional SPA static-serving + history fallback (TASK-006 Phase 5).
 *
 * Target contract, per memory-bank/creative/TASK-006-react-frontend-architecture.md
 * (Q1c — "Express serves client/dist statically with a SPA history fallback"; the createApp()
 * composition sketch) and TASK-006 AC-NAV-1:
 *
 *   When `SERVE_CLIENT=true`, `createApp()` registers — AFTER the `/api/v1` and `/health` routers
 *   and BEFORE `notFound` — (a) `express.static(CLIENT_DIST_PATH)` and (b) a SPA history fallback
 *   that returns `index.html` for any non-API, non-health GET that did not match a static asset.
 *   This makes a direct load / refresh of a client route (e.g. `/boards/:id`) render the SPA rather
 *   than a 404 (AC-NAV-1), WITHOUT shadowing the API: `/api/v1` and `/health` misses keep their
 *   structured JSON 404 (Guiding Principle 5) and never receive `index.html`.
 *
 *   When `SERVE_CLIENT` is unset/false (the default — dev, test, supertest), no static serving is
 *   registered and an unmatched route falls through to the existing JSON 404. This keeps the
 *   backend test suite and `npm run dev` behavior unchanged.
 *
 * ── Why a fixture dist + module re-require ────────────────────────────────────────────────────
 * `config` is parsed/frozen at import time, and `createApp()` reads `config.serveClient`. So each
 * scenario sets `SERVE_CLIENT`/`CLIENT_DIST_PATH` in `process.env`, calls `jest.resetModules()`,
 * then re-requires `createApp` so the module graph re-evaluates against that environment (mirrors
 * the env.test.ts pattern). A tiny on-disk fixture `dist/` (index.html + one asset) stands in for a
 * real `client/dist` build so `express.static`/`res.sendFile` have real files to serve.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import type { Express } from 'express';

// A recognizable index.html marker so we can assert the SPA shell (not a JSON 404) was returned.
const INDEX_HTML = '<!DOCTYPE html><html><head><title>BanyanBoard</title></head><body><div id="root"></div></body></html>';
const ASSET_JS = 'console.log("banyanboard spa asset");';

describe('SPA static serving + history fallback (integration via createApp)', () => {
  const ORIGINAL_ENV = process.env;
  let distDir: string;

  beforeAll(() => {
    // Build a throwaway dist/ fixture with an index.html and one hashed-style asset.
    distDir = fs.mkdtempSync(path.join(os.tmpdir(), 'banyan-dist-'));
    fs.writeFileSync(path.join(distDir, 'index.html'), INDEX_HTML);
    fs.mkdirSync(path.join(distDir, 'assets'));
    fs.writeFileSync(path.join(distDir, 'assets', 'app.js'), ASSET_JS);
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
    fs.rmSync(distDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
    delete process.env.SERVE_CLIENT;
    delete process.env.CLIENT_DIST_PATH;
  });

  /** Re-require createApp() so it re-reads the freshly-evaluated config for the current env. */
  function freshApp(): Express {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return (require('../app') as typeof import('../app')).createApp();
  }

  /** Build an app with serving enabled against the fixture dist/. */
  function appWithServing(): Express {
    process.env.SERVE_CLIENT = 'true';
    process.env.CLIENT_DIST_PATH = distDir;
    return freshApp();
  }

  describe('when SERVE_CLIENT=true', () => {
    it('serves index.html (the SPA shell) at the root', async () => {
      const app = appWithServing();

      const res = await request(app).get('/');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/html/);
      expect(res.text).toContain('<div id="root">');
    });

    it('AC-NAV-1: returns index.html for a deep client route (direct load / refresh of /boards/:id)', async () => {
      const app = appWithServing();

      const res = await request(app).get('/boards/123');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/html/);
      // The SPA shell — react-router resolves /boards/123 client-side — never a JSON 404.
      expect(res.text).toContain('<div id="root">');
      expect(res.body).not.toHaveProperty('error');
    });

    it('serves static build assets directly', async () => {
      const app = appWithServing();

      const res = await request(app).get('/assets/app.js');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/javascript/);
      expect(res.text).toContain('banyanboard spa asset');
    });

    it('does NOT shadow the API: an /api/v1 miss still returns the structured JSON 404', async () => {
      const app = appWithServing();

      const res = await request(app).get('/api/v1/does-not-exist');

      expect(res.status).toBe(404);
      expect(res.headers['content-type']).toMatch(/application\/json/);
      expect(res.body.error).toBe('Not Found');
      expect(res.body.path).toBe('/api/v1/does-not-exist');
      // The SPA shell must never be returned for an API miss.
      expect(res.text).not.toContain('<div id="root">');
    });

    it('keeps /health serving JSON, never the SPA shell', async () => {
      const app = appWithServing();

      const res = await request(app).get('/health');

      expect(res.headers['content-type']).toMatch(/application\/json/);
      expect(res.text).not.toContain('<div id="root">');
    });

    it('does NOT serve the SPA shell for non-GET requests to client paths (stays a JSON 404)', async () => {
      const app = appWithServing();

      const res = await request(app).post('/boards/123');

      expect(res.status).toBe(404);
      expect(res.headers['content-type']).toMatch(/application\/json/);
      expect(res.text).not.toContain('<div id="root">');
    });
  });

  describe('when SERVE_CLIENT is unset (default)', () => {
    it('does not register static serving — an unknown route still returns the JSON 404', async () => {
      const app = freshApp(); // SERVE_CLIENT unset → serving disabled

      const res = await request(app).get('/boards/123');

      expect(res.status).toBe(404);
      expect(res.headers['content-type']).toMatch(/application\/json/);
      expect(res.body.error).toBe('Not Found');
      expect(res.text).not.toContain('<div id="root">');
    });
  });
});
