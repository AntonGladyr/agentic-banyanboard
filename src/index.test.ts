/**
 * Unit tests for src/index.ts lifecycle wiring (TASK-002 Phase 3).
 *
 * Phase 3 wires the PostgreSQL connection module (src/db/pool.ts, built in Phase 1) into
 * the process entry point per memory-bank/creative/TASK-002-connection-resilience.md
 * (Option 2 — lazy init + bounded NON-BLOCKING background startup retry + closePool drain):
 *
 *   - AC-WARN-1     : when DATABASE_URL is unset, the post-listen startup path emits a single
 *                     structured `warn` line (carrying the process-level `traceId` via
 *                     `lifecycleLog`) and the server keeps listening — boot is never gated.
 *                     The background connectivity probe is NOT fired on the unset path.
 *   - probe outcome : when DATABASE_URL is set, `checkConnectionWithRetry()` is fired
 *                     WITHOUT being awaited (boot not blocked); its boolean outcome is logged
 *                     as exactly one `info` ("database reachable") on success or one `warn`
 *                     ("database not reachable …") on exhaustion — both via `lifecycleLog`.
 *   - AC-SHUTDOWN-1 : on graceful shutdown, `closePool()` is awaited inside the
 *                     `server.close()` callback (after the force-exit timer is cleared) and
 *                     BEFORE `process.exit(0)`, with an `info` "pool closed during shutdown"
 *                     line. Signal delivery itself is not exercised (untestable on Windows per
 *                     the systemPatterns.md note) — we invoke the registered SIGTERM handler
 *                     directly and drive the captured `server.close` callback.
 *
 * ── Test mechanics ─────────────────────────────────────────────────────────────────────────
 * src/index.ts runs its bootstrap as a top-level side effect on require (it is never imported
 * by production code or other tests). So each test:
 *   1. Sets/clears DATABASE_URL BEFORE loading the module, and `jest.resetModules()` +
 *      `require('./index')` so `config` (and `logger`) re-read the env (mirrors env.test.ts).
 *   2. Mocks `./app` so `createApp()` returns a fake app whose `listen()` records the callback
 *      and returns a fake server with a `close` jest.fn() — no real port is bound and the
 *      startup callback is invoked by the test (not auto-fired) for precise control.
 *   3. Mocks `./db/pool` so `closePool` / `checkConnectionWithRetry` are spies — no real
 *      pg.Pool is constructed (that module's own behavior is covered by src/db/pool.test.ts).
 *   4. Spies `process.on` to capture the SIGTERM/SIGINT handlers without registering real
 *      signal listeners (and passes every other registration through), `process.exit` so the
 *      test runner does not exit, and `process.stdout.write` to capture pino's JSON lines.
 */

// ── Mock `./app` ──────────────────────────────────────────────────────────────────────────
// createApp() returns a fake Express app. listen() records its (port, callback) and returns a
// fake server exposing a `close` jest.fn(); it deliberately does NOT invoke the callback, so
// the test drives the post-listen startup logic itself.
jest.mock('./app', () => ({
  createApp: jest.fn(() => ({
    listen: jest.fn((_port: number, _cb: () => void) => ({ close: jest.fn() })),
  })),
}));

// ── Mock `./db/pool` ──────────────────────────────────────────────────────────────────────
// Lifecycle hooks index.ts wires in Phase 3. checkConnectionWithRetry defaults to resolving
// `true` (reachable); individual tests override it. closePool resolves (no-op success).
jest.mock('./db/pool', () => ({
  getPool: jest.fn(),
  closePool: jest.fn().mockResolvedValue(undefined),
  checkConnection: jest.fn(),
  checkConnectionWithRetry: jest.fn().mockResolvedValue(true),
}));

/** pino warn level (numeric encoding pino writes on the `level` field). */
const PINO_WARN = 40;
/** pino info level. */
const PINO_INFO = 30;

