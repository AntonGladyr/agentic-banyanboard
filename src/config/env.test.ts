/**
 * Unit tests for src/config/env.ts (Phase 1 — Project scaffolding & config foundation).
 *
 * Target contract (not yet implemented):
 *   `src/config/env.ts` reads & validates environment variables at import time and
 *   exports a typed, frozen `config` object:
 *     - port: number                       (PORT,                         default 3000)
 *     - nodeEnv: string                    (NODE_ENV,                     default 'development')
 *     - logLevel: string                   (LOG_LEVEL,                    default 'info')
 *     - logFormat: string                  (LOG_FORMAT,                   default 'json')
 *     - logOutput: string                  (LOG_OUTPUT,                   default 'stdout')
 *     - otelServiceName: string            (OTEL_SERVICE_NAME,            default 'banyanboard-api')
 *     - databaseUrl: string | undefined    (DATABASE_URL,                 no default — stub)
 *     - otelExporterOtlpEndpoint: string | undefined
 *                                          (OTEL_EXPORTER_OTLP_ENDPOINT,  no default)
 *
 * Because the module parses `process.env` at import/evaluation time, each test mutates
 * `process.env` and re-requires the module fresh (via `jest.resetModules()` + `loadConfig()`)
 * so module-level parsing re-runs against the test's environment.
 *
 * Covers AC-VERIFY-2 (all configuration sourced from environment variables; fail-fast on
 * invalid values).
 */

describe('config/env', () => {
  const ORIGINAL_ENV = process.env;

  // Env keys this module owns; cleared before each test so defaults can be asserted
  // independent of the ambient shell/CI environment.
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

  beforeEach(() => {
    jest.resetModules();
    // Start each test from a clean copy and remove managed keys so the module
    // observes "unset" unless a test explicitly sets them.
    process.env = { ...ORIGINAL_ENV };
    for (const key of MANAGED_KEYS) {
      delete process.env[key];
    }
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  // Re-require after mutating process.env so module-level parsing re-runs.
  function loadConfig(): {
    port: number;
    nodeEnv: string;
    logLevel: string;
    logFormat: string;
    logOutput: string;
    otelServiceName: string;
    databaseUrl: string | undefined;
    otelExporterOtlpEndpoint: string | undefined;
  } {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('./env').config;
  }

  it('applies documented defaults when env vars are unset', () => {
    // Arrange: managed keys already deleted in beforeEach.
    // Act
    const config = loadConfig();

    // Assert: defaults from the creative doc "Configuration Variables" table.
    expect(config.port).toBe(3000);
    expect(typeof config.port).toBe('number');
    expect(config.nodeEnv).toBe('development');
    expect(config.logFormat).toBe('json');
    expect(config.logOutput).toBe('stdout');
    expect(config.otelServiceName).toBe('banyanboard-api');
  });

  it('lets environment overrides win and coerces PORT to a number', () => {
    // Arrange
    process.env.PORT = '4000';
    process.env.LOG_LEVEL = 'debug';
    process.env.OTEL_SERVICE_NAME = 'custom-svc';

    // Act
    const config = loadConfig();

    // Assert: values come from process.env, and PORT is a real number (not the string '4000').
    expect(config.port).toBe(4000);
    expect(typeof config.port).toBe('number');
    expect(config.logLevel).toBe('debug');
    expect(config.otelServiceName).toBe('custom-svc');
  });

  it('fails fast when PORT is not a valid number', () => {
    // Arrange
    process.env.PORT = 'not-a-number';

    // Act + Assert: invalid config must throw at module evaluation (AC-VERIFY-2 / fail-fast).
    expect(() => loadConfig()).toThrow();
  });

  it('treats DATABASE_URL as an optional pass-through stub', () => {
    // Arrange: unset (deleted in beforeEach)
    // Act
    const unsetConfig = loadConfig();
    // Assert: no default for the stub.
    expect(unsetConfig.databaseUrl).toBeUndefined();

    // Arrange: set to an explicit value, fresh module evaluation.
    jest.resetModules();
    process.env.DATABASE_URL = 'postgres://user:pass@localhost:5432/banyanboard';

    // Act
    const setConfig = loadConfig();
    // Assert: passed through unchanged.
    expect(setConfig.databaseUrl).toBe('postgres://user:pass@localhost:5432/banyanboard');
  });
});
