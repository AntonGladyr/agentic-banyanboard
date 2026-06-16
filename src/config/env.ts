/**
 * src/config/env.ts — the single, typed, validated configuration source.
 *
 * This is the ONLY module in the codebase permitted to read `process.env`.
 * Everything downstream depends on the validated, frozen `config` object exported here.
 *
 * Parsing/validation runs at module-evaluation time (module top-level) so that
 * invalid configuration fails fast at startup (12-Factor + AC-VERIFY-2). The unit
 * tests rely on this by mutating `process.env` and re-requiring the module via
 * `jest.resetModules()`.
 *
 * Defaults mirror the "Configuration Variables" table in
 * memory-bank/creative/TASK-001-express-api-architecture.md.
 */

/** Default values applied when the corresponding env var is unset. */
const DEFAULTS = {
  port: 3000,
  nodeEnv: 'development',
  logLevel: 'info',
  logFormat: 'json',
  logOutput: 'stdout',
  otelServiceName: 'banyanboard-api',
  otelTracesSamplerArg: '1.0',
} as const;

/** Shape of the validated application configuration. */
export interface AppConfig {
  /** HTTP listen port (PORT). */
  readonly port: number;
  /** Deployment environment (NODE_ENV). */
  readonly nodeEnv: string;
  /** Log verbosity (LOG_LEVEL). */
  readonly logLevel: string;
  /** Log output format: json | text (LOG_FORMAT). */
  readonly logFormat: string;
  /** Log destination: stdout | file | both (LOG_OUTPUT). */
  readonly logOutput: string;
  /** File sink path — present only when LOG_OUTPUT includes file (LOG_FILE_PATH). */
  readonly logFilePath: string | undefined;
  /** Service identifier surfaced as the logger `service` field (OTEL_SERVICE_NAME). */
  readonly otelServiceName: string;
  /** Collector endpoint (OTEL_EXPORTER_OTLP_ENDPOINT) — stub, no exporter built this task. */
  readonly otelExporterOtlpEndpoint: string | undefined;
  /** Trace sampling ratio reserved for future SDK wiring (OTEL_TRACES_SAMPLER_ARG). */
  readonly otelTracesSamplerArg: string;
  /** PostgreSQL DSN (DATABASE_URL) — stub, configurable but NOT connected this task. */
  readonly databaseUrl: string | undefined;
}

/**
 * Read a raw env var. Under `noUncheckedIndexedAccess`, `process.env[key]` is
 * typed `string | undefined`, which forces explicit defaulting/validation.
 */
function readEnv(key: string): string | undefined {
  const value = process.env[key];
  // Treat an explicitly empty string as "unset" so blank vars fall back to defaults.
  return value === undefined || value === '' ? undefined : value;
}

/**
 * Coerce a PORT-like env value to a positive integer, failing fast on invalid input.
 * Accepts only canonical positive-integer strings (no decimals, signs, or trailing junk).
 */
function parsePort(raw: string | undefined, fallback: number): number {
  if (raw === undefined) {
    return fallback;
  }

  const trimmed = raw.trim();
  // Strict positive-integer match — rejects '', 'not-a-number', '12.5', '-1', '0x10', '80abc'.
  if (!/^[0-9]+$/.test(trimmed)) {
    throw new Error(
      `Invalid PORT: expected a positive integer, received "${raw}".`,
    );
  }

  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
    throw new Error(
      `Invalid PORT: expected an integer in the range 1-65535, received "${raw}".`,
    );
  }

  return parsed;
}

/**
 * Build and validate the configuration from the current `process.env`.
 * Throws synchronously on invalid values (fail-fast at startup).
 */
function loadConfig(): AppConfig {
  return {
    port: parsePort(readEnv('PORT'), DEFAULTS.port),
    nodeEnv: readEnv('NODE_ENV') ?? DEFAULTS.nodeEnv,
    logLevel: readEnv('LOG_LEVEL') ?? DEFAULTS.logLevel,
    logFormat: readEnv('LOG_FORMAT') ?? DEFAULTS.logFormat,
    logOutput: readEnv('LOG_OUTPUT') ?? DEFAULTS.logOutput,
    logFilePath: readEnv('LOG_FILE_PATH'),
    otelServiceName: readEnv('OTEL_SERVICE_NAME') ?? DEFAULTS.otelServiceName,
    otelExporterOtlpEndpoint: readEnv('OTEL_EXPORTER_OTLP_ENDPOINT'),
    otelTracesSamplerArg:
      readEnv('OTEL_TRACES_SAMPLER_ARG') ?? DEFAULTS.otelTracesSamplerArg,
    databaseUrl: readEnv('DATABASE_URL'),
  };
}

/**
 * The validated, frozen application configuration.
 * Evaluated at import time so invalid env fails fast before the server starts.
 */
export const config: AppConfig = Object.freeze(loadConfig());
