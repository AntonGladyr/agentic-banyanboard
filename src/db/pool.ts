/**
 * src/db/pool.ts — PostgreSQL connection module (TASK-002 Phase 1).
 *
 * Implements "Option 2" from
 * memory-bank/creative/TASK-002-connection-resilience.md: a lazily-initialized,
 * singleton `pg.Pool` paired with a bounded, NON-BLOCKING background startup
 * retry probe and a NON-FATAL idle-client `error` handler.
 *
 * ── Rationale ────────────────────────────────────────────────────────────────────────
 *   - Lazy init (getPool): the Pool is constructed exactly once, on first use, from
 *     the validated `config.databaseUrl`. This keeps `import` side-effect free and lets
 *     the process boot even when the database is briefly unreachable (AC-MODULE-1/2/3).
 *   - Non-blocking startup retry (checkConnectionWithRetry): probes connectivity with
 *     capped exponential backoff using `.unref()`'d timers so a probe in flight never
 *     keeps the event loop alive, and it NEVER rejects — Phase 3's index.ts kicks it off
 *     without awaiting, so a rejection would surface as an unhandled rejection
 *     (AC-RETRY-1/2; creative doc Implementation Guideline 4).
 *   - Non-fatal pool error handler: a backend dropping an idle connection emits a pool
 *     'error' event; left unhandled it would crash the process. We log and swallow it
 *     (AC-POOLERR-1).
 *
 * Observability: ALL logging flows through the pino `logger`; there are ZERO `console.*`
 * calls in this module (AC-NOCONSOLELOG-1 / CLAUDE.md observability requirements). The
 * DSN (`config.databaseUrl`) carries a password and is therefore NEVER logged.
 *
 * Configuration: this module reads env exclusively through the frozen `config` object
 * (the single permitted env reader); it NEVER touches `process.env` directly.
 */

import { Pool } from 'pg';
import type { PoolClient } from 'pg';
import { config } from '../config/env';
import { logger } from '../observability/logger';

/**
 * Startup-probe defaults (module-local constants, intentionally NOT env-driven — these
 * are connection-resilience tuning knobs, not deployment configuration).
 */
const STARTUP_PROBE_ATTEMPTS = 5;
const STARTUP_PROBE_BASE_DELAY_MS = 250;
const STARTUP_PROBE_MAX_DELAY_MS = 4000;

/** The lazily-constructed singleton pool (undefined until first `getPool()`). */
let pool: Pool | undefined;

/**
 * Sleep for `ms` using an `.unref()`'d timer so a pending backoff delay never keeps the
 * Node event loop alive (critical for the non-blocking probe — creative doc Guideline 4).
 */
const sleep = (ms: number): Promise<void> =>
  new Promise<void>((resolve) => {
    const t = setTimeout(resolve, ms);
    t.unref();
  });

/**
 * Return the singleton `pg.Pool`, constructing it on first call.
 *
 * Idempotent: subsequent calls return the same instance (Pool constructed once).
 * Throws if `config.databaseUrl` is unset — no Pool is constructed in that case.
 */
export function getPool(): Pool {
  if (pool !== undefined) {
    return pool;
  }

  if (config.databaseUrl === undefined) {
    throw new Error('DATABASE_URL is not set — cannot initialize pg pool');
  }

  pool = new Pool({ connectionString: config.databaseUrl });
  // Idle-client errors must not crash the process: log non-fatally and swallow.
  pool.on('error', (err) => logger.error({ err }, 'idle pg client error (non-fatal)'));
  // NB: never log config.databaseUrl — it contains the password.
  logger.info('pg pool initialized');
  return pool;
}

/**
 * Close the pool if it was initialized, then reset the singleton so the module can be
 * re-initialized cleanly. No-op (resolves immediately) when no pool exists.
 */
export async function closePool(): Promise<void> {
  if (pool === undefined) {
    return;
  }

  await pool.end();
  logger.info('pg pool closed');
  pool = undefined;
}

/**
 * Acquire a client, release it, and resolve — a lightweight liveness probe.
 *
 * The underlying pg error is NOT swallowed: a failed `connect()` rejects with the same
 * error instance. `release()` is called exactly once, on the success path only.
 */
export async function checkConnection(): Promise<void> {
  const client: PoolClient = await getPool().connect();
  client.release();
}

/**
 * Probe connectivity up to `attempts` times with capped exponential backoff.
 *
 * Resolves to `true` on the first successful connection, or `false` once all attempts are
 * exhausted. NON-REJECTING by contract — per-attempt errors are swallowed to drive the
 * next attempt, and exhaustion resolves `false` (never throws). Does not log; outcome
 * logging is index.ts's job (Phase 3) so lines carry traceId.
 */
export async function checkConnectionWithRetry(opts?: {
  attempts?: number;
  baseDelay?: number;
  maxDelay?: number;
}): Promise<boolean> {
  const attempts = opts?.attempts ?? STARTUP_PROBE_ATTEMPTS;
  const baseDelay = opts?.baseDelay ?? STARTUP_PROBE_BASE_DELAY_MS;
  const maxDelay = opts?.maxDelay ?? STARTUP_PROBE_MAX_DELAY_MS;

  for (let attemptIndex = 0; attemptIndex < attempts; attemptIndex += 1) {
    try {
      await checkConnection();
      return true;
    } catch {
      // Swallow this attempt's error to drive the next attempt.
    }

    // Back off before the next attempt (but not after the final attempt).
    if (attemptIndex < attempts - 1) {
      const delay = Math.min(baseDelay * 2 ** attemptIndex, maxDelay);
      await sleep(delay);
    }
  }

  return false;
}
