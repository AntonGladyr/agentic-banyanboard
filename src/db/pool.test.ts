/**
 * Unit tests for src/db/pool.ts (TASK-002 Phase 1 — Connection module).
 *
 * Target contract (NOT yet implemented — these tests are written test-first per TDD and
 * are expected to fail/not-compile until the Coding Agent writes `src/db/pool.ts`):
 *
 *   - getPool(): pg.Pool
 *       Lazily creates a singleton `pg.Pool` on first call from `config.databaseUrl`
 *       (imported from `../config/env` — the frozen config; NEVER reads process.env directly).
 *       Throws `new Error('DATABASE_URL is not set — cannot initialize pg pool')` when
 *       `config.databaseUrl` is undefined. On creation it logs an `info` "pool initialized"
 *       line via `logger` (from `../observability/logger`) and attaches
 *       `pool.on('error', (err) => logger.error({ err }, 'idle pg client error (non-fatal)'))`.
 *       Idempotent: repeated calls return the SAME pool instance (Pool constructed once).
 *
 *   - closePool(): Promise<void>
 *       Calls `pool.end()` exactly once IF the pool was initialized; resolves without error
 *       and does NOT call `pool.end()` if never initialized. Logs an `info` "pool closed"
 *       line when it actually closed.
 *
 *   - checkConnection(): Promise<void>
 *       Acquires a client via `getPool().connect()`, calls `client.release()`, resolves on
 *       success; rejects with the underlying pg error on failure (error NOT swallowed).
 *       `release()` is called exactly once on the success path.
 *
 *   - checkConnectionWithRetry(opts?): Promise<boolean>
 *       Calls `checkConnection()` up to `attempts` times with capped exponential backoff
 *       (baseDelay, doubling, capped at maxDelay) between attempts, using `unref`'d timers.
 *       Swallows per-attempt rejections to drive the next attempt. NON-REJECTING: resolves
 *       on first success and ALSO resolves (does not reject) after attempts are exhausted.
 *       Module-local defaults: STARTUP_PROBE_ATTEMPTS=5, STARTUP_PROBE_BASE_DELAY_MS=250,
 *       STARTUP_PROBE_MAX_DELAY_MS=4000. The helper itself does NOT log (success/exhaustion
 *       logging is index.ts's job in Phase 3).
 *
 *       >>> CODING AGENT — RETURN SHAPE CONTRACT <<<
 *       To keep the success/exhaustion outcome observable, `checkConnectionWithRetry` MUST
 *       RESOLVE TO A BOOLEAN: `true` when a connection was reached (success), `false` when
 *       all attempts were exhausted. These tests assert on that boolean.
 *
 * ── Output-capture & module-reset contract (mirrors env.test.ts / logger.test.ts) ──────────
 *   - The module reads `config` (and transitively `process.env`) at IMPORT/first-call time,
 *     and pino writes newline-delimited JSON to `process.stdout`. So each test:
 *       1. Sets DATABASE_URL (or leaves it unset) BEFORE loading the module.
 *       2. Calls `jest.resetModules()` and `require('./pool')` so config re-reads the env.
 *       3. Spies on `process.stdout.write` to capture log lines, then parses them as JSON.
 *   - `pg` is mocked: `Pool` is a `jest.fn()` constructor whose instances expose `connect`,
 *     `end`, and `on` as `jest.fn()`. Constructing via the mocked `Pool` keeps `instanceof`
 *     working, so `expect(getPool()).toBeInstanceOf(Pool)` holds.
 */

