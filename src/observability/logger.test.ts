/**
 * Unit tests for src/observability/logger.ts (Phase 2 — Observability foundation).
 *
 * Target contract (NOT yet implemented), per
 * memory-bank/creative/TASK-001-express-api-architecture.md (Decision 2 / Observability
 * Architecture) and TASK-001 Test Strategy → Phase 2:
 *
 *   - Exports a base `logger` (pino wrapper) configured from `config`:
 *       level = config.logLevel, JSON output, base fields service/environment.
 *   - `logger.child({ traceId, spanId })` returns a request-scoped child logger whose
 *       emitted lines carry the bound traceId/spanId fields (pino child API).
 *   - Emits structured JSON to stdout with at least `level`, `time`, and `msg` (pino's
 *       message key). A single `.info('x')` call serializes to one valid JSON line.
 *   - Respects LOG_LEVEL: a message below the configured level is NOT emitted.
 *
 * ── Output-capture contract (authoritative for the Coding Agent) ───────────────────────
 * The logger module reads `config` at IMPORT time, and pino writes newline-delimited JSON
 * to its destination — by default `process.stdout`. These tests therefore:
 *   1. Set the relevant env vars (LOG_LEVEL / OTEL_SERVICE_NAME) BEFORE loading the module.
 *   2. Call `jest.resetModules()` and `require('./logger')` so the module re-reads `config`
 *      (which itself re-reads process.env at import time).
 *   3. Spy on `process.stdout.write` to capture serialized log lines, then parse them as JSON.
 *
 * The Coding Agent MUST honor this contract: the base logger writes structured JSON to
 * `process.stdout` by default. pino's exact `level` encoding (numeric 30 vs string "info")
 * is NOT over-constrained here — tests assert the field EXISTS and that level filtering
 * works, not its precise encoding.
 */

describe('observability/logger', () => {
  const ORIGINAL_ENV = process.env;

  // Config keys env.ts owns; cleared so the logger observes documented defaults
  // unless a test explicitly sets one.
  const MANAGED_KEYS = [
    'PORT',
    'NODE_ENV',
    'LOG_LEVEL',
    'LOG_FORMAT',
    'LOG_OUTPUT',
    'OTEL_SERVICE_NAME',
    'OTEL_EXPORTER_OTLP_ENDPOINT',
    'OTEL_TRACES_SAMPLER_ARG',
    'LOG_FILE_PATH',
    'DATABASE_URL',
  ];

  let stdoutSpy: jest.SpyInstance;
  let captured: string[];

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
    for (const key of MANAGED_KEYS) {
      delete process.env[key];
    }

    // Capture every line pino writes to stdout; swallow the actual write so test
    // output stays clean. Returns true to satisfy the Writable#write signature.
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
    process.env = ORIGINAL_ENV;
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  /** Load the logger module fresh so it re-reads `config` from the current env. */
  function loadLogger(): {
    logger: {
      info: (msg: string) => void;
      debug: (msg: string) => void;
      child: (bindings: Record<string, unknown>) => {
        info: (msg: string) => void;
      };
    };
  } {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('./logger');
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

  it('emits a single valid JSON line containing level, time, and msg', () => {
    // Arrange: default level (info) is sufficient for an info log.
    const { logger } = loadLogger();

    // Act
    logger.info('hello world');

    // Assert: exactly one structured JSON line with the required pino fields.
    const lines = parsedLines();
    expect(lines).toHaveLength(1);
    const entry = lines[0]!;
    expect(entry).toHaveProperty('level'); // encoding (30 vs "info") intentionally unconstrained
    expect(entry).toHaveProperty('time');
    expect(entry.msg).toBe('hello world');
  });

  it('binds traceId and spanId from a child logger into the output', () => {
    // Arrange
    const { logger } = loadLogger();
    const traceId = '0af7651916cd43dd8448eb211c80319c';
    const spanId = 'b7ad6b7169203331';

    // Act: request-scoped child logger carries the bound trace context.
    const requestLogger = logger.child({ traceId, spanId });
    requestLogger.info('handled request');

    // Assert: the bound fields appear on the emitted line alongside the message.
    const lines = parsedLines();
    expect(lines).toHaveLength(1);
    const entry = lines[0]!;
    expect(entry.traceId).toBe(traceId);
    expect(entry.spanId).toBe(spanId);
    expect(entry.msg).toBe('handled request');
  });

  it('respects LOG_LEVEL — a debug line is suppressed when level is info', () => {
    // Arrange: explicitly set level to info BEFORE loading the module.
    process.env.LOG_LEVEL = 'info';
    const { logger } = loadLogger();

    // Act: a debug message is below the configured threshold.
    logger.debug('this should not be emitted');

    // Assert: nothing was written for the suppressed debug call.
    expect(parsedLines()).toHaveLength(0);

    // And a control: an info message at the same level IS emitted.
    logger.info('this should be emitted');
    expect(parsedLines()).toHaveLength(1);
  });
});
