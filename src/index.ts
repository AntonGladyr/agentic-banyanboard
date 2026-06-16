/**
 * src/index.ts — process entry point (Phase 3).
 *
 * Per memory-bank/creative/TASK-001-express-api-architecture.md (Component table:
 * src/index.ts; "App composition order"; Decision 3 — OTel bootstrap) and
 * TASK-001 AC-ENTRY-1 / AC-ERROR-3:
 *
 *   This is the ONLY module that calls `listen` and touches `process`. Order:
 *     1. initTracing()      — the no-op OTel seam, called once BEFORE building the app.
 *     2. createApp()        — pure Express factory (no side effects).
 *     3. server.listen(...) — bind the configured port, log a structured startup line.
 *     4. SIGTERM / SIGINT   — graceful shutdown: log, close the server (exit 0), with a
 *                             safety timeout that forces exit 1 if close hangs (within 5s).
 *
 * It is never imported by tests (tests import `createApp` from src/app.ts), so a top-level
 * bootstrap here is safe and intended — it runs only via `node dist/index.js`.
 *
 * No `console.*` anywhere — all logging goes through the structured `logger`.
 */

import { config } from './config/env';
import { logger } from './observability/logger';
import { initTracing, extractTraceContext } from './observability/tracing';
import { createApp } from './app';
import { checkConnectionWithRetry, closePool } from './db/pool';

/** Max time (ms) to wait for in-flight connections to drain before forcing exit. */
const SHUTDOWN_TIMEOUT_MS = 5000;

// 1. Initialize tracing (no-op seam today; future full-SDK wiring point).
initTracing();

// Mint a root trace context for process-lifecycle logs (startup/shutdown) so every
// stdout line — not just request-scoped ones — carries a `traceId` (success metric).
// `service`/`environment`/`version` are already pino base fields, so we bind only traceId.
const { traceId: rootTraceId } = extractTraceContext({});
const lifecycleLog = logger.child({ traceId: rootTraceId });

// 2. Build the pure app, then 3. bind the server.
const app = createApp();

const server = app.listen(config.port, () => {
  lifecycleLog.info({ port: config.port }, 'Server listening');

  // PostgreSQL connectivity is NON-BLOCKING by design (TASK-002 creative Option 2): the
  // server is already listening here regardless of DB state — boot is never gated on it.
  if (config.databaseUrl === undefined) {
    // Lazy DB module: nothing is connected when DATABASE_URL is unset. Surface that as a
    // single non-fatal warn (carries traceId via lifecycleLog) and keep serving (AC-WARN-1).
    lifecycleLog.warn(
      'DATABASE_URL is not set — database connectivity is unavailable',
    );
  } else {
    // DATABASE_URL is set: fire a bounded background connectivity probe. It is deliberately
    // NOT awaited (must not block boot) and is non-rejecting by contract (resolves to a
    // boolean), so its outcome is reported as exactly one info or one warn line. This rides
    // out the Postgres warm-up window under `docker compose up` instead of logging a
    // misleading boot-time failure (revised Decision 4).
    void checkConnectionWithRetry()
      .then((reachable) => {
        if (reachable) {
          lifecycleLog.info('database reachable');
        } else {
          lifecycleLog.warn('database not reachable after startup retries');
        }
      })
      .catch((err: unknown) => {
        // Defensive only — the probe is contractually non-rejecting. Guard against a future
        // regression turning a background rejection into an unhandledRejection.
        lifecycleLog.error(
          { err },
          'database connectivity probe failed unexpectedly',
        );
      });
  }
});

/**
 * Gracefully shut down on a termination signal: stop accepting new connections, let
 * in-flight requests finish, then exit 0. A safety timer forces exit 1 if `server.close`
 * does not complete within {@link SHUTDOWN_TIMEOUT_MS} (AC-ERROR-3).
 *
 * Guarded against double-invocation so two signals don't race.
 */
let shuttingDown = false;
function gracefulShutdown(signal: string): void {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;

  lifecycleLog.info({ signal }, `${signal} received — shutting down`);

  const forceExit = setTimeout(() => {
    lifecycleLog.error('Shutdown timed out — forcing exit');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  // Don't let the safety timer keep the event loop alive on its own.
  forceExit.unref();

  server.close(async (err) => {
    clearTimeout(forceExit);
    if (err) {
      lifecycleLog.error({ err: err.message }, 'Error during shutdown');
      process.exit(1);
      return;
    }

    // Drain the pg pool AFTER the server stops accepting connections and BEFORE exit, so
    // in-flight DB queries release their connections first (TASK-002 AC-SHUTDOWN-1).
    // closePool() is a no-op when the pool was never initialized.
    try {
      await closePool();
      lifecycleLog.info('pool closed during shutdown');
    } catch (closeErr) {
      lifecycleLog.error({ err: closeErr }, 'Error closing pg pool during shutdown');
    }

    lifecycleLog.info('Shutdown complete');
    process.exit(0);
  });
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