// ── Mock `pg` ────────────────────────────────────────────────────────────────────────────
// `Pool` is a jest.fn() used as a constructor. Each `new Pool()` gets fresh connect/end/on
// jest.fn()s assigned on `this`, so `instanceof Pool` works and per-instance call tracking
// is available via the shared `poolInstances` array.
//
// STABILITY ACROSS resetModules(): each test calls `jest.resetModules()` in beforeEach (so a
// fresh `config`/pool singleton is re-required per test). resetModules() clears the module
// registry, which means the inline `jest.mock('pg', factory)` RE-RUNS on the next
// `require('pg')`. A naive factory would mint a brand-new `Pool` jest.fn() each time, so the
// post-reset constructor used by the module-under-test would no longer be the same reference
// as the top-level `import { Pool }` — breaking `instanceof Pool` (AC-MODULE-1) and the
// constructor call-count (AC-MODULE-2). We therefore cache the mock constructor and the
// instance registry on `globalThis`, which survives module-registry resets, so the factory
// returns the SAME `Pool` reference on every (re-)require.
type MockPoolInstance = { connect: jest.Mock; end: jest.Mock; on: jest.Mock };

jest.mock('pg', () => {
  const g = globalThis as unknown as {
    __mockPgPool?: jest.Mock;
    __mockPoolInstances?: MockPoolInstance[];
  };
  if (g.__mockPoolInstances === undefined) {
    g.__mockPoolInstances = [];
  }
  if (g.__mockPgPool === undefined) {
    g.__mockPgPool = jest.fn().mockImplementation(function (this: MockPoolInstance) {
      this.connect = jest.fn();
      this.end = jest.fn().mockResolvedValue(undefined);
      this.on = jest.fn();
      g.__mockPoolInstances!.push(this);
    });
  }
  return { Pool: g.__mockPgPool };
});

// Import the mocked constructor for `instanceof` assertions. This triggers the factory above
// (initializing the globalThis-cached registry) and is the SAME stable reference the module
// under test constructs through, so `instanceof Pool` is meaningful across resetModules().
// eslint-disable-next-line @typescript-eslint/no-var-requires
import { Pool } from 'pg';

// The globalThis-backed instance registry, aliased for terse use in tests. Same array on every
// resetModules(), so `poolInstances.length = 0` in beforeEach reliably clears it.
const poolInstances = (
  globalThis as unknown as { __mockPoolInstances: MockPoolInstance[] }
).__mockPoolInstances;

