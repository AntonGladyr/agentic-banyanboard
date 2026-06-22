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
  serviceVersion: '0.0.0',
  otelTracesSamplerArg: '1.0',
  // SPA static serving is OFF by default so dev (Vite serves the SPA), tests, and supertest are
  // unaffected; only prod opts in via SERVE_CLIENT=true (TASK-006 Phase 5 / Architecture Q1c).
  serveClient: false,
  clientDistPath: 'client/dist',
  // Real-time SSE tier (TASK-007 Phase 5 / Architecture Decision 5). On by default; the master
  // switch lets dev/test opt out (events route → 404, broadcast hooks no-op). Keep-alive frames
  // defeat idle-proxy timeouts on the long-lived stream.
  realtimeEnabled: true,
  realtimeKeepaliveMs: 15000,
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
  /** Service version surfaced as the logger `version` field (npm_package_version). */
  readonly serviceVersion: string;
  /** Collector endpoint (OTEL_EXPORTER_OTLP_ENDPOINT) — stub, no exporter built this task. */
  readonly otelExporterOtlpEndpoint: string | undefined;
  /** Trace sampling ratio reserved for future SDK wiring (OTEL_TRACES_SAMPLER_ARG). */
  readonly otelTracesSamplerArg: string;
  /** PostgreSQL DSN (DATABASE_URL) — stub, configurable but NOT connected this task. */
  readonly databaseUrl: string | undefined;
  /**
   * Enable Express static serving of the built SPA + SPA history fallback (SERVE_CLIENT).
   * `false` in dev/test (Vite serves the SPA); `true` in the single-origin prod image.
   */
  readonly serveClient: boolean;
  /** Filesystem path to the built SPA assets served when {@link serveClient} is true (CLIENT_DIST_PATH). */
  readonly clientDistPath: string;
  /**
   * Master switch for the real-time SSE tier (REALTIME_ENABLED). When false, the events route returns
   * 404 and mutation broadcasts are skipped (graceful no-op). `true` in dev/prod by default.
   */
  readonly realtimeEnabled: boolean;
  /** Interval (ms) between SSE keep-alive comment frames that defeat idle-proxy timeouts (REALTIME_KEEPALIVE_MS). */
  readonly realtimeKeepaliveMs: number;
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
 * Coerce a positive-integer env value (e.g. a millisecond interval), failing fast on invalid input
 * (consistent with {@link parsePort} but without the 65535 port ceiling). Accepts only canonical
 * positive-integer strings. Unset falls back to the provided default.
 */
function parsePositiveInt(raw: string | undefined, fallback: number, name: string): number {
  if (raw === undefined) {
    return fallback;
  }

  const trimmed = raw.trim();
  if (!/^[0-9]+$/.test(trimmed)) {
    throw new Error(`Invalid ${name}: expected a positive integer, received "${raw}".`);
  }

  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${name}: expected a positive integer, received "${raw}".`);
  }

  return parsed;
}

/**
 * Coerce a boolean-like env value, failing fast on unrecognized input (consistent with
 * {@link parsePort}). Recognized true tokens: `true`/`1`; false tokens: `false`/`0` (all
 * case-insensitive). Unset falls back to the provided default.
 */
function parseBool(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined) {
    return fallback;
  }

  const normalized = raw.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1') {
    return true;
  }
  if (normalized === 'false' || normalized === '0') {
    return false;
  }

  throw new Error(
    `Invalid boolean env value: expected one of true/false/1/0, received "${raw}".`,
  );
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
    serviceVersion: readEnv('npm_package_version') ?? DEFAULTS.serviceVersion,
    otelExporterOtlpEndpoint: readEnv('OTEL_EXPORTER_OTLP_ENDPOINT'),
    otelTracesSamplerArg:
      readEnv('OTEL_TRACES_SAMPLER_ARG') ?? DEFAULTS.otelTracesSamplerArg,
    databaseUrl: readEnv('DATABASE_URL'),
    serveClient: parseBool(readEnv('SERVE_CLIENT'), DEFAULTS.serveClient),
    clientDistPath: readEnv('CLIENT_DIST_PATH') ?? DEFAULTS.clientDistPath,
    realtimeEnabled: parseBool(readEnv('REALTIME_ENABLED'), DEFAULTS.realtimeEnabled),
    realtimeKeepaliveMs: parsePositiveInt(
      readEnv('REALTIME_KEEPALIVE_MS'),
      DEFAULTS.realtimeKeepaliveMs,
      'REALTIME_KEEPALIVE_MS',
    ),
  };
}

/**
 * The validated, frozen application configuration.
 * Evaluated at import time so invalid env fails fast before the server starts.
 */
export const config: AppConfig = Object.freeze(loadConfig());