describe('index (lifecycle wiring)', () => {
  const ORIGINAL_ENV = process.env;

  // Env keys config/env.ts owns; cleared so the entry point observes "unset" unless a test
  // sets one (mirrors env.test.ts / pool.test.ts).
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

  let captured: string[];
  let stdoutSpy: jest.SpyInstance;
  let onSpy: jest.SpyInstance;
  let exitSpy: jest.SpyInstance;
  let signalHandlers: Record<string, (...args: unknown[]) => unknown>;

  beforeEach(() => {
    jest.resetModules();

    process.env = { ...ORIGINAL_ENV };
    for (const key of MANAGED_KEYS) {
      delete process.env[key];
    }

    // Capture every line pino writes to stdout; swallow the real write to keep output clean.
    captured = [];
    stdoutSpy = jest
      .spyOn(process.stdout, 'write')
      .mockImplementation((chunk: string | Uint8Array): boolean => {
        captured.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
        return true;
      });

    // Capture SIGTERM/SIGINT handlers without registering real listeners; pass everything
    // else (express/pino/node internals) through to the real implementation.
    signalHandlers = {};
    const realOn = process.on.bind(process);
    onSpy = jest
      .spyOn(process, 'on')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mockImplementation((event: string | symbol, handler: any): NodeJS.Process => {
        if (event === 'SIGTERM' || event === 'SIGINT') {
          signalHandlers[event] = handler;
          return process;
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return realOn(event as any, handler);
      });

    // Never let the entry point actually exit the Jest worker.
    exitSpy = jest
      .spyOn(process, 'exit')
      .mockImplementation(((_code?: number): never => undefined as never));
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    onSpy.mockRestore();
    exitSpy.mockRestore();
    process.env = ORIGINAL_ENV;
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  // ── Helpers ─────────────────────────────────────────────────────────────────────────────

  /** Load the entry point fresh so config/logger re-read the current env. */
  function loadIndex(): void {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require('./index');
  }

  /** The (re-created) mocked pool module for the current module-registry generation. */
  function poolMock(): {
    closePool: jest.Mock;
    checkConnectionWithRetry: jest.Mock;
  } {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('./db/pool');
  }

  /** The fake server returned by the mocked app.listen() during the last loadIndex(). */
  function fakeServer(): { close: jest.Mock } {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const createApp = require('./app').createApp as jest.Mock;
    const app = createApp.mock.results[0]!.value as { listen: jest.Mock };
    return app.listen.mock.results[0]!.value as { close: jest.Mock };
  }

  /** The post-listen startup callback index.ts passed to app.listen(port, cb). */
  function listenCallback(): () => void {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const createApp = require('./app').createApp as jest.Mock;
    const app = createApp.mock.results[0]!.value as { listen: jest.Mock };
    return app.listen.mock.calls[0]![1] as () => void;
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

  /** Let the (already-resolved) background-probe promise chain settle. */
  function flushMicrotasks(): Promise<void> {
    return new Promise((resolve) => setImmediate(resolve));
  }

  // ── AC-WARN-1 ───────────────────────────────────────────────────────────────────────────

  it('AC-WARN-1: emits a single warn (with traceId) when DATABASE_URL is unset and never fires the probe', async () => {
    // Arrange: DATABASE_URL deleted in beforeEach.
    loadIndex();

    // Act: run the post-listen startup callback (server is already listening at this point).
    listenCallback()();
    await flushMicrotasks();

    // Assert: exactly one warn line communicating the unset DATABASE_URL, carrying traceId.
    const warnLines = parsedLines().filter(
      (l) => l.level === PINO_WARN && /database_url/i.test(String(l.msg)),
    );
    expect(warnLines).toHaveLength(1);
    expect(typeof warnLines[0]!.traceId).toBe('string');

    // Assert: server kept listening (listen was invoked) and the probe was NOT fired.
    expect(fakeServer().close).not.toHaveBeenCalled();
    expect(poolMock().checkConnectionWithRetry).not.toHaveBeenCalled();
  });

  // ── Background startup probe (revised Decision 4) ────────────────────────────────────────

  it('logs one info "database reachable" when DATABASE_URL is set and the probe succeeds', async () => {
    // Arrange
    process.env.DATABASE_URL = VALID_DB_URL;
    loadIndex();
    poolMock().checkConnectionWithRetry.mockResolvedValue(true);

    // Act: fire the post-listen startup callback (background probe, not awaited).
    listenCallback()();
    await flushMicrotasks();

    // Assert: probe was fired, and exactly one info "database reachable" (carrying traceId).
    expect(poolMock().checkConnectionWithRetry).toHaveBeenCalledTimes(1);
    const reachable = parsedLines().filter(
      (l) => l.level === PINO_INFO && /database reachable/i.test(String(l.msg)),
    );
    expect(reachable).toHaveLength(1);
    expect(typeof reachable[0]!.traceId).toBe('string');
  });

  it('logs one warn "not reachable" when DATABASE_URL is set and the probe is exhausted', async () => {
    // Arrange
    process.env.DATABASE_URL = VALID_DB_URL;
    loadIndex();
    poolMock().checkConnectionWithRetry.mockResolvedValue(false);

    // Act
    listenCallback()();
    await flushMicrotasks();

    // Assert: exhaustion produces exactly one warn line about reachability (carrying traceId);
    // boot was never blocked (the probe promise was not awaited before listen returned).
    expect(poolMock().checkConnectionWithRetry).toHaveBeenCalledTimes(1);
    const notReachable = parsedLines().filter(
      (l) => l.level === PINO_WARN && /not reachable/i.test(String(l.msg)),
    );
    expect(notReachable).toHaveLength(1);
    expect(typeof notReachable[0]!.traceId).toBe('string');
  });

  // ── AC-SHUTDOWN-1 ─────────────────────────────────────────────────────────────────────────

  it('AC-SHUTDOWN-1: awaits closePool() before process.exit(0) during graceful shutdown', async () => {
    // Arrange
    process.env.DATABASE_URL = VALID_DB_URL;
    loadIndex();
    const { closePool } = poolMock();

    // The SIGTERM handler must have been registered at boot.
    const sigterm = signalHandlers['SIGTERM'];
    expect(typeof sigterm).toBe('function');

    // Act 1: trigger the signal handler → gracefulShutdown() calls server.close(callback).
    sigterm!();
    const closeMock = fakeServer().close;
    expect(closeMock).toHaveBeenCalledTimes(1);

    // Act 2: simulate the server finishing close (err === undefined) and await the async
    // callback so the pool-drain + exit sequence completes.
    const closeCallback = closeMock.mock.calls[0]![0] as (err?: Error) => Promise<void>;
    await closeCallback(undefined);

    // Assert: pool drained exactly once, an info "pool closed during shutdown" line emitted,
    // and the process exited cleanly with code 0.
    expect(closePool).toHaveBeenCalledTimes(1);
    const drained = parsedLines().filter(
      (l) => l.level === PINO_INFO && /pool closed during shutdown/i.test(String(l.msg)),
    );
    expect(drained).toHaveLength(1);
    expect(exitSpy).toHaveBeenCalledWith(0);
  });
});
