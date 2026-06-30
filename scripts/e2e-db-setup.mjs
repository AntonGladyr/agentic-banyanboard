/**
 * scripts/e2e-db-setup.mjs — provision the dedicated E2E PostgreSQL database (TASK-007 Phase 6).
 *
 * The two-tab real-time E2E journeys (AC-REALTIME-1/2) cannot be served by the per-test `page.route`
 * mock the single-tab journeys use — a mocked API can never broadcast an SSE event from one browser
 * context to another. They require a REAL backend with REAL persistence + a REAL `text/event-stream`
 * channel. This script provisions an ISOLATED database for that backend so the realtime suite never
 * touches developer data, and is idempotent so it is safe to run on every Playwright start.
 *
 * Steps (each idempotent):
 *   1. CREATE DATABASE <e2e db> if it does not already exist (connecting to a maintenance DB — the
 *      DSN identifier is a controlled constant, never user input, so it is safe to interpolate).
 *   2. Run `node-pg-migrate up` against the E2E DSN to bring the schema to head (migrations are
 *      themselves `ifNotExists`, so re-running is a no-op once applied).
 *   3. TRUNCATE the data tables so every full Playwright run starts from a clean, deterministic slate.
 *
 * It runs from the REPO ROOT (where `pg` + `node-pg-migrate` are installed) — the realtime webServer
 * in client/playwright.config.ts chains it before `node dist/index.js`, so the schema is guaranteed
 * present before the server begins serving, with no dependence on Playwright's setup ordering.
 *
 * Configuration (12-Factor — no hardcoded host baked into committed test code beyond the local default):
 *   E2E_DATABASE_URL        full DSN for the E2E database          (default: the local compose DSN below)
 *   E2E_MAINT_DATABASE_URL  DSN of an existing DB used only to run CREATE DATABASE
 *   E2E_DB_NAME             E2E database name                       (default: banyanboard_e2e)
 */

import pg from 'pg';
import { execSync } from 'node:child_process';

const E2E_DB_NAME = process.env.E2E_DB_NAME ?? 'banyanboard_e2e';
const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL ?? `postgres://banyan:banyan@localhost:5432/${E2E_DB_NAME}`;
// The maintenance connection only needs to reach an EXISTING database so we can issue CREATE DATABASE.
const MAINT_DATABASE_URL =
  process.env.E2E_MAINT_DATABASE_URL ?? 'postgres://banyan:banyan@localhost:5432/banyanboard';

// A conservative identifier guard: the DB name is our own constant, but reject anything that is not a
// plain identifier so an env override can never smuggle SQL into the CREATE DATABASE statement.
if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(E2E_DB_NAME)) {
  throw new Error(`Refusing unsafe E2E_DB_NAME: "${E2E_DB_NAME}"`);
}

/** CREATE DATABASE only when it does not already exist (CREATE DATABASE cannot run in a transaction). */
async function ensureDatabase() {
  const admin = new pg.Client({ connectionString: MAINT_DATABASE_URL });
  await admin.connect();
  try {
    const existing = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [E2E_DB_NAME]);
    if (existing.rowCount === 0) {
      // Identifier validated above — safe to interpolate (parameters are not allowed for DDL identifiers).
      await admin.query(`CREATE DATABASE ${E2E_DB_NAME}`);
      console.log(`[e2e-db-setup] created database ${E2E_DB_NAME}`);
    } else {
      console.log(`[e2e-db-setup] database ${E2E_DB_NAME} already exists`);
    }
  } finally {
    await admin.end();
  }
}

/** Bring the E2E database schema to head, then truncate data for a deterministic run. */
async function migrateAndReset() {
  execSync('npx node-pg-migrate up', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: E2E_DATABASE_URL },
  });

  const client = new pg.Client({ connectionString: E2E_DATABASE_URL });
  await client.connect();
  try {
    // RESTART IDENTITY so ids are predictable across runs; CASCADE clears cards via the FK.
    // `activity_events` (TASK-008) is named explicitly so its serial id also restarts — a TRUNCATE of
    // `boards` CASCADE would clear its rows via the board FK, but would NOT reset its identity sequence.
    await client.query(
      'TRUNCATE TABLE activity_events, cards, boards RESTART IDENTITY CASCADE',
    );
    console.log('[e2e-db-setup] truncated boards + cards + activity_events');
  } finally {
    await client.end();
  }
}

await ensureDatabase();
await migrateAndReset();
console.log('[e2e-db-setup] ready');