describe('db/pool', () => {
  const ORIGINAL_ENV = process.env;

  // Env keys config/env.ts owns; cleared so the pool observes "unset" unless a test sets one.
  const MANAGED_KEYS = [
    'PORT',
    'NODE_ENV',
    'LOG_LEVEL',
    'LOG_FORMAT',
    'LOG_OUTPUT',
    'OTEL_SERVICE_NAME',
    'OTEL_EXPORTER_OTLP_ENDPOINT',
    'DATABASE_URL',
  ];

  const VALID_DB_URL = 'postgres://user:pass@localhost:5432/banyanboard';

  let stdoutSpy: jest.SpyInstance;
  let captured: string[];

  beforeEach(() => {
    jest.resetModules();
    poolInstances.length = 0;
    (Pool as unknown as jest.Mock).mockClear();

    process.env = { ...ORIGINAL_ENV };
    for (const key of MANAGED_KEYS) {
      delete process.env[key];
    }

    // Capture every line pino writes to stdout; swallow the actual write so test output
    // stays clean. Returns true to satisfy the Writable#write signature.
    captured = [];
    stdoutSpy = jest
      .spyOn(process.stdout, 'write')
      .mockImplementation((chunk: string | Uint8Array): boolean => {
        captured.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
        return true;
      });
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    jest.useRealTimers();
    process.env = ORIGINAL_ENV;
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  /** Load the pool module fresh so config re-reads the current env. */
  function loadPool(): {
    getPool: () => import('pg').Pool;
    closePool: () => Promise<void>;
    checkConnection: () => Promise<void>;
    checkConnectionWithRetry: (opts?: {
      attempts?: number;
      baseDelay?: number;
      maxDelay?: number;
    }) => Promise<boolean>;
  } {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('./pool');
  }

  /** Parse all captured stdout writes into JSON objects (pino emits one line per log). */
  function parsedLines(): Array<Record<string, unknown>> {
    return captured
      .join('')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => JSON.parse(line) as Record<string, unknown>);
  }

  /** The most-recently-constructed mock Pool instance (the singleton under test). */
  function lastPoolInstance(): { connect: jest.Mock; end: jest.Mock; on: jest.Mock } {
    return poolInstances[poolInstances.length - 1]!;
  }

  // ── getPool() ────────────────────────────────────────────────────────────────────────

  it('AC-MODULE-1: getPool() returns a pg.Pool instance and logs pool-initialized when DATABASE_URL is set', () => {
    // Arrange
    process.env.DATABASE_URL = VALID_DB_URL;
    const { getPool } = loadPool();

    // Act
    const pool = getPool();

    // Assert: it is a real (mocked) pg.Pool instance.
    expect(pool).toBeInstanceOf(Pool);

    // Assert: an info line announcing pool initialization was emitted.
    const lines = parsedLines();
    const initLine = lines.find((l) => typeof l.msg === 'string' && /pool init/i.test(l.msg as string));
    expect(initLine).toBeDefined();
  });

  it('AC-MODULE-2: getPool() is idempotent — repeated calls return the same instance, Pool constructed once', () => {
    // Arrange
    process.env.DATABASE_URL = VALID_DB_URL;
    const { getPool } = loadPool();

    // Act
    const first = getPool();
    const second = getPool();

    // Assert: reference-equal singleton, constructor invoked exactly once.
    expect(first).toBe(second);
    expect(Pool as unknown as jest.Mock).toHaveBeenCalledTimes(1);
  });

  it('AC-MODULE-3: getPool() throws when DATABASE_URL is unset', () => {
    // Arrange: DATABASE_URL deleted in beforeEach.
    const { getPool } = loadPool();

    // Act + Assert
    expect(() => getPool()).toThrow('DATABASE_URL is not set — cannot initialize pg pool');
    // And no pool was constructed.
    expect(Pool as unknown as jest.Mock).not.toHaveBeenCalled();
  });

  // ── checkConnection() ─────────────────────────────────────────────────────────────────

  it('AC-MODULE-4: checkConnection() resolves on a live pool and releases the client exactly once', async () => {
    // Arrange
    process.env.DATABASE_URL = VALID_DB_URL;
    const { getPool, checkConnection } = loadPool();
    const release = jest.fn();
    getPool(); // initialize so the instance exists
    lastPoolInstance().connect.mockResolvedValue({ release });

    // Act
    await expect(checkConnection()).resolves.toBeUndefined();

    // Assert: acquired and released exactly once.
    expect(lastPoolInstance().connect).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('AC-MODULE-5: checkConnection() rejects and propagates the pg error (unswallowed) when connect fails', async () => {
    // Arrange
    process.env.DATABASE_URL = VALID_DB_URL;
    const { getPool, checkConnection } = loadPool();
    const connectError = new Error('Connection refused');
    getPool();
    lastPoolInstance().connect.mockRejectedValue(connectError);

    // Act + Assert: the SAME error instance propagates out, not swallowed.
    await expect(checkConnection()).rejects.toBe(connectError);
  });

  // ── closePool() ───────────────────────────────────────────────────────────────────────

  it('AC-MODULE-6: closePool() calls pool.end() exactly once when the pool was initialized', async () => {
    // Arrange
    process.env.DATABASE_URL = VALID_DB_URL;
    const { getPool, closePool } = loadPool();
    getPool();
    const instance = lastPoolInstance();

    // Act
    await expect(closePool()).resolves.toBeUndefined();

    // Assert: ended once, and an info "pool closed" line was emitted.
    expect(instance.end).toHaveBeenCalledTimes(1);
    const lines = parsedLines();
    const closedLine = lines.find((l) => typeof l.msg === 'string' && /pool closed/i.test(l.msg as string));
    expect(closedLine).toBeDefined();
  });

  it('AC-MODULE-7: closePool() is a no-op and resolves when the pool was never initialized', async () => {
    // Arrange: DATABASE_URL set, but getPool() is never called so no pool exists.
    process.env.DATABASE_URL = VALID_DB_URL;
    const { closePool } = loadPool();

    // Act
    await expect(closePool()).resolves.toBeUndefined();

    // Assert: no Pool was ever constructed, so nothing to end.
    expect(Pool as unknown as jest.Mock).not.toHaveBeenCalled();
    expect(poolInstances).toHaveLength(0);
  });

  // ── checkConnectionWithRetry() ────────────────────────────────────────────────────────

  it('AC-RETRY-1: checkConnectionWithRetry resolves to true when connect rejects once then succeeds', async () => {
    // Arrange
    jest.useFakeTimers();
    process.env.DATABASE_URL = VALID_DB_URL;
    const { getPool, checkConnectionWithRetry } = loadPool();
    const release = jest.fn();
    getPool();
    lastPoolInstance()
      .connect.mockRejectedValueOnce(new Error('boot in progress'))
      .mockResolvedValueOnce({ release });

    // Act: kick off the retry probe; it must return a promise synchronously (boot not blocked).
    const p = checkConnectionWithRetry({ attempts: 3, baseDelay: 10, maxDelay: 20 });
    expect(p).toBeInstanceOf(Promise);

    // Drive the backoff timers so the second attempt runs.
    await jest.advanceTimersByTimeAsync(20);
    await jest.advanceTimersByTimeAsync(20);

    // Assert: reached (true) after retrying; connect attempted exactly twice.
    await expect(p).resolves.toBe(true);
    expect(lastPoolInstance().connect).toHaveBeenCalledTimes(2);
  });

  it('AC-RETRY-2: checkConnectionWithRetry resolves to false (never rejects) when every attempt fails', async () => {
    // Arrange
    jest.useFakeTimers();
    process.env.DATABASE_URL = VALID_DB_URL;
    const { getPool, checkConnectionWithRetry } = loadPool();
    getPool();
    lastPoolInstance().connect.mockRejectedValue(new Error('always down'));

    // Act
    const p = checkConnectionWithRetry({ attempts: 3, baseDelay: 10, maxDelay: 20 });

    // Drive enough backoff cycles to exhaust all attempts (one advance per inter-attempt gap,
    // plus extra to be safe — advancing past pending timers is harmless).
    await jest.advanceTimersByTimeAsync(20);
    await jest.advanceTimersByTimeAsync(20);
    await jest.advanceTimersByTimeAsync(20);
    await jest.advanceTimersByTimeAsync(20);

    // Assert: exhausted → resolves to false (must NOT reject); connect attempted exactly `attempts` times.
    await expect(p).resolves.toBe(false);
    expect(lastPoolInstance().connect).toHaveBeenCalledTimes(3);
  });

  // ── idle-client error handler ─────────────────────────────────────────────────────────

  it("AC-POOLERR-1: the registered pool 'error' handler logs one error line and does not throw", () => {
    // Arrange
    process.env.DATABASE_URL = VALID_DB_URL;
    const { getPool } = loadPool();
    getPool();

    // Retrieve the handler registered via pool.on('error', handler).
    const onCalls = lastPoolInstance().on.mock.calls;
    const errorRegistration = onCalls.find((c) => c[0] === 'error');
    expect(errorRegistration).toBeDefined();
    const errorHandler = errorRegistration![1] as (err: Error) => void;

    // Drop any lines emitted during initialization so we measure only the handler's output.
    captured.length = 0;

    // Act: invoke the idle-client error handler — it must not crash the process.
    expect(() => errorHandler(new Error('idle client boom'))).not.toThrow();

    // Assert: exactly one error log line was emitted.
    const lines = parsedLines();
    expect(lines).toHaveLength(1);
    const entry = lines[0]!;
    expect(entry).toHaveProperty('level'); // pino error level (encoding intentionally unconstrained)
    expect(entry).toHaveProperty('msg');
  });
});
